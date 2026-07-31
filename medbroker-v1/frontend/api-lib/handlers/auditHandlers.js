/**
 * handlers/auditHandlers.js — NEW (§76).
 * Backs AppAdmin's Audit Log tab, which showed ten hardcoded fake
 * entries unconditionally before this — not even gated behind demo
 * mode like the rest of this app. Routed through the already-existing
 * flags-router.js as a literal sub-route (GET /api/flags/audit-log) —
 * not a natural domain fit, but this app is sitting at exactly 12/12
 * Vercel functions with zero headroom, so a new top-level file wasn't
 * an option; AppAdmin's own routes (Flags, System Settings, now Audit
 * Log) already live scattered across a couple of existing routers for
 * the same reason.
 */

import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import { listAllAuditLog } from '../services/auditService.js';

const MAX_PAGE_SIZE = 100;

/** GET /api/flags/audit-log */
export async function handleAuditLogList(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize, 10) || 25));

    const result = await listAllAuditLog({ page, pageSize });
    return res.status(200).json(result);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('flags/audit-log error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
