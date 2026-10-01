import { describe, it, expect } from 'vitest';
import { buildLeadPath } from './leadPathModel.js';
import { toDay } from './leadJourneyModel.js';

// leadPathModel.test.js — 1 Oct 2026. The rules behind Lead Detail's journey
// hero (calls, booking, the latest appointment's meetings, the two bands).
const person = { firstName: 'Naledi', lastName: 'Mokoena', agentName: 'Thabo Molefe', sourceLabel: 'SAMA list' };

describe('buildLeadPath', () => {
  it('(a) the canvas example: four calls, booked on day 12, a reschedule, second meeting ahead', () => {
    const p = buildLeadPath({
      lead: { ...person, createdAt: '2026-08-02T08:00:00Z', updatedAt: '2026-08-14T10:00:00Z', pipelineStatus: 'AppointmentScheduled' },
      calls: [
        { attemptedAt: '2026-08-14T09:30:00Z', outcome: 'AppointmentScheduled' },
        { attemptedAt: '2026-08-04T09:00:00Z', outcome: 'NoAnswer' },
        { attemptedAt: '2026-08-06T09:00:00Z', outcome: 'Voicemail' },
        { attemptedAt: '2026-08-11T09:00:00Z', outcome: 'CallbackRequested', callbackDateTime: '2026-08-14T09:00:00Z' },
      ],
      appointments: [{ id: 'a1', createdAt: '2026-08-14T10:00:00Z', status: 'InProgress' }],
      latestAppt: {
        id: 'a1', status: 'InProgress', firstName: 'Naledi', lastName: 'Mokoena',
        leadCreatedAt: '2026-08-02T08:00:00Z', bookedAt: '2026-08-14T10:00:00Z',
        agentName: 'Thabo Molefe', brokerName: 'Anika van der Merwe',
        meetingAttempts: [
          { meetingNumber: 1, status: 'Rescheduled', date: '2026-08-21', createdAt: '2026-08-15T10:00:00Z' },
          { meetingNumber: 1, status: 'HeldInterested', date: '2026-08-28', createdAt: '2026-08-28T12:00:00Z' },
          { meetingNumber: 2, status: 'Scheduled', date: '2026-10-07', createdAt: '2026-08-29T08:00:00Z' },
        ],
      },
    }, toDay('2026-09-30'));
    expect(p.title).toBe('Day 59: second meeting on 7 Oct');
    expect(p.subtitle).toBe('Reached on the third of four calls and booked by Thabo Molefe on day 12. One meeting held with Anika van der Merwe, with 1 reschedule along the way.');
    expect(p.spans[0].long).toBe('12 days, 4 calls to book');
    expect(p.spans.map(s => s.long)).toEqual(['12 days, 4 calls to book', '14 days to meet, 1 reschedule', '33 days since']);
    expect(p.bands.map(b => [b.from, b.to, b.label])).toEqual([
      [0, 12, 'With the agent · 12 days'],
      [12, 59, 'With the broker · Anika van der Merwe · 47 days so far'],
    ]);
    const calls = p.events.filter(e => e.kind === 'call');
    expect(calls.map(e => [e.title, e.tone])).toEqual([['Call 1', 'missed'], ['Call 2', 'missed'], ['Call 3', 'reached'], ['Call 4', 'reached']]);
    expect(calls[2]).toMatchObject({ rel: 9, detail: 'Callback requested', callbackDn: toDay('2026-08-14') });
    expect(p.events.map(e => e.key)).toEqual(['lead', 'c1', 'c2', 'c3', 'c4', 'booked', 'm1-0', 'm1', 'm2']);
    expect(p.events[0]).toMatchObject({ title: 'Lead created', detail: 'SAMA list' });
    expect(p.todayRel).toBe(59);
    expect(p.open).toBe(true);
  });

  it('(b) no calls, no appointments: just the lead, not booked yet', () => {
    const p = buildLeadPath({
      lead: { ...person, createdAt: '2026-09-20T08:00:00Z', updatedAt: '2026-09-20T08:00:00Z', pipelineStatus: 'Unassigned' },
      calls: [], appointments: [], latestAppt: null,
    }, toDay('2026-09-30'));
    expect(p.events.map(e => e.key)).toEqual(['lead']);
    expect(p.title).toBe('Day 10, not booked yet');
    expect(p.subtitle).toBe('No calls yet.');
    expect(p.bands.map(b => b.label)).toEqual(['With the agent · 10 days']);
    expect(p.open).toBe(true);
  });

  it('(c) a Closed lead with no appointment ends "Closed" at updatedAt', () => {
    const p = buildLeadPath({
      lead: { ...person, createdAt: '2026-09-01T08:00:00Z', updatedAt: '2026-09-10T12:00:00Z', pipelineStatus: 'Closed' },
      calls: [
        { attemptedAt: '2026-09-02T09:00:00Z', outcome: 'NoAnswer' },
        { attemptedAt: '2026-09-09T09:00:00Z', outcome: 'NotInterested' },
      ],
      appointments: [], latestAppt: null,
    }, toDay('2026-09-30'));
    expect(p.events.at(-1)).toMatchObject({ key: 'outcome', kind: 'outcome', title: 'Closed', rel: 9 });
    expect(p.title).toBe('Closed after 9 days');
    expect(p.open).toBe(false);
    expect(p.todayRel).toBe(null);
    expect(p.bands.map(b => [b.from, b.to, b.label])).toEqual([[0, 9, 'With the agent · 9 days']]);
  });

  it('(d) a reopened lead with two appointments: meetings from the newest only, booked at its createdAt', () => {
    const p = buildLeadPath({
      lead: { ...person, createdAt: '2026-08-01T08:00:00Z', updatedAt: '2026-09-01T10:00:00Z', pipelineStatus: 'AppointmentScheduled' },
      calls: [{ attemptedAt: '2026-08-04T09:00:00Z', outcome: 'AppointmentScheduled' }, { attemptedAt: '2026-09-01T09:00:00Z', outcome: 'AppointmentScheduled' }],
      appointments: [
        { id: 'a1', createdAt: '2026-09-01T10:00:00Z', status: 'InProgress' },
        { id: 'a0', createdAt: '2026-08-04T10:00:00Z', status: 'ClosedLost' },
      ],
      latestAppt: {
        id: 'a1', status: 'InProgress', leadCreatedAt: '2026-08-01T08:00:00Z', bookedAt: '2026-09-01T10:00:00Z',
        agentName: 'Thabo Molefe', brokerName: 'Anika van der Merwe',
        meetingAttempts: [{ meetingNumber: 1, status: 'HeldInterested', date: '2026-09-08', createdAt: '2026-09-08T12:00:00Z' }],
      },
    }, toDay('2026-09-30'));
    expect(p.events.filter(e => e.key === 'booked').map(e => e.rel)).toEqual([31]);
    expect(p.events.filter(e => e.key.startsWith('m')).map(e => [e.key, e.rel])).toEqual([['m1', 38]]);
    expect(p.bands.map(b => b.label)).toEqual(['With the agent · 31 days', 'With the broker · Anika van der Merwe · 29 days so far']);
  });

  // 1 Oct 2026 — fix round 1 (controller ruling): a lead back with the agent after
  // its latest appointment was returned or lost keeps an OPEN journey.
  const reopenedBase = (status, extra = {}) => ({
    lead: { ...person, createdAt: '2026-08-01T08:00:00Z', updatedAt: '2026-09-15T10:00:00Z', pipelineStatus: 'InProgress' },
    calls: [{ attemptedAt: '2026-08-04T09:00:00Z', outcome: 'AppointmentScheduled' }],
    appointments: [{ id: 'a1', createdAt: '2026-08-04T10:00:00Z', status }],
    latestAppt: {
      id: 'a1', status, leadCreatedAt: '2026-08-01T08:00:00Z', bookedAt: '2026-08-04T10:00:00Z', closedAt: '2026-09-14T10:00:00Z',
      agentName: 'Thabo Molefe', brokerName: 'Anika van der Merwe', meetingAttempts: [], ...extra,
    },
  });

  it('(e) reopened after Returned to leads: the return is a marker, the journey stays open, back with the agent', () => {
    const p = buildLeadPath(reopenedBase('ReturnedToLeads'), toDay('2026-09-30'));
    const m = p.events.find(e => e.key === 'outcome');
    expect(m).toMatchObject({ kind: 'marker', tone: 'returned', title: 'Returned to leads', rel: 44 });
    expect(p.open).toBe(true);
    expect(p.todayRel).toBe(60);
    expect(p.title).toBe('Day 60, back with the agent');
    expect(p.bands.map(b => [b.from, b.to, b.label])).toEqual([
      [0, 3, 'With the agent · 3 days'],
      [3, 44, 'With the broker · Anika van der Merwe · 41 days'],
      [44, 60, 'Back with the agent · 16 days so far'],
    ]);
    expect(p.spans.at(-1)).toMatchObject({ from: 44, to: 60, long: '16 days since' });
  });

  it('(e) reopened after Closed Lost: a "Lost: <reason>" marker, open journey', () => {
    const p = buildLeadPath(reopenedBase('ClosedLost', { lostReasonLabel: 'Chose a competitor' }), toDay('2026-09-30'));
    expect(p.events.find(e => e.key === 'outcome')).toMatchObject({ kind: 'marker', tone: 'lost', title: 'Lost: Chose a competitor' });
    expect(p.open).toBe(true);
    expect(p.title).toBe('Day 60, back with the agent');
    expect(p.bands).toHaveLength(3);
  });

  it('a Closed Lost appointment on a lead that is still Closed keeps its outcome', () => {
    const args = reopenedBase('ClosedLost', { lostReasonLabel: 'Chose a competitor' });
    const p = buildLeadPath({ ...args, lead: { ...args.lead, pipelineStatus: 'Closed' } }, toDay('2026-09-30'));
    expect(p.events.at(-1)).toMatchObject({ kind: 'outcome', title: 'Lost' });
    expect(p.open).toBe(false);
    expect(p.title).toBe('Lost after 44 days');
  });

  it('detail fetch failed (latestAppt null): the list row places a closed outcome at its closedAt, not today', () => {
    const p = buildLeadPath({
      lead: { ...person, createdAt: '2026-08-01T08:00:00Z', updatedAt: '2026-09-14T10:00:00Z', pipelineStatus: 'Closed' },
      calls: [],
      appointments: [{ id: 'a1', createdAt: '2026-08-04T10:00:00Z', status: 'ClosedLost', closedAt: '2026-09-14T10:00:00Z', updatedAt: '2026-09-14T10:00:00Z', brokerName: 'Anika van der Merwe' }],
      latestAppt: null,
    }, toDay('2026-09-30'));
    expect(p.events.find(e => e.key === 'booked').rel).toBe(3);
    expect(p.events.at(-1)).toMatchObject({ kind: 'outcome', rel: 44 });
  });

  it('detail fetch failed and the list row has no dates: lead stage plus "Appointment booked" only', () => {
    const p = buildLeadPath({
      lead: { ...person, createdAt: '2026-08-01T08:00:00Z', updatedAt: '2026-08-04T10:00:00Z', pipelineStatus: 'AppointmentScheduled' },
      calls: [],
      appointments: [{ id: 'a1', createdAt: '2026-08-04T10:00:00Z', status: 'ClosedWon' }],
      latestAppt: null,
    }, toDay('2026-09-30'));
    expect(p.events.map(e => e.key)).toEqual(['lead', 'booked']);
    expect(p.open).toBe(true);
  });

  it('booked though no call reached the client: "Booked by X on day N after K unanswered calls."', () => {
    const p = buildLeadPath({
      lead: { ...person, createdAt: '2026-08-01T08:00:00Z', updatedAt: '2026-08-04T10:00:00Z', pipelineStatus: 'AppointmentScheduled' },
      calls: [{ attemptedAt: '2026-08-02T09:00:00Z', outcome: 'NoAnswer' }, { attemptedAt: '2026-08-03T09:00:00Z', outcome: 'Voicemail' }],
      appointments: [{ id: 'a1', createdAt: '2026-08-04T10:00:00Z', status: 'Assigned' }],
      latestAppt: { id: 'a1', status: 'Assigned', agentName: 'Thabo Molefe', meetingAttempts: [] },
    }, toDay('2026-09-30'));
    expect(p.subtitle).toBe('Booked by Thabo Molefe on day 3 after two unanswered calls.');
  });
});
