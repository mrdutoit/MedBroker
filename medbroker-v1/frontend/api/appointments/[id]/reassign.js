/**
 * api/appointments/[id]/reassign.js — NEW.
 * PUT /api/appointments/:id/reassign — Admin, Supervisor, GlobalAdmin.
 * Changes broker and/or agent on an already-assigned appointment, keeping
 * the existing status (unlike assign.js, which moves Unassigned -> Assigned).
 */

import { validateToken, requireRole, authErrorResponse } from '../../../api-lib/middleware/auth.js';
import { reassignAppointment, getAppointmentById } from '../../../api-lib/services/appointmentService.js';
import { writeAuditLog, clientIp } from '../../../api-lib/services/auditService.js';
import { ReassignAppointmentSchema } from '../../../api-lib/models/appointment.js';
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

    const existing = await getAppointmentById(id);
    if (!existing) return res.status(404).json({ error: 'Appointment not found' });

    const parsed = ReassignAppointmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    await reassignAppointment(id, parsed.data);

    await writeAuditLog({
      entityType: 'Appointment',
      entityId: id,
      action: 'AppointmentReassigned',
      performedById: claims.oid,
      changeDetail: { previousBrokerId: existing.brokerId, ...parsed.data },
      ipAddress: clientIp(req),
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/[id]/reassign error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
