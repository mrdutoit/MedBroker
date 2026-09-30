// 30 Sep 2026 — Task 8 (I10): a date/time edit can't double-book the broker.
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
import { handleAppointmentById } from './appointmentHandlers.js';

const ID = '11111111-1111-4111-8111-111111111111';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (n) => { res.statusCode = n; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = () => res;
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  validateToken.mockResolvedValue({ oid: 'admin', roles: ['Admin'] });
  appts.updateAppointment.mockResolvedValue(true);
});

const put = async (body) => {
  const res = mockRes();
  await handleAppointmentById({ method: 'PUT', body, query: {}, headers: {} }, res, ID);
  return res;
};

describe('appointment PUT broker conflict', () => {
  const appt = { id: ID, agentId: 'a', brokerId: 'B1', status: 'Assigned', firstAppointmentDate: '2026-10-01', firstAppointmentTime: '10:00:00' };

  it('409s when the new slot clashes with another of the broker\'s appointments', async () => {
    appts.getAppointmentById.mockResolvedValue(appt);
    appts.hasBrokerConflict.mockResolvedValue(true);
    const res = await put({ firstAppointmentTime: '11:00' });
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'The broker already has an appointment at that time.' });
    expect(appts.hasBrokerConflict).toHaveBeenCalledWith('B1', '2026-10-01', '11:00', ID);
    expect(appts.updateAppointment).not.toHaveBeenCalled();
  });

  it('checks the merged slot when only the date changes, and saves when free', async () => {
    appts.getAppointmentById.mockResolvedValue(appt);
    appts.hasBrokerConflict.mockResolvedValue(false);
    const res = await put({ firstAppointmentDate: '2026-10-02' });
    expect(res.statusCode).toBe(200);
    expect(appts.hasBrokerConflict).toHaveBeenCalledWith('B1', '2026-10-02', '10:00:00', ID);
    expect(appts.updateAppointment).toHaveBeenCalled();
  });

  it('skips the check when the slot is unchanged or there is no broker', async () => {
    appts.getAppointmentById.mockResolvedValue(appt);
    await put({ firstAppointmentDate: '2026-10-01', firstAppointmentTime: '10:00' });
    appts.getAppointmentById.mockResolvedValue({ ...appt, brokerId: null });
    await put({ firstAppointmentDate: '2026-10-05' });
    expect(appts.hasBrokerConflict).not.toHaveBeenCalled();
    expect(appts.updateAppointment).toHaveBeenCalledTimes(2);
  });
});

describe('appointment PUT closed lock', () => {
  it.each(['ClosedWon', 'ClosedLost', 'ReturnedToLeads'])('409s on a %s appointment without saving', async (status) => {
    appts.getAppointmentById.mockResolvedValue({ id: ID, agentId: 'a', brokerId: 'B1', status });
    const res = await put({ currentInsurer: 'X' });
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'This appointment is closed and locked. Reopen it before editing.' });
    expect(appts.updateAppointment).not.toHaveBeenCalled();
  });
});
