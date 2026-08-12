/**
 * services/db.js — DEMO BACKEND (Neon Postgres via `@neondatabase/serverless`)
 * Ported from api/src/services/db.js (Azure SQL via `mssql`).
 *
 * REWRITTEN 12 Aug 2026 — moved off `pg`'s Pool onto Neon's own HTTP driver
 * (`neon()`). Root cause this replaces: `pg.Pool` held a single module-scope
 * connection pool across invocations with no `pool.on('error', ...)` handler
 * and no idle/connection timeouts. In Vercel's freeze/thaw execution model,
 * a frozen function's pooled TCP sockets can be reset by the network or
 * Neon's proxy while suspended; the next warm invocation handed out that
 * same dead connection, and — because nothing was listening for the pool's
 * background 'error' event — node-postgres treats that as unhandled and
 * crashes the whole function process, not just the one query. That's what
 * was surfacing as Audit Log, Reports, and Integrations all intermittently
 * failing: every one of them goes through this one shared file.
 *
 * Neon's HTTP driver removes the failure class entirely rather than
 * mitigating it: `neon()` holds no persistent connection at all — every
 * call is its own stateless HTTPS request to Neon's data API, so there's
 * nothing to go stale across a freeze/thaw cycle and nothing to leave an
 * unhandled 'error' listener on. Confirmed no part of this codebase uses
 * an explicit BEGIN/COMMIT transaction (every write here is already a
 * single guarded statement — see tokenService.js's own header for why),
 * so the HTTP driver's single-statement-per-call model costs nothing.
 *
 * WHY THE SHIM STAYS: every service file was written against mssql's call
 * shape — executeQuery(query, { name: { type: sql.X, value } }) with
 * `@name` placeholders and `GETUTCDATE()`. Rather than rewrite every
 * parameter binding in every service (high effort, high diff-noise, no
 * benefit), this file still exposes the SAME shape on top of whichever
 * driver sits underneath:
 *   - `sql.X` type markers stay inert no-ops (Postgres infers types from
 *     the JS value; the `type` field is accepted but ignored)
 *   - `@name` placeholders are rewritten to positional $1, $2... in order of
 *     first appearance, repeats reuse the same index
 *   - executeQuery/executeQueryOne keep the exact same function signatures
 *     and return shapes as before — every caller across the app is
 *     unaffected by this change.
 *
 * What ported query TEXT still has to change (this shim can't paper over it):
 *   GETUTCDATE()  -> NOW()
 *   [User]        -> "User"
 *   OFFSET..FETCH NEXT..ROWS ONLY -> LIMIT..OFFSET
 *   LIKE          -> ILIKE (Postgres LIKE is case-sensitive by default)
 * See leadService.js for worked examples.
 */

import { neon } from '@neondatabase/serverless';
import { config } from '../config.js';

let queryFn = null;

/**
 * Memoized Neon HTTP query function — cheap to create, no connection is
 * opened until a query actually runs, and nothing here is held open
 * between invocations, so there's no freeze/thaw state to go stale.
 */
function getSql() {
  if (!queryFn) {
    queryFn = neon(config.db.connectionString);
  }
  return queryFn;
}

/**
 * Inert type-marker shim so `sql.UniqueIdentifier`, `sql.NVarChar(100)`,
 * `sql.NVarChar(sql.MAX)` etc. — copied verbatim from ported mssql query
 * parameter objects — resolve to *something* callable without throwing.
 * The value is never read; Postgres infers parameter types from the JS value.
 *
 * NAMING NOTE: this is deliberately NOT the same `sql` as Neon's own tagged-
 * template query function (that one is never assigned to a module-level
 * name here at all — see getSql() above, which stores it as `queryFn`) —
 * every existing service file does `import { executeQuery, sql } from
 * './db.js'` expecting THIS inert marker object, not Neon's driver.
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
 * Repeated occurrences of the same @name reuse the same $N.
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
 * Neon's `.query()` returns rows directly (no `fullResults` option set),
 * matching what this function has always returned to its callers.
 * @param {string} query - query text with @param placeholders
 * @param {Object} params
 * @returns {Promise<Array<Object>>}
 */
export async function executeQuery(query, params = {}) {
  const { pgQuery, values } = toPositional(query, params);
  const rows = await getSql().query(pgQuery, values);
  return rows;
}

/**
 * Execute a parameterised query and return the first row only, or null.
 */
export async function executeQueryOne(query, params = {}) {
  const rows = await executeQuery(query, params);
  return rows.length > 0 ? rows[0] : null;
}
