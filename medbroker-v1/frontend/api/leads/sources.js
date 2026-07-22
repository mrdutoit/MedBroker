/**
 * api/leads/sources.js
 * GET /api/leads/sources — distinct source labels in use, for LeadList's
 * Source filter dropdown. leadsApi.sources() on the frontend already
 * expected this exact path; it just didn't exist on the backend yet.
 * Same roles as listing leads themselves — no point restricting this list
 * more tightly than the leads it's derived from.
 */

import { validateToken, requireRole, authErrorResponse } from '../../api-lib/middleware/auth.js';
import { listSources } from '../../api-lib/services/leadService.js';
import { applyCors } from '../../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin']);

    const sources = await listSources();
    return res.status(200).json({ sources });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/sources error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
