/**
 * models/sar.js — NEW (§79).
 * POPIA Subject Access Request tracking. Always tied to a Lead — see
 * migration 017's own comment for why leadId is required, not optional.
 */
import { z } from 'zod';

export const SarStatus = z.enum(['Received', 'InProgress', 'Fulfilled', 'Rejected']);

// Migration 035 (20 Aug 2026) — POPIA's right of access (s23) and right
// to request destruction/deletion (s24(1)(b)) are distinct rights; this
// model previously covered access requests only. 'Deletion' is fulfilled
// via executeSarDeletion() (sarService.js), not updateSarStatus() alone.
export const SarRequestType = z.enum(['Access', 'Deletion']);

export const CreateSarRequestSchema = z.object({
  leadId:         z.string().uuid(),
  requestorName:  z.string().min(1).max(200),
  requestorEmail: z.string().email(),
  receivedAt:     z.string(), // YYYY-MM-DD, matches every other date-only field in this codebase
  // dueDate REMOVED 21 Aug 2026, Mark's explicit request — was
  // optional/client-supplied before; now always computed server-side as
  // receivedAt + 30 days (the standard POPIA/PAIA access-request response
  // window — see createSarRequest()'s own comment for the full sourcing)
  // and never editable afterward. Any dueDate a stale client still sends
  // is silently dropped by Zod (unrecognised keys are stripped by
  // default), not an error — deliberate, so an old cached frontend build
  // fails soft here rather than 400ing.
  notes:          z.string().max(2000).optional(),
  requestType:    SarRequestType.default('Access'),
  // §128 (5 Aug 2026) — assign at creation time, not only afterward
  // (Mark's own request). Validated server-side (sarService.
  // getValidSarAssignee) against the same Admin/GlobalAdmin rule
  // AssignSarSchema's own endpoint uses — not re-declared here as a
  // stricter type, since the same "must actually be a real, active
  // Admin/GlobalAdmin" check can't be expressed in Zod alone anyway
  // (it needs a database lookup).
  // Made REQUIRED 21 Aug 2026 (was .optional()) — Mark's explicit
  // request: an SAR created with nobody assigned meant nobody was ever
  // notified it existed (createSarRequest()'s notification block was
  // entirely conditional on an assignee being present) — the request
  // could sit invisible indefinitely with no automated way to surface
  // it, given no reminder/scheduler infrastructure exists for SAR. The
  // .uuid() constraint alone doesn't confirm the id is a real, active
  // Admin/GlobalAdmin — getValidSarAssignee() still does that lookup and
  // createSarRequest() still throws a real error (not a silent no-op)
  // if it doesn't resolve to one.
  assignedToId:   z.string().uuid(),
});

export const UpdateSarStatusSchema = z.object({
  status: SarStatus,
  notes:  z.string().max(2000).optional(),
});

export const SarListQuerySchema = z.object({
  status: SarStatus.optional(),
});

// §125 (5 Aug 2026) — assignment + notes thread.
export const AssignSarSchema = z.object({
  assignedToId: z.string().uuid().nullable(), // null explicitly unassigns
});

export const CreateSarCommentSchema = z.object({
  body: z.string().min(1).max(2000),
});
