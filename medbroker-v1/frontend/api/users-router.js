/**
 * api/users-router.js
 * Replaces api/users/[[...slug]].js — see api/auth-router.js header for
 * why. Reached via vercel.json rewrite `/api/users/:slug*` ->
 * `/api/users-router?slug=:slug*`.
 *
 * Routes:
 *   GET  /api/users
 *   POST /api/users
 *   GET  /api/users/me            (self-service — any authenticated role)
 *   PUT  /api/users/me            (self-service — any authenticated role)
 *   GET  /api/users/:id
 *   PUT  /api/users/:id
 *   PUT  /api/users/:id/unlock         (§81 — clears a lockout)
 *   PUT  /api/users/:id/force-logout   (§97 — revokes all sessions)
 *   PUT  /api/users/:id/link-identity  (§114 — GlobalAdmin only; email
 *                                        correction + manual Entra identity
 *                                        link/unlink, SSO stage 1)
 *   PUT  /api/users/:id/force-password-reset  (§118 — GlobalAdmin only)
 */

import { handleUsersCollection, handleUserById, handleUserMe, handleUserUnlock, handleUserForceLogout, handleUserLinkIdentity, handleUserForcePasswordReset } from '../api-lib/handlers/userHandlers.js';
import { applyCors, parseSlug } from '../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const segments = parseSlug(req.query.slug);

  if (segments.length === 0) return handleUsersCollection(req, res);
  // Must come before the UUID branch below — 'me' is never a valid user id.
  if (segments.length === 1 && segments[0] === 'me') return handleUserMe(req, res);
  if (segments.length === 1) return handleUserById(req, res, segments[0]);
  if (segments.length === 2 && segments[1] === 'unlock') return handleUserUnlock(req, res, segments[0]);
  if (segments.length === 2 && segments[1] === 'force-logout') return handleUserForceLogout(req, res, segments[0]);
  if (segments.length === 2 && segments[1] === 'link-identity') return handleUserLinkIdentity(req, res, segments[0]);
  if (segments.length === 2 && segments[1] === 'force-password-reset') return handleUserForcePasswordReset(req, res, segments[0]);

  return res.status(404).json({ error: 'Not found' });
}
