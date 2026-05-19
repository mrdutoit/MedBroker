/**
 * services/db.js
 * Azure SQL connection pool for MedBroker API.
 * Uses Managed Identity in production (no credentials in code).
 * Falls back to username/password when DB_USE_PASSWORD=true (local dev only).
 */

import sql from 'mssql';
import { DefaultAzureCredential } from '@azure/identity';
import { config } from '../config.js';

let pool = null;

async function getAccessToken() {
  const credential = new DefaultAzureCredential();
  const tokenResponse = await credential.getToken('https://database.windows.net/.default');
  return tokenResponse.token;
}

/**
 * Returns an initialised connection pool. Creates it on first call, reuses on subsequent calls.
 * @returns {Promise<sql.ConnectionPool>}
 */
export async function getPool() {
  if (pool && pool.connected) return pool;

  let sqlConfig;

  if (config.db.usePassword) {
    // Local development — SQL auth
    sqlConfig = {
      server:   config.db.server,
      database: config.db.database,
      port:     config.db.port,
      user:     config.db.user,
      password: config.db.password,
      options: {
        encrypt:              true,
        trustServerCertificate: false,
      },
    };
  } else {
    // Production — Managed Identity (no secrets in config)
    const token = await getAccessToken();
    sqlConfig = {
      server:   config.db.server,
      database: config.db.database,
      port:     config.db.port,
      options: {
        encrypt:              true,
        trustServerCertificate: false,
      },
      authentication: {
        type: 'azure-active-directory-access-token',
        options: { token },
      },
    };
  }

  pool = await sql.connect(sqlConfig);
  return pool;
}

/**
 * Execute a parameterised query and return all rows.
 * Always use this function — never interpolate values directly into SQL strings.
 *
 * @param {string} query - SQL query string with @param placeholders
 * @param {Object} params - Key/value map of parameters: { paramName: { type: sql.Type, value: any } }
 * @returns {Promise<sql.IRecordSet>}
 *
 * @example
 * await executeQuery(
 *   'SELECT * FROM Lead WHERE id = @id',
 *   { id: { type: sql.UniqueIdentifier, value: leadId } }
 * )
 */
export async function executeQuery(query, params = {}) {
  const dbPool = await getPool();
  const request = dbPool.request();

  for (const [name, { type, value }] of Object.entries(params)) {
    request.input(name, type, value);
  }

  const result = await request.query(query);
  return result.recordset;
}

/**
 * Execute a parameterised query and return the first row only, or null.
 */
export async function executeQueryOne(query, params = {}) {
  const rows = await executeQuery(query, params);
  return rows.length > 0 ? rows[0] : null;
}

export { sql };
