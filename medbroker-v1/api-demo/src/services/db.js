/**
 * services/db.js — DEMO BACKEND (Neon Postgres via `pg`)
 * Ported from api/src/services/db.js (Azure SQL via `mssql`).
 *
 * WHY THE SHIM: every service file ported from Azure was written against
 * mssql's call shape — executeQuery(query, { name: { type: sql.X, value } })
 * with `@name` placeholders and `GETUTCDATE()`. Rather than rewrite every
 * parameter binding in every service (high effort, high diff-noise against
 * the Azure original, no benefit), this file exposes the SAME shape on top
 * of `pg`:
 *   - `sql.X` type markers become inert no-ops (Postgres infers types from
 *     the JS value; the `type` field is accepted but ignored)
 *   - `@name` placeholders are rewritten to positional $1, $2... in order of
 *     first appearance, repeats reuse the same index (pg allows this)
 *   - executeQuery/executeQueryOne keep the exact same function signatures
 *
 * What ported query TEXT still has to change (this shim can't paper over it):
 *   GETUTCDATE()  -> NOW()
 *   [User]        -> "User"
 *   OFFSET..FETCH NEXT..ROWS ONLY -> LIMIT..OFFSET
 *   LIKE          -> ILIKE (Postgres LIKE is case-sensitive by default)
 * See leadService.js for worked examples.
 */

import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: config.db.connectionString,
      ssl: { rejectUnauthorized: false }, // Neon requires TLS; pooled connections terminate it upstream
      max: 5, // serverless — keep the pool small, Neon's own pooler handles the rest
    });
  }
  return pool;
}

/**
 * Inert type-marker shim so `sql.UniqueIdentifier`, `sql.NVarChar(100)`,
 * `sql.NVarChar(sql.MAX)` etc. — copied verbatim from ported mssql query
 * parameter objects — resolve to *something* callable without throwing.
 * The value is never read; Postgres infers parameter types from the JS value.
 */
function makeTypeMarker() {
  const marker = () => marker;
  marker.MAX = 'MAX';
  return marker;
}
export const sql = new Proxy({}, { get: () => makeTypeMarker() });

/**
 * Rewrites `@name` placeholders in a T-SQL-style query string to positional
 * $1, $2... parameters, and returns the matching ordered value array.
 * Repeated occurrences of the same @name reuse the same $N — valid in pg.
 */
function toPositional(query, params) {
  const order = [];
  const indexOf = new Map();

  const pgQuery = query.replace(/@(\w+)/g, (_match, name) => {
    if (!indexOf.has(name)) {
      order.push(name);
      indexOf.set(name, order.length); // 1-based
    }
    return `$${indexOf.get(name)}`;
  });

  const values = order.map((name) => {
    if (!(name in params)) {
      throw new Error(`db.js: query references @${name} but no matching parameter was supplied`);
    }
    return params[name].value;
  });

  return { pgQuery, values };
}

/**
 * Execute a parameterised query and return all rows.
 * Same signature as the Azure version: executeQuery(query, { name: { type, value } }).
 * @param {string} query - query text with @param placeholders
 * @param {Object} params
 * @returns {Promise<Array<Object>>}
 */
export async function executeQuery(query, params = {}) {
  const { pgQuery, values } = toPositional(query, params);
  const client = getPool();
  const result = await client.query(pgQuery, values);
  return result.rows;
}

/**
 * Execute a parameterised query and return the first row only, or null.
 */
export async function executeQueryOne(query, params = {}) {
  const rows = await executeQuery(query, params);
  return rows.length > 0 ? rows[0] : null;
}
