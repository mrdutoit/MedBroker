/**
 * api/appointments/[id]/index.js — NEW.
 *   GET /api/appointments/:id — Agent, Supervisor, Admin, GlobalAdmin, Broker
 *   Row-level ownership check matches AppointmentDetail.jsx's own header
 *   comment: Agent sees own bookings, Broker sees own assignments,
 *   Supervisor sees direct reports', Admin/GlobalAdmin unrestricted.
 */

import { validateToken, requireRole, authErrorResponse } from '../../../api-lib/middleware/auth.js';
import { getAppointmentById } from '../../../api-lib/services/appointmentService.js';
import { getDirectReportIds, isSupervisorOnly, isAgentOnly } from '../../../api-lib/services/userService.js';
import { isUuid, applyCors } from '../../../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin', 'Broker']);

    const { id } = req.query;
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid appointment ID format' });

    const appt = await getAppointmentById(id);
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    if (isAgentOnly(claims.roles) && appt.agentId !== claims.oid) {
      return res.status(403).json({ error: 'You did not book this appointment' });
    }
    if (claims.roles.includes('Broker') && !claims.roles.includes('Admin') && !claims.roles.includes('GlobalAdmin') && appt.brokerId !== claims.oid) {
      return res.status(403).json({ error: 'This appointment is not assigned to you' });
    }
    if (isSupervisorOnly(claims.roles)) {
      const directReports = await getDirectReportIds(claims.oid);
      if (!directReports.includes(appt.agentId) && appt.agentId !== claims.oid) {
        return res.status(403).json({ error: 'This appointment is outside your team' });
      }
    }

    return res.status(200).json(appt);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/[id] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
