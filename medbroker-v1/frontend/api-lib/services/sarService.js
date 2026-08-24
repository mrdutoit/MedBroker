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
import { decrypt, decryptBoolean } from './encryption.js';
import { writeAuditLog, listAuditLogForLead } from './auditService.js';
import { createNotification } from './notificationService.js';
import { createTask, completeOpenSarTask } from './taskService.js'; // §12b, 21 Aug 2026
// §12a (20 Aug 2026) — the actual Lead-side effects of a Deletion
// request live in leadService.js (that's where the Lead's own PII
// columns and retention logic belong); this file only orchestrates
// WHICH of the two happens and records that it did. One-directional
// import — leadService.js has no dependency back on this file.
import { getLeadRetentionPosition, eraseLeadPII, restrictLead } from './leadService.js';
// 24 Aug 2026 — real gap Mark found live-testing: eraseLeadPII()/
// restrictLead() only ever touched the Lead row; an open Appointment kept
// its live status and kept showing in every Active view indefinitely.
// See closeOpenAppointmentsForErasure()'s own header comment
// (appointmentService.js) for the full reasoning.
import { closeOpenAppointmentsForErasure } from './appointmentService.js';

const SAR_SELECT = `
  sar.id, sar.leadId AS "leadId", sar.requestorName AS "requestorName",
  sar.requestorEmail AS "requestorEmail", sar.receivedAt AS "receivedAt",
  sar.dueDate AS "dueDate", sar.status, sar.requestType AS "requestType", sar.notes,
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
/**
 * §12b (21 Aug 2026) — explicit UTC arithmetic, not new Date(str).setDate()
 * with local getters/setters: this app's own established caution around
 * date/timezone handling (see todayLocalDateString() elsewhere in this
 * codebase for the mirror-image version of the same lesson) applies here
 * too — a date-only string like '2026-08-21' parses as UTC midnight, and
 * mixing that with LOCAL getDate()/setDate() risks landing on the wrong
 * calendar day depending on the server's own timezone. Vercel Functions
 * run in UTC by default, so this would likely be safe either way in
 * practice, but a POPIA response deadline is exactly the kind of value
 * worth being explicit about rather than relying on an assumption that
 * happens to hold today.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} days
 * @returns {string} YYYY-MM-DD, days later
 */
function addDaysToDateString(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

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
  // Unconditional now (21 Aug 2026, Mark's explicit request) — assignedToId
  // is required by CreateSarRequestSchema, so this always runs; the
  // `if (data.assignedToId)` guard that used to wrap this is gone, along
  // with the "was it even assigned" question it used to answer. A real,
  // active Admin/GlobalAdmin id is now a hard precondition of a SAR
  // existing at all, not an afterthought.
  const assignee = await getValidSarAssignee(data.assignedToId, organisationId);
  if (!assignee) throw { status: 400, message: 'SAR requests can only be assigned to an Admin or GlobalAdmin user' };

  // §12b (21 Aug 2026), Mark's explicit request — dueDate is no longer
  // client-supplied at all (removed from CreateSarRequestSchema entirely);
  // always computed here as receivedAt + 30 days, never editable
  // afterward (no UPDATE path anywhere touches this column). 30 days is
  // the standard POPIA/PAIA access-request response window — POPIA's own
  // s23 doesn't state an exact figure directly, but s23(6) applies PAIA's
  // ss18/53 to s23 requests, and PAIA's own 30-day response period is the
  // widely-adopted practical standard South African organisations publish
  // in their own PAIA/POPIA manuals for this exact request type. Applied
  // uniformly to both Access and Deletion requests here, not just Access
  // — deliberate simplification for a single due-date field, flagged
  // rather than silently assumed; POPIA's deletion right (s24(1)(b))
  // doesn't state its own explicit figure as clearly as PAIA's does for
  // access, so treating them the same is this codebase's own reasonable
  // interpretation, not a directly cited statutory number for the
  // Deletion path specifically.
  const dueDate = addDaysToDateString(data.receivedAt, 30);

  const newId = crypto.randomUUID();
  await executeQuery(
    `INSERT INTO SubjectAccessRequest (
       id, organisationId, leadId, requestorName, requestorEmail,
       receivedAt, dueDate, requestType, notes, assignedToId, createdById, createdAt, updatedAt
     ) VALUES (
       @id, @organisationId, @leadId, @requestorName, @requestorEmail,
       @receivedAt, @dueDate, @requestType, @notes, @assignedToId, @createdById, NOW(), NOW()
     )`,
    {
      id:             { type: sql.UniqueIdentifier, value: newId },
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      leadId:         { type: sql.UniqueIdentifier, value: data.leadId },
      requestorName:  { type: sql.NVarChar(200),    value: data.requestorName },
      requestorEmail: { type: sql.NVarChar(255),    value: data.requestorEmail },
      receivedAt:     { type: sql.Date,             value: data.receivedAt },
      dueDate:        { type: sql.Date,             value: dueDate },
      requestType:    { type: sql.NVarChar(20),     value: data.requestType ?? 'Access' },
      notes:          { type: sql.NVarChar(2000),   value: data.notes ?? null },
      assignedToId:   { type: sql.UniqueIdentifier, value: data.assignedToId },
      createdById:    { type: sql.UniqueIdentifier, value: createdById },
    }
  );

  const changeDetail = {
    sarId: newId, requestorEmail: data.requestorEmail,
    requestType: data.requestType ?? 'Access', assignedToId: data.assignedToId,
  };
  // §131 (5 Aug 2026) — CORRECTED: this used to ALSO write an
  // entityType: 'Lead' twin of this exact entry, a real duplicate row in
  // a compliance-facing audit table — see auditService.listAuditLogForLead()'s
  // header for the full reasoning. One write now; that function's UNION
  // is what still surfaces this in the Lead's own Change Log and the
  // subject's own compiled export.
  await writeAuditLog({
    entityType: 'SubjectAccessRequest', entityId: newId, action: 'SarRequestCreated',
    performedById: createdById, changeDetail: { ...changeDetail, leadId: data.leadId, requestorName: data.requestorName, dueDate },
  });

  const leadName = await executeQueryOne(
    `SELECT CONCAT_WS(' ', title, firstName, lastName) AS "leadName" FROM Lead WHERE id = @leadId AND organisationId = @organisationId`,
    { leadId: { type: sql.UniqueIdentifier, value: data.leadId }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
  );
  const resolvedLeadName = leadName?.leadName ?? 'a lead';

  await createNotification({
    recipientId: assignee.id,
    type:        'SarAssigned',
    title:       `SAR assigned — ${resolvedLeadName}`,
    body:        `You've been assigned a POPIA Subject Access Request for ${resolvedLeadName}, due ${dueDate}.`,
    entityType:  'SubjectAccessRequest',
    entityId:    newId,
  });

  // §12b (21 Aug 2026), Mark's explicit request — a Task alongside the
  // notification, not instead of it: the notification tells the assignee
  // once, up front; the Task keeps it visible on their own list until
  // it's actually resolved, the same durability a Callback task gives an
  // agent versus a one-off notification alone. createdById deliberately
  // null (system-generated, matching the existing convention every other
  // auto-created task type already follows — see Task.createdById's own
  // schema comment) — the human action here was "create the SAR request",
  // not "create a task"; the task itself is a side effect, not something
  // createdById staff member directly authored.
  // Redirect-only in Tasks.jsx (category 'sar', via type: 'Sar' below) —
  // completed only by completeOpenSarTask(), called from updateSarStatus()
  // when this request reaches Fulfilled or Rejected, never by a direct
  // checkbox tick. Mirrors exactly how a Callback task can only complete
  // via a real logged call, never a direct tick either.
  await createTask({
    assignedToId: data.assignedToId,
    type:         'Sar',
    entityType:   'SubjectAccessRequest',
    entityId:     newId,
    title:        `POPIA ${data.requestType === 'Deletion' ? 'deletion' : 'access'} request — ${resolvedLeadName}`,
    detail:       `Requested by ${data.requestorName}. Due ${dueDate}.`,
    dueAt:        dueDate,
    priority:     'High', // every SAR carries a statutory response deadline — never "Medium" by default
  });

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
  // §131 — single write, see createSarRequest's own comment above for
  // the full reasoning (same fix, same file, three call sites).
  await writeAuditLog({
    entityType: 'SubjectAccessRequest', entityId: id, action: 'SarStatusChanged',
    performedById, changeDetail,
  });

  // §12b (21 Aug 2026) — completes the linked Task (createSarRequest's
  // own createTask() call) the moment this request reaches either
  // terminal state. Both Fulfilled and Rejected trigger it — they're
  // equal rank in STATUS_RANK above precisely because either one means
  // the request is genuinely done, matching the same "either terminal
  // outcome closes the obligation" reasoning already applied to
  // STATUS_RANK itself. This is the single chokepoint every status
  // transition already goes through (manual status changes here,
  // markInProgressOnFirstExport below, executeSarDeletion's own
  // Fulfilled transition) — the task can only ever complete via this
  // path, never a direct checkbox tick (Tasks.jsx's isRedirectOnly).
  if (data.status === 'Fulfilled' || data.status === 'Rejected') {
    await completeOpenSarTask(id);
  }
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
 * §12a (20 Aug 2026) — fulfils a 'Deletion'-type SAR. This is the actual
 * POPIA s24(1)(b)/s14 implementation, not just a status change: it
 * decides, per Lead, whether a live FAIS record-keeping obligation
 * exists (getLeadRetentionPosition, leadService.js) and either erases
 * the Lead's PII immediately (no obligation) or restricts it — locks it
 * out of active processing but leaves the data intact until the FAIS
 * five-year window lapses (an obligation is running).
 *
 * Status outcome, UPDATED 21 Aug 2026 (see the "Erased vs Restricted"
 * comment further down for the full reasoning): a genuinely Erased
 * outcome moves the request straight to Fulfilled — there's no
 * meaningful "close the ticket" step left to do manually once the data
 * is actually gone. Restricted keeps the original behaviour, only
 * reaching InProgress: retained-but-locked isn't the same as done.
 * Only blocked once the request is genuinely locked (Fulfilled/Rejected
 * — assertNotLocked) or isn't a Deletion request at all.
 *
 * @param {string} id - the SAR id
 * @param {string} performedById
 * @returns {Promise<{outcome: 'Erased'|'Restricted', retentionExpiresAt: string|null}>}
 */
export async function executeSarDeletion(id, performedById) {
  const existing = await assertNotLocked(id);

  if (existing.requestType !== 'Deletion') {
    throw { status: 400, message: 'This action only applies to Deletion-type requests. This request is Access-type — use Export instead.' };
  }

  const position = await getLeadRetentionPosition(existing.leadId);

  let outcome;
  if (position.hasFaisObligation) {
    await restrictLead(existing.leadId, position.retentionExpiresAt);
    outcome = { outcome: 'Restricted', retentionExpiresAt: position.retentionExpiresAt };
  } else {
    await eraseLeadPII(existing.leadId);
    outcome = { outcome: 'Erased', retentionExpiresAt: null };
  }

  // 24 Aug 2026 — applies to BOTH outcomes, not just Erased: Restricted
  // means a live FAIS retention obligation exists (there's already a
  // past closed Appointment behind it), but POPIA s14(6) still requires
  // processing to STOP — an open Appointment on this Lead (the schema
  // allows more than one over time) has no business staying active just
  // because an OLDER appointment is what triggered the retention
  // obligation. See closeOpenAppointmentsForErasure()'s own header
  // comment (appointmentService.js) for the full reasoning, including
  // why ClosedLost and not ReturnedToLeads.
  //
  // AUDITED per-appointment, not left to the SAR's own single audit
  // entry below to imply it — a genuine gap caught while building this,
  // not part of the original request: every other status-changing
  // action on Appointment (saveOutcome, returnToLeads, reassign, claim)
  // writes its own AuditLog entry scoped to that Appointment, and this
  // one is exactly the kind of event that most needs to be independently
  // auditable. Written here, not inside closeOpenAppointmentsForErasure()
  // itself — same "function does the work, caller records who asked"
  // split this file already uses for eraseLeadPII()/restrictLead().
  const closedAppointmentIds = await closeOpenAppointmentsForErasure(existing.leadId);
  for (const appointmentId of closedAppointmentIds) {
    await writeAuditLog({
      entityType: 'Appointment', entityId: appointmentId,
      action: 'AppointmentClosedForErasure', performedById,
      changeDetail: { newStatus: 'ClosedLost', lostReason: 'ConsentWithdrawn', sarId: id },
    });
  }

  // Erased vs Restricted get genuinely different status treatment, not
  // the same auto-transition applied uniformly — found and fixed 21 Aug
  // 2026 (Mark, live testing): a Deletion request whose outcome was
  // Erased sat at InProgress forever, requiring a manual "Fulfilled"
  // click that added no real information (there's no further action
  // pending on this Lead once it's actually erased). But the SAME
  // reasoning does NOT apply to Restricted — the record isn't gone, it's
  // retained under a live FAIS obligation pending a future scheduled
  // purge (not yet built — see eraseLeadPII()'s own header). Auto-
  // marking a still-fully-intact, still-retained record "Fulfilled"
  // would misrepresent to anyone checking later whether this deletion
  // request was actually completed. So: Erased jumps straight to
  // Fulfilled (Received rank 0 -> Fulfilled rank 2 is a valid forward
  // move per updateSarStatus()'s own rank check); Restricted keeps the
  // original InProgress-only behaviour, since work genuinely remains
  // outstanding.
  if (outcome.outcome === 'Erased') {
    await updateSarStatus(id, { status: 'Fulfilled' }, performedById);
  } else {
    // Same auto-transition every other first-real-action-on-a-Received-
    // request gets (handleSarRequestExport's own export call does the
    // identical thing) — the system reflects that work has actually
    // started, without requiring a separate manual click first.
    await markInProgressOnFirstExport(id, performedById);
  }

  const changeDetail = {
    sarId: id, leadId: existing.leadId, leadName: existing.leadName,
    ...outcome,
  };
  // §131 — single write; see createSarRequest's own comment above for
  // why (listAuditLogForLead's UNION surfaces this on the Lead's own
  // Change Log without a duplicate Lead-scoped twin).
  await writeAuditLog({
    entityType: 'SubjectAccessRequest', entityId: id, action: 'SarDeletionExecuted',
    performedById, changeDetail,
  });

  return outcome;
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
  // §131 — single write, same fix as createSarRequest/updateSarStatus above.
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
            existingCoverEncrypted AS "existingCoverEncrypted",
            currentInsurerEncrypted AS "currentInsurerEncrypted",
            policiesEncrypted AS "policiesEncrypted",
            medicalAidEncrypted AS "medicalAidEncrypted",
            medicalAidProviderEncrypted AS "medicalAidProviderEncrypted",
            pipelineStatus AS "pipelineStatus", createdAt AS "createdAt"
     FROM Lead WHERE id = @leadId AND organisationId = @organisationId`,
    { ...leadParam, ...orgParam }
  );
  if (!lead) return null;

  // Decrypt the ID number specifically for this export. UPDATED 18 Aug
  // 2026 — this was previously "the one place in the app where showing
  // the plaintext to a staff member is exactly the point... every other
  // view of a Lead never does this." That's no longer true: Mark asked
  // for it to be visible on LeadDetail (and, via the Lead join, on
  // AppointmentDetail) as well — see leadService.getLeadById()'s own
  // comment. Left as its own decrypt call here regardless, since this
  // function builds its own independent SELECT rather than reusing
  // getLeadById's.
  lead.idNumber = lead.idNumberEncrypted ? await decrypt(lead.idNumberEncrypted) : null;
  delete lead.idNumberEncrypted;

  // §12a/F1 (20 Aug 2026) — same treatment, extended to the five
  // medical/insurance fields (migration 036). A POPIA access request
  // export is exactly the kind of view that should show the subject
  // their own real data decrypted, same reasoning idNumber's decrypt
  // above already has.
  lead.existingCover = await decryptBoolean(lead.existingCoverEncrypted);
  lead.currentInsurer = lead.currentInsurerEncrypted ? await decrypt(lead.currentInsurerEncrypted) : null;
  lead.policies = lead.policiesEncrypted ? await decrypt(lead.policiesEncrypted) : null;
  lead.medicalAid = await decryptBoolean(lead.medicalAidEncrypted);
  lead.medicalAidProvider = lead.medicalAidProviderEncrypted ? await decrypt(lead.medicalAidProviderEncrypted) : null;
  delete lead.existingCoverEncrypted;
  delete lead.currentInsurerEncrypted;
  delete lead.policiesEncrypted;
  delete lead.medicalAidEncrypted;
  delete lead.medicalAidProviderEncrypted;

  const [callAttempts, appointments, appointmentMeetingRows, tasks, auditTrailRaw] = await Promise.all([
    executeQuery(
      `SELECT ca.id, ca.outcome, ca.callTime AS "callTime", ca.notes,
              ca.followUpDateTime AS "followUpDateTime", au.displayName AS "loggedBy"
       FROM CallAttempt ca LEFT JOIN "User" au ON ca.agentId = au.id
       WHERE ca.leadId = @leadId AND ca.organisationId = @organisationId
       ORDER BY ca.callTime ASC`,
      { ...leadParam, ...orgParam }
    ),
    // 14 Aug 2026 (§138 spec, session 20; §164 build, session 23) — the
    // old flat meeting{1,2,3}Status/Feedback columns dropped from this
    // SELECT; meeting history is now MeetingAttempt, a genuine one-to-
    // many relationship the old flat shape could never represent
    // correctly for a SAR export anyway (a rescheduled meeting's earlier
    // attempts were already gone by the time an export ran — this export
    // could only ever show whatever the flat columns currently held, not
    // the subject's real full history). Fetched as its own query below
    // and attached per-appointment, same "separate query, not a column
    // on this row" pattern getAppointmentById() itself now uses.
    executeQuery(
      `SELECT id, status, firstAppointmentDate AS "date", firstAppointmentTime AS "time",
              productsInterestedIn AS "productsInterestedIn", customerSigned AS "customerSigned",
              createdAt AS "createdAt"
       FROM Appointment WHERE leadId = @leadId AND organisationId = @organisationId
       ORDER BY createdAt ASC`,
      { ...leadParam, ...orgParam }
    ),
    // Every MeetingAttempt across every one of this lead's appointments,
    // in one query rather than N — grouped back onto each appointment in
    // JS below. This IS real personal data POPIA's access-request right
    // covers (what was discussed, whether the subject expressed
    // interest, whether they cancelled) — omitting it here would be a
    // real compliance gap, not just an incomplete export.
    executeQuery(
      `SELECT ma.appointmentId AS "appointmentId", ma.meetingNumber AS "meetingNumber",
              ma.date, ma.status, ma.notes, ma.createdAt AS "createdAt"
       FROM MeetingAttempt ma JOIN Appointment a ON a.id = ma.appointmentId
       WHERE a.leadId = @leadId AND a.organisationId = @organisationId
       ORDER BY ma.meetingNumber ASC, ma.createdAt ASC`,
      { ...leadParam, ...orgParam }
    ),
    executeQuery(
      `SELECT id, type, title, detail, isComplete AS "isComplete", createdAt AS "createdAt"
       FROM Task WHERE entityType = 'Lead' AND entityId = @leadId AND organisationId = @organisationId
       ORDER BY createdAt ASC`,
      { ...leadParam, ...orgParam }
    ),
    // §131 (5 Aug 2026) — CORRECTED: this used to be its own inline
    // query, `entityType = 'Lead'` only, relying on SAR actions ALSO
    // being written as a Lead-scoped twin (§125) to show up here. That
    // dual-write was removed — real duplicate rows in a compliance
    // table, not just visual noise (see auditService.
    // listAuditLogForLead()'s own header for the full reasoning). This
    // shared function's UNION is what keeps SAR actions showing up here
    // without the duplicate write.
    listAuditLogForLead(leadId),
  ]);

  // Attach each appointment's own meeting history — a plain array per
  // appointment, oldest attempt first within each meeting number, same
  // shape getAppointmentById()'s meetingAttempts already uses elsewhere
  // in the app, so a reader of this export sees the identical structure
  // staff themselves see on Appointment Detail.
  for (const appt of appointments) {
    appt.meetingAttempts = appointmentMeetingRows.filter(m => m.appointmentId === appt.id);
  }

  // listAuditLogForLead returns DESC (right for a UI history list) with
  // more fields than this export ever exposed — reversed to ASC for a
  // chronological export narrative, and trimmed back to exactly the
  // three fields this shape always had, so the exported JSON/CSV
  // structure itself doesn't change even though the underlying query does.
  const auditTrail = [...auditTrailRaw].reverse().map((e) => ({
    action: e.action, performedAt: e.performedAt, performedBy: e.performedByName,
  }));

  return { lead, callAttempts, appointments, tasks, auditTrail, compiledAt: new Date().toISOString() };
}
