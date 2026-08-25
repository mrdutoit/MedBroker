/**
 * utils/dateFormat.js — NEW, 23 Jul 2026. REFORMATTED, 24 Aug 2026.
 *
 * AppointmentDetail.jsx's "First appt date" field was rendering
 * `{appt.firstDate}` directly — the raw value the API returns for a Postgres
 * DATE column, serialised as a full ISO timestamp
 * ("2026-07-24T00:00:00.000Z"), with the time shown separately next to it.
 * Mark asked for a fixed date display, with a Settings-page timezone
 * control governing how any date/time value is interpreted for display.
 * This is that shared utility — one place, so future date displays can
 * reuse it instead of each page inventing its own formatting.
 *
 * 24 Aug 2026 — formatDate()'s OUTPUT changed from 'DD-MM-YYYY' (e.g.
 * "23-09-2026") to 'd MMM yyyy' (e.g. "23 Sep 2026"), and its use swept
 * across the rest of the app. Mark found the SAR form showing two
 * genuinely different date formats side by side (a native date input next
 * to a formatDate()-rendered preview) and asked to make formats consistent
 * app-wide. Auditing turned up FOUR different conventions already in play
 * for read-only dates: this file's own DD-MM-YYYY; date-fns
 * `format(d, 'd MMM yyyy')` used in the majority of the app (LeadDetail,
 * EventList, AuditLogList, Portal pages); `toLocaleDateString('en-ZA', …)`
 * producing the same visual shape via a different mechanism
 * (AppointmentList); and, in two spots (Tasks.jsx), no formatting at all —
 * a raw ISO string shown straight to the user. Mark's explicit choice,
 * 24 Aug 2026: 'd MMM yyyy' becomes the one standard, because it was
 * already the majority pattern. This file's own original DD-MM-YYYY output
 * changed to match, rather than propagating numeric DD-MM-YYYY outward —
 * this reverses this file's own original stated direction ("Other date
 * displays … were left alone — sweeping every date display over to this
 * utility for consistency is a reasonable follow-up"); that follow-up
 * happened this session, just landing on the other format.
 *
 * Every DATE-only value across the app (confirmed against
 * schema.postgres.sql's actual column types, not assumed — DATE, not
 * TIMESTAMPTZ) that was being rendered via `new Date(value)` +
 * date-fns/toLocaleDateString was switched to call formatDate() instead of
 * just picking up the new format string — not a cosmetic-only change.
 * `new Date('2026-08-24')` parses as UTC midnight; formatting that through
 * the *viewer's local timezone* can roll it back a calendar day for anyone
 * west of UTC. formatDate() never constructs a Date object at all — it
 * reads the calendar date directly out of the string — so switching a
 * DATE-only call site to it fixes a latent timezone bug at the same time
 * as it fixes the format. (This doesn't currently bite anyone in practice —
 * MedBroker's whole user base is SAST, UTC+2, always ahead of UTC — but
 * it's a real bug waiting for the first user or browser in a negative UTC
 * offset, not a hypothetical one; AppointmentDetail.jsx's meeting-attempt
 * history had already independently worked around this exact issue with a
 * manual `T00:00:00` suffix before formatDate() existed, which this
 * sweep also removed — formatDate() making that workaround unnecessary is
 * the whole point of the fix.)
 *
 * Genuine TIMESTAMPTZ values (createdAt, performedAt, attemptedAt, and
 * similar) were deliberately left on date-fns' `format(new Date(value), …)`
 * — those DO need timezone-aware conversion (an event at 23:30 UTC is a
 * different calendar day depending on the viewer), formatDate() would be
 * the wrong tool for them, not a stricter one. Their format STRING already
 * matched 'd MMM yyyy' at every call site found, so no change was needed
 * there beyond the two raw-ISO Tasks.jsx spots (see this session's own
 * Status_Vercel.md entry for the full file list).
 */


const TIMEZONE_STORAGE_KEY = 'mb_timezone';
export const DEFAULT_TIMEZONE = 'Africa/Johannesburg';

export const SUPPORTED_TIMEZONES = [
  { id: 'Africa/Johannesburg', label: 'South Africa Standard Time (SAST, UTC+2)' },
  { id: 'UTC',                 label: 'UTC' },
  { id: 'Europe/London',       label: 'UK Time (London)' },
  { id: 'Europe/Amsterdam',    label: 'Central European Time (Amsterdam)' },
];

/** Reads the persisted display timezone (Settings page), or the default. */
export function getUserTimezone() {
  try {
    return sessionStorage.getItem(TIMEZONE_STORAGE_KEY) || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function setUserTimezone(tz) {
  try {
    sessionStorage.setItem(TIMEZONE_STORAGE_KEY, tz);
  } catch {
    // sessionStorage unavailable — display falls back to DEFAULT_TIMEZONE silently
  }
}

// 24 Aug 2026 — abbreviated month names for formatDate()'s output, matching
// date-fns' own 'MMM' token exactly (three letters, capitalised) so a
// formatDate() call and a `format(d, 'd MMM yyyy')` call are visually
// indistinguishable side by side, which is the entire point of this sweep.
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats a date-only value (Postgres DATE column, e.g. "2026-07-24" or
 * "2026-07-24T00:00:00.000Z") as 'd MMM yyyy' (e.g. "24 Jul 2026",
 * un-padded day, matching date-fns' own 'd MMM yyyy' token exactly — the
 * one standard for every read-only date across the app, Mark's explicit
 * choice, 24 Aug 2026). Date-only values have no real time component, so
 * this reads the calendar date directly rather than running it through a
 * timezone conversion — a DATE column shouldn't shift day depending on the
 * viewer's timezone.
 * @param {string|null|undefined} value
 * @returns {string} 'd MMM yyyy', or '—' if value is empty
 */
export function formatDate(value) {
  if (!value) return '—';
  const datePart = String(value).slice(0, 10); // 'YYYY-MM-DD' from either shape
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return '—';
  const monthIndex = Number(month) - 1;
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11 || !Number(day)) return '—';
  return `${Number(day)} ${MONTH_ABBR[monthIndex]} ${year}`;
}

/**
 * Formats a time-only value ("09:00" or "09:00:00") as HH:mm, optionally
 * converted into the display timezone if a full datetime is supplied
 * instead of a bare time. Appointment first-meeting time is stored as a
 * bare HH:mm string with no timezone (matches the office wall-clock time,
 * not a UTC instant), so no conversion happens here — this just trims
 * seconds. Kept as its own function so a future datetime-aware time value
 * has somewhere to plug in real timezone conversion via getUserTimezone().
 * @param {string|null|undefined} value
 * @returns {string} 'HH:mm', or '—' if value is empty
 */
export function formatTime(value) {
  if (!value) return '—';
  return String(value).slice(0, 5);
}

/** Convenience: "d MMM yyyy · HH:mm", or just the date if no time is given. */
export function formatDateTime(dateValue, timeValue) {
  const d = formatDate(dateValue);
  const t = timeValue ? formatTime(timeValue) : null;
  return t ? `${d} · ${t}` : d;
}
