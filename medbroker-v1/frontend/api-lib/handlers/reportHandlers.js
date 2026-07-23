/**
 * api-lib/handlers/reportHandlers.js — NEW, 23 Jul 2026.
 * GET /api/reports/summary|brokers|agents?period=Monthly|Quarterly|Yearly.
 * All four roles can hit these — the scoping happens per-row inside
 * reportService.js (Admin/GlobalAdmin see everything; Supervisor sees their
 * own direct reports for agents, all brokers same as the mock did; Agent/
 * Broker each see only their own row), not via requireRole exclusion.
 */

import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import { getReportSummary, getBrokerReport, getAgentReport, getAgentDetailReport, getBrokerDetailReport } from '../services/reportService.js';
import { ReportPeriodQuerySchema } from '../models/report.js';
import { isSupervisorOnly, isAgentOnly } from '../services/userService.js';
import { isUuid } from '../http/helpers.js';

const ALLOWED_ROLES = ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin', 'Broker'];

/**
 * Resolves claims.roles (a set, per requireRole()'s own treatment of it —
 * never indexed, always checked with .includes()) down to the single
 * effective tier reportService.js's scope functions expect. Same
 * precedence isAgentOnly()/isSupervisorOnly() already encode: Admin/
 * GlobalAdmin > Supervisor > Agent > Broker.
 */
function resolveScopeRole(roles) {
  if (roles.includes('GlobalAdmin')) return 'GlobalAdmin';
  if (roles.includes('Admin')) return 'Admin';
  if (isSupervisorOnly(roles)) return 'Supervisor';
  if (isAgentOnly(roles)) return 'Agent';
  if (roles.includes('Broker')) return 'Broker';
  return roles[0]; // shouldn't be reachable given ALLOWED_ROLES, but never throw over it
}

/** GET /api/reports/summary */
export async function handleReportSummary(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const claims = await validateToken(req);
    requireRole(claims, ALLOWED_ROLES);

    const parsed = ReportPeriodQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const summary = await getReportSummary(parsed.data.period);
    return res.status(200).json(summary);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('reports/summary error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/reports/brokers */
export async function handleReportBrokers(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const claims = await validateToken(req);
    requireRole(claims, ALLOWED_ROLES);

    const parsed = ReportPeriodQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const brokers = await getBrokerReport(parsed.data.period, { role: resolveScopeRole(claims.roles), userId: claims.oid });
    return res.status(200).json({ brokers });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('reports/brokers error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/reports/agents */
export async function handleReportAgents(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const claims = await validateToken(req);
    requireRole(claims, ALLOWED_ROLES);

    const parsed = ReportPeriodQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const agents = await getAgentReport(parsed.data.period, { role: resolveScopeRole(claims.roles), userId: claims.oid });
    return res.status(200).json({ agents });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('reports/agents error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/reports/agent/:id */
export async function handleAgentDetail(req, res, id) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const claims = await validateToken(req);
    requireRole(claims, ALLOWED_ROLES);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid agent ID format' });

    const parsed = ReportPeriodQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const report = await getAgentDetailReport(id, parsed.data.period, { role: resolveScopeRole(claims.roles), userId: claims.oid });
    // null covers both "not found" and "not permitted to view" — same
    // response either way, doesn't leak which case it was.
    if (!report) return res.status(404).json({ error: 'Agent not found' });

    return res.status(200).json(report);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('reports/agent/[id] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/reports/broker/:id */
export async function handleBrokerDetail(req, res, id) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const claims = await validateToken(req);
    requireRole(claims, ALLOWED_ROLES);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid broker ID format' });

    const parsed = ReportPeriodQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const report = await getBrokerDetailReport(id, parsed.data.period, { role: resolveScopeRole(claims.roles), userId: claims.oid });
    if (!report) return res.status(404).json({ error: 'Broker not found' });

    return res.status(200).json(report);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('reports/broker/[id] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
