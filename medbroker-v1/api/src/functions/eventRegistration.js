/**
 * functions/eventRegistration.js
 * Public endpoint for mobile app event registration via QR code.
 *
 * This function has NO JWT authentication — it is accessible by students
 * scanning a QR code on their phones. Access control is via the QR token
 * embedded in the URL (time-limited, event-specific).
 *
 * Rate limiting is enforced at Azure Front Door (Standard tier) — not here.
 *
 * Security model:
 *   - QR token is a UUID generated at event creation time
 *   - Token is valid only while the event status is 'Active'
 *   - Token expires based on event lifecycle (not time-based expiry)
 *   - Each registration is idempotent — submitting twice with the same ID/email
 *     updates the existing lead rather than creating a duplicate
 */

import { app } from '@azure/functions';
import { z } from 'zod';
import { executeQuery, executeQueryOne, sql } from '../services/db.js';
import { createLead, findDuplicate } from '../services/leadService.js';
import { config } from '../config.js';

// Best-effort in-memory rate limiter (fixed window). Per Function instance, so
// it is defence-in-depth, not a hard guarantee — the primary control is the
// Front Door origin lock below plus WAF rate rules at the edge. For a hard
// distributed limit, back this with Redis/Table storage.
const RATE_LIMIT = 5;            // registrations
const RATE_WINDOW_MS = 60_000;   // per minute, per IP + event
const rateBuckets = new Map();

function isRateLimited(key) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) ?? 'unknown';
}

const RegistrationSchema = z.object({
  // QR token from URL param — identifies the event and validates access
  qrToken:             z.string().uuid('Invalid QR token'),
  firstName:           z.string().min(1).max(100),
  lastName:            z.string().min(1).max(100),
  email:               z.string().email().max(255),
  mobileNumber:        z.string().regex(/^(\+27|0)[6-8]\d{8}$/).optional(),
  idNumber:            z.string().regex(/^\d{13}$/).optional(),
  universityAttended:  z.string().max(200).optional(),
  yearOfAttendance:    z.number().int().min(1980).max(new Date().getFullYear()).optional(),
  degreeAttained:      z.string().max(200).optional(),
  occupation:          z.string().max(200).optional(),
  hospitalOrPractice:  z.string().max(300).optional(),
  // Consent is mandatory under POPIA — students must explicitly agree
  popiConsent:         z.boolean().refine(v => v === true, {
    message: 'POPIA consent is required to register',
  }),
});

app.http('eventRegistration', {
  methods: ['POST'],
  route: 'public/register',
  authLevel: 'anonymous', // public endpoint — no JWT; secured by QR token + Front Door rate limiting
  handler: async (request, context) => {
    try {
      // Origin lock — if a Front Door ID is configured, only accept traffic that
      // carries the matching header. Blocks direct hits on the Function URL.
      if (config.frontDoor.id) {
        const fdid = request.headers.get('x-azure-fdid');
        if (fdid !== config.frontDoor.id) {
          return { status: 403, jsonBody: { error: 'Forbidden' } };
        }
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return { status: 400, jsonBody: { error: 'Request body must be valid JSON' } };
      }

      const parsed = RegistrationSchema.safeParse(body);
      if (!parsed.success) {
        return { status: 400, jsonBody: { error: parsed.error.flatten() } };
      }

      const { qrToken, popiConsent, ...leadData } = parsed.data;

      // Rate limit per IP + event token (best-effort, per instance)
      if (isRateLimited(`${clientIp(request)}:${qrToken}`)) {
        return { status: 429, jsonBody: { error: 'Too many requests. Please try again shortly.' } };
      }

      // Validate QR token — must match an active event
      const event = await executeQueryOne(
        `SELECT id, name, status FROM Event
         WHERE qrToken = @qrToken AND status = 'Active' AND deletedAt IS NULL`,
        { qrToken: { type: sql.UniqueIdentifier, value: qrToken } }
      );

      if (!event) {
        return {
          status: 403,
          jsonBody: { error: 'This registration link is no longer active' },
        };
      }

      // Check for existing RSVP (pre-registered attendees get a pre-populated form)
      const existingRsvp = await executeQueryOne(
        `SELECT ea.id, ea.leadId FROM EventAttendee ea
         JOIN Lead l ON l.id = ea.leadId
         WHERE ea.eventId = @eventId AND l.email = @email AND ea.deletedAt IS NULL`,
        {
          eventId: { type: sql.UniqueIdentifier, value: event.id },
          email:   { type: sql.NVarChar(255),     value: leadData.email },
        }
      );

      let leadId;
      let isRsvp = false;

      if (existingRsvp) {
        // RSVP attendee — update existing lead record and mark as attended
        leadId = existingRsvp.leadId;
        isRsvp = true;

        await executeQuery(
          `UPDATE Lead SET
             firstName = @firstName, lastName = @lastName,
             mobileNumber = COALESCE(@mobileNumber, mobileNumber),
             occupation = COALESCE(@occupation, occupation),
             hospitalOrPractice = COALESCE(@hospitalOrPractice, hospitalOrPractice),
             updatedAt = GETUTCDATE()
           WHERE id = @leadId`,
          {
            leadId:            { type: sql.UniqueIdentifier, value: leadId },
            firstName:         { type: sql.NVarChar(100),    value: leadData.firstName },
            lastName:          { type: sql.NVarChar(100),    value: leadData.lastName },
            mobileNumber:      { type: sql.NVarChar(20),     value: leadData.mobileNumber ?? null },
            occupation:        { type: sql.NVarChar(200),    value: leadData.occupation ?? null },
            hospitalOrPractice:{ type: sql.NVarChar(300),    value: leadData.hospitalOrPractice ?? null },
          }
        );

        // Mark as attended
        await executeQuery(
          `UPDATE EventAttendee SET attended = 1, attendedAt = GETUTCDATE()
           WHERE eventId = @eventId AND leadId = @leadId`,
          {
            eventId: { type: sql.UniqueIdentifier, value: event.id },
            leadId:  { type: sql.UniqueIdentifier, value: leadId },
          }
        );

      } else {
        // Walk-in — check for existing lead by email (dedup), or create new
        const existingLeadId = await findDuplicate(leadData.email, leadData.idNumber);

        if (existingLeadId) {
          leadId = existingLeadId;
        } else {
          leadId = await createLead(
            { ...leadData, leadSource: 'EventAttendance', linkedEventId: event.id },
            null // no createdById for public registrations
          );
        }

        // Create EventAttendee record
        await executeQuery(
          `INSERT INTO EventAttendee (id, eventId, leadId, rsvp, attended, popiConsent, registeredAt)
           VALUES (@id, @eventId, @leadId, 0, 1, @popiConsent, GETUTCDATE())`,
          {
            id:          { type: sql.UniqueIdentifier, value: crypto.randomUUID() },
            eventId:     { type: sql.UniqueIdentifier, value: event.id },
            leadId:      { type: sql.UniqueIdentifier, value: leadId },
            popiConsent: { type: sql.Bit,              value: popiConsent ? 1 : 0 },
          }
        );
      }

      return {
        status: 200,
        jsonBody: {
          success: true,
          isRsvp,
          message: `Thank you, ${leadData.firstName}! Your registration for ${event.name} has been confirmed.`,
        },
      };

    } catch (err) {
      context.error('eventRegistration error:', err);
      return { status: 500, jsonBody: { error: 'Registration failed. Please try again.' } };
    }
  },
});
