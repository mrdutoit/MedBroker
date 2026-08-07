/**
 * services/tokenService.js — NEW, §117 (4 Aug 2026).
 * TokenLedger/TokenTransaction — the token economy backing
 * appointments.claimModel = 'claim'. Was schema-only ("Phase 2 stub",
 * schema.postgres.sql Section 14) until this entry; see
 * models/appointment.js's header for the staging this continues from.
 *
 * MONTHLY FREE ALLOCATION, NO CRON: TokenLedger.freeRemaining is meant to
 * reset every calendar month (to SystemConfig.brokerFreeAppointmentsPerMonth).
 * This Vercel stack has no scheduled-job infrastructure (same gap that's
 * kept Notifications' own scheduled pieces on hold — see Status_Vercel.md
 * §0) — so instead of a cron job, the reset is LAZY: every read of a
 * broker's ledger (getCurrentTokenLedger, below) checks whether
 * periodStart is before the current calendar month and, if so, resets
 * freeRemaining and periodStart right then, before returning. A broker who
 * never touches the token economy in a given month just never gets reset
 * that month — harmless, since nothing reads a ledger nobody's using
 * either. This is the same "self-heals on next access, no background job
 * needed" shape as the KMS/demo1 encryption format-detection-on-read
 * pattern already uses (encryption.js) — a recurring, deliberate design
 * language in this codebase for exactly the "no scheduler available"
 * constraint.
 *
 * RACE SAFETY, NO MULTI-STATEMENT TRANSACTIONS: db.js's executeQuery has
 * no BEGIN/COMMIT wrapper (confirmed by reading it, not assumed) — every
 * call is a single statement against the pool. debitTokens() below is
 * therefore written as ONE atomic, guarded UPDATE (WHERE freeRemaining >=
 * @freeUsed AND balance >= @balanceUsed) rather than read-then-write —
 * if a concurrent claim already spent the tokens between the balance
 * check in claimAppointment() (appointmentService.js) and this UPDATE,
 * the guard simply fails to match a row and this throws, rather than
 * silently allowing a broker's balance to go negative.
 */

import { executeQuery, executeQueryOne, sql } from './db.js';
import { getSystemConfig } from './systemConfigService.js';
import { resolveOrganisationId } from '../context/tenant.js';

function firstOfCurrentMonthISO() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

// Same UTC-getter approach appointmentService.js's shortDateLabel() already
// uses, for the same reason: periodStart comes back from node-postgres as a
// JS Date object with no custom type parser, and a raw .toString()/.slice()
// on that (rather than a YYYY-MM-DD string) would silently produce garbage
// — the exact landmine that pattern already exists specifically to avoid.
function monthKey(dateValue) {
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Fetch a broker's TokenLedger, creating it on first touch (no
 * provisioning step needed when a Broker user is created — User creation
 * stays entirely ignorant of the token economy) and lazily applying the
 * monthly free-allocation reset described above.
 * @param {string} brokerId
 * @returns {Promise<{ id: string, balance: number, freeRemaining: number, periodStart: Date }>}
 */
export async function getCurrentTokenLedger(brokerId) {
  const organisationId = resolveOrganisationId();
  const { brokerFreeAppointmentsPerMonth } = await getSystemConfig();
  const firstOfMonth = firstOfCurrentMonthISO();

  let ledger = await executeQueryOne(
    `SELECT id, balance, freeRemaining AS "freeRemaining", periodStart AS "periodStart"
     FROM TokenLedger WHERE brokerId = @brokerId AND organisationId = @organisationId`,
    {
      brokerId:       { type: sql.UniqueIdentifier, value: brokerId },
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
    }
  );

  if (!ledger) {
    const newId = crypto.randomUUID();
    await executeQuery(
      `INSERT INTO TokenLedger (id, organisationId, brokerId, balance, freeRemaining, periodStart, updatedAt)
       VALUES (@id, @organisationId, @brokerId, 0, @freeRemaining, @periodStart, NOW())
       ON CONFLICT (brokerId) DO NOTHING`, // a concurrent first-touch from another request is harmless — whichever insert wins, the SELECT below reads the true row
      {
        id:             { type: sql.UniqueIdentifier, value: newId },
        organisationId: { type: sql.UniqueIdentifier, value: organisationId },
        brokerId:       { type: sql.UniqueIdentifier, value: brokerId },
        freeRemaining:  { type: sql.Int,  value: brokerFreeAppointmentsPerMonth },
        periodStart:    { type: sql.Date, value: firstOfMonth },
      }
    );
    ledger = await executeQueryOne(
      `SELECT id, balance, freeRemaining AS "freeRemaining", periodStart AS "periodStart"
       FROM TokenLedger WHERE brokerId = @brokerId AND organisationId = @organisationId`,
      {
        brokerId:       { type: sql.UniqueIdentifier, value: brokerId },
        organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      }
    );
    return ledger;
  }

  if (monthKey(ledger.periodStart) < monthKey(firstOfMonth)) {
    await executeQuery(
      `UPDATE TokenLedger SET freeRemaining = @freeRemaining, periodStart = @periodStart, updatedAt = NOW()
       WHERE id = @id`,
      {
        id:            { type: sql.UniqueIdentifier, value: ledger.id },
        freeRemaining: { type: sql.Int,  value: brokerFreeAppointmentsPerMonth },
        periodStart:   { type: sql.Date, value: firstOfMonth },
      }
    );
    ledger = { ...ledger, freeRemaining: brokerFreeAppointmentsPerMonth, periodStart: firstOfMonth };
  }

  return ledger;
}

/**
 * Debit `cost` tokens for a claim, drawing from freeRemaining first and
 * only spilling into the paid balance for whatever the free allocation
 * doesn't cover — e.g. freeRemaining=3, balance=10, cost=4 debits 3 free +
 * 1 paid in the same atomic UPDATE, not "cost entirely from balance"
 * (which would have been wrong the moment a claim's cost exceeded
 * whatever free tokens happened to be left, however small the shortfall).
 * Throws 400 if the broker doesn't have enough tokens in total; throws 409
 * if a concurrent debit won the race between the balance check and this
 * UPDATE (rare, but a real possibility with no multi-statement transaction
 * available — see this file's header).
 * @param {string} brokerId
 * @param {string} appointmentId
 * @param {number} cost
 */
export async function debitTokensForClaim(brokerId, appointmentId, cost) {
  const organisationId = resolveOrganisationId();
  const ledger = await getCurrentTokenLedger(brokerId);
  const total = ledger.freeRemaining + ledger.balance;

  if (total < cost) {
    const short = cost - total;
    throw { status: 400, message: `Insufficient tokens — you need ${short} more token${short === 1 ? '' : 's'} to claim this appointment` };
  }

  const freeUsed = Math.min(ledger.freeRemaining, cost);
  const balanceUsed = cost - freeUsed;

  const result = await executeQueryOne(
    `UPDATE TokenLedger
     SET freeRemaining = freeRemaining - @freeUsed, balance = balance - @balanceUsed, updatedAt = NOW()
     WHERE brokerId = @brokerId AND organisationId = @organisationId
       AND freeRemaining >= @freeUsed AND balance >= @balanceUsed
     RETURNING id`,
    {
      brokerId:       { type: sql.UniqueIdentifier, value: brokerId },
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      freeUsed:       { type: sql.Int, value: freeUsed },
      balanceUsed:    { type: sql.Int, value: balanceUsed },
    }
  );
  if (!result) {
    throw { status: 409, message: 'Your token balance changed — please try claiming again' };
  }

  await executeQuery(
    `INSERT INTO TokenTransaction (id, organisationId, brokerId, type, amount, appointmentId, description, createdAt)
     VALUES (@id, @organisationId, @brokerId, 'Debit', @amount, @appointmentId, @description, NOW())`,
    {
      id:             { type: sql.UniqueIdentifier, value: crypto.randomUUID() },
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      brokerId:       { type: sql.UniqueIdentifier, value: brokerId },
      amount:         { type: sql.Int, value: cost },
      appointmentId:  { type: sql.UniqueIdentifier, value: appointmentId },
      description:    { type: sql.NVarChar(300), value: `Claimed appointment (${freeUsed} free + ${balanceUsed} paid)` },
    }
  );
}

/**
 * Refunds `cost` tokens — used when an appointment claim's token debit
 * succeeded but the appointment itself turned out to already be claimed
 * by someone else (lost the race on the guarded UPDATE in
 * appointmentService.claimAppointment(), which runs AFTER the debit — see
 * that function's own comment for why that ordering was chosen). Refund
 * always lands in the paid `balance` bucket, never back into
 * freeRemaining — simplest correct behaviour, and this call site only has
 * the total cost, not the original free/paid split.
 * @param {string} brokerId
 * @param {string} appointmentId
 * @param {number} cost
 */
export async function refundTokens(brokerId, appointmentId, cost) {
  const organisationId = resolveOrganisationId();
  await executeQuery(
    `UPDATE TokenLedger SET balance = balance + @cost, updatedAt = NOW()
     WHERE brokerId = @brokerId AND organisationId = @organisationId`,
    {
      brokerId:       { type: sql.UniqueIdentifier, value: brokerId },
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      cost:           { type: sql.Int, value: cost },
    }
  );
  await executeQuery(
    `INSERT INTO TokenTransaction (id, organisationId, brokerId, type, amount, appointmentId, description, createdAt)
     VALUES (@id, @organisationId, @brokerId, 'Credit', @amount, @appointmentId, @description, NOW())`,
    {
      id:             { type: sql.UniqueIdentifier, value: crypto.randomUUID() },
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      brokerId:       { type: sql.UniqueIdentifier, value: brokerId },
      amount:         { type: sql.Int, value: cost },
      appointmentId:  { type: sql.UniqueIdentifier, value: appointmentId },
      description:    { type: sql.NVarChar(300), value: 'Refund — appointment claimed by another broker first' },
    }
  );
}

/**
 * Admin/GlobalAdmin manual top-up — the ENTIRE 'none' payment-provider
 * path (per the flag's own description: "manual top-up by admin only"),
 * not a stopgap standing in for Stripe. Always credits the paid `balance`
 * bucket, never freeRemaining — a manual top-up is explicitly paid tokens
 * an admin is granting, distinct from the automatic monthly free
 * allocation.
 * @param {string} brokerId
 * @param {number} amount
 * @param {string} performedById
 */
export async function manualTopUp(brokerId, amount, performedById) {
  await getCurrentTokenLedger(brokerId); // ensures the row exists (and is current-month) before crediting it
  const organisationId = resolveOrganisationId();

  await executeQuery(
    `UPDATE TokenLedger SET balance = balance + @amount, updatedAt = NOW()
     WHERE brokerId = @brokerId AND organisationId = @organisationId`,
    {
      brokerId:       { type: sql.UniqueIdentifier, value: brokerId },
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      amount:         { type: sql.Int, value: amount },
    }
  );
  await executeQuery(
    `INSERT INTO TokenTransaction (id, organisationId, brokerId, type, amount, appointmentId, description, createdAt)
     VALUES (@id, @organisationId, @brokerId, 'Credit', @amount, NULL, @description, NOW())`,
    {
      id:             { type: sql.UniqueIdentifier, value: crypto.randomUUID() },
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      brokerId:       { type: sql.UniqueIdentifier, value: brokerId },
      amount:         { type: sql.Int, value: amount },
      description:    { type: sql.NVarChar(300), value: `Manual top-up by admin (${performedById})` },
    }
  );
}

/**
 * Credits `tokens` to a broker's paid balance for a completed payment —
 * §134, GENERALIZED §135 (7 Aug 2026) from creditStripeTokens() when
 * Paystack was added as a second provider, since this function's own
 * idempotency logic is entirely provider-agnostic: it never inspects
 * `externalRef` beyond using it as an opaque uniqueness key, so a Stripe
 * session id and a Paystack transaction reference are handled identically.
 * Both webhook handlers (Stripe and Paystack, appointmentHandlers.js)
 * call this same function rather than each having their own near-
 * duplicate copy of the idempotent-credit logic — duplicating
 * money-crediting code across two providers is exactly the kind of
 * thing worth refactoring away rather than copy-pasting, given how much
 * this function's correctness actually matters.
 *
 * IDEMPOTENT AT THE DATABASE LEVEL: both Stripe and Paystack document
 * at-least-once webhook delivery, meaning the same "payment completed"
 * event can genuinely arrive more than once. This function relies on
 * TokenTransaction's partial UNIQUE index on externalRef (WHERE
 * externalRef IS NOT NULL, schema §14b) rather than a read-then-write
 * existence check — a check-then-act here would have exactly the same
 * race window debitTokensForClaim()'s own header warns about (two
 * near-simultaneous webhook deliveries both passing an "already
 * processed?" SELECT before either has inserted anything). The INSERT
 * itself is the atomic guard: whichever delivery's INSERT lands first
 * wins and credits the ledger; every other delivery for the same
 * externalRef hits the unique index, catches the resulting 23505
 * (unique_violation) error code, and returns cleanly with
 * credited: false — not an error condition from the webhook's
 * perspective, since the correct outcome (broker has their tokens) is
 * already true.
 * @param {string} brokerId
 * @param {number} tokens
 * @param {string} externalRef - Stripe Checkout Session id, or a
 *   Paystack transaction reference — either way, the idempotency key
 * @param {string} description
 * @returns {Promise<{ credited: boolean, alreadyProcessed?: boolean }>}
 */
export async function creditPurchasedTokens(brokerId, tokens, externalRef, description) {
  const organisationId = resolveOrganisationId();
  await getCurrentTokenLedger(brokerId); // ensures the row exists (and is current-month) before crediting it

  try {
    await executeQuery(
      `INSERT INTO TokenTransaction (id, organisationId, brokerId, type, amount, appointmentId, description, externalRef, createdAt)
       VALUES (@id, @organisationId, @brokerId, 'Credit', @amount, NULL, @description, @externalRef, NOW())`,
      {
        id:             { type: sql.UniqueIdentifier, value: crypto.randomUUID() },
        organisationId: { type: sql.UniqueIdentifier, value: organisationId },
        brokerId:       { type: sql.UniqueIdentifier, value: brokerId },
        amount:         { type: sql.Int, value: tokens },
        description:    { type: sql.NVarChar(300), value: description },
        externalRef:    { type: sql.NVarChar(255), value: externalRef },
      }
    );
  } catch (err) {
    if (err.code === '23505') {
      // Duplicate webhook delivery for a payment already credited — the
      // correct outcome (tokens already on the ledger) is already true,
      // so this is a clean no-op, not an error the caller should surface.
      return { credited: false, alreadyProcessed: true };
    }
    throw err;
  }

  // Only reached if the INSERT above actually landed — see this
  // function's header for why the balance UPDATE deliberately comes
  // AFTER the guarded insert, not before or in parallel with it.
  await executeQuery(
    `UPDATE TokenLedger SET balance = balance + @amount, updatedAt = NOW()
     WHERE brokerId = @brokerId AND organisationId = @organisationId`,
    {
      brokerId:       { type: sql.UniqueIdentifier, value: brokerId },
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      amount:         { type: sql.Int, value: tokens },
    }
  );

  return { credited: true };
}

/**
 * Recent transaction history for one broker — most recent first. Used by
 * both the broker's own token balance view and an Admin's per-broker
 * management view.
 * @param {string} brokerId
 * @param {number} [limit]
 */
export async function listTokenTransactions(brokerId, limit = 50) {
  const organisationId = resolveOrganisationId();
  return executeQuery(
    `SELECT id, type, amount, appointmentId AS "appointmentId", description, createdAt AS "createdAt"
     FROM TokenTransaction
     WHERE brokerId = @brokerId AND organisationId = @organisationId
     ORDER BY createdAt DESC
     LIMIT @limit`,
    {
      brokerId:       { type: sql.UniqueIdentifier, value: brokerId },
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      limit:          { type: sql.Int, value: limit },
    }
  );
}
