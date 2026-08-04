/**
 * src/config.js — DEMO BACKEND (Vercel + Neon)
 * Ported from api/src/config.js. Structural shape kept identical so route
 * and service files barely change; the Azure-specific sections (db, keyVault,
 * auth tenant/issuer) are replaced with their demo equivalents.
 *
 * All process.env access must go through this module.
 */

const required = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const optional = (key, defaultValue = undefined) => process.env[key] ?? defaultValue;

export const config = {
  organisationId: optional('ORG_ID', 'D0000000-0000-0000-0000-000000000001'),

  // Neon Postgres
  db: {
    connectionString: required('DATABASE_URL'),
  },

  // DEMO-ONLY encryption — see services/encryption.js for why this differs
  // from the Azure Key Vault envelope.
  demoEncryption: {
    masterKeyBase64: optional('DEMO_ENCRYPTION_KEY'),
  },

  // §111 (4 Aug 2026) — AWS KMS-backed envelope wrapping, replacing the
  // demoEncryption master key above for all NEW encrypt() calls. This is
  // the real fix for encryption.js's own "DO NOT use this for real
  // POPIA-classified data" warning — the actual AES key material never
  // exists in Vercel at all this way, only a scoped IAM credential that
  // can ask KMS to wrap/unwrap on the app's behalf. See encryption.js's
  // header comment for the full design and the 'kms1'/'demo1' format-
  // marker backward-compatibility story. Both fields optional() at this
  // layer, not required() — encryption.js itself throws a clear,
  // actionable error at call time if they're missing when actually
  // needed, matching demoEncryption's own established pattern, rather
  // than crashing every cold start before a single request is served.
  kms: {
    masterKeyId: optional('KMS_MASTER_KEY_ID'),
    region:      optional('AWS_REGION'),
  },

  security: {
    blindIndexKey: optional('ID_NUMBER_INDEX_KEY'),
  },

  // Local auth (standalone email/password — see services/authService.js)
  localAuth: {
    jwtSigningSecret: optional('JWT_SIGNING_SECRET'),
    bootstrapSecret:  optional('BOOTSTRAP_SECRET'),
  },

  // Entra ID SSO — stage 2 (4 Aug 2026, §114). Backend-side, deliberately
  // NOT the VITE_-prefixed pair authConfig.js already reads (those are
  // Vite build-time vars baked into the frontend bundle; a Vercel
  // Function needs its own server-side copies, read at request time like
  // everything else in this file). Both optional() here, not required() —
  // entraAuthService.js itself throws a clear, actionable error at call
  // time if they're missing when auth.sso.enabled is actually turned on,
  // matching the kms/demoEncryption precedent above rather than crashing
  // every cold start before a single request is served.
  entra: {
    tenantId: optional('ENTRA_TENANT_ID'),
    clientId: optional('ENTRA_CLIENT_ID'),
  },

  // Lead Portal auth (services/leadPortalService.js) — deliberately a
  // SEPARATE secret from localAuth above, not a shared one with a
  // different claim shape. A prospect token must never verify against a
  // staff route (or vice versa) even if someone tried — two different
  // keys makes that structurally impossible, not just policy-enforced.
  portalAuth: {
    jwtSigningSecret: optional('PORTAL_JWT_SIGNING_SECRET'),
  },

  // Optional — broker matching (services/brokerMatchingService.js) runs
  // correctly in degraded mode (ranks by fewest upcoming appointments,
  // no live slot confirmation) with this entirely unset. Only needed if a
  // real Calendly account is connected for live availability checking.
  calendly: {
    apiToken: optional('CALENDLY_API_TOKEN'),
    baseUrl:  optional('CALENDLY_BASE_URL', 'https://api.calendly.com'),
  },

  app: {
    nodeEnv:         optional('NODE_ENV', 'development'),
    maxCallAttempts: parseInt(optional('MAX_CALL_ATTEMPTS', '3'), 10),
    frontendOrigin:  optional('FRONTEND_ORIGIN', 'http://localhost:5173'),
  },
};
