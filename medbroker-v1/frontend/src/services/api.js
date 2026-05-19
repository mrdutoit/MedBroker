/**
 * services/api.js
 * Authenticated API client for MedBroker.
 *
 * Preview mode (no VITE_ENTRA_CLIENT_ID set):
 *   - All API calls resolve to empty mock data so the UI renders without errors.
 *   - The application uses its own inline mock data defined in each page component.
 *   - No MSAL import occurs — the build succeeds without Azure credentials.
 *
 * Production mode (VITE_ENTRA_CLIENT_ID set):
 *   - Acquires an Entra ID Bearer token silently before each request.
 *   - Falls back to interactive redirect if the token cannot be refreshed.
 */

const API_BASE     = import.meta.env.VITE_API_BASE_URL ?? '/api';
const PREVIEW_MODE = !import.meta.env.VITE_ENTRA_CLIENT_ID;

// ─── Token acquisition (production only) ─────────────────────────────────────

let _msalInstance = null;
let _loginRequest = null;

async function getMsalInstance() {
  if (_msalInstance) return { msalInstance: _msalInstance, loginRequest: _loginRequest };
  const { PublicClientApplication } = await import('@azure/msal-browser');
  const { msalInstance, loginRequest } = await import('./authConfig.js');
  _msalInstance = msalInstance;
  _loginRequest = loginRequest;
  await _msalInstance.initialize();
  return { msalInstance: _msalInstance, loginRequest: _loginRequest };
}

async function getAccessToken() {
  const { msalInstance, loginRequest } = await getMsalInstance();
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) {
    await msalInstance.loginRedirect(loginRequest);
    return '';
  }
  try {
    const result = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0],
    });
    return result.accessToken;
  } catch {
    await msalInstance.acquireTokenRedirect(loginRequest);
    return '';
  }
}

// ─── Core request function ────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(status, message, body = null) {
    super(message);
    this.name   = 'ApiError';
    this.status = status;
    this.body   = body;
  }
}

async function request(path, options = {}) {
  // In preview mode return a resolved promise with null so useFetch
  // sets data=null without error — each page falls back to its own mock data.
  if (PREVIEW_MODE) {
    return null;
  }

  const token = await getAccessToken();

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });

  if (response.status === 204) return null;

  let body;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(response.status, 'Response was not valid JSON');
  }

  if (!response.ok) {
    throw new ApiError(response.status, body?.error ?? 'API request failed', body);
  }

  return body;
}

// ─── Leads ────────────────────────────────────────────────────────────────────

export const leadsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    return request(`/leads${qs ? `?${qs}` : ''}`);
  },
  get:     (id)   => request(`/leads/${id}`),
  create:  (data) => request('/leads', { method: 'POST', body: JSON.stringify(data) }),
  assign:  (id, agentId) =>
    request(`/leads/${id}/assign`, { method: 'PUT', body: JSON.stringify({ agentId }) }),
  logCall: (id, attemptData) =>
    request(`/leads/${id}/calls`, { method: 'POST', body: JSON.stringify(attemptData) }),
  delete:  (id)   => request(`/leads/${id}`, { method: 'DELETE' }),
};

// ─── Appointments ─────────────────────────────────────────────────────────────

export const appointmentsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    return request(`/appointments${qs ? `?${qs}` : ''}`);
  },
  get:    (id)   => request(`/appointments/${id}`),
  create: (data) => request('/appointments', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) =>
    request(`/appointments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// ─── Broker matching ──────────────────────────────────────────────────────────

export const brokerMatchingApi = {
  findBrokers: (params) =>
    request(`/broker-matching?${new URLSearchParams(params)}`),
};

// ─── Events ───────────────────────────────────────────────────────────────────

export const eventsApi = {
  list:   ()     => request('/events'),
  get:    (id)   => request(`/events/${id}`),
  create: (data) => request('/events', { method: 'POST', body: JSON.stringify(data) }),
  report: (id)   => request(`/events/${id}/report`),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  list:   ()     => request('/users'),
  me:     ()     => request('/users/me'),
  create: (data) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
};

// ─── Feature flags ────────────────────────────────────────────────────────────

export const flagsApi = {
  list:   ()           => request('/flags'),
  update: (key, value) =>
    request(`/flags/${key}`, { method: 'PATCH', body: JSON.stringify({ value }) }),
};

// ─── Reports ─────────────────────────────────────────────────────────────────

export const reportsApi = {
  pipeline:       (params) =>
    request(`/reports/pipeline?${new URLSearchParams(params)}`),
  brokerActivity: (params) =>
    request(`/reports/broker-activity?${new URLSearchParams(params)}`),
};
