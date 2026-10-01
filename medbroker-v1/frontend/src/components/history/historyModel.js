/**
 * components/history/historyModel.js — NEW, 1 Oct 2026. The pure half of
 * HistoryTimeline.jsx (Lead Detail's History): turns GET /leads/:id/audit
 * rows (the lead's own entries, its POPIA requests' and its appointments')
 * into SAST day groups of timeline items, with no React or DOM, so it's
 * unit-tested (historyModel.test.js).
 *
 * Titles reuse AuditLogList's describeEntry() wherever the timeline doesn't
 * say it better (calls, meeting attempts, edits), so an action this file
 * has never heard of still reads the same as the Change Log — category
 * "Other", never blank. Call notes are never read: only the outcome.
 */
import { describeEntry, FIELD_LABELS } from '../AuditLogList.jsx';
import { OUTCOME_LABELS } from '../../constants/leadOptions.js';
import { LOST_REASON_LABELS, CANCEL_REASON_LABELS, MEETING_TYPE_LABELS } from '../../constants/appointmentOptions.js';
import { STATUS_TEXT, MEETING_WORD, HELD, toDay, fmtDate, DAY } from '../viz/leadJourneyModel.js';

export const HISTORY_LIMIT = 15;
export const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'calls', label: 'Calls' },
  { key: 'appointment', label: 'Appointment' },
  { key: 'edits', label: 'Edits' },
  { key: 'assignments', label: 'Assignments' },
];

const NOT_REACHED = new Set(['NoAnswer', 'Voicemail', 'WrongNumber']);
const FRICTION = new Set(['Rescheduled', 'Cancelled', 'Missed']);
const EDITS = new Set(['LeadUpdated', 'AppointmentUpdated']);
// 1 Oct 2026 — reopening and a broker claiming hand the lead to someone, so
// they sit with assignments (LeadReopened labelled "Reopened").
const ASSIGNMENTS = new Set(['LeadAssigned', 'LeadReassigned', 'AppointmentBrokerAssigned', 'AppointmentReassigned', 'LeadReopened', 'AppointmentClaimed']);
const ACTION_LABEL = { LeadReopened: 'Reopened' };
const POPIA = new Set(['SarDeletionExecuted', 'AppointmentClosedForErasure']);
const LABEL = { appointment: 'Appointment', edits: 'Edit', assignments: 'Assignment', created: 'Created', popia: 'POPIA', other: 'Other' };
const COLOR = {
  calls: 'var(--pl-progress)', appointment: 'var(--pl-booked)', edits: 'var(--na)', assignments: 'var(--pl-assigned)',
  created: 'var(--pl-unassigned)', popia: 'var(--danger)', other: 'var(--mut)',
};

// Specific actions first, so an appointment's edit is an Edit and its
// erasure close is POPIA; then whatever entity the row belongs to.
function categorise(entry) {
  const a = entry.action;
  if (a === 'CallLogged') return 'calls';
  if (EDITS.has(a)) return 'edits';
  if (ASSIGNMENTS.has(a)) return 'assignments';
  if (a === 'LeadCreated') return 'created';
  if (POPIA.has(a) || entry.entityType === 'SubjectAccessRequest') return 'popia';
  if (a === 'AppointmentCreated' || entry.entityType === 'Appointment') return 'appointment';
  return 'other';
}

const sastTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayLabel = dn => `${fmtDate(dn)} ${new Date(dn * DAY).getUTCFullYear()}`;
const lowerFirst = t => t.charAt(0).toLowerCase() + t.slice(1);

// 1 Oct 2026 — fields whose stored value is a code: shown in the pages'
// own words. Region, job title and the like are stored as words already.
const VALUE_LABELS = { meetingType: MEETING_TYPE_LABELS, lostReason: LOST_REASON_LABELS, cancelReason: CANCEL_REASON_LABELS };

// A diff value as the reader should see it: "4 Mar 1990", "a, b", "In person", "—".
function show(v, key) {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.map(x => show(x, key)).join(', ') : '—';
  if (typeof v === 'string' && Object.hasOwn(VALUE_LABELS, key) && Object.hasOwn(VALUE_LABELS[key], v)) return VALUE_LABELS[key][v];
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}($|T)/.test(v)) return dayLabel(toDay(v));
  return String(v);
}

function diffOf(detail) {
  return Object.entries(detail ?? {}).map(([key, change]) => {
    const field = FIELD_LABELS[key] ?? key;
    // Sensitive fields arrive sealed server-side: that they changed, no
    // values. A change with neither value says the same rather than "— → —".
    if (change?.changed || (change?.from === undefined && change?.to === undefined)) return { field, changed: true };
    return { field, from: show(change?.from, key), to: show(change?.to, key) };
  });
}

function titleOf(entry, category) {
  const d = entry.changeDetail;
  if (category === 'calls') {
    if (!d?.outcome) return 'Call logged';
    return `Call: ${lowerFirst(OUTCOME_LABELS[d.outcome] ?? d.outcome)}`;
  }
  if (category === 'edits') return 'Details updated';
  if (entry.action === 'MeetingAttemptSaved' && d?.meetingNumber && d?.status) {
    const word = MEETING_WORD[d.meetingNumber] ?? `Meeting ${d.meetingNumber}`;
    return `${word} meeting ${lowerFirst(STATUS_TEXT[d.status] ?? d.status)}`;
  }
  if (entry.action === 'AppointmentOutcomeSaved') {
    const o = outcomeOf(d);
    if (o === 'won') return 'Signed';
    if (o === 'lost') return d.lostReason ? `Closed Lost: ${LOST_REASON_LABELS[d.lostReason] ?? d.lostReason}` : 'Closed Lost';
  }
  return describeEntry(entry) || 'Change recorded';
}

// 1 Oct 2026 — the handler writes no product count or value, so a signed
// outcome is just "Signed".
function outcomeOf(d) {
  if (d?.newStatus === 'ClosedWon' || d?.customerSigned === true) return 'won';
  if (d?.newStatus === 'ClosedLost') return 'lost';
  return null;
}

function colorOf(entry, category, attempt) {
  if (HELD.has(attempt)) return 'var(--pl-won)';
  if (entry.action === 'AppointmentOutcomeSaved') {
    const o = outcomeOf(entry.changeDetail);
    if (o) return o === 'won' ? 'var(--pl-won)' : 'var(--pl-lost)';
  }
  return COLOR[category];
}

/**
 * Day groups (newest first) and per-chip counts for one lead's audit rows.
 * currentAppointmentId (1 Oct 2026, the Appointment page's History): that
 * appointment's entries get no href — no link back to the page you're on.
 */
export function buildHistory(entries, { currentAppointmentId = null } = {}) {
  const ms = x => new Date(x.performedAt).getTime() || 0;
  const sorted = [...(entries ?? [])].sort((x, y) => ms(y) - ms(x));

  // Call numbers run oldest-first across the whole lead.
  const callNo = new Map();
  let firstReached = null;
  [...sorted].reverse().filter(x => x.action === 'CallLogged').forEach((x, i) => {
    callNo.set(x, i + 1);
    if (firstReached === null && x.changeDetail?.outcome && !NOT_REACHED.has(x.changeDetail.outcome)) firstReached = x;
  });

  const counts = { all: 0, calls: 0, appointment: 0, edits: 0, assignments: 0 };
  const days = [];
  for (const entry of sorted) {
    const category = categorise(entry);
    const d = entry.changeDetail;
    const who = entry.performedByName ?? null;
    const isCall = category === 'calls';
    const attempt = entry.action === 'MeetingAttemptSaved' ? d?.status : null;
    const extra = isCall && entry === firstReached ? ['first time reached'] : [];
    const item = {
      id: entry.id,
      category,
      title: titleOf(entry, category),
      time: sastTime.format(new Date(entry.performedAt)),
      label: isCall ? `Call ${callNo.get(entry)}` : ACTION_LABEL[entry.action] ?? LABEL[category],
      who,
      meta: [who, ...extra].filter(Boolean).join(' · '),
      color: colorOf(entry, category, attempt),
      diff: category === 'edits' ? diffOf(d) : null,
      hollow: isCall ? NOT_REACHED.has(d?.outcome) : FRICTION.has(attempt),
      appointmentId: entry.entityType === 'Appointment' ? entry.entityId ?? null : null,
    };
    item.href = item.appointmentId && item.appointmentId !== currentAppointmentId ? `/appointments/${item.appointmentId}` : null;
    counts.all += 1;
    if (category in counts) counts[category] += 1;

    const key = toDay(entry.performedAt);
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(item);
    else days.push({ key, label: dayLabel(key), items: [item] });
  }
  return { days, counts };
}

/** Only one chip's items; days left empty are dropped. 'all' is unchanged. */
export function filterDays(days, filter) {
  if (filter === 'all') return days;
  return days
    .map(d => ({ ...d, items: d.items.filter(i => i.category === filter) }))
    .filter(d => d.items.length > 0);
}

/** The first `limit` items (a day may be cut part-way) and how many are left. */
export function limitDays(days, limit) {
  const out = [];
  let left = limit, hidden = 0;
  for (const d of days) {
    if (left <= 0) { hidden += d.items.length; continue; }
    const items = d.items.slice(0, left);
    hidden += d.items.length - items.length;
    left -= items.length;
    out.push(items.length === d.items.length ? d : { ...d, items });
  }
  return { days: out, hidden };
}
