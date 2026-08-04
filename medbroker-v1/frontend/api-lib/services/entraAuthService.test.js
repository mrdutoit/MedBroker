/**
 * api-lib/services/entraAuthService.test.js — NEW, §114 (4 Aug 2026).
 *
 * Real, run test coverage for verifyEntraIdToken() — the actual claim-
 * extraction/validation logic, not just a code-review claim (same
 * standard §113's cookie-parsing tests set). Cannot test
 * validateEntraToken() (the real-config wrapper) the same way: that one
 * hits Microsoft's actual JWKS endpoint over the network and needs a real
 * Entra tenant to produce a genuinely Entra-issued token, neither of
 * which exists in this sandbox — same caveat already applied to every
 * other piece of infrastructure this environment can't reach.
 *
 * Builds its own RSA keypair and a locally-hosted JWKS (jose's own
 * createLocalJWKSet) rather than mocking fetch — this exercises jose's
 * real signature-verification code path end to end, just against a key
 * this test controls instead of Microsoft's.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { verifyEntraIdToken } from './entraAuthService.js';

const ISSUER = 'https://login.microsoftonline.com/test-tenant-id/v2.0';
const AUDIENCE = 'test-client-id';
const TENANT_ID = 'test-tenant-id';
const KID = 'test-key-1';
const EXPECTED = { issuer: ISSUER, audience: AUDIENCE, tenantId: TENANT_ID };
const BASE_CLAIMS = {
  oid: 'user-object-id-1',
  tid: TENANT_ID,
  preferred_username: 'Jane.Smith@Example.co.za',
  name: 'Jane Smith',
};

let privateKey, jwks;

async function signToken(claims, { issuer = ISSUER, audience = AUDIENCE, expiresIn = '1h', key = privateKey, kid = KID } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(expiresIn)
    .sign(key);
}

beforeAll(async () => {
  const { publicKey, privateKey: priv } = await generateKeyPair('RS256');
  privateKey = priv;
  const jwk = await exportJWK(publicKey);
  jwk.kid = KID;
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  jwks = createLocalJWKSet({ keys: [jwk] });
});

describe('verifyEntraIdToken — accepts a valid token', () => {
  it('extracts oid/email/displayName/tenantId, lowercasing and trimming the email', async () => {
    const token = await signToken(BASE_CLAIMS);
    const result = await verifyEntraIdToken(token, jwks, EXPECTED);
    expect(result).toEqual({
      entraObjectId: 'user-object-id-1',
      email: 'jane.smith@example.co.za',
      displayName: 'Jane Smith',
      tenantId: TENANT_ID,
    });
  });

  it('falls back to the email claim when preferred_username is absent', async () => {
    const token = await signToken({ oid: 'user-2', tid: TENANT_ID, email: 'fallback@example.co.za', name: 'Fallback User' });
    const result = await verifyEntraIdToken(token, jwks, EXPECTED);
    expect(result.email).toBe('fallback@example.co.za');
  });

  it('falls back to the email as displayName when name is absent', async () => {
    const token = await signToken({ oid: 'user-3', tid: TENANT_ID, preferred_username: 'noname@example.co.za' });
    const result = await verifyEntraIdToken(token, jwks, EXPECTED);
    expect(result.displayName).toBe('noname@example.co.za');
  });
});

describe('verifyEntraIdToken — rejects invalid tokens', () => {
  it('rejects a token signed with the wrong key', async () => {
    const { privateKey: otherKey } = await generateKeyPair('RS256');
    const token = await signToken(BASE_CLAIMS, { key: otherKey });
    await expect(verifyEntraIdToken(token, jwks, EXPECTED)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects an expired token', async () => {
    const token = await signToken(BASE_CLAIMS, { expiresIn: '-1h' });
    await expect(verifyEntraIdToken(token, jwks, EXPECTED)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a token with the wrong audience', async () => {
    const token = await signToken(BASE_CLAIMS, { audience: 'some-other-client-id' });
    await expect(verifyEntraIdToken(token, jwks, EXPECTED)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a token with the wrong issuer', async () => {
    const token = await signToken(BASE_CLAIMS, { issuer: 'https://login.microsoftonline.com/some-other-tenant/v2.0' });
    await expect(verifyEntraIdToken(token, jwks, EXPECTED)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a token whose tid claim does not match the expected tenant, even with a matching issuer string', async () => {
    const token = await signToken({ ...BASE_CLAIMS, tid: 'a-different-tenant' });
    await expect(verifyEntraIdToken(token, jwks, EXPECTED)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a token with no oid claim', async () => {
    const token = await signToken({ tid: TENANT_ID, preferred_username: 'noiod@example.co.za' });
    await expect(verifyEntraIdToken(token, jwks, EXPECTED)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a token with no email claim of any kind', async () => {
    const token = await signToken({ oid: 'user-4', tid: TENANT_ID });
    await expect(verifyEntraIdToken(token, jwks, EXPECTED)).rejects.toMatchObject({ status: 401 });
  });
});
