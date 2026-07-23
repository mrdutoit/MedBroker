/**
 * models/lead.js
 * Ported from api/src/models/lead.js with one substantive fix — see
 * VERCEL_NOTES.md "Lead source" for the evidence this is based on (not a guess):
 *
 *   - The Lead table has no `leadSource` column and never did (schema.sql
 *     §7 comment: source is four nullable FK/text columns, exactly one
 *     populated). leadService.js's original queries selected/inserted
 *     `leadSource` anyway — a query that would fail against the real schema.
 *   - LeadImport.jsx already sends `manualSourceName` on create (both the
 *     CSV and Manual Entry tabs), which IS a real column, but the original
 *     CreateLeadSchema never declared it — so it was silently stripped by
 *     Zod's default parsing and never reached the database.
 *   - LeadList.jsx reads/filters on `sourceLabel` (a display string) and
 *     sends `source` as its filter query param — leadService never computed
 *     or filtered on either.
 *
 * Fix applied here: declare `manualSourceName` (stored) and `source` (list
 * filter, matched against the computed sourceLabel — see leadService.js).
 * `leadSource` is kept as an optional input for the caller's own bookkeeping
 * but is not written to a column that doesn't exist.
 *
 * 22 July 2026 — title, dateOfBirth, and a fixed Job Title (occupation)
 * list added to match the fields on the client's real Appointment
 * Tracking intake sheet (Mark's request). Since these — along with
 * Contact Number, already a field — represent the client's actual required
 * intake fields, title/dateOfBirth/occupation/mobileNumber move from
 * optional to required here. Nothing else in this file changed.
 */

import { z } from 'zod';

const saMobile = z.string()
  .regex(/^(\+27|0)[6-8]\d{8}$/, 'Mobile number must be a valid South African number');

const saIdNumber = z.string()
  .regex(/^\d{13}$/, 'South African ID number must be exactly 13 digits')
  .optional();

export const Title = z.enum(['Dr', 'Mr', 'Mrs', 'Ms']);

// Matches the fixed list already used for the Job Title filter dropdown —
// see src/constants/leadOptions.js on the frontend, which is the single
// source of truth both sides are meant to stay in sync with.
export const JobTitle = z.enum([
  'Anaesthesiologist', 'Cardiologist', 'Dermatologist', 'General Practitioner',
  'Gynaecologist', 'Neurologist', 'Orthopaedic Surgeon', 'Paediatrician',
  'Psychiatrist', 'Radiologist',
]);

export const PipelineStatus = z.enum([
  'Unassigned',
  'Assigned',
  'InProgress',
  'AppointmentScheduled',
  'Closed',
]);

export const LeadSource = z.enum([
  'EventAttendance',
  'CSVImport',
  'ManualEntry',
  'Referral',
  'WebForm',
]);

export const CreateLeadSchema = z.object({
  title:                Title,
  firstName:            z.string().min(1, 'First name is required').max(100),
  lastName:             z.string().min(1, 'Last name is required').max(100),
  dateOfBirth:          z.string().date('Must be a valid date (YYYY-MM-DD)'),
  idNumber:             saIdNumber,
  email:                z.string().email('Must be a valid email address').max(255),
  mobileNumber:         saMobile,
  whatsappNumber:       saMobile.optional(),
  universityAttended:   z.string().max(200).optional(),
  yearOfAttendance:     z.number().int().min(1980).max(new Date().getFullYear()).optional(),
  degreeAttained:       z.string().max(200).optional(),
  occupation:           JobTitle,
  hospitalOrPractice:   z.string().max(300).optional(),
  existingCover:        z.boolean().optional(),
  policies:             z.string().max(500).optional(),
  medicalAid:           z.boolean().optional(),
  medicalAidProvider:   z.string().max(200).optional(),
  // Portfolio name (e.g. 'Discovery', 'Money and Medicine') — resolved to
  // portfolioId server-side via resolvePortfolioId(), same pattern as
  // CreateAppointmentSchema's portfolio field. Optional: a Lead can exist
  // for a long time before anyone knows which portfolio it belongs to.
  // Added 23 Jul 2026, Mark's request — carries through to Book Appointment.
  portfolio:            z.string().optional(),
  leadSource:           LeadSource.default('ManualEntry'),
  linkedEventId:        z.string().uuid().optional(),
  linkedSubscriptionId: z.string().uuid().optional(),
  csvImportBatchId:     z.string().uuid().optional(),
  manualSourceName:     z.string().max(300).optional(),
});

export const UpdateLeadSchema = CreateLeadSchema.partial().omit({
  leadSource: true,
  linkedEventId: true,
});

export const AssignLeadSchema = z.object({
  agentId: z.string().uuid('agentId must be a valid UUID'),
});

export const CallAttemptSchema = z.object({
  outcome: z.enum([
    'NoAnswer',
    'Voicemail',
    'WrongNumber',
    'CallbackRequested',
    'ClientContacted',
    'NotInterested',
    'AppointmentScheduled',
  ]),
  notes:            z.string().max(2000).optional(),
  // { local: true } — HTML <input type="datetime-local"> (LeadDetail.jsx's
  // callback field) produces "YYYY-MM-DDTHH:mm", no timezone offset. The
  // default z.string().datetime() requires one and rejects that format;
  // confirmed by testing the actual value the input produces, not assumed.
  callbackDateTime: z.string().datetime({ local: true }).optional(),
});

export const LeadListQuerySchema = z.object({
  status:          PipelineStatus.optional(),
  excludeStatuses: z.string().max(200).optional(), // comma-separated, e.g. "AppointmentScheduled"
  agentId:         z.string().uuid().optional(),
  brokerId:        z.string().uuid().optional(),
  eventId:         z.string().uuid().optional(),
  source:          z.string().max(300).optional(),
  occupation:      z.string().max(200).optional(),
  search:          z.string().max(100).optional(),
  page:            z.coerce.number().int().min(1).default(1),
  pageSize:        z.coerce.number().int().min(1).max(100).default(25),
});
