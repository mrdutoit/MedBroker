/**
 * api/leads/[id]/calls.js
 *   GET  /api/leads/:id/calls — call history for this lead, most recent
 *                               first. LeadDetail.jsx's "Recent Calls"
 *                               previously only reflected calls logged in
 *                               the current browser session.
 *   POST /api/leads/:id/calls — Agent, Supervisor, Admin, GlobalAdmin —
 *     log a call (Vercel Functions equivalent of Azure functions/leads.js's
 *     logCallAttempt handler)
 */

import { validateToken, requireRole, authErrorResponse } from '../../../api-lib/middleware/auth.js';
import { getLeadById, logCallAttempt, listCallAttempts } from '../../../api-lib/services/leadService.js';
import { getDirectReportIds, isSupervisorOnly, isAgentOnly } from '../../../api-lib/services/userService.js';
import { CallAttemptSchema } from '../../../api-lib/models/lead.js';
import { isUuid, applyCors } from '../../../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin']);

    const { id } = req.query;
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

    // POST
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
