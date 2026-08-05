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
import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import { getUserByEmailForLogin, recordLoginSuccess, recordLoginFailure, countActiveGlobalAdmins, createLocalUser, getUserPasswordHash, setUserPassword, wasPasswordUsedThisYear, revokeUserSessions, getUserByEntraObjectId, getUserForSsoMatch, backfillEntraObjectId, jitProvisionSsoUser, listSsoLinkedActiveUsers, deactivateUser } from '../services/userService.js';
import { verifyPassword, signJwt, hashPassword, checkPasswordComplexity } from '../services/authService.js';
import { validateEntraToken } from '../services/entraAuthService.js';
import { isEntraAccountActive } from '../services/entraGraphService.js';
import { getSystemConfig } from '../services/systemConfigService.js';
import { getFlagMeta } from '../services/flagService.js';
import { writeAuditLog, clientIp } from '../services/auditService.js';
import { LoginSchema, BootstrapAdminSchema, ChangePasswordSchema, EntraLoginSchema } from '../models/auth.js';
import { config } from '../config.js';
import { setAuthCookie, clearAuthCookie } from '../http/helpers.js';

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

    // §121 (SSO stage 3) — the password-fallback toggle. Only applies to
    // a user who actually HAS a linked Entra identity — a local-only
    // account is never affected by this flag, regardless of its value.
    // GlobalAdmin is deliberately EXEMPT even when this is on, always —
    // a permanent break-glass path so an Entra outage or a
    // misconfigured app registration can never fully lock every admin
    // out of MedBroker. This check runs before the passwordHash check
    // below on purpose: even a user who technically still has a local
    // password set must be told to use SSO once policy requires it, not
    // silently allowed through because the password field happens to be
    // populated.
    if (user.entraObjectId && user.role !== 'GlobalAdmin') {
      const [ssoEnabledMeta, fallbackMeta] = await Promise.all([
        getFlagMeta('auth.sso.enabled'),
        getFlagMeta('auth.sso.disableLocalFallback'),
      ]);
      if (ssoEnabledMeta?.value === '1' && fallbackMeta?.value === '1') {
        return res.status(403).json({ error: 'This account must sign in with Microsoft. Use the "Sign in with Microsoft" option.' });
      }
    }

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

    // §113 — the token now goes in an httpOnly cookie, not the JSON body.
    // Previously returning it in the response meant it had to be cached
    // somewhere JS-readable (sessionStorage) to attach to later requests
    // — an httpOnly cookie is never readable by JS at all, closing off
    // that theft vector regardless of any XSS elsewhere on the page.
    setAuthCookie(res, token);

    return res.status(200).json({
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

/**
 * PUT /api/auth/change-password — §72. Used for both a forced
 * first-login change (passwordMustChange was true) and a voluntary
 * self-service change from Settings — same endpoint, same rules either
 * way. currentPassword is required in both cases; see ChangePasswordSchema's
 * own comment in models/auth.js for why that's not just a UX formality.
 */
export async function handleChangePassword(req, res) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);

    const parsed = ChangePasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { currentPassword, newPassword } = parsed.data;

    const existing = await getUserPasswordHash(claims.oid);
    if (!existing?.passwordHash) {
      return res.status(400).json({ error: 'This account has no local password set — contact your administrator' });
    }

    const currentOk = await verifyPassword(currentPassword, existing.passwordHash);
    if (!currentOk) return res.status(400).json({ error: 'Current password is incorrect' });

    const complexityProblems = checkPasswordComplexity(newPassword);
    if (complexityProblems.length > 0) {
      return res.status(400).json({ error: { passwordProblems: complexityProblems } });
    }

    // Reuse prevention ("unique passwords in a calendar year", Mark's own
    // phrasing) — admin-configurable (SystemConfig.passwordPreventReuse,
    // default on), checked here rather than baked in unconditionally.
    const sysConfig = await getSystemConfig();
    if (sysConfig.passwordPreventReuse) {
      const reused = await wasPasswordUsedThisYear(claims.oid, newPassword);
      if (reused) {
        return res.status(400).json({ error: 'This password has already been used this year — choose a different one' });
      }
    }

    await setUserPassword(claims.oid, newPassword);

    // §97 — invalidate every token issued before this moment (closes the
    // real gap: previously a password change didn't stop an old, possibly
    // stolen token from staying valid for its remaining lifetime), then
    // immediately issue a fresh one for the session that just made this
    // request, so the user isn't unexpectedly logged out by their own
    // password change.
    await revokeUserSessions(claims.oid);
    const newToken = signJwt(
      { oid: claims.oid, roles: [existing.role], name: existing.displayName, email: existing.email },
      config.localAuth.jwtSigningSecret
    );

    // §113 — re-issued the same way login does: cookie, not JSON body.
    setAuthCookie(res, newToken);

    return res.status(200).json({ message: 'Password changed successfully' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('auth/change-password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/auth/logout (§113) — clears the httpOnly session cookie.
 * Didn't exist before this: with the token in sessionStorage, "logout"
 * was purely a frontend action (clear the store). An httpOnly cookie
 * can only be cleared by the server that set it — JavaScript has no way
 * to touch it at all, which is the whole point of using one — so a real
 * endpoint is now required for logout to actually do anything.
 * No validateToken() call here deliberately: logging out an already-
 * invalid or expired session should still succeed in clearing whatever
 * cookie the browser has, rather than erroring.
 */
export async function handleLogout(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  clearAuthCookie(res);
  return res.status(200).json({ message: 'Logged out' });
}

/**
 * POST /api/auth/entra-login — §114 (4 Aug 2026), SSO stage 2. Verifies
 * an Entra ID token (entraAuthService.js), matches it to a User row, and
 * issues the SAME kind of session local login already issues (httpOnly
 * cookie via setAuthCookie/signJwt) — see entraAuthService.js's header
 * comment for why this deliberately does not introduce a second
 * per-request auth path in middleware/auth.js.
 *
 * Gated on auth.sso.enabled (Core flag, off by default) — the same
 * backend-BEHAVIOUR flag-gate pattern encryption.js's
 * security.kmsEncryption.enabled check already established (§112),
 * distinct from the frontend-visibility-only pattern most other flags in
 * this app use. Off is the safe default: this endpoint exists in every
 * deployment from the moment this ships, but does nothing until Mark
 * deliberately turns SSO on for a given customer.
 *
 * Matching order, per §109's design — backfill onto the EXISTING row
 * rather than ever creating a duplicate for someone who already has a
 * local account, so every foreign key already pointing at their user id
 * keeps working with no separate merge step:
 *   1. entraObjectId already linked -> that IS the user, always.
 *   2. No entraObjectId match, but email matches an unlinked local row
 *      -> auto-backfill entraObjectId onto it, log them in.
 *   3. Email matches a row already linked to a DIFFERENT entraObjectId
 *      -> a genuine mismatch, reject rather than silently relinking; a
 *      GlobalAdmin resolves this via PUT /api/users/:id/link-identity.
 *   4. No match at all -> JIT-provision a new, INACTIVE row (design
 *      decision (b)) and reject the login with a clear pending-review
 *      message. An inactive account never gets a working session here,
 *      same as every other isActive check in this file — the freshly
 *      created row is real and immediately visible in User Admin, but
 *      grants no access until a GlobalAdmin/Admin reviews and activates it.
 */
export async function handleEntraLogin(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const ssoFlag = await getFlagMeta('auth.sso.enabled');
    if (ssoFlag?.value !== '1') {
      return res.status(403).json({ error: 'Single sign-on is not enabled for this deployment' });
    }

    if (!config.localAuth.jwtSigningSecret) {
      return res.status(500).json({ error: 'JWT_SIGNING_SECRET is not configured on the server' });
    }

    const parsed = EntraLoginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // Throws { status: 401, message } on any verification failure — bad
    // signature, expired, wrong issuer/audience/tenant, missing claims.
    const identity = await validateEntraToken(parsed.data.idToken);

    let user = await getUserByEntraObjectId(identity.entraObjectId);

    if (!user) {
      const emailMatch = await getUserForSsoMatch(identity.email);

      if (emailMatch && !emailMatch.entraObjectId) {
        await backfillEntraObjectId(emailMatch.id, identity.entraObjectId);
        user = emailMatch;
      } else if (emailMatch && emailMatch.entraObjectId) {
        // Already linked to a DIFFERENT identity — a real mismatch, not
        // just "first time seeing this person." Don't silently relink.
        return res.status(409).json({
          error: 'This email is already linked to a different sign-in identity. Contact your GlobalAdmin.',
        });
      } else {
        const newId = await jitProvisionSsoUser(identity);
        await writeAuditLog({
          entityType: 'User', entityId: newId, action: 'SsoUserJitProvisioned',
          performedById: null, // no MedBroker user performed this — the identity provider did
          changeDetail: { entraObjectId: identity.entraObjectId, email: identity.email },
          ipAddress: clientIp(req),
        });
        return res.status(403).json({
          error: 'Your account has been created but is pending administrator approval. Contact your GlobalAdmin.',
        });
      }
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'This account is inactive. Contact your administrator.' });
    }

    await recordLoginSuccess(user.id);

    const token = signJwt(
      { oid: user.id, roles: [user.role], name: user.displayName, email: user.email },
      config.localAuth.jwtSigningSecret
    );

    // Same session mechanism as local login (§113) — httpOnly cookie, not
    // a JSON body token.
    setAuthCookie(res, token);

    return res.status(200).json({
      user: {
        id: user.id, displayName: user.displayName, email: user.email, role: user.role,
        avatarColour: user.avatarColour, themePreference: user.themePreference, timezone: user.timezone,
      },
      passwordMustChange: false, // SSO users have no local password to rotate
    });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('auth/entra-login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/auth/offboarding-sync — §121 (4 Aug 2026, SSO stage 3b).
 * GlobalAdmin only. On-demand, not scheduled — this stack has no cron
 * infrastructure (same constraint tokenService.js's monthly reset works
 * around, differently: that one self-heals on next read; this one
 * genuinely needs an explicit trigger, since "check if someone still
 * exists in a THIRD PARTY's directory" isn't something that can be
 * deferred to whenever that person next happens to log in — if they've
 * been removed from Entra, they're not logging in at all anymore).
 *
 * Checks every currently-active, Entra-linked user against Microsoft
 * Graph (entraGraphService.js) and deactivates any whose Entra account
 * is gone or disabled. Continues past individual failures (one broken
 * Graph lookup shouldn't abort checking everyone else) and reports them
 * back rather than silently swallowing them.
 */
export async function handleEntraOffboardingSync(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['GlobalAdmin']);

    const ssoEnabledMeta = await getFlagMeta('auth.sso.enabled');
    if (ssoEnabledMeta?.value !== '1') {
      return res.status(403).json({ error: 'Single sign-on is not enabled for this deployment' });
    }

    const candidates = await listSsoLinkedActiveUsers();
    let deactivatedCount = 0;
    const deactivated = [];
    const errors = [];

    for (const candidate of candidates) {
      try {
        const stillActive = await isEntraAccountActive(candidate.entraObjectId);
        if (!stillActive) {
          await deactivateUser(candidate.id);
          await writeAuditLog({
            entityType: 'User',
            entityId: candidate.id,
            action: 'UserDeactivated',
            performedById: claims.oid,
            changeDetail: { reason: 'Offboarding sync — account no longer active in Entra ID', displayName: candidate.displayName },
            ipAddress: clientIp(req),
          });
          deactivatedCount += 1;
          deactivated.push({ id: candidate.id, displayName: candidate.displayName });
        }
      } catch (err) {
        // One broken Graph lookup (network blip, a since-revoked app
        // permission, etc.) shouldn't abort the whole sync — collect it
        // and keep checking the rest of the candidates.
        errors.push({ id: candidate.id, displayName: candidate.displayName, message: err.message ?? 'Unknown error' });
      }
    }

    return res.status(200).json({
      checked: candidates.length,
      deactivatedCount,
      deactivated,
      errors,
    });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('auth/offboarding-sync error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
