/**
 * services/portalApi.js — NEW, 24 Jul 2026.
 * Deliberately separate from services/api.js — that client attaches the
 * STAFF session cookie's implied auth. Reusing it here would risk a
 * prospect's requests carrying staff auth or vice versa.
 *
 * UPDATED §115 (4 Aug 2026): no longer attaches a manual Authorization
 * header. The portal token lives in an httpOnly cookie now
 * (mb_portal_session, set by the register/activate/login/walkin routes) —
 * the browser attaches it automatically on every same-origin request,
 * same cutover §113 already made for services/api.js's DEMO_MODE path.
 */
import { notifyPortalUnauthorized } from './portalAuthStore.js';

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
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    // §115 — explicit, not relying on fetch's same-origin default. This
    // is what actually gets the mb_portal_session cookie attached/set.
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
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
  // §115 — logout is now a real endpoint (an httpOnly cookie can only be
  // cleared server-side), not just a local state clear. skipAuth: true —
  // same reasoning as staff's authApi.logout(): logging out shouldn't
  // itself trigger notifyPortalUnauthorized() on a 401 if the session
  // had already expired.
  logout:          () => request('/portal/logout', { method: 'POST', skipAuth: true }),
  getMe:           ()               => request('/portal/me'),
  updateMe:        (data)           => request('/portal/me', { method: 'PUT', body: JSON.stringify(data) }),
  checkin:         (checkinToken)   => request('/portal/checkin', { method: 'POST', body: JSON.stringify({ checkinToken }) }),
};
