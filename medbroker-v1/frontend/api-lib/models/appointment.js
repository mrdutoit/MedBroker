/**
 * models/appointment.js — NEW.
 * Validation schemas for the Appointments API. Built by reading
 * AppointmentList.jsx, AppointmentDetail.jsx, and LeadDetail.jsx's Book
 * Appointment modal first — the appointmentsApi client in services/api.js
 * already had every method name defined (list/get/create/update/
 * assignBroker/reassign/returnToLeads/saveOutcome), matching the pattern
 * of every other domain wired so far.
 *
 * UPDATED §117 (4 Aug 2026) — the CLAIM model (appointments.claimModel =
 * 'claim') is now real: brokers self-serve from an available-appointments
 * pool, and claiming debits TokenLedger (see tokenService.js). Stripe
 * payment (appointments.tokens.paymentProvider = 'stripe') is still a
 * separate, deliberately deferred piece — see Status_Vercel.md §117 for
 * the full staging reasoning. 'none' provider (the only one this entry
 * builds) means manual top-up by an Admin/GlobalAdmin only.
 */

import { z } from 'zod';

export const AppointmentStatus = z.enum([
  'Unassigned', 'Assigned', 'InProgress', 'ClosedWon', 'ClosedLost', 'Claimed',
]);

// MeetingStatus removed 14 Aug 2026 (§164) — was only used by the
// now-removed MeetingInputSchema. The new model's four statuses
// (Scheduled/HeldInterested/HeldNotInterested/Rescheduled) are validated
// directly in SaveMeetingAttemptSchema instead, not via a shared enum —
// 'Scheduled' is never a value this schema accepts (it's the row's own
// creation default, not something a client saves it AS).

/**
 * Booking a new appointment from Lead Detail. agentId is deliberately NOT
 * accepted here — the Agent on an Appointment is always the Lead's own
 * assignedAgentId, resolved server-side in appointmentService.createAppointment()
 * from the Lead record, never client-supplied. This was changed 23 Jul 2026
 * (Mark's request): previously it was the authenticated booking user's own
 * JWT claim, which meant a Supervisor or Admin booking on an agent's behalf
 * bumped the appointment onto their own name instead of the agent who
 * actually owns the lead. The "Agent field is always read-only" rule in
 * both frontend files still holds — only *who it's read from* changed.
 */
export const CreateAppointmentSchema = z.object({
  leadId:                  z.string().uuid(),
  brokerId:                z.string().uuid().optional(), // omitted -> status stays Unassigned
  // Changed 23 Jul 2026 from a single portfolio name to an array (Mark's
  // request, §45) — an appointment can now cover more than one portfolio.
  // Always at least one — unlike Lead's portfolios (optional, a lead can
  // exist with none known yet), booking an appointment always means at
  // least one portfolio was actually discussed.
  portfolios:              z.array(z.string()).min(1, 'Select at least one portfolio'),
  firstAppointmentDate:    z.string().date('Must be a valid date (YYYY-MM-DD)'),
  firstAppointmentTime:    z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Must be a valid time (HH:mm)'),
  // §140d, 12 Aug 2026 — meetingType added at Mark's request specifically
  // to drive which of the next two fields is actually required, not just
  // as an informational label. No default: the agent must make an
  // explicit choice, since it changes what's mandatory below it.
  meetingType:             z.enum(['InPerson', 'Virtual']),
  firstAppointmentAddress: z.string().max(500).optional(),
  virtualMeetingLink:      z.string().max(500).optional(),
  currentInsurer:          z.string().max(200).optional(),
  // Changed 13 Aug 2026 (§143, item 6, Mark's decision) — was optional.
  // Products is the field that actually drives broker/claim-pool
  // eligibility (region+product match — see brokerMatchingService.js's
  // findMatchingBrokers and appointmentService.js's listAvailableToClaim),
  // in BOTH claim and assign mode, yet was never required at the one
  // point it's captured. The Assign flow's own broker-search function
  // separately required it already (throws if called with zero
  // products), but that was a search-time check, not a booking-time
  // one, and never applied to claim-model bookings at all — confirmed
  // via testing that a claim-model appointment could be confirmed with
  // zero products selected. Now required in both modes, matching
  // portfolios' existing `.min(1)` treatment just above.
  productsInterestedIn:    z.array(z.string()).min(1, 'Select at least one product'), // product NAMEs, stored as JSON text — see appointmentService.js
  // claimTokenCost REMOVED §140c, 12 Aug 2026 — was optional/caller-supplied
  // (the original §117 comment here said a Supervisor/Admin could set it
  // manually) but no frontend ever actually did, so every appointment was
  // silently created with cost 0 regardless of claim model. Mark's
  // explicit choice going forward: a single flat org-wide cost, not
  // caller-supplied — appointmentService.createAppointment() now derives
  // it itself from SystemConfig.defaultClaimTokenCost whenever claim
  // model is active, and this field is no longer part of the request
  // shape at all.
})
  // §140d — Address wasn't mandatory at all before this (a real gap Mark
  // caught while testing); now required specifically for InPerson, and a
  // meeting link required specifically for Virtual, rather than both
  // being unconditionally required (a Virtual meeting has no address to
  // give, an InPerson one has no link).
  .superRefine((data, ctx) => {
    if (data.meetingType === 'InPerson' && !data.firstAppointmentAddress?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['firstAppointmentAddress'],
        message: 'Address is required for an in-person meeting',
      });
    }
    if (data.meetingType === 'Virtual' && !data.virtualMeetingLink?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['virtualMeetingLink'],
        message: 'A meeting link is required for a virtual meeting',
      });
    }
  });

/**
 * Reassigning broker and/or agent on an existing appointment. Despite the
 * name, agentId here is Admin/Supervisor CORRECTING a mis-booking, not the
 * booking agent's own action — still gated Admin/Supervisor-only at the
 * route layer, matching AppointmentList.jsx's canManage check.
 */
export const ReassignAppointmentSchema = z.object({
  brokerId: z.string().uuid().optional().nullable(),
  agentId:  z.string().uuid().optional(),
});

export const AssignBrokerSchema = z.object({
  brokerId: z.string().uuid(),
  agentId:  z.string().uuid().optional(), // present in the API contract but agentId is not changed by this action — see appointmentService.js
});

// MeetingInputSchema removed 14 Aug 2026 (§164) — the old flat
// meeting{1,2,3}Date/Status/Feedback save shape, replaced entirely by
// SaveMeetingAttemptSchema (below the outcome schema in this file).

/**
 * Saving the appointment outcome. The resulting status (ClosedWon/
 * ClosedLost/InProgress) is computed server-side by
 * appointmentStatusService.js — never accepted directly from the client,
 * matching the header comment in AppointmentDetail.jsx.
 */
// Added 23 Jul 2026 (Mark's request, §44) — productsSold now carries an
// optional Rand value per product, not just the product name. value is
// nullable/optional deliberately: a broker recording the outcome without
// the exact figure yet shouldn't be blocked from saving.
const ProductSoldInputSchema = z.object({
  product: z.string(),
  value:   z.number().nonnegative().optional().nullable(),
});

export const SaveOutcomeSchema = z.object({
  customerSigned: z.boolean().optional().nullable(),
  productsSold:   z.array(ProductSoldInputSchema).optional(),
  // meetings REMOVED 14 Aug 2026 (§138 spec, §164 build) — meeting saves
  // now go through their own dedicated endpoint (SaveMeetingAttemptSchema
  // below), not bundled into the outcome save. This endpoint now only
  // ever decides ClosedWon/ClosedLost.
  // 14 Aug 2026 (§163, migration 030) — mirrors the CHECK constraint on
  // Appointment.lostReason exactly. Optional at the schema level (the
  // outcome endpoint is reused for every save, including ones that never
  // touch customerSigned at all) — not required-when-false at the Zod
  // layer, since the frontend is what actually enforces "pick a reason
  // before you can mark this Lost", matching how meetings/customerSigned
  // are handled the same way elsewhere in this same schema.
  lostReason: z.enum(['PriceTooHigh', 'ChoseCompetitor', 'NoLongerInterested', 'Uncontactable', 'NotEligible', 'Other']).optional().nullable(),
});

// 14 Aug 2026 (§138 spec, session 20; §164 build, session 23) — the
// Meeting/Appointment attempt-history redesign. Saves the OUTCOME of one
// attempt row that's currently sitting at status 'Scheduled' — this is
// the endpoint that replaces the old flat meeting{N}Date/Status/Feedback
// columns and the "Mark Meeting Held" button both. status here is never
// 'Scheduled' — that's the row's own creation default, not something
// this endpoint sets; saving through here IS the transition away from
// it, to one of the three real outcomes.
//
// followUpRequired is asked ONLY when status = 'HeldInterested' AND this
// isn't the last configured meeting number (2 or 3, depending on
// appointments.thirdMeeting.enabled) — the service layer itself decides
// whether it's actually relevant server-side (never trusts a client-sent
// value for the "is this the last meeting" case, same "authoritative
// server-side" principle as computeAppointmentStatus() already
// following elsewhere in this file) — kept optional here rather than
// conditionally required by Zod, since that condition depends on data
// (the flag value, the meeting number) Zod's own schema shape can't see.
//
// status made OPTIONAL 16 Aug 2026 — real gap Mark found: there was no
// way to save just the DATE of a follow-up meeting (the new 'Scheduled'
// row created by Cancelled/Missed/Rescheduled routing, or a fresh
// meeting 2/3 row) without simultaneously being forced to record that
// meeting's OUTCOME in the same breath, before it had even happened yet.
// Omitting status now means "save the date only, leave this row at
// 'Scheduled'" — a genuinely different, lighter action from recording an
// outcome, handled as its own early branch in saveMeetingAttemptOutcome()
// (appointmentService.js) rather than going through the four-branch
// routing table at all. The .refine() below is the only thing actually
// enforcing "you need to send SOMETHING" — Zod's own per-field optionality
// can't express "date required only when status is absent" on its own.
export const SaveMeetingAttemptSchema = z.object({
  date:             z.string().optional().nullable(),
  // 15 Aug 2026 (§172) — Cancelled/Missed added, reversing part of the
  // 14 Aug decision to collapse them into Rescheduled. Mechanically the
  // three route identically (saveMeetingAttemptOutcome, appointmentService.js
  // — new row, same meeting number, no outcome form); only the recorded
  // status differs, which is exactly the point.
  status:           z.enum(['HeldInterested', 'HeldNotInterested', 'Rescheduled', 'Cancelled', 'Missed']).optional(),
  notes:            z.string().max(2000).optional().nullable(),
  followUpRequired: z.boolean().optional().nullable(),
  // 15 Aug 2026 (§172, migration 034) — only meaningful when status =
  // 'Cancelled'. Missed has nothing to categorise (no communication
  // happened by definition), so `notes` stays the only place to record
  // context for a no-show. Optional at the schema level, same pattern
  // as Appointment.lostReason (§163) — the frontend is what actually
  // enforces "pick a reason before you can save this as Cancelled".
  cancelReason:     z.enum(['NoLongerInterested', 'FoundAlternative', 'SchedulingConflict', 'Uncontactable', 'Other']).optional().nullable(),
}).refine(data => !!data.status || !!data.date, {
  message: 'Either a status (to record an outcome) or a date (to save the scheduled date) is required.',
  path: ['date'],
});

export const AppointmentListQuerySchema = z.object({
  status:     AppointmentStatus.optional(),
  brokerId:   z.string().uuid().optional(),
  agentId:    z.string().uuid().optional(),
  leadId:     z.string().uuid().optional(),
  portfolio:  z.string().optional(),
  source:     z.string().max(300).optional(),
  search:     z.string().max(100).optional(),
  page:       z.coerce.number().int().min(1).default(1),
  // 16 Aug 2026 — REAL BUG Mark found (indirectly — the sort/filter work
  // he'd actually asked for turned this up first): cap was 100, default
  // 25, and AppointmentList.jsx calls appointmentsApi.list({}) with NO
  // pageSize at all — so the frontend was silently working with only the
  // first 25 appointments org-wide (ORDER BY firstAppointmentDate ASC),
  // with no pagination UI to reach anything past that. Every filter,
  // sort, and KPI count on that page operates on sourceData/
  // realAppointments as if it already held everything — that assumption
  // was simply wrong past 25 rows. Raised to 2000: high enough that a
  // single brokerage won't realistically hit it for years, low enough to
  // still bound a worst-case query. Not real pagination — AppointmentList
  // was built end-to-end on "fetch it all, work client-side" (unlike
  // LeadList.jsx, which genuinely paginates), and rebuilding that
  // architecture wasn't warranted just to fix a default that was set too
  // low. If appointment volume ever approaches this cap, that's the
  // signal to revisit — worth flagging then, not solving preemptively now.
  pageSize:   z.coerce.number().int().min(1).max(2000).default(25),
});

export const BrokerMatchingQuerySchema = z.object({
  region: z.string().min(1),
  // GET /api/broker-matching?products=A,B sends a single comma-joined string
  // (URLSearchParams coerces the client's array to one string; the "GET
  // ...?products=A,B" contract in api/broker-matching/index.js's header
  // comment was always the intended wire format). The previous version only
  // handled the array case and wrapped a lone multi-product string as a
  // single-element array — e.g. products=['A,B'] instead of ['A','B'] — so
  // the SQL `p.name IN (@prod0)` never matched a real product name once more
  // than one product was selected. Splits on comma for the string case;
  // array input (e.g. a direct API call passing repeated params) still works.
  products: z.union([z.string(), z.array(z.string())]).transform((v) =>
    (Array.isArray(v) ? v : v.split(',')).map((p) => p.trim()).filter(Boolean)
  ),
  // Required, not optional — Mark's request, 24 Jul 2026: checking broker
  // "availability" without knowing when is meaningless, and the results
  // now actively exclude a broker already booked at this exact slot
  // (findMatchingBrokers), so the search itself depends on having both.
  date: z.string().date('Must be a valid date (YYYY-MM-DD)'),
  time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Must be a valid time (HH:mm)'),
  leadId: z.string().uuid().optional(),
});

// ── Token economy (§117, 4 Aug 2026) ────────────────────────────────────────

/**
 * PUT /api/appointments/tokens/:brokerId/topup — Admin/GlobalAdmin only.
 * 'none' payment provider's whole mechanism (per the flag's own
 * description: "manual top-up by admin only"). No Stripe involved — this
 * is the entire 'none' path, not a stopgap for it.
 */
export const TokenTopUpSchema = z.object({
  amount: z.number().int().min(1).max(1000),
});
