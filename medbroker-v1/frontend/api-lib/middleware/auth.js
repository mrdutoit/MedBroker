/**
 * middleware/auth.js
 *
 * Authorization: Bearer <token> issued by POST /api/auth/login, verified
 * via services/authService.js's verifyJwt() (hand-rolled HMAC-SHA256).
 *
 * FIXED 2 Aug 2026 — this used to fall back to trusting x-demo-user-id/
 * x-demo-role headers directly, with no verification at all, whenever
 * no Authorization header was present. That was a real, live
 * authentication bypass: anyone who knew or guessed a valid user id
 * could set two HTTP headers and gain full access as any user in any
 * role, including GlobalAdmin — no password, no token, nothing. It was
 * a deliberate testing convenience from before real login existed
 * (documented in VERCEL_NOTES.md as "useful for quickly testing a role
 * you haven't created a real user for yet"), and nobody ever came back
 * to remove it once real authentication was actually built. Removed
 * entirely, not gated behind an environment check — an app handling
 * real customer PII and financial data has no safe way to ship a
 * credential-free entry point, in any environment.
 *
 * Re-checks isActive (and isLocked) against the database after the
 * token itself checks out — a still-valid token isn't proof of
 * *current* access, same principle as the original Azure A3 spec this
 * was ported from.
 *
 * SESSION REVOCATION (added 2 Aug 2026, §97): also rejects a token
 * issued (iat) before the user's sessionsRevokedAt timestamp, if one is
 * set. A JWT is stateless by design — nothing here does a lookup
 * against the token itself — so without this, there was no way to
 * invalidate a specific token before its natural 8-hour expiry. Costs
 * nothing extra: sessionsRevokedAt is fetched as part of the exact same
 * getActiveUserById() call already happening for the isActive check.
 *
 * requireRole/authErrorResponse keep the same exported shape as the
 * Azure original so route handlers never change regardless.
 */

import { getActiveUserById } from '../services/userService.js';
import { verifyJwt } from '../services/authService.js';
import { config } from '../config.js';

/**
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<{ oid: string, roles: string[], name: string }>}
 */
export async function validateToken(req) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw { status: 401, message: 'Missing or invalid Authorization header' };
  }

  if (!config.localAuth.jwtSigningSecret) {
    throw { status: 500, message: 'JWT_SIGNING_SECRET is not configured on the server' };
  }
  const token = authHeader.slice(7);
  const payload = verifyJwt(token, config.localAuth.jwtSigningSecret); // throws 401 on bad signature/expiry

  // Re-check current status — a still-valid token doesn't mean still active.
  const user = await getActiveUserById(payload.oid);
  if (!user) {
    throw { status: 403, message: 'User is inactive, deleted, or not found in this organisation' };
  }

  // payload.iat is seconds since epoch (JWT convention), always floored to
  // a whole second; sessionsRevokedAt comes back from Postgres with
  // sub-second precision. A token freshly signed a few hundred ms after a
  // revocation — exactly what happens straight after a password change,
  // where revoke-then-reissue run microseconds apart — could otherwise be
  // floored to just before the revocation instant and be wrongly rejected
  // by its own replacement's first request. A small grace window fixes
  // this without weakening the check: an actually-old, stolen token was
  // issued minutes or hours earlier, never within 2 seconds of revocation.
  const REVOCATION_GRACE_MS = 2000;
  if (user.sessionsRevokedAt && payload.iat * 1000 < new Date(user.sessionsRevokedAt).getTime() - REVOCATION_GRACE_MS) {
    throw { status: 401, message: 'Session has been revoked. Please log in again.' };
  }

  return { oid: payload.oid, roles: [user.role], name: user.displayName };
}

/**
 * @param {{roles?: string[]}} claims
 * @param {string[]} allowedRoles
 */
export function requireRole(claims, allowedRoles) {
  const userRoles = claims.roles ?? [];
  const hasRole = allowedRoles.some((r) => userRoles.includes(r));
  if (!hasRole) {
    throw { status: 403, message: `Access denied. Required role(s): ${allowedRoles.join(', ')}` };
  }
}

/**
 * Standard error response body for a Vercel Node.js function handler.
 * Unlike the Azure version (which returns a jsonBody-shaped object), this
 * returns a plain object for the route to res.status(...).json(...) itself —
 * see api/leads/*.js for the calling convention.
 */
export function authErrorResponse(err) {
  return {
    status: err.status ?? 500,
    body: { error: err.message ?? 'Authentication error' },
  };
}
