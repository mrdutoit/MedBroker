/**
 * api-lib/handlers/flagHandlers.js
 * Consolidated 22 July 2026 — see authHandlers.js header for why. Logic
 * unchanged from api/flags/index.js and api/flags/[key].js.
 */

import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import { listFlags, getFlagMeta, updateFlag } from '../services/flagService.js';
import { writeAuditLog, clientIp } from '../services/auditService.js';
import { z } from 'zod';

const PatchFlagSchema = z.object({
  value: z.union([z.string(), z.boolean(), z.number()]),
});

/** GET /api/flags — no auth required, app config not user data. */
export async function handleFlagsList(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const flags = await listFlags();
    return res.status(200).json({ flags });
  } catch (err) {
    console.error('flags/index error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** PATCH /api/flags/:key — Admin, GlobalAdmin only. */
export async function handleFlagUpdate(req, res, key) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    const parsed = PatchFlagSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const meta = await getFlagMeta(key);
    if (!meta) return res.status(404).json({ error: `Unknown flag: ${key}` });
    if (meta.isPhase2) return res.status(403).json({ error: 'This flag is Phase 2 (not yet built) and cannot be changed' });

    let value = parsed.data.value;
    if (meta.valueType === 'boolean') {
      if (typeof value !== 'boolean') return res.status(400).json({ error: 'This flag expects a boolean value' });
      value = value ? '1' : '0';
    } else if (meta.valueType === 'enum') {
      const allowed = (meta.allowedValues ?? '').split(',').map((v) => v.trim());
      if (!allowed.includes(String(value))) {
        return res.status(400).json({ error: `Value must be one of: ${allowed.join(', ')}` });
      }
    } else if (meta.valueType === 'integer') {
      if (!Number.isInteger(Number(value))) return res.status(400).json({ error: 'This flag expects an integer value' });
    }

    await updateFlag(key, value, claims.oid);

    await writeAuditLog({
      entityType: 'FeatureFlag',
      entityId: key,
      action: 'FeatureFlagUpdated',
      performedById: claims.oid,
      changeDetail: { key, value },
      ipAddress: clientIp(req),
    });

    return res.status(200).json({ key, value: meta.valueType === 'boolean' ? value === '1' : value });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('flags/[key] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
