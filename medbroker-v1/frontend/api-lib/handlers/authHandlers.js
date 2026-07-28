/**
 * api-lib/handlers/authHandlers.js
 * Consolidated 22 July 2026 as part of reducing Vercel Function count on
 * the Hobby plan (12-function limit) — was api/auth/login.js and
 * api/auth/bootstrap-admin.js as two separate deployed functions, now one
 * dispatcher (api/auth/[...slug].js) delegating to these. Logic below is
 * UNCHANGED from the original two files — only the export style (named,
 * not default) and location (out of api/, so these files themselves are
 * never separately deployed as functions) changed.
 */

import { timingSafeEqual } from 'crypto';
import { getUserByEmailForLogin, recordLoginSuccess, recordLoginFailure, countActiveGlobalAdmins, createLocalUser } from '../services/userService.js';
import { verifyPassword, signJwt, hashPassword, checkPasswordComplexity } from '../services/authService.js';
import { getSystemConfig } from '../services/systemConfigService.js';
import { LoginSchema, BootstrapAdminSchema } from '../models/auth.js';
import { config } from '../config.js';

/**
 * POST /api/auth/login — email + password, returns a signed JWT.
 * No auth required to call this one, obviously.
 */
export async function handleLogin(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!config.localAuth.jwtSigningSecret) {
      return res.status(500).json({ error: 'JWT_SIGNING_SECRET is not configured on the server' });
    }

    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;

    const user = await getUserByEmailForLogin(email);
    const INVALID = { error: 'Invalid email or password' };

    if (!user) return res.status(401).json(INVALID);
    if (!user.isActive) return res.status(403).json({ error: 'This account is inactive. Contact your administrator.' });
    if (user.isLocked) return res.status(423).json({ error: 'This account is locked. Contact your administrator.' });
    if (!user.passwordHash) return res.status(401).json({ error: 'This account uses single sign-on, not a password. Use the SSO login option.' });

    const passwordOk = await verifyPassword(password, user.passwordHash);
    if (!passwordOk) {
      const sysConfig = await getSystemConfig();
      const { isLocked } = await recordLoginFailure(user.id, sysConfig.passwordLockoutAttempts);
      if (isLocked) {
        return res.status(423).json({ error: 'Too many failed attempts. This account is now locked — contact your administrator.' });
      }
      return res.status(401).json(INVALID);
    }

    await recordLoginSuccess(user.id);

    const sysConfig = await getSystemConfig();
    let passwordMustChange = user.passwordMustChange === true;
    if (!passwordMustChange && sysConfig.passwordRotationDays > 0 && user.passwordSetAt) {
      const ageDays = (Date.now() - new Date(user.passwordSetAt).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays >= sysConfig.passwordRotationDays) passwordMustChange = true;
    }

    const token = signJwt(
      { oid: user.id, roles: [user.role], name: user.displayName, email: user.email },
      config.localAuth.jwtSigningSecret
    );

    return res.status(200).json({
      token,
      user: {
        id: user.id, displayName: user.displayName, email: user.email, role: user.role,
        avatarColour: user.avatarColour, themePreference: user.themePreference, timezone: user.timezone,
      },
      passwordMustChange,
    });

  } catch (err) {
    console.error('auth/login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function secretsMatch(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * POST /api/auth/bootstrap-admin — creates the first GlobalAdmin user.
 * Gated by BOOTSTRAP_SECRET + zero-existing-GlobalAdmin check.
 */
export async function handleBootstrapAdmin(req, res) {
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
      passwordMustChange: false,
    });

    return res.status(201).json({ id: newId, message: 'GlobalAdmin created. Log in at /api/auth/login.' });

  } catch (err) {
    console.error('auth/bootstrap-admin error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
