import { describe, it, expect } from 'vitest';
import { buildRowJourney } from './leadRowModel.js';
import { toDay } from './leadJourneyModel.js';

// leadRowModel.test.js — 28 Sep 2026. The Leads list journey rules.
const T = toDay('2026-09-28');
const d = n => new Date(Date.UTC(2026, 8, 28 - n, 10)).toISOString();

describe('buildRowJourney', () => {
  it('quiet: last contact over 7 days ago on a lead still with the agent', () => {
    const r = buildRowJourney({ createdAt: d(21), pipelineStatus: 'Assigned', journey: { calls: [{ at: d(18), outcome: 'NoAnswer' }], lastCallAt: d(18), callCount: 1 } }, T);
    expect(r.caption).toEqual({ text: 'Quiet for 18 days', tone: 'quiet' });
    expect(r.calls).toEqual([{ ago: 18, reached: false }]);
  });
  it('recent call: not quiet, caption says when', () => {
    const r = buildRowJourney({ createdAt: d(14), pipelineStatus: 'InProgress', journey: { calls: [{ at: d(9), outcome: 'ClientContacted' }, { at: d(2), outcome: 'CallbackRequested' }], lastCallAt: d(2), callCount: 2 } }, T);
    expect(r.caption).toEqual({ text: 'Called 2 days ago', tone: 'accent' });
    expect(r.quiet).toBe(false);
  });
  it('booked with an open appointment: with the broker, never flagged quiet', () => {
    const r = buildRowJourney({ createdAt: d(26), pipelineStatus: 'AppointmentScheduled', journey: { calls: [{ at: d(23), outcome: 'AppointmentScheduled' }], lastCallAt: d(23), callCount: 1, bookedAt: d(19), apptStatus: 'InProgress' } }, T);
    expect(r.caption).toEqual({ text: 'Booked 19 days ago', tone: 'booked' });
    expect(r.quiet).toBe(false);
  });
  it('signed: outcome at closedAt', () => {
    const r = buildRowJourney({ createdAt: d(58), pipelineStatus: 'AppointmentScheduled', journey: { calls: [], lastCallAt: d(55), callCount: 2, bookedAt: d(54), apptStatus: 'ClosedWon', closedAt: d(31) } }, T);
    expect(r.caption).toEqual({ text: 'Signed 31 days ago', tone: 'won' });
    expect(r.outcome).toEqual({ kind: 'won', ago: 31 });
  });
  it('no call yet, and older than the window is clipped', () => {
    expect(buildRowJourney({ createdAt: d(3), pipelineStatus: 'Unassigned', journey: { calls: [], lastCallAt: null, callCount: 0 } }, T).caption)
      .toEqual({ text: 'No call yet', tone: 'muted' });
    expect(buildRowJourney({ createdAt: d(72), pipelineStatus: 'InProgress', journey: { calls: [{ at: d(8), outcome: 'ClientContacted' }], lastCallAt: d(8), callCount: 4 } }, T))
      .toMatchObject({ clipped: true, caption: { text: 'Quiet for 8 days', tone: 'quiet' } });
  });
  it('today and yesterday read naturally', () => {
    expect(buildRowJourney({ createdAt: d(5), pipelineStatus: 'Assigned', journey: { calls: [{ at: d(0), outcome: 'Voicemail' }], lastCallAt: d(0), callCount: 1 } }, T).caption.text).toBe('Called today');
  });
});
