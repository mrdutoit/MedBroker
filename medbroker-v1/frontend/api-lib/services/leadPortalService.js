/**
 * services/leadPortalService.js — NEW, 24 Jul 2026.
 * Self-service backend for prospects/attendees — registration (matches or
 * creates a Lead, the same dedup as eventService.addAttendee), login,
 * own-profile view/edit, and venue check-in — against Event.checkinToken,
 * a SEPARATE token from the registration qrToken (Mark's explicit
 * requirement, added same day as this file — see models/event.js's
 * header for why: qrToken gets shared before the event, so using it for
 * attendance too would mean anyone who ever received that link could
 * "check in" from anywhere with no proof they were at the venue).
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
 * Same shape as getEventForRegistration but keyed on the SEPARATE
 * checkinToken — used by the attendance-confirmation landing page
 * (/portal/checkin/:checkinToken) and the walk-in signup flow.
 * @param {string} checkinToken
 * @returns {Promise<Object|null>}
 */
export async function getEventForCheckin(checkinToken) {
  return executeQueryOne(
    `SELECT id, name, eventDate AS "eventDate", university, venue, status,
            createdAt AS "createdAt"
     FROM Event
     WHERE checkinToken = @checkinToken AND deletedAt IS NULL AND organisationId = @organisationId`,
    {
      checkinToken:   { type: sql.UniqueIdentifier, value: checkinToken },
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
 * Every event this Lead has an EventAttendee row for — surfaces on the
 * dashboard (Mark's ask, 24 Jul 2026) so a returning prospect can see
 * their RSVP/walk-in status per event without re-scanning each one's
 * attendance code. A Lead having more than one row here is a real,
 * already-supported case: checkinProspect() creates a walk-in row for a
 * SECOND event under an already-authenticated Lead's existing identity
 * (§48) — the "no cross-event reuse" rule only applies to fresh
 * registration, not to an already-logged-in person's walk-in check-in.
 * @param {string} leadId
 * @returns {Promise<Array>} [{ eventId, eventName, eventDate, university, venue, rsvp, attended, attendedAt }]
 */
export async function getPortalEvents(leadId) {
  return executeQuery(
    `SELECT
       e.id AS "eventId", e.name AS "eventName", e.eventDate AS "eventDate",
       e.university, e.venue,
       ea.rsvp, ea.attended, ea.attendedAt AS "attendedAt"
     FROM EventAttendee ea
     JOIN Event e ON ea.eventId = e.id
     WHERE ea.leadId = @leadId AND ea.deletedAt IS NULL
     ORDER BY e.eventDate DESC`,
    { leadId: { type: sql.UniqueIdentifier, value: leadId } }
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

// ── Claim access for an existing Lead, outside any event context ───────────

export async function getPortalAccountByLeadId(leadId) {
  return executeQueryOne(
    `SELECT id FROM LeadPortalAccount WHERE leadId = @leadId AND deletedAt IS NULL`,
    { leadId: { type: sql.UniqueIdentifier, value: leadId } }
  );
}

/**
 * The fix for the gap Mark found: a manually-added attendee (Add
 * Attendee, no portal account created) had no way to get portal access
 * once no event was currently active — registerProspect() above is
 * entirely event-anchored. This matches an EXISTING Lead by email AND
 * dateOfBirth (both must match exactly) and creates the missing
 * LeadPortalAccount for it. Deliberately never creates a new Lead on a
 * miss — returns the same generic failure either way (no match at all,
 * or matched but wrong DOB) so this can't be used to enumerate which
 * emails exist in the system.
 * @param {string} email
 * @param {string} dateOfBirth - 'YYYY-MM-DD'
 * @param {string} passwordHash
 * @returns {Promise<{leadId: string, portalAccountId: string}>}
 */
export async function activatePortalAccount(email, dateOfBirth, passwordHash) {
  const existingAccount = await getPortalAccountByEmail(email);
  if (existingAccount) {
    throw { status: 409, message: 'An account already exists for this email — log in instead.' };
  }

  const lead = await executeQueryOne(
    `SELECT id FROM Lead
     WHERE email = @email AND dateOfBirth = @dateOfBirth
       AND deletedAt IS NULL AND organisationId = @organisationId`,
    {
      email:          { type: sql.NVarChar(255), value: email },
      dateOfBirth:    { type: sql.Date, value: dateOfBirth },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
  // Generic failure either way — no match, or matched a different Lead's
  // DOB — so this endpoint can't be used to confirm a given email exists.
  if (!lead) {
    throw { status: 401, message: "We couldn't verify those details. Check your email and date of birth match what you registered with, or contact your broker." };
  }

  // A Lead could theoretically already have an account under a DIFFERENT
  // email if they've since changed their contact email elsewhere without
  // going through the portal — belt-and-braces check by leadId as well as
  // by email above (updatePortalProfile keeps these in step in the normal
  // flow, but this path doesn't assume that's the only way an account
  // could exist).
  const existingByLead = await getPortalAccountByLeadId(lead.id);
  if (existingByLead) {
    throw { status: 409, message: 'An account already exists for this Lead — log in instead.' };
  }

  const account = await executeQueryOne(
    `INSERT INTO LeadPortalAccount (id, organisationId, leadId, email, passwordHash, passwordSetAt)
     VALUES (gen_random_uuid(), @organisationId, @leadId, @email, @passwordHash, NOW())
     RETURNING id`,
    {
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      leadId:         { type: sql.UniqueIdentifier, value: lead.id },
      email:          { type: sql.NVarChar(255), value: email },
      passwordHash:   { type: sql.NVarChar(sql.MAX), value: passwordHash },
    }
  );

  return { leadId: lead.id, portalAccountId: account.id };
}

// ── Check-in ─────────────────────────────────────────────────────────────

/**
 * Confirms attendance for the event whose ATTENDANCE code was just
 * scanned (an already-authenticated prospect) — same columns as
 * eventService.setAttendeeAttendance(). No longer rejects someone with no
 * prior EventAttendee row (that was the original behaviour — changed
 * 24 Jul 2026, Mark's explicit walk-in requirement): if they never
 * RSVP'd for THIS event, this creates a walk-in row (rsvp=false) for
 * their existing, already-authenticated Lead identity rather than
 * turning them away. Idempotent if already checked in either way.
 * @param {string} leadId
 * @param {string} checkinToken
 * @returns {Promise<{ok: true, alreadyCheckedIn: boolean, attendanceType: 'rsvp'|'walkin', eventName: string} | {ok: false, error: string}>}
 */
export async function checkinProspect(leadId, checkinToken) {
  const event = await getEventForCheckin(checkinToken);
  if (!event) return { ok: false, error: 'event_not_found' };
  if (event.status !== 'Active') return { ok: false, error: 'event_not_active' };

  const attendee = await executeQueryOne(
    `SELECT id, rsvp, attended FROM EventAttendee
     WHERE eventId = @eventId AND leadId = @leadId AND deletedAt IS NULL`,
    {
      eventId: { type: sql.UniqueIdentifier, value: event.id },
      leadId:  { type: sql.UniqueIdentifier, value: leadId },
    }
  );

  if (attendee) {
    const attendanceType = attendee.rsvp ? 'rsvp' : 'walkin';
    if (attendee.attended) return { ok: true, alreadyCheckedIn: true, attendanceType, eventName: event.name };
    await executeQuery(
      `UPDATE EventAttendee SET attended = TRUE, attendedAt = NOW() WHERE id = @id`,
      { id: { type: sql.UniqueIdentifier, value: attendee.id } }
    );
    return { ok: true, alreadyCheckedIn: false, attendanceType, eventName: event.name };
  }

  // No EventAttendee row for THIS event — a walk-in under their existing,
  // already-authenticated Lead identity (not a new Lead: "treated as a
  // new Lead" applies to someone with NO account at all — walkInCheckin
  // below — not to a real, already-logged-in person).
  await executeQuery(
    `INSERT INTO EventAttendee (id, organisationId, eventId, leadId, rsvp, attended, attendedAt, popiConsent, registeredAt)
     VALUES (gen_random_uuid(), @organisationId, @eventId, @leadId, FALSE, TRUE, NOW(), TRUE, NOW())`,
    {
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      eventId:        { type: sql.UniqueIdentifier, value: event.id },
      leadId:         { type: sql.UniqueIdentifier, value: leadId },
    }
  );
  return { ok: true, alreadyCheckedIn: false, attendanceType: 'walkin', eventName: event.name };
}

/**
 * Walk-in with NO portal account at all — on-the-spot signup at the
 * attendance-QR landing page. Reuses registerProspect() for the actual
 * Lead/LeadPortalAccount creation (same required fields, same dedup —
 * "quick" means fewer steps, not a lighter-weight record), then inserts
 * the EventAttendee row directly with rsvp=false — they never
 * pre-registered, this only confirms they were physically at the venue.
 * @param {string} checkinToken
 * @param {Object} data - validated PortalWalkInSchema data (minus checkinToken)
 * @param {string} passwordHash
 * @returns {Promise<{leadId: string, portalAccountId: string, createdNewLead: boolean, eventName: string}>}
 */
export async function walkInCheckin(checkinToken, data, passwordHash) {
  const event = await getEventForCheckin(checkinToken);
  if (!event) throw { status: 404, message: 'This check-in code is not valid.' };
  if (event.status !== 'Active') throw { status: 400, message: 'This event is not currently open for check-in.' };

  const result = await registerProspect(data, passwordHash); // throws 409 if an account already exists for this email

  await executeQuery(
    `INSERT INTO EventAttendee (id, organisationId, eventId, leadId, rsvp, attended, attendedAt, popiConsent, registeredAt)
     VALUES (gen_random_uuid(), @organisationId, @eventId, @leadId, FALSE, TRUE, NOW(), TRUE, NOW())`,
    {
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      eventId:        { type: sql.UniqueIdentifier, value: event.id },
      leadId:         { type: sql.UniqueIdentifier, value: result.leadId },
    }
  );

  return { ...result, eventName: event.name };
}
