/**
 * api/system-config.js — NEW.
 * GET/PUT /api/system-config — the AppAdmin → System Settings backing API,
 * now including the password rotation/lockout policy fields. GET is any
 * authenticated staff member (§108 — LeadList.jsx's auto-return banner
 * needs the real leadAutoUnassignMonths value, and Agents can't reach
 * App Admin to look it up any other way); PUT stays Admin/GlobalAdmin
 * only. Nothing in this config is sensitive — call-attempt limits, this
 * auto-return period, password rotation days — so a read/write split
 * here is a deliberate, considered choice, not an oversight. Not scoped
 * per-organisation-role like Leads are either way; it's a single
 * settings row.
 */

import { validateToken, requireRole, authErrorResponse } from '../api-lib/middleware/auth.js';
import { getSystemConfig, updateSystemConfig } from '../api-lib/services/systemConfigService.js';
import { writeAuditLog, clientIp } from '../api-lib/services/auditService.js';
import { UpdateSystemConfigSchema } from '../api-lib/models/auth.js';
import { applyCors } from '../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  try {
    const claims = await validateToken(req);

    if (req.method === 'GET') {
      // No requireRole() here, deliberately — any authenticated staff
      // member may read this. Write access below is still locked down.
      return res.status(200).json(await getSystemConfig());
    }

    requireRole(claims, ['Admin', 'GlobalAdmin']);

    if (req.method === 'PUT') {
      const parsed = UpdateSystemConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      const updated = await updateSystemConfig(parsed.data);

      await writeAuditLog({
        entityType: 'SystemConfig',
        entityId: '1',
        action: 'SystemConfigUpdated',
        performedById: claims.oid,
        changeDetail: parsed.data,
        ipAddress: clientIp(req),
      });

      return res.status(200).json(updated);
    }

    res.setHeader('Allow', 'GET, PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('system-config error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
