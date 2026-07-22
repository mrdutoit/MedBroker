/**
 * services/authService.js — NEW, local-auth backend.
 *
 * Completes the auth.sso.enabled=false path FeatureFlag already describes
 * ("users log in with a standalone email and password managed within
 * MedBroker") but that was never implemented — only Entra SSO was built.
 * This coexists with Entra SSO, doesn't replace it; see middleware/auth.js
 * for how a request picks which path applies.
 *
 * JWT signing is hand-rolled (HMAC-SHA256 via node:crypto) rather than a
 * library, deliberately matching the manual JWT parsing/verification style
 * already used in the real Entra middleware/auth.js — same shape, same
 * dependencies-avoided philosophy, easy to compare side by side.
 *
 * Password complexity default (adjust if your policy differs): minimum 12
 * characters, at least one uppercase, one lowercase, one digit, one symbol.
 * Rotation period and lockout threshold are NOT hardcoded here — both are
 * read from SystemConfig at call time (see systemConfigService.js), because
 * Mark wants them admin-configurable, not fixed constants.
 */

import bcrypt from 'bcryptjs';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const BCRYPT_ROUNDS = 12;

// ── Password hashing ────────────────────────────────────────────────────────

/**
 * @param {string} plaintext
 * @returns {Promise<string>} bcrypt hash
 */
export async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

/**
 * @param {string} plaintext
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plaintext, hash) {
  if (!hash) return false; // SSO-only user has no password hash
  return bcrypt.compare(plaintext, hash);
}

/**
 * Default complexity policy. Returns a list of violation messages (empty = pass).
 * @param {string} plaintext
 * @returns {string[]}
 */
export function checkPasswordComplexity(plaintext) {
  const problems = [];
  if (!plaintext || plaintext.length < 12) problems.push('Must be at least 12 characters');
  if (!/[a-z]/.test(plaintext)) problems.push('Must include a lowercase letter');
  if (!/[A-Z]/.test(plaintext)) problems.push('Must include an uppercase letter');
  if (!/[0-9]/.test(plaintext)) problems.push('Must include a digit');
  if (!/[^A-Za-z0-9]/.test(plaintext)) problems.push('Must include a symbol');
  return problems;
}

// ── Local JWT (HMAC-SHA256) — hand-rolled, no library ──────────────────────

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

/**
 * @param {{oid: string, roles: string[], name: string, email: string}} claims
 * @param {string} secretBase64 - JWT_SIGNING_SECRET, base64-encoded
 * @param {number} [expiresInSeconds]
 * @returns {string}
 */
export function signJwt(claims, secretBase64, expiresInSeconds = 8 * 60 * 60) {
  const secret = Buffer.from(secretBase64, 'base64');
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { ...claims, iat: now, exp: now + expiresInSeconds };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');

  return `${signingInput}.${signature}`;
}

/**
 * Verifies signature and expiry. Throws { status: 401, message } on failure,
 * matching the same error shape validateToken() throws for Entra tokens.
 * @param {string} token
 * @param {string} secretBase64
 * @returns {{oid: string, roles: string[], name: string, email: string, iat: number, exp: number}}
 */
export function verifyJwt(token, secretBase64) {
  const secret = Buffer.from(secretBase64, 'base64');
  const parts = token.split('.');
  if (parts.length !== 3) throw { status: 401, message: 'Malformed token' };

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  // Constant-time comparison
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw { status: 401, message: 'Token signature verification failed' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
  } catch {
    throw { status: 401, message: 'Token payload decode failed' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw { status: 401, message: 'Token has expired' };

  return payload;
}

/**
 * A cryptographically random temporary password — for admin-created users
 * before they set their own. Not used by the bootstrap-admin flow, where
 * the caller supplies their own password directly.
 * @returns {string}
 */
export function generateTempPassword() {
  // 16 random bytes -> base64url is comfortably long and passes the default
  // complexity check (mixed case + digits are near-certain at this length;
  // a symbol is appended to guarantee it).
  return randomBytes(16).toString('base64url') + '!9';
}
