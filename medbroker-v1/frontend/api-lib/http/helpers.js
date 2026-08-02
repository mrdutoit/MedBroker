/**
 * src/http/helpers.js — small shared utilities for Vercel Function route
 * handlers. Not present in the Azure version because Azure Functions v4
 * and Front Door handle CORS/routing differently — this is demo-stack glue,
 * not ported business logic.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/**
 * Applies CORS headers and short-circuits OPTIONS preflight requests.
 * Call first in every handler:
 *   if (applyCors(req, res)) return;
 *
 * Reflects whatever Origin the request actually sent (including the literal
 * string "null", which is what a file:// page sends) rather than a single
 * hardcoded FRONTEND_ORIGIN. This isn't a loosened security boundary: none
 * of these routes use cookies, so there's no cross-site-cookie risk CORS
 * would otherwise be protecting against — every route is authorized by an
 * explicit Authorization: Bearer token or a request-body secret
 * (BOOTSTRAP_SECRET), both of which a browser never attaches automatically
 * the way it would a cookie. Restricting Origin here would only break
 * legitimate callers (this demo's bootstrap-admin.html, Postman-style tools,
 * a future frontend on a different domain) without adding real protection.
 *
 * Found by testing this against a real browser via Playwright, not by
 * inspection — a hardcoded Access-Control-Allow-Origin silently breaks any
 * caller whose origin doesn't match it, file:// pages included.
 *
 * @returns {boolean} true if the request was a preflight and already answered
 */
export function applyCors(req, res) {
  const origin = req.headers['origin'];
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  if (origin) res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

/**
 * parseSlug — added 22 July 2026, replacing the bracket catch-all file
 * convention ([...slug].js / [[...slug]].js), which turned out not to be
 * recognized as a route by Vercel outside a Next.js project — confirmed
 * by direct testing against the live deployment (every route depending on
 * it 404'd; a plain file like health.js worked fine). Routing now goes
 * through vercel.json rewrites instead (the same mechanism already
 * proven working here for the SPA fallback), with the remaining path
 * passed through as a `slug` query parameter.
 *
 * Deliberately defensive about the exact shape that parameter arrives in
 * — Vercel's docs are not fully explicit about whether a wildcard rewrite
 * capture serializes as a single slash-joined string, a repeated query
 * param (arriving as an array), or something else, and this was already
 * wrong once. Handles all three shapes so the routers don't care which
 * one actually shows up:
 *   - array                      -> used as-is
 *   - string containing "/"      -> split into segments
 *   - plain string, no slash     -> single-element array
 *   - undefined / empty string   -> empty array (the bare-path case)
 * @param {unknown} slug - req.query.slug
 * @returns {string[]}
 */
export function parseSlug(slug) {
  if (slug === undefined || slug === null || slug === '') return [];
  if (Array.isArray(slug)) return slug.flatMap((s) => String(s).split(/[/,]/)).filter(Boolean);
  return String(slug).split(/[/,]/).filter(Boolean);
}

/**
 * Serializes an array of flat objects to CSV text — added for audit log
 * export (§77), written generically enough to reuse for any future
 * export feature. Properly escapes fields containing a comma, a double
 * quote, or a newline (wraps in quotes, doubles any internal quotes) —
 * the standard CSV escaping rule, not just "hope nothing has a comma in
 * it". Nested objects/arrays (e.g. an audit entry's changeDetail) are
 * JSON.stringify'd into a single cell rather than flattened, so the
 * output stays one row per input row regardless of field shape.
 * @param {Array<Object>} rows
 * @param {Array<{key: string, label: string}>} columns
 * @returns {string}
 */
export function toCsv(rows, columns) {
  function escapeCell(value) {
    if (value === null || value === undefined) return '';
    const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  }

  const header = columns.map(c => escapeCell(c.label)).join(',');
  const lines = rows.map(row => columns.map(c => escapeCell(row[c.key])).join(','));
  return [header, ...lines].join('\r\n');
}

