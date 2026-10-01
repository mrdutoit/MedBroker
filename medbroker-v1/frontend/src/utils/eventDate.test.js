import { describe, it, expect } from 'vitest';
import { isPastEventDate } from './eventDate.js';

const now = new Date(2026, 8, 30, 15, 0); // 30 Sep 2026, local
describe('isPastEventDate', () => {
  it('parses an ISO timestamp (pg DATE over JSON) and flags a past day', () => {
    expect(isPastEventDate('2026-08-24T00:00:00.000Z', now)).toBe(true);
  });
  it('accepts a plain YYYY-MM-DD', () => expect(isPastEventDate('2026-08-24', now)).toBe(true));
  it('today and future are not past', () => {
    expect(isPastEventDate('2026-09-30T00:00:00.000Z', now)).toBe(false);
    expect(isPastEventDate('2026-10-01', now)).toBe(false);
  });
});
