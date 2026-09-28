import { describe, it, expect } from 'vitest';
import { buildJourney, toDay } from './leadJourneyModel.js';

// leadJourneyModel.test.js — 28 Sep 2026. The date and status rules behind
// Appointment Detail's LeadJourney, tested without a browser.
const T = toDay('2026-09-28');
const base = { firstName: 'Anna', lastName: 'van Wyk', agentName: 'Thandi Mokoena', brokerName: 'Werner Hattingh', source: 'Referral' };

describe('buildJourney', () => {
  it('open deal: reschedule marker, held meeting, future meeting beyond today', () => {
    const j = buildJourney({
      ...base, status: 'InProgress', leadCreatedAt: '2026-09-02T08:00:00Z', bookedAt: '2026-09-09T09:00:00Z',
      meetingAttempts: [
        { meetingNumber: 1, status: 'Rescheduled', date: '2026-09-11', createdAt: '2026-09-10T10:00:00Z' },
        { meetingNumber: 1, status: 'HeldInterested', date: '2026-09-16', createdAt: '2026-09-16T12:00:00Z' },
        { meetingNumber: 2, status: 'Scheduled', date: '2026-10-03', createdAt: '2026-09-17T08:00:00Z' },
      ],
    }, T);
    expect(j.title).toBe('Day 26: second meeting on 3 Oct');
    expect(j.todayRel).toBe(26);
    expect(j.events.map(e => [e.key, e.kind, e.rel])).toEqual([
      ['lead', 'major', 0], ['booked', 'major', 7], ['m1-0', 'marker', 9], ['m1', 'major', 14], ['m2', 'planned', 31],
    ]);
    expect(j.spans.map(s => s.long)).toEqual(['7 days to book', '7 days to meet, 1 reschedule', '12 days since']);
    expect(j.subtitle).toBe('Booked by Thandi Mokoena on day 7. One meeting held with Werner Hattingh, with 1 reschedule along the way.');
  });

  it('signed: outcome at closedAt with value and products; cancellation counted in its stretch', () => {
    const j = buildJourney({
      ...base, status: 'ClosedWon', leadCreatedAt: '2026-08-04', bookedAt: '2026-08-11', closedAt: '2026-08-29T10:00:00Z',
      productsSold: [{ product: 'A', value: 920000 }, { product: 'B', value: 210000 }, { product: 'C', value: 110000 }],
      meetingAttempts: [
        { meetingNumber: 1, status: 'HeldInterested', date: '2026-08-14', createdAt: '2026-08-14T12:00:00Z' },
        { meetingNumber: 2, status: 'Cancelled', cancelReason: 'SchedulingConflict', date: '2026-08-21', createdAt: '2026-08-20T09:00:00Z' },
        { meetingNumber: 2, status: 'HeldInterested', date: '2026-08-27', createdAt: '2026-08-27T12:00:00Z' },
      ],
    }, T);
    expect(j.title).toBe('Signed after 25 days');
    expect(j.open).toBe(false);
    expect(j.events.at(-1)).toMatchObject({ kind: 'outcome', rel: 25, detail: 'R1.24m, 3 products' });
    expect(j.spans.map(s => s.long)).toEqual(['7 days to book', '3 days to meet', '13 days to second meeting, 1 cancellation', '2 days to sign']);
    expect(j.subtitle).toBe('Booked by Thandi Mokoena on day 7. Two meetings held with Werner Hattingh, with 1 cancellation along the way. R1.24m, 3 products.');
  });

  it('lost with no meeting ever held: markers only, reason in the subtitle', () => {
    const j = buildJourney({
      ...base, status: 'ClosedLost', lostReasonLabel: 'Chose a competitor', leadCreatedAt: '2026-08-20', bookedAt: '2026-08-22', closedAt: '2026-09-08',
      meetingAttempts: [
        { meetingNumber: 1, status: 'Missed', date: '2026-08-26', createdAt: '2026-08-26T12:00:00Z' },
        { meetingNumber: 1, status: 'Cancelled', date: '2026-09-02', createdAt: '2026-09-01T12:00:00Z' },
      ],
    }, T);
    expect(j.title).toBe('Lost after 19 days');
    expect(j.subtitle).toBe('Booked by Thandi Mokoena on day 2. No meeting was held: 1 cancellation and 1 no-show. Reason: chose a competitor.');
    expect(j.events.filter(e => e.kind === 'marker')).toHaveLength(2);
  });

  it('a timestamp just after midnight in Johannesburg counts on the Johannesburg date', () => {
    // 22:30 UTC on 1 Sep is 00:30 on 2 Sep in South Africa.
    expect(toDay('2026-09-01T22:30:00Z')).toBe(toDay('2026-09-02'));
  });

  it('a scheduled meeting whose date has passed reads "Not logged yet", not future', () => {
    const j = buildJourney({ ...base, status: 'Assigned', leadCreatedAt: '2026-09-20', bookedAt: '2026-09-20',
      meetingAttempts: [{ meetingNumber: 1, status: 'Scheduled', date: '2026-09-25', createdAt: '2026-09-20T09:00:00Z' }] }, T);
    expect(j.events.find(e => e.key === 'm1')).toMatchObject({ kind: 'planned', future: false, detail: 'Not logged yet' });
    expect(j.title).toBe('Day 8, still open');
  });
});
