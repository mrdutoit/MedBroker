/**
 * models/leadPortal.js — NEW, 24 Jul 2026.
 * Validation for the Lead Portal — the self-service prospect-facing side
 * (registration, login, profile, venue check-in), separate from the
 * staff-facing Events API (models/event.js) it depends on.
 */
import { z } from 'zod';
import { Title, JobTitle, saMobile } from './lead.js';

/**
 * Registration — same required-field set as CreateLeadSchema/
 * AddAttendeeSchema (see models/event.js), for the same reason: this
 * either creates a new Lead or matches an existing one. popiConsent here
 * IS the person themselves consenting (unlike AddAttendeeSchema's staff
 * attestation) — a real self-service checkbox, not a proxy confirmation.
 */
export const PortalRegisterSchema = z.object({
  qrToken:      z.string().uuid('Invalid registration link'),
  title:        Title,
  firstName:    z.string().min(1, 'First name is required').max(100),
  lastName:     z.string().min(1, 'Last name is required').max(100),
  dateOfBirth:  z.string().date('Must be a valid date (YYYY-MM-DD)'),
  email:        z.string().email('Must be a valid email address').max(255),
  mobileNumber: saMobile,
  occupation:   JobTitle,
  password:     z.string().min(12, 'Password must be at least 12 characters'),
  popiConsent:  z.literal(true, {
    errorMap: () => ({ message: 'You must consent to your details being captured to register' }),
  }),
});

export const PortalLoginSchema = z.object({
  email:    z.string().email('Must be a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Deliberately narrow — mirrors the "narrow v1" scope decision (contact
// details only, not medical aid/existing cover/ID number).
export const PortalUpdateMeSchema = z.object({
  email:        z.string().email('Must be a valid email address').max(255).optional(),
  mobileNumber: saMobile.optional(),
});

export const PortalCheckinSchema = z.object({
  qrToken: z.string().uuid('Invalid event code'),
});

/**
 * Claim portal access for an EXISTING Lead outside of any event context —
 * the gap Mark found: registration was entirely event-anchored, so a
 * manually-added attendee (Add Attendee, see models/event.js) had no way
 * to get portal access once no event was currently active. Verified by
 * email + dateOfBirth matching an EXISTING Lead exactly — deliberately
 * does NOT create a new Lead on no match (that would let anyone
 * self-register a "ghost" lead with no staff record behind it).
 */
export const PortalActivateSchema = z.object({
  email:       z.string().email('Must be a valid email address'),
  dateOfBirth: z.string().date('Must be a valid date (YYYY-MM-DD)'),
  password:    z.string().min(12, 'Password must be at least 12 characters'),
});
