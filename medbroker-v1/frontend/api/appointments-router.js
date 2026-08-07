/**
 * api/appointments-router.js
 * Replaces api/appointments/[[...slug]].js — see api/auth-router.js
 * header for why. Reached via vercel.json rewrite
 * `/api/appointments/:slug*` -> `/api/appointments-router?slug=:slug*`.
 *
 * Routes:
 *   GET  /api/appointments
 *   POST /api/appointments
 *   GET  /api/appointments/broker-matching
 *   GET  /api/appointments/available-to-claim   (§117 — Broker only)
 *   GET  /api/appointments/tokens/me            (§117 — Broker only)
 *   GET  /api/appointments/tokens/:brokerId     (§117 — Admin/GlobalAdmin)
 *   PUT  /api/appointments/tokens/:brokerId/topup  (§117 — Admin/GlobalAdmin)
 *   POST /api/appointments/tokens/checkout      (§134 — Broker only, Stripe)
 *   POST /api/appointments/tokens/webhook       (§134 — Stripe only, no staff auth)
 *   GET  /api/appointments/:id
 *   PUT  /api/appointments/:id/assign
 *   PUT  /api/appointments/:id/reassign
 *   PUT  /api/appointments/:id/return
 *   PUT  /api/appointments/:id/claim            (§117 — Broker only)
 *   POST /api/appointments/:id/outcome
 *   GET  /api/appointments/:id/audit
 *
 * RAW-BODY HANDLING — NEW §134. `export const config` below disables
 * Vercel's default automatic JSON body parsing for this ENTIRE function
 * (one file = one function on this stack — see CRITICAL IMPLEMENTATION
 * RULES — so this is file-wide, not per-route). That's required for the
 * Stripe webhook: signature verification needs the exact raw bytes
 * (readRawBody(), http/helpers.js), and re-serializing an already-parsed
 * body almost never round-trips byte-for-byte. Every OTHER route in this
 * file still needs req.body as a plain parsed object, exactly as before
 * — so this handler reads the raw stream once, up front, and for every
 * non-webhook request immediately JSON.parses it into req.body itself,
 * mimicking exactly what Vercel's own automatic parser used to do. None
 * of the other handlers below (assign/reassign/outcome/claim/topup/
 * collection POST) needed to change at all for this — they just keep
 * reading req.body like they always have.
 */

import {
  handleAppointmentsCollection, handleAppointmentById, handleAppointmentAssign,
  handleAppointmentReassign, handleAppointmentReturn, handleAppointmentOutcome,
  handleAppointmentAudit, handleBrokerMatching, handleAppointmentClaim,
  handleAvailableToClaim, handleTokenLedgerMe, handleTokenLedgerByBroker, handleTokenTopUp,
  handleTokenCheckout, handleTokenWebhook,
} from '../api-lib/handlers/appointmentHandlers.js';
import { applyCors, parseSlug, readRawBody } from '../api-lib/http/helpers.js';

export const config = { api: { bodyParser: false } };

const SUB_ROUTES = {
  assign:   handleAppointmentAssign,
  reassign: handleAppointmentReassign,
  return:   handleAppointmentReturn,
  outcome:  handleAppointmentOutcome,
  audit:    handleAppointmentAudit,
  claim:    handleAppointmentClaim, // §117
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const segments = parseSlug(req.query.slug);
  const isWebhook = segments.length === 2 && segments[0] === 'tokens' && segments[1] === 'webhook';

  const rawBody = await readRawBody(req);

  // The webhook gets the raw Buffer untouched — signature verification
  // happens inside handleTokenWebhook (stripeService.verifyWebhookSignature),
  // not here, so this router stays ignorant of Stripe's payload shape.
  if (isWebhook) {
    return handleTokenWebhook(req, res, rawBody);
  }

  // Every other route: reproduce Vercel's normal auto-parsed req.body now
  // that this function's own bodyParser is off. Empty body -> {} (GET
  // requests, or a POST/PUT with nothing to send) — matches what the
  // handlers below already assumed req.body would be.
  if (rawBody.length > 0) {
    try {
      req.body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  } else {
    req.body = {};
  }

  if (segments.length === 0) {
    return handleAppointmentsCollection(req, res);
  }

  // Must come before the UUID branch below — 'broker-matching' is never
  // a valid appointment id (§62 — folded in from its own former standalone
  // function to get back under Vercel Hobby's 12-function limit).
  if (segments.length === 1 && segments[0] === 'broker-matching') {
    return handleBrokerMatching(req, res);
  }

  // §117 — same "must come before the UUID branch" reasoning as
  // broker-matching above; neither 'available-to-claim' nor 'tokens' is
  // ever a valid appointment id. The 'tokens' sub-tree is dispatched here
  // rather than reusing SUB_ROUTES below, since it isn't shaped like
  // :id/subroute — it's tokens/me, tokens/:brokerId, tokens/:brokerId/topup,
  // or tokens/checkout (§134), none of which have an appointment id at all.
  if (segments.length === 1 && segments[0] === 'available-to-claim') {
    return handleAvailableToClaim(req, res);
  }
  if (segments[0] === 'tokens') {
    if (segments.length === 2 && segments[1] === 'me') return handleTokenLedgerMe(req, res);
    if (segments.length === 2 && segments[1] === 'checkout') return handleTokenCheckout(req, res); // §134
    if (segments.length === 2) return handleTokenLedgerByBroker(req, res, segments[1]);
    if (segments.length === 3 && segments[2] === 'topup') return handleTokenTopUp(req, res, segments[1]);
    return res.status(404).json({ error: 'Not found' });
  }

  if (segments.length === 1) {
    return handleAppointmentById(req, res, segments[0]);
  }

  if (segments.length === 2 && SUB_ROUTES[segments[1]]) {
    return SUB_ROUTES[segments[1]](req, res, segments[0]);
  }

  return res.status(404).json({ error: 'Not found' });
}
