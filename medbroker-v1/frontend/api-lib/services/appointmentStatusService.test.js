/**
 * services/appointmentStatusService.test.js
 * Tests against the documented MedBroker Appointment Won/Lost transition
 * rule — a failure here means the implementation and the documented
 * behaviour have diverged, which is itself a finding. Mirrors
 * leadStatusService.test.js's pattern exactly.
 *
 * REWRITTEN 14 Aug 2026 (§138 spec, session 20; §164 build, session 23)
 * — the old "first meeting marked Seen -> InProgress" describe block
 * tested behaviour that no longer lives in this function at all (moved
 * to appointmentService.saveMeetingAttemptOutcome — see that function's
 * own comment for why). Leaving those tests in place would have kept
 * passing on a technicality (computeAppointmentStatus now just ignores
 * an unrecognised `meetings` property rather than acting on it) while
 * asserting on a return value the function no longer produces — exactly
 * the kind of test-says-one-thing-code-does-another gap this project's
 * own testing discipline exists to catch, not create.
 *
 * Run: npm test (from api-demo / this project's root)
 */

import { describe, it, expect } from 'vitest';
import { computeAppointmentStatus } from './appointmentStatusService.js';

describe('computeAppointmentStatus', () => {
  describe('customerSigned decides the outcome, always', () => {
    it('customerSigned true -> ClosedWon, from Assigned', () => {
      expect(computeAppointmentStatus('Assigned', { customerSigned: true })).toBe('ClosedWon');
    });
    it('customerSigned true -> ClosedWon, from InProgress', () => {
      expect(computeAppointmentStatus('InProgress', { customerSigned: true })).toBe('ClosedWon');
    });
    it('customerSigned false -> ClosedLost, from Assigned', () => {
      expect(computeAppointmentStatus('Assigned', { customerSigned: false })).toBe('ClosedLost');
    });
    it('customerSigned false -> ClosedLost, from InProgress', () => {
      expect(computeAppointmentStatus('InProgress', { customerSigned: false })).toBe('ClosedLost');
    });
    it('customerSigned overrides even from Unassigned (edge case, still correct)', () => {
      expect(computeAppointmentStatus('Unassigned', { customerSigned: true })).toBe('ClosedWon');
    });
    it('a terminal status (ClosedWon) is not reopened by re-saving the same outcome', () => {
      expect(computeAppointmentStatus('ClosedWon', { customerSigned: true })).toBe('ClosedWon');
    });
  });

  describe('no signal -> status unchanged', () => {
    it('no outcome object at all -> stays at current status', () => {
      expect(computeAppointmentStatus('Assigned')).toBe('Assigned');
    });
    it('empty outcome object -> stays Assigned', () => {
      expect(computeAppointmentStatus('Assigned', {})).toBe('Assigned');
    });
    it('customerSigned explicitly null -> unchanged', () => {
      expect(computeAppointmentStatus('InProgress', { customerSigned: null })).toBe('InProgress');
    });
    it('an unrecognised extra property (e.g. a stray meetings array) is silently ignored, not acted on', () => {
      expect(computeAppointmentStatus('Assigned', { customerSigned: null, meetings: [{ number: 1, status: 'Seen' }] })).toBe('Assigned');
    });
  });
});
