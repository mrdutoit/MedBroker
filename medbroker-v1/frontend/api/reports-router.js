/**
 * api/reports-router.js — NEW, 23 Jul 2026.
 * Reached via vercel.json rewrite `/api/reports/:slug*` ->
 * `/api/reports-router?slug=:slug*`.
 *
 * Routes:
 *   GET /api/reports/summary
 *   GET /api/reports/brokers
 *   GET /api/reports/agents
 *   GET /api/reports/agent/:id
 *   GET /api/reports/broker/:id
 *   GET /api/reports/leads-by-source        (§151, 13 Aug 2026)
 *   GET /api/reports/leads-by-portfolio      (§151)
 *   GET /api/reports/appointments-by-portfolio     (§151)
 *   GET /api/reports/appointments-by-meeting-type  (§151)
 *   GET /api/reports/closed-won-by-product   (§155, 13 Aug 2026)
 *   GET /api/reports/dashboard               (§156/§162, 14 Aug 2026)
 */

import {
  handleReportSummary, handleReportBrokers, handleReportAgents,
  handleAgentDetail, handleBrokerDetail,
  handleLeadsBySource, handleLeadsByPortfolio, handleAppointmentsByPortfolio, handleAppointmentsByMeetingType,
  handleClosedWonByProduct, handleDashboard,
} from '../api-lib/handlers/reportHandlers.js';
import { applyCors, parseSlug } from '../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const segments = parseSlug(req.query.slug);

  if (segments.length === 1 && segments[0] === 'summary') return handleReportSummary(req, res);
  if (segments.length === 1 && segments[0] === 'brokers') return handleReportBrokers(req, res);
  if (segments.length === 1 && segments[0] === 'agents')  return handleReportAgents(req, res);
  if (segments.length === 2 && segments[0] === 'agent')   return handleAgentDetail(req, res, segments[1]);
  if (segments.length === 2 && segments[0] === 'broker')  return handleBrokerDetail(req, res, segments[1]);
  if (segments.length === 1 && segments[0] === 'leads-by-source')               return handleLeadsBySource(req, res);
  if (segments.length === 1 && segments[0] === 'leads-by-portfolio')            return handleLeadsByPortfolio(req, res);
  if (segments.length === 1 && segments[0] === 'appointments-by-portfolio')     return handleAppointmentsByPortfolio(req, res);
  if (segments.length === 1 && segments[0] === 'appointments-by-meeting-type')  return handleAppointmentsByMeetingType(req, res);
  if (segments.length === 1 && segments[0] === 'closed-won-by-product')        return handleClosedWonByProduct(req, res);
  if (segments.length === 1 && segments[0] === 'dashboard')                    return handleDashboard(req, res);

  return res.status(404).json({ error: 'Not found' });
}
