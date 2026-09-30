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
import { handleLeadById } from './leadHandlers.js';

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
