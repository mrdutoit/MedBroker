/**
 * handlers/integrationHandlers.js — NEW, §134 (6 Aug 2026).
 * Backs the Integrations settings page (App Admin → Integrations) —
 * Stripe + SMTP credentials. Routed through system-config.js as a slug
 * sub-tree (GET /api/system-config/integrations, PUT
 * /api/system-config/integrations/:provider) rather than a new top-level
 * file — this app is sitting at exactly 12/12 Vercel functions with zero
 * headroom, same reasoning auditHandlers.js's own header gives for why
 * IT lives under flags-router.js instead of its own file.
 *
 * GLOBALADMIN ONLY, BOTH DIRECTIONS — deliberately different from
 * system-config.js's own System Settings GET, which is intentionally
 * open to any authenticated staff member (see that file's header). A
 * Stripe secret key or SMTP password is not the same category of
 * "config" as a call-attempt limit; nothing in this file is readable by
 * anyone below GlobalAdmin, GET included.
 */

import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import { getMaskedStatus, setConfig } from '../services/integrationCredentialService.js';
import { writeAuditLog, clientIp } from '../services/auditService.js';
import { UpdateStripeCredentialsSchema, UpdateSmtpCredentialsSchema } from '../models/integration.js';

const SCHEMAS = {
  stripe: UpdateStripeCredentialsSchema,
  smtp:   UpdateSmtpCredentialsSchema,
};

/** GET /api/system-config/integrations — masked status for both providers. */
export async function handleIntegrationsStatus(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['GlobalAdmin']);

    const [stripe, smtp] = await Promise.all([getMaskedStatus('stripe'), getMaskedStatus('smtp')]);
    return res.status(200).json({ stripe, smtp });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('system-config/integrations error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PUT /api/system-config/integrations/:provider — partial update for one
 * provider ('stripe' | 'smtp'). Audit log records WHICH FIELDS were
 * changed, never the values — same principle as never writing special PI
 * to logs elsewhere in this app, just applied to secrets instead of
 * POPIA data.
 */
export async function handleIntegrationsUpdate(req, res, provider) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['GlobalAdmin']);

    const schema = SCHEMAS[provider];
    if (!schema) return res.status(404).json({ error: `Unknown integration provider "${provider}"` });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const masked = await setConfig(provider, parsed.data, claims.oid);

    await writeAuditLog({
      entityType: 'IntegrationCredential',
      entityId: provider,
      action: 'IntegrationCredentialUpdated',
      performedById: claims.oid,
      // Field NAMES only, never values — this is exactly the record a
      // GlobalAdmin reviewing the audit log needs ("who changed the
      // Stripe key and when"), without the log itself becoming a place
      // a secret could leak from.
      changeDetail: { provider, fieldsChanged: Object.keys(parsed.data) },
      ipAddress: clientIp(req),
    });

    return res.status(200).json(masked);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('system-config/integrations/[provider] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
