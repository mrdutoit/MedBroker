/**
 * services/stripeService.js — NEW, §134 (6 Aug 2026). UPDATED §135
 * (7 Aug 2026) — TOKEN_PACKS moved to tokenPacks.js, shared with the new
 * paystackService.js, so the two providers can't drift apart on pricing.
 * Stripe Checkout (redirect-based, not Stripe.js/Elements) for the
 * appointments.tokens.paymentProvider = 'stripe' path. A broker clicks
 * Buy Tokens, the browser is redirected to a Stripe-hosted payment page
 * (session.url), and Stripe redirects back to success_url/cancel_url —
 * this app's own frontend never touches card details or a Stripe
 * publishable key at all, so IntegrationCredential only stores a secret
 * key and a webhook signing secret, nothing client-facing.
 */

import Stripe from 'stripe';
import { getRawConfig } from './integrationCredentialService.js';
import { resolveOrganisationId } from '../context/tenant.js';
import { config } from '../config.js';
import { TOKEN_PACKS } from './tokenPacks.js';

/**
 * Builds a Stripe client from the DB-stored secret key. Throws a clear,
 * actionable error if Stripe hasn't been configured yet on the
 * Integrations page — same "throw at call time, not at cold start"
 * pattern encryption.js's getKmsClient() and emailService.js's
 * getTransporter() already use for every other optional integration in
 * this app.
 * @returns {Promise<Stripe>}
 */
async function getStripeClient() {
  const config = await getRawConfig('stripe');
  if (!config?.secretKey) {
    throw { status: 400, message: 'Stripe is not configured — set a secret key on the Integrations page (App Admin → Integrations) first.' };
  }
  // Stripe's own SDK default apiVersion is pinned to whatever version the
  // installed package version was built against — not overridden here,
  // deliberately, so an npm update to a newer `stripe` package version
  // also picks up that version's own current default rather than this
  // file silently pinning to a version that ages out.
  return new Stripe(config.secretKey);
}

/**
 * Creates a Stripe Checkout Session for one token pack and returns the
 * hosted payment page URL to redirect the broker's browser to.
 * organisationId/frontendOrigin are resolved internally (resolveOrganisationId(),
 * config.app.frontendOrigin) rather than passed in — matches how every
 * other service in this codebase resolves them, not the handler layer.
 * @param {{ brokerId: string, packIndex: number }} params
 * @returns {Promise<string>} session.url
 */
export async function createCheckoutSession({ brokerId, packIndex }) {
  const pack = TOKEN_PACKS[packIndex];
  if (!pack) {
    throw { status: 400, message: 'Invalid token pack selection' };
  }

  const organisationId = resolveOrganisationId();
  const frontendOrigin = config.app.frontendOrigin;
  const stripe = await getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'zar',
        product_data: { name: `MedBroker — ${pack.label}` },
        unit_amount: pack.priceZarCents,
      },
      quantity: 1,
    }],
    // metadata carries everything the webhook needs to credit the right
    // broker the right number of tokens — Stripe echoes this back
    // unchanged on the completed-session event, so no separate lookup
    // table mapping session id -> intended credit is needed.
    metadata: {
      brokerId,
      packIndex: String(packIndex),
      tokens: String(pack.tokens),
      organisationId,
    },
    success_url: `${frontendOrigin}/appointments?stripe=success`,
    cancel_url:  `${frontendOrigin}/appointments?stripe=cancel`,
  });

  return session.url;
}

/**
 * Verifies a webhook payload's Stripe-Signature header against the
 * DB-stored webhook signing secret and returns the parsed event. Throws
 * (caller returns 400) if the signature doesn't check out — this is the
 * entire defence against someone POSTing a forged "payment completed"
 * event straight at this public endpoint (see appointmentHandlers.js's
 * handleTokenWebhook for why this route has no staff JWT check at all;
 * Stripe itself doesn't have a MedBroker session).
 * @param {Buffer} rawBody - the EXACT bytes as received, before any JSON
 *   parsing — see appointments-router.js's header for why this has to be
 *   the raw stream, not req.body.
 * @param {string} signatureHeader - req.headers['stripe-signature']
 * @returns {Promise<import('stripe').Stripe.Event>}
 */
export async function verifyWebhookSignature(rawBody, signatureHeader) {
  const config = await getRawConfig('stripe');
  if (!config?.webhookSigningSecret) {
    throw { status: 400, message: 'Stripe webhook signing secret is not configured' };
  }
  if (!signatureHeader) {
    throw { status: 400, message: 'Missing Stripe-Signature header' };
  }

  // Constructing a Stripe client here too (not just for signature
  // verification) is unnecessary — constructEvent is a static-shaped
  // instance method that doesn't make a network call, but the SDK still
  // requires an instance to call it on. secretKey may be absent if only
  // the webhook secret has been configured so far (a real, valid
  // intermediate state while setting this up) — constructEvent doesn't
  // use it, so an empty string is fine here specifically.
  const stripe = new Stripe(config.secretKey || 'sk_placeholder_not_used_by_constructEvent');
  return stripe.webhooks.constructEvent(rawBody, signatureHeader, config.webhookSigningSecret);
}
