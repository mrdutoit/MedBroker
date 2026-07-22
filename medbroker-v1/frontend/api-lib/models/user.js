/**
 * models/user.js — NEW.
 * Validation schemas for the Users API. Matches exactly what UserAdmin.jsx
 * (frontend) sends — built by reading that page first, not guessed.
 */

import { z } from 'zod';

// GlobalAdmin is bootstrap-only (see auth.js bootstrap-admin route) — never
// creatable through this API, matching UserAdmin.jsx's own ROLES constant.
export const CreatableRole = z.enum(['Admin', 'Supervisor', 'Agent', 'Broker']);

const REGIONS = [
  'Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape',
  'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Free State',
];

export const CreateUserSchema = z.object({
  displayName:  z.string().min(1).max(200),
  email:        z.string().email().max(255),
  role:         CreatableRole,
  region:       z.enum(REGIONS).optional(),
  supervisorId: z.string().uuid().optional(),
  // Names, not ids — matches UserAdmin.jsx's checkbox state exactly
  // (form.portfolios / form.products are arrays of names, resolved
  // against Portfolio/Product by userService.js). Avoids needing a
  // separate reference-data endpoint the frontend doesn't otherwise need,
  // since RoleContext.jsx already hardcodes PORTFOLIOS/PRODUCTS_BY_PORTFOLIO
  // to match the seed data.
  portfolios:   z.array(z.string()).default([]),
  products:     z.array(z.string()).default([]),
  // Present when auth.sso.enabled is false (the local-auth path, currently
  // the active default — see FeatureFlag seed). Omitted entirely when SSO
  // is enabled, matching the frontend's existing SSO-invite messaging.
  password:     z.string().min(12).optional(),
});

export const UpdateUserSchema = z.object({
  displayName:  z.string().min(1).max(200).optional(),
  role:         CreatableRole.optional(),
  region:       z.enum(REGIONS).optional().nullable(),
  supervisorId: z.string().uuid().optional().nullable(),
  portfolios:   z.array(z.string()).optional(),
  products:     z.array(z.string()).optional(),
  isActive:     z.boolean().optional(),
});

export const UserListQuerySchema = z.object({
  role:   CreatableRole.optional(),
  search: z.string().max(100).optional(),
});
