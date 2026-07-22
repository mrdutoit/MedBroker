/**
 * api/auth/[...slug].js
 * Consolidated dispatcher — was two separate deployed functions
 * (login.js, bootstrap-admin.js), now one, to stay under Vercel Hobby's
 * 12-function-per-deployment limit. Handler logic itself is unchanged,
 * moved to api-lib/handlers/authHandlers.js (not deployed as a function
 * on its own, since it's outside api/).
 *
 * Routes:
 *   POST /api/auth/login
 *   POST /api/auth/bootstrap-admin
 *
 * CORS is applied once here for every route this file serves, rather than
 * per-handler as before — same helper, called once instead of N times.
 */

import { handleLogin, handleBootstrapAdmin } from '../../api-lib/handlers/authHandlers.js';
import { applyCors } from '../../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const slug = req.query.slug ?? [];
  const [route] = Array.isArray(slug) ? slug : [slug];

  if (route === 'login') return handleLogin(req, res);
  if (route === 'bootstrap-admin') return handleBootstrapAdmin(req, res);

  return res.status(404).json({ error: 'Not found' });
}
