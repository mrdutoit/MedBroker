/**
 * services/portalApi.js — NEW, 24 Jul 2026.
 * Deliberately separate from services/api.js — that client attaches the
 * STAFF token from authStore.js. Reusing it here would mean a prospect's
 * requests either carry no auth or, worse, whatever staff token happens
 * to be sitting in the same browser. This client only ever attaches the
 * portal token from portalAuthStore.js.
 */
import { getPortalToken, notifyPortalUnauthorized } from './portalAuthStore.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class PortalApiError extends Error {
  constructor(status, message, body = null) {
    super(message);
    this.name   = 'PortalApiError';
    this.status = status;
    this.body   = body;
  }
}

// Same shape as api.js's formatErrorBody — backend validation errors come
// back as `{ error: <Zod .flatten() output> }` from every route the same way.
function formatErrorBody(error) {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const parts = [];
    if (error.fieldErrors && typeof error.fieldErrors === 'object') {
      for (const [field, messages] of Object.entries(error.fieldErrors)) {
        if (Array.isArray(messages) && messages.length > 0) parts.push(`${field}: ${messages[0]}`);
      }
    }
    if (Array.isArray(error.formErrors)) parts.push(...error.formErrors);
    if (parts.length > 0) return parts.join('; ');
  }
  return 'Request failed';
}

async function request(path, options = {}) {
  const token = options.skipAuth ? null : getPortalToken();
  const authHeader = token ? `Bearer ${token}` : undefined;

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { 'Authorization': authHeader } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (response.status === 204) return null;

  if (response.status === 401 && !options.skipAuth) {
    notifyPortalUnauthorized();
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new PortalApiError(response.status, 'Response was not valid JSON');
  }

  if (!response.ok) {
    throw new PortalApiError(response.status, formatErrorBody(body?.error), body);
  }

  return body;
}

export const portalApi = {
  getEvent:        (qrToken)       => request(`/portal/events/${qrToken}`, { skipAuth: true }),
  register:        (data)          => request('/portal/register', { method: 'POST', skipAuth: true, body: JSON.stringify(data) }),
  activate:        (data)          => request('/portal/activate', { method: 'POST', skipAuth: true, body: JSON.stringify(data) }),
  getCheckinEvent: (checkinToken)  => request(`/portal/checkin-events/${checkinToken}`, { skipAuth: true }),
  walkIn:          (data)          => request('/portal/walkin', { method: 'POST', skipAuth: true, body: JSON.stringify(data) }),
  login:           (email, password) => request('/portal/login', { method: 'POST', skipAuth: true, body: JSON.stringify({ email, password }) }),
  getMe:           ()               => request('/portal/me'),
  updateMe:        (data)           => request('/portal/me', { method: 'PUT', body: JSON.stringify(data) }),
  checkin:         (checkinToken)   => request('/portal/checkin', { method: 'POST', body: JSON.stringify({ checkinToken }) }),
};
