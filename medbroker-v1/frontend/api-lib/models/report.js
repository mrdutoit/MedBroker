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
});
