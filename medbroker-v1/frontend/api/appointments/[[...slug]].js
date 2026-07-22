/**
 * api/appointments/[[...slug]].js
 * Consolidated dispatcher (was 6 separate files: index.js, [id]/index.js,
 * [id]/assign.js, [id]/reassign.js, [id]/return.js, [id]/outcome.js).
 *
 * Routes:
 *   GET  /api/appointments
 *   POST /api/appointments
 *   GET  /api/appointments/:id
 *   PUT  /api/appointments/:id/assign
 *   PUT  /api/appointments/:id/reassign
 *   PUT  /api/appointments/:id/return
 *   POST /api/appointments/:id/outcome
 */

import {
  handleAppointmentsCollection, handleAppointmentById, handleAppointmentAssign,
  handleAppointmentReassign, handleAppointmentReturn, handleAppointmentOutcome,
} from '../../api-lib/handlers/appointmentHandlers.js';
import { applyCors } from '../../api-lib/http/helpers.js';

const SUB_ROUTES = {
  assign:   handleAppointmentAssign,
  reassign: handleAppointmentReassign,
  return:   handleAppointmentReturn,
  outcome:  handleAppointmentOutcome,
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const slug = req.query.slug ?? [];
  const segments = Array.isArray(slug) ? slug : [slug];

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
