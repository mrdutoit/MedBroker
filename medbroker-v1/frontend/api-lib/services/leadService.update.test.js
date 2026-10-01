import { describe, it, expect, vi, beforeEach } from 'vitest';

// 30 Sep 2026 — I7: a null for a clearable field must write NULL, not be skipped.
vi.mock('./db.js', () => ({
  sql: new Proxy({}, { get: () => { const m = () => m; m.MAX = 'MAX'; return m; } }),
  executeQuery: vi.fn(),
  executeQueryOne: vi.fn(),
}));
vi.mock('./userService.js', () => ({
  getActiveUserById: vi.fn(), resolvePortfolioIds: vi.fn(), resolveProductIds: vi.fn(),
}));
vi.mock('./taskService.js', () => ({
  createTask: vi.fn(), deleteTasksForEntity: vi.fn(), reassignTasksForEntity: vi.fn(),
  completeOpenCallbackTasksForLead: vi.fn(),
}));
vi.mock('./auditService.js', () => ({ writeAuditLog: vi.fn() }));
vi.mock('./encryption.js', async (importOriginal) => ({
  ...(await importOriginal()),
  encrypt: vi.fn(async (x) => 'ENC(' + x + ')'),
}));

import { executeQuery } from './db.js';
import { updateLead } from './leadService.js';

beforeEach(() => { executeQuery.mockReset(); executeQuery.mockResolvedValue([]); });

describe('updateLead null clears', () => {
  it('writes NULL for plain and encrypted clearable fields', async () => {
    const changed = await updateLead('L1', { whatsappNumber: null, hospitalOrPractice: null, policies: null, medicalAidProvider: null, currentInsurer: null });
    expect(changed).toBe(true);
    const [query, params] = executeQuery.mock.calls[0];
    expect(query).toMatch(/whatsappNumber = @whatsappNumber/);
    expect(params.whatsappNumber.value).toBeNull();
    expect(params.hospitalOrPractice.value).toBeNull();
    expect(query).toMatch(/policiesEncrypted = @policiesEncrypted/);
    expect(params.policiesEncrypted.value).toBeNull();
    expect(params.medicalAidProviderEncrypted.value).toBeNull();
    expect(params.currentInsurerEncrypted.value).toBeNull();
  });
});
