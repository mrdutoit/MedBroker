/**
 * models/sar.js — NEW (§79).
 * POPIA Subject Access Request tracking. Always tied to a Lead — see
 * migration 017's own comment for why leadId is required, not optional.
 */
import { z } from 'zod';

export const SarStatus = z.enum(['Received', 'InProgress', 'Fulfilled', 'Rejected']);

export const CreateSarRequestSchema = z.object({
  leadId:         z.string().uuid(),
  requestorName:  z.string().min(1).max(200),
  requestorEmail: z.string().email(),
  receivedAt:     z.string(), // YYYY-MM-DD, matches every other date-only field in this codebase
  dueDate:        z.string().optional(),
  notes:          z.string().max(2000).optional(),
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
