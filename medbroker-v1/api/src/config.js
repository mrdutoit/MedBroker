/**
 * config.js
 * Centralised environment configuration for the MedBroker API.
 * All process.env access must go through this module — never read env vars directly elsewhere.
 * Fails fast at startup if any required variable is missing.
 */

const required = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const optional = (key, defaultValue = undefined) => process.env[key] ?? defaultValue;

export const config = {
  // Azure SQL Database
  db: {
    server:   required('DB_SERVER'),
    database: required('DB_NAME'),
    port:     parseInt(optional('DB_PORT', '1433'), 10),
    // Managed Identity is used in production — no username/password needed.
    // For local dev, set DB_USE_PASSWORD=true and supply DB_USER + DB_PASSWORD.
    usePassword: optional('DB_USE_PASSWORD', 'false') === 'true',
    user:     optional('DB_USER'),
    password: optional('DB_PASSWORD'),
  },

  // Azure Key Vault — used to retrieve the field-level encryption key for ID numbers
  keyVault: {
    url:          required('KEY_VAULT_URL'),
    encKeyName:   optional('KEY_VAULT_ENC_KEY_NAME', 'lead-id-number-key'),
  },

  // Azure Entra ID External — JWT validation
  auth: {
    tenantId:   required('ENTRA_TENANT_ID'),
    clientId:   required('ENTRA_CLIENT_ID'),
    authority:  optional('ENTRA_AUTHORITY'), // e.g. https://login.microsoftonline.com/{tenantId}
    // Expected token issuer. Defaults to the standard Entra v2 issuer for the
    // tenant; override (ENTRA_ISSUER) for Entra External ID / CIAM, whose issuer
    // differs (e.g. https://<tenant>.ciamlogin.com/<tenantId>/v2.0).
    issuer:     optional('ENTRA_ISSUER', `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/v2.0`),
    // Optional: the delegated scope the access token must contain (e.g. 'access_as_user').
    apiScope:   optional('ENTRA_API_SCOPE'),
  },

  // Security — keyed-hash (HMAC) for the ID-number blind index used for dedup.
  // Lets us find duplicate leads by ID number without storing it in plaintext.
  // Generate a random 32-byte key and store it as a secret. If unset, dedup
  // falls back to email only.
  security: {
    blindIndexKey: optional('ID_NUMBER_INDEX_KEY'),
  },

  // Front Door — when set, the public registration endpoint only accepts
  // requests carrying this Front Door ID header (blocks direct Function URL hits).
  frontDoor: {
    id: optional('FRONT_DOOR_ID'),
  },

  // Calendly integration
  calendly: {
    apiToken:    optional('CALENDLY_API_TOKEN'),
    baseUrl:     optional('CALENDLY_BASE_URL', 'https://api.calendly.com'),
  },

  // Zoho CRM integration
  zoho: {
    clientId:     optional('ZOHO_CLIENT_ID'),
    clientSecret: optional('ZOHO_CLIENT_SECRET'),
    refreshToken: optional('ZOHO_REFRESH_TOKEN'),
    baseUrl:      optional('ZOHO_BASE_URL', 'https://www.zohoapis.com/crm/v3'),
  },

  // Azure Communication Services — email and SMS notifications
  comms: {
    connectionString: optional('ACS_CONNECTION_STRING'),
    senderEmail:      optional('ACS_SENDER_EMAIL', 'noreply@medbroker.co.za'),
  },

  // App settings
  app: {
    nodeEnv:             optional('NODE_ENV', 'development'),
    maxCallAttempts:     parseInt(optional('MAX_CALL_ATTEMPTS', '3'), 10),
    qrTokenExpiryHours: parseInt(optional('QR_TOKEN_EXPIRY_HOURS', '720'), 10),
    frontendOrigin:      optional('FRONTEND_ORIGIN', 'http://localhost:5173'),
  },
};
