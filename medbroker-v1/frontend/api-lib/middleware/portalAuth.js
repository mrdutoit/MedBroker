/**
 * middleware/portalAuth.js — NEW, 24 Jul 2026.
 * Structurally separate from middleware/auth.js (staff). Own JWT signing
 * secret (config.portalAuth), own claim shape ({ type: 'portal', leadId,
 * portalAccountId }), no x-demo-user-id header-bypass fallback — a
 * prospect always needs a real token, no testing shortcut. The `type`
 * claim is defense in depth on top of the separate secret: even if the
 * two secrets were ever accidentally set to the same value, a staff
 * token still wouldn't carry `type: 'portal'` and would be rejected here,
 * and a portal token wouldn't carry `roles` and would fail requireRole()
 * on the staff side.
 */

import { verifyJwt } from '../services/authService.js';
import { getActivePortalAccountById } from '../services/leadPortalService.js';
import { config } from '../config.js';

/**
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<{ leadId: string, portalAccountId: string, email: string }>}
 */
export async function validatePortalToken(req) {
  if (!config.portalAuth.jwtSigningSecret) {
    throw { status: 500, message: 'PORTAL_JWT_SIGNING_SECRET is not configured on the server' };
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw { status: 401, message: 'No Authorization header' };
  }

  const token = authHeader.slice(7);
  const payload = verifyJwt(token, config.portalAuth.jwtSigningSecret); // throws 401 on bad signature/expiry

  if (payload.type !== 'portal') {
    throw { status: 401, message: 'Not a portal token' };
  }

  // Re-check current status — a still-valid token doesn't mean the
  // account isn't locked (or has been soft-deleted) since it was issued.
  const account = await getActivePortalAccountById(payload.portalAccountId);
  if (!account) {
    throw { status: 403, message: 'Account is locked, deleted, or not found' };
  }

  return { leadId: account.leadId, portalAccountId: account.id, email: account.email };
}

/**
 * Same shape as authErrorResponse in middleware/auth.js.
 */
export function portalAuthErrorResponse(err) {
  return {
    status: err.status ?? 500,
    body: { error: err.message ?? 'Authentication error' },
  };
}
