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

// 30 Sep 2026 — I7: optional fields must be clearable with null; required ones must not be.
import { UpdateLeadSchema } from './lead.js';
import { UpdateAppointmentSchema } from './appointment.js';
describe('clearable optional fields', () => {
  const CLEARABLE = ['whatsappNumber', 'hospitalOrPractice', 'policies', 'universityAttended', 'degreeAttained', 'yearOfAttendance', 'medicalAidProvider', 'currentInsurer'];
  it.each(CLEARABLE)('UpdateLeadSchema accepts null for %s', (f) => {
    const r = UpdateLeadSchema.safeParse({ [f]: null });
    expect(r.success).toBe(true);
    expect(r.data[f]).toBeNull();
  });
  it.each(['email', 'mobileNumber', 'firstName', 'lastName', 'dateOfBirth', 'occupation'])('UpdateLeadSchema still rejects null for required %s', (f) => {
    expect(UpdateLeadSchema.safeParse({ [f]: null }).success).toBe(false);
  });
  it('UpdateAppointmentSchema accepts null currentInsurer only', () => {
    expect(UpdateAppointmentSchema.safeParse({ currentInsurer: null }).success).toBe(true);
    expect(UpdateAppointmentSchema.safeParse({ meetingType: null }).success).toBe(false);
  });
});
