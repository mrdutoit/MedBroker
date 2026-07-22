/**
 * api/users/index.js — NEW.
 *   GET  /api/users — Admin, Supervisor, GlobalAdmin (Supervisor needs the
 *                      list to populate the create/edit form's supervisor
 *                      dropdown and to see their own team — not scoped
 *                      further here since User Admin itself is Admin+ only
 *                      on the frontend nav; Supervisor access is for the
 *                      dropdown data, not full CRUD)
 *   POST /api/users — Admin, GlobalAdmin
 */

import { validateToken, requireRole, authErrorResponse } from '../../src/middleware/auth.js';
import { listUsers, createUserFull, listSupervisors } from '../../src/services/userService.js';
import { writeAuditLog, clientIp } from '../../src/services/auditService.js';
import { CreateUserSchema, UserListQuerySchema } from '../../src/models/user.js';
import { applyCors } from '../../src/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  try {
    const claims = await validateToken(req);

    if (req.method === 'GET') {
      requireRole(claims, ['Admin', 'Supervisor', 'GlobalAdmin']);

      const parsed = UserListQuerySchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      // ?supervisors=true returns the lightweight dropdown list instead of
      // the full table — same endpoint, avoids a second route for one query.
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
        // Postgres unique_violation on User.email
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
