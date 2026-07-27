/**
 * api/events-router.js — NEW, 24 Jul 2026.
 * Reached via vercel.json rewrite `/api/events/:slug*` ->
 * `/api/events-router?slug=:slug*`.
 *
 * Routes:
 *   GET  /api/events                                   list
 *   POST /api/events                                   create
 *   GET  /api/events/:id                                detail + attendees
 *   PUT  /api/events/:id/status                        status transition
 *   GET  /api/events/:id/report                         summary + attendee list for export
 *   POST /api/events/:id/attendees                      manually add an attendee
 *   PUT  /api/events/:id/attendees/:attendeeId/attendance toggle check-in
 */
import {
  handleEventsCollection, handleEventDetail, handleEventStatus, handleEventReport,
  handleEventAttendees, handleEventAttendeeAttendance,
} from '../api-lib/handlers/eventHandlers.js';
import { applyCors, parseSlug } from '../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const segments = parseSlug(req.query.slug);

  if (segments.length === 0) return handleEventsCollection(req, res);
  if (segments.length === 1) return handleEventDetail(req, res, segments[0]);
  if (segments.length === 2 && segments[1] === 'status')     return handleEventStatus(req, res, segments[0]);
  if (segments.length === 2 && segments[1] === 'report')     return handleEventReport(req, res, segments[0]);
  if (segments.length === 2 && segments[1] === 'attendees')  return handleEventAttendees(req, res, segments[0]);
  if (segments.length === 4 && segments[1] === 'attendees' && segments[3] === 'attendance') {
    return handleEventAttendeeAttendance(req, res, segments[0], segments[2]);
  }

  return res.status(404).json({ error: 'Not found' });
}
