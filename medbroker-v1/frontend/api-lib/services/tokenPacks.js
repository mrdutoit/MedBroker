/**
 * services/tokenPacks.js — NEW, §135 (7 Aug 2026), extracted from
 * stripeService.js when Paystack was added alongside it.
 *
 * Fixed server-side, not client-supplied — same three packs
 * AppointmentList.jsx's BuyTokensModal has always shown (5/R250, 10/R450
 * "save R50", 20/R800 "save R200"), priced server-side so a modified
 * client request can never pay less than the real price for more tokens.
 *
 * ONE SHARED DEFINITION, not one per payment provider — §134 originally
 * defined this array inline in stripeService.js; pulled out here the
 * moment a second provider needed the identical numbers, so the two
 * provider services can never drift apart on what a "10 tokens" pack
 * actually costs. Both stripeService.js and paystackService.js import
 * this rather than each defining their own copy.
 */

export const TOKEN_PACKS = [
  { tokens: 5,  priceZarCents: 25000, label: '5 tokens' },
  { tokens: 10, priceZarCents: 45000, label: '10 tokens — save R50' },
  { tokens: 20, priceZarCents: 80000, label: '20 tokens — save R200' },
];
