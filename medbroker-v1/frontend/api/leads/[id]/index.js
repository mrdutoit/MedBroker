/**
 * api/leads/[id]/index.js
 * Vercel Functions equivalent of Azure functions/leads.js's getLeadById +
 * deleteLead handlers.
 *
 *   GET    /api/leads/:id — Agent, Supervisor, Admin, GlobalAdmin
 *   DELETE /api/leads/:id — Admin
 */

import { validateToken, requireRole, authErrorResponse } from '../../../api-lib/middleware/auth.js';
import { getLeadById, deleteLead } from '../../../api-lib/services/leadService.js';
import { getDirectReportIds, isSupervisorOnly, isAgentOnly } from '../../../api-lib/services/userService.js';
import { writeAuditLog, clientIp } from '../../../api-lib/services/auditService.js';
import { isUuid, applyCors } from '../../../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  try {
    const claims = await validateToken(req);
    const { id } = req.query;

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

    if (req.method === 'DELETE') {
      requireRole(claims, ['Admin']);

      const lead = await getLeadById(id);
      if (!lead) return res.status(404).json({ error: 'Lead not found' });

      await deleteLead(id);

      // A4 — AuditLog write on delete.
      await writeAuditLog({
        entityType: 'Lead',
        entityId: id,
        action: 'LeadDeleted',
        performedById: claims.oid,
        ipAddress: clientIp(req),
      });

      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, DELETE, OPTIONS');
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
