/**
 * services/msalAuth.js — NEW, §120 (4 Aug 2026, SSO stage 4).
 * The ONLY place MSAL is used for anything beyond static configuration
 * (authConfig.js). Deliberately narrow: acquire an ID token via an
 * interactive Microsoft popup, once, at login. Nothing else in this app
 * ever touches MSAL again after that — every subsequent request runs
 * through the exact same httpOnly-cookie session local login already
 * uses (see entraAuthService.js's header, §114, for the full
 * architecture reasoning this continues).
 *
 * This deliberately REPLACES api.js's old ENTRA_MODE/getAccessToken()
 * scaffolding (removed in this same entry) rather than reusing it — that
 * code attached a fresh Entra Bearer token to EVERY request, a
 * fundamentally different and now-superseded architecture that predates
 * §114's design. Keeping both would mean two incompatible ways of
 * authenticating a request existing side by side.
 */

import { msalInstance, loginRequest } from './authConfig.js';

let _initialized = false;
async function ensureInitialized() {
  if (!_initialized) {
    await msalInstance.initialize();
    _initialized = true;
  }
}

/**
 * Opens a Microsoft sign-in popup and returns the resulting ID token.
 * Popup, not redirect — keeps the user on the MedBroker login page
 * throughout rather than navigating away and back, and avoids redirect
 * flow's own extra handleRedirectPromise() plumbing for a login-only use
 * that never needs to survive a full page navigation.
 * @returns {Promise<string>} the raw ID token JWT
 * @throws if the user cancels the popup or sign-in itself fails —
 *   callers surface this as a login error, same as a wrong password would.
 */
export async function acquireEntraIdToken() {
  await ensureInitialized();
  const result = await msalInstance.loginPopup(loginRequest);
  if (!result?.idToken) {
    throw new Error('Microsoft sign-in did not return an identity token');
  }
  return result.idToken;
}
