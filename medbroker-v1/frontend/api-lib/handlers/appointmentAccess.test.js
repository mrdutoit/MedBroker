import { describe, it, expect, vi, beforeEach } from 'vitest';

// 30 Sep 2026 — keep the real isAgentOnly/isSupervisorOnly; only stub the DB lookup.
vi.mock('../services/userService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDirectReportIds: vi.fn(),
}));

import { getDirectReportIds } from '../services/userService.js';
import { assertAppointmentAccess, assertLeadBookable } from './appointmentAccess.js';

beforeEach(() => {
  getDirectReportIds.mockReset();
  getDirectReportIds.mockResolvedValue(['agent-report']);
});

const claims = (roles, oid = 'me') => ({ oid, roles });

describe('assertAppointmentAccess', () => {
  it('lets an Agent touch their own appointment', async () => {
    await expect(assertAppointmentAccess(claims(['Agent']), { agentId: 'me', brokerId: null })).resolves.toBeUndefined();
  });
  it('rejects an Agent on another agent\'s appointment', async () => {
    await expect(assertAppointmentAccess(claims(['Agent']), { agentId: 'other' })).rejects.toMatchObject({ status: 403 });
  });
  it('lets a Broker touch their own appointment', async () => {
    await expect(assertAppointmentAccess(claims(['Broker']), { brokerId: 'me' })).resolves.toBeUndefined();
  });
  it('rejects a Broker when the appointment has no broker', async () => {
    await expect(assertAppointmentAccess(claims(['Broker']), { brokerId: null })).rejects.toMatchObject({ status: 403 });
  });
  it('lets a Supervisor touch a direct report\'s appointment', async () => {
    await expect(assertAppointmentAccess(claims(['Supervisor']), { agentId: 'agent-report' })).resolves.toBeUndefined();
  });
  it('rejects a Supervisor for an agent outside their team', async () => {
    await expect(assertAppointmentAccess(claims(['Supervisor']), { agentId: 'stranger' })).rejects.toMatchObject({ status: 403 });
  });
  it('lets GlobalAdmin through without a team lookup', async () => {
    await expect(assertAppointmentAccess(claims(['GlobalAdmin']), { agentId: 'x', brokerId: 'y' })).resolves.toBeUndefined();
    expect(getDirectReportIds).not.toHaveBeenCalled();
  });
});

describe('assertLeadBookable', () => {
  it('lets an Agent book their own lead', async () => {
    await expect(assertLeadBookable(claims(['Agent']), { assignedAgentId: 'me' })).resolves.toBeUndefined();
  });
  it('rejects an Agent booking another agent\'s lead', async () => {
    await expect(assertLeadBookable(claims(['Agent']), { assignedAgentId: 'other' })).rejects.toMatchObject({ status: 403 });
  });
  it('lets a Supervisor book a direct report\'s lead', async () => {
    await expect(assertLeadBookable(claims(['Supervisor']), { assignedAgentId: 'agent-report' })).resolves.toBeUndefined();
  });
  it('rejects a Supervisor booking a lead outside their team', async () => {
    await expect(assertLeadBookable(claims(['Supervisor']), { assignedAgentId: 'stranger' })).rejects.toMatchObject({ status: 403 });
  });
  it('rejects a Supervisor booking an unassigned lead', async () => {
    await expect(assertLeadBookable(claims(['Supervisor']), { assignedAgentId: null })).rejects.toMatchObject({ status: 403 });
  });
  it('lets Admin book any lead', async () => {
    await expect(assertLeadBookable(claims(['Admin']), { assignedAgentId: 'other' })).resolves.toBeUndefined();
  });
});
