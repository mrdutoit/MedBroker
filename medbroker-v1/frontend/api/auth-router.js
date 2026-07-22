/**
 * api/auth-router.js
 * Replaces api/auth/[...slug].js — bracket catch-all files turned out not
 * to be recognized as routes by Vercel on this (non-Next.js) project;
 * confirmed by testing the live deployment directly, not assumed. Reached
 * via the vercel.json rewrite `/api/auth/:slug*` -> `/api/auth-router?slug=:slug*`,
 * the same rewrite mechanism already proven working here (the SPA
 * fallback rewrite). See parseSlug() in api-lib/http/helpers.js for why
 * the slug parameter is parsed defensively rather than assumed to arrive
 * as a particular shape.
 *
 * Routes (unchanged from the previous attempt):
 *   POST /api/auth/login
 *   POST /api/auth/bootstrap-admin
 */

import { handleLogin, handleBootstrapAdmin } from '../api-lib/handlers/authHandlers.js';
import { applyCors, parseSlug } from '../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const [route] = parseSlug(req.query.slug);

  if (route === 'login') return handleLogin(req, res);
  if (route === 'bootstrap-admin') return handleBootstrapAdmin(req, res);

  return res.status(404).json({ error: 'Not found' });
}
