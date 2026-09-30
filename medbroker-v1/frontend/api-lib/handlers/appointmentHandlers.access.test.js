import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  validateToken: vi.fn(),
}));
vi.mock('../services/appointmentService.js', () => ({
  listAppointments: vi.fn(), createAppointment: vi.fn(), getAppointmentById: vi.fn(),
  assignBroker: vi.fn(), reassignAppointment: vi.fn(), returnToLeads: vi.fn(),
  reopenAppointment: vi.fn(), saveOutcome: vi.fn(), claimAppointment: vi.fn(),
  listAvailableToClaim: vi.fn(), saveMeetingAttemptOutcome: vi.fn(), updateAppointment: vi.fn(),
}));
vi.mock('../services/userService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDirectReportIds: vi.fn(),
  getUserDisplayNameById: vi.fn(),
}));
vi.mock('../services/leadService.js', () => ({
  getLeadById: vi.fn(), getLeadDisplayNameById: vi.fn(),
}));
vi.mock('../services/auditService.js', () => ({
  writeAuditLog: vi.fn(), clientIp: vi.fn(), listAuditLogForAppointment: vi.fn(),
}));
vi.mock('../services/systemConfigService.js', () => ({
  getSystemConfig: vi.fn().mockResolvedValue({ value: 'assign' }),
}));

import { validateToken } from '../middleware/auth.js';
import * as appts from '../services/appointmentService.js';
import { getDirectReportIds } from '../services/userService.js';
import { getLeadById } from '../services/leadService.js';
import {
  handleAppointmentsCollection, handleAppointmentOutcome, handleSaveMeetingAttempt,
  handleAppointmentReassign,
} from './appointmentHandlers.js';

const ID = '11111111-1111-4111-8111-111111111111';
const ATT = '22222222-2222-4222-8222-222222222222';
const LEAD = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (n) => { res.statusCode = n; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = () => res;
  return res;
}
const req = (method, body = {}) => ({ method, body, query: {}, headers: {} });

beforeEach(() => {
  vi.clearAllMocks();
  getDirectReportIds.mockResolvedValue([]);
});

describe('appointment write scope', () => {
  it('outcome: Agent not owning the appointment gets 403 and nothing is saved', async () => {
    validateToken.mockResolvedValue({ oid: 'agent-a', roles: ['Agent'] });
    appts.getAppointmentById.mockResolvedValue({ id: ID, agentId: 'agent-b', brokerId: null });
    const res = mockRes();
    await handleAppointmentOutcome(req('POST', { customerSigned: true }), res, ID);
    expect(res.statusCode).toBe(403);
    expect(appts.saveOutcome).not.toHaveBeenCalled();
  });

  it('meeting-attempt: Broker on an appointment with no broker gets 403', async () => {
    validateToken.mockResolvedValue({ oid: 'broker-a', roles: ['Broker'] });
    appts.getAppointmentById.mockResolvedValue({ id: ID, agentId: 'agent-b', brokerId: null });
    const res = mockRes();
    await handleSaveMeetingAttempt(req('POST', { status: 'HeldInterested' }), res, ID, ATT);
    expect(res.statusCode).toBe(403);
    expect(appts.saveMeetingAttemptOutcome).not.toHaveBeenCalled();
  });

  it('meeting-attempt: unknown appointment gets 404', async () => {
    validateToken.mockResolvedValue({ oid: 'admin', roles: ['Admin'] });
    appts.getAppointmentById.mockResolvedValue(null);
    const res = mockRes();
    await handleSaveMeetingAttempt(req('POST', { status: 'HeldInterested' }), res, ID, ATT);
    expect(res.statusCode).toBe(404);
  });

  it('reassign: Supervisor moving an appointment to an agent outside their team gets 403', async () => {
    validateToken.mockResolvedValue({ oid: 'sup', roles: ['Supervisor'] });
    getDirectReportIds.mockResolvedValue(['agent-mine']);
    appts.getAppointmentById.mockResolvedValue({ id: ID, agentId: 'agent-mine', brokerId: null });
    const res = mockRes();
    await handleAppointmentReassign(req('PUT', { agentId: OTHER }), res, ID);
    expect(res.statusCode).toBe(403);
    expect(appts.reassignAppointment).not.toHaveBeenCalled();
  });

  it('create: Agent booking another agent\'s lead gets 403 and nothing is created', async () => {
    validateToken.mockResolvedValue({ oid: 'agent-a', roles: ['Agent'] });
    getLeadById.mockResolvedValue({ id: LEAD, assignedAgentId: 'agent-b' });
    const res = mockRes();
    await handleAppointmentsCollection(req('POST', {
      leadId: LEAD, portfolios: ['Medical'], firstAppointmentDate: '2026-10-05',
      firstAppointmentTime: '10:00', meetingType: 'Virtual', virtualMeetingLink: 'https://x.test/m',
      productsInterestedIn: ['Gap cover'],
    }), res);
    expect(res.statusCode).toBe(403);
    expect(appts.createAppointment).not.toHaveBeenCalled();
  });
});
