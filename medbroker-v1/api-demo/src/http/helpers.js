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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-demo-user-id, x-demo-role');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
