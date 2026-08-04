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
 *   GET  /api/appointments/:id
 *   PUT  /api/appointments/:id/assign
 *   PUT  /api/appointments/:id/reassign
 *   PUT  /api/appointments/:id/return
 *   PUT  /api/appointments/:id/claim            (§117 — Broker only)
 *   POST /api/appointments/:id/outcome
 *   GET  /api/appointments/:id/audit
 */

import {
  handleAppointmentsCollection, handleAppointmentById, handleAppointmentAssign,
  handleAppointmentReassign, handleAppointmentReturn, handleAppointmentOutcome,
  handleAppointmentAudit, handleBrokerMatching, handleAppointmentClaim,
  handleAvailableToClaim, handleTokenLedgerMe, handleTokenLedgerByBroker, handleTokenTopUp,
} from '../api-lib/handlers/appointmentHandlers.js';
import { applyCors, parseSlug } from '../api-lib/http/helpers.js';

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
  // :id/subroute — it's tokens/me, tokens/:brokerId, or
  // tokens/:brokerId/topup, none of which have an appointment id at all.
  if (segments.length === 1 && segments[0] === 'available-to-claim') {
    return handleAvailableToClaim(req, res);
  }
  if (segments[0] === 'tokens') {
    if (segments.length === 2 && segments[1] === 'me') return handleTokenLedgerMe(req, res);
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
