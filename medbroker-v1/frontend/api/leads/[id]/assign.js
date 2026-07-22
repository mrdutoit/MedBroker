/**
 * api/leads/[id]/assign.js
 * Vercel Functions equivalent of Azure functions/leads.js's assignLead handler.
 *   PUT /api/leads/:id/assign — Admin, Supervisor
 */

import { validateToken, requireRole, authErrorResponse } from '../../../api-lib/middleware/auth.js';
import { getLeadById, assignLead } from '../../../api-lib/services/leadService.js';
import { getDirectReportIds, isSupervisorOnly } from '../../../api-lib/services/userService.js';
import { writeAuditLog, clientIp } from '../../../api-lib/services/auditService.js';
import { AssignLeadSchema } from '../../../api-lib/models/lead.js';
import { isUuid, applyCors } from '../../../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'Supervisor']);

    const { id } = req.query;
    if (!isUuid(id)) {
      return res.status(400).json({ error: 'Invalid lead ID format' });
    }

    const parsed = AssignLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const lead = await getLeadById(id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // A1 extension: Supervisor cannot assign outside their own team, or a
    // lead outside their team, even though assignLead() itself only checks
    // the target agent's active status (A2).
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
      // assignLead() throws a structured { status, message } for an
      // inactive/unknown target agent (A2) — surface it as a 400, not a 500.
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }

    // A4 — AuditLog write on assign/reassign.
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
