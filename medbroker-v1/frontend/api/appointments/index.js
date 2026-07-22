/**
 * api/appointments/index.js — NEW.
 *   GET  /api/appointments — Agent, Supervisor, Admin, GlobalAdmin, Broker
 *        Row-level scoping (A1-style, matching leadService's pattern):
 *          Agent: own booked appointments only (agentId = claims.oid)
 *          Broker: own assigned appointments only (brokerId = claims.oid)
 *          Supervisor (without Admin): direct reports' appointments + own
 *          Admin/GlobalAdmin: unrestricted
 *   POST /api/appointments — Agent, Supervisor, Admin, GlobalAdmin — books
 *        a new appointment from Lead Detail. agentId is taken from the
 *        JWT, never the request body — see models/appointment.js.
 */

import { validateToken, requireRole, authErrorResponse } from '../../api-lib/middleware/auth.js';
import { listAppointments, createAppointment } from '../../api-lib/services/appointmentService.js';
import { getDirectReportIds, isSupervisorOnly, isAgentOnly } from '../../api-lib/services/userService.js';
import { writeAuditLog, clientIp } from '../../api-lib/services/auditService.js';
import { CreateAppointmentSchema, AppointmentListQuerySchema } from '../../api-lib/models/appointment.js';
import { applyCors } from '../../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  try {
    const claims = await validateToken(req);

    if (req.method === 'GET') {
      requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin', 'Broker']);

      const parsed = AppointmentListQuerySchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const filters = { ...parsed.data };
      if (isAgentOnly(claims.roles)) {
        filters.agentId = claims.oid;
      } else if (claims.roles.includes('Broker') && !claims.roles.includes('Admin') && !claims.roles.includes('GlobalAdmin')) {
        filters.brokerId = claims.oid;
      } else if (isSupervisorOnly(claims.roles)) {
        filters.supervisorAgentIds = await getDirectReportIds(claims.oid);
      }

      const result = await listAppointments(filters);
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin']);

      const parsed = CreateAppointmentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const newId = await createAppointment(parsed.data, claims.oid);

      await writeAuditLog({
        entityType: 'Appointment',
        entityId: newId,
        action: 'AppointmentCreated',
        performedById: claims.oid,
        changeDetail: { leadId: parsed.data.leadId, brokerId: parsed.data.brokerId ?? null },
        ipAddress: clientIp(req),
      });

      return res.status(201).json({ id: newId });
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/index error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
