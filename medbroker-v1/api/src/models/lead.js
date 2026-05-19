/**
 * models/lead.js
 * Zod validation schemas for the Lead entity.
 * Lead is the primary data entity in MedBroker — a medical professional who
 * is a prospect for personal, practice, or malpractice insurance.
 *
 * id_number is always encrypted at rest and never returned in plaintext
 * in API responses except during POPIA Subject Access Requests (admin only).
 */

import { z } from 'zod';

// South African ID number: 13 digits
const saIdNumber = z.string()
  .regex(/^\d{13}$/, 'South African ID number must be exactly 13 digits')
  .optional();

// South African mobile: +27 or 0 prefix, 10 digits
const saMobile = z.string()
  .regex(/^(\+27|0)[6-8]\d{8}$/, 'Mobile number must be a valid South African number')
  .optional();

export const PipelineStatus = z.enum([
  'Unassigned',
  'Assigned',
  'InProgress',
  'AppointmentBooked',
  'Progressed',
  'ClosedWon',
  'ClosedLost',
  'Uncontactable',
]);

export const LeadSource = z.enum([
  'EventAttendance',
  'CSVImport',
  'ManualEntry',
  'Referral',
  'WebForm',
]);

/**
 * Schema for creating a new lead (admin CSV import or manual entry).
 * id_number is accepted in plaintext here and encrypted before storage.
 */
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
});

/**
 * Schema for updating a lead (all fields optional — partial update).
 */
export const UpdateLeadSchema = CreateLeadSchema.partial().omit({
  leadSource: true,
  linkedEventId: true,
});

/**
 * Schema for assigning a lead to an agent.
 */
export const AssignLeadSchema = z.object({
  agentId: z.string().uuid('agentId must be a valid UUID'),
});

/**
 * Schema for a call attempt logged by an agent.
 */
export const CallAttemptSchema = z.object({
  outcome: z.enum([
    'NoAnswer',
    'Voicemail',
    'WrongNumber',
    'CallbackRequested',
    'NotInterested',
    'Interested',
    'AppointmentBooked',
  ]),
  notes:            z.string().max(2000).optional(),
  callbackDateTime: z.string().datetime().optional(),
});

/**
 * Query params schema for listing/filtering leads.
 */
export const LeadListQuerySchema = z.object({
  status:    PipelineStatus.optional(),
  agentId:   z.string().uuid().optional(),
  brokerId:  z.string().uuid().optional(),
  eventId:   z.string().uuid().optional(),
  search:    z.string().max(100).optional(),
  page:      z.coerce.number().int().min(1).default(1),
  pageSize:  z.coerce.number().int().min(1).max(100).default(25),
});
