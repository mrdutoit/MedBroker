import { describe, it, expect } from 'vitest';
import { CallAttemptSchema } from './lead.js';

// 30 Sep 2026 — datetime-local sends no offset; Vercel parses it as UTC (2h late in SAST)
describe('CallAttemptSchema callbackDateTime', () => {
  const parse = (v) => CallAttemptSchema.parse({ outcome: 'CallbackRequested', callbackDateTime: v }).callbackDateTime;

  it('appends +02:00 to an offset-less value', () => {
    expect(parse('2026-10-05T09:00')).toBe('2026-10-05T09:00+02:00');
  });
  it('appends +02:00 when seconds are present', () => {
    expect(parse('2026-10-05T09:00:30')).toBe('2026-10-05T09:00:30+02:00');
  });
  it('leaves Z and explicit offsets unchanged', () => {
    expect(parse('2026-10-05T09:00:00Z')).toBe('2026-10-05T09:00:00Z');
    expect(parse('2026-10-05T09:00:00+02:00')).toBe('2026-10-05T09:00:00+02:00');
    expect(parse('2026-10-05T09:00:00-05:00')).toBe('2026-10-05T09:00:00-05:00');
  });
  it('is still optional', () => {
    expect(CallAttemptSchema.parse({ outcome: 'NoAnswer' }).callbackDateTime).toBeUndefined();
  });
});
