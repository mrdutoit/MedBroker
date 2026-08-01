/**
 * handlers/sarHandlers.js — NEW (§79).
 * Admin/GlobalAdmin only, matching Audit Log's access pattern — SAR
 * processing touches any Lead in the organisation, not just a
 * Supervisor's own team, so it doesn't fit the usual scoped-visibility
 * model the way Leads/Appointments/Tasks do.
 * Routed through leads-router.js as sub-routes — no new Vercel function,
 * same reasoning as every other addition since the 12/12 ceiling.
 */

import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import {
  listSarRequests, getSarRequestById, createSarRequest, updateSarStatus, compileSubjectData,
} from '../services/sarService.js';
import { writeAuditLog } from '../services/auditService.js';
import { CreateSarRequestSchema, UpdateSarStatusSchema } from '../models/sar.js';
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

      await updateSarStatus(id, parsed.data, claims.oid);
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

const SAR_CSV_COLUMNS = [
  { key: 'leadId', label: 'Lead ID' }, { key: 'fullName', label: 'Full Name' },
  { key: 'idNumber', label: 'ID Number' }, { key: 'email', label: 'Email' },
  { key: 'mobileNumber', label: 'Mobile' }, { key: 'dateOfBirth', label: 'Date of Birth' },
  { key: 'occupation', label: 'Occupation' }, { key: 'hospitalOrPractice', label: 'Hospital/Practice' },
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

    // Exporting decrypted special personal information is exactly the
    // kind of action the audit trail exists for — logged here,
    // separately from SarRequestCreated/SarStatusChanged, so it's clear
    // from the log specifically WHEN the data was actually pulled, not
    // just when the request was logged or its status changed.
    await writeAuditLog({
      entityType: 'Lead', entityId: existing.leadId, action: 'SarDataExported',
      performedById: claims.oid, changeDetail: JSON.stringify({ sarId: id, format: req.query.export || 'json' }),
    });

    const filename = `sar-${existing.leadId}-${new Date().toISOString().slice(0, 10)}`;

    if (req.query.export === 'csv') {
      const flat = {
        leadId: compiled.lead.id,
        fullName: [compiled.lead.title, compiled.lead.firstName, compiled.lead.lastName].filter(Boolean).join(' '),
        idNumber: compiled.lead.idNumber,
        email: compiled.lead.email,
        mobileNumber: compiled.lead.mobileNumber,
        dateOfBirth: compiled.lead.dateOfBirth,
        occupation: compiled.lead.occupation,
        hospitalOrPractice: compiled.lead.hospitalOrPractice,
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
