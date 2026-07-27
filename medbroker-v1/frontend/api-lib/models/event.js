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
import { Title, JobTitle, saMobile } from './lead.js';

export const EVENT_STATUSES = ['Draft', 'Active', 'Closed', 'Cancelled'];

// Allowed status transitions — Draft is the only entry point (createEvent
// always creates Draft). Closed and Cancelled were originally terminal;
// changed after Mark hit "no way back" from an accidental Close — Closed
// can be reopened to Active, Cancelled can be reactivated to Draft for
// review before going live again. Nothing here is a data-integrity rule
// the way ClosedWon/ClosedLost is for Appointment — an Event's status is
// just where-it-is-in-its-lifecycle, so mistakes should be correctable.
export const ALLOWED_STATUS_TRANSITIONS = {
  Draft:     ['Active', 'Cancelled'],
  Active:    ['Closed', 'Cancelled'],
  Closed:    ['Active'],
  Cancelled: ['Draft'],
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

/**
 * Manual "Add Attendee" — staff registering someone who didn't go through
 * (or isn't waiting for) the self-service Lead Portal. Same required
 * fields as CreateLeadSchema, because this either creates a new Lead or
 * matches an existing one (see eventService.addAttendee) — matching the
 * client's real intake requirements consistently rather than a lighter
 * "quick add" that would need reconciling with the Lead record later.
 *
 * popiConsentConfirmed is a hard gate, not a default-true assumption:
 * staff adding someone on their behalf did not get that person's consent
 * through a self-service form the way the future Portal registration
 * will, so this is staff explicitly attesting they obtained it, not the
 * system silently assuming it.
 */
export const AddAttendeeSchema = z.object({
  title:        Title,
  firstName:    z.string().min(1, 'First name is required').max(100),
  lastName:     z.string().min(1, 'Last name is required').max(100),
  dateOfBirth:  z.string().date('Must be a valid date (YYYY-MM-DD)'),
  email:        z.string().email('Must be a valid email address').max(255),
  mobileNumber: saMobile,
  occupation:   JobTitle,
  popiConsentConfirmed: z.literal(true, {
    errorMap: () => ({ message: 'Confirm that this attendee\'s POPIA consent was obtained before adding them' }),
  }),
  attended: z.boolean().default(false),
});

export const SetAttendanceSchema = z.object({
  attended: z.boolean(),
});
