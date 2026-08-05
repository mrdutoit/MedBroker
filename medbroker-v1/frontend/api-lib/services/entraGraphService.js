/**
 * services/entraGraphService.js — NEW, §121 (4 Aug 2026, SSO stage 3b).
 * App-only (client credentials) Microsoft Graph API access — offboarding
 * sync only. Deliberately separate from entraAuthService.js (§114):
 * that file validates a USER's own ID token (public client, no secret,
 * auth-code/PKCE via MSAL); this file authenticates as the APPLICATION
 * itself (confidential client, client-credentials grant, needs
 * ENTRA_CLIENT_SECRET) — a genuinely different credential and OAuth
 * flow, not just "the same thing with an extra field."
 *
 * Hand-rolled with plain fetch, no new dependency — a client-credentials
 * token request and a Graph GET don't need a library, matching this
 * codebase's existing "simple enough to get right by hand" bar
 * (authService.js's local HMAC JWT, http/helpers.js's cookie parsing).
 */

import { config } from '../config.js';

let _cachedToken = null; // { accessToken, expiresAt } — module-scope, reused across calls within a warm Vercel Function instance

async function getAppOnlyGraphToken() {
  const { tenantId, clientId, clientSecret } = config.entra;
  if (!tenantId || !clientId || !clientSecret) {
    throw {
      status: 500,
      message: 'ENTRA_TENANT_ID, ENTRA_CLIENT_ID, and ENTRA_CLIENT_SECRET must all be configured for offboarding sync',
    };
  }

  // Reuse a cached token until shortly before it expires — avoids a
  // fresh token request for every user checked in one sync run.
  if (_cachedToken && _cachedToken.expiresAt > Date.now() + 60_000) {
    return _cachedToken.accessToken;
  }

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    throw {
      status: 502,
      message: "Could not authenticate with Microsoft Graph — check ENTRA_CLIENT_SECRET and the app registration's API permissions (User.Read.All, admin consent granted)",
    };
  }

  const data = await response.json();
  _cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return _cachedToken.accessToken;
}

/**
 * Whether an Entra Object ID still exists and is enabled in the tenant.
 * Returns false for both "removed from the directory entirely" (Graph
 * 404) and "still present but disabled" (accountEnabled: false) — the
 * caller (offboarding sync) treats both the same way, so the distinction
 * doesn't need to leak out of this function.
 * @param {string} entraObjectId
 * @returns {Promise<boolean>}
 */
export async function isEntraAccountActive(entraObjectId) {
  const token = await getAppOnlyGraphToken();
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${entraObjectId}?$select=accountEnabled`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (response.status === 404) return false;
  if (!response.ok) {
    throw { status: 502, message: `Microsoft Graph returned an unexpected error checking one account (HTTP ${response.status})` };
  }

  const data = await response.json();
  // A missing accountEnabled field (shouldn't happen given the $select
  // above, but defensively) is treated as active — only an EXPLICIT
  // false means "deactivate this person," never an absence of data.
  return data.accountEnabled !== false;
}
