/**
 * services/authConfig.js
 * MSAL configuration for Azure Entra ID External authentication.
 * Import msalInstance into App.jsx and wrap with MsalProvider.
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

// Scopes requested when signing in — must match the API app registration in Entra
export const loginRequest = {
  scopes: [
    `api://${import.meta.env.VITE_ENTRA_CLIENT_ID}/leads.read`,
    `api://${import.meta.env.VITE_ENTRA_CLIENT_ID}/leads.write`,
  ],
};

export const msalInstance = new PublicClientApplication(msalConfig);
