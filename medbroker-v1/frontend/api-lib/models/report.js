/**
 * models/report.js
 * Validation for the Reports API — GET /api/reports/summary|brokers|agents.
 * See reportService.js for the period → date-range logic and the pipeline
 * bucket mapping decided with Mark before this was built (dropped the
 * mock's "Uncontactable" bucket — no real data backs it; split Converted
 * leads by their appointment's actual outcome instead).
 */
import { z } from 'zod';

export const ReportPeriodQuerySchema = z.object({
  period: z.enum(['Monthly', 'Quarterly', 'Yearly']).default('Monthly'),
  // Optional — which specific month/quarter/year instance to view, as an
  // ISO date string (e.g. "2026-06-15"); any date within the target period
  // works, reportService.js only reads its year/month. Omitted entirely
  // means "the period we're in right now", same as before this existed.
  referenceDate: z.string().optional()
    .transform(v => (v ? new Date(v) : undefined))
    .refine(d => d === undefined || !Number.isNaN(d.getTime()), { message: 'referenceDate is not a valid date' }),
});

// 14 Aug 2026 (§163) — GET /api/reports/dashboard only; a separate schema
// rather than adding these three fields to ReportPeriodQuerySchema itself,
// since every other report endpoint shares that schema and has no use for
// them. portfolio/source are plain strings (names, not IDs — matches
// AppointmentListQuerySchema's own existing convention for the same two
// concepts); brokerId is a UUID, same convention as that schema's brokerId.
export const DashboardQuerySchema = ReportPeriodQuerySchema.extend({
  brokerId:  z.string().uuid().optional(),
  portfolio: z.string().max(200).optional(),
  source:    z.string().max(50).optional(),
});
