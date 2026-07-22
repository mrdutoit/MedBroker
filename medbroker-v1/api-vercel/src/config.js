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

  security: {
    blindIndexKey: optional('ID_NUMBER_INDEX_KEY'),
  },

  // Local auth (standalone email/password — see services/authService.js)
  localAuth: {
    jwtSigningSecret: optional('JWT_SIGNING_SECRET'),
    bootstrapSecret:  optional('BOOTSTRAP_SECRET'),
  },

  app: {
    nodeEnv:         optional('NODE_ENV', 'development'),
    maxCallAttempts: parseInt(optional('MAX_CALL_ATTEMPTS', '3'), 10),
    frontendOrigin:  optional('FRONTEND_ORIGIN', 'http://localhost:5173'),
  },
};
