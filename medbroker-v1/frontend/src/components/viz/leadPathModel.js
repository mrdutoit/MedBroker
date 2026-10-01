/**
 * components/viz/leadPathModel.js — NEW, 1 Oct 2026. The pure half of
 * LeadPathJourney.jsx (Lead Detail's hero): one lead's whole path — every
 * call, the booking, and the latest appointment's meetings and outcome —
 * plus the two bands showing who holds the lead (agent, then broker).
 *
 * The appointment half is NOT re-derived here: buildJourney() (the
 * Appointment Detail hero's model) is called with the newest appointment
 * and its meetings, friction markers, outcome, stretches, headline and
 * meeting sentence are taken as they are. This module only adds the calls,
 * the bands, the lead-stage wording, and the "never booked" path.
 * Call notes never reach the journey — only the time and the outcome.
 */
import { OUTCOME_LABELS } from '../../constants/leadOptions.js';
import { buildJourney, toDay, plural } from './leadJourneyModel.js';

const MISSED = new Set(['NoAnswer', 'Voicemail', 'WrongNumber']);
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const countCalls = n => `${WORD[n] ?? n} ${n === 1 ? 'call' : 'calls'}`;
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
// Same-day order: lead first, then that day's calls, then the rest, outcome last.
const RANK = e => (e.key === 'lead' ? 0 : e.kind === 'call' ? 1 : e.kind === 'outcome' ? 3 : 2);

/** "Reached on the third of four calls" — the lead-stage half of the subtitle. */
function callPhrase(calls, { open, booked }) {
  const n = calls.length;
  const r = calls.findIndex(c => c.tone === 'reached') + 1;
  if (n === 0) return null;
  if (r === 0) return `${cap(countCalls(n))}${open && !booked ? ' so far' : ''}, none reached`;
  if (n === 1) return 'Reached on the first call';
  return r <= 10 && n <= 10
    ? `Reached on the ${ORD[r]} of ${countCalls(n)}${open && !booked ? ' so far' : ''}`
    : `Reached on call ${r} of ${n}`;
}

export function buildLeadPath({ lead, calls = [], appointments = [], latestAppt = null }, todayDn) {
  const newest = [...appointments].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] ?? null;
  const appt = latestAppt ?? (newest ? { status: newest.status, meetingAttempts: [] } : null);
  const start = toDay(lead.createdAt) ?? toDay(appt?.leadCreatedAt) ?? todayDn;
  const agentName = appt?.agentName ?? lead.agentName ?? null;

  // Calls, oldest first, numbered in that order.
  const callEvents = [...calls]
    .filter(c => c.attemptedAt)
    .sort((a, b) => String(a.attemptedAt).localeCompare(String(b.attemptedAt)))
    .map((c, i) => {
      const dn = toDay(c.attemptedAt);
      return {
        key: `c${i + 1}`, kind: 'call', tone: MISSED.has(c.outcome) ? 'missed' : 'reached', dn, rel: dn - start,
        title: `Call ${i + 1}`, detail: OUTCOME_LABELS[c.outcome] ?? c.outcome ?? null,
        callbackDn: c.callbackDateTime ? toDay(c.callbackDateTime) : null,
      };
    });

  let events, spans, open, title, outcomeRel, bookedRel = null;
  let meetingSentence = '';
  if (appt) {
    // The appointment's own rules, measured from this lead's creation.
    const j = buildJourney({
      ...appt,
      leadCreatedAt: lead.createdAt ?? appt.leadCreatedAt,
      bookedAt: newest?.createdAt ?? appt.bookedAt,
      source: lead.sourceLabel,
      agentName,
    }, todayDn);
    bookedRel = j.bookedRel;
    open = j.open;
    title = j.title;
    meetingSentence = j.meetingSentence;
    events = [...j.events, ...callEvents];
    outcomeRel = j.events.find(e => e.kind === 'outcome')?.rel ?? null;
    // The first stretch (lead -> booked) also counts the calls it took.
    const k = callEvents.filter(c => c.rel <= bookedRel).length;
    spans = j.spans.map((sp, i) => (i === 0 && sp.from === 0 && sp.to === bookedRel && k > 0
      ? { ...sp, long: `${plural(bookedRel, 'day')}, ${plural(k, 'call')} to book` } : sp));
  } else {
    const closed = lead.pipelineStatus === 'Closed';
    const lead0 = { key: 'lead', kind: 'major', tone: 'lead', dn: start, rel: 0, title: 'Lead created',
      detail: lead.sourceLabel && lead.sourceLabel !== '—' ? lead.sourceLabel : null };
    events = [lead0, ...callEvents];
    open = !closed;
    if (closed) {
      const dn = toDay(lead.updatedAt) ?? todayDn;
      events.push({ key: 'outcome', kind: 'outcome', tone: 'lost', dn, rel: dn - start, title: 'Closed', detail: null });
      outcomeRel = dn - start;
    }
    const end = closed ? outcomeRel : todayDn - start;
    const k = callEvents.filter(c => c.rel <= end).length;
    title = closed ? `Closed after ${plural(end, 'day')}` : `Day ${end}, not booked yet`;
    const what = k > 0 ? `${plural(end, 'day')}, ${plural(k, 'call')}` : plural(end, 'day');
    spans = [{ from: 0, to: end, long: closed ? `${what} to close` : `${what}${k > 0 ? ' so far' : ', no calls yet'}`, short: plural(end, 'day') }];
  }
  events.sort((x, y) => x.dn - y.dn || RANK(x) - RANK(y));

  const todayRel = open ? todayDn - start : null;
  const endRel = Math.max(1, ...events.map(e => e.rel), todayRel ?? 0);
  const stop = open ? todayRel : outcomeRel ?? todayRel ?? endRel;

  // Who holds the lead: the agent until it's booked, then the broker.
  const bands = [];
  if (bookedRel === null) {
    bands.push({ from: 0, to: stop, tone: 'agent', label: `With the agent · ${plural(stop, 'day')}`, short: plural(stop, 'day') });
  } else {
    bands.push({ from: 0, to: bookedRel, tone: 'agent', label: `With the agent · ${plural(bookedRel, 'day')}`, short: plural(bookedRel, 'day') });
    const d = stop - bookedRel;
    const days = `${plural(d, 'day')}${open ? ' so far' : ''}`;
    bands.push({ from: bookedRel, to: stop, tone: 'broker', open,
      label: ['With the broker', appt.brokerName, days].filter(Boolean).join(' · '), short: `Broker · ${days}` });
  }

  // Subtitle: the lead-stage sentence, then the appointment's own.
  const phrase = callPhrase(callEvents.filter(c => bookedRel === null || c.rel <= bookedRel), { open, booked: bookedRel !== null });
  let first;
  if (bookedRel !== null) {
    const by = `booked${agentName ? ` by ${agentName}` : ''} on day ${bookedRel}`;
    first = phrase ? `${phrase} and ${by}.` : `${cap(by)}.`;
  } else {
    first = phrase ? `${phrase}.` : 'No calls yet.';
  }
  const subtitle = [first, meetingSentence].filter(Boolean).join(' ');

  return { events, spans, bands, todayRel, endRel, open, title, subtitle, bookedRel };
}
