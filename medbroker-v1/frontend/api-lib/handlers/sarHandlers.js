/**
 * handlers/sarHandlers.js — NEW (§79).
 * Admin/GlobalAdmin only, matching Audit Log's access pattern — SAR
 * processing touches any Lead in the organisation, not just a
 * Supervisor's own team, so it doesn't fit the usual scoped-visibility
 * model the way Leads/Appointments/Tasks do.
 * Routed through leads-router.js as sub-routes — no new Vercel function,
 * same reasoning as every other addition since the 12/12 ceiling.
 *
 * UPDATED §125 (5 Aug 2026):
 *   - FIXED CSV/JSON export parity — the CSV was missing 10 real fields
 *     the JSON export has (whatsappNumber, universityAttended,
 *     yearOfAttendance, degreeAttained, existingCover, currentInsurer,
 *     policies, medicalAid, medicalAidProvider, the lead's own
 *     createdAt). Confirmed by diffing the two field lists directly, not
 *     assumed — a real compliance gap for a feature whose whole point is
 *     "give someone everything we hold about them."
 *   - FIXED the same double-JSON.stringify audit bug sarService.js had
 *     (see that file's header) — this handler's own SarDataExported
 *     write had it too.
 *   - Export now auto-transitions Received -> InProgress on first export
 *     (markInProgressOnFirstExport).
 *   - NEW handleSarAssign, handleSarComments, handleSarAuditLog.
 */

import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import {
  listSarRequests, getSarRequestById, createSarRequest, updateSarStatus, compileSubjectData,
  markInProgressOnFirstExport, assignSarRequest, listSarComments, addSarComment,
} from '../services/sarService.js';
import { writeAuditLog, listAuditLog } from '../services/auditService.js';
import { CreateSarRequestSchema, UpdateSarStatusSchema, AssignSarSchema, CreateSarCommentSchema } from '../models/sar.js';
import { toCsv } from '../http/helpers.js';
import { isUuid } from '../http/helpers.js';

/** GET /api/leads/sar-requests, POST /api/leads/sar-requests */
export async function handleSarRequestsCollection(req, res) {
  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    if (req.method === 'GET') {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
      const status = req.query.status || undefined;
      const result = await listSarRequests({ page, pageSize, status });
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const parsed = CreateSarRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const newId = await createSarRequest(parsed.data, claims.oid);
      return res.status(201).json({ id: newId });
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/sar-requests error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/leads/sar-requests/:id, PATCH /api/leads/sar-requests/:id */
export async function handleSarRequestById(req, res, id) {
  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid id format' });

    const existing = await getSarRequestById(id);
    if (!existing) return res.status(404).json({ error: 'Request not found' });

    if (req.method === 'GET') {
      return res.status(200).json(existing);
    }

    if (req.method === 'PATCH') {
      const parsed = UpdateSarStatusSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      await updateSarStatus(id, parsed.data, claims.oid); // throws 409 if already locked
      const updated = await getSarRequestById(id);
      return res.status(200).json(updated);
    }

    res.setHeader('Allow', 'GET, PATCH, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/sar-requests/[id] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// §125 — every real Lead field compileSubjectData() returns, so the CSV
// and JSON exports are the same data in two shapes, not two different
// subsets of it. Kept in the same field order as the Lead SELECT in
// sarService.js's compileSubjectData for easy side-by-side comparison
// next time either one changes — add a field to one, check the other.
const SAR_CSV_COLUMNS = [
  { key: 'leadId', label: 'Lead ID' }, { key: 'fullName', label: 'Full Name' },
  { key: 'idNumber', label: 'ID Number' }, { key: 'dateOfBirth', label: 'Date of Birth' },
  { key: 'email', label: 'Email' }, { key: 'mobileNumber', label: 'Mobile' },
  { key: 'whatsappNumber', label: 'WhatsApp' },
  { key: 'universityAttended', label: 'University Attended' }, { key: 'yearOfAttendance', label: 'Year of Attendance' },
  { key: 'degreeAttained', label: 'Degree Attained' },
  { key: 'occupation', label: 'Occupation' }, { key: 'hospitalOrPractice', label: 'Hospital/Practice' },
  { key: 'existingCover', label: 'Existing Cover' }, { key: 'currentInsurer', label: 'Current Insurer' },
  { key: 'policies', label: 'Policies (JSON)' },
  { key: 'medicalAid', label: 'Medical Aid' }, { key: 'medicalAidProvider', label: 'Medical Aid Provider' },
  { key: 'pipelineStatus', label: 'Pipeline Status' }, { key: 'leadCreatedAt', label: 'Lead Created At' },
  { key: 'callAttempts', label: 'Call Attempts (JSON)' }, { key: 'appointments', label: 'Appointments (JSON)' },
  { key: 'tasks', label: 'Tasks (JSON)' }, { key: 'auditTrail', label: 'Audit Trail (JSON)' },
  { key: 'compiledAt', label: 'Compiled At' },
];

/** GET /api/leads/sar-requests/:id/export */
export async function handleSarRequestExport(req, res, id) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid id format' });

    const existing = await getSarRequestById(id);
    if (!existing) return res.status(404).json({ error: 'Request not found' });

    const compiled = await compileSubjectData(existing.leadId);
    if (!compiled) return res.status(404).json({ error: 'The linked Lead no longer exists' });

    const format = req.query.export === 'csv' ? 'csv' : 'json';

    // Exporting decrypted special personal information is exactly the
    // kind of action the audit trail exists for — logged here,
    // separately from SarRequestCreated/SarStatusChanged, so it's clear
    // from the log specifically WHEN the data was actually pulled, not
    // just when the request was logged or its status changed. Two
    // entries (Lead-scoped + SAR-scoped) — same reasoning as every other
    // SAR write, see sarService.js's header.
    const changeDetail = { sarId: id, format };
    await writeAuditLog({
      entityType: 'Lead', entityId: existing.leadId, action: 'SarDataExported',
      performedById: claims.oid, changeDetail,
    });
    await writeAuditLog({
      entityType: 'SubjectAccessRequest', entityId: id, action: 'SarDataExported',
      performedById: claims.oid, changeDetail,
    });

    // §125 — first export on a still-Received request auto-advances it
    // to InProgress. No-op for anything else (already InProgress, or
    // locked Fulfilled/Rejected) — see markInProgressOnFirstExport's own
    // header for why this is safe to call unconditionally here.
    await markInProgressOnFirstExport(id, claims.oid);

    const filename = `sar-${existing.leadId}-${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      const flat = {
        leadId: compiled.lead.id,
        fullName: [compiled.lead.title, compiled.lead.firstName, compiled.lead.lastName].filter(Boolean).join(' '),
        idNumber: compiled.lead.idNumber,
        // §126 — dateOfBirth is a genuinely date-only Postgres DATE
        // column; even with toCsv()'s Date-handling fixed (no more
        // corruption), it would still show a full midnight-UTC
        // timestamp otherwise. Trimmed to YYYY-MM-DD here specifically,
        // matching this codebase's own established convention for
        // date-only values (models/sar.js's own receivedAt comment:
        // "YYYY-MM-DD, matches every other date-only field").
        dateOfBirth: compiled.lead.dateOfBirth instanceof Date
          ? compiled.lead.dateOfBirth.toISOString().slice(0, 10)
          : compiled.lead.dateOfBirth,
        email: compiled.lead.email,
        mobileNumber: compiled.lead.mobileNumber,
        whatsappNumber: compiled.lead.whatsappNumber,
        universityAttended: compiled.lead.universityAttended,
        yearOfAttendance: compiled.lead.yearOfAttendance,
        degreeAttained: compiled.lead.degreeAttained,
        occupation: compiled.lead.occupation,
        hospitalOrPractice: compiled.lead.hospitalOrPractice,
        existingCover: compiled.lead.existingCover,
        currentInsurer: compiled.lead.currentInsurer,
        policies: compiled.lead.policies,
        medicalAid: compiled.lead.medicalAid,
        medicalAidProvider: compiled.lead.medicalAidProvider,
        pipelineStatus: compiled.lead.pipelineStatus,
        leadCreatedAt: compiled.lead.createdAt,
        callAttempts: compiled.callAttempts,
        appointments: compiled.appointments,
        tasks: compiled.tasks,
        auditTrail: compiled.auditTrail,
        compiledAt: compiled.compiledAt,
      };
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.statusCode = 200;
      return res.end(toCsv([flat], SAR_CSV_COLUMNS));
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
    res.statusCode = 200;
    return res.end(JSON.stringify(compiled, null, 2));

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/sar-requests/[id]/export error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** PATCH /api/leads/sar-requests/:id/assign — §125 */
export async function handleSarAssign(req, res, id) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid id format' });

    const parsed = AssignSarSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    await assignSarRequest(id, parsed.data.assignedToId, claims.oid); // throws 404/409/400 as appropriate
    const updated = await getSarRequestById(id);
    return res.status(200).json(updated);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/sar-requests/[id]/assign error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET + POST /api/leads/sar-requests/:id/comments — §125 */
export async function handleSarComments(req, res, id) {
  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid id format' });

    const existing = await getSarRequestById(id);
    if (!existing) return res.status(404).json({ error: 'Request not found' });

    if (req.method === 'GET') {
      const comments = await listSarComments(id);
      return res.status(200).json({ comments });
    }

    if (req.method === 'POST') {
      const parsed = CreateSarCommentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const newId = await addSarComment(id, claims.oid, parsed.data.body); // throws 409 if locked
      const comments = await listSarComments(id);
      const created = comments.find(c => c.id === newId);
      return res.status(201).json(created);
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/sar-requests/[id]/comments error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/leads/sar-requests/:id/audit — §125. Reuses the same
 * generic listAuditLog(entityType, entityId) LeadDetail/AppointmentDetail's
 * own Change Log panels already use — no bespoke SAR audit query needed,
 * and it already handles the JSON.parse on changeDetail the frontend's
 * formatChangeDetail() expects an object for. */
export async function handleSarAuditLog(req, res, id) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid id format' });

    const existing = await getSarRequestById(id);
    if (!existing) return res.status(404).json({ error: 'Request not found' });

    const entries = await listAuditLog('SubjectAccessRequest', id);
    return res.status(200).json({ entries });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/sar-requests/[id]/audit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
