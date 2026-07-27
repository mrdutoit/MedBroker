/**
 * services/leadPortalService.js — NEW, 24 Jul 2026.
 * Self-service backend for prospects/attendees — registration (matches or
 * creates a Lead, the same dedup as eventService.addAttendee), login,
 * own-profile view/edit, and venue check-in against the same Event.qrToken
 * the staff-facing QR modal already renders.
 *
 * Lead.createdById is nullable with an FK to "User" — a self-registered
 * Lead has no staff actor, so this passes null through rather than
 * inventing a "system" user row. AuditLog.performedById has no FK at all,
 * so portal-driven audit entries use the Lead's own id as the actor,
 * documented as such in changeDetail rather than left to look like a User id.
 */
import { executeQuery, executeQueryOne, sql } from './db.js';
import { resolveOrganisationId } from '../context/tenant.js';
import { findDuplicate, createLead } from './leadService.js';
import { getSystemConfig } from './systemConfigService.js';

// ── Event lookup (public, unauthenticated — registration landing page) ─────

/**
 * @param {string} qrToken
 * @returns {Promise<Object|null>} { id, name, eventDate, university, venue, status } or null
 */
export async function getEventForRegistration(qrToken) {
  return executeQueryOne(
    `SELECT id, name, eventDate AS "eventDate", university, venue, status,
            createdAt AS "createdAt"
     FROM Event
     WHERE qrToken = @qrToken AND deletedAt IS NULL AND organisationId = @organisationId`,
    {
      qrToken:        { type: sql.UniqueIdentifier, value: qrToken },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * SystemConfig.qrTokenExpiryHours (default 720 = 30 days) bounds how long
 * a registration link stays open, measured from when the event was
 * created — this field existed in SystemConfig/Settings already (admin-
 * configurable) but nothing enforced it until now. Interpreting it as
 * "hours since Event.createdAt" rather than relative to eventDate itself:
 * a registration campaign window makes more sense measured from when the
 * event (and its QR/link) was created than from the event's own date,
 * which can be scheduled arbitrarily far in advance. Flagging this
 * explicitly — no prior code established the semantics, and this is an
 * easy one-line change if Mark means something else by it.
 * @param {{createdAt: string|Date}} event
 * @returns {Promise<boolean>}
 */
export async function isRegistrationWindowOpen(event) {
  const sysConfig = await getSystemConfig();
  const hours = sysConfig?.qrTokenExpiryHours;
  if (!hours || hours <= 0) return true; // 0/unset = no expiry
  const ageHours = (Date.now() - new Date(event.createdAt).getTime()) / (1000 * 60 * 60);
  return ageHours < hours;
}

// ── Account lookups ─────────────────────────────────────────────────────────

export async function getPortalAccountByEmail(email) {
  return executeQueryOne(
    `SELECT id, leadId AS "leadId", email, passwordHash AS "passwordHash",
            failedLoginAttempts AS "failedLoginAttempts", isLocked AS "isLocked"
     FROM LeadPortalAccount
     WHERE email = @email AND deletedAt IS NULL AND organisationId = @organisationId`,
    {
      email:          { type: sql.NVarChar(255), value: email },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * Re-check for middleware/portalAuth.js — a still-valid token doesn't mean
 * the account is still active, same principle as staff's getActiveUserById.
 */
export async function getActivePortalAccountById(id) {
  return executeQueryOne(
    `SELECT id, leadId AS "leadId", email, isLocked AS "isLocked"
     FROM LeadPortalAccount
     WHERE id = @id AND deletedAt IS NULL AND isLocked = FALSE AND organisationId = @organisationId`,
    {
      id:             { type: sql.UniqueIdentifier, value: id },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

export async function recordPortalLoginSuccess(accountId) {
  await executeQuery(
    `UPDATE LeadPortalAccount SET failedLoginAttempts = 0, updatedAt = NOW() WHERE id = @id`,
    { id: { type: sql.UniqueIdentifier, value: accountId } }
  );
}

/**
 * Same fixed-threshold approach as staff lockout, but not routed through
 * SystemConfig — a prospect account's blast radius (one person's own
 * record) is much smaller than a staff account's, so a simple fixed
 * threshold is a reasonable default rather than plumbing another
 * admin-configurable setting through for it. Easy to revisit if Mark
 * wants it configurable later.
 */
const PORTAL_LOCKOUT_THRESHOLD = 5;

export async function recordPortalLoginFailure(accountId) {
  const row = await executeQueryOne(
    `UPDATE LeadPortalAccount
     SET failedLoginAttempts = failedLoginAttempts + 1, updatedAt = NOW()
     WHERE id = @id
     RETURNING failedLoginAttempts AS "failedLoginAttempts"`,
    { id: { type: sql.UniqueIdentifier, value: accountId } }
  );
  const failedLoginAttempts = row?.failedLoginAttempts ?? 0;
  const shouldLock = failedLoginAttempts >= PORTAL_LOCKOUT_THRESHOLD;
  if (shouldLock) {
    await executeQuery(
      `UPDATE LeadPortalAccount SET isLocked = TRUE, updatedAt = NOW() WHERE id = @id`,
      { id: { type: sql.UniqueIdentifier, value: accountId } }
    );
  }
  return { failedLoginAttempts, isLocked: shouldLock };
}

// ── Registration ─────────────────────────────────────────────────────────

/**
 * @param {Object} data - validated PortalRegisterSchema data (includes qrToken, password)
 * @param {string} passwordHash - pre-hashed by the caller (keeps bcrypt out of this module's surface, matches authService's separation)
 * @returns {Promise<{leadId: string, portalAccountId: string, createdNewLead: boolean}>}
 */
export async function registerProspect(data, passwordHash) {
  const existingAccount = await getPortalAccountByEmail(data.email);
  if (existingAccount) {
    throw { status: 409, message: 'An account already exists for this email — log in instead.' };
  }

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
        leadSource: 'EventAttendance',
      },
      null // no staff actor — self-registered
    );
    createdNewLead = true;
  }

  const account = await executeQueryOne(
    `INSERT INTO LeadPortalAccount (id, organisationId, leadId, email, passwordHash, passwordSetAt)
     VALUES (gen_random_uuid(), @organisationId, @leadId, @email, @passwordHash, NOW())
     RETURNING id`,
    {
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      leadId:         { type: sql.UniqueIdentifier, value: leadId },
      email:          { type: sql.NVarChar(255), value: data.email },
      passwordHash:   { type: sql.NVarChar(sql.MAX), value: passwordHash },
    }
  );

  return { leadId, portalAccountId: account.id, createdNewLead };
}

/**
 * Register + link to a specific event's attendance in one step (used by
 * the /portal/register/:qrToken page, which always registers in the
 * context of the event whose QR was scanned). Separate from
 * registerProspect() so a future non-event registration path (e.g. a
 * standalone web form) can reuse the base function without an event.
 * @param {string} eventId
 * @param {Object} data
 * @param {string} passwordHash
 */
export async function registerProspectForEvent(eventId, data, passwordHash) {
  const result = await registerProspect(data, passwordHash);

  const existing = await executeQueryOne(
    `SELECT id FROM EventAttendee WHERE eventId = @eventId AND leadId = @leadId AND deletedAt IS NULL`,
    {
      eventId: { type: sql.UniqueIdentifier, value: eventId },
      leadId:  { type: sql.UniqueIdentifier, value: result.leadId },
    }
  );
  if (!existing) {
    await executeQuery(
      `INSERT INTO EventAttendee (id, organisationId, eventId, leadId, rsvp, popiConsent, registeredAt)
       VALUES (gen_random_uuid(), @organisationId, @eventId, @leadId, TRUE, TRUE, NOW())`,
      {
        organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
        eventId:        { type: sql.UniqueIdentifier, value: eventId },
        leadId:         { type: sql.UniqueIdentifier, value: result.leadId },
      }
    );
  }

  return result;
}

// ── Profile ──────────────────────────────────────────────────────────────

/**
 * Own-profile view: contact details + most recent appointment status +
 * assigned broker's DISPLAY NAME ONLY (not their contact details — least
 * privilege, matches the "narrow v1" scope decision; the broker reaches
 * out, not the other way round).
 * @param {string} leadId
 */
export async function getPortalProfile(leadId) {
  return executeQueryOne(
    `SELECT
       l.id AS "leadId", l.title, l.firstName AS "firstName", l.lastName AS "lastName",
       l.email, l.mobileNumber AS "mobileNumber",
       ap.status AS "appointmentStatus",
       br.displayName AS "brokerName"
     FROM Lead l
     LEFT JOIN LATERAL (
       SELECT id, status, brokerId FROM Appointment
       WHERE leadId = l.id
       ORDER BY createdAt DESC
       LIMIT 1
     ) ap ON true
     LEFT JOIN "User" br ON ap.brokerId = br.id
     WHERE l.id = @leadId AND l.deletedAt IS NULL AND l.organisationId = @organisationId`,
    {
      leadId:         { type: sql.UniqueIdentifier, value: leadId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * Update own contact details — writes through to Lead directly (not a
 * separate portal-only copy), so staff always see current contact info
 * rather than it silently diverging from what the prospect can see/edit.
 * @param {string} leadId
 * @param {{email?: string, mobileNumber?: string}} data
 * @returns {Promise<boolean>} false if nothing was provided to update
 */
export async function updatePortalProfile(leadId, data) {
  const sets = [];
  const params = {
    leadId:         { type: sql.UniqueIdentifier, value: leadId },
    organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
  };
  if (data.email !== undefined) {
    sets.push('email = @email');
    params.email = { type: sql.NVarChar(255), value: data.email };
  }
  if (data.mobileNumber !== undefined) {
    sets.push('mobileNumber = @mobileNumber');
    params.mobileNumber = { type: sql.NVarChar(20), value: data.mobileNumber };
  }
  if (sets.length === 0) return false;

  await executeQuery(
    `UPDATE Lead SET ${sets.join(', ')}, updatedAt = NOW()
     WHERE id = @leadId AND deletedAt IS NULL AND organisationId = @organisationId`,
    params
  );

  // Keep the portal login email in step with the contact email — letting
  // them diverge would mean the prospect's own login stops matching what
  // they see as their contact address, confusing rather than protective.
  if (data.email !== undefined) {
    await executeQuery(
      `UPDATE LeadPortalAccount SET email = @email, updatedAt = NOW() WHERE leadId = @leadId`,
      { leadId: params.leadId, email: params.email }
    );
  }

  return true;
}

// ── Check-in ─────────────────────────────────────────────────────────────

/**
 * Confirms attendance for the event whose QR was just scanned — the
 * self-service equivalent of eventService.setAttendeeAttendance(), same
 * columns. Rejects if the prospect never RSVP'd for this event (matches
 * Mark's own framing: "mark that attendee as present... if they have
 * RSVP'ed"). Idempotent if already checked in.
 * @param {string} leadId
 * @param {string} qrToken
 * @returns {Promise<{ok: true, alreadyCheckedIn: boolean} | {ok: false, error: string}>}
 */
export async function checkinProspect(leadId, qrToken) {
  const event = await getEventForRegistration(qrToken);
  if (!event) return { ok: false, error: 'event_not_found' };
  if (event.status !== 'Active') return { ok: false, error: 'event_not_active' };

  const attendee = await executeQueryOne(
    `SELECT id, attended FROM EventAttendee
     WHERE eventId = @eventId AND leadId = @leadId AND deletedAt IS NULL`,
    {
      eventId: { type: sql.UniqueIdentifier, value: event.id },
      leadId:  { type: sql.UniqueIdentifier, value: leadId },
    }
  );
  if (!attendee) return { ok: false, error: 'not_registered' };
  if (attendee.attended) return { ok: true, alreadyCheckedIn: true };

  await executeQuery(
    `UPDATE EventAttendee SET attended = TRUE, attendedAt = NOW() WHERE id = @id`,
    { id: { type: sql.UniqueIdentifier, value: attendee.id } }
  );
  return { ok: true, alreadyCheckedIn: false, eventName: event.name };
}
