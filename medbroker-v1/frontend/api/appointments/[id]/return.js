/**
 * api/appointments/[id]/return.js — NEW.
 * PUT /api/appointments/:id/return — Admin, Supervisor, GlobalAdmin.
 * Returns an appointment to the unassigned leads queue. Refuses if already
 * signed (ClosedWon) — see appointmentService.returnToLeads() for why this
 * is a real delete, not an archive, despite the frontend comment's wording.
 */

import { validateToken, requireRole, authErrorResponse } from '../../../api-lib/middleware/auth.js';
import { returnToLeads } from '../../../api-lib/services/appointmentService.js';
import { writeAuditLog, clientIp } from '../../../api-lib/services/auditService.js';
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

    await returnToLeads(id);

    await writeAuditLog({
      entityType: 'Appointment',
      entityId: id,
      action: 'AppointmentReturnedToLeads',
      performedById: claims.oid,
      changeDetail: {},
      ipAddress: clientIp(req),
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/[id]/return error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
