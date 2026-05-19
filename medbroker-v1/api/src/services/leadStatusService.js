/**
 * api/src/services/leadStatusService.js
 *
 * Server-side Lead pipeline status transition machine.
 * Called by POST /api/leads/:id/calls after persisting the CallAttempt.
 *
 * Rules:
 *   NoAnswer            → no change (didn't reach the prospect)
 *   WrongNumber         → Closed (terminal)
 *   NotInterested       → Closed (terminal)
 *   Voicemail           → InProgress (if currently Unassigned or Assigned)
 *   CallbackRequested   → InProgress (if currently Unassigned or Assigned)
 *
 * AppointmentScheduled is NOT a call outcome — it is set by
 *   POST /api/appointments (Book Appointment), not by logCall.
 *
 * Status is never downgraded — a lead that is already InProgress
 * stays InProgress on a Voicemail outcome.
 *
 * Kai review: status is never directly writable by clients. All status
 * changes flow through this service, called server-side after persisting
 * the CallAttempt. PATCH /api/leads/:id with a pipelineStatus field
 * must return HTTP 400.
 */

const TERMINAL_STATUSES = ['AppointmentScheduled', 'Closed'];

/**
 * @param {string} currentStatus  Lead.pipelineStatus before this call
 * @param {string} outcome        CallAttempt.outcome value
 * @returns {string}              New pipelineStatus to write (may be unchanged)
 */
export function computeLeadStatus(currentStatus, outcome) {
  // Terminal statuses — no further transitions via call logging
  if (TERMINAL_STATUSES.includes(currentStatus)) return currentStatus;

  switch (outcome) {
    case 'WrongNumber':
    case 'NotInterested':
      return 'Closed';

    case 'NoAnswer':
      return currentStatus; // no change

    case 'Voicemail':
    case 'CallbackRequested':
    case 'ClientContacted':
      // Progress from Unassigned/Assigned to InProgress.
      // ClientContacted is the key qualifying outcome — prospect was reached
      // and expressed interest. The agent may follow up by booking an appointment.
      if (currentStatus === 'Unassigned' || currentStatus === 'Assigned') {
        return 'InProgress';
      }
      return currentStatus; // already InProgress — no change

    default:
      return currentStatus;
  }
}

/**
 * @param {string} currentStatus        Appointment.status before outcome saved
 * @param {boolean|null} customerSigned Appointment.customerSigned value
 * @param {boolean}      meetingsSeen   True if at least one meeting status = 'Seen'
 * @returns {string}                    New Appointment.status to write
 */
export function computeAppointmentStatus(currentStatus, customerSigned, meetingsSeen) {
  // Outcome recorded → terminal status
  if (customerSigned === true)  return 'ClosedWon';
  if (customerSigned === false) return 'ClosedLost';
  // Meetings underway
  if (meetingsSeen && currentStatus === 'Assigned') return 'InProgress';
  return currentStatus;
}
