/**
 * api-lib/services/entraAuthService.js — NEW, §114 (4 Aug 2026, stage 2).
 *
 * Validates a Microsoft Entra ID (Azure AD) ID token against Entra's own
 * published JWKS — the "wholly new backend Entra-token-validation layer"
 * §110 flagged as the genuinely missing piece (middleware/auth.js's
 * validateToken() only ever verified the local hand-rolled HS256 JWT, no
 * code path for an Entra-issued token at all).
 *
 * DELIBERATELY NOT wired into middleware/auth.js. Once an Entra ID token
 * is validated here (called from handleEntraLogin, authHandlers.js), the
 * app issues its OWN local session JWT via authService.signJwt() /
 * setAuthCookie() — exactly the same session a local-auth login produces.
 * Every subsequent request is then governed by the one existing session-
 * validation path (middleware/auth.js: isActive re-check, sessionsRevokedAt,
 * role), regardless of how the session started. This matches Mark's own
 * design decision (e) from §109/§110: SSO only proves identity once, at
 * login — role/authorization/session-revocation/isActive stay entirely
 * MedBroker-managed, the same way for every user regardless of auth path.
 * It also keeps this file's job narrow and auditable (verify a token, hand
 * back claims) rather than building a second, parallel per-request auth
 * system that has to be kept in sync with the first one.
 *
 * Uses `jose` (new dependency, §114) rather than hand-rolling, unlike
 * authService.js's local HMAC JWT. That file's "no library" choice was
 * deliberate because HS256 signing/verification with a symmetric secret
 * this app itself controls is genuinely simple to get right by hand.
 * Verifying an RS256 token against a THIRD PARTY's rotating public key set
 * (JWKS, fetched over the network, cached, rotated without notice) is a
 * different problem — jose is the standard, actively-maintained, zero-
 * dependency library built specifically for this, and hand-rolling it
 * would be the wrong kind of "simple to get right by hand."
 *
 * TESTABILITY: verifyEntraIdToken() below takes the JWKS resolver and
 * expected issuer/audience/tenant as explicit parameters rather than
 * reaching into config/network itself — see entraAuthService.test.js,
 * which signs a real token against a locally-generated RSA keypair
 * (jose's own createLocalJWKSet) and drives this function directly, real
 * run coverage rather than a code-review-only claim. validateEntraToken()
 * is the thin, real-config wrapper actually called by authHandlers.js; it
 * is NOT itself unit-testable without a live Entra tenant, matching every
 * other piece of this project's work that touches infrastructure this
 * sandbox can't reach (WAF, AWS KMS, migrations).
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config.js';

let _remoteJwks = null;
function getRemoteJwks(tenantId) {
  // Constructed once and reused across calls within the same warm Vercel
  // Function instance — createRemoteJWKSet's returned resolver already
  // handles its own key-rotation caching internally (refetches on a
  // signature/kid miss, rate-limited), this just avoids rebuilding the
  // resolver itself on every request.
  if (!_remoteJwks) {
    _remoteJwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)
    );
  }
  return _remoteJwks;
}

/**
 * Pure verification core — no config or network access of its own, takes
 * the key resolver and expected claims explicitly. This is what makes it
 * unit-testable without a real Entra tenant.
 * @param {string} idToken
 * @param {import('jose').JWTVerifyGetKey} jwks - a jose key resolver (remote or local)
 * @param {{ issuer: string, audience: string, tenantId?: string }} expected
 * @returns {Promise<{ entraObjectId: string, email: string, displayName: string, tenantId: string|undefined }>}
 */
export async function verifyEntraIdToken(idToken, jwks, expected) {
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, jwks, {
      issuer: expected.issuer,
      audience: expected.audience,
    }));
  } catch {
    // jose throws typed errors (JWTExpired, JWTClaimValidationFailed,
    // JWSSignatureVerificationFailed, etc.) — collapsed to the same 401
    // shape authErrorResponse() already expects everywhere else in this
    // codebase, deliberately without exposing which specific check failed
    // (signature vs expiry vs issuer vs audience) to the caller.
    throw { status: 401, message: 'SSO token could not be verified' };
  }

  // Belt-and-braces beyond the issuer string match above: an Entra v2.0 ID
  // token also carries the tenant directly as its own claim (tid). The
  // issuer URL already encodes the tenant, so this is redundant in the
  // honest case — it's cheap insurance against a subtly-too-loose issuer
  // ever being configured (e.g. the multi-tenant /common/ or /organizations/
  // endpoint, which this app never uses but a copy-pasted config value
  // could accidentally point at).
  if (expected.tenantId && payload.tid !== expected.tenantId) {
    throw { status: 401, message: 'SSO token tenant does not match this deployment' };
  }

  if (!payload.oid) {
    throw { status: 401, message: 'SSO token is missing the required oid claim' };
  }

  const email = (payload.preferred_username || payload.email || '').toLowerCase().trim();
  if (!email) {
    throw { status: 401, message: 'SSO token does not carry an email address' };
  }

  return {
    entraObjectId: payload.oid,
    email,
    displayName: payload.name || email,
    tenantId: payload.tid,
  };
}

/**
 * Real-config wrapper — what authHandlers.js's handleEntraLogin actually
 * calls. Reads ENTRA_TENANT_ID / ENTRA_CLIENT_ID (config.entra) and fetches
 * the real Microsoft JWKS endpoint for the configured tenant.
 * @param {string} idToken
 * @returns {Promise<{ entraObjectId: string, email: string, displayName: string, tenantId: string }>}
 */
export async function validateEntraToken(idToken) {
  const { tenantId, clientId } = config.entra;
  if (!tenantId || !clientId) {
    throw {
      status: 500,
      message: 'ENTRA_TENANT_ID and/or ENTRA_CLIENT_ID are not configured on the server',
    };
  }

  const jwks = getRemoteJwks(tenantId);
  return verifyEntraIdToken(idToken, jwks, {
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    audience: clientId,
    tenantId,
  });
}
