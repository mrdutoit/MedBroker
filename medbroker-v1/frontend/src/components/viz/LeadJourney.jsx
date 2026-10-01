import { buildJourney, todayDay } from './leadJourneyModel.js';
import JourneyView from './JourneyView.jsx';

/**
 * components/viz/LeadJourney.jsx — NEW, 28 Sep 2026 (app-design-pass,
 * Appointment Detail; approved by Mark from the canvas mock-up unchanged).
 * The page's signature panel: this ONE lead's path from lead created to
 * outcome — the per-lead version of the Reports hero's "where the journey
 * slows down".
 *
 * TIME IS REAL: waypoints sit at their actual dates, so a long wait looks
 * long. The one bend in that rule: waypoints never sit closer than
 * MIN_GAP px (a lead booked the same day it was created would otherwise
 * draw two dots on top of each other) — later ones are nudged along, order
 * always kept.
 *
 * WHAT IT DRAWS (all from GET /api/appointments/:id — no new data except
 * closedAt, added to the SELECT 28 Sep 2026):
 *   - Lead created (leadCreatedAt), Appointment booked (createdAt, by the
 *     agent) — solid waypoints.
 *   - Each meeting number's CURRENT attempt (latest by createdAt, the same
 *     "current state" rule appointmentService uses): held -> a solid
 *     waypoint; scheduled for a future date -> a hollow one beyond Today;
 *     scheduled for a past date with nothing logged -> hollow, "not logged
 *     yet". Earlier attempts of that meeting (Rescheduled / Cancelled /
 *     Missed), and a current attempt that is itself cancelled or missed,
 *     are small hollow markers on the path — friction, visible at a glance.
 *   - The outcome: Signed (value, products), Lost (reason), Returned to
 *     leads — or, while open, a "Today, day N" line with the path dashed
 *     towards any meeting still to come.
 *   - Brackets above the path naming each stretch ("7 days to book"),
 *     with the friction inside it counted.
 *
 * Every waypoint and marker is a real <button>; hover or focus shows its
 * detail card (status, date, cancellation reason). Meeting NOTES are
 * deliberately not shown here — they can hold personal information and
 * already live in the Meetings section below. On a phone the path runs
 * down the page.
 */

// 1 Oct 2026 — the drawing moved, unchanged, to JourneyView.jsx so Lead
// Detail's journey (LeadPathJourney.jsx) shares it.
export default function LeadJourney({ appt, isMobile, todayDn = todayDay() }) {
  const j = buildJourney(appt, todayDn);
  const name = `${appt.firstName ?? ''} ${appt.lastName ?? ''}`.trim() || appt.leadName;
  return <JourneyView j={j} name={name} isMobile={isMobile} cancelReasonLabels={appt.cancelReasonLabels} />;
}
