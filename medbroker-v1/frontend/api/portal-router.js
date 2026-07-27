/**
 * api/portal-router.js — NEW, 24 Jul 2026.
 * Reached via vercel.json rewrite `/api/portal/:slug*` ->
 * `/api/portal-router?slug=:slug*`. 11th deployed function — 1 of
 * headroom left under the Vercel Hobby 12-function cap.
 *
 * Routes:
 *   GET  /api/portal/events/:qrToken         event context for registration page (public)
 *   POST /api/portal/register                 create account + register for event (public)
 *   POST /api/portal/activate                 claim portal access for an existing Lead, no event needed (public)
 *   GET  /api/portal/checkin-events/:checkinToken  event context for the attendance landing page (public)
 *   POST /api/portal/walkin                    on-the-spot signup + check-in, no prior account (public)
 *   POST /api/portal/login                     email + password (public)
 *   GET  /api/portal/me                        own profile (portal JWT)
 *   PUT  /api/portal/me                        update own contact details (portal JWT)
 *   POST /api/portal/checkin                    confirm attendance, already authenticated (portal JWT)
 */
import {
  handlePortalEventLookup, handlePortalRegister, handlePortalLogin,
  handlePortalMe, handlePortalCheckin, handlePortalActivate,
  handlePortalCheckinEventLookup, handlePortalWalkIn,
} from '../api-lib/handlers/portalHandlers.js';
import { applyCors, parseSlug } from '../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const segments = parseSlug(req.query.slug);

  if (segments.length === 2 && segments[0] === 'events')          return handlePortalEventLookup(req, res, segments[1]);
  if (segments.length === 2 && segments[0] === 'checkin-events')  return handlePortalCheckinEventLookup(req, res, segments[1]);
  if (segments.length === 1 && segments[0] === 'register') return handlePortalRegister(req, res);
  if (segments.length === 1 && segments[0] === 'activate') return handlePortalActivate(req, res);
  if (segments.length === 1 && segments[0] === 'walkin')   return handlePortalWalkIn(req, res);
  if (segments.length === 1 && segments[0] === 'login')    return handlePortalLogin(req, res);
  if (segments.length === 1 && segments[0] === 'me')       return handlePortalMe(req, res);
  if (segments.length === 1 && segments[0] === 'checkin')  return handlePortalCheckin(req, res);

  return res.status(404).json({ error: 'Not found' });
}
