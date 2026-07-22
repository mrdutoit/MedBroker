/**
 * api/appointments/[id]/outcome.js — NEW.
 * POST /api/appointments/:id/outcome — Agent, Supervisor, Admin,
 * GlobalAdmin, Broker (whoever can see the appointment can record what
 * happened at the meeting — matches AppointmentDetail.jsx, which shows
 * the outcome form to canManage AND the assigned broker/agent).
 * Resulting status is computed server-side — see appointmentStatusService.js.
 */

import { validateToken, requireRole, authErrorResponse } from '../../../api-lib/middleware/auth.js';
import { saveOutcome, getAppointmentById } from '../../../api-lib/services/appointmentService.js';
import { writeAuditLog, clientIp } from '../../../api-lib/services/auditService.js';
import { SaveOutcomeSchema } from '../../../api-lib/models/appointment.js';
import { isUuid, applyCors } from '../../../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin', 'Broker']);

    const { id } = req.query;
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid appointment ID format' });

    const existing = await getAppointmentById(id);
    if (!existing) return res.status(404).json({ error: 'Appointment not found' });

    const parsed = SaveOutcomeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = await saveOutcome(id, parsed.data);

    await writeAuditLog({
      entityType: 'Appointment',
      entityId: id,
      action: 'AppointmentOutcomeSaved',
      performedById: claims.oid,
      changeDetail: { customerSigned: parsed.data.customerSigned ?? null, newStatus: result.status },
      ipAddress: clientIp(req),
    });

    return res.status(200).json(result);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/[id]/outcome error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
