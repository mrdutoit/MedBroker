/**
 * api/appointments/[id]/assign.js — NEW.
 * PUT /api/appointments/:id/assign — Admin, Supervisor, GlobalAdmin.
 * First-time broker assignment on an Unassigned appointment — ASSIGN
 * model only (claimModel = 'claim' uses a different, not-yet-built flow).
 */

import { validateToken, requireRole, authErrorResponse } from '../../../api-lib/middleware/auth.js';
import { assignBroker } from '../../../api-lib/services/appointmentService.js';
import { writeAuditLog, clientIp } from '../../../api-lib/services/auditService.js';
import { AssignBrokerSchema } from '../../../api-lib/models/appointment.js';
import { isUuid, applyCors } from '../../../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'Supervisor', 'GlobalAdmin']);

    const { id } = req.query;
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid appointment ID format' });

    const parsed = AssignBrokerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    await assignBroker(id, parsed.data.brokerId);

    await writeAuditLog({
      entityType: 'Appointment',
      entityId: id,
      action: 'AppointmentBrokerAssigned',
      performedById: claims.oid,
      changeDetail: { brokerId: parsed.data.brokerId },
      ipAddress: clientIp(req),
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/[id]/assign error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
