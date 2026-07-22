/**
 * api/health.js
 * No auth required. Confirms the function is deployed and can reach Neon.
 * GET /api/health -> { ok: true, db: "connected", time: "..." }
 */

import { getPool } from '../api-lib/services/db.js';
import { applyCors } from '../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  try {
    const pool = getPool();
    const result = await pool.query('SELECT NOW() AS now');
    return res.status(200).json({ ok: true, db: 'connected', time: result.rows[0].now });
  } catch (err) {
    console.error('health check error:', err);
    return res.status(500).json({ ok: false, db: 'unreachable', error: err.message });
  }
}
