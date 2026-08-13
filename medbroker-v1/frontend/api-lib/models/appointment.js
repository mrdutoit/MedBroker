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

const MeetingStatus = z.enum(['Seen', 'Rescheduled', 'Cancelled']);

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
  productsInterestedIn:    z.array(z.string()).optional(), // product NAMEs, stored as JSON text — see appointmentService.js
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

const MeetingInputSchema = z.object({
  number:   z.number().int().min(1).max(3),
  date:     z.string().date().optional().or(z.literal('')),
  status:   MeetingStatus.optional().or(z.literal('')),
  notes:    z.string().max(2000).optional(),
});

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
  meetings:       z.array(MeetingInputSchema).optional(),
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
  pageSize:   z.coerce.number().int().min(1).max(100).default(25),
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
