/**
 * middleware/auth.js
 * JWT validation middleware for Azure Entra ID External tokens.
 * Validates the Bearer token on every protected Azure Function request.
 *
 * Usage: const user = await validateToken(request);
 * Throws a 401 error if the token is missing, expired, or invalid.
 */

import { config } from '../config.js';

// JWKS cache — fetched once and refreshed when keys rotate
let jwksCache = null;
let jwksCacheExpiry = 0;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getJwks() {
  if (jwksCache && Date.now() < jwksCacheExpiry) return jwksCache;

  const jwksUrl = `https://login.microsoftonline.com/${config.auth.tenantId}/discovery/v2.0/keys`;
  const response = await fetch(jwksUrl);
  if (!response.ok) throw new Error('Failed to fetch JWKS from Entra ID');

  jwksCache = await response.json();
  jwksCacheExpiry = Date.now() + JWKS_CACHE_TTL_MS;
  return jwksCache;
}

/**
 * Parse and validate the JWT from the Authorization header.
 * Returns the decoded token payload (claims) on success.
 * Throws an object with { status: 401, message } on failure.
 *
 * @param {import('@azure/functions').HttpRequest} request
 * @returns {Promise<Object>} decoded JWT claims
 */
export async function validateToken(request) {
  const authHeader = request.headers.get('authorization') ?? request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw { status: 401, message: 'Authorization header missing or malformed' };
  }

  const token = authHeader.slice(7);

  // Decode the JWT header to get the key ID (kid)
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw { status: 401, message: 'Malformed JWT' };
  }

  let header, payload;
  try {
    header  = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch {
    throw { status: 401, message: 'JWT decode failed' };
  }

  // Validate standard claims
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw { status: 401, message: 'Token has expired' };
  }
  if (payload.nbf && payload.nbf > now) {
    throw { status: 401, message: 'Token not yet valid' };
  }
  if (payload.aud !== config.auth.clientId) {
    throw { status: 401, message: 'Token audience mismatch' };
  }
  // Issuer must match the expected tenant issuer. Without this check a validly
  // signed token from a different tenant/app could be accepted.
  if (config.auth.issuer && payload.iss !== config.auth.issuer) {
    throw { status: 401, message: 'Token issuer mismatch' };
  }
  // Token-type guard: this is an API and must only accept delegated *access*
  // tokens, not ID tokens. Access tokens carry a `scp` (scope) claim; ID tokens
  // do not. If a specific scope is configured, require it to be present.
  if (!payload.scp) {
    throw { status: 401, message: 'Not an access token (missing scope claim)' };
  }
  if (config.auth.apiScope) {
    const scopes = String(payload.scp).split(' ');
    if (!scopes.includes(config.auth.apiScope)) {
      throw { status: 401, message: 'Required API scope not present' };
    }
  }

  // Verify signature against the JWKS
  const jwks = await getJwks();
  const key = jwks.keys?.find(k => k.kid === header.kid);
  if (!key) {
    throw { status: 401, message: 'Signing key not found in JWKS' };
  }

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      key,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureInput = `${parts[0]}.${parts[1]}`;
    const signature = Buffer.from(parts[2], 'base64url');

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      signature,
      Buffer.from(signatureInput)
    );

    if (!valid) {
      throw { status: 401, message: 'JWT signature verification failed' };
    }
  } catch (err) {
    if (err.status) throw err;
    throw { status: 401, message: 'JWT signature verification error' };
  }

  // Return the decoded claims — includes oid (user ID), roles, email, name
  return payload;
}

/**
 * Assert the authenticated user has at least one of the required roles.
 * @param {Object} claims - decoded JWT payload from validateToken()
 * @param {string[]} allowedRoles - e.g. ['Admin', 'Supervisor']
 */
export function requireRole(claims, allowedRoles) {
  const userRoles = claims.roles ?? [];
  const hasRole = allowedRoles.some(r => userRoles.includes(r));
  if (!hasRole) {
    throw { status: 403, message: `Access denied. Required role(s): ${allowedRoles.join(', ')}` };
  }
}

/**
 * Standard error response helper for auth failures.
 * Returns the correct Azure Functions v4 response object.
 */
export function authErrorResponse(err) {
  return {
    status: err.status ?? 500,
    headers: { 'Content-Type': 'application/json' },
    jsonBody: { error: err.message ?? 'Authentication error' },
  };
}
