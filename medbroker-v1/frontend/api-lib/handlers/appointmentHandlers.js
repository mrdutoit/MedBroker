/**
 * api-lib/handlers/appointmentHandlers.js
 * Consolidated 22 July 2026 — see authHandlers.js header for why. Logic
 * unchanged from the six original files (index.js, [id]/index.js,
 * [id]/assign.js, [id]/reassign.js, [id]/return.js, [id]/outcome.js).
 */

import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import {
  listAppointments, createAppointment, getAppointmentById, assignBroker,
  reassignAppointment, returnToLeads, saveOutcome,
} from '../services/appointmentService.js';
import { getDirectReportIds, isSupervisorOnly, isAgentOnly, getUserDisplayNameById } from '../services/userService.js';
import { writeAuditLog, clientIp, listAuditLog } from '../services/auditService.js';
import {
  CreateAppointmentSchema, AppointmentListQuerySchema, AssignBrokerSchema,
  ReassignAppointmentSchema, SaveOutcomeSchema,
} from '../models/appointment.js';
import { isUuid } from '../http/helpers.js';

/** GET (list) + POST (create) /api/appointments */
export async function handleAppointmentsCollection(req, res) {
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

      const newId = await createAppointment(parsed.data);

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

/** GET /api/appointments/:id */
export async function handleAppointmentById(req, res, id) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin', 'Broker']);

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

/** PUT /api/appointments/:id/assign */
export async function handleAppointmentAssign(req, res, id) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'Supervisor', 'GlobalAdmin']);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid appointment ID format' });

    const parsed = AssignBrokerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    await assignBroker(id, parsed.data.brokerId);

    await writeAuditLog({
      entityType: 'Appointment',
      entityId: id,
      action: 'AppointmentBrokerAssigned',
      performedById: claims.oid,
      changeDetail: {
        brokerId: parsed.data.brokerId,
        brokerName: await getUserDisplayNameById(parsed.data.brokerId),
      },
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

/** PUT /api/appointments/:id/reassign */
export async function handleAppointmentReassign(req, res, id) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'Supervisor', 'GlobalAdmin']);

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
      changeDetail: {
        previousBrokerId: existing.brokerId,
        previousBrokerName: existing.brokerId ? await getUserDisplayNameById(existing.brokerId) : null,
        ...parsed.data,
        ...(parsed.data.brokerId ? { brokerName: await getUserDisplayNameById(parsed.data.brokerId) } : {}),
        ...(parsed.data.agentId ? { agentName: await getUserDisplayNameById(parsed.data.agentId) } : {}),
      },
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

/** PUT /api/appointments/:id/return */
export async function handleAppointmentReturn(req, res, id) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'Supervisor', 'GlobalAdmin']);

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

/** GET /api/appointments/:id/audit */
export async function handleAppointmentAudit(req, res, id) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin', 'Broker']);

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

    const entries = await listAuditLog('Appointment', id);
    return res.status(200).json({ entries });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/[id]/audit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** POST /api/appointments/:id/outcome */
export async function handleAppointmentOutcome(req, res, id) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin', 'Broker']);

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
      changeDetail: {
        customerSigned: parsed.data.customerSigned ?? null,
        newStatus: result.status,
        meetings: parsed.data.meetings ?? null,
      },
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
