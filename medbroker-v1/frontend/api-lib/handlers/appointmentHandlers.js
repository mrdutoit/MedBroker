/**
 * api-lib/handlers/appointmentHandlers.js
 * Consolidated 22 July 2026 — see authHandlers.js header for why. Logic
 * unchanged from the six original files (index.js, [id]/index.js,
 * [id]/assign.js, [id]/reassign.js, [id]/return.js, [id]/outcome.js).
 */

import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import {
  listAppointments, createAppointment, getAppointmentById, assignBroker,
  reassignAppointment, returnToLeads, saveOutcome, claimAppointment, listAvailableToClaim,
} from '../services/appointmentService.js';
import { findMatchingBrokers } from '../services/brokerMatchingService.js';
import { getDirectReportIds, isSupervisorOnly, isAgentOnly, getUserDisplayNameById, getActiveUserById } from '../services/userService.js';
import { getLeadDisplayNameById } from '../services/leadService.js';
import { writeAuditLog, clientIp, listAuditLog } from '../services/auditService.js';
import { getCurrentTokenLedger, manualTopUp, listTokenTransactions } from '../services/tokenService.js';
import { getSystemConfig } from '../services/systemConfigService.js';
import { getFlagMeta } from '../services/flagService.js';
import {
  CreateAppointmentSchema, AppointmentListQuerySchema, AssignBrokerSchema,
  ReassignAppointmentSchema, SaveOutcomeSchema, BrokerMatchingQuerySchema, TokenTopUpSchema,
} from '../models/appointment.js';
import { isUuid } from '../http/helpers.js';

/**
 * True if appointments.claimModel is currently set to 'claim'. Checked at
 * the route layer for every §117 claim-model endpoint (claim, available-
 * to-claim) — same "flag genuinely gates behaviour, not just frontend
 * visibility" pattern auth.sso.enabled/security.kmsEncryption.enabled
 * already established. Deliberately NOT checked for the token-ledger/
 * top-up endpoints below — an Admin should still be able to view/top-up a
 * broker's balance even if the org has since switched back to 'assign'
 * (their existing balance doesn't just stop existing).
 */
async function isClaimModelEnabled() {
  const meta = await getFlagMeta('appointments.claimModel');
  return meta?.value === 'claim';
}

/** GET (list) + POST (create) /api/appointments */
/**
 * GET /api/appointments/broker-matching — Agent, Supervisor, Admin,
 * GlobalAdmin. Called from LeadDetail.jsx's Book Appointment modal to
 * populate the broker selection list before creating the appointment —
 * this route only finds candidates, it doesn't book anything itself.
 *
 * MOVED HERE 28 Jul 2026 (§62) — was its own standalone file at
 * api/broker-matching/index.js, which Vercel counts as a separate
 * serverless function regardless of what vercel.json's rewrites do. That
 * file plus Tasks (§56) and Notifications (§61) pushed the total to 13,
 * one over Hobby's 12-function ceiling — the actual cause of the failed
 * deployment Mark hit. Folded in here rather than into some other router,
 * since this is squarely appointment-domain logic; logic itself is
 * unchanged from the original file.
 */
export async function handleBrokerMatching(req, res) {
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
    console.error('appointments/broker-matching error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

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
        changeDetail: {
          leadId: parsed.data.leadId,
          leadName: await getLeadDisplayNameById(parsed.data.leadId),
          brokerId: parsed.data.brokerId ?? null,
          brokerName: parsed.data.brokerId ? await getUserDisplayNameById(parsed.data.brokerId) : null,
        },
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

/**
 * PUT /api/appointments/:id/claim — §117. Broker ONLY — this is the
 * self-service action the claim model exists for, deliberately not
 * extended to Admin/Supervisor/GlobalAdmin (those roles have
 * assign/reassign for exactly this reason — claiming on someone else's
 * behalf isn't what "claim" means here).
 */
export async function handleAppointmentClaim(req, res, id) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Broker']);

    if (!(await isClaimModelEnabled())) {
      return res.status(403).json({ error: 'Appointment claiming is not enabled for this deployment' });
    }
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid appointment ID format' });

    await claimAppointment(id, claims.oid);

    await writeAuditLog({
      entityType: 'Appointment',
      entityId: id,
      action: 'AppointmentClaimed',
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
    console.error('appointments/[id]/claim error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/appointments/available-to-claim — §117. Broker only. */
export async function handleAvailableToClaim(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Broker']);

    if (!(await isClaimModelEnabled())) {
      return res.status(403).json({ error: 'Appointment claiming is not enabled for this deployment' });
    }

    const appointments = await listAvailableToClaim(claims.oid);
    return res.status(200).json({ appointments });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/available-to-claim error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/appointments/tokens/me — §117. Broker's own current balance +
 * recent transaction history. Not gated on isClaimModelEnabled() —
 * deliberately (see this file's top comment): a broker's existing balance
 * doesn't stop existing just because the org switched back to 'assign'.
 */
export async function handleTokenLedgerMe(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Broker']);

    const ledger = await getCurrentTokenLedger(claims.oid);
    const transactions = await listTokenTransactions(claims.oid);
    const { brokerFreeAppointmentsPerMonth } = await getSystemConfig();
    return res.status(200).json({ ledger, transactions, monthlyAllocation: brokerFreeAppointmentsPerMonth });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/tokens/me error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/appointments/tokens/:brokerId — §117. Admin/GlobalAdmin only —
 * same scope as the top-up action below, deliberately not extended to
 * Supervisor (Broker isn't part of the Agent->Supervisor hierarchy
 * getDirectReportIds() resolves, so there's no natural "which brokers is
 * this Supervisor allowed to see" rule to apply here anyway).
 */
export async function handleTokenLedgerByBroker(req, res, brokerId) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    if (!isUuid(brokerId)) return res.status(400).json({ error: 'Invalid broker ID format' });
    const broker = await getActiveUserById(brokerId);
    if (!broker || broker.role !== 'Broker') return res.status(404).json({ error: 'Broker not found' });

    const ledger = await getCurrentTokenLedger(brokerId);
    const transactions = await listTokenTransactions(brokerId);
    const { brokerFreeAppointmentsPerMonth } = await getSystemConfig();
    return res.status(200).json({ ledger, transactions, monthlyAllocation: brokerFreeAppointmentsPerMonth, brokerName: broker.displayName });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/tokens/[brokerId] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PUT /api/appointments/tokens/:brokerId/topup — §117. Admin/GlobalAdmin
 * only. The ENTIRE appointments.tokens.paymentProvider = 'none' path —
 * see tokenService.manualTopUp()'s own header for why this isn't a
 * stopgap standing in for Stripe.
 */
export async function handleTokenTopUp(req, res, brokerId) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    if (!isUuid(brokerId)) return res.status(400).json({ error: 'Invalid broker ID format' });
    const broker = await getActiveUserById(brokerId);
    if (!broker || broker.role !== 'Broker') return res.status(404).json({ error: 'Broker not found' });

    const parsed = TokenTopUpSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    await manualTopUp(brokerId, parsed.data.amount, claims.oid);

    await writeAuditLog({
      entityType: 'TokenLedger',
      entityId: brokerId,
      action: 'TokenManualTopUp',
      performedById: claims.oid,
      changeDetail: { brokerId, brokerName: broker.displayName, amount: parsed.data.amount },
      ipAddress: clientIp(req),
    });

    const ledger = await getCurrentTokenLedger(brokerId);
    const { brokerFreeAppointmentsPerMonth } = await getSystemConfig();
    return res.status(200).json({ ledger, monthlyAllocation: brokerFreeAppointmentsPerMonth });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('appointments/tokens/[brokerId]/topup error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
