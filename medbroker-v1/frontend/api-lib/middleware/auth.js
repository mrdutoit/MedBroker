/**
 * middleware/auth.js — DEMO BACKEND, two auth paths.
 *
 * Path 1 — local JWT (NEW): Authorization: Bearer <token> issued by
 * POST /api/auth/login. Verified via services/authService.js's verifyJwt()
 * (hand-rolled HMAC-SHA256, same style as the real Entra middleware's manual
 * JWT parsing). This is real authentication now, not a bypass.
 *
 * Path 2 — header bypass (unchanged from the previous session): the
 * x-demo-user-id / x-demo-role headers, kept for quick manual testing
 * without needing to log in first. Only used when no Authorization header
 * is present.
 *
 * Both paths re-check isActive (and, for local JWT, isLocked) against the
 * database after the credential itself checks out — a token or header
 * claiming to be a user isn't sufficient proof of *current* access, same
 * principle as the Azure A3 spec.
 *
 * requireRole/authErrorResponse keep the same exported shape as the Azure
 * original so route handlers never change regardless of which path fires.
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

  if (authHeader && authHeader.startsWith('Bearer ')) {
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

    return { oid: payload.oid, roles: [user.role], name: user.displayName };
  }

  // Fallback: header bypass for manual testing without a login flow.
  const userId = req.headers['x-demo-user-id'];
  const role = req.headers['x-demo-role'];
  if (!userId || !role) {
    throw { status: 401, message: 'No Authorization header and no x-demo-user-id/x-demo-role headers — see middleware/auth.js' };
  }

  const user = await getActiveUserById(userId);
  if (!user) {
    throw { status: 403, message: 'User is inactive, deleted, or not found in this organisation' };
  }

  return { oid: userId, roles: [role], name: user.displayName };
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
