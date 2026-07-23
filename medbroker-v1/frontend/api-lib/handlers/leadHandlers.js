/**
 * api-lib/handlers/leadHandlers.js
 * Consolidated 22 July 2026 — see authHandlers.js header for why. Logic
 * unchanged from the five original files (index.js, sources.js,
 * [id]/index.js, [id]/assign.js, [id]/calls.js).
 */

import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import { listLeads, createLead, listSources, getLeadById, updateLead, deleteLead, assignLead, logCallAttempt, listCallAttempts } from '../services/leadService.js';
import { getDirectReportIds, isSupervisorOnly, isAgentOnly } from '../services/userService.js';
import { writeAuditLog, clientIp, listAuditLog } from '../services/auditService.js';
import { CreateLeadSchema, UpdateLeadSchema, LeadListQuerySchema, AssignLeadSchema, CallAttemptSchema } from '../models/lead.js';
import { isUuid } from '../http/helpers.js';

/** GET (list) + POST (create) /api/leads */
export async function handleLeadsCollection(req, res) {
  try {
    const claims = await validateToken(req);

    if (req.method === 'GET') {
      requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin']);

      const parsed = LeadListQuerySchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      if (isAgentOnly(claims.roles)) {
        parsed.data.agentId = claims.oid;
      }
      if (isSupervisorOnly(claims.roles)) {
        parsed.data.supervisorAgentIds = await getDirectReportIds(claims.oid);
      }

      const result = await listLeads(parsed.data);
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      requireRole(claims, ['Admin', 'Supervisor', 'GlobalAdmin']);

      const parsed = CreateLeadSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const newId = await createLead(parsed.data, claims.oid);

      await writeAuditLog({
        entityType: 'Lead',
        entityId: newId,
        action: 'LeadCreated',
        performedById: claims.oid,
        changeDetail: { leadSource: parsed.data.leadSource },
        ipAddress: clientIp(req),
      });

      return res.status(201).json({ id: newId });
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/index error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/leads/sources */
export async function handleLeadSources(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin']);

    const sources = await listSources();
    return res.status(200).json({ sources });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/sources error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET + PUT + DELETE /api/leads/:id */
export async function handleLeadById(req, res, id) {
  try {
    const claims = await validateToken(req);

    if (!isUuid(id)) {
      return res.status(400).json({ error: 'Invalid lead ID format' });
    }

    if (req.method === 'GET') {
      requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin']);

      const lead = await getLeadById(id);
      if (!lead) return res.status(404).json({ error: 'Lead not found' });

      if (isAgentOnly(claims.roles) && lead.assignedAgentId !== claims.oid) {
        return res.status(403).json({ error: 'You are not assigned to this lead' });
      }
      if (isSupervisorOnly(claims.roles) && lead.assignedAgentId) {
        const directReports = await getDirectReportIds(claims.oid);
        if (!directReports.includes(lead.assignedAgentId)) {
          return res.status(403).json({ error: 'This lead is outside your team' });
        }
      }

      return res.status(200).json(lead);
    }

    // Editable by: the Agent this lead is assigned to, their Supervisor,
    // or Admin/GlobalAdmin — matches the read-permission boundary above,
    // not a separate rule. An unassigned lead has no agent to check against,
    // so only Supervisor/Admin/GlobalAdmin can edit it (an Agent can't own
    // fields on a lead that isn't theirs yet).
    if (req.method === 'PUT') {
      requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin']);

      const existing = await getLeadById(id);
      if (!existing) return res.status(404).json({ error: 'Lead not found' });

      if (isAgentOnly(claims.roles) && existing.assignedAgentId !== claims.oid) {
        return res.status(403).json({ error: 'You are not assigned to this lead' });
      }
      if (isSupervisorOnly(claims.roles)) {
        const directReports = await getDirectReportIds(claims.oid);
        if (!existing.assignedAgentId || !directReports.includes(existing.assignedAgentId)) {
          return res.status(403).json({ error: 'This lead is outside your team' });
        }
      }

      const parsed = UpdateLeadSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const changed = await updateLead(id, parsed.data);
      if (changed) {
        // Diff only the fields actually present on the request — old vs new —
        // rather than logging the raw payload, so the audit entry reads as
        // "what changed" and doesn't repeat unrelated fields untouched by
        // this save.
        const changeDetail = {};
        for (const field of Object.keys(parsed.data)) {
          if (existing[field] !== parsed.data[field]) {
            changeDetail[field] = { from: existing[field] ?? null, to: parsed.data[field] ?? null };
          }
        }
        await writeAuditLog({
          entityType: 'Lead',
          entityId: id,
          action: 'LeadUpdated',
          performedById: claims.oid,
          changeDetail,
          ipAddress: clientIp(req),
        });
      }

      const updated = await getLeadById(id);
      return res.status(200).json(updated);
    }

    if (req.method === 'DELETE') {
      requireRole(claims, ['Admin', 'GlobalAdmin']);

      const lead = await getLeadById(id);
      if (!lead) return res.status(404).json({ error: 'Lead not found' });

      await deleteLead(id);

      await writeAuditLog({
        entityType: 'Lead',
        entityId: id,
        action: 'LeadDeleted',
        performedById: claims.oid,
        ipAddress: clientIp(req),
      });

      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, PUT, DELETE, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/[id] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** PUT /api/leads/:id/assign */
export async function handleLeadAssign(req, res, id) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'Supervisor', 'GlobalAdmin']);

    if (!isUuid(id)) {
      return res.status(400).json({ error: 'Invalid lead ID format' });
    }

    const parsed = AssignLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const lead = await getLeadById(id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    if (isSupervisorOnly(claims.roles)) {
      const directReports = await getDirectReportIds(claims.oid);
      if (lead.assignedAgentId && !directReports.includes(lead.assignedAgentId)) {
        return res.status(403).json({ error: 'This lead is outside your team' });
      }
      if (!directReports.includes(parsed.data.agentId)) {
        return res.status(403).json({ error: 'Target agent is not one of your direct reports' });
      }
    }

    const previousAgentId = lead.assignedAgentId ?? null;

    try {
      await assignLead(id, parsed.data.agentId);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }

    await writeAuditLog({
      entityType: 'Lead',
      entityId: id,
      action: previousAgentId ? 'LeadReassigned' : 'LeadAssigned',
      performedById: claims.oid,
      changeDetail: { previousAgentId, newAgentId: parsed.data.agentId },
      ipAddress: clientIp(req),
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/[id]/assign error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/leads/:id/audit */
export async function handleLeadAudit(req, res, id) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin']);

    if (!isUuid(id)) {
      return res.status(400).json({ error: 'Invalid lead ID format' });
    }

    const lead = await getLeadById(id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    if (isAgentOnly(claims.roles) && lead.assignedAgentId !== claims.oid) {
      return res.status(403).json({ error: 'You are not assigned to this lead' });
    }
    if (isSupervisorOnly(claims.roles) && lead.assignedAgentId) {
      const directReports = await getDirectReportIds(claims.oid);
      if (!directReports.includes(lead.assignedAgentId)) {
        return res.status(403).json({ error: 'This lead is outside your team' });
      }
    }

    const entries = await listAuditLog('Lead', id);
    return res.status(200).json({ entries });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/[id]/audit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET + POST /api/leads/:id/calls */
export async function handleLeadCalls(req, res, id) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin']);

    if (!isUuid(id)) {
      return res.status(400).json({ error: 'Invalid lead ID format' });
    }

    const lead = await getLeadById(id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    if (isAgentOnly(claims.roles) && lead.assignedAgentId !== claims.oid) {
      return res.status(403).json({ error: 'You are not assigned to this lead' });
    }
    if (isSupervisorOnly(claims.roles) && lead.assignedAgentId) {
      const directReports = await getDirectReportIds(claims.oid);
      if (!directReports.includes(lead.assignedAgentId)) {
        return res.status(403).json({ error: 'This lead is outside your team' });
      }
    }

    if (req.method === 'GET') {
      const calls = await listCallAttempts(id);
      return res.status(200).json({ calls });
    }

    const parsed = CallAttemptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { flaggedUncontactable, newPipelineStatus } = await logCallAttempt(id, claims.oid, parsed.data);
    return res.status(201).json({ success: true, flaggedUncontactable, newPipelineStatus });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/[id]/calls error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
