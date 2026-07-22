/**
 * api/broker-matching/index.js — NEW.
 * GET /api/broker-matching?region=X&products=A,B — Agent, Supervisor,
 * Admin, GlobalAdmin. Called from LeadDetail.jsx's Book Appointment modal
 * to populate the broker selection list before creating the appointment —
 * this route only finds candidates, it doesn't book anything itself.
 */

import { validateToken, requireRole, authErrorResponse } from '../../api-lib/middleware/auth.js';
import { findMatchingBrokers } from '../../api-lib/services/brokerMatchingService.js';
import { BrokerMatchingQuerySchema } from '../../api-lib/models/appointment.js';
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

    const parsed = BrokerMatchingQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = await findMatchingBrokers(parsed.data);
    return res.status(200).json(result);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('broker-matching error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
