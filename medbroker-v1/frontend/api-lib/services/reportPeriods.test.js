import { describe, it, expect } from 'vitest';
import { getPeriodRange, getPriorPeriodRange, getTrendBuckets } from './reportPeriods.js';

const iso = (r) => ({ start: r.start.toISOString(), end: r.end.toISOString() });

describe('getPriorPeriodRange', () => {
  it('31 Oct -> September, not October', () => {
    const now = new Date('2026-10-31T10:00:00Z');
    expect(iso(getPriorPeriodRange('Monthly', now, now))).toEqual({
      start: '2026-08-31T22:00:00.000Z', end: '2026-09-30T21:59:59.999Z',
    });
  });
  it('30 Mar -> February', () => {
    const now = new Date('2026-03-30T10:00:00Z');
    expect(iso(getPriorPeriodRange('Monthly', now, now))).toEqual({
      start: '2026-01-31T22:00:00.000Z', end: '2026-02-28T21:59:59.999Z',
    });
  });
  it('Quarterly on 31 Dec -> Jul-Sep', () => {
    const now = new Date('2026-12-31T10:00:00Z');
    expect(iso(getPriorPeriodRange('Quarterly', now, now))).toEqual({
      start: '2026-06-30T22:00:00.000Z', end: '2026-09-30T21:59:59.999Z',
    });
  });
  it('Yearly -> previous calendar year', () => {
    const now = new Date('2026-08-31T10:00:00Z');
    expect(iso(getPriorPeriodRange('Yearly', now, now))).toEqual({
      start: '2024-12-31T22:00:00.000Z', end: '2025-12-31T21:59:59.999Z',
    });
  });
});

describe('getPeriodRange', () => {
  it('00:30 SAST on 1 Oct is October', () => {
    const d = new Date('2026-10-01T00:30:00+02:00');
    const r = getPeriodRange('Monthly', d, d);
    expect(r.start.toISOString()).toBe('2026-09-30T22:00:00.000Z');
    expect(r.end.toISOString()).toBe(d.toISOString());
  });
  it('past month ends at its last SAST millisecond', () => {
    const r = getPeriodRange('Monthly', new Date('2026-03-15T10:00:00Z'), new Date('2026-10-01T10:00:00Z'));
    expect(iso(r)).toEqual({ start: '2026-02-28T22:00:00.000Z', end: '2026-03-31T21:59:59.999Z' });
  });
  it('Quarterly and Yearly starts', () => {
    const now = new Date('2026-11-10T10:00:00Z');
    expect(getPeriodRange('Quarterly', now, now).start.toISOString()).toBe('2026-09-30T22:00:00.000Z');
    expect(getPeriodRange('Yearly', now, now).start.toISOString()).toBe('2025-12-31T22:00:00.000Z');
  });
});

describe('getTrendBuckets', () => {
  it('week buckets start at SAST midnight with W labels', () => {
    const now = new Date('2026-10-31T10:00:00Z');
    const b = getTrendBuckets('Monthly', now, now);
    expect(b.map((x) => x.label)).toEqual(['W1', 'W2', 'W3', 'W4', 'W5']);
    expect(b[0].start.toISOString()).toBe('2026-09-30T22:00:00.000Z');
    expect(b[1].start.toISOString()).toBe('2026-10-07T22:00:00.000Z');
    expect(b[0].end.toISOString()).toBe('2026-10-07T21:59:59.999Z');
    expect(b[4].end.toISOString()).toBe(now.toISOString());
  });
  it('quarterly buckets use month names and flag future months', () => {
    const now = new Date('2026-10-15T10:00:00Z');
    const b = getTrendBuckets('Quarterly', now, now);
    expect(b.map((x) => x.label)).toEqual(['Oct', 'Nov', 'Dec']);
    expect(b.map((x) => x.future)).toEqual([false, true, true]);
    expect(b[1].start.toISOString()).toBe('2026-10-31T22:00:00.000Z');
  });
  it('yearly has 12 buckets', () => {
    const now = new Date('2026-10-15T10:00:00Z');
    const b = getTrendBuckets('Yearly', now, now);
    expect(b).toHaveLength(12);
    expect(b[0].label).toBe('Jan');
  });
});
