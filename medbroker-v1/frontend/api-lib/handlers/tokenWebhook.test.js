import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/tokenService.js', () => ({
  getCurrentTokenLedger: vi.fn(), manualTopUp: vi.fn(), listTokenTransactions: vi.fn(),
  creditPurchasedTokens: vi.fn(),
}));
vi.mock('../services/stripeService.js', () => ({ createCheckoutSession: vi.fn(), verifyWebhookSignature: vi.fn() }));
vi.mock('../services/paystackService.js', () => ({
  createTransaction: vi.fn(), verifyWebhookSignature: vi.fn(), verifyTransaction: vi.fn(),
}));
vi.mock('../services/auditService.js', () => ({
  writeAuditLog: vi.fn(), clientIp: vi.fn(), listAuditLogForAppointment: vi.fn(),
}));

import { creditPurchasedTokens } from '../services/tokenService.js';
import { verifyWebhookSignature } from '../services/stripeService.js';
import { verifyWebhookSignature as verifyPs, verifyTransaction } from '../services/paystackService.js';
import { TOKEN_PACKS } from '../services/tokenPacks.js';
import { handleTokenWebhook, handleTokenWebhookPaystack } from './appointmentHandlers.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (n) => { res.statusCode = n; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = () => res;
  return res;
}
const req = { method: 'POST', headers: {} };
const psEvent = (metadata) => ({ event: 'charge.success', data: { reference: 'ref-1', metadata: { brokerId: 'b1', ...metadata } } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  creditPurchasedTokens.mockResolvedValue({ credited: true });
});

describe('Paystack webhook', () => {
  it('credits the pack token count, ignoring metadata.tokens', async () => {
    verifyPs.mockResolvedValue(psEvent({ tokens: 9999, packIndex: 1 }));
    verifyTransaction.mockResolvedValue({ status: 'success', amount: TOKEN_PACKS[1].priceZarCents, currency: 'ZAR' });
    const res = mockRes();
    await handleTokenWebhookPaystack(req, res, Buffer.from('{}'));
    expect(creditPurchasedTokens).toHaveBeenCalledWith('b1', TOKEN_PACKS[1].tokens, 'ref-1', expect.any(String));
    expect(res.statusCode).toBe(200);
  });

  it('non-ZAR currency: no credit, 200 acknowledged, warning logged', async () => {
    verifyPs.mockResolvedValue(psEvent({ tokens: 10, packIndex: 1 }));
    verifyTransaction.mockResolvedValue({ status: 'success', amount: TOKEN_PACKS[1].priceZarCents, currency: 'USD' });
    const res = mockRes();
    await handleTokenWebhookPaystack(req, res, Buffer.from('{}'));
    expect(creditPurchasedTokens).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(console.warn).toHaveBeenCalled();
  });

  it.each([undefined, 7, -1, 'abc'])('invalid packIndex %s: no credit, 200, warning', async (packIndex) => {
    verifyPs.mockResolvedValue(psEvent({ tokens: 10, packIndex }));
    const res = mockRes();
    await handleTokenWebhookPaystack(req, res, Buffer.from('{}'));
    expect(creditPurchasedTokens).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('Stripe webhook', () => {
  const stripeEvent = (metadata) => ({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', metadata: { brokerId: 'b1', ...metadata } } } });

  it('credits the pack token count, ignoring metadata.tokens', async () => {
    verifyWebhookSignature.mockResolvedValue(stripeEvent({ tokens: 9999, packIndex: 2 }));
    const res = mockRes();
    await handleTokenWebhook(req, res, Buffer.from('{}'));
    expect(creditPurchasedTokens).toHaveBeenCalledWith('b1', TOKEN_PACKS[2].tokens, 'cs_1', expect.any(String));
    expect(res.statusCode).toBe(200);
  });

  it('invalid packIndex: no credit, 200, warning', async () => {
    verifyWebhookSignature.mockResolvedValue(stripeEvent({ tokens: 10, packIndex: 99 }));
    const res = mockRes();
    await handleTokenWebhook(req, res, Buffer.from('{}'));
    expect(creditPurchasedTokens).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(console.warn).toHaveBeenCalled();
  });
});
