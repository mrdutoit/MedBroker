/**
 * api/system-config.js — NEW.
 * GET/PUT /api/system-config — the AppAdmin → System Settings backing API,
 * now including the password rotation/lockout policy fields. Admin and
 * GlobalAdmin only; this isn't scoped per-organisation-role like Leads are,
 * it's a single settings row.
 */

import { validateToken, requireRole, authErrorResponse } from '../src/middleware/auth.js';
import { getSystemConfig, updateSystemConfig } from '../src/services/systemConfigService.js';
import { writeAuditLog, clientIp } from '../src/services/auditService.js';
import { UpdateSystemConfigSchema } from '../src/models/auth.js';
import { applyCors } from '../src/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    if (req.method === 'GET') {
      return res.status(200).json(await getSystemConfig());
    }

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
