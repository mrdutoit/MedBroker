/**
 * api-lib/handlers/leadHandlers.js
 * Consolidated 22 July 2026 — see authHandlers.js header for why. Logic
 * unchanged from the five original files (index.js, sources.js,
 * [id]/index.js, [id]/assign.js, [id]/calls.js).
 */

import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import { listLeads, createLead, listSources, listMedicalSubscriptions, createMedicalSubscription, getLeadById, updateLead, deleteLead, assignLead, reopenLead, logCallAttempt, listCallAttempts, findDuplicate } from '../services/leadService.js';
import { getDirectReportIds, isSupervisorOnly, isAgentOnly, getUserDisplayNameById } from '../services/userService.js';
import { writeAuditLog, clientIp, listAuditLogForLead } from '../services/auditService.js';
import { createNotification } from '../services/notificationService.js';
import { CreateLeadSchema, UpdateLeadSchema, LeadListQuerySchema, AssignLeadSchema, CallAttemptSchema, CheckDuplicatesSchema, CreateMedicalSubscriptionSchema } from '../models/lead.js';
import { isUuid } from '../http/helpers.js';

/** GET (list) + POST (create) /api/leads */
export async function handleLeadsCollection(req, res) {
  try {
    const claims = await validateToken(req);

    if (req.method === 'GET') {
      requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin']);

      const parsed = LeadListQuerySchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      if (isAgentOnly(claims.roles)) {
        parsed.data.agentId = claims.oid;
      }
      if (isSupervisorOnly(claims.roles)) {
        parsed.data.supervisorAgentIds = await getDirectReportIds(claims.oid);
      }

      const result = await listLeads(parsed.data);
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      requireRole(claims, ['Admin', 'Supervisor', 'GlobalAdmin']);

      const parsed = CreateLeadSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      // §63 — nothing checked this on this path before. Portal/Events
      // both call findDuplicate() themselves before their own createLead()
      // calls (leadPortalService.js, eventService.js); this public
      // endpoint — LeadImport.jsx's only route in, for both the CSV/
      // Excel/JSON bulk loop and Manual Entry — never did, meaning a
      // duplicate row really did create a true duplicate Lead. 409, not a
      // generic 400 — the frontend needs to tell "this was skipped as a
      // duplicate" apart from "this row failed validation" to report an
      // accurate ok/fail/skipped breakdown, not lump every non-success
      // into one fail count the way it silently did before.
      const existingLeadId = await findDuplicate(parsed.data.email, parsed.data.idNumber);
      if (existingLeadId) {
        return res.status(409).json({ error: 'duplicate', existingLeadId });
      }

      const newId = await createLead(parsed.data, claims.oid);

      await writeAuditLog({
        entityType: 'Lead',
        entityId: newId,
        action: 'LeadCreated',
        performedById: claims.oid,
        changeDetail: { leadSource: parsed.data.leadSource },
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
    console.error('leads/index error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/leads/check-duplicates — §63. One batched call so
 * LeadImport.jsx's preview step (before anything is actually created) can
 * show a real duplicate count instead of the Math.floor(rows.length *
 * 0.06) placeholder it used to. Same requireRole as POST /api/leads
 * itself — whoever can create leads is who needs to preview an import.
 * Internally still one findDuplicate() query per row — this collapses
 * the ROUND TRIPS to one, not the underlying DB work, which is the part
 * that actually matters for an upload-a-file-and-wait UX.
 */
export async function handleLeadCheckDuplicates(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'Supervisor', 'GlobalAdmin']);

    const parsed = CheckDuplicatesSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const results = [];
    for (let i = 0; i < parsed.data.rows.length; i++) {
      const row = parsed.data.rows[i];
      const existingLeadId = await findDuplicate(row.email, row.idNumber);
      results.push({ index: i, isDuplicate: !!existingLeadId, existingLeadId: existingLeadId ?? null });
    }

    return res.status(200).json({ results });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/check-duplicates error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/leads/sources */
export async function handleLeadSources(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin']);

    const sources = await listSources();
    return res.status(200).json({ sources });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/sources error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/leads/subscriptions — §80. Same role requirement as creating
 * a lead (Admin/Supervisor/GlobalAdmin). Returns every subscription
 * (active and inactive) with real stats — the import dropdown filters
 * to isActive client-side; App Admin's management table uses the full
 * response, including the stats columns that used to be hardcoded fake
 * data.
 * POST /api/leads/subscriptions — creates a new one. Admin/GlobalAdmin
 * only (tighter than the GET/import-role list — this is a management
 * action, Supervisors can import against an existing subscription but
 * shouldn't be creating new ones).
 */
export async function handleLeadMedicalSubscriptions(req, res) {
  try {
    const claims = await validateToken(req);

    if (req.method === 'GET') {
      requireRole(claims, ['Admin', 'Supervisor', 'GlobalAdmin']);
      const subscriptions = await listMedicalSubscriptions();
      return res.status(200).json({ subscriptions });
    }

    if (req.method === 'POST') {
      requireRole(claims, ['Admin', 'GlobalAdmin']);
      const parsed = CreateMedicalSubscriptionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const newId = await createMedicalSubscription(parsed.data);
      await writeAuditLog({
        entityType: 'MedicalSubscription', entityId: newId, action: 'MedicalSubscriptionCreated',
        performedById: claims.oid, changeDetail: JSON.stringify({ name: parsed.data.name }),
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
    console.error('leads/subscriptions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET + PUT + DELETE /api/leads/:id */
export async function handleLeadById(req, res, id) {
  try {
    const claims = await validateToken(req);

    if (!isUuid(id)) {
      return res.status(400).json({ error: 'Invalid lead ID format' });
    }

    if (req.method === 'GET') {
      requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin']);

      const lead = await getLeadById(id);
      if (!lead) return res.status(404).json({ error: 'Lead not found' });

      if (isAgentOnly(claims.roles) && lead.assignedAgentId !== claims.oid) {
        return res.status(403).json({ error: 'You are not assigned to this lead' });
      }
      if (isSupervisorOnly(claims.roles) && lead.assignedAgentId) {
        const directReports = await getDirectReportIds(claims.oid);
        if (!directReports.includes(lead.assignedAgentId)) {
          return res.status(403).json({ error: 'This lead is outside your team' });
        }
      }

      return res.status(200).json(lead);
    }

    // Editable by: the Agent this lead is assigned to, their Supervisor,
    // or Admin/GlobalAdmin — matches the read-permission boundary above,
    // not a separate rule. An unassigned lead has no agent to check against,
    // so only Supervisor/Admin/GlobalAdmin can edit it (an Agent can't own
    // fields on a lead that isn't theirs yet).
    if (req.method === 'PUT') {
      requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin']);

      const existing = await getLeadById(id);
      if (!existing) return res.status(404).json({ error: 'Lead not found' });

      if (isAgentOnly(claims.roles) && existing.assignedAgentId !== claims.oid) {
        return res.status(403).json({ error: 'You are not assigned to this lead' });
      }
      if (isSupervisorOnly(claims.roles)) {
        const directReports = await getDirectReportIds(claims.oid);
        if (!existing.assignedAgentId || !directReports.includes(existing.assignedAgentId)) {
          return res.status(403).json({ error: 'This lead is outside your team' });
        }
      }

      // Locked once Converted — added 23 Jul 2026, Mark's request. Stays
      // locked through ClosedWon permanently, and through ClosedLost until
      // an Admin/Supervisor explicitly reopens it (PUT /leads/:id/reopen).
      //
      // RELAXED 19 Aug 2026, Mark's explicit request — Supervisor and
      // Admin/GlobalAdmin can still edit through this endpoint while
      // converted; only Agent stays blocked. This lock was always meant
      // to stop an Agent re-working a lead that's already progressed
      // through the pipeline — it was never meant to make it impossible
      // for anyone to fix a typo in someone's date of birth or contact
      // number months into an active or won deal, which is what it
      // actually did, since UPDATE_LEAD_COLUMNS only ever contained
      // detail fields to begin with (dateOfBirth, contact info,
      // education, insurance, idNumber) — never pipelineStatus or
      // assignedAgentId, which stay governed by assign/reopen
      // regardless. Safe to relax at the role level rather than the
      // field level for exactly that reason: there was never a pipeline
      // field in this allow-list for a relaxed lock to accidentally
      // expose.
      if (existing.pipelineStatus === 'AppointmentScheduled' && isAgentOnly(claims.roles)) {
        return res.status(400).json({ error: 'This lead is converted and locked. Reopen it before editing.' });
      }

      // Added 21 Aug 2026, Mark's explicit request ("nobody should be
      // allowed to change [a Lead or Appointment] whilst in a closed
      // state") — deliberately no role exemption, unlike the
      // AppointmentScheduled check immediately above this one (which
      // only blocks Agent). Covers both ways a Lead reaches 'Closed':
      // a direct WrongNumber/NotInterested call outcome with no
      // appointment ever booked, or the cascade from an Appointment's
      // own ClosedWon/ClosedLost (appointmentService.js). Reopen it
      // via PUT /leads/:id/reopen (Supervisor/Admin/GlobalAdmin) —
      // reopenLead() was fixed in the same delivery as this check to
      // actually accept the 'Closed' state, not just the narrower
      // 'AppointmentScheduled' case it was originally built for.
      if (existing.pipelineStatus === 'Closed') {
        return res.status(400).json({ error: 'This lead is closed and locked. Reopen it before editing.' });
      }

      const parsed = UpdateLeadSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const changed = await updateLead(id, parsed.data);
      if (changed) {
        // Diff only the fields actually present on the request — old vs new —
        // rather than logging the raw payload, so the audit entry reads as
        // "what changed" and doesn't repeat unrelated fields untouched by
        // this save.
        //
        // dateOfBirth needs normalising before comparing: node-postgres
        // parses DATE columns into JS Date objects by default (no custom
        // type parser is registered in db.js), but the client always sends
        // a plain 'YYYY-MM-DD' string from the date input. A Date object
        // is never === a string, even for the same calendar date, so this
        // field showed up as "changed" on every single save regardless of
        // whether the user touched it — confirmed by Mark's screenshot,
        // which shows dateOfBirth in every audit entry. Doesn't affect the
        // actual saved value (updateLead() writes parsed.data.dateOfBirth
        // correctly either way) — purely a false entry in the diff shown
        // here.
        // dateOfBirth and portfolios both need normalising before
        // comparing, for two different reasons:
        //  - dateOfBirth: node-postgres parses DATE columns into JS Date
        //    objects (no custom type parser registered in db.js), but the
        //    client always sends a plain 'YYYY-MM-DD' string. A Date
        //    object is never === a string even for the same calendar
        //    date — confirmed by Mark's screenshot, which showed this
        //    field "changed" on every single save.
        //  - portfolios (array, added 23 Jul 2026, §41): arrays compare
        //    by reference with !==, never by content, so two arrays with
        //    identical elements are still never equal — the exact same
        //    false-positive shape as the dateOfBirth bug, caught this
        //    time before it shipped rather than after a screenshot.
        //    Order-independent comparison (sorted-join) since portfolios
        //    is a set, not a sequence — reordering the same selection
        //    shouldn't read as a change.
        const changeDetail = {};
        for (const field of Object.keys(parsed.data)) {
          if (field === 'dateOfBirth') {
            const existingValue = existing.dateOfBirth instanceof Date
              ? existing.dateOfBirth.toISOString().slice(0, 10)
              : existing.dateOfBirth;
            if (existingValue !== parsed.data.dateOfBirth) {
              changeDetail.dateOfBirth = { from: existingValue ?? null, to: parsed.data.dateOfBirth ?? null };
            }
            continue;
          }
          if (field === 'portfolios') {
            const existingSorted = [...(existing.portfolios ?? [])].sort().join(',');
            const incomingSorted = [...(parsed.data.portfolios ?? [])].sort().join(',');
            if (existingSorted !== incomingSorted) {
              changeDetail.portfolios = { from: existing.portfolios ?? [], to: parsed.data.portfolios ?? [] };
            }
            continue;
          }
          if (existing[field] !== parsed.data[field]) {
            changeDetail[field] = { from: existing[field] ?? null, to: parsed.data[field] ?? null };
          }
        }
        // GATED 19 Aug 2026 — this call had no guard at all before now:
        // it wrote a 'LeadUpdated' audit entry on every successful save,
        // even when changeDetail ended up completely empty. Harmless in
        // practice while the only caller was LeadDetail.jsx's own edit
        // form, where a user clicking "Save Changes" without touching
        // anything is a rare edge case. It stopped being rare the moment
        // AppointmentDetail.jsx's new "Edit Details" (19 Aug 2026) started
        // calling this same endpoint: that form always resends the FULL
        // current Lead-owned field set on every save, not just the
        // touched ones (same "resend everything, let the diff decide"
        // pattern this form's own handleSaveEdit already used) — so
        // saving an Appointment-only field like the meeting link, with no
        // Lead field actually touched, produced a real write with a
        // genuinely empty changeDetail every time. Root-caused from
        // Mark's screenshot: "Lead details updated" with no diff text is
        // exactly what describeEntry() (AuditLogList.jsx) falls back to
        // when changeDetail is an empty object — {} is truthy, so the
        // `if (!detail) return label` check at the top of that function
        // never caught it either. Matches the gate this session's new
        // handleAppointmentById PUT handler already has for the identical
        // reason — that one was built correctly from the start; this
        // pre-existing one was the actual gap.
        if (Object.keys(changeDetail).length > 0) {
          await writeAuditLog({
            entityType: 'Lead',
            entityId: id,
            action: 'LeadUpdated',
            performedById: claims.oid,
            changeDetail,
            ipAddress: clientIp(req),
          });
        }
      }

      const updated = await getLeadById(id);
      return res.status(200).json(updated);
    }

    if (req.method === 'DELETE') {
      requireRole(claims, ['Admin', 'GlobalAdmin']);

      const lead = await getLeadById(id);
      if (!lead) return res.status(404).json({ error: 'Lead not found' });

      await deleteLead(id);

      await writeAuditLog({
        entityType: 'Lead',
        entityId: id,
        action: 'LeadDeleted',
        performedById: claims.oid,
        ipAddress: clientIp(req),
      });

      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, PUT, DELETE, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/[id] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** PUT /api/leads/:id/assign */
export async function handleLeadAssign(req, res, id) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'Supervisor', 'GlobalAdmin']);

    if (!isUuid(id)) {
      return res.status(400).json({ error: 'Invalid lead ID format' });
    }

    const parsed = AssignLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const lead = await getLeadById(id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    if (isSupervisorOnly(claims.roles)) {
      const directReports = await getDirectReportIds(claims.oid);
      if (lead.assignedAgentId && !directReports.includes(lead.assignedAgentId)) {
        return res.status(403).json({ error: 'This lead is outside your team' });
      }
      if (!directReports.includes(parsed.data.agentId)) {
        return res.status(403).json({ error: 'Target agent is not one of your direct reports' });
      }
    }

    const previousAgentId = lead.assignedAgentId ?? null;

    try {
      await assignLead(id, parsed.data.agentId);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }

    await writeAuditLog({
      entityType: 'Lead',
      entityId: id,
      action: previousAgentId ? 'LeadReassigned' : 'LeadAssigned',
      performedById: claims.oid,
      changeDetail: {
        previousAgentId,
        previousAgentName: previousAgentId ? await getUserDisplayNameById(previousAgentId) : null,
        newAgentId: parsed.data.agentId,
        newAgentName: await getUserDisplayNameById(parsed.data.agentId),
      },
      ipAddress: clientIp(req),
    });

    // NOTIFICATION (§61) — needs the performer's name ("Admin User
    // assigned this lead to you"), which is only available here at the
    // handler layer (claims.oid), not inside assignLead() itself — unlike
    // AppointmentAssigned's notification, which needed no performer
    // identity and so lives in appointmentService.assignBroker() instead.
    // `lead` was already fetched above (getLeadById) for the supervisor-
    // scoping check — reused here rather than re-queried.
    const performedByName = await getUserDisplayNameById(claims.oid);
    const leadName = [lead.title, lead.firstName, lead.lastName].filter(Boolean).join(' ');
    const leadContext = [lead.occupation, lead.hospitalOrPractice].filter(Boolean).join(' · ');
    await createNotification({
      recipientId: parsed.data.agentId,
      type:        'LeadAssigned',
      title:       `New lead assigned — ${leadName}`,
      body:        `${performedByName} assigned this lead to you.${leadContext ? ` ${leadContext}.` : ''}`,
      entityType:  'Lead',
      entityId:    id,
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/[id]/assign error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PUT /api/leads/:id/reopen
 * Manual reopen after a Closed Lost appointment — Admin/Supervisor only
 * (Mark's explicit choice, 23 Jul 2026: a person decides to re-engage,
 * it doesn't happen automatically the moment an outcome is saved). An
 * Agent, even the lead's own assigned agent, cannot reopen it themselves —
 * matches the same elevated-action pattern as Reassign elsewhere in the app.
 */
export async function handleLeadReopen(req, res, id) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Supervisor', 'Admin', 'GlobalAdmin']);

    if (!isUuid(id)) {
      return res.status(400).json({ error: 'Invalid lead ID format' });
    }

    const existing = await getLeadById(id);
    if (!existing) return res.status(404).json({ error: 'Lead not found' });

    if (isSupervisorOnly(claims.roles)) {
      const directReports = await getDirectReportIds(claims.oid);
      if (!existing.assignedAgentId || !directReports.includes(existing.assignedAgentId)) {
        return res.status(403).json({ error: 'This lead is outside your team' });
      }
    }

    // reopenLead() re-validates pipelineStatus/appointmentStatus itself —
    // the checks above are ownership/role, not the state machine's own
    // preconditions, which live in the service layer.
    await reopenLead(id);

    await writeAuditLog({
      entityType: 'Lead',
      entityId: id,
      action: 'LeadReopened',
      performedById: claims.oid,
      // Was hardcoded to { from: 'AppointmentScheduled', to: 'InProgress' }
      // — wrong as of this same delivery, since reopenLead() now also
      // accepts a Lead whose status is 'Closed' (see that function's own
      // comment). Using the actual pre-reopen status already fetched
      // above (existing), not re-deriving or guessing it.
      changeDetail: { from: existing.pipelineStatus, to: 'InProgress' },
      ipAddress: clientIp(req),
    });

    const updated = await getLeadById(id);
    return res.status(200).json(updated);

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/[id]/reopen error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/leads/:id/audit */
export async function handleLeadAudit(req, res, id) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin']);

    if (!isUuid(id)) {
      return res.status(400).json({ error: 'Invalid lead ID format' });
    }

    const lead = await getLeadById(id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    if (isAgentOnly(claims.roles) && lead.assignedAgentId !== claims.oid) {
      return res.status(403).json({ error: 'You are not assigned to this lead' });
    }
    if (isSupervisorOnly(claims.roles) && lead.assignedAgentId) {
      const directReports = await getDirectReportIds(claims.oid);
      if (!directReports.includes(lead.assignedAgentId)) {
        return res.status(403).json({ error: 'This lead is outside your team' });
      }
    }

    // §131 (5 Aug 2026) — CORRECTED: listAuditLog('Lead', id) only ever
    // saw direct Lead-scoped rows. SAR actions used to also write a
    // Lead-scoped twin specifically so they'd show up here too — that
    // dual-write is gone (real duplication in a compliance table, see
    // auditService.listAuditLogForLead()'s own header). This function's
    // UNION is what keeps SAR actions visible in a Lead's own Change Log
    // without it — access control for THIS lead was already checked
    // above (agent/supervisor scoping), so this swap doesn't change who
    // can see anything, only what's included once they're allowed to look.
    const entries = await listAuditLogForLead(id);
    return res.status(200).json({ entries });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/[id]/audit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET + POST /api/leads/:id/calls */
export async function handleLeadCalls(req, res, id) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Agent', 'Supervisor', 'Admin', 'GlobalAdmin']);

    if (!isUuid(id)) {
      return res.status(400).json({ error: 'Invalid lead ID format' });
    }

    const lead = await getLeadById(id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    if (isAgentOnly(claims.roles) && lead.assignedAgentId !== claims.oid) {
      return res.status(403).json({ error: 'You are not assigned to this lead' });
    }
    if (isSupervisorOnly(claims.roles) && lead.assignedAgentId) {
      const directReports = await getDirectReportIds(claims.oid);
      if (!directReports.includes(lead.assignedAgentId)) {
        return res.status(403).json({ error: 'This lead is outside your team' });
      }
    }

    if (req.method === 'GET') {
      const calls = await listCallAttempts(id);
      return res.status(200).json({ calls });
    }

    const parsed = CallAttemptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { flaggedUncontactable, newPipelineStatus } = await logCallAttempt(id, claims.oid, parsed.data);
    return res.status(201).json({ success: true, flaggedUncontactable, newPipelineStatus });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/[id]/calls error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
