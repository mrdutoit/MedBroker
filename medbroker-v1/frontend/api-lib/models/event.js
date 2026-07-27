/**
 * models/event.js — NEW, 24 Jul 2026.
 * Validation for the Events API. Event/EventAttendee tables already existed
 * in schema.postgres.sql (qrToken, status, rsvp/attended/attendedAt/
 * popiConsent) with no backend ever built against them — EventList.jsx/
 * EventDetail.jsx have been fully mock since first built. This is the
 * prerequisite step before the Lead Portal: a real event needs to exist,
 * with a real qrToken, before anything can register or check in against it.
 */
import { z } from 'zod';

export const EVENT_STATUSES = ['Draft', 'Active', 'Closed', 'Cancelled'];

// Allowed status transitions — Draft is the only entry point (createEvent
// always creates Draft), Closed/Cancelled are terminal. Kept narrow and
// explicit rather than allowing an arbitrary status PATCH.
export const ALLOWED_STATUS_TRANSITIONS = {
  Draft:     ['Active', 'Cancelled'],
  Active:    ['Closed', 'Cancelled'],
  Closed:    [],
  Cancelled: [],
};

export const CreateEventSchema = z.object({
  name:        z.string().min(1).max(300),
  description: z.string().max(2000).optional().nullable(),
  eventDate:   z.string().date(), // 'YYYY-MM-DD' from a <input type="date">
  venue:       z.string().max(300).optional().nullable(),
  university:  z.string().max(200).optional().nullable(),
});

export const UpdateEventStatusSchema = z.object({
  status: z.enum(EVENT_STATUSES),
});
