/**
 * api/auth/login.js — NEW.
 * POST /api/auth/login — email + password, returns a signed JWT.
 * No auth required to call this one, obviously.
 */

import { getUserByEmailForLogin, recordLoginSuccess, recordLoginFailure } from '../../src/services/userService.js';
import { verifyPassword, signJwt } from '../../src/services/authService.js';
import { getSystemConfig } from '../../src/services/systemConfigService.js';
import { LoginSchema } from '../../src/models/auth.js';
import { applyCors } from '../../src/http/helpers.js';
import { config } from '../../src/config.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

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
    // Same generic message whether the email doesn't exist or the password
    // is wrong — don't help an attacker enumerate valid accounts.
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
      user: { id: user.id, displayName: user.displayName, email: user.email, role: user.role },
      passwordMustChange,
    });

  } catch (err) {
    console.error('auth/login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
