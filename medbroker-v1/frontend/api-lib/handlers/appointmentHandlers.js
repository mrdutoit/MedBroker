/**
 * api-lib/handlers/appointmentHandlers.js
 * Consolidated 22 July 2026 — see authHandlers.js header for why. Logic
 * unchanged from the six original files (index.js, [id]/index.js,
 * [id]/assign.js, [id]/reassign.js, [id]/return.js, [id]/outcome.js).
 */

import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import {
  listAppointments, createAppointment, getAppointmentById, assignBroker,
  reassignAppointment, returnToLeads, saveOutcome, claimAppointment, listAvailableToClaim,
} from '../services/appointmentService.js';
import { findMatchingBrokers } from '../services/brokerMatchingService.js';
import { getDirectReportIds, isSupervisorOnly, isAgentOnly, getUserDisplayNameById, getActiveUserById } from '../services/userService.js';
import { getLeadDisplayNameById } from '../services/leadService.js';
import { writeAuditLog, clientIp, listAuditLog } from '../services/auditService.js';
import { getCurrentTokenLedger, manualTopUp, listTokenTransactions, creditPurchasedTokens } from '../services/tokenService.js';
import { getSystemConfig } from '../services/systemConfigService.js';
import { getFlagMeta } from '../services/flagService.js';
import { createCheckoutSession, verifyWebhookSignature } from '../services/stripeService.js';
import { createTransaction as createPaystackTransaction, verifyWebhookSignature as verifyPaystackWebhookSignature, verifyTransaction as verifyPaystackTransaction } from '../services/paystackService.js';
import { TOKEN_PACKS } from '../services/tokenPacks.js';
import {
  CreateAppointmentSchema, AppointmentListQuerySchema, AssignBrokerSchema,
  ReassignAppointmentSchema, SaveOutcomeSchema, BrokerMatchingQuerySchema, TokenTopUpSchema,
} from '../models/appointment.js';
import { TokenCheckoutSchema } from '../models/integration.js';
import { isUuid } from '../http/helpers.js';

/**
 * True if appointments.claimModel is currently set to 'claim'. Checked at
 * the route layer for every §117 claim-model endpoint (claim, available-
 * to-claim) — same "flag genuinely gates behaviour, not just frontend
 * visibility" pattern auth.sso.enabled/security.kmsEncryption.enabled
 * already established. Deliberately NOT checked for the token-ledger/
 * top-up endpoints below — an Admin should still be able to view/top-up a
 * broker's balance even if the org has since switched back to 'assign'
 * (their existing balance doesn't just stop existing).
 */
async function isClaimModelEnabled() {
  const meta = await getFlagMeta('appointments.claimModel');
  return meta?.value === 'claim';
}

/** GET (list) + POST (create) /api/appointments */
/**
 * GET /api/appointments/broker-matching — Agent, Supervisor, Admin,
 * GlobalAdmin. Called from LeadDetail.jsx's Book Appointment modal to
 * populate the broker selection list before creating the appointment —
 * this route only finds candidates, it doesn't book anything itself.
 *
 * MOVED HERE 28 Jul 2026 (§62) — was its own standalone file at
 * api/broker-matching/index.js, which Vercel counts as a separate
 * serverless function regardless of what vercel.json's rewrites do. That
 * file plus Tasks (§56) and Notifications (§61) pushed the total to 13,
 * one over Hobby's 12-function ceiling — the actual cause of the failed
 * deployment Mark hit. Folded in here rather than into some other router,
 * since this is squarely appointment-domain logic; logic itself is
 * unchanged from the original file.
 */
export async function handleBrokerMatching(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin']);

    const parsed = BrokerMatchingQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = await findMatchingBrokers(parsed.data);
    return res.status(200).json(result);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/broker-matching error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function handleAppointmentsCollection(req, res) {
  try {
    const claims = await validateToken(req);

    if (req.method === 'GET') {
      requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin', 'Broker']);

      const parsed = AppointmentListQuerySchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const filters = { ...parsed.data };
      if (isAgentOnly(claims.roles)) {
        filters.agentId = claims.oid;
      } else if (claims.roles.includes('Broker') && !claims.roles.includes('Admin') && !claims.roles.includes('GlobalAdmin')) {
        filters.brokerId = claims.oid;
      } else if (isSupervisorOnly(claims.roles)) {
        filters.supervisorAgentIds = await getDirectReportIds(claims.oid);
      }

      const result = await listAppointments(filters);
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin']);

      const parsed = CreateAppointmentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const newId = await createAppointment(parsed.data);

      await writeAuditLog({
        entityType: 'Appointment',
        entityId: newId,
        action: 'AppointmentCreated',
        performedById: claims.oid,
        changeDetail: {
          leadId: parsed.data.leadId,
          leadName: await getLeadDisplayNameById(parsed.data.leadId),
          brokerId: parsed.data.brokerId ?? null,
          brokerName: parsed.data.brokerId ? await getUserDisplayNameById(parsed.data.brokerId) : null,
        },
        ipAddress: clientIp(req),
      });

      return res.status(201).json({ id: newId });
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/index error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/appointments/:id */
export async function handleAppointmentById(req, res, id) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin', 'Broker']);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid appointment ID format' });

    const appt = await getAppointmentById(id);
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    if (isAgentOnly(claims.roles) && appt.agentId !== claims.oid) {
      return res.status(403).json({ error: 'You did not book this appointment' });
    }
    if (claims.roles.includes('Broker') && !claims.roles.includes('Admin') && !claims.roles.includes('GlobalAdmin') && appt.brokerId !== claims.oid) {
      return res.status(403).json({ error: 'This appointment is not assigned to you' });
    }
    if (isSupervisorOnly(claims.roles)) {
      const directReports = await getDirectReportIds(claims.oid);
      if (!directReports.includes(appt.agentId) && appt.agentId !== claims.oid) {
        return res.status(403).json({ error: 'This appointment is outside your team' });
      }
    }

    return res.status(200).json(appt);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/[id] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** PUT /api/appointments/:id/assign */
export async function handleAppointmentAssign(req, res, id) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'Supervisor', 'GlobalAdmin']);

    // §140, 12 Aug 2026 — Mark's explicit decision: when claim model is
    // active, every unassigned appointment must go through the claim
    // queue, no direct-assign escape hatch for anyone, Supervisor/Admin
    // included. Same isClaimModelEnabled() this file already uses to gate
    // claim()/available-to-claim — this is the one place that flag was
    // NOT already checked despite the exact same "flag genuinely gates
    // behaviour, not just frontend visibility" principle this file's own
    // isClaimModelEnabled() comment states. AppointmentList.jsx already
    // hides this button when claim model is active, but that was
    // frontend-only — this endpoint was still callable directly.
    if (await isClaimModelEnabled()) {
      return res.status(403).json({ error: 'Claim model is active — appointments can only be resolved by a broker claiming them, not assigned directly' });
    }

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid appointment ID format' });

    const parsed = AssignBrokerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    await assignBroker(id, parsed.data.brokerId);

    await writeAuditLog({
      entityType: 'Appointment',
      entityId: id,
      action: 'AppointmentBrokerAssigned',
      performedById: claims.oid,
      changeDetail: {
        brokerId: parsed.data.brokerId,
        brokerName: await getUserDisplayNameById(parsed.data.brokerId),
      },
      ipAddress: clientIp(req),
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/[id]/assign error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** PUT /api/appointments/:id/reassign */
export async function handleAppointmentReassign(req, res, id) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'Supervisor', 'GlobalAdmin']);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid appointment ID format' });

    const existing = await getAppointmentById(id);
    if (!existing) return res.status(404).json({ error: 'Appointment not found' });

    const parsed = ReassignAppointmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    await reassignAppointment(id, parsed.data);

    await writeAuditLog({
      entityType: 'Appointment',
      entityId: id,
      action: 'AppointmentReassigned',
      performedById: claims.oid,
      changeDetail: {
        previousBrokerId: existing.brokerId,
        previousBrokerName: existing.brokerId ? await getUserDisplayNameById(existing.brokerId) : null,
        ...parsed.data,
        ...(parsed.data.brokerId ? { brokerName: await getUserDisplayNameById(parsed.data.brokerId) } : {}),
        ...(parsed.data.agentId ? { agentName: await getUserDisplayNameById(parsed.data.agentId) } : {}),
      },
      ipAddress: clientIp(req),
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/[id]/reassign error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** PUT /api/appointments/:id/return */
export async function handleAppointmentReturn(req, res, id) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'Supervisor', 'GlobalAdmin']);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid appointment ID format' });

    await returnToLeads(id);

    await writeAuditLog({
      entityType: 'Appointment',
      entityId: id,
      action: 'AppointmentReturnedToLeads',
      performedById: claims.oid,
      changeDetail: {},
      ipAddress: clientIp(req),
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/[id]/return error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/appointments/:id/audit */
export async function handleAppointmentAudit(req, res, id) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin', 'Broker']);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid appointment ID format' });

    const appt = await getAppointmentById(id);
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    if (isAgentOnly(claims.roles) && appt.agentId !== claims.oid) {
      return res.status(403).json({ error: 'You did not book this appointment' });
    }
    if (claims.roles.includes('Broker') && !claims.roles.includes('Admin') && !claims.roles.includes('GlobalAdmin') && appt.brokerId !== claims.oid) {
      return res.status(403).json({ error: 'This appointment is not assigned to you' });
    }
    if (isSupervisorOnly(claims.roles)) {
      const directReports = await getDirectReportIds(claims.oid);
      if (!directReports.includes(appt.agentId) && appt.agentId !== claims.oid) {
        return res.status(403).json({ error: 'This appointment is outside your team' });
      }
    }

    const entries = await listAuditLog('Appointment', id);
    return res.status(200).json({ entries });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/[id]/audit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** POST /api/appointments/:id/outcome */
export async function handleAppointmentOutcome(req, res, id) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin', 'Broker']);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid appointment ID format' });

    const existing = await getAppointmentById(id);
    if (!existing) return res.status(404).json({ error: 'Appointment not found' });

    const parsed = SaveOutcomeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = await saveOutcome(id, parsed.data);

    await writeAuditLog({
      entityType: 'Appointment',
      entityId: id,
      action: 'AppointmentOutcomeSaved',
      performedById: claims.oid,
      changeDetail: {
        customerSigned: parsed.data.customerSigned ?? null,
        newStatus: result.status,
        meetings: parsed.data.meetings ?? null,
      },
      ipAddress: clientIp(req),
    });

    return res.status(200).json(result);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/[id]/outcome error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PUT /api/appointments/:id/claim — §117. Broker ONLY — this is the
 * self-service action the claim model exists for, deliberately not
 * extended to Admin/Supervisor/GlobalAdmin (those roles have
 * assign/reassign for exactly this reason — claiming on someone else's
 * behalf isn't what "claim" means here).
 */
export async function handleAppointmentClaim(req, res, id) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Broker']);

    if (!(await isClaimModelEnabled())) {
      return res.status(403).json({ error: 'Appointment claiming is not enabled for this deployment' });
    }
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid appointment ID format' });

    await claimAppointment(id, claims.oid);

    await writeAuditLog({
      entityType: 'Appointment',
      entityId: id,
      action: 'AppointmentClaimed',
      performedById: claims.oid,
      changeDetail: {},
      ipAddress: clientIp(req),
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/[id]/claim error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/appointments/available-to-claim — §117. Broker only. */
export async function handleAvailableToClaim(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Broker']);

    if (!(await isClaimModelEnabled())) {
      return res.status(403).json({ error: 'Appointment claiming is not enabled for this deployment' });
    }

    const appointments = await listAvailableToClaim(claims.oid);
    return res.status(200).json({ appointments });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/available-to-claim error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/appointments/tokens/me — §117. Broker's own current balance +
 * recent transaction history. Not gated on isClaimModelEnabled() —
 * deliberately (see this file's top comment): a broker's existing balance
 * doesn't stop existing just because the org switched back to 'assign'.
 */
export async function handleTokenLedgerMe(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Broker']);

    const ledger = await getCurrentTokenLedger(claims.oid);
    const transactions = await listTokenTransactions(claims.oid);
    const { brokerFreeAppointmentsPerMonth } = await getSystemConfig();
    return res.status(200).json({ ledger, transactions, monthlyAllocation: brokerFreeAppointmentsPerMonth });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/tokens/me error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/appointments/tokens/:brokerId — §117. Admin/GlobalAdmin only —
 * same scope as the top-up action below, deliberately not extended to
 * Supervisor (Broker isn't part of the Agent->Supervisor hierarchy
 * getDirectReportIds() resolves, so there's no natural "which brokers is
 * this Supervisor allowed to see" rule to apply here anyway).
 */
export async function handleTokenLedgerByBroker(req, res, brokerId) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    if (!isUuid(brokerId)) return res.status(400).json({ error: 'Invalid broker ID format' });
    const broker = await getActiveUserById(brokerId);
    if (!broker || broker.role !== 'Broker') return res.status(404).json({ error: 'Broker not found' });

    const ledger = await getCurrentTokenLedger(brokerId);
    const transactions = await listTokenTransactions(brokerId);
    const { brokerFreeAppointmentsPerMonth } = await getSystemConfig();
    return res.status(200).json({ ledger, transactions, monthlyAllocation: brokerFreeAppointmentsPerMonth, brokerName: broker.displayName });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/tokens/[brokerId] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PUT /api/appointments/tokens/:brokerId/topup — §117. Admin/GlobalAdmin
 * only. The ENTIRE appointments.tokens.paymentProvider = 'none' path —
 * see tokenService.manualTopUp()'s own header for why this isn't a
 * stopgap standing in for Stripe.
 */
export async function handleTokenTopUp(req, res, brokerId) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    if (!isUuid(brokerId)) return res.status(400).json({ error: 'Invalid broker ID format' });
    const broker = await getActiveUserById(brokerId);
    if (!broker || broker.role !== 'Broker') return res.status(404).json({ error: 'Broker not found' });

    const parsed = TokenTopUpSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    await manualTopUp(brokerId, parsed.data.amount, claims.oid);

    await writeAuditLog({
      entityType: 'TokenLedger',
      entityId: brokerId,
      action: 'TokenManualTopUp',
      performedById: claims.oid,
      changeDetail: { brokerId, brokerName: broker.displayName, amount: parsed.data.amount },
      ipAddress: clientIp(req),
    });

    const ledger = await getCurrentTokenLedger(brokerId);
    const { brokerFreeAppointmentsPerMonth } = await getSystemConfig();
    return res.status(200).json({ ledger, monthlyAllocation: brokerFreeAppointmentsPerMonth });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/tokens/[brokerId]/topup error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/appointments/tokens/checkout — §134, EXTENDED §135 (7 Aug
 * 2026) for Paystack. Broker ONLY, same "self-service action, not
 * something done on someone's behalf" reasoning as handleAppointmentClaim
 * above. Gated on appointments.tokens.paymentProvider being 'stripe' or
 * 'paystack' (not 'none') — not on claimModel, matching the
 * isClaimModelEnabled() comment at the top of this file (tokens can be
 * topped up regardless of which model is currently active). ONE
 * endpoint regardless of which provider is active — the frontend
 * (BuyTokensModal, AppointmentList.jsx) doesn't need to know or care
 * which; it just gets back a URL to redirect the browser tab to either
 * way. This route never touches card details, only creates the
 * checkout/transaction server-side.
 */
export async function handleTokenCheckout(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Broker']);

    const providerMeta = await getFlagMeta('appointments.tokens.paymentProvider');
    const provider = providerMeta?.value;
    if (provider !== 'stripe' && provider !== 'paystack') {
      return res.status(403).json({ error: 'Token purchases are not enabled for this deployment' });
    }

    const parsed = TokenCheckoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const url = provider === 'stripe'
      ? await createCheckoutSession({ brokerId: claims.oid, packIndex: parsed.data.packIndex })
      : await createPaystackTransaction({ brokerId: claims.oid, packIndex: parsed.data.packIndex });
    return res.status(200).json({ url });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/tokens/checkout error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/appointments/tokens/webhook — §134. Stripe calls this
 * directly — DELIBERATELY NO validateToken()/requireRole() here, unlike
 * every other route in this file. Stripe has no MedBroker session cookie
 * to send; the Stripe-Signature header (verified against the DB-stored
 * webhook signing secret, stripeService.verifyWebhookSignature) is the
 * entire authentication boundary for this endpoint — see that function's
 * own header for why a forged POST here can't credit tokens without it.
 *
 * `rawBody` is a Buffer, not req.body — passed in by appointments-router.js,
 * which reads the raw stream itself before this function ever sees the
 * request (see that file's header for the file-wide bodyParser: false
 * this depends on).
 *
 * Responds 200 to every event type Stripe sends, not just
 * checkout.session.completed — Stripe expects any 2xx to mean "received,
 * don't retry"; returning an error for an event type this app simply
 * doesn't act on would cause Stripe to retry it forever for no reason.
 * A genuine failure (bad signature, a real DB error crediting tokens)
 * still returns non-2xx, which IS the correct behaviour — that tells
 * Stripe to retry with backoff, and creditPurchasedTokens() is idempotent
 * (TokenTransaction.externalRef unique index) specifically so a retried
 * delivery is always safe.
 *
 * SEPARATE ROUTE FROM PAYSTACK'S WEBHOOK (handleTokenWebhookPaystack,
 * below), DELIBERATELY — §135. Each provider gets its own distinct URL,
 * configured separately in that provider's own dashboard, because the
 * two send structurally different payloads with different signature
 * schemes; a shared endpoint would have to sniff which provider sent a
 * request before it could even verify the signature, which defeats the
 * point of verifying first. This route (/tokens/webhook) is unchanged
 * from §134 and remains Stripe-specific, not renamed to
 * /tokens/webhook/stripe, to avoid breaking a Stripe webhook Mark may
 * already have configured.
 */
export async function handleTokenWebhook(req, res, rawBody) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;
  try {
    event = await verifyWebhookSignature(rawBody, req.headers['stripe-signature']);
  } catch (err) {
    console.error('appointments/tokens/webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const brokerId = session.metadata?.brokerId;
      const tokens = Number(session.metadata?.tokens);

      if (!brokerId || !Number.isInteger(tokens) || tokens <= 0) {
        // Malformed metadata — shouldn't happen for a session this app
        // itself created (createCheckoutSession always sets both), but a
        // 200 here (not 500) is still correct: retrying won't fix bad
        // metadata that was already wrong the first time, and this isn't
        // Stripe's fault to keep retrying.
        console.error('appointments/tokens/webhook: checkout.session.completed missing brokerId/tokens metadata', session.id);
        return res.status(200).json({ received: true, skipped: true });
      }

      const packLabel = TOKEN_PACKS[Number(session.metadata?.packIndex)]?.label ?? `${tokens} tokens`;
      const result = await creditPurchasedTokens(brokerId, tokens, session.id, `Stripe purchase — ${packLabel}`);

      if (result.credited) {
        await writeAuditLog({
          entityType: 'TokenLedger',
          entityId: brokerId,
          action: 'TokenStripeCredited',
          performedById: null, // system-initiated, not a staff action — no authenticated actor on this route
          changeDetail: { brokerId, tokens, stripeSessionId: session.id },
          ipAddress: clientIp(req),
        });
      }
    }

    // Every other event type: acknowledged, not acted on (this app only
    // reacts to checkout.session.completed today).
    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('appointments/tokens/webhook error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/appointments/tokens/webhook/paystack — §135 (7 Aug 2026).
 * Paystack's equivalent of handleTokenWebhook above — same "no staff
 * auth, the signature IS the auth boundary" reasoning, same raw-Buffer
 * dependency on appointments-router.js's file-wide bodyParser:false. Two
 * differences from the Stripe path worth calling out:
 *   - Paystack's own webhook docs are more conservative about trusting
 *     the payload once the signature checks out — they explicitly
 *     recommend also confirming via GET /transaction/verify/:reference
 *     before granting value, not just checking the signature. Done here
 *     (paystackService.verifyTransaction) as a genuine second check, not
 *     a formality — the amount Paystack's verify endpoint reports is
 *     cross-checked against the pack's real price, and a mismatch (or a
 *     status other than 'success') refuses the credit rather than
 *     trusting the webhook body's own claims about itself.
 *   - Paystack's event field is named `event` (e.g. 'charge.success'),
 *     not `type` like Stripe's — different vendor, different shape,
 *     handled here rather than normalised into a shared shape, since
 *     there's no real advantage to a fake unified event format for
 *     exactly two providers.
 */
export async function handleTokenWebhookPaystack(req, res, rawBody) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;
  try {
    event = await verifyPaystackWebhookSignature(rawBody, req.headers['x-paystack-signature']);
  } catch (err) {
    console.error('appointments/tokens/webhook/paystack signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  try {
    if (event.event === 'charge.success') {
      const data = event.data;
      const brokerId = data.metadata?.brokerId;
      const tokens = Number(data.metadata?.tokens);
      const packIndex = Number(data.metadata?.packIndex);
      const reference = data.reference;

      if (!brokerId || !Number.isInteger(tokens) || tokens <= 0 || !reference) {
        console.error('appointments/tokens/webhook/paystack: charge.success missing brokerId/tokens/reference metadata', reference);
        return res.status(200).json({ received: true, skipped: true });
      }

      // Defence in depth (this function's own header) — confirm with
      // Paystack server-to-server before crediting, don't just trust the
      // webhook payload's own amount/status claims.
      const expectedAmount = TOKEN_PACKS[packIndex]?.priceZarCents;
      const verification = await verifyPaystackTransaction(reference);
      if (verification.status !== 'success' || verification.amount !== expectedAmount) {
        console.error('appointments/tokens/webhook/paystack: verify mismatch', { reference, verification, expectedAmount });
        return res.status(200).json({ received: true, skipped: true });
      }

      const packLabel = TOKEN_PACKS[packIndex]?.label ?? `${tokens} tokens`;
      const result = await creditPurchasedTokens(brokerId, tokens, reference, `Paystack purchase — ${packLabel}`);

      if (result.credited) {
        await writeAuditLog({
          entityType: 'TokenLedger',
          entityId: brokerId,
          action: 'TokenPaystackCredited',
          performedById: null, // system-initiated, not a staff action — no authenticated actor on this route
          changeDetail: { brokerId, tokens, paystackReference: reference },
          ipAddress: clientIp(req),
        });
      }
    }

    // Every other event type: acknowledged, not acted on (this app only
    // reacts to charge.success today).
    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('appointments/tokens/webhook/paystack error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
