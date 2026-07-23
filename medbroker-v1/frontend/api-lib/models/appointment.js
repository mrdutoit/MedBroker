/**
 * models/appointment.js — NEW.
 * Validation schemas for the Appointments API. Built by reading
 * AppointmentList.jsx, AppointmentDetail.jsx, and LeadDetail.jsx's Book
 * Appointment modal first — the appointmentsApi client in services/api.js
 * already had every method name defined (list/get/create/update/
 * assignBroker/reassign/returnToLeads/saveOutcome), matching the pattern
 * of every other domain wired so far.
 *
 * Scope: the ASSIGN model only (appointments.claimModel = 'assign', the
 * flag's current default). The CLAIM model — brokers self-serving from an
 * available-appointments pool, plus the token economy (TokenLedger,
 * TokenTransaction, Stripe payment) — is a separate, larger feature with
 * its own real external dependency (a payment provider) and stays fully
 * mocked in the frontend for now, same boundary reasoning as the SSO/OAuth
 * work: not something to half-build.
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
  portfolio:                z.string().min(1), // portfolio NAME, resolved server-side — matches Users API convention
  firstAppointmentDate:    z.string().date('Must be a valid date (YYYY-MM-DD)'),
  firstAppointmentTime:    z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Must be a valid time (HH:mm)'),
  firstAppointmentAddress: z.string().max(500).optional(),
  currentInsurer:          z.string().max(200).optional(),
  productsInterestedIn:    z.array(z.string()).optional(), // product NAMEs, stored as JSON text — see appointmentService.js
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
  leadId: z.string().uuid().optional(),
});
