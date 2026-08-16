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

// Changed 13 Aug 2026 (§142, item 4, Mark's explicit request) — was
// `/^(\+27|0)[6-8]\d{8}$/`, accepting only an unformatted SA mobile
// number in exactly that one shape: no spaces, dashes, brackets, or
// any other format tolerated at all. Replaced with a character-set
// check (digits, +, -, (, ), spaces only) plus a minimum of 7 actual
// digits — deliberately drops SA-mobile-format enforcement entirely,
// Mark's own trade-off: a landline or non-SA number now passes where
// the old regex correctly rejected it, in exchange for not rejecting
// real numbers typed with normal formatting. Shared via import across
// lead.js/event.js/leadPortal.js — one change covers Lead creation,
// Events, and the public Lead Portal together.
export const saMobile = z.string()
  .regex(/^[0-9+\-() ]+$/, 'Mobile number can only contain digits, spaces, and + - ( )')
  .refine((val) => (val.match(/\d/g) ?? []).length >= 7, 'Mobile number must contain at least 7 digits');

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

// §142, item 2 revision (13 Aug 2026) — split into a bare shape
// (CreateLeadShape, a plain ZodObject) and the exported, refined
// CreateLeadSchema below it. Needed because UpdateLeadSchema further
// down derives via CreateLeadSchema.partial() — .partial() only exists
// on ZodObject, not on the ZodEffects wrapper .superRefine() produces.
// UpdateLeadSchema intentionally derives from the bare shape, not the
// refined one: the ManualEntry-only mandatory-portfolio rule is a
// creation-time gate, not something a partial edit should re-trigger.
const CreateLeadShape = z.object({
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
  // Portfolio names (e.g. ['Discovery', 'Money and Medicine']) — resolved
  // to portfolioIds server-side via resolvePortfolioIds(), same helper
  // userService.js already uses for User's multi-portfolio support.
  // Changed 23 Jul 2026 from a single value to an array (Mark's request,
  // see §41) — a lead's declared interest isn't limited to one portfolio
  // any more than a broker is limited to selling from one. Carries
  // through to Book Appointment's own (still single-select — one
  // appointment is for one portfolio) pre-fill.
  // Changed 13 Aug 2026 (§142, item 2, revised same day) — first pass
  // made this field itself `.min(1)`, which also blocked CSV/subscription
  // bulk import rows (they share this schema, same leadsApi.create()
  // call). Mark caught this: he wants it mandatory on the manual "Create
  // Lead" form specifically, not on bulk import, where portfolio often
  // genuinely isn't known yet. Reverted to .optional() here — the actual
  // requirement now lives in the superRefine() below, conditioned on
  // leadSource === 'ManualEntry', so backend enforcement still exists
  // for that one path (not UI-only) while CSVImport/EventAttendance/
  // Referral/WebForm-sourced leads stay exempt, matching pre-existing
  // behaviour for those sources.
  portfolios:           z.array(z.string()).optional(),
  // 14 Aug 2026 (§166) — Mark's explicit request: "a Lead and an
  // Appointment both need to relate to a region, and a Lead should not
  // be assignable to someone that is out of that region." Same
  // optional-at-the-shape-level, mandatory-via-superRefine split as
  // portfolios/products immediately around it. Value list mirrors
  // src/constants/leadOptions.js's REGIONS exactly — that file is
  // frontend-only (not importable across the client/server boundary),
  // so this is a second copy, not a shared import; keep both in sync by
  // hand if the list ever changes.
  region: z.enum(['Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Free State']).optional(),
  // 14 Aug 2026 (§157/§158, Mark's decision: "Mandatory, manual form
  // only") — mirrors portfolios immediately above exactly: optional at
  // the bare-shape level so CSV/subscription bulk import (which shares
  // this schema via the same leadsApi.create() call) isn't blocked; the
  // actual mandatory rule lives in the superRefine() below, gated on
  // leadSource === 'ManualEntry' only.
  products:             z.array(z.string()).optional(),
  leadSource:           LeadSource.default('ManualEntry'),
  linkedEventId:        z.string().uuid().optional(),
  linkedSubscriptionId: z.string().uuid().optional(),
  csvImportBatchId:     z.string().uuid().optional(),
  manualSourceName:     z.string().max(300).optional(),
});

export const CreateLeadSchema = CreateLeadShape.superRefine((data, ctx) => {
  // §142, item 2 (13 Aug 2026) — Portfolio mandatory on manual Lead
  // creation only. Gated on leadSource, not on the caller (there's no
  // reliable "who's calling" signal other than what the row itself
  // declares) — LeadImport.jsx's manual "Create Lead" tab hardcodes
  // leadSource: 'ManualEntry'; its CSV tab hardcodes 'CSVImport'; its
  // "subscription" tab was found NOT setting leadSource at all (silently
  // defaulting to 'ManualEntry' via .default() above) — fixed alongside
  // this change in LeadImport.jsx to explicitly tag those rows
  // 'CSVImport' too, since they're bulk-imported the same way, or this
  // refine would have caught subscription imports in the same trap CSV
  // import was just pulled out of.
  if (data.leadSource === 'ManualEntry' && (!data.portfolios || data.portfolios.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['portfolios'], message: 'Select at least one portfolio' });
  }
  // 14 Aug 2026 (§157/§158) — mirrors the portfolios rule immediately
  // above, exactly, same ManualEntry-only gate.
  if (data.leadSource === 'ManualEntry' && (!data.products || data.products.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['products'], message: 'Select at least one product' });
  }
  // 14 Aug 2026 (§166) — same ManualEntry-only gate again. Region isn't
  // an array (a Lead has exactly one, unlike Portfolio/Products which
  // can be several) — z.enum already rejects anything outside the valid
  // list, so this only needs to check presence.
  if (data.leadSource === 'ManualEntry' && !data.region) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['region'], message: 'Select a region' });
  }
});

export const UpdateLeadSchema = CreateLeadShape.partial().omit({
  leadSource: true,
  linkedEventId: true,
});

export const AssignLeadSchema = z.object({
  agentId: z.string().uuid('agentId must be a valid UUID'),
});

// §63 — LeadImport.jsx's bulk import preview needs to show a REAL
// duplicate count before anything is created, not the
// Math.floor(rows.length * 0.06) placeholder it had been showing. One
// batched call checking every parsed row against findDuplicate(), rather
// than N separate round trips. Capped at 1000 — comfortably above any
// realistic single import file, and keeps one request from ever being
// asked to check an unbounded number of rows.
export const CheckDuplicatesSchema = z.object({
  rows: z.array(z.object({
    email:    z.string().email(),
    idNumber: z.string().optional(),
  })).min(1).max(1000),
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
  // 16 Aug 2026 — Mark's request: sort on the Leads list. Leads is
  // genuinely server-paginated (unlike AppointmentList.jsx's fetch-
  // everything approach), so sort has to be a real query param, not a
  // client-side re-order of whatever page happens to be loaded — that
  // would only reorder the current 25 rows, not the full result set,
  // and would read as broken the moment someone sorts and the "wrong"
  // rows are on top. Enum here is the actual SQL-injection defence —
  // listLeads() (leadService.js) maps this against a fixed whitelist of
  // real column expressions, never interpolates the value itself.
  sortKey:         z.enum(['name', 'occupation', 'source', 'status', 'agentName', 'createdAt']).optional(),
  sortDir:         z.enum(['asc', 'desc']).default('asc'),
});

// §80 — Medical Subscription management (App Admin's own tab).
export const CreateMedicalSubscriptionSchema = z.object({
  name:         z.string().min(1).max(300),
  providerName: z.string().max(300).optional(),
  notes:        z.string().max(1000).optional(),
});

// §90 — Portfolio/Product management.
export const CreatePortfolioSchema = z.object({
  name: z.string().min(1).max(200),
});
export const CreateProductSchema = z.object({
  name: z.string().min(1).max(200),
});
// §91 — deactivate/reactivate toggle.
export const UpdateActiveSchema = z.object({
  isActive: z.boolean(),
});
