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
 *
 * SLUG SUB-TREE ADDED §134 (6 Aug 2026) — GET /api/system-config/integrations
 * and PUT /api/system-config/integrations/:provider (App Admin →
 * Integrations, Stripe + SMTP credentials). Added as a sub-route on THIS
 * file rather than a new one — 12/12 Vercel functions, zero headroom,
 * same reasoning auditHandlers.js's header gives for its own placement
 * under flags-router.js. Delegated to integrationHandlers.js rather than
 * inlined here, unlike the System Settings logic above — GlobalAdmin-only
 * on GET too (unlike System Settings' deliberately-open GET), different
 * enough in shape and access model to warrant its own file rather than
 * growing this one's inline logic further. Needed a vercel.json rewrite
 * change to accept a slug at all — this file previously had no sub-route
 * support (see vercel.json's own comment at that rewrite entry).
 */

import { validateToken, requireRole, authErrorResponse } from '../api-lib/middleware/auth.js';
import { getSystemConfig, updateSystemConfig } from '../api-lib/services/systemConfigService.js';
import { writeAuditLog, clientIp } from '../api-lib/services/auditService.js';
import { UpdateSystemConfigSchema } from '../api-lib/models/auth.js';
import { handleIntegrationsStatus, handleIntegrationsUpdate } from '../api-lib/handlers/integrationHandlers.js';
import { applyCors, parseSlug } from '../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const segments = parseSlug(req.query.slug);

  // §134 — must come before the base GET/PUT logic below; 'integrations'
  // is never a base-route concern.
  if (segments.length === 1 && segments[0] === 'integrations') {
    return handleIntegrationsStatus(req, res);
  }
  if (segments.length === 2 && segments[0] === 'integrations') {
    return handleIntegrationsUpdate(req, res, segments[1]);
  }
  if (segments.length > 0) {
    return res.status(404).json({ error: 'Not found' });
  }

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
