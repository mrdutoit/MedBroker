/**
 * src/http/helpers.js — small shared utilities for Vercel Function route
 * handlers. Not present in the Azure version because Azure Functions v4
 * and Front Door handle CORS/routing differently — this is demo-stack glue,
 * not ported business logic.
 */

import { config } from '../config.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/**
 * Applies CORS headers for the configured frontend origin and short-circuits
 * OPTIONS preflight requests. Call first in every handler:
 *   if (applyCors(req, res)) return;
 * @returns {boolean} true if the request was a preflight and already answered
 */
export function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', config.app.frontendOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-demo-user-id, x-demo-role');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
