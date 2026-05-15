/**
 * services/api.js
 * Base API client for MedBroker frontend.
 * Automatically attaches the Entra ID Bearer token to every request.
 * All API calls in the application must go through this module.
 */

import { msalInstance, loginRequest } from './authConfig.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

/**
 * Acquire a valid access token silently (from cache).
 * Falls back to an interactive redirect if the token is expired and cannot be refreshed.
 * @returns {Promise<string>} Bearer token
 */
async function getAccessToken() {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) {
    // No signed-in user — redirect to login
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
    // Silent acquisition failed (e.g. token expired, MFA required) — force interactive
    await msalInstance.acquireTokenRedirect(loginRequest);
    return '';
  }
}

/**
 * Make an authenticated API request.
 * @param {string} path - API path relative to /api (e.g. '/leads')
 * @param {RequestInit} [options] - fetch options
 * @returns {Promise<any>} parsed JSON response
 * @throws {ApiError}
 */
async function request(path, options = {}) {
  const token = await getAccessToken();

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });

  if (response.status === 204) return null; // No content

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

export class ApiError extends Error {
  constructor(status, message, body = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// ─── Leads ────────────────────────────────────────────────────────────────────

export const leadsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    return request(`/leads${qs ? `?${qs}` : ''}`);
  },

  get: (id) => request(`/leads/${id}`),

  create: (data) => request('/leads', { method: 'POST', body: JSON.stringify(data) }),

  assign: (id, agentId) =>
    request(`/leads/${id}/assign`, { method: 'PUT', body: JSON.stringify({ agentId }) }),

  logCall: (id, attemptData) =>
    request(`/leads/${id}/calls`, { method: 'POST', body: JSON.stringify(attemptData) }),

  delete: (id) => request(`/leads/${id}`, { method: 'DELETE' }),
};

// ─── Appointments ─────────────────────────────────────────────────────────────

export const appointmentsApi = {
  list:   (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/appointments${qs ? `?${qs}` : ''}`);
  },
  get:    (id)   => request(`/appointments/${id}`),
  create: (data) => request('/appointments', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/appointments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// ─── Broker Matching ──────────────────────────────────────────────────────────

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
  list:   ()    => request('/users'),
  me:     ()    => request('/users/me'),
  create: (data) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
};

// ─── Reports ─────────────────────────────────────────────────────────────────

export const reportsApi = {
  pipeline:      (params) => request(`/reports/pipeline?${new URLSearchParams(params)}`),
  brokerActivity: (params) => request(`/reports/broker-activity?${new URLSearchParams(params)}`),
};
