/**
 * api/flags/index.js — NEW.
 * GET /api/flags — no auth required. Feature flags are app configuration,
 * not user data, and FlagContext.jsx needs them before/regardless of login
 * state (they affect what the Login page and nav even look like). Returns
 * the shape FlagContext.jsx already expects: { flags: { key: value, ... } }.
 */

import { listFlags } from '../../src/services/flagService.js';
import { applyCors } from '../../src/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const flags = await listFlags();
    return res.status(200).json({ flags });
  } catch (err) {
    console.error('flags/index error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
