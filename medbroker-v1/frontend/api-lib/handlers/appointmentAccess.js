/**
 * api-lib/handlers/appointmentAccess.js
 * 30 Sep 2026 — one shared scope check for every appointment endpoint.
 * Before this, only GET-by-id and audit checked ownership/team; every write
 * (outcome, meeting-attempt, assign, reassign, return, reopen, create) let
 * any authenticated role act on any appointment.
 */

import { getDirectReportIds, isSupervisorOnly, isAgentOnly } from '../services/userService.js';

const isAdminLike = (roles) => roles.includes('Admin') || roles.includes('GlobalAdmin');

/** Throws { status: 403 } unless the caller may act on this appointment. */
export async function assertAppointmentAccess(claims, appt) {
  if (isAgentOnly(claims.roles) && appt.agentId !== claims.oid) {
    throw { status: 403, message: 'Forbidden' };
  }
  if (claims.roles.includes('Broker') && !isAdminLike(claims.roles) && appt.brokerId !== claims.oid) {
    throw { status: 403, message: 'Forbidden' };
  }
  if (isSupervisorOnly(claims.roles)) {
    const directReports = await getDirectReportIds(claims.oid);
    if (!directReports.includes(appt.agentId) && appt.agentId !== claims.oid) {
      throw { status: 403, message: 'Forbidden' };
    }
  }
}

/** Throws { status: 403 } unless the caller may book an appointment on this lead. Mirrors leadHandlers PUT. */
export async function assertLeadBookable(claims, lead) {
  if (isAgentOnly(claims.roles) && lead.assignedAgentId !== claims.oid) {
    throw { status: 403, message: 'Forbidden' };
  }
  if (isSupervisorOnly(claims.roles)) {
    const directReports = await getDirectReportIds(claims.oid);
    if (!lead.assignedAgentId || (!directReports.includes(lead.assignedAgentId) && lead.assignedAgentId !== claims.oid)) {
      throw { status: 403, message: 'Forbidden' };
    }
  }
}
