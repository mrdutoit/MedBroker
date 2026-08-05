/**
 * api-lib/handlers/flagHandlers.js
 * Consolidated 22 July 2026 — see authHandlers.js header for why. Logic
 * unchanged from api/flags/index.js and api/flags/[key].js.
 *
 * UPDATED §124 (4 Aug 2026) — DEPENDENT_RESETS below. Mark's finding:
 * switching a parent flag back to its default (e.g. appointments.
 * claimModel back to 'assign', or auth.sso.enabled off) left dependent
 * child flags (appointments.tokens.paymentProvider, auth.sso.provider,
 * auth.sso.disableLocalFallback) holding whatever value they'd last been
 * set to, invisible in the UI (FeatureFlags.jsx hides them via
 * dependsOn) but still sitting in the database. Checked whether that's
 * actually exploitable today: it isn't, currently — every real consumer
 * of a child flag (handleLogin's auth.sso.disableLocalFallback check,
 * §121) already independently re-checks the parent too, specifically
 * written that way as defense in depth against exactly this scenario.
 * But that's a property of how each consumer HAPPENS to be written, not
 * a property the flag system itself enforces — the next thing built
 * that reads a child flag (the Stripe payment-provider check, coming
 * next) could easily forget to also check the parent, and Mark's
 * instinct that this shouldn't be able to happen at all is the more
 * robust one. Fixed at the source instead: a child flag can no longer
 * hold a stale non-default value while its parent doesn't require it.
 */

import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import { listFlags, getFlagMeta, updateFlag } from '../services/flagService.js';
import { writeAuditLog, clientIp } from '../services/auditService.js';
import { z } from 'zod';

const PatchFlagSchema = z.object({
  value: z.union([z.string(), z.boolean(), z.number()]),
});

/**
 * Hand-coded, not schema-driven — FeatureFlag has no dependsOn column at
 * all (that relationship currently only lives in FeatureFlags.jsx's
 * FLAG_META, frontend-only, "mirrors the FeatureFlag table seed data"
 * per that file's own comment). Adding a real dependsOn column to model
 * this generically would be more machinery than two known relationships
 * need — matches this codebase's existing preference for explicit,
 * per-case logic over generic abstraction (no JSON-blob configs
 * anywhere in this app). If a third parent/child pair is ever added,
 * add it here too.
 */
const DEPENDENT_RESETS = {
  'auth.sso.enabled': {
    offValue: '0',
    children: [
      { key: 'auth.sso.provider', resetTo: 'none' },
      { key: 'auth.sso.disableLocalFallback', resetTo: '0' },
    ],
  },
  'appointments.claimModel': {
    offValue: 'assign',
    children: [
      { key: 'appointments.tokens.paymentProvider', resetTo: 'none' },
    ],
  },
};

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

    // §124 — cascade-reset any dependent children back to their defaults
    // when this flag just became the value its children require it NOT
    // to be. Only fires on that specific transition — setting claimModel
    // to 'claim' (turning a capability ON) never touches
    // paymentProvider; only setting it back to 'assign' does.
    const resetRule = DEPENDENT_RESETS[key];
    const resetChildren = [];
    if (resetRule && String(value) === resetRule.offValue) {
      for (const child of resetRule.children) {
        await updateFlag(child.key, child.resetTo, claims.oid);
        resetChildren.push({ key: child.key, value: child.resetTo });
      }
    }

    await writeAuditLog({
      entityType: 'FeatureFlag',
      entityId: key,
      action: 'FeatureFlagUpdated',
      performedById: claims.oid,
      changeDetail: resetChildren.length > 0 ? { key, value, resetChildren } : { key, value },
      ipAddress: clientIp(req),
    });

    return res.status(200).json({ key, value: meta.valueType === 'boolean' ? value === '1' : value, resetChildren });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('flags/[key] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
