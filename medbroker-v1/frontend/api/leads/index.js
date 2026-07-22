/**
 * api/leads/index.js
 * Vercel Functions equivalent of Azure functions/leads.js's listLeads +
 * createLead handlers. Same authorization rules; ported to the Vercel
 * req/res convention (see VERCEL_NOTES.md "Route layer").
 *
 *   GET  /api/leads  — Agent, Supervisor, Admin, GlobalAdmin
 *   POST /api/leads  — Admin, Supervisor
 */

import { validateToken, requireRole, authErrorResponse } from '../../api-lib/middleware/auth.js';
import { listLeads, createLead } from '../../api-lib/services/leadService.js';
import { getDirectReportIds, isSupervisorOnly, isAgentOnly } from '../../api-lib/services/userService.js';
import { writeAuditLog, clientIp } from '../../api-lib/services/auditService.js';
import { CreateLeadSchema, LeadListQuerySchema } from '../../api-lib/models/lead.js';
import { applyCors } from '../../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  try {
    const claims = await validateToken(req);

    if (req.method === 'GET') {
      requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin']);

      const parsed = LeadListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      // Agent: only their own assigned leads (unchanged from the Azure original).
      if (isAgentOnly(claims.roles)) {
        parsed.data.agentId = claims.oid;
      }
      // Supervisor (without Admin): team + unassigned only — A1.
      if (isSupervisorOnly(claims.roles)) {
        parsed.data.supervisorAgentIds = await getDirectReportIds(claims.oid);
      }

      const result = await listLeads(parsed.data);
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      requireRole(claims, ['Admin', 'Supervisor', 'GlobalAdmin']);

      const parsed = CreateLeadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      const newId = await createLead(parsed.data, claims.oid);

      // A4 — AuditLog write on create.
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
