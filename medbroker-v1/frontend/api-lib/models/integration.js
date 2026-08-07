/**
 * models/integration.js — NEW, §134 (6 Aug 2026). EXTENDED §135
 * (7 Aug 2026) for Paystack.
 * Validation schemas for the Integrations settings page (Stripe +
 * Paystack + SMTP credentials) and the token-purchase checkout endpoint
 * (provider-agnostic — the same schema serves either payment provider,
 * since the request shape a broker sends is identical either way).
 *
 * Every field is .optional() on all three credential schemas — PUT is a
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

// Paystack (§135) — ONE field, not two like Stripe's schema above. No
// separate webhook signing secret exists to configure — see
// paystackService.js's own header for why the secret key alone covers
// both the API call and the webhook signature.
export const UpdatePaystackCredentialsSchema = z.object({
  secretKey: z.string().trim().max(300).optional(),
});

export const UpdateSmtpCredentialsSchema = z.object({
  host:     z.string().trim().max(255).optional(),
  port:     z.number().int().min(1).max(65535).optional(),
  user:     z.string().trim().max(255).optional(),
  password: z.string().trim().max(300).optional(),
  from:     z.string().trim().max(255).optional(),
});

// POST /api/appointments/tokens/checkout — packIndex selects one of
// tokenPacks.TOKEN_PACKS server-side; the client never supplies a price,
// only which pack it wants (§134's own header for why). Shared by both
// the Stripe and Paystack paths (§135) — handleTokenCheckout decides
// which provider's service function to call, this schema doesn't need
// to know or care which.
export const TokenCheckoutSchema = z.object({
  packIndex: z.number().int().min(0).max(2),
});
