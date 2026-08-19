/**
 * handlers/dataExportHandlers.js — 18 Aug 2026, Mark's explicit request.
 * Full data export across Leads, Appointments, MeetingAttempts, and
 * CallAttempts — org-scoped, Admin/GlobalAdmin only, XLSX or JSON.
 *
 * Routed through the existing flags-router.js (GET /api/flags/data-export),
 * same reasoning as auditHandlers.js's own header comment: this app is
 * sitting at 12/12 Vercel functions on the current Hobby-tier deployment,
 * with zero headroom for a new top-level function file. Not a "not a
 * natural domain fit" case the way Audit Log was, though — Data Export
 * doesn't have a more natural existing router to live under either, so
 * this is purely the same deployability constraint, not a domain mismatch.
 *
 * Deliberately NO row cap, unlike auditHandlers.js's MAX_EXPORT_ROWS —
 * Mark's ask was specifically for a genuinely complete export, and
 * Vercel's function duration default is 300s (fluid compute, on by
 * default on every current plan tier — see dataExportService.js's own
 * header comment), comfortably ahead of what a synchronous query +
 * workbook build needs for any realistic SME brokerage's data volume.
 * If a customer's actual row counts ever threaten that budget, that's a
 * real scaling problem worth its own conversation, not something to
 * silently truncate here today.
 */

import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import { buildExportPayload, buildExportWorkbook } from '../services/dataExportService.js';

export async function handleDataExport(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    const format = req.query.format;
    if (format !== 'xlsx' && format !== 'json') {
      return res.status(400).json({ error: 'format must be "xlsx" or "json"' });
    }

    const payload = await buildExportPayload();
    const dateStamp = new Date().toISOString().slice(0, 10);

    if (format === 'json') {
      const filename = `medbroker-export-${dateStamp}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.statusCode = 200;
      return res.end(JSON.stringify(payload, null, 2));
    }

    const filename = `medbroker-export-${dateStamp}.xlsx`;
    const buffer = await buildExportWorkbook(payload);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.statusCode = 200;
    return res.end(buffer);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('Data export failed:', err);
    return res.status(500).json({ error: 'Export failed' });
  }
}
