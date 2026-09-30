import { describe, it, expect, vi, beforeEach } from 'vitest';

// 30 Sep 2026 — I7: clearing a field is audited; sensitive ones stay sealed.
vi.mock('../middleware/auth.js', async (importOriginal) => ({ ...(await importOriginal()), validateToken: vi.fn() }));
vi.mock('../services/encryption.js', () => ({ encrypt: vi.fn(async (x) => 'ENC(' + x + ')') }));
vi.mock('../services/leadService.js', () => ({
  listLeads: vi.fn(), createLead: vi.fn(), listSources: vi.fn(), listMedicalSubscriptions: vi.fn(),
  createMedicalSubscription: vi.fn(), getLeadById: vi.fn(), updateLead: vi.fn(), deleteLead: vi.fn(),
  assignLead: vi.fn(), reopenLead: vi.fn(), logCallAttempt: vi.fn(), listCallAttempts: vi.fn(), findDuplicate: vi.fn(),
  getLeadDisplayNameById: vi.fn(),
}));
vi.mock('../services/appointmentService.js', () => ({
  listAppointments: vi.fn(), createAppointment: vi.fn(), getAppointmentById: vi.fn(),
  assignBroker: vi.fn(), reassignAppointment: vi.fn(), returnToLeads: vi.fn(),
  reopenAppointment: vi.fn(), saveOutcome: vi.fn(), claimAppointment: vi.fn(),
  listAvailableToClaim: vi.fn(), saveMeetingAttemptOutcome: vi.fn(), updateAppointment: vi.fn(),
  hasBrokerConflict: vi.fn(),
}));
vi.mock('../services/userService.js', async (importOriginal) => ({
  ...(await importOriginal()), getDirectReportIds: vi.fn(), getUserDisplayNameById: vi.fn(),
}));
vi.mock('../services/auditService.js', () => ({
  writeAuditLog: vi.fn(), clientIp: vi.fn(), listAuditLogForLead: vi.fn(), listAuditLogForAppointment: vi.fn(),
}));
vi.mock('../services/notificationService.js', () => ({ createNotification: vi.fn() }));
vi.mock('../services/systemConfigService.js', () => ({ getSystemConfig: vi.fn().mockResolvedValue({ value: 'assign' }) }));

import { validateToken } from '../middleware/auth.js';
import * as leads from '../services/leadService.js';
import * as appts from '../services/appointmentService.js';
import { writeAuditLog } from '../services/auditService.js';
import { handleLeadById } from './leadHandlers.js';
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

describe('clearing fields with null', () => {
  it('lead PUT: passes null to updateLead, audits plain clear, seals sensitive clear', async () => {
    validateToken.mockResolvedValue({ oid: 'admin', roles: ['Admin'] });
    leads.getLeadById.mockResolvedValue({ id: ID, assignedAgentId: 'a', pipelineStatus: 'New', whatsappNumber: '0821234567', policies: 'Gap cover', medicalAidProvider: 'Discovery' });
    leads.updateLead.mockResolvedValue(true);
    const res = mockRes();
    await handleLeadById({ method: 'PUT', body: { whatsappNumber: null, policies: null, medicalAidProvider: null }, query: {}, headers: {} }, res, ID);
    expect(res.statusCode).toBe(200);
    expect(leads.updateLead.mock.calls[0][1]).toEqual({ whatsappNumber: null, policies: null, medicalAidProvider: null });
    const { changeDetail } = writeAuditLog.mock.calls[0][0];
    expect(changeDetail.whatsappNumber).toEqual({ from: '0821234567', to: null });
    expect(changeDetail.policies).toEqual({ changed: true, sealed: 'ENC({"from":"Gap cover","to":null})' });
    expect(changeDetail.medicalAidProvider.sealed).toBe('ENC({"from":"Discovery","to":null})');
    expect(JSON.stringify(changeDetail.policies)).not.toMatch(/Gap cover"?\s*,\s*"to"/);
    expect(changeDetail.policies.from).toBeUndefined();
  });

  it('lead PUT: clearing an already-empty field is not an audit entry', async () => {
    validateToken.mockResolvedValue({ oid: 'admin', roles: ['Admin'] });
    leads.getLeadById.mockResolvedValue({ id: ID, assignedAgentId: 'a', pipelineStatus: 'New' });
    leads.updateLead.mockResolvedValue(true);
    const res = mockRes();
    await handleLeadById({ method: 'PUT', body: { whatsappNumber: null, policies: null }, query: {}, headers: {} }, res, ID);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('appointment PUT: null currentInsurer reaches the service and is audited sealed', async () => {
    validateToken.mockResolvedValue({ oid: 'admin', roles: ['Admin'] });
    appts.getAppointmentById.mockResolvedValue({ id: ID, status: 'Assigned', currentInsurer: 'Old Mutual', brokerId: null });
    appts.updateAppointment.mockResolvedValue(true);
    const res = mockRes();
    await handleAppointmentById({ method: 'PUT', body: { currentInsurer: null }, query: {}, headers: {} }, res, ID);
    expect(res.statusCode).toBe(200);
    expect(appts.updateAppointment.mock.calls[0][1]).toEqual({ currentInsurer: null });
    const { changeDetail } = writeAuditLog.mock.calls[0][0];
    expect(changeDetail.currentInsurer).toEqual({ changed: true, sealed: 'ENC({"from":"Old Mutual","to":null})' });
  });
});
