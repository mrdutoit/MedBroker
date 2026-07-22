/**
 * services/appointmentStatusService.test.js — NEW.
 * Tests against the documented MedBroker Appointment transition rules
 * (AppointmentDetail.jsx's own header comment) — a failure here means the
 * implementation and the documented behaviour have diverged, which is
 * itself a finding. Mirrors leadStatusService.test.js's pattern exactly.
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
    it('customerSigned true wins even if meeting1 was not marked Seen', () => {
      expect(computeAppointmentStatus('Assigned', {
        customerSigned: true,
        meetings: [{ number: 1, status: 'Rescheduled' }],
      })).toBe('ClosedWon');
    });
    it('customerSigned overrides even from Unassigned (edge case, still correct)', () => {
      expect(computeAppointmentStatus('Unassigned', { customerSigned: true })).toBe('ClosedWon');
    });
  });

  describe('first meeting marked Seen -> InProgress, when outcome undecided', () => {
    it('meeting 1 Seen moves Assigned -> InProgress', () => {
      expect(computeAppointmentStatus('Assigned', {
        customerSigned: null,
        meetings: [{ number: 1, status: 'Seen' }],
      })).toBe('InProgress');
    });
    it('meeting 1 Seen moves Unassigned -> InProgress', () => {
      expect(computeAppointmentStatus('Unassigned', {
        customerSigned: null,
        meetings: [{ number: 1, status: 'Seen' }],
      })).toBe('InProgress');
    });
    it('meeting 1 Rescheduled does NOT move to InProgress', () => {
      expect(computeAppointmentStatus('Assigned', {
        customerSigned: null,
        meetings: [{ number: 1, status: 'Rescheduled' }],
      })).toBe('Assigned');
    });
    it('meeting 1 Cancelled does NOT move to InProgress', () => {
      expect(computeAppointmentStatus('Assigned', {
        customerSigned: null,
        meetings: [{ number: 1, status: 'Cancelled' }],
      })).toBe('Assigned');
    });
    it('meeting 2 Seen alone (meeting 1 not Seen) does NOT move to InProgress', () => {
      expect(computeAppointmentStatus('Assigned', {
        customerSigned: null,
        meetings: [{ number: 2, status: 'Seen' }],
      })).toBe('Assigned');
    });
    it('already InProgress stays InProgress when meeting 1 Seen again (idempotent)', () => {
      expect(computeAppointmentStatus('InProgress', {
        customerSigned: null,
        meetings: [{ number: 1, status: 'Seen' }],
      })).toBe('InProgress');
    });
    it('a terminal status (ClosedWon) is not reopened by a meeting update', () => {
      expect(computeAppointmentStatus('ClosedWon', {
        customerSigned: null,
        meetings: [{ number: 1, status: 'Seen' }],
      })).toBe('ClosedWon');
    });
  });

  describe('no signal -> status unchanged', () => {
    it('no meetings, no outcome -> stays Assigned', () => {
      expect(computeAppointmentStatus('Assigned', {})).toBe('Assigned');
    });
    it('undefined outcome object entirely -> stays at current status', () => {
      expect(computeAppointmentStatus('Assigned')).toBe('Assigned');
    });
    it('empty meetings array -> stays Unassigned', () => {
      expect(computeAppointmentStatus('Unassigned', { meetings: [] })).toBe('Unassigned');
    });
    it('customerSigned explicitly null, no meetings -> unchanged', () => {
      expect(computeAppointmentStatus('InProgress', { customerSigned: null, meetings: [] })).toBe('InProgress');
    });
  });
});
