/**
 * services/integrationCredentialService.js — NEW, §134 (6 Aug 2026).
 * Backs the Integrations settings page (Stripe + SMTP credentials).
 *
 * DELIBERATELY NOT SystemConfig — that table's GET is open to any
 * authenticated staff member by design (see system-config.js's own header
 * comment), which is the wrong access model for a Stripe secret key or an
 * SMTP password. IntegrationCredential is a new table, GlobalAdmin-only
 * both directions (enforced by this file's callers — integrationHandlers.js
 * — not by a DB constraint, same pattern as every other role check in
 * this app: client hides, server enforces).
 *
 * ONE ROW PER (organisationId, provider), WHOLE CONFIG AS ONE ENCRYPTED
 * BLOB — not one row per field. encryption.js's encrypt()/decrypt() work
 * on a single plaintext string; a JSON string is just a plaintext string,
 * so the whole per-provider config object is JSON.stringify'd and
 * encrypted as one value, then JSON.parse'd back out on read. This reuses
 * the SAME envelope encryption Lead.idNumber already uses — 'kms1' when
 * security.kmsEncryption.enabled is on, 'demo1' (DEMO_ENCRYPTION_KEY)
 * when it's off, transparently, with zero new code in this file for that
 * distinction (decrypt() already branches on the embedded format marker).
 *
 * MASKING CONTRACT — getMaskedStatus() below never returns a secret value
 * in the clear once it's been saved, only whether it's set and a short
 * non-reversible preview (last 4 characters). getRawConfig() (full
 * decrypted config) exists ONLY for this file's own internal use — by
 * stripeService.js building a Stripe client, and by emailService.js
 * building an SMTP transporter — never returned from an HTTP handler.
 *
 * PARTIAL UPDATE, SECRET FIELDS NEVER BLANKED BY OMISSION — setConfig()
 * merges the supplied fields into whatever's already stored; a GlobalAdmin
 * updating the SMTP host doesn't have to re-type the password, and an
 * empty-string/omitted secret field is treated as "leave unchanged", not
 * "clear it" (matches this app's existing stripEmpty()-adjacent handling
 * of optional fields elsewhere — see CRITICAL IMPLEMENTATION RULES).
 */

import { executeQuery, executeQueryOne, sql } from './db.js';
import { encrypt, decrypt } from './encryption.js';
import { resolveOrganisationId } from '../context/tenant.js';

const PROVIDERS = ['stripe', 'smtp'];

// Which fields of each provider's config are secrets — never echoed back
// in the clear by getMaskedStatus(), only as `<field>Set: boolean` plus a
// last-4-characters preview. Every other field (SMTP host/port/user/from —
// none of which are actually sensitive; see emailService.js's own header,
// SMTP_USER for Resend is literally the string "resend") is returned as-is.
const SECRET_FIELDS = {
  stripe: ['secretKey', 'webhookSigningSecret'],
  smtp:   ['password'],
};

function assertValidProvider(provider) {
  if (!PROVIDERS.includes(provider)) {
    throw { status: 400, message: `Unknown integration provider "${provider}" — must be one of: ${PROVIDERS.join(', ')}` };
  }
}

/**
 * Full decrypted config for one provider — INTERNAL USE ONLY (Stripe
 * client construction, SMTP transporter construction). Never return this
 * directly from an HTTP handler.
 * @param {string} provider - 'stripe' | 'smtp'
 * @returns {Promise<Object|null>} the decrypted config object, or null if
 *   nothing has been saved for this provider yet
 */
export async function getRawConfig(provider) {
  assertValidProvider(provider);
  const organisationId = resolveOrganisationId();

  const row = await executeQueryOne(
    `SELECT encryptedConfig AS "encryptedConfig" FROM IntegrationCredential
     WHERE organisationId = @organisationId AND provider = @provider`,
    {
      organisationId: { type: sql.UniqueIdentifier, value: organisationId },
      provider:       { type: sql.NVarChar(20), value: provider },
    }
  );
  if (!row) return null;

  const json = await decrypt(row.encryptedConfig);
  return JSON.parse(json);
}

/**
 * Masked status for the Integrations page GET response. Secret fields
 * become `{ <field>Set: boolean, <field>Preview: string|null }` — the
 * preview is the last 4 characters only (e.g. a Stripe key ending
 * "...aB3x" — enough to visually confirm "yes, that's the key I set
 * last week" without meaningfully weakening the secret). Non-secret
 * fields pass through unchanged.
 * @param {string} provider
 */
export async function getMaskedStatus(provider) {
  assertValidProvider(provider);
  const config = await getRawConfig(provider);
  const secretFields = SECRET_FIELDS[provider];

  if (!config) {
    const masked = { configured: false };
    for (const field of secretFields) {
      masked[`${field}Set`] = false;
      masked[`${field}Preview`] = null;
    }
    return masked;
  }

  const masked = { configured: true };
  for (const [key, value] of Object.entries(config)) {
    if (secretFields.includes(key)) {
      const str = typeof value === 'string' ? value : '';
      masked[`${key}Set`] = str.length > 0;
      masked[`${key}Preview`] = str.length >= 4 ? `••••${str.slice(-4)}` : (str.length > 0 ? '••••' : null);
    } else {
      masked[key] = value;
    }
  }
  // A field that was never set at all (not just blank) still needs a
  // `<field>Set: false` entry — Object.entries above only covers keys
  // actually present in the stored config, which won't include a secret
  // field that's never been saved even once (e.g. webhookSigningSecret
  // saved before secretKey ever was).
  for (const field of secretFields) {
    if (!(`${field}Set` in masked)) {
      masked[`${field}Set`] = false;
      masked[`${field}Preview`] = null;
    }
  }
  return masked;
}

/**
 * Partial update — merges `fields` into whatever's already stored for
 * this provider. An empty-string or omitted value for a SECRET field
 * leaves the existing stored value untouched (see this file's header);
 * non-secret fields are always overwritten with whatever's supplied,
 * including an intentional blank.
 * @param {string} provider
 * @param {Object} fields - partial config, only the keys being changed
 * @param {string} updatedById
 */
export async function setConfig(provider, fields, updatedById) {
  assertValidProvider(provider);
  const organisationId = resolveOrganisationId();
  const secretFields = SECRET_FIELDS[provider];

  const existing = (await getRawConfig(provider)) ?? {};
  const merged = { ...existing };

  for (const [key, value] of Object.entries(fields)) {
    if (secretFields.includes(key)) {
      if (typeof value === 'string' && value.trim().length === 0) continue; // leave unchanged
      if (value === undefined) continue;
    }
    merged[key] = value;
  }

  const encryptedConfig = await encrypt(JSON.stringify(merged));

  await executeQuery(
    `INSERT INTO IntegrationCredential (id, organisationId, provider, encryptedConfig, updatedAt, updatedById)
     VALUES (@id, @organisationId, @provider, @encryptedConfig, NOW(), @updatedById)
     ON CONFLICT (organisationId, provider)
     DO UPDATE SET encryptedConfig = @encryptedConfig, updatedAt = NOW(), updatedById = @updatedById`,
    {
      id:              { type: sql.UniqueIdentifier, value: crypto.randomUUID() },
      organisationId:  { type: sql.UniqueIdentifier, value: organisationId },
      provider:        { type: sql.NVarChar(20), value: provider },
      encryptedConfig: { type: sql.NVarChar(sql.MAX), value: encryptedConfig },
      updatedById:     { type: sql.UniqueIdentifier, value: updatedById },
    }
  );

  return getMaskedStatus(provider);
}
