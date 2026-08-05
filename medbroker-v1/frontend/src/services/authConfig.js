/**
 * services/authConfig.js
 * MSAL configuration for Microsoft Entra ID sign-in.
 *
 * CORRECTED §120 (4 Aug 2026, SSO stage 4). loginRequest previously
 * requested ACCESS TOKEN scopes for a custom exposed API
 * (api://{clientId}/leads.read, leads.write) — a mismatch with what
 * entraAuthService.validateEntraToken() (§114) actually validates
 * server-side: a plain ID token, audience = the client ID itself, not a
 * custom App ID URI. Requesting those custom scopes would have gotten an
 * access token with the WRONG audience for that check to ever pass, and
 * would have required Mark to additionally configure "Expose an API" in
 * the Entra app registration for a capability this app doesn't use in
 * the first place — it does its own RBAC via the role field, not
 * OAuth-scope-based authorization. Standard OIDC scopes only; the
 * consuming code (services/msalAuth.js) reads response.idToken, not
 * response.accessToken.
 */

import { PublicClientApplication, LogLevel } from '@azure/msal-browser';

const msalConfig = {
  auth: {
    clientId:    import.meta.env.VITE_ENTRA_CLIENT_ID,
    authority:   import.meta.env.VITE_ENTRA_AUTHORITY,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage', // Use sessionStorage — tokens don't persist after browser close
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (import.meta.env.DEV) console.log(`[MSAL] ${message}`);
      },
      logLevel: import.meta.env.DEV ? LogLevel.Info : LogLevel.Warning,
    },
  },
};

// Standard OIDC scopes — enough for MSAL to return an ID token identifying
// the signed-in user. No custom API scopes; see file header for why.
export const loginRequest = {
  scopes: ['openid', 'profile', 'email'],
};

export const msalInstance = new PublicClientApplication(msalConfig);
