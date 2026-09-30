import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  validateToken: vi.fn(),
}));
vi.mock('../services/encryption.js', () => ({ encrypt: vi.fn(async (x) => 'ENC(' + x + ')') }));
vi.mock('../services/leadService.js', () => ({
  listLeads: vi.fn(), createLead: vi.fn(), listSources: vi.fn(), listMedicalSubscriptions: vi.fn(),
  createMedicalSubscription: vi.fn(), getLeadById: vi.fn(), updateLead: vi.fn(), deleteLead: vi.fn(),
  assignLead: vi.fn(), reopenLead: vi.fn(), logCallAttempt: vi.fn(), listCallAttempts: vi.fn(), findDuplicate: vi.fn(),
}));
vi.mock('../services/userService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDirectReportIds: vi.fn(), getUserDisplayNameById: vi.fn(),
}));
vi.mock('../services/auditService.js', () => ({
  writeAuditLog: vi.fn(), clientIp: vi.fn(), listAuditLogForLead: vi.fn(),
}));
vi.mock('../services/notificationService.js', () => ({ createNotification: vi.fn() }));

import { validateToken } from '../middleware/auth.js';
import * as leads from '../services/leadService.js';
import { writeAuditLog } from '../services/auditService.js';
import { handleLeadById, handleLeadAssign, handleLeadCalls } from './leadHandlers.js';

const ID = '11111111-1111-4111-8111-111111111111';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (n) => { res.statusCode = n; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = () => res;
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe('lead PUT audit diff', () => {
  it('seals idNumber; no plaintext digits outside sealed', async () => {
    validateToken.mockResolvedValue({ oid: 'admin', roles: ['Admin'] });
    leads.getLeadById.mockResolvedValue({ id: ID, assignedAgentId: 'a', pipelineStatus: 'New', idNumber: '9403140000000', email: 'a@x.com' });
    leads.updateLead.mockResolvedValue(true);
    const res = mockRes();
    await handleLeadById({ method: 'PUT', body: { idNumber: '9403145000000', email: 'b@x.com' }, query: {}, headers: {} }, res, ID);
    expect(res.statusCode).toBe(200);
    const { changeDetail } = writeAuditLog.mock.calls[0][0];
    expect(changeDetail.idNumber).toEqual({ changed: true, sealed: 'ENC({"from":"9403140000000","to":"9403145000000"})' });
    const { sealed, ...rest } = changeDetail.idNumber;
    expect(JSON.stringify(rest)).not.toMatch(/\d{13}/);
    expect(changeDetail.email).toEqual({ from: 'a@x.com', to: 'b@x.com' });
  });
});

// 30 Sep 2026 — I7/I12: closed leads are locked against assign and call logging.
describe('lead closed locks', () => {
  it('assign on a Closed lead is 409', async () => {
    validateToken.mockResolvedValue({ oid: 'admin', roles: ['Admin'] });
    leads.getLeadById.mockResolvedValue({ id: ID, assignedAgentId: 'a', pipelineStatus: 'Closed' });
    const res = mockRes();
    await handleLeadAssign({ method: 'PUT', body: { agentId: '22222222-2222-4222-8222-222222222222' }, query: {}, headers: {} }, res, ID);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('This lead is closed. Reopen it first.');
    expect(leads.assignLead).not.toHaveBeenCalled();
  });
  it.each(['Closed', 'AppointmentScheduled'])('POST call on %s lead is 409', async (status) => {
    validateToken.mockResolvedValue({ oid: 'admin', roles: ['Admin'] });
    leads.getLeadById.mockResolvedValue({ id: ID, assignedAgentId: 'a', pipelineStatus: status });
    const res = mockRes();
    await handleLeadCalls({ method: 'POST', body: { outcome: 'NoAnswer' }, query: {}, headers: {} }, res, ID);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('This lead is closed or already booked; calls can no longer be logged.');
    expect(leads.logCallAttempt).not.toHaveBeenCalled();
  });
});
