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
 * hardcoded FRONTEND_ORIGIN. Restricting Origin here would only break
 * legitimate callers (this demo's bootstrap-admin.html, Postman-style tools,
 * a future frontend on a different domain) without adding real protection.
 *
 * UPDATED §113 (4 Aug 2026) — staff auth now uses an httpOnly cookie
 * (setAuthCookie() below), which changes the reasoning this comment used
 * to give (it used to say "none of these routes use cookies, so there's
 * no cross-site-cookie risk" — no longer true, corrected rather than left
 * stale). The permissive Origin reflection stays SAFE despite that,
 * specifically because of two things that must both remain true:
 *   1. The auth cookie is SameSite=Strict (see setAuthCookie) — a browser
 *      never attaches a Strict cookie to a cross-site request at all,
 *      fetch/XHR included, regardless of what this function does with
 *      the Origin header.
 *   2. This function never sets Access-Control-Allow-Credentials: true.
 *      Without that header, even a browser willing to attach credentials
 *      wouldn't get to read the response back into cross-origin JS.
 * If either of those ever changes, this Origin-reflection approach needs
 * re-examining — it is not safe on its own merits with a cookie in play,
 * only safe because of those two constraints holding together.
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

const AUTH_COOKIE_NAME = 'mb_session';

/**
 * Sets the staff-auth session cookie (§113) — replaces returning the raw
 * JWT in a JSON response body, which let it be cached/logged/read by any
 * JS on the page, including injected/malicious JS via XSS. An httpOnly
 * cookie is never readable by JavaScript at all, by design, regardless
 * of what runs on the page.
 *
 * SameSite=Strict, not Lax or None — this app is a single-origin SPA
 * with no legitimate cross-site request or top-level-navigation-into-
 * the-app flow that would need a looser setting, so Strict is both safe
 * and correct here, not just the cautious default. Secure is forced on
 * regardless of NODE_ENV — Vercel serves everything over HTTPS, including
 * preview deployments, so there's no real local-HTTP case this would
 * break, and hardcoding it removes an easy way to accidentally ship a
 * non-Secure cookie.
 *
 * maxAge matches signJwt()'s own default (8 hours) — the cookie and the
 * token it carries should expire together, not have the cookie outlive
 * a token that's already invalid, or vice versa.
 * @param {import('http').ServerResponse} res
 * @param {string} token
 * @param {number} [maxAgeSeconds]
 */
export function setAuthCookie(res, token, maxAgeSeconds = 8 * 60 * 60) {
  res.setHeader('Set-Cookie',
    `${AUTH_COOKIE_NAME}=${token}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; Secure; SameSite=Strict`
  );
}

/**
 * Clears the staff-auth session cookie (logout, §113). Max-Age=0 is the
 * standard way to tell a browser to delete a cookie immediately — an
 * expired past date works too, but Max-Age=0 doesn't depend on the
 * client's clock being correct.
 * @param {import('http').ServerResponse} res
 */
export function clearAuthCookie(res) {
  res.setHeader('Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`
  );
}

/**
 * Reads the staff-auth token out of the incoming Cookie header. No
 * dependency added for this — Cookie headers are a simple `k=v; k2=v2`
 * format, and this app only ever needs to read the one cookie it itself
 * set, not handle arbitrary third-party cookie edge cases a general-
 * purpose parser exists for.
 * @param {import('http').IncomingMessage} req
 * @returns {string|null}
 */
export function getAuthCookie(req) {
  const header = req.headers['cookie'];
  if (!header) return null;
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const key = pair.slice(0, eq).trim();
    if (key === AUTH_COOKIE_NAME) return decodeURIComponent(pair.slice(eq + 1).trim());
  }
  return null;
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

