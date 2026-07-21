/**
 * api/src/services/leadStatusService.test.js
 *
 * Tests for the server-side status machines against the documented MedBroker
 * transition rules. These encode the SPEC; a failure means the implementation
 * and the documented behaviour have diverged, which is itself a finding.
 *
 * Run from the api/ directory:  npm test
 * Requires (api/package.json):
 *   "scripts": { "test": "vitest run", "test:watch": "vitest" }
 *   "devDependencies": { "vitest": "^2.0.0" }
 */

import { describe, it, expect } from 'vitest';
import { computeLeadStatus, computeAppointmentStatus } from './leadStatusService.js';

// ─── Lead pipeline ──────────────────────────────────────────────────────────
const OPEN_EARLY = ['Unassigned', 'Assigned'];
const TERMINAL   = ['AppointmentScheduled', 'Closed'];

describe('computeLeadStatus — no-change outcomes', () => {
  it('NoAnswer never changes the status', () => {
    for (const status of ['Unassigned', 'Assigned', 'InProgress']) {
      expect(computeLeadStatus(status, 'NoAnswer')).toBe(status);
    }
  });
});

describe('computeLeadStatus — progressing outcomes', () => {
  for (const outcome of ['Voicemail', 'CallbackRequested', 'ClientContacted']) {
    it(`${outcome} moves an early-stage lead to InProgress`, () => {
      for (const status of OPEN_EARLY) {
        expect(computeLeadStatus(status, outcome)).toBe('InProgress');
      }
    });
    it(`${outcome} leaves an already-InProgress lead InProgress`, () => {
      expect(computeLeadStatus('InProgress', outcome)).toBe('InProgress');
    });
  }
});

describe('computeLeadStatus — closing outcomes', () => {
  for (const outcome of ['WrongNumber', 'NotInterested']) {
    it(`${outcome} closes an open lead`, () => {
      for (const status of [...OPEN_EARLY, 'InProgress']) {
        expect(computeLeadStatus(status, outcome)).toBe('Closed');
      }
    });
  }
});

describe('computeLeadStatus — terminal statuses do not reopen', () => {
  const outcomes = ['NoAnswer', 'Voicemail', 'WrongNumber', 'CallbackRequested', 'ClientContacted', 'NotInterested'];
  for (const status of TERMINAL) {
    for (const outcome of outcomes) {
      it(`${status} is unchanged by ${outcome}`, () => {
        expect(computeLeadStatus(status, outcome)).toBe(status);
      });
    }
  }
});

describe('computeLeadStatus — defensive', () => {
  it('an unknown outcome does not change the status', () => {
    expect(computeLeadStatus('Assigned', 'SomethingUnexpected')).toBe('Assigned');
  });
});

// ─── Appointment ──────────────────────────────────────────────────────────────
// computeAppointmentStatus(currentStatus, customerSigned, meetingsSeen)
describe('computeAppointmentStatus — outcome recorded', () => {
  it('customerSigned = true closes as ClosedWon from any status', () => {
    for (const status of ['Unassigned', 'Assigned', 'InProgress']) {
      expect(computeAppointmentStatus(status, true, false)).toBe('ClosedWon');
    }
  });
  it('customerSigned = false closes as ClosedLost from any status', () => {
    for (const status of ['Unassigned', 'Assigned', 'InProgress']) {
      expect(computeAppointmentStatus(status, false, true)).toBe('ClosedLost');
    }
  });
});

describe('computeAppointmentStatus — meetings underway', () => {
  it('a seen meeting moves an Assigned appointment to InProgress', () => {
    expect(computeAppointmentStatus('Assigned', null, true)).toBe('InProgress');
  });
  it('a seen meeting does not promote an Unassigned appointment', () => {
    expect(computeAppointmentStatus('Unassigned', null, true)).toBe('Unassigned');
  });
  it('no seen meeting leaves the status unchanged', () => {
    expect(computeAppointmentStatus('Assigned', null, false)).toBe('Assigned');
  });
  it('an already-InProgress appointment stays InProgress', () => {
    expect(computeAppointmentStatus('InProgress', null, true)).toBe('InProgress');
  });
});
