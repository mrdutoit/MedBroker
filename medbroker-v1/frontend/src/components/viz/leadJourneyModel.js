/**
 * components/viz/leadJourneyModel.js — NEW, 28 Sep 2026. The pure half of
 * LeadJourney.jsx: every date-and-status decision about one lead's journey,
 * with no React or DOM, so it's unit-tested (leadJourneyModel.test.js).
 * See LeadJourney.jsx's header for what each rule is for.
 */
import { formatRand } from '../../utils/formatMoney.js';
export const DAY = 86400000;
export const HELD = new Set(['HeldInterested', 'HeldNotInterested']);
const FRICTION = new Set(['Rescheduled', 'Cancelled', 'Missed']);
const MEETING_WORD = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth'];
export const STATUS_TEXT = {
  HeldInterested: 'Held, interested', HeldNotInterested: 'Held, not interested',
  Scheduled: 'Scheduled', Rescheduled: 'Rescheduled', Cancelled: 'Cancelled', Missed: 'No-show',
};
const MARKER_WORD = { Rescheduled: 'Rescheduled', Cancelled: 'Cancelled', Missed: 'No-show' };

// Calendar day in South African time. A DATE ('2026-09-16') is taken as
// written; a timestamp is converted to its Johannesburg date first — slicing
// the UTC ISO string would put anything logged between midnight and 02:00
// on the previous day.
export const toDay = v => {
  if (!v) return null;
  const raw = String(v);
  const s = raw.length > 10
    ? new Date(raw).toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' })
    : raw.slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
};
// "3 Oct" — built by hand, not toLocaleDateString('en-ZA'), which gives
// "03 Oct" in some runtimes and "3 Oct" in others (the unit test caught it).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = dn => { const d = new Date(dn * DAY); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Pure model — every date-and-status decision, testable without a DOM. */
export function buildJourney(appt, todayDn) {
  const start = toDay(appt.leadCreatedAt) ?? toDay(appt.bookedAt);
  const events = [];
  const add = e => events.push({ ...e, rel: e.dn - start });

  add({ key: 'lead', kind: 'major', tone: 'lead', dn: start, title: 'Lead created', detail: appt.source && appt.source !== '—' ? appt.source : null });
  const booked = toDay(appt.bookedAt) ?? start;
  add({ key: 'booked', kind: 'major', tone: 'booked', dn: booked, title: 'Appointment booked', detail: appt.agentName ? `by ${appt.agentName}` : null });

  const byNumber = new Map();
  for (const a of appt.meetingAttempts ?? []) {
    if (!byNumber.has(a.meetingNumber)) byNumber.set(a.meetingNumber, []);
    byNumber.get(a.meetingNumber).push(a);
  }
  let held = 0; const friction = { Rescheduled: 0, Cancelled: 0, Missed: 0 };
  let nextMeeting = null;
  for (const [n, list] of [...byNumber.entries()].sort((x, y) => x[0] - y[0])) {
    const sorted = [...list].sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)));
    const word = `${MEETING_WORD[n] ?? `Meeting ${n}`} meeting`;
    sorted.forEach((a, i) => {
      const dn = toDay(a.date) ?? toDay(a.createdAt) ?? booked;
      const isCurrent = i === sorted.length - 1;
      if (FRICTION.has(a.status)) {
        friction[a.status] += 1;
        add({ key: `m${n}-${i}`, kind: 'marker', tone: a.status === 'Rescheduled' ? 'resched' : 'miss', dn,
          title: MARKER_WORD[a.status], meeting: word, status: a.status, cancelReason: a.cancelReason ?? null });
      } else if (isCurrent && HELD.has(a.status)) {
        held += 1;
        add({ key: `m${n}`, kind: 'major', tone: 'met', dn, title: word, detail: STATUS_TEXT[a.status], status: a.status });
      } else if (isCurrent && a.status === 'Scheduled') {
        const future = dn >= todayDn;
        add({ key: `m${n}`, kind: 'planned', tone: 'planned', dn, title: word, detail: future ? 'Scheduled' : 'Not logged yet', status: a.status, future });
        if (future && (nextMeeting === null || dn < nextMeeting.dn)) nextMeeting = { dn, word };
      }
    });
  }

  const closedDn = toDay(appt.closedAt) ?? toDay(appt.updatedAt) ?? todayDn;
  let outcome = null;
  if (appt.status === 'ClosedWon') {
    const value = (appt.productsSold ?? []).reduce((t, p) => t + (p.value ?? 0), 0);
    const n = (appt.productsSold ?? []).length;
    outcome = { key: 'outcome', kind: 'outcome', tone: 'won', dn: closedDn, title: 'Signed',
      detail: [value > 0 ? formatRand(value) : null, n > 0 ? plural(n, 'product') : null].filter(Boolean).join(', ') || null };
  } else if (appt.status === 'ClosedLost') {
    outcome = { key: 'outcome', kind: 'outcome', tone: 'lost', dn: closedDn, title: 'Lost', detail: appt.lostReasonLabel ?? null };
  } else if (appt.status === 'ReturnedToLeads') {
    outcome = { key: 'outcome', kind: 'outcome', tone: 'returned', dn: closedDn, title: 'Returned to leads', detail: null };
  }
  if (outcome) add(outcome);

  events.sort((x, y) => x.dn - y.dn || (x.kind === 'outcome') - (y.kind === 'outcome'));
  const open = !outcome;
  const todayRel = open ? todayDn - start : null;
  const endRel = Math.max(1, ...events.map(e => e.rel), todayRel ?? 0);

  // Headline + subtitle
  const days = (outcome ? outcome.dn : todayDn) - start;
  let title;
  if (appt.status === 'ClosedWon') title = `Signed after ${plural(days, 'day')}`;
  else if (appt.status === 'ClosedLost') title = `Lost after ${plural(days, 'day')}`;
  else if (appt.status === 'ReturnedToLeads') title = `Returned to leads after ${plural(days, 'day')}`;
  else if (nextMeeting) title = `Day ${days}: ${nextMeeting.word.toLowerCase()} on ${fmtDate(nextMeeting.dn)}`;
  else title = `Day ${days}, still open`;

  const bookedRel = booked - start;
  const parts = [];
  parts.push(appt.agentName ? `Booked by ${appt.agentName} on day ${bookedRel}.` : `Booked on day ${bookedRel}.`);
  const fr = [
    friction.Rescheduled ? plural(friction.Rescheduled, 'reschedule') : null,
    friction.Cancelled ? plural(friction.Cancelled, 'cancellation') : null,
    friction.Missed ? plural(friction.Missed, 'no-show') : null,
  ].filter(Boolean);
  const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  if (held > 0) parts.push(`${held === 1 ? 'One meeting' : `${WORDS[held] ?? held} meetings`} held${appt.brokerName ? ` with ${appt.brokerName}` : ''}${fr.length ? `, with ${fr.join(' and ')} along the way` : ''}.`);
  // "yet" only while the deal is open — a closed deal will never have one.
  else if (fr.length) parts.push(`${outcome ? 'No meeting was held' : 'No meeting held yet'}: ${fr.join(' and ')}.`);
  if (outcome?.tone === 'won' && outcome.detail) parts.push(`${outcome.detail}.`);
  if (outcome?.tone === 'lost' && outcome.detail) parts.push(`Reason: ${outcome.detail.charAt(0).toLowerCase()}${outcome.detail.slice(1)}.`);

  // Stretches between consecutive solid waypoints (and to Today / outcome)
  const anchors = events.filter(e => e.kind === 'major' || e.kind === 'outcome' || (e.kind === 'planned' && !e.future));
  const stops = [...anchors.map(e => ({ rel: e.rel, e }))];
  if (open) stops.push({ rel: todayRel, e: { key: 'today', title: 'Today' } });
  const spans = [];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i];
    const d = b.rel - a.rel;
    const inside = events.filter(e => e.kind === 'marker' && e.rel >= a.rel && e.rel <= b.rel);
    const counts = ['Rescheduled', 'Cancelled', 'Missed']
      .map(st => [st, inside.filter(e => e.status === st).length])
      .filter(([, c]) => c > 0)
      .map(([st, c]) => plural(c, { Rescheduled: 'reschedule', Cancelled: 'cancellation', Missed: 'no-show' }[st]));
    let what;
    if (b.e.key === 'today') what = `${plural(d, 'day')} since`;
    else if (b.e.key === 'booked') what = `${plural(d, 'day')} to book`;
    else if (b.e.kind === 'outcome') what = `${plural(d, 'day')} to ${b.e.tone === 'won' ? 'sign' : 'close'}`;
    else if (b.e.tone === 'met') what = `${plural(d, 'day')} to ${b.e.title === 'First meeting' ? 'meet' : b.e.title.toLowerCase()}`;
    else what = plural(d, 'day');
    spans.push({ from: a.rel, to: b.rel, long: counts.length ? `${what}, ${counts.join(', ')}` : what, short: plural(d, 'day') });
  }
  // 1 Oct 2026 — meetingSentence/bookedRel let Lead Detail's journey (leadPathModel.js) reuse these rules.
  return { events, spans, todayRel, endRel, open, title, subtitle: parts.join(' '), firstName: appt.firstName,
    meetingSentence: parts.slice(1).join(' '), bookedRel };
}


/** Today's calendar day in Johannesburg, in the same day-number units. */
export const todayDay = () => toDay(new Date().toISOString());
