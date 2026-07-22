/**
 * services/appointmentStatusService.js — NEW.
 * Server-side Appointment status transition machine, matching the rules
 * documented in AppointmentDetail.jsx's own header comment (found there,
 * not invented here):
 *
 *   Saving outcome with customerSigned = true  -> ClosedWon
 *   Saving outcome with customerSigned = false -> ClosedLost
 *   First meeting marked Seen                  -> InProgress
 *
 * Called by POST /api/appointments/:id/outcome after persisting the
 * updated meeting rows — mirrors leadStatusService.js's pure-logic,
 * no-SQL, no-cloud-dependency design exactly, including being directly
 * unit-testable without a database.
 */

/**
 * @param {string} currentStatus - the appointment's current status
 * @param {Object} outcome
 * @param {boolean|null} [outcome.customerSigned]
 * @param {Array<{number: number, status?: string}>} [outcome.meetings]
 * @returns {string} the new status
 */
export function computeAppointmentStatus(currentStatus, { customerSigned, meetings } = {}) {
  // A decided outcome always wins, regardless of current status or meeting state.
  if (customerSigned === true) return 'ClosedWon';
  if (customerSigned === false) return 'ClosedLost';

  // Undecided outcome — check whether the first meeting has been marked Seen.
  const meeting1Seen = (meetings ?? []).some((m) => m.number === 1 && m.status === 'Seen');
  if (meeting1Seen && (currentStatus === 'Assigned' || currentStatus === 'Unassigned')) {
    return 'InProgress';
  }

  // Nothing that changes status — stay where we are (e.g. saving notes on
  // a meeting without marking an outcome, or re-saving with no new signal).
  return currentStatus;
}
