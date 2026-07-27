/**
 * api-lib/handlers/portalHandlers.js — NEW, 24 Jul 2026.
 * Route handlers for the self-service Lead Portal.
 */
import { validatePortalToken, portalAuthErrorResponse } from '../middleware/portalAuth.js';
import { hashPassword, verifyPassword, signJwt } from '../services/authService.js';
import { config } from '../config.js';
import {
  getEventForRegistration, isRegistrationWindowOpen,
  getPortalAccountByEmail, recordPortalLoginSuccess, recordPortalLoginFailure,
  registerProspectForEvent, getPortalProfile, updatePortalProfile, checkinProspect,
} from '../services/leadPortalService.js';
import { writeAuditLog, clientIp } from '../services/auditService.js';
import {
  PortalRegisterSchema, PortalLoginSchema, PortalUpdateMeSchema, PortalCheckinSchema,
} from '../models/leadPortal.js';

function issuePortalToken(account) {
  return signJwt(
    { oid: account.portalAccountId, portalAccountId: account.portalAccountId, leadId: account.leadId, type: 'portal' },
    config.portalAuth.jwtSigningSecret
  );
}

/** GET /api/portal/events/:qrToken — public, unauthenticated */
export async function handlePortalEventLookup(req, res, qrToken) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const event = await getEventForRegistration(qrToken);
    if (!event) return res.status(404).json({ error: 'This registration link is not valid.' });
    if (event.status !== 'Active') {
      return res.status(400).json({ error: 'This event is not currently accepting registrations.' });
    }
    const windowOpen = await isRegistrationWindowOpen(event);
    if (!windowOpen) {
      return res.status(400).json({ error: 'This registration link has expired.' });
    }
    return res.status(200).json({
      event: { id: event.id, name: event.name, eventDate: event.eventDate, university: event.university, venue: event.venue },
    });
  } catch (err) {
    console.error('portal/events/[qrToken] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** POST /api/portal/register — public, unauthenticated */
export async function handlePortalRegister(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    if (!config.portalAuth.jwtSigningSecret) {
      return res.status(500).json({ error: 'PORTAL_JWT_SIGNING_SECRET is not configured on the server' });
    }

    const parsed = PortalRegisterSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { qrToken, password, ...profileData } = parsed.data;

    const event = await getEventForRegistration(qrToken);
    if (!event) return res.status(404).json({ error: 'This registration link is not valid.' });
    if (event.status !== 'Active') {
      return res.status(400).json({ error: 'This event is not currently accepting registrations.' });
    }
    const windowOpen = await isRegistrationWindowOpen(event);
    if (!windowOpen) {
      return res.status(400).json({ error: 'This registration link has expired.' });
    }

    const passwordHash = await hashPassword(password);
    const result = await registerProspectForEvent(event.id, profileData, passwordHash);

    await writeAuditLog({
      entityType: 'Lead',
      entityId: result.leadId,
      action: 'PortalRegistration',
      performedById: result.leadId, // no staff actor — self-service; documented below
      changeDetail: { actor: 'portal-self-service', eventId: event.id, createdNewLead: result.createdNewLead },
      ipAddress: clientIp(req),
    });

    const token = issuePortalToken(result);
    return res.status(201).json({ token });

  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('portal/register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** POST /api/portal/login — public, unauthenticated */
export async function handlePortalLogin(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    if (!config.portalAuth.jwtSigningSecret) {
      return res.status(500).json({ error: 'PORTAL_JWT_SIGNING_SECRET is not configured on the server' });
    }

    const parsed = PortalLoginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { email, password } = parsed.data;

    const account = await getPortalAccountByEmail(email);
    const INVALID = { error: 'Invalid email or password' };
    if (!account) return res.status(401).json(INVALID);
    if (account.isLocked) return res.status(423).json({ error: 'This account is locked. Please contact your broker for help.' });

    const passwordOk = await verifyPassword(password, account.passwordHash);
    if (!passwordOk) {
      const { isLocked } = await recordPortalLoginFailure(account.id);
      if (isLocked) {
        return res.status(423).json({ error: 'Too many failed attempts. This account is now locked — please contact your broker for help.' });
      }
      return res.status(401).json(INVALID);
    }

    await recordPortalLoginSuccess(account.id);

    const token = issuePortalToken({ portalAccountId: account.id, leadId: account.leadId });
    return res.status(200).json({ token });

  } catch (err) {
    console.error('portal/login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET/PUT /api/portal/me */
export async function handlePortalMe(req, res) {
  try {
    const claims = await validatePortalToken(req);

    if (req.method === 'GET') {
      const profile = await getPortalProfile(claims.leadId);
      if (!profile) return res.status(404).json({ error: 'Profile not found' });
      return res.status(200).json({ profile });
    }

    if (req.method === 'PUT') {
      const parsed = PortalUpdateMeSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const updated = await updatePortalProfile(claims.leadId, parsed.data);
      if (!updated) return res.status(400).json({ error: 'Nothing to update' });

      await writeAuditLog({
        entityType: 'Lead',
        entityId: claims.leadId,
        action: 'PortalProfileUpdated',
        performedById: claims.leadId,
        changeDetail: { actor: 'portal-self-service', fields: Object.keys(parsed.data) },
        ipAddress: clientIp(req),
      });

      const profile = await getPortalProfile(claims.leadId);
      return res.status(200).json({ profile });
    }

    res.setHeader('Allow', 'GET, PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = portalAuthErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('portal/me error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** POST /api/portal/checkin */
export async function handlePortalCheckin(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const claims = await validatePortalToken(req);

    const parsed = PortalCheckinSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = await checkinProspect(claims.leadId, parsed.data.qrToken);

    if (!result.ok) {
      const messages = {
        event_not_found:  'This event code is not valid.',
        event_not_active: 'This event is not currently open for check-in.',
        not_registered:   "You haven't registered for this event yet.",
      };
      return res.status(400).json({ error: messages[result.error] ?? 'Could not check you in.' });
    }

    if (!result.alreadyCheckedIn) {
      await writeAuditLog({
        entityType: 'EventAttendee',
        entityId: claims.leadId,
        action: 'PortalCheckedIn',
        performedById: claims.leadId,
        changeDetail: { actor: 'portal-self-service', eventName: result.eventName },
        ipAddress: clientIp(req),
      });
    }

    return res.status(200).json({ ok: true, alreadyCheckedIn: result.alreadyCheckedIn });

  } catch (err) {
    if (err.status) {
      const { status, body } = portalAuthErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('portal/checkin error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
