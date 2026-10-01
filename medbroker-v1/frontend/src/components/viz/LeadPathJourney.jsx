import { buildLeadPath } from './leadPathModel.js';
import { todayDay } from './leadJourneyModel.js';
import JourneyView from './JourneyView.jsx';

/**
 * components/viz/LeadPathJourney.jsx — NEW, 1 Oct 2026 (Lead Detail hero,
 * from the approved canvas). The lead's whole journey: lead created, every
 * call (reached filled, not reached hollow), the booking, then the latest
 * appointment's meetings, friction and outcome exactly as Appointment
 * Detail's LeadJourney shows them — with two bands under the labels saying
 * who held the lead and for how long. Rules: leadPathModel.js; drawing:
 * JourneyView.jsx (shared with LeadJourney). Call and meeting notes are
 * never shown here.
 */
export default function LeadPathJourney({ lead, calls, appointments, latestAppt, isMobile, todayDn = todayDay() }) {
  const j = buildLeadPath({ lead, calls, appointments, latestAppt }, todayDn);
  const name = `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim();
  const legend = (
    <div className="lpj-legend" aria-label="Legend">
      <span className="lpj-lg"><i className="lpj-lg-reached" />Call, reached</span>
      <span className="lpj-lg"><i className="lpj-lg-missed" />Call, not reached</span>
      <span className="lpj-lg"><i className="lpj-lg-friction" />Rescheduled, cancelled or no-show</span>
      <span className="lpj-lg"><i className="lpj-lg-planned" />Still to come</span>
    </div>
  );
  return (
    <section aria-label={`${name}’s journey`}>
      <JourneyView j={j} name={name} isMobile={isMobile} cancelReasonLabels={latestAppt?.cancelReasonLabels} legend={legend} />
    </section>
  );
}
