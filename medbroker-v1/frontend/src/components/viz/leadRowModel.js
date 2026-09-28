import { toDay } from './leadJourneyModel.js';

/**
 * components/viz/leadRowModel.js — NEW, 28 Sep 2026 (app-design-pass,
 * Leads list; design approved by Mark on the canvas, second revision). The
 * pure half of LeadRowJourney: turns one lead's journey data into days-ago
 * positions and a one-line caption. Unit-tested (leadRowModel.test.js).
 *
 * Every row shares ONE scale — the last WINDOW days, today at the right —
 * so rows compare straight down the list.
 *
 * Input: lead.createdAt, lead.updatedAt, lead.pipelineStatus, and
 * lead.journey from listLeads (leadService.js): { calls: [{ at, outcome }]
 * (last 60 days), lastCallAt (ever), callCount (ever), bookedAt,
 * apptStatus, closedAt } — the latest appointment's fields.
 *
 * RULES
 *   - A call "reached" the client unless its outcome is NoAnswer,
 *     Voicemail or WrongNumber (the same grouping Agent Detail's orbit uses).
 *   - "Quiet" = more than QUIET_DAYS since the last contact (latest call or
 *     booking) on a lead that is still being worked by the agent. A lead
 *     whose appointment is open is with the broker — never flagged quiet
 *     here (the broker's meetings aren't on this list); it reads "Booked".
 *   - Outcome: the latest appointment ClosedWon -> "Signed", ClosedLost ->
 *     "Lost" (at closedAt); a lead closed without an appointment ->
 *     "Closed" (at updatedAt — the list has no separate closed date).
 */

export const WINDOW = 60;
export const QUIET_DAYS = 7;
const NOT_REACHED = new Set(['NoAnswer', 'Voicemail', 'WrongNumber']);
const ago = (dn, today) => (dn === null ? null : Math.max(0, today - dn));
const days = n => (n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);

export function buildRowJourney(lead, todayDn) {
  const j = lead.journey ?? {};
  const createdAgo = ago(toDay(lead.createdAt), todayDn) ?? 0;
  const calls = (j.calls ?? [])
    .map(c => ({ ago: ago(toDay(c.at), todayDn), reached: !NOT_REACHED.has(c.outcome) }))
    .filter(c => c.ago !== null && c.ago <= WINDOW);
  const lastCallAgo = ago(toDay(j.lastCallAt), todayDn);
  const bookedAgo = ago(toDay(j.bookedAt), todayDn);

  let outcome = null;
  if (j.apptStatus === 'ClosedWon') outcome = { kind: 'won', ago: ago(toDay(j.closedAt), todayDn) ?? bookedAgo ?? 0 };
  else if (j.apptStatus === 'ClosedLost') outcome = { kind: 'lost', ago: ago(toDay(j.closedAt), todayDn) ?? bookedAgo ?? 0 };
  else if (lead.pipelineStatus === 'Closed') outcome = { kind: 'closed', ago: ago(toDay(lead.updatedAt), todayDn) ?? 0 };

  const withBroker = !outcome && bookedAgo !== null && ['Assigned', 'Claimed', 'InProgress', 'Unassigned'].includes(j.apptStatus);
  const contacts = [lastCallAgo, bookedAgo].filter(v => v !== null);
  const lastContactAgo = contacts.length ? Math.min(...contacts) : null;
  const quiet = !outcome && !withBroker && lastContactAgo !== null && lastContactAgo > QUIET_DAYS;
  const noCall = !outcome && lastCallAgo === null && bookedAgo === null;

  let caption;
  if (outcome?.kind === 'won') caption = { text: `Signed ${days(outcome.ago)}`, tone: 'won' };
  else if (outcome?.kind === 'lost') caption = { text: `Lost ${days(outcome.ago)}`, tone: 'lost' };
  else if (outcome) caption = { text: `Closed ${days(outcome.ago)}`, tone: 'muted' };
  else if (withBroker) caption = { text: `Booked ${days(bookedAgo)}`, tone: 'booked' };
  else if (noCall) caption = { text: 'No call yet', tone: 'muted' };
  else if (quiet) caption = { text: `Quiet for ${lastContactAgo} days`, tone: 'quiet' };
  else caption = { text: `Called ${days(lastCallAgo ?? lastContactAgo)}`, tone: 'accent' };

  return {
    createdAgo, clipped: createdAgo > WINDOW, calls, bookedAgo: bookedAgo !== null && bookedAgo <= WINDOW ? bookedAgo : null,
    outcome: outcome && outcome.ago <= WINDOW ? outcome : null,
    lastContactAgo, quiet, withBroker, noCall, caption,
    callCount: j.callCount ?? 0, reachedCount: calls.filter(c => c.reached).length,
  };
}
