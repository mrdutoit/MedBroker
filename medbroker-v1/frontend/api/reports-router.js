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
 */

import {
  handleReportSummary, handleReportBrokers, handleReportAgents,
  handleAgentDetail, handleBrokerDetail,
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

  return res.status(404).json({ error: 'Not found' });
}
