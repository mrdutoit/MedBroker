/**
 * services/appointmentStatusService.js
 * Server-side Appointment status transition machine for the Won/Lost
 * decision — matches the rule documented in AppointmentDetail.jsx's own
 * header comment:
 *
 *   Saving outcome with customerSigned = true  -> ClosedWon
 *   Saving outcome with customerSigned = false -> ClosedLost
 *
 * Called by POST /api/appointments/:id/outcome after persisting the
 * outcome fields — mirrors leadStatusService.js's pure-logic, no-SQL,
 * no-cloud-dependency design exactly, including being directly
 * unit-testable without a database.
 *
 * THE InProgress TRANSITION MOVED OUT OF THIS FUNCTION 14 Aug 2026 (§138
 * spec, session 20; §164 build, session 23) — this function used to also
 * decide InProgress off a raw `meetings` array ("first meeting marked
 * Seen -> InProgress"), back when meeting saves were bundled into the
 * same outcome-save call. Meeting saves are now their own dedicated
 * endpoint/flow (appointmentService.saveMeetingAttemptOutcome) — that
 * function decides the InProgress transition directly, at the point a
 * meeting-1 attempt is actually saved as held (either outcome), since
 * that's genuinely a different event now, not a side effect discovered
 * while parsing this endpoint's payload. This function only ever decides
 * ClosedWon/ClosedLost now.
 */

/**
 * @param {string} currentStatus - the appointment's current status
 * @param {Object} outcome
 * @param {boolean|null} [outcome.customerSigned]
 * @returns {string} the new status
 */
export function computeAppointmentStatus(currentStatus, { customerSigned } = {}) {
  // A decided outcome always wins, regardless of current status.
  if (customerSigned === true) return 'ClosedWon';
  if (customerSigned === false) return 'ClosedLost';

  // Nothing that changes status — stay where we are (e.g. re-saving
  // products sold with no new outcome signal).
  return currentStatus;
}
