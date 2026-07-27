/**
 * services/eventService.js — NEW, 24 Jul 2026.
 * First real backend for the Events domain — EventList.jsx/EventDetail.jsx
 * have been mock since first built (§ see Status.md, "Events" section was
 * never in scope for any of the Leads/Users/Flags/Appointments/Reports
 * wiring sessions).
 *
 * rsvpCount/attendedCount/walkinCount are derived from EventAttendee, not
 * stored columns — 'walk-in' isn't a schema concept, it's attended=true
 * with rsvp=false (someone who showed up without having registered first).
 * Aggregated via LEFT JOIN + GROUP BY on Event's own PK — no fan-out risk,
 * this is a straight one-Event-row grouping, not a join across two child
 * tables the way Appointment/AppointmentProduct reporting had to guard
 * against (see reportService.js's header for that history).
 */
import { executeQuery, executeQueryOne, sql } from './db.js';
import { resolveOrganisationId } from '../context/tenant.js';
import { ALLOWED_STATUS_TRANSITIONS } from '../models/event.js';
import { findDuplicate, createLead } from './leadService.js';

const EVENT_SELECT = `
  SELECT
    e.id, e.name, e.description, e.eventDate AS "eventDate", e.venue,
    e.university, e.status, e.qrToken AS "qrToken", e.checkinToken AS "checkinToken",
    e.createdById AS "createdById", cb.displayName AS "createdByName",
    e.createdAt AS "createdAt",
    COUNT(ea.id) FILTER (WHERE ea.deletedAt IS NULL AND ea.rsvp = TRUE)                         AS "rsvpCount",
    COUNT(ea.id) FILTER (WHERE ea.deletedAt IS NULL AND ea.attended = TRUE AND ea.rsvp = TRUE)  AS "attendedCount",
    COUNT(ea.id) FILTER (WHERE ea.deletedAt IS NULL AND ea.attended = TRUE AND ea.rsvp = FALSE) AS "walkinCount"
  FROM Event e
  LEFT JOIN "User" cb        ON e.createdById = cb.id
  LEFT JOIN EventAttendee ea ON ea.eventId = e.id
`;

// Postgres COUNT(...) FILTER returns bigint, which node-pg hands back as a
// string to avoid silent precision loss — cast to number for the frontend's
// arithmetic (attendanceRate = attendedCount / rsvpCount etc.) to work as
// expected without every caller remembering to Number() it themselves.
function coerceCounts(row) {
  if (!row) return row;
  return {
    ...row,
    rsvpCount:     Number(row.rsvpCount),
    attendedCount: Number(row.attendedCount),
    walkinCount:   Number(row.walkinCount),
  };
}

/** @returns {Promise<Array>} all events for the org, most recent first */
export async function listEvents() {
  const rows = await executeQuery(
    `${EVENT_SELECT}
     WHERE e.deletedAt IS NULL AND e.organisationId = @organisationId
     GROUP BY e.id, cb.displayName
     ORDER BY e.eventDate DESC`,
    { organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
  return rows.map(coerceCounts);
}

/** @param {string} id @returns {Promise<Object|null>} */
export async function getEventById(id) {
  const row = await executeQueryOne(
    `${EVENT_SELECT}
     WHERE e.id = @id AND e.deletedAt IS NULL AND e.organisationId = @organisationId
     GROUP BY e.id, cb.displayName`,
    {
      id:             { type: sql.UniqueIdentifier, value: id },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
  return coerceCounts(row);
}

/**
 * @param {{name, description, eventDate, venue, university}} data
 * @param {string} createdById
 * @returns {Promise<string>} new event id
 */
export async function createEvent(data, createdById) {
  const row = await executeQueryOne(
    `INSERT INTO Event (id, organisationId, name, description, eventDate, venue, university, status, createdById)
     VALUES (gen_random_uuid(), @organisationId, @name, @description, @eventDate, @venue, @university, 'Draft', @createdById)
     RETURNING id`,
    {
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      name:           { type: sql.NVarChar(300),  value: data.name },
      description:    { type: sql.NVarChar(sql.MAX), value: data.description ?? null },
      eventDate:      { type: sql.Date,           value: data.eventDate },
      venue:          { type: sql.NVarChar(300),  value: data.venue ?? null },
      university:     { type: sql.NVarChar(200),  value: data.university ?? null },
      createdById:    { type: sql.UniqueIdentifier, value: createdById },
    }
  );
  return row.id;
}

/**
 * Validates the transition server-side (not just hidden client-side) —
 * ALLOWED_STATUS_TRANSITIONS is the single source of truth, shared with
 * the frontend via models/event.js.
 * @param {string} id
 * @param {string} newStatus
 * @returns {Promise<Object>} { ok: true, event } or { ok: false, error }
 */
export async function updateEventStatus(id, newStatus) {
  const event = await getEventById(id);
  if (!event) return { ok: false, error: 'not_found' };

  const allowed = ALLOWED_STATUS_TRANSITIONS[event.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return { ok: false, error: 'invalid_transition', from: event.status, to: newStatus, allowed };
  }

  await executeQuery(
    `UPDATE Event SET status = @status, updatedAt = NOW()
     WHERE id = @id AND organisationId = @organisationId`,
    {
      status:         { type: sql.NVarChar(50), value: newStatus },
      id:             { type: sql.UniqueIdentifier, value: id },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
  return { ok: true, fromStatus: event.status, event: { ...event, status: newStatus } };
}

/**
 * Attendee list for EventDetail.jsx's table — joins through to Lead for
 * name/email/occupation, matching the mock's exact shape.
 * @param {string} eventId
 */
export async function listEventAttendees(eventId) {
  return executeQuery(
    `SELECT
       ea.id, l.id AS "leadId",
       TRIM(CONCAT_WS(' ', l.title, l.firstName, l.lastName)) AS name,
       l.email, l.occupation,
       ea.rsvp, ea.attended, ea.attendedAt AS "attendedAt",
       ea.registeredAt AS "registeredAt"
     FROM EventAttendee ea
     JOIN Lead l ON ea.leadId = l.id
     WHERE ea.eventId = @eventId AND ea.deletedAt IS NULL
       AND ea.organisationId = @organisationId
     ORDER BY ea.registeredAt DESC`,
    {
      eventId:        { type: sql.UniqueIdentifier, value: eventId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * Report payload for EventDetail.jsx's "Download Report" — summary counts
 * (reuses getEventById's aggregates) plus the full attendee list, shaped
 * for a client-side CSV export rather than a server-generated file.
 * @param {string} eventId
 */
export async function getEventReport(eventId) {
  const event = await getEventById(eventId);
  if (!event) return null;
  const attendees = await listEventAttendees(eventId);
  return { event, attendees };
}

/**
 * Manually register an attendee for an event — resolves to an existing
 * Lead (same dedup as everywhere else: idNumberHash then email, via
 * leadService.findDuplicate) or creates a new one, tagged with
 * linkedEventId + leadSource='EventAttendance'. Idempotent against a
 * second add for the same (eventId, leadId) — returns the existing
 * EventAttendee row rather than erroring or duplicating it.
 * @param {string} eventId
 * @param {Object} data - validated AddAttendeeSchema data
 * @param {string} performedById - staff user adding this attendee
 * @returns {Promise<{attendeeId: string, leadId: string, createdNewLead: boolean, alreadyRegistered: boolean}>}
 */
export async function addAttendee(eventId, data, performedById) {
  let leadId = await findDuplicate(data.email, null);
  let createdNewLead = false;

  if (!leadId) {
    leadId = await createLead(
      {
        title: data.title,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        email: data.email,
        mobileNumber: data.mobileNumber,
        occupation: data.occupation,
        linkedEventId: eventId,
        leadSource: 'EventAttendance',
      },
      performedById
    );
    createdNewLead = true;
  }

  const existing = await executeQueryOne(
    `SELECT id FROM EventAttendee WHERE eventId = @eventId AND leadId = @leadId AND deletedAt IS NULL`,
    {
      eventId: { type: sql.UniqueIdentifier, value: eventId },
      leadId:  { type: sql.UniqueIdentifier, value: leadId },
    }
  );
  if (existing) {
    return { attendeeId: existing.id, leadId, createdNewLead, alreadyRegistered: true };
  }

  const row = await executeQueryOne(
    `INSERT INTO EventAttendee (id, organisationId, eventId, leadId, rsvp, attended, attendedAt, popiConsent, registeredAt)
     VALUES (gen_random_uuid(), @organisationId, @eventId, @leadId, TRUE, @attended,
             CASE WHEN @attended THEN NOW() ELSE NULL END, TRUE, NOW())
     RETURNING id`,
    {
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      eventId:        { type: sql.UniqueIdentifier, value: eventId },
      leadId:         { type: sql.UniqueIdentifier, value: leadId },
      attended:       { type: sql.Bit, value: data.attended ?? false },
    }
  );
  return { attendeeId: row.id, leadId, createdNewLead, alreadyRegistered: false };
}

/**
 * Toggle an attendee's checked-in status — the manual equivalent of what
 * the future Lead Portal's self-check-in will do to the same column.
 * @param {string} eventId
 * @param {string} attendeeId
 * @param {boolean} attended
 * @returns {Promise<boolean>} false if no matching row (wrong event/id, or deleted)
 */
export async function setAttendeeAttendance(eventId, attendeeId, attended) {
  const row = await executeQueryOne(
    `UPDATE EventAttendee
     SET attended = @attended, attendedAt = CASE WHEN @attended THEN NOW() ELSE NULL END
     WHERE id = @attendeeId AND eventId = @eventId AND organisationId = @organisationId AND deletedAt IS NULL
     RETURNING id`,
    {
      attended:       { type: sql.Bit, value: attended },
      attendeeId:     { type: sql.UniqueIdentifier, value: attendeeId },
      eventId:        { type: sql.UniqueIdentifier, value: eventId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
  return !!row;
}
