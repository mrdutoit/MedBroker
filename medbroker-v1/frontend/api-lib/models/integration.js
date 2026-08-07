/**
 * models/integration.js — NEW, §134 (6 Aug 2026).
 * Validation schemas for the Integrations settings page (Stripe + SMTP
 * credentials) and the Stripe token-purchase checkout endpoint.
 *
 * Every field is .optional() on both credential schemas — PUT is a
 * partial update (integrationCredentialService.setConfig() merges into
 * whatever's already stored), so a GlobalAdmin changing just the SMTP
 * port doesn't have to resend everything else, including secrets they
 * don't want to re-type.
 */

import { z } from 'zod';

export const UpdateStripeCredentialsSchema = z.object({
  secretKey:            z.string().trim().max(300).optional(),
  webhookSigningSecret: z.string().trim().max(300).optional(),
});

export const UpdateSmtpCredentialsSchema = z.object({
  host:     z.string().trim().max(255).optional(),
  port:     z.number().int().min(1).max(65535).optional(),
  user:     z.string().trim().max(255).optional(),
  password: z.string().trim().max(300).optional(),
  from:     z.string().trim().max(255).optional(),
});

// POST /api/appointments/tokens/checkout — packIndex selects one of
// stripeService.TOKEN_PACKS server-side; the client never supplies a
// price, only which pack it wants (§134's own header for why).
export const TokenCheckoutSchema = z.object({
  packIndex: z.number().int().min(0).max(2),
});
