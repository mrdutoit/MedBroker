/**
 * models/lead.js
 * Ported from api/src/models/lead.js with one substantive fix — see
 * DEMO_NOTES.md "Lead source" for the evidence this is based on (not a guess):
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
 */

import { z } from 'zod';

const saIdNumber = z.string()
  .regex(/^\d{13}$/, 'South African ID number must be exactly 13 digits')
  .optional();

const saMobile = z.string()
  .regex(/^(\+27|0)[6-8]\d{8}$/, 'Mobile number must be a valid South African number')
  .optional();

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
  firstName:            z.string().min(1, 'First name is required').max(100),
  lastName:             z.string().min(1, 'Last name is required').max(100),
  idNumber:             saIdNumber,
  email:                z.string().email('Must be a valid email address').max(255),
  mobileNumber:         saMobile,
  whatsappNumber:       saMobile,
  universityAttended:   z.string().max(200).optional(),
  yearOfAttendance:     z.number().int().min(1980).max(new Date().getFullYear()).optional(),
  degreeAttained:       z.string().max(200).optional(),
  occupation:           z.string().max(200).optional(),
  hospitalOrPractice:   z.string().max(300).optional(),
  existingCover:        z.boolean().optional(),
  policies:             z.string().max(500).optional(),
  medicalAid:           z.boolean().optional(),
  medicalAidProvider:   z.string().max(200).optional(),
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
  callbackDateTime: z.string().datetime().optional(),
});

export const LeadListQuerySchema = z.object({
  status:    PipelineStatus.optional(),
  agentId:   z.string().uuid().optional(),
  brokerId:  z.string().uuid().optional(),
  eventId:   z.string().uuid().optional(),
  source:    z.string().max(300).optional(),
  search:    z.string().max(100).optional(),
  page:      z.coerce.number().int().min(1).default(1),
  pageSize:  z.coerce.number().int().min(1).max(100).default(25),
});
