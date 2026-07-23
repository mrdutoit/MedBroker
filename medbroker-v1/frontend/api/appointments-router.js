/**
 * api/appointments-router.js
 * Replaces api/appointments/[[...slug]].js — see api/auth-router.js
 * header for why. Reached via vercel.json rewrite
 * `/api/appointments/:slug*` -> `/api/appointments-router?slug=:slug*`.
 *
 * Routes:
 *   GET  /api/appointments
 *   POST /api/appointments
 *   GET  /api/appointments/:id
 *   PUT  /api/appointments/:id/assign
 *   PUT  /api/appointments/:id/reassign
 *   PUT  /api/appointments/:id/return
 *   POST /api/appointments/:id/outcome
 *   GET  /api/appointments/:id/audit
 */

import {
  handleAppointmentsCollection, handleAppointmentById, handleAppointmentAssign,
  handleAppointmentReassign, handleAppointmentReturn, handleAppointmentOutcome,
  handleAppointmentAudit,
} from '../api-lib/handlers/appointmentHandlers.js';
import { applyCors, parseSlug } from '../api-lib/http/helpers.js';

const SUB_ROUTES = {
  assign:   handleAppointmentAssign,
  reassign: handleAppointmentReassign,
  return:   handleAppointmentReturn,
  outcome:  handleAppointmentOutcome,
  audit:    handleAppointmentAudit,
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const segments = parseSlug(req.query.slug);

  if (segments.length === 0) {
    return handleAppointmentsCollection(req, res);
  }

  if (segments.length === 1) {
    return handleAppointmentById(req, res, segments[0]);
  }

  if (segments.length === 2 && SUB_ROUTES[segments[1]]) {
    return SUB_ROUTES[segments[1]](req, res, segments[0]);
  }

  return res.status(404).json({ error: 'Not found' });
}
