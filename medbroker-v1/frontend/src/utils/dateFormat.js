/**
 * utils/dateFormat.js — NEW, 23 Jul 2026.
 *
 * AppointmentDetail.jsx's "First appt date" field was rendering
 * `{appt.firstDate}` directly — the raw value the API returns for a Postgres
 * DATE column, serialised as a full ISO timestamp
 * ("2026-07-24T00:00:00.000Z"), with the time shown separately next to it.
 * Mark asked for a fixed DD-MM-YYYY date display, with a Settings-page
 * timezone control governing how any date/time value is interpreted for
 * display. This is that shared utility — one place, so future date displays
 * can reuse it instead of each page inventing its own formatting.
 *
 * Scope note: only AppointmentDetail.jsx's First Appointment Date/meeting
 * dates use this so far (the field Mark specifically flagged). Other date
 * displays across the app (LeadDetail's "Date created", AppointmentList's
 * date column, etc.) already format acceptably with date-fns/toLocaleDateString
 * and were left alone — sweeping every date display over to this utility for
 * consistency is a reasonable follow-up, not bundled into this fix.
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

/**
 * Formats a date-only value (Postgres DATE column, e.g. "2026-07-24" or
 * "2026-07-24T00:00:00.000Z") as DD-MM-YYYY. Date-only values have no real
 * time component, so this reads the calendar date directly rather than
 * running it through a timezone conversion — a DATE column shouldn't shift
 * day depending on the viewer's timezone.
 * @param {string|null|undefined} value
 * @returns {string} 'DD-MM-YYYY', or '—' if value is empty
 */
export function formatDate(value) {
  if (!value) return '—';
  const datePart = String(value).slice(0, 10); // 'YYYY-MM-DD' from either shape
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return '—';
  return `${day}-${month}-${year}`;
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

/** Convenience: "DD-MM-YYYY · HH:mm", or just the date if no time is given. */
export function formatDateTime(dateValue, timeValue) {
  const d = formatDate(dateValue);
  const t = timeValue ? formatTime(timeValue) : null;
  return t ? `${d} · ${t}` : d;
}
