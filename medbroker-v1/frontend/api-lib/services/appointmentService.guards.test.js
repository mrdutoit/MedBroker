import { describe, it, expect, vi, beforeEach } from 'vitest';

// 30 Sep 2026 — Task 8: appointment lifecycle guards (I5, I8–I11, I18).
vi.mock('./db.js', () => ({
  sql: new Proxy({}, { get: () => { const m = () => m; m.MAX = 'MAX'; return m; } }),
  executeQuery: vi.fn(),
  executeQueryOne: vi.fn(),
}));
vi.mock('./userService.js', () => ({
  getActiveUserById: vi.fn(), resolvePortfolioIds: vi.fn(), findLeastLoadedSupervisorForRegion: vi.fn(),
}));
vi.mock('./taskService.js', () => ({
  createTask: vi.fn(), deleteTasksForEntity: vi.fn(), reassignTasksForEntity: vi.fn(),
}));
vi.mock('./notificationService.js', () => ({ createNotification: vi.fn() }));
vi.mock('./tokenService.js', () => ({ debitTokensForClaim: vi.fn(), refundTokens: vi.fn() }));
vi.mock('./flagService.js', () => ({ getFlagMeta: vi.fn() }));
vi.mock('./systemConfigService.js', () => ({ getSystemConfig: vi.fn().mockResolvedValue({ defaultClaimTokenCost: 1 }) }));

import { executeQuery, executeQueryOne } from './db.js';
import { getActiveUserById, resolvePortfolioIds } from './userService.js';
import { deleteTasksForEntity } from './taskService.js';
import { createNotification } from './notificationService.js';
import { debitTokensForClaim } from './tokenService.js';
import { getFlagMeta } from './flagService.js';
import {
  assignBroker, reassignAppointment, returnToLeads, claimAppointment,
  updateAppointment, createAppointment, saveMeetingAttemptOutcome,
} from './appointmentService.js';

let calls;
let one; // regex -> row (first match wins) for executeQueryOne
let many; // regex -> rows for executeQuery
let claimMode;

const rec = (query, params) => calls.push({ query, params });
const writes = () => calls.filter((c) => /^\s*(UPDATE|INSERT|DELETE)/i.test(c.query));

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  one = [];
  many = [];
  claimMode = 'assign';
  getActiveUserById.mockResolvedValue({ id: 'B2', displayName: 'Bea' });
  resolvePortfolioIds.mockResolvedValue(['P1']);
  getFlagMeta.mockImplementation(async (key) => (key === 'appointments.claimModel' ? { value: claimMode } : null));
  executeQueryOne.mockImplementation(async (query, params) => {
    rec(query, params);
    const hit = one.find(([re]) => re.test(query));
    return hit ? hit[1] : null;
  });
  executeQuery.mockImplementation(async (query, params) => {
    rec(query, params);
    const hit = many.find(([re]) => re.test(query));
    return hit ? hit[1] : [];
  });
});

async function rejects(p) {
  try { await p; } catch (e) { return e; }
  throw new Error('expected rejection');
}

describe('assignBroker (I8a)', () => {
  it('404s when the appointment does not exist, before any write', async () => {
    const err = await rejects(assignBroker('AP1', 'B2'));
    expect(err).toEqual({ status: 404, message: 'Appointment not found' });
    expect(writes()).toHaveLength(0);
  });

  it('only assigns an Unassigned appointment; otherwise 409 and no side effects', async () => {
    one.push([/SELECT a\.firstAppointmentDate/, { firstAppointmentDate: '2026-10-01', firstAppointmentTime: '10:00' }]);
    const err = await rejects(assignBroker('AP1', 'B2'));
    expect(err).toEqual({ status: 409, message: 'This appointment already has a broker or is closed.' });
    const upd = calls.find((c) => /UPDATE Appointment/.test(c.query));
    expect(upd.query).toMatch(/AND status = 'Unassigned'/);
    expect(deleteTasksForEntity).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe('reassignAppointment (I8b)', () => {
  it.each(['ClosedWon', 'ClosedLost', 'ReturnedToLeads'])('rejects a %s appointment with 409', async (status) => {
    one.push([/FROM Appointment WHERE id/, { status, brokerId: 'B1', agentId: 'A1' }]);
    const err = await rejects(reassignAppointment('AP1', { brokerId: 'B2' }));
    expect(err).toEqual({ status: 409, message: 'This appointment is closed and cannot be reassigned.' });
    expect(writes()).toHaveLength(0);
  });

  it('rejects a null broker with 400', async () => {
    one.push([/FROM Appointment WHERE id/, { status: 'Assigned', brokerId: 'B1', agentId: 'A1' }]);
    const err = await rejects(reassignAppointment('AP1', { brokerId: null }));
    expect(err).toEqual({ status: 400, message: 'A broker is required.' });
    expect(writes()).toHaveLength(0);
  });

  it('in claim mode, refuses to put a broker on an Unassigned appointment', async () => {
    claimMode = 'claim';
    one.push([/FROM Appointment WHERE id/, { status: 'Unassigned', brokerId: null, agentId: 'A1' }]);
    const err = await rejects(reassignAppointment('AP1', { brokerId: 'B2' }));
    expect(err).toEqual({ status: 409, message: 'Use the claim queue for unassigned appointments.' });
    expect(writes()).toHaveLength(0);
  });

  it('in assign mode, moves an Unassigned appointment to Assigned', async () => {
    one.push([/FROM Appointment WHERE id/, { status: 'Unassigned', brokerId: null, agentId: 'A1' }]);
    one.push([/UPDATE Appointment/, { id: 'AP1' }]);
    await reassignAppointment('AP1', { brokerId: 'B2' });
    const upd = calls.find((c) => /UPDATE Appointment/.test(c.query));
    expect(upd.query).toMatch(/status = 'Assigned'/);
    expect(upd.query).toMatch(/AND status = 'Unassigned'/);
  });

  it('in assign mode, 409s if the Unassigned appointment was taken meanwhile', async () => {
    one.push([/FROM Appointment WHERE id/, { status: 'Unassigned', brokerId: null, agentId: 'A1' }]);
    const err = await rejects(reassignAppointment('AP1', { brokerId: 'B2' }));
    expect(err).toEqual({ status: 409, message: 'This appointment already has a broker or is closed.' });
    expect(deleteTasksForEntity).not.toHaveBeenCalled();
  });

  it('keeps the status of a Claimed appointment', async () => {
    one.push([/FROM Appointment WHERE id/, { status: 'Claimed', brokerId: 'B1', agentId: 'A1' }]);
    one.push([/UPDATE Appointment/, { id: 'AP1' }]);
    await reassignAppointment('AP1', { brokerId: 'B2' });
    const upd = calls.find((c) => /UPDATE Appointment/.test(c.query));
    expect(upd.query).not.toMatch(/status = 'Assigned'/);
  });
});

describe('returnToLeads (I8c)', () => {
  it.each(['ClosedWon', 'ClosedLost', 'ReturnedToLeads'])('rejects a %s appointment with 409', async (status) => {
    one.push([/FROM Appointment WHERE id/, { id: 'AP1', leadId: 'L1', customerSigned: null, status }]);
    const err = await rejects(returnToLeads('AP1'));
    expect(err).toEqual({ status: 409, message: 'This appointment is closed and cannot be returned.' });
    expect(writes()).toHaveLength(0);
    expect(deleteTasksForEntity).not.toHaveBeenCalled();
  });

  it('returns an open appointment', async () => {
    one.push([/FROM Appointment WHERE id/, { id: 'AP1', leadId: 'L1', customerSigned: null, status: 'Claimed' }]);
    one.push([/UPDATE Appointment/, { id: 'AP1' }]);
    await returnToLeads('AP1');
    expect(calls.some((c) => /UPDATE Lead/.test(c.query))).toBe(true);
  });
});

describe('claimAppointment (I9)', () => {
  const base = { status: 'Unassigned', claimTokenCost: 2, agentId: 'A1', firstAppointmentDate: '2026-10-01', firstAppointmentTime: '10:00', regionEligible: true, productsInterestedIn: '["Gap"]' };

  it('rejects a double-booking with 409 before any debit', async () => {
    one.push([/FROM Appointment a LEFT JOIN Lead/, base]);
    one.push([/SELECT id FROM Appointment\s+WHERE brokerId/, { id: 'OTHER' }]);
    many.push([/FROM BrokerProduct/, [{ name: 'Gap' }]]);
    const err = await rejects(claimAppointment('AP1', 'B1'));
    expect(err).toEqual({ status: 409, message: 'You already have an appointment at that time.' });
    const conflict = calls.find((c) => /SELECT id FROM Appointment\s+WHERE brokerId/.test(c.query));
    expect(conflict.params.excludeId.value).toBe('AP1');
    expect(debitTokensForClaim).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });

  it('rejects a broker outside the region with 403 before any debit', async () => {
    one.push([/FROM Appointment a LEFT JOIN Lead/, { ...base, regionEligible: false }]);
    many.push([/FROM BrokerProduct/, [{ name: 'Gap' }]]);
    const err = await rejects(claimAppointment('AP1', 'B1'));
    expect(err).toEqual({ status: 403, message: 'You are not eligible for this appointment.' });
    expect(debitTokensForClaim).not.toHaveBeenCalled();
  });

  it('rejects a broker without a matching product with 403 before any debit', async () => {
    one.push([/FROM Appointment a LEFT JOIN Lead/, base]);
    many.push([/FROM BrokerProduct/, [{ name: 'Hospital' }]]);
    const err = await rejects(claimAppointment('AP1', 'B1'));
    expect(err).toEqual({ status: 403, message: 'You are not eligible for this appointment.' });
    expect(debitTokensForClaim).not.toHaveBeenCalled();
  });

  it('claims when free and eligible', async () => {
    one.push([/FROM Appointment a LEFT JOIN Lead/, base]);
    one.push([/UPDATE Appointment/, { id: 'AP1' }]);
    many.push([/FROM BrokerProduct/, [{ name: 'Gap' }]]);
    await claimAppointment('AP1', 'B1');
    expect(debitTokensForClaim).toHaveBeenCalledWith('B1', 'AP1', 2);
  });
});

describe('updateAppointment meeting-1 sync (I10)', () => {
  it('moves meeting 1 when the first appointment date changes', async () => {
    await updateAppointment('AP1', { firstAppointmentDate: '2026-11-05' });
    const sync = calls.find((c) => /UPDATE MeetingAttempt/.test(c.query));
    expect(sync.query).toMatch(/meetingNumber = 1/);
    expect(sync.query).toMatch(/status = 'Scheduled'/);
    expect(sync.query).toMatch(/recordedById IS NULL/);
    expect(sync.params.date.value).toBe('2026-11-05');
  });

  it('leaves meeting attempts alone when the date is not in the edit', async () => {
    await updateAppointment('AP1', { currentInsurer: 'X' });
    expect(calls.some((c) => /UPDATE MeetingAttempt/.test(c.query))).toBe(false);
  });
});

describe('createAppointment (I11)', () => {
  it.each(['New', 'Closed', 'AppointmentScheduled'])('refuses to book on a %s lead', async (pipelineStatus) => {
    one.push([/FROM Lead l/, { assignedAgentId: 'A1', pipelineStatus, region: 'GP' }]);
    const err = await rejects(createAppointment({
      leadId: 'L1', portfolios: ['Health'], firstAppointmentDate: '2026-10-01', firstAppointmentTime: '10:00', meetingType: 'Virtual',
    }));
    expect(err).toEqual({ status: 409, message: 'This lead is not open for booking.' });
    expect(writes()).toHaveLength(0);
  });
});

describe('saveMeetingAttemptOutcome (I5, I18)', () => {
  const staff = (apptRow, attemptRow) => {
    one.push([/SELECT id, status, organisationId, brokerId/, apptRow]);
    one.push([/SELECT id, meetingNumber/, attemptRow]);
  };

  it('does not attach the staff caller when the attempt is already recorded', async () => {
    staff({ id: 'AP1', status: 'Unassigned', brokerId: null }, { id: 'M1', meetingNumber: 1, status: 'HeldInterested' });
    const err = await rejects(saveMeetingAttemptOutcome('AP1', 'M1', { status: 'HeldInterested', date: '2026-10-01' }, 'S1', true));
    expect(err).toEqual({ status: 409, message: 'This meeting has already been recorded.' });
    expect(writes()).toHaveLength(0);
    expect(deleteTasksForEntity).not.toHaveBeenCalled();
  });

  it('409s when a concurrent save already recorded the attempt, with no follow-up row', async () => {
    staff({ id: 'AP1', status: 'Assigned', brokerId: 'B1' }, { id: 'M1', meetingNumber: 1, status: 'Scheduled' });
    const err = await rejects(saveMeetingAttemptOutcome('AP1', 'M1', { status: 'Rescheduled', date: '2026-10-01' }, 'B1'));
    expect(err).toEqual({ status: 409, message: 'This meeting has already been recorded.' });
    const upd = calls.find((c) => /UPDATE MeetingAttempt/.test(c.query));
    expect(upd.query).toMatch(/AND status = 'Scheduled'/);
    expect(upd.query).toMatch(/RETURNING id/);
    expect(calls.some((c) => /INSERT INTO MeetingAttempt/.test(c.query))).toBe(false);
  });

  it('staff attach only fills an empty broker slot', async () => {
    staff({ id: 'AP1', status: 'Unassigned', brokerId: null }, { id: 'M1', meetingNumber: 1, status: 'Scheduled' });
    one.push([/UPDATE MeetingAttempt/, { id: 'M1' }]);
    one.push([/UPDATE Appointment SET brokerId/, { id: 'AP1' }]);
    const r = await saveMeetingAttemptOutcome('AP1', 'M1', { status: 'HeldNotInterested', date: '2026-10-01' }, 'S1', true);
    const upd = calls.find((c) => /UPDATE Appointment SET brokerId/.test(c.query));
    expect(upd.query).toMatch(/AND brokerId IS NULL/);
    expect(r.brokerAssignedId).toBe('S1');
  });

  it('moves a Claimed appointment to InProgress when meeting 1 is held', async () => {
    staff({ id: 'AP1', status: 'Claimed', brokerId: 'B1' }, { id: 'M1', meetingNumber: 1, status: 'Scheduled' });
    one.push([/UPDATE MeetingAttempt/, { id: 'M1' }]);
    const r = await saveMeetingAttemptOutcome('AP1', 'M1', { status: 'HeldNotInterested', date: '2026-10-01' }, 'B1');
    expect(r.appointmentStatus).toBe('InProgress');
  });
});
