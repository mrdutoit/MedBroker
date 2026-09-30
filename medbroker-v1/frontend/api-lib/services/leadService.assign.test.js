import { describe, it, expect, vi, beforeEach } from 'vitest';

// 30 Sep 2026 — I7/I12: reassign keeps status; uncontactable rule uses the post-reopen window.
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

import { executeQuery, executeQueryOne } from './db.js';
import { getActiveUserById } from './userService.js';
import { assignLead, logCallAttempt } from './leadService.js';

let calls;
let leadStatus;
beforeEach(() => {
  calls = [];
  leadStatus = 'InProgress';
  executeQuery.mockReset();
  executeQueryOne.mockReset();
  getActiveUserById.mockResolvedValue({ id: 'A2', displayName: 'Ann', region: null });
  executeQueryOne.mockImplementation(async (query) => {
    if (/SELECT pipelineStatus/i.test(query)) return { pipelineStatus: leadStatus, title: null, firstName: 'J', lastName: 'S' };
    return { assignedAgentId: 'A1', region: null };
  });
  executeQuery.mockImplementation(async (query, params = {}) => {
    calls.push({ query, params });
    if (/COUNT\(\*\)/i.test(query)) return [{ failedCount: 3 }];
    return [];
  });
});

describe('assignLead', () => {
  it('keeps the existing status unless the lead is Unassigned', async () => {
    await assignLead('L1', 'A2');
    const upd = calls.find((c) => /UPDATE Lead/i.test(c.query));
    expect(upd.query).toMatch(/pipelineStatus = CASE WHEN pipelineStatus = 'Unassigned' THEN 'Assigned' ELSE pipelineStatus END/);
  });
});

describe('logCallAttempt uncontactable rule', () => {
  it('does not close a lead that is AppointmentScheduled', async () => {
    leadStatus = 'AppointmentScheduled';
    const r = await logCallAttempt('L1', 'A1', { outcome: 'NoAnswer' });
    expect(r.flaggedUncontactable).toBe(false);
    expect(calls.some((c) => /COUNT\(\*\)/i.test(c.query))).toBe(false);
  });

  it('counts only attempts after the latest LeadReopened audit entry', async () => {
    const r = await logCallAttempt('L1', 'A1', { outcome: 'NoAnswer' });
    const count = calls.find((c) => /COUNT\(\*\)/i.test(c.query));
    expect(count.query).toMatch(/FROM AuditLog/);
    expect(count.query).toMatch(/action = 'LeadReopened'/);
    expect(count.query).toMatch(/callTime > COALESCE\(/);
    expect(count.query).toMatch(/'-infinity'/);
    expect(r.flaggedUncontactable).toBe(true);
  });
});
