import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  validateToken: vi.fn(),
}));
vi.mock('../services/encryption.js', () => ({ encrypt: vi.fn(async (x) => 'ENC(' + x + ')') }));
vi.mock('../services/appointmentService.js', () => ({
  listAppointments: vi.fn(), createAppointment: vi.fn(), getAppointmentById: vi.fn(),
  assignBroker: vi.fn(), reassignAppointment: vi.fn(), returnToLeads: vi.fn(),
  reopenAppointment: vi.fn(), saveOutcome: vi.fn(), claimAppointment: vi.fn(),
  listAvailableToClaim: vi.fn(), saveMeetingAttemptOutcome: vi.fn(), updateAppointment: vi.fn(),
  hasBrokerConflict: vi.fn(),
}));
vi.mock('../services/userService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDirectReportIds: vi.fn(),
  getUserDisplayNameById: vi.fn(),
}));
vi.mock('../services/leadService.js', () => ({ getLeadById: vi.fn(), getLeadDisplayNameById: vi.fn() }));
vi.mock('../services/auditService.js', () => ({
  writeAuditLog: vi.fn(), clientIp: vi.fn(), listAuditLogForAppointment: vi.fn(),
}));
vi.mock('../services/systemConfigService.js', () => ({ getSystemConfig: vi.fn() }));

import { validateToken } from '../middleware/auth.js';
import * as appts from '../services/appointmentService.js';
import { writeAuditLog } from '../services/auditService.js';
import { handleAppointmentById } from './appointmentHandlers.js';

const ID = '11111111-1111-4111-8111-111111111111';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (n) => { res.statusCode = n; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = () => res;
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe('appointment PUT audit diff', () => {
  it('seals currentInsurer; plaintext never reaches writeAuditLog outside sealed', async () => {
    validateToken.mockResolvedValue({ oid: 'admin', roles: ['Admin'] });
    appts.getAppointmentById.mockResolvedValue({ id: ID, agentId: 'a', brokerId: null, status: 'Booked', currentInsurer: 'Discovery', meetingType: 'Virtual' });
    appts.updateAppointment.mockResolvedValue(true);
    const res = mockRes();
    await handleAppointmentById({ method: 'PUT', body: { currentInsurer: 'Bonitas', meetingType: 'InPerson', firstAppointmentAddress: '1 Main Rd' }, query: {}, headers: {} }, res, ID);
    expect(res.statusCode).toBe(200);
    const { changeDetail } = writeAuditLog.mock.calls[0][0];
    expect(changeDetail.currentInsurer).toEqual({ changed: true, sealed: 'ENC({"from":"Discovery","to":"Bonitas"})' });
    const { sealed, ...rest } = changeDetail.currentInsurer;
    expect(JSON.stringify(rest)).not.toMatch(/Discovery|Bonitas/);
    expect(changeDetail.meetingType).toEqual({ from: 'Virtual', to: 'InPerson' });
  });
});
