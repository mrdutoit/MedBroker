import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./db.js', () => ({
  executeQuery: vi.fn(), executeQueryOne: vi.fn(),
  sql: new Proxy({}, { get: () => () => ({}) }),
}));
vi.mock('./systemConfigService.js', () => ({
  getSystemConfig: vi.fn().mockResolvedValue({ brokerFreeAppointmentsPerMonth: 10 }),
}));
vi.mock('../context/tenant.js', () => ({ resolveOrganisationId: () => 'org-1' }));

import { executeQuery, executeQueryOne } from './db.js';
import { creditPurchasedTokens } from './tokenService.js';

beforeEach(() => {
  vi.clearAllMocks();
  // getCurrentTokenLedger: current-month ledger row already exists
  const now = new Date();
  executeQueryOne.mockResolvedValue({
    id: 'l1', balance: 0, freeRemaining: 10,
    periodStart: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`,
  });
});

describe('creditPurchasedTokens', () => {
  it('credits in ONE idempotent statement: CTE insert ON CONFLICT DO NOTHING feeding the ledger update', async () => {
    executeQuery.mockResolvedValue([{ id: 'l1' }]);
    const r = await creditPurchasedTokens('b1', 5, 'ref-1', 'Paystack purchase');
    expect(executeQuery).toHaveBeenCalledTimes(1);
    const text = executeQuery.mock.calls[0][0];
    expect(text).toMatch(/ON CONFLICT DO NOTHING/i);
    expect(text).toMatch(/RETURNING amount/i);
    expect(text).toMatch(/UPDATE TokenLedger/i);
    expect(text).toMatch(/FROM ins/i);
    expect(r).toEqual({ credited: true });
  });

  it('reports alreadyProcessed when the insert hit the unique index (no ledger row updated)', async () => {
    executeQuery.mockResolvedValue([]);
    const r = await creditPurchasedTokens('b1', 5, 'ref-1', 'Paystack purchase');
    expect(r).toEqual({ credited: false, alreadyProcessed: true });
  });
});
