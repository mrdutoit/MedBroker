/**
 * api-lib/handlers/userHandlers.js
 * Consolidated 22 July 2026 — see authHandlers.js header for why. Logic
 * unchanged from api/users/index.js and api/users/[id]/index.js.
 */

import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import { listUsers, createUserFull, listSupervisors, getUserForAdmin, updateUserFull, getOwnProfile, updateOwnProfile, unlockUser, revokeUserSessions } from '../services/userService.js';
import { writeAuditLog, clientIp } from '../services/auditService.js';
import { CreateUserSchema, UserListQuerySchema, UpdateUserSchema, UpdateOwnProfileSchema } from '../models/user.js';
import { isUuid } from '../http/helpers.js';

/** GET (list) + POST (create) /api/users */
export async function handleUsersCollection(req, res) {
  try {
    const claims = await validateToken(req);

    if (req.method === 'GET') {
      requireRole(claims, ['Admin', 'Supervisor', 'GlobalAdmin']);

      const parsed = UserListQuerySchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      if (req.query.supervisors === 'true') {
        return res.status(200).json({ supervisors: await listSupervisors() });
      }

      const users = await listUsers(parsed.data);
      return res.status(200).json({ users });
    }

    if (req.method === 'POST') {
      requireRole(claims, ['Admin', 'GlobalAdmin']);

      const parsed = CreateUserSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      let newId;
      try {
        newId = await createUserFull(parsed.data);
      } catch (err) {
        if (err.code === '23505') {
          return res.status(409).json({ error: 'A user with this email address already exists' });
        }
        throw err;
      }

      await writeAuditLog({
        entityType: 'User',
        entityId: newId,
        action: 'UserCreated',
        performedById: claims.oid,
        changeDetail: { role: parsed.data.role, email: parsed.data.email },
        ipAddress: clientIp(req),
      });

      return res.status(201).json({ id: newId });
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('users/index error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET + PUT /api/users/me — self-service profile (Settings.jsx). Every
 * authenticated role reaches this, deliberately no requireRole() gate —
 * unlike handleUserById below (Admin/GlobalAdmin editing SOMEONE ELSE),
 * this always operates on claims.oid, the caller's own row, never on an id
 * taken from the request. That's what makes "no role gate" safe here: an
 * Agent can freely GET/PUT this route, but there is no way to reach any
 * row but their own through it — UpdateOwnProfileSchema also can't accept
 * role/isActive/portfolios, so even a self-edit can't smuggle in an
 * elevation, on top of the id already being fixed server-side.
 */
export async function handleUserMe(req, res) {
  try {
    const claims = await validateToken(req);

    if (req.method === 'GET') {
      const profile = await getOwnProfile(claims.oid);
      if (!profile) return res.status(404).json({ error: 'User not found' });
      return res.status(200).json(profile);
    }

    if (req.method === 'PUT') {
      const parsed = UpdateOwnProfileSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      await updateOwnProfile(claims.oid, parsed.data);

      await writeAuditLog({
        entityType: 'User',
        entityId: claims.oid,
        action: 'ProfileUpdated',
        performedById: claims.oid,
        changeDetail: parsed.data,
        ipAddress: clientIp(req),
      });

      const updated = await getOwnProfile(claims.oid);
      return res.status(200).json(updated);
    }

    res.setHeader('Allow', 'GET, PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('users/me error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET + PUT /api/users/:id */
export async function handleUserById(req, res, id) {
  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid user ID format' });

    if (req.method === 'GET') {
      const user = await getUserForAdmin(id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.status(200).json(user);
    }

    if (req.method === 'PUT') {
      const parsed = UpdateUserSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const existing = await getUserForAdmin(id);
      if (!existing) return res.status(404).json({ error: 'User not found' });

      await updateUserFull(id, parsed.data);

      await writeAuditLog({
        entityType: 'User',
        entityId: id,
        action: parsed.data.isActive === false ? 'UserDeactivated'
              : parsed.data.isActive === true  ? 'UserReactivated'
              : 'UserUpdated',
        performedById: claims.oid,
        changeDetail: parsed.data,
        ipAddress: clientIp(req),
      });

      const updated = await getUserForAdmin(id);
      return res.status(200).json(updated);
    }

    res.setHeader('Allow', 'GET, PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('users/[id] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PUT /api/users/:id/unlock — clears a lockout from too many failed
 * login attempts. Admin/GlobalAdmin, same role gate as everything else
 * in User Admin — this is a routine account-administration action, not
 * a system-configuration one, so it doesn't belong behind a tighter
 * gate than the rest of this router. unlockUser() itself has existed
 * since the password policy work (§72); this endpoint — the thing that
 * actually calls it — did not, which is the real bug being fixed here,
 * not a deliberate GlobalAdmin-only restriction.
 */
export async function handleUserUnlock(req, res, id) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid user ID format' });

    const existing = await getUserForAdmin(id);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    await unlockUser(id);

    await writeAuditLog({
      entityType: 'User', entityId: id, action: 'UserUnlocked',
      performedById: claims.oid, ipAddress: clientIp(req),
    });

    const updated = await getUserForAdmin(id);
    return res.status(200).json(updated);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('users/[id]/unlock error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PUT /api/users/:id/force-logout — §97. Invalidates every currently-
 * issued token for this user without deactivating or locking the
 * account — for "I think this person's session may be compromised" or
 * "they're on a shared computer and forgot to sign out", as distinct
 * from "this person shouldn't have access at all" (that's Deactivate).
 * Admin/GlobalAdmin, same role gate as everything else in User Admin.
 */
export async function handleUserForceLogout(req, res, id) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid user ID format' });

    const existing = await getUserForAdmin(id);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    await revokeUserSessions(id);

    await writeAuditLog({
      entityType: 'User', entityId: id, action: 'UserSessionsRevoked',
      performedById: claims.oid, ipAddress: clientIp(req),
    });

    return res.status(200).json({ id, revoked: true });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('users/[id]/force-logout error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
