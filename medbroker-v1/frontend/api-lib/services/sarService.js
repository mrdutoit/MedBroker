/**
 * services/sarService.js — NEW (§79). Two distinct concerns:
 *   - Tracking the request itself (who asked, when, status, due date)
 *   - Compiling everything MedBroker actually holds about that Lead into
 *     one structured export (compileSubjectData) — the part that
 *     actually fulfils the request
 *
 * UPDATED §125 (5 Aug 2026) — several fixes and additions from Mark's
 * own testing:
 *   - FIXED a real bug: every writeAuditLog() call in this file used to
 *     pass changeDetail as an ALREADY-JSON.stringify()'d string, but
 *     writeAuditLog (auditService.js) does that internally — the result
 *     was a double-encoded string stored in the database. Read back for
 *     display, it comes out as a plain string, not an object, and
 *     AppAdmin.jsx's formatChangeDetail() (§103) bails out immediately
 *     on anything that isn't an object. Not a rendering gap — one wrong
 *     line, repeated three times in this file. Fixed by passing plain
 *     objects, matching how every other writeAuditLog() caller in this
 *     codebase already does it.
 *   - Every SAR action now ALSO writes a second audit entry scoped to
 *     the SAR itself (entityType: 'SubjectAccessRequest'), alongside the
 *     existing Lead-scoped one (kept — a SAR being processed is part of
 *     the Lead's own history too, and compileSubjectData's auditTrail
 *     reads from the Lead-scoped entries). Two entries per action,
 *     deliberately: one feeds the subject's own compiled export, the
 *     other feeds the new per-SAR audit view (auditService.listAuditLog,
 *     called directly from sarHandlers.js — no bespoke query needed) —
 *     genuinely different audiences for the same event.
 *   - LOCKING: once a SAR's status is Fulfilled or Rejected, nothing
 *     about it can change — no further status change, no reassignment,
 *     no new comments. assertNotLocked() is the single place this rule
 *     lives; every mutating function below calls it first.
 *   - Assignment (assignSarRequest) + a notes thread (SarComment,
 *     mirroring TaskComment exactly) + auto status transition on first
 *     export (markInProgressOnFirstExport, called from sarHandlers.js).
 */
import { executeQuery, executeQueryOne, sql } from './db.js';
import { resolveOrganisationId } from '../context/tenant.js';
import { decrypt } from './encryption.js';
import { writeAuditLog } from './auditService.js';
import { createNotification } from './notificationService.js';

const SAR_SELECT = `
  sar.id, sar.leadId AS "leadId", sar.requestorName AS "requestorName",
  sar.requestorEmail AS "requestorEmail", sar.receivedAt AS "receivedAt",
  sar.dueDate AS "dueDate", sar.status, sar.notes,
  sar.fulfilledAt AS "fulfilledAt", sar.fulfilledById AS "fulfilledById",
  sar.assignedToId AS "assignedToId",
  sar.createdById AS "createdById", sar.createdAt AS "createdAt", sar.updatedAt AS "updatedAt",
  CONCAT_WS(' ', l.title, l.firstName, l.lastName) AS "leadName",
  cu.displayName AS "createdByName",
  fu.displayName AS "fulfilledByName",
  au.displayName AS "assignedToName"`;

const SAR_JOINS = `
  FROM SubjectAccessRequest sar
  LEFT JOIN Lead l    ON sar.leadId = l.id
  LEFT JOIN "User" cu ON sar.createdById = cu.id
  LEFT JOIN "User" fu ON sar.fulfilledById = fu.id
  LEFT JOIN "User" au ON sar.assignedToId = au.id`;

/**
 * Once Fulfilled or Rejected, a SAR is locked — no further status change,
 * reassignment, or new comment. Mark's own framing: a fulfilled/rejected
 * request is a closed, POPIA-relevant record; nothing about processing
 * it should still be editable after the fact.
 * @param {string} id
 * @returns {Promise<Object>} the existing SAR row (callers need it anyway)
 */
async function assertNotLocked(id) {
  const existing = await getSarRequestById(id);
  if (!existing) throw { status: 404, message: 'Request not found' };
  if (existing.status === 'Fulfilled' || existing.status === 'Rejected') {
    throw { status: 409, message: `This request is ${existing.status.toLowerCase()} and locked — no further changes can be made.` };
  }
  return existing;
}

/**
 * @param {{page?: number, pageSize?: number, status?: string}} params
 */
export async function listSarRequests({ page = 1, pageSize = 25, status } = {}) {
  const organisationId = resolveOrganisationId();
  const offset = (page - 1) * pageSize;
  let whereClause = 'WHERE sar.organisationId = @organisationId';
  const params = { organisationId: { type: sql.UniqueIdentifier, value: organisationId } };
  if (status) {
    whereClause += ' AND sar.status = @status';
    params.status = { type: sql.NVarChar(20), value: status };
  }

  const [rows, [{ total }]] = await Promise.all([
    executeQuery(
      `SELECT ${SAR_SELECT} ${SAR_JOINS} ${whereClause}
       ORDER BY sar.receivedAt DESC, sar.createdAt DESC
       LIMIT @pageSize OFFSET @offset`,
      { ...params, pageSize: { type: sql.Int, value: pageSize }, offset: { type: sql.Int, value: offset } }
    ),
    executeQuery(`SELECT COUNT(*)::int AS total FROM SubjectAccessRequest sar ${whereClause}`, params),
  ]);

  return { requests: rows, total, page, pageSize };
}

/** @param {string} id */
export async function getSarRequestById(id) {
  return executeQueryOne(
    `SELECT ${SAR_SELECT} ${SAR_JOINS} WHERE sar.id = @id AND sar.organisationId = @organisationId`,
    { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
}

/**
 * Shared by createSarRequest (new, §128) and assignSarRequest (§125) —
 * both need the identical "is this a real, active Admin or GlobalAdmin"
 * check before setting assignedToId. Admin AND GlobalAdmin, deliberately
 * not GlobalAdmin-only — Mark's own explicit instruction, and matches
 * every SAR route's own requireRole(['Admin', 'GlobalAdmin']) gate
 * (sarHandlers.js) exactly: whoever can already SEE this feature is who
 * can be assigned work within it. Supervisor is NOT included — checked
 * directly rather than assumed: App Admin (which hosts Data Requests and
 * Audit Log) is gated to Admin/GlobalAdmin at both the route level
 * (App.jsx's isAdminOrAbove) and independently on every single backend
 * endpoint, so a Supervisor assignee would be handed a request for a
 * page they structurally cannot open at all. Extending that access is a
 * separate, deliberate decision Mark would need to make explicitly, not
 * a side effect of this fix.
 * @param {string} userId
 * @param {string} organisationId
 * @returns {Promise<{id: string, displayName: string, role: string}|null>}
 */
async function getValidSarAssignee(userId, organisationId) {
  const user = await executeQueryOne(
    `SELECT id, displayName AS "displayName", role FROM "User"
     WHERE id = @id AND isActive = TRUE AND deletedAt IS NULL AND organisationId = @organisationId`,
    { id: { type: sql.UniqueIdentifier, value: userId }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );
  if (!user || !['Admin', 'GlobalAdmin'].includes(user.role)) return null;
  return user;
}

/**
 * @param {Object} data - CreateSarRequestSchema shape
 * @param {string} createdById
 */
export async function createSarRequest(data, createdById) {
  const organisationId = resolveOrganisationId();

  // §128 — assignment at creation time, not only afterward (Mark's own
  // request). Validated the same way assignSarRequest validates it —
  // shared helper above, not a second copy of the same check.
  let assignee = null;
  if (data.assignedToId) {
    assignee = await getValidSarAssignee(data.assignedToId, organisationId);
    if (!assignee) throw { status: 400, message: 'SAR requests can only be assigned to an Admin or GlobalAdmin user' };
  }

  const newId = crypto.randomUUID();
  await executeQuery(
    `INSERT INTO SubjectAccessRequest (
       id, organisationId, leadId, requestorName, requestorEmail,
       receivedAt, dueDate, notes, assignedToId, createdById, createdAt, updatedAt
     ) VALUES (
       @id, @organisationId, @leadId, @requestorName, @requestorEmail,
       @receivedAt, @dueDate, @notes, @assignedToId, @createdById, NOW(), NOW()
     )`,
    {
      id:             { type: sql.UniqueIdentifier, value: newId },
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      leadId:         { type: sql.UniqueIdentifier, value: data.leadId },
      requestorName:  { type: sql.NVarChar(200),    value: data.requestorName },
      requestorEmail: { type: sql.NVarChar(255),    value: data.requestorEmail },
      receivedAt:     { type: sql.Date,             value: data.receivedAt },
      dueDate:        { type: sql.Date,             value: data.dueDate ?? null },
      notes:          { type: sql.NVarChar(2000),   value: data.notes ?? null },
      assignedToId:   { type: sql.UniqueIdentifier, value: data.assignedToId ?? null },
      createdById:    { type: sql.UniqueIdentifier, value: createdById },
    }
  );

  const changeDetail = { sarId: newId, requestorEmail: data.requestorEmail, assignedToId: data.assignedToId ?? null };
  await writeAuditLog({
    entityType: 'Lead', entityId: data.leadId, action: 'SarRequestCreated',
    performedById: createdById, changeDetail,
  });
  await writeAuditLog({
    entityType: 'SubjectAccessRequest', entityId: newId, action: 'SarRequestCreated',
    performedById: createdById, changeDetail: { ...changeDetail, leadId: data.leadId, requestorName: data.requestorName },
  });

  if (assignee) {
    const leadName = await executeQueryOne(
      `SELECT CONCAT_WS(' ', title, firstName, lastName) AS "leadName" FROM Lead WHERE id = @leadId AND organisationId = @organisationId`,
      { leadId: { type: sql.UniqueIdentifier, value: data.leadId }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
    );
    await createNotification({
      recipientId: assignee.id,
      type:        'SarAssigned',
      title:       `SAR assigned — ${leadName?.leadName ?? 'a lead'}`,
      body:        `You've been assigned a POPIA Subject Access Request for ${leadName?.leadName ?? 'a lead'}, due ${data.dueDate ?? 'no date set'}.`,
      entityType:  'SubjectAccessRequest',
      entityId:    newId,
    });
  }

  return newId;
}

/**
 * @param {string} id
 * @param {{status: string, notes?: string}} data
 * @param {string} performedById
 */
export async function updateSarStatus(id, data, performedById) {
  const existing = await assertNotLocked(id);

  // §128 (5 Aug 2026) — Mark's explicit rule: status only ever moves
  // forward, never back — once InProgress, it can't return to Received.
  // Fulfilled/Rejected are already covered by assertNotLocked() above
  // (both are terminal, nothing can change once there, including a move
  // to the OTHER terminal state); this specifically closes the gap
  // between Received and InProgress, which assertNotLocked doesn't
  // touch since neither of those is a locked state on its own.
  // Fulfilled and Rejected are equal rank, not ordered against each
  // other — reaching either one is what triggers the lock, not a
  // meaningful order between them.
  const STATUS_RANK = { Received: 0, InProgress: 1, Fulfilled: 2, Rejected: 2 };
  if (STATUS_RANK[data.status] <= STATUS_RANK[existing.status]) {
    throw { status: 409, message: `Status cannot move from ${existing.status} back to ${data.status} — it can only move forward.` };
  }

  const isFulfilled = data.status === 'Fulfilled';
  await executeQuery(
    `UPDATE SubjectAccessRequest
     SET status = @status,
         notes = COALESCE(@notes, notes),
         fulfilledAt = CASE WHEN @isFulfilled THEN NOW() ELSE fulfilledAt END,
         fulfilledById = CASE WHEN @isFulfilled THEN @performedById ELSE fulfilledById END,
         updatedAt = NOW()
     WHERE id = @id AND organisationId = @organisationId`,
    {
      id:            { type: sql.UniqueIdentifier, value: id },
      organisationId:{ type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      status:        { type: sql.NVarChar(20),     value: data.status },
      notes:         { type: sql.NVarChar(2000),   value: data.notes ?? null },
      isFulfilled:   { type: sql.Bit,               value: isFulfilled },
      performedById: { type: sql.UniqueIdentifier, value: performedById },
    }
  );

  const changeDetail = { sarId: id, previousStatus: existing.status, newStatus: data.status };
  await writeAuditLog({
    entityType: 'Lead', entityId: existing.leadId, action: 'SarStatusChanged',
    performedById, changeDetail,
  });
  await writeAuditLog({
    entityType: 'SubjectAccessRequest', entityId: id, action: 'SarStatusChanged',
    performedById, changeDetail,
  });
}

/**
 * The claim-style auto-transition — first export on a still-Received
 * request moves it to InProgress, same "the system reflects that work
 * has actually started" reasoning a broker claiming an appointment
 * already gets. Deliberately a no-op for anything NOT currently
 * 'Received' (already InProgress: nothing to do; Fulfilled/Rejected:
 * locked, assertNotLocked below would reject it anyway) — re-exporting
 * an already-processed request never touches status.
 * @param {string} id
 * @param {string} performedById
 */
export async function markInProgressOnFirstExport(id, performedById) {
  const existing = await getSarRequestById(id);
  if (!existing || existing.status !== 'Received') return;
  await updateSarStatus(id, { status: 'InProgress' }, performedById);
}

/**
 * §125 — Admin/GlobalAdmin only (enforced by the caller, sarHandlers.js,
 * via requireRole + a role check on the target user below — this
 * function trusts its caller already validated assignedToId is a real
 * Admin/GlobalAdmin, but re-checks the target user's role directly
 * anyway rather than trusting the caller alone, same defense-in-depth
 * reasoning handleLogin's auth.sso.disableLocalFallback check uses).
 * Fires a notification to the new assignee — same createNotification()
 * every other assignment-style action in this app already uses.
 * @param {string} id
 * @param {string|null} assignedToId - null explicitly unassigns
 * @param {string} performedById
 */
export async function assignSarRequest(id, assignedToId, performedById) {
  const existing = await assertNotLocked(id);
  const organisationId = resolveOrganisationId();

  if (assignedToId) {
    const assignee = await getValidSarAssignee(assignedToId, organisationId);
    if (!assignee) {
      throw { status: 400, message: 'SAR requests can only be assigned to an Admin or GlobalAdmin user' };
    }
  }

  await executeQuery(
    `UPDATE SubjectAccessRequest SET assignedToId = @assignedToId, updatedAt = NOW()
     WHERE id = @id AND organisationId = @organisationId`,
    {
      id:             { type: sql.UniqueIdentifier, value: id },
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      assignedToId:   { type: sql.UniqueIdentifier, value: assignedToId },
    }
  );

  const changeDetail = { sarId: id, assignedToId, leadName: existing.leadName };
  await writeAuditLog({
    entityType: 'Lead', entityId: existing.leadId, action: 'SarAssigned',
    performedById, changeDetail,
  });
  await writeAuditLog({
    entityType: 'SubjectAccessRequest', entityId: id, action: 'SarAssigned',
    performedById, changeDetail,
  });

  if (assignedToId) {
    await createNotification({
      recipientId: assignedToId,
      type:        'SarAssigned',
      title:       `SAR assigned — ${existing.leadName}`,
      body:        `You've been assigned a POPIA Subject Access Request for ${existing.leadName}, due ${existing.dueDate ?? 'no date set'}.`,
      entityType:  'SubjectAccessRequest',
      entityId:    id,
    });
  }
}

/**
 * Oldest first — a discussion thread reads top-to-bottom in the order
 * things were said. Exact mirror of taskService.listComments().
 * @param {string} sarId
 */
export async function listSarComments(sarId) {
  return executeQuery(
    `SELECT sc.id, sc.body, sc.createdAt AS "createdAt",
            sc.authorId AS "authorId", au.displayName AS "authorName"
     FROM SarComment sc
     LEFT JOIN "User" au ON sc.authorId = au.id
     WHERE sc.sarId = @sarId AND sc.organisationId = @organisationId
     ORDER BY sc.createdAt ASC`,
    {
      sarId:          { type: sql.UniqueIdentifier, value: sarId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * @param {string} sarId
 * @param {string} authorId
 * @param {string} body
 * @returns {Promise<string>} new comment id
 */
export async function addSarComment(sarId, authorId, body) {
  await assertNotLocked(sarId);
  const newId = crypto.randomUUID();
  await executeQuery(
    `INSERT INTO SarComment (id, organisationId, sarId, authorId, body, createdAt)
     VALUES (@id, @organisationId, @sarId, @authorId, @body, NOW())`,
    {
      id:             { type: sql.UniqueIdentifier, value: newId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      sarId:          { type: sql.UniqueIdentifier, value: sarId },
      authorId:       { type: sql.UniqueIdentifier, value: authorId },
      body:           { type: sql.NVarChar(2000),   value: body },
    }
  );
  return newId;
}

/**
 * The actual fulfilment step — compiles everything MedBroker holds
 * about one Lead into a single structured object: the Lead record
 * itself (ID number DECRYPTED here specifically, since a subject
 * requesting their own data needs to actually see it, not the
 * ciphertext), every call attempt, every appointment with its meeting
 * history, every task linked to the lead, and the lead's own audit
 * trail (who accessed/changed their data — POPIA's accountability angle,
 * not just the raw data itself).
 *
 * Deliberately does NOT include SarComment or assignedToId — those are
 * MedBroker's own internal processing metadata about handling the
 * request, not data MedBroker holds ABOUT the subject. A data subject
 * asking "what do you know about me" doesn't need to see staff's
 * internal notes about who's working their ticket.
 * @param {string} leadId
 */
export async function compileSubjectData(leadId) {
  const organisationId = resolveOrganisationId();
  const orgParam = { organisationId: { type: sql.UniqueIdentifier, value: organisationId } };
  const leadParam = { leadId: { type: sql.UniqueIdentifier, value: leadId } };

  const lead = await executeQueryOne(
    `SELECT id, title, firstName AS "firstName", lastName AS "lastName",
            dateOfBirth AS "dateOfBirth", idNumberEncrypted AS "idNumberEncrypted",
            email, mobileNumber AS "mobileNumber", whatsappNumber AS "whatsappNumber",
            universityAttended AS "universityAttended", yearOfAttendance AS "yearOfAttendance",
            degreeAttained AS "degreeAttained", occupation, hospitalOrPractice AS "hospitalOrPractice",
            existingCover AS "existingCover", currentInsurer AS "currentInsurer", policies,
            medicalAid AS "medicalAid", medicalAidProvider AS "medicalAidProvider",
            pipelineStatus AS "pipelineStatus", createdAt AS "createdAt"
     FROM Lead WHERE id = @leadId AND organisationId = @organisationId`,
    { ...leadParam, ...orgParam }
  );
  if (!lead) return null;

  // Decrypt the ID number specifically for this export — the one place
  // in the app where showing the plaintext to a staff member is exactly
  // the point, not a leak. Every other view of a Lead never does this.
  lead.idNumber = lead.idNumberEncrypted ? await decrypt(lead.idNumberEncrypted) : null;
  delete lead.idNumberEncrypted;

  const [callAttempts, appointments, tasks, auditTrail] = await Promise.all([
    executeQuery(
      `SELECT ca.id, ca.outcome, ca.callTime AS "callTime", ca.notes,
              ca.followUpDateTime AS "followUpDateTime", au.displayName AS "loggedBy"
       FROM CallAttempt ca LEFT JOIN "User" au ON ca.agentId = au.id
       WHERE ca.leadId = @leadId AND ca.organisationId = @organisationId
       ORDER BY ca.callTime ASC`,
      { ...leadParam, ...orgParam }
    ),
    executeQuery(
      `SELECT id, status, firstAppointmentDate AS "date", firstAppointmentTime AS "time",
              productsInterestedIn AS "productsInterestedIn", customerSigned AS "customerSigned",
              meeting1Status AS "meeting1Status", meeting1Feedback AS "meeting1Feedback",
              meeting2Status AS "meeting2Status", meeting2Feedback AS "meeting2Feedback",
              meeting3Status AS "meeting3Status", meeting3Feedback AS "meeting3Feedback",
              createdAt AS "createdAt"
       FROM Appointment WHERE leadId = @leadId AND organisationId = @organisationId
       ORDER BY createdAt ASC`,
      { ...leadParam, ...orgParam }
    ),
    executeQuery(
      `SELECT id, type, title, detail, isComplete AS "isComplete", createdAt AS "createdAt"
       FROM Task WHERE entityType = 'Lead' AND entityId = @leadId AND organisationId = @organisationId
       ORDER BY createdAt ASC`,
      { ...leadParam, ...orgParam }
    ),
    executeQuery(
      `SELECT al.action, al.performedAt AS "performedAt", pu.displayName AS "performedBy"
       FROM AuditLog al LEFT JOIN "User" pu ON al.performedById = pu.id
       WHERE al.entityType = 'Lead' AND al.entityId = @leadId AND al.organisationId = @organisationId
       ORDER BY al.performedAt ASC`,
      { ...leadParam, ...orgParam }
    ),
  ]);

  return { lead, callAttempts, appointments, tasks, auditTrail, compiledAt: new Date().toISOString() };
}
