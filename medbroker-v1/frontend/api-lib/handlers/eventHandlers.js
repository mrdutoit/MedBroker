/**
 * api-lib/handlers/eventHandlers.js — NEW, 24 Jul 2026.
 * GET routes open to all five roles (Events nav item has no role gate in
 * App.jsx today, only the events.enabled flag) — mirrors the frontend's
 * existing visibility exactly, rather than introducing a new restriction
 * with this build. Create/status-change restricted to Admin/Supervisor/
 * GlobalAdmin, same gating as Lead creation.
 */
import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import {
  listEvents, getEventById, createEvent, updateEventStatus,
  listEventAttendees, getEventReport,
} from '../services/eventService.js';
import { writeAuditLog, clientIp } from '../services/auditService.js';
import { CreateEventSchema, UpdateEventStatusSchema } from '../models/event.js';
import { isUuid } from '../http/helpers.js';

const VIEW_ROLES   = ['Agent', 'Broker', 'Supervisor', 'Admin', 'GlobalAdmin'];
const MANAGE_ROLES = ['Admin', 'Supervisor', 'GlobalAdmin'];

/** GET (list) + POST (create) /api/events */
export async function handleEventsCollection(req, res) {
  try {
    const claims = await validateToken(req);

    if (req.method === 'GET') {
      requireRole(claims, VIEW_ROLES);
      const events = await listEvents();
      return res.status(200).json({ events });
    }

    if (req.method === 'POST') {
      requireRole(claims, MANAGE_ROLES);

      const parsed = CreateEventSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const newId = await createEvent(parsed.data, claims.oid);

      await writeAuditLog({
        entityType: 'Event',
        entityId: newId,
        action: 'EventCreated',
        performedById: claims.oid,
        changeDetail: { name: parsed.data.name, eventDate: parsed.data.eventDate },
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
    console.error('events/index error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/events/:id */
export async function handleEventDetail(req, res, id) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const claims = await validateToken(req);
    requireRole(claims, VIEW_ROLES);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid event ID format' });

    const event = await getEventById(id);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const attendees = await listEventAttendees(id);
    return res.status(200).json({ event, attendees });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('events/[id] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** PUT /api/events/:id/status */
export async function handleEventStatus(req, res, id) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const claims = await validateToken(req);
    requireRole(claims, MANAGE_ROLES);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid event ID format' });

    const parsed = UpdateEventStatusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = await updateEventStatus(id, parsed.data.status);
    if (!result.ok && result.error === 'not_found') {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (!result.ok) {
      return res.status(400).json({
        error: `Cannot move an event from ${result.from} to ${result.to}. Allowed: ${result.allowed.join(', ') || 'none — terminal status'}`,
      });
    }

    await writeAuditLog({
      entityType: 'Event',
      entityId: id,
      action: 'EventStatusChanged',
      performedById: claims.oid,
      changeDetail: { from: result.fromStatus, to: parsed.data.status },
      ipAddress: clientIp(req),
    });

    return res.status(200).json(result.event);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('events/[id]/status error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/events/:id/report */
export async function handleEventReport(req, res, id) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const claims = await validateToken(req);
    requireRole(claims, VIEW_ROLES);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid event ID format' });

    const report = await getEventReport(id);
    if (!report) return res.status(404).json({ error: 'Event not found' });

    return res.status(200).json(report);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('events/[id]/report error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
