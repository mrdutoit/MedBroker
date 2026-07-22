/**
 * api/users/[id]/index.js — NEW.
 *   GET /api/users/:id — Admin, GlobalAdmin (edit modal pre-fill)
 *   PUT /api/users/:id — Admin, GlobalAdmin (save changes, including
 *                         deactivate via { isActive: false })
 */

import { validateToken, requireRole, authErrorResponse } from '../../../api-lib/middleware/auth.js';
import { getUserForAdmin, updateUserFull } from '../../../api-lib/services/userService.js';
import { writeAuditLog, clientIp } from '../../../api-lib/services/auditService.js';
import { UpdateUserSchema } from '../../../api-lib/models/user.js';
import { isUuid, applyCors } from '../../../api-lib/http/helpers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    const { id } = req.query;
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
