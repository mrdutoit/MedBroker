import OrbitPanel from './OrbitPanel.jsx';

/**
 * components/viz/CallFlow.jsx — Agent Detail's signature panel (27 Sep
 * 2026, app-design-pass): every call the agent made this period, flowing
 * into whether the client was reached, and on to what the call ended in.
 * Drawn as an ORBIT since 28 Sep 2026 (Mark's pick from four canvas
 * options; OrbitPanel.jsx, shared with Broker Detail's AppointmentFlow) —
 * the name stays CallFlow so AgentDetail.jsx is untouched. What's specific
 * to calls lives here; drawing and interaction live in OrbitPanel.
 *
 * DATA SEMANTICS (reportService.js, getAgentDetailReport): callOutcomes
 * counts CallAttempt rows by outcome, one outcome per call, so the bands
 * genuinely sum to the calls made. "Reached" / "Not reached" is a grouping
 * this chart adds, stated on screen: not reached = no answer, voicemail or
 * wrong number. "Ended in a booking" is a CALL outcome — it can differ from
 * Appointments booked, which counts appointments created.
 */

const NOT_REACHED = new Set(['No Answer', 'Voicemail', 'Wrong Number']);
const OUTCOME_COLOUR = {
  'Appointment Booked': 'var(--pl-booked)', 'Client Contacted': 'var(--pl-won)',
  'Callback Requested': 'var(--pl-progress)', 'Not Interested': 'var(--pl-lost)',
  'No Answer': 'var(--pl-unassigned)', 'Voicemail': 'var(--pl-unassigned)', 'Wrong Number': 'var(--pl-unassigned)',
};
const LABEL = {
  'Appointment Booked': 'Appointment booked', 'Client Contacted': 'Client contacted',
  'Callback Requested': 'Callback requested', 'Not Interested': 'Not interested',
  'No Answer': 'No answer', 'Voicemail': 'Voicemail', 'Wrong Number': 'Wrong number',
};
const ORDER = ['Appointment Booked', 'Callback Requested', 'Client Contacted', 'Not Interested', 'No Answer', 'Voicemail', 'Wrong Number'];

export default function CallFlow({ callOutcomes, isMobile }) {
  const outcomes = ORDER
    .map(key => ({ key, label: LABEL[key], colour: OUTCOME_COLOUR[key], count: (callOutcomes ?? []).find(o => o.label === key)?.count ?? 0 }))
    .filter(o => o.count > 0);
  const total = outcomes.reduce((t, o) => t + o.count, 0);
  const reached = outcomes.filter(o => !NOT_REACHED.has(o.key));
  const missed = outcomes.filter(o => NOT_REACHED.has(o.key)).map(o => ({ ...o, muted: true }));
  const reachedN = reached.reduce((t, o) => t + o.count, 0);
  const bookedN = outcomes.find(o => o.key === 'Appointment Booked')?.count ?? 0;
  return (
    <OrbitPanel
      eyebrow="Where this agent’s calls led"
      title={`${total.toLocaleString()} ${total === 1 ? 'call' : 'calls'} this period`}
      subtitle={total > 0
        ? `${reachedN} reached the client, ${bookedN} ended in a booking. Not reached means no answer, voicemail or a wrong number.`
        : 'No calls logged this period.'}
      total={total}
      unit="calls"
      unitOne="call"
      isMobile={isMobile}
      branches={[
        { key: 'reached', label: 'Reached', colour: 'var(--hero-accent)', children: reached },
        { key: 'missed', label: 'Not reached', colour: 'var(--pl-unassigned)', children: missed },
      ]}
    />
  );
}
