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
});
