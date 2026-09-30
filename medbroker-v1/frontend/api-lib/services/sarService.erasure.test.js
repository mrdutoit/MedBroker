import { describe, it, expect, vi, beforeEach } from 'vitest';

// 30 Sep 2026 — S-I7: the SAR's own deletion audit entry must not re-record the name.
vi.mock('./db.js', () => ({
  sql: new Proxy({}, { get: () => { const m = () => m; m.MAX = 'MAX'; return m; } }),
  executeQuery: vi.fn(async () => []),
  executeQueryOne: vi.fn(),
}));
vi.mock('./leadService.js', () => ({
  getLeadRetentionPosition: vi.fn(async () => ({ hasFaisObligation: false })),
  eraseLeadPII: vi.fn(async () => {}),
  restrictLead: vi.fn(async () => {}),
}));
vi.mock('./appointmentService.js', () => ({ closeOpenAppointmentsForErasure: vi.fn(async () => []) }));
vi.mock('./auditService.js', () => ({ writeAuditLog: vi.fn(async () => {}), listAuditLogForLead: vi.fn() }));
vi.mock('./notificationService.js', () => ({ createNotification: vi.fn(async () => {}) }));
vi.mock('./taskService.js', () => ({ createTask: vi.fn(), completeOpenSarTask: vi.fn(async () => {}) }));

import { executeQueryOne } from './db.js';
import { writeAuditLog } from './auditService.js';
import { eraseLeadPII } from './leadService.js';
import { executeSarDeletion, assignSarRequest } from './sarService.js';

beforeEach(() => {
  executeQueryOne.mockReset();
  executeQueryOne.mockResolvedValue({
    id: 'S1', leadId: 'L1', leadName: 'Jo Soap', status: 'Received', requestType: 'Deletion',
  });
  writeAuditLog.mockClear();
});

describe('executeSarDeletion', () => {
  it('erases and writes a SarDeletionExecuted audit without leadName', async () => {
    await executeSarDeletion('S1', 'admin');
    expect(eraseLeadPII).toHaveBeenCalledWith('L1');
    const entry = writeAuditLog.mock.calls.map(([e]) => e).find((e) => e.action === 'SarDeletionExecuted');
    expect(entry.changeDetail).toMatchObject({ sarId: 'S1', leadId: 'L1', outcome: 'Erased' });
    expect(entry.changeDetail).not.toHaveProperty('leadName');
  });

  it('assignSarRequest writes a SarAssigned audit without leadName', async () => {
    await assignSarRequest('S1', null, 'admin');
    const entry = writeAuditLog.mock.calls.map(([e]) => e).find((e) => e.action === 'SarAssigned');
    expect(entry.changeDetail).toEqual({ sarId: 'S1', assignedToId: null });
  });
});
