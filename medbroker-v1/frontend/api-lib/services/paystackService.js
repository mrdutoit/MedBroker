/**
 * services/paystackService.js — NEW, §135 (7 Aug 2026).
 * Second appointments.tokens.paymentProvider option, added alongside
 * Stripe because Stripe does not support South Africa at all — Paystack
 * (Stripe-owned) does, natively in ZAR. Mirrors stripeService.js's shape
 * closely on purpose (same createCheckoutSession-equivalent /
 * verifyWebhookSignature-equivalent pair), but is genuinely simpler in
 * two ways worth knowing:
 *   - ONE secret, not two. Paystack has no separate "webhook signing
 *     secret" concept — the same secret key both authorises the
 *     /transaction/initialize call AND signs the webhook (HMAC-SHA512 of
 *     the raw body). IntegrationCredential's 'paystack' config is just
 *     { secretKey }.
 *   - NO SDK. Paystack's API is plain REST (Bearer token, JSON in/out) —
 *     no first-party Node SDK exists worth depending on, so this file
 *     talks to https://api.paystack.co directly via fetch(), same as
 *     Paystack's own docs show. One less dependency than the Stripe path.
 *
 * TOKEN_PACKS is imported from tokenPacks.js, shared with stripeService.js
 * — same three packs, same prices, regardless of which provider is
 * active. Paystack's amounts are in kobo/cents (smallest currency unit)
 * exactly like Stripe's unit_amount, so priceZarCents is used unchanged.
 *
 * DEFENCE IN DEPTH BEYOND THE SIGNATURE CHECK — Paystack's own webhook
 * docs are more conservative than Stripe's about trusting the webhook
 * payload alone: they explicitly recommend calling GET
 * /transaction/verify/:reference to confirm the amount and status before
 * granting value, not just checking the signature. verifyTransaction()
 * below exists for that reason and is called by
 * appointmentHandlers.handleTokenWebhook before crediting anything —
 * belt and braces on money actually changing hands, not just reasoned
 * as unnecessary because the signature already checked out.
 */

import crypto from 'node:crypto';
import { getRawConfig } from './integrationCredentialService.js';
import { resolveOrganisationId } from '../context/tenant.js';
import { getUserEmailById } from './userService.js';
import { config } from '../config.js';
import { TOKEN_PACKS } from './tokenPacks.js';

const PAYSTACK_API = 'https://api.paystack.co';

async function getSecretKey() {
  const cfg = await getRawConfig('paystack');
  if (!cfg?.secretKey) {
    throw { status: 400, message: 'Paystack is not configured — set a secret key on the Integrations page (App Admin → Integrations) first.' };
  }
  return cfg.secretKey;
}

/**
 * Initializes a Paystack transaction for one token pack and returns the
 * hosted payment page URL (authorization_url) to redirect the broker's
 * browser to — Paystack's equivalent of a Stripe Checkout Session's
 * session.url. Paystack requires an email on the initialize call (Stripe
 * Checkout doesn't) — pulled from the broker's own User record via
 * userService.getUserEmailById(), the same lookup notificationService.js
 * already uses, not asked of the caller.
 * @param {{ brokerId: string, packIndex: number }} params
 * @returns {Promise<string>} authorization_url
 */
export async function createTransaction({ brokerId, packIndex }) {
  const pack = TOKEN_PACKS[packIndex];
  if (!pack) {
    throw { status: 400, message: 'Invalid token pack selection' };
  }

  const email = await getUserEmailById(brokerId);
  if (!email) {
    throw { status: 400, message: 'Could not find an email address for this account — required by Paystack to initiate a transaction.' };
  }

  const organisationId = resolveOrganisationId();
  const secretKey = await getSecretKey();

  const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: pack.priceZarCents,
      currency: 'ZAR',
      callback_url: `${config.app.frontendOrigin}/appointments?paystack=success`,
      // metadata carries everything the webhook needs to credit the
      // right broker the right number of tokens — Paystack echoes this
      // back unchanged on the webhook event, same reasoning as Stripe's
      // session metadata (stripeService.js).
      metadata: { brokerId, packIndex: String(packIndex), tokens: String(pack.tokens), organisationId },
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.status) {
    console.error('Paystack transaction/initialize failed:', data);
    throw { status: 502, message: 'Could not start Paystack checkout — please try again.' };
  }

  return data.data.authorization_url;
}

/**
 * Verifies a webhook payload's x-paystack-signature header against the
 * DB-stored secret key and returns the parsed event if valid. Paystack's
 * scheme: HMAC-SHA512 of the EXACT raw request body, keyed with the
 * secret key, hex-encoded, compared against the header — see this file's
 * header for why there's no separate webhook secret to configure, unlike
 * Stripe. Timing-safe comparison (crypto.timingSafeEqual), not `===` —
 * same reasoning as every other secret comparison in this app (see
 * encryption.js's own use of timing-safe comparison elsewhere).
 * @param {Buffer} rawBody - the EXACT bytes as received — see
 *   appointments-router.js's header for why this has to be the raw
 *   stream, not req.body.
 * @param {string} signatureHeader - req.headers['x-paystack-signature']
 * @returns {Promise<object>} the parsed event body
 */
export async function verifyWebhookSignature(rawBody, signatureHeader) {
  const secretKey = await getSecretKey();
  if (!signatureHeader) {
    throw { status: 400, message: 'Missing x-paystack-signature header' };
  }

  const expected = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(signatureHeader, 'hex');
  const valid = expectedBuf.length === receivedBuf.length && crypto.timingSafeEqual(expectedBuf, receivedBuf);
  if (!valid) {
    throw { status: 400, message: 'Paystack webhook signature verification failed' };
  }

  return JSON.parse(rawBody.toString('utf8'));
}

/**
 * Confirms a transaction's real status/amount server-to-server before
 * crediting anything — Paystack's own recommended defence in depth on
 * top of the signature check (see this file's header). Called by
 * handleTokenWebhook with the reference from the webhook payload itself;
 * a mismatch between what the webhook claimed and what Paystack's own
 * verify endpoint reports is treated as a reason to refuse the credit,
 * not just log a warning.
 * @param {string} reference
 * @returns {Promise<{ status: string, amount: number, currency: string }>}
 */
export async function verifyTransaction(reference) {
  const secretKey = await getSecretKey();
  const res = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const data = await res.json();
  if (!res.ok || !data.status) {
    throw { status: 502, message: 'Could not verify Paystack transaction' };
  }
  return { status: data.data.status, amount: data.data.amount, currency: data.data.currency };
}
