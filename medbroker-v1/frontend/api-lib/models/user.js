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
})
  // §138, 12 Aug 2026 — Mark's request: an Agent or Broker should never be
  // creatable without a Supervisor. Closes the "never orphan a task" fallback
  // this app has needed elsewhere (Assign-broker/Callback tasks landing on
  // the assignee themselves because no Supervisor was set) at the source
  // instead of continuing to paper over it downstream.
  //
  // Also requires Supervisor role to have a region set — not something Mark
  // asked for directly, but follows from the same request: Assign-broker
  // tasks now route by matching a Supervisor's region (see
  // userService.findLeastLoadedSupervisorForRegion), which only works
  // reliably if every Supervisor actually has one.
  .superRefine((data, ctx) => {
    if ((data.role === 'Agent' || data.role === 'Broker') && !data.supervisorId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['supervisorId'],
        message: `A${data.role === 'Agent' ? 'n' : ''} ${data.role} must have a Supervisor selected`,
      });
    }
    if (data.role === 'Supervisor' && !data.region) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['region'],
        message: 'A Supervisor must have a region selected',
      });
    }
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

// PUT /api/users/:id/link-identity — §114 (4 Aug 2026), SSO stage 1
// foundation. Deliberately separate from UpdateUserSchema, not a field
// added to it: this route is GlobalAdmin-only (handleUserLinkIdentity
// requires GlobalAdmin, not Admin+GlobalAdmin like the rest of User
// Admin), matching Mark's design decision (a) — email correction and
// manual identity-linking are authentication-configuration actions, not
// routine profile administration. entraObjectId accepts null explicitly
// (unlink an identity, e.g. after a mistaken link), distinct from
// undefined (field not being touched this call) — z.string().nullable()
// preserves that distinction, .optional() alone would not.
export const LinkIdentitySchema = z.object({
  email:         z.string().email().max(255).optional(),
  entraObjectId: z.string().min(1).max(100).nullable().optional(),
}).refine(
  (data) => data.email !== undefined || data.entraObjectId !== undefined,
  { message: 'Provide at least one of email or entraObjectId' }
);

// PUT /api/users/:id/force-password-reset — §118 (4 Aug 2026). GlobalAdmin
// ONLY (Mark's explicit scope — tighter than link-identity's GlobalAdmin
// gate isn't possible, this IS the same gate, just worth stating plainly:
// this is the most consequential single-user action in the app, setting
// someone else's credential outright). Complexity is enforced server-side
// (checkPasswordComplexity, authService.js) at the handler, same bar a
// user's own voluntary change is held to — an admin-assigned temporary
// value doesn't get a policy exemption just because it's temporary.
export const ForcePasswordResetSchema = z.object({
  newPassword: z.string().min(1, 'Enter a temporary password'),
});

// Self-service Settings.jsx fields only — deliberately separate from
// UpdateUserSchema above, not a subset of it. UpdateUserSchema is the
// Admin/GlobalAdmin-editing-someone-else shape (role, region, supervisor,
// portfolios, isActive); this is the "editing my own profile" shape, used
// by PUT /api/users/me (handleUserMe, no requireRole() — any authenticated
// user reaches it, but only ever writes to their own row, keyed off
// claims.oid server-side, never off an id in the request). Keeping these
// two schemas separate — rather than making this a permissive subset of
// UpdateUserSchema — is what stops a self-service save from ever being
// able to smuggle in a role/isActive/portfolio change even by accident.
// §151 follow-up (13 Aug 2026, Mark's request) — displayName removed
// from this schema entirely. Was previously editable via self-service
// (Settings.jsx); Mark wants display name read-only everywhere except
// User Admin (an Admin/GlobalAdmin editing someone ELSE's row, via
// handleUserById, a completely separate schema/endpoint from this
// one — see UpdateUserSchema, unaffected by this change). Not just a
// frontend hide: Zod strips unrecognized keys by default on a plain
// z.object() (not .strict()), so even if a client still sends
// displayName in the PUT body, it's silently dropped before reaching
// updateOwnProfile() — matches the project's standing "never UI-only"
// enforcement rule.
export const UpdateOwnProfileSchema = z.object({
  avatarColour:    z.enum(['grad', 'violet', 'cyan', 'green', 'amber']).optional(),
  themePreference: z.enum(['linen', 'terra', 'midnight', 'ember']).optional(),
  timezone:        z.enum(['Africa/Johannesburg', 'UTC', 'Europe/London', 'Europe/Amsterdam']).optional(),
});
