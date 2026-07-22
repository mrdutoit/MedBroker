/**
 * api/auth/bootstrap-admin.js — NEW.
 * POST /api/auth/bootstrap-admin — creates the first GlobalAdmin user.
 *
 * No normal auth applies here — there's no user to authenticate as yet
 * (chicken-and-egg: User Management itself requires being logged in as an
 * admin already). Gated two ways instead:
 *   1. Caller must supply BOOTSTRAP_SECRET (an env var only you know)
 *   2. Only works while zero active GlobalAdmin users exist
 * Once you've bootstrapped yourself in, this endpoint permanently refuses
 * to do anything — re-running it with the right secret still 403s if a
 * GlobalAdmin already exists. This is meant to be usable "in every version
 * of the app" per Mark's request — same env var, same one call, every time
 * a fresh instance is stood up.
 */

import { timingSafeEqual } from 'crypto';
import { countActiveGlobalAdmins, createLocalUser } from '../../api-lib/services/userService.js';
import { hashPassword, checkPasswordComplexity } from '../../api-lib/services/authService.js';
import { BootstrapAdminSchema } from '../../api-lib/models/auth.js';
import { applyCors } from '../../api-lib/http/helpers.js';
import { config } from '../../api-lib/config.js';

function secretsMatch(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!config.localAuth.bootstrapSecret) {
      return res.status(500).json({ error: 'BOOTSTRAP_SECRET is not configured on the server' });
    }

    const parsed = BootstrapAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { bootstrapSecret, displayName, email, password } = parsed.data;

    if (!secretsMatch(bootstrapSecret, config.localAuth.bootstrapSecret)) {
      return res.status(403).json({ error: 'Invalid bootstrap secret' });
    }

    const existingAdmins = await countActiveGlobalAdmins();
    if (existingAdmins > 0) {
      return res.status(403).json({ error: 'A GlobalAdmin already exists — this endpoint only works on a fresh instance' });
    }

    const complexityProblems = checkPasswordComplexity(password);
    if (complexityProblems.length > 0) {
      return res.status(400).json({ error: { passwordProblems: complexityProblems } });
    }

    const passwordHash = await hashPassword(password);
    const newId = await createLocalUser({
      displayName,
      email,
      role: 'GlobalAdmin',
      passwordHash,
      passwordMustChange: false, // you chose this password yourself, no need to force a change
    });

    return res.status(201).json({ id: newId, message: 'GlobalAdmin created. Log in at /api/auth/login.' });

  } catch (err) {
    console.error('auth/bootstrap-admin error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
