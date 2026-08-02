/**
 * services/api.js
 * Authenticated API client for MedBroker.
 *
 * Two modes, checked in this order:
 *   1. Entra production (VITE_ENTRA_CLIENT_ID set):
 *      Acquires an Entra ID Bearer token silently before each request.
 *      Falls back to interactive redirect if the token cannot be refreshed.
 *   2. Demo backend (the default — VITE_ENTRA_CLIENT_ID not set):
 *      Real fetch calls to the api-demo Vercel backend, authenticated via
 *      the local-auth JWT from authStore.js (set by POST /api/auth/login).
 *
 * Preview/mock mode (a third option that let every page render from
 * inline placeholder data with no backend connected at all) was removed
 * 22 July 2026 — the app always runs against a real backend now, so every
 * page always fetches for real. See VERCEL_NOTES.md for the removal.
 */

import { getToken, notifyUnauthorized } from './authStore.js';

const API_BASE       = import.meta.env.VITE_API_BASE_URL ?? '/api';
const ENTRA_MODE      = !!import.meta.env.VITE_ENTRA_CLIENT_ID;
const DEMO_MODE       = !ENTRA_MODE;

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

/**
 * formatErrorBody — added 22 July 2026.
 * Backend validation failures come back as `{ error: <Zod .flatten() output> }`
 * — an object, not a string: `{ fieldErrors: { mobileNumber: [...] }, formErrors: [...] }`.
 * Every route on the backend does this the same way, so this bug was
 * previously present everywhere a form displayed `err.message` after a
 * validation failure, not just lead creation — found via LeadImport.jsx
 * showing literally "[object Object]" instead of a real error, because
 * the object was being passed straight through as the Error's message
 * and then coerced to a string somewhere in the UI. Fixed once, here, so
 * every caller of request() benefits rather than patching each form.
 * @param {unknown} error - the `error` field from a JSON error response body
 * @returns {string} a readable message
 */
function formatErrorBody(error) {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const parts = [];
    if (error.fieldErrors && typeof error.fieldErrors === 'object') {
      for (const [field, messages] of Object.entries(error.fieldErrors)) {
        if (Array.isArray(messages) && messages.length > 0) {
          parts.push(`${field}: ${messages[0]}`);
        }
      }
    }
    if (Array.isArray(error.formErrors)) {
      parts.push(...error.formErrors);
    }
    if (parts.length > 0) return parts.join('; ');
  }
  return 'API request failed';
}

async function request(path, options = {}) {
  let authHeader;
  if (options.skipAuth) {
    // Login itself — there's no token yet to attach.
    authHeader = undefined;
  } else if (DEMO_MODE) {
    const token = getToken();
    authHeader = token ? `Bearer ${token}` : undefined;
  } else {
    const token = await getAccessToken();
    authHeader = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type':  'application/json',
      ...(authHeader ? { 'Authorization': authHeader } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (response.status === 204) return null;

  // Demo mode: a 401 on an authenticated call means the token is gone/expired —
  // clear the session and let AuthContext's subscribers (App.jsx) redirect to
  // Login, rather than every page having to special-case this itself.
  if (DEMO_MODE && response.status === 401 && !options.skipAuth) {
    notifyUnauthorized();
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(response.status, 'Response was not valid JSON');
  }

  if (!response.ok) {
    throw new ApiError(response.status, formatErrorBody(body?.error), body);
  }

  return body;
}

export const apiMode = { DEMO_MODE, ENTRA_MODE };

// ─── Auth (demo backend local login) ──────────────────────────────────────────

export const authApi = {
  login: (email, password) =>
    request('/auth/login', { method: 'POST', skipAuth: true, body: JSON.stringify({ email, password }) }),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/change-password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),
};

export const systemConfigApi = {
  get:    ()     => request('/system-config'),
  update: (data) => request('/system-config', { method: 'PUT', body: JSON.stringify(data) }),
};

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
  checkDuplicates: (rows) => request('/leads/check-duplicates', { method: 'POST', body: JSON.stringify({ rows }) }),
  listSubscriptions: () => request('/leads/subscriptions'),
  createSubscription: (data) => request('/leads/subscriptions', { method: 'POST', body: JSON.stringify(data) }),
  // §90 — Portfolio/Product management
  listPortfolios: (includeInactive = false) => request(`/leads/portfolios${includeInactive ? '?includeInactive=true' : ''}`),
  createPortfolio: (name) => request('/leads/portfolios', { method: 'POST', body: JSON.stringify({ name }) }),
  createProduct: (portfolioId, name) => request(`/leads/portfolios/${portfolioId}/products`, { method: 'POST', body: JSON.stringify({ name }) }),
  updatePortfolio: (id, isActive) => request(`/leads/portfolios/${id}`, { method: 'PUT', body: JSON.stringify({ isActive }) }),
  deletePortfolio: (id) => request(`/leads/portfolios/${id}`, { method: 'DELETE' }),
  updateProduct: (portfolioId, productId, isActive) =>
    request(`/leads/portfolios/${portfolioId}/products/${productId}`, { method: 'PUT', body: JSON.stringify({ isActive }) }),
  deleteProduct: (portfolioId, productId) =>
    request(`/leads/portfolios/${portfolioId}/products/${productId}`, { method: 'DELETE' }),
  // assign — first-time assignment of an unassigned lead to an agent, OR
  //   changing the agent on an already-assigned lead. Same endpoint either
  //   way — the backend distinguishes them itself (checks whether there
  //   was a previous agent) and logs the right AuditLog action
  //   (LeadAssigned vs LeadReassigned) accordingly; there's no separate
  //   /reassign route to duplicate that logic in two places.
  //   Server-side: sets assignedAgentId, transitions pipelineStatus Unassigned → Assigned
  //   (or keeps existing status if it was already assigned).
  assign:  (id, agentId) =>
    request(`/leads/${id}/assign`,   { method: 'PUT', body: JSON.stringify({ agentId }) }),
  // reassign — same endpoint as assign(); kept as a distinctly-named method
  // since LeadList.jsx calls it from a semantically different action
  // ("Reassign" button vs "Assign" button).
  reassign: (id, agentId) =>
    request(`/leads/${id}/assign`, { method: 'PUT', body: JSON.stringify({ agentId }) }),
  // sources — distinct source labels across CSV batches, subscriptions, and events.
  //   Used to populate the Source filter dropdown in LeadList.
  //   Falls back to LEAD_SOURCES constant in preview mode.
  sources: () => request('/leads/sources'),
  // update — patches the editable Contact/Education/Insurance fields on
  //   LeadDetail.jsx. Editable by the assigned Agent, their Supervisor, or
  //   Admin/GlobalAdmin — enforced server-side, not just hidden client-side.
  //   Server-side: writes a diffed LeadUpdated AuditLog entry.
  update: (id, data) =>
    request(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  // auditLog — change history for LeadDetail.jsx's Audit Log panel.
  auditLog: (id) => request(`/leads/${id}/audit`),
  // reopen — Admin/Supervisor only, only valid once the lead's most recent
  // appointment is Closed Lost. Manual by design (Mark's choice) — not
  // triggered automatically when an outcome is saved.
  reopen: (id) => request(`/leads/${id}/reopen`, { method: 'PUT' }),
  logCall: (id, attemptData) =>
    request(`/leads/${id}/calls`, { method: 'POST', body: JSON.stringify(attemptData) }),
  // listCalls — call history for a lead, most recent first. Used by
  // LeadDetail.jsx's "Recent Calls" section so it survives a page refresh
  // instead of only reflecting calls logged in the current browser session.
  listCalls: (id) => request(`/leads/${id}/calls`),
  delete:  (id)   => request(`/leads/${id}`, { method: 'DELETE' }),
};

// §79 — POPIA Subject Access Requests. Routed through /api/leads on the
// backend (no natural top-level fit; same "fold into an existing router"
// reasoning as every other addition since the 12/12 function ceiling).
export const sarApi = {
  list: (page = 1, pageSize = 25, status) => {
    const params = new URLSearchParams({ page, pageSize, ...(status ? { status } : {}) });
    return request(`/leads/sar-requests?${params}`);
  },
  get:    (id)          => request(`/leads/sar-requests/${id}`),
  create: (data)         => request('/leads/sar-requests', { method: 'POST', body: JSON.stringify(data) }),
  updateStatus: (id, data) => request(`/leads/sar-requests/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  /**
   * Same reasoning as auditApi.export() — this returns a file, not JSON,
   * so it can't go through request(). Does its own authenticated fetch
   * and triggers a browser download.
   */
  export: async (id, format) => {
    const params = new URLSearchParams({ export: format });
    const token = getToken();
    const response = await fetch(`${API_BASE}/leads/sar-requests/${id}/export?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new ApiError(response.status, `Export failed (${response.status})`);
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `sar-export.${format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  },
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
  // assignBroker — first-time broker assignment on an unassigned appointment.
  //   Server-side: sets brokerId, transitions status Unassigned → Assigned,
  //   sends AppointmentAssigned notification to broker,
  //   writes AuditLog entry with action='AppointmentBrokerAssigned'.
  assignBroker: (id, brokerId, agentId) =>
    request(`/appointments/${id}/assign`, { method: 'PUT', body: JSON.stringify({ brokerId, agentId }) }),
  // reassign — changes broker and/or agent on an already-assigned appointment.
  //   Server-side: updates brokerId/agentId, keeps existing status,
  //   writes AuditLog entry with action='AppointmentReassigned' including previous broker.
  reassign: (id, brokerId, agentId) =>
    request(`/appointments/${id}/reassign`, { method: 'PUT', body: JSON.stringify({ brokerId, agentId }) }),
  // returnToLeads — Admin/Supervisor returns an appointment to the unassigned leads queue.
  //   Server-side: validates customerSigned IS NOT TRUE, sets Lead.pipelineStatus = 'Unassigned',
  //   archives the Appointment, writes AuditLog entry with action='AppointmentReturnedToLeads'.
  returnToLeads: (id) =>
    request(`/appointments/${id}/return`, { method: 'PUT' }),
  // saveOutcome — records the meeting outcome. The server computes the resulting
  //   Appointment.status via computeAppointmentStatus() — never sent from the client.
  //   Body: { customerSigned, productsSold, meetings }.
  saveOutcome: (id, data) =>
    request(`/appointments/${id}/outcome`, { method: 'POST', body: JSON.stringify(data) }),
  // auditLog — change history for AppointmentDetail.jsx's Change Log panel.
  auditLog: (id) => request(`/appointments/${id}/audit`),
};

// ─── Broker matching ──────────────────────────────────────────────────────────

export const brokerMatchingApi = {
  findBrokers: (params) =>
    request(`/appointments/broker-matching?${new URLSearchParams(params)}`),
};

// ─── Events ───────────────────────────────────────────────────────────────────

export const eventsApi = {
  list:         ()                    => request('/events'),
  get:          (id)                  => request(`/events/${id}`),
  create:       (data)                => request('/events', { method: 'POST', body: JSON.stringify(data) }),
  updateStatus: (id, status)          => request(`/events/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  report:       (id)                  => request(`/events/${id}/report`),
  addAttendee:  (id, data)            => request(`/events/${id}/attendees`, { method: 'POST', body: JSON.stringify(data) }),
  setAttendance: (id, attendeeId, attended) =>
    request(`/events/${id}/attendees/${attendeeId}/attendance`, { method: 'PUT', body: JSON.stringify({ attended }) }),
  deleteAttendee: (id, attendeeId) =>
    request(`/events/${id}/attendees/${attendeeId}`, { method: 'DELETE' }),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  list:   (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    return request(`/users${qs ? `?${qs}` : ''}`);
  },
  me:       ()     => request('/users/me'),
  updateMe: (data) => request('/users/me', { method: 'PUT', body: JSON.stringify(data) }),
  get:    (id)   => request(`/users/${id}`),
  create: (data) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  unlock: (id) => request(`/users/${id}/unlock`, { method: 'PUT' }),
  listSupervisors: () => request('/users?supervisors=true'),
};

// ─── Tasks (§56) ──────────────────────────────────────────────────────────────

export const tasksApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    return request(`/tasks${qs ? `?${qs}` : ''}`);
  },
  create: (data)     => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id)       => request(`/tasks/${id}`, { method: 'DELETE' }),
  listComments: (id)       => request(`/tasks/${id}/comments`),
  addComment:   (id, body) => request(`/tasks/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
};

// ─── Notifications (§61) ──────────────────────────────────────────────────────

export const notificationsApi = {
  list:         ()          => request('/notifications'),
  markRead:     (id, isRead = true) => request(`/notifications/${id}`, { method: 'PATCH', body: JSON.stringify({ isRead }) }),
  markAllRead:  ()          => request('/notifications/mark-all-read', { method: 'PATCH' }),
};

// ─── Feature flags ────────────────────────────────────────────────────────────

export const flagsApi = {
  list:   ()           => request('/flags'),
  update: (key, value) =>
    request(`/flags/${key}`, { method: 'PATCH', body: JSON.stringify({ value }) }),
};

// §76 — routed through /api/flags/audit-log on the backend (no natural
// domain fit; every existing router is where AppAdmin's own routes
// ended up living, since there's zero headroom for a new top-level
// function at 12/12).
// §76/§77 — routed through /api/flags/audit-log on the backend (no
// natural domain fit; every existing router is where AppAdmin's own
// routes ended up living, since there's zero headroom for a new
// top-level function at 12/12).
export const auditApi = {
  list: (page = 1, pageSize = 25, filters = {}) => {
    const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const params = new URLSearchParams({ page, pageSize, ...cleanFilters });
    return request(`/flags/audit-log?${params}`);
  },
  /**
   * Export can't go through request() — that helper always parses the
   * response as JSON, but a CSV export is plain text, not JSON. This
   * does its own authenticated fetch (same token logic request() uses
   * internally), reads the response as a Blob, and triggers a browser
   * download via a temporary <a> element — the standard way to handle
   * an authenticated file download, since a plain <a href> link can't
   * carry an Authorization header the way this endpoint requires.
   * @param {'csv'|'json'} format
   * @param {Object} filters
   */
  export: async (format, filters = {}) => {
    const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const params = new URLSearchParams({ export: format, ...cleanFilters });
    const token = getToken();
    const response = await fetch(`${API_BASE}/flags/audit-log?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      throw new ApiError(response.status, `Export failed (${response.status})`);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `medbroker-audit-log.${format}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

// ─── Reports ─────────────────────────────────────────────────────────────────
// Replaces a stale reportsApi shape (pipeline/broker-activity) that never
// matched Reports.jsx's own header comment and was never wired to
// anything — leftover scaffolding from an earlier design pass.
export const reportsApi = {
  summary: (period) => request(`/reports/summary?period=${period}`),
  brokers: (period) => request(`/reports/brokers?period=${period}`),
  agents:  (period) => request(`/reports/agents?period=${period}`),
  agentDetail:  (id, period) => request(`/reports/agent/${id}?period=${period}`),
  brokerDetail: (id, period) => request(`/reports/broker/${id}?period=${period}`),
};
