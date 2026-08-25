import { useState, useRef, useEffect } from 'react';
import { s, colors, radius, shadow } from '../styles/tokens.js';
import { formatDate } from '../utils/dateFormat.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// Monday-first, matching SA/ISO 8601 convention — same day-first ordering
// formatDate() already established for the app's read-only date standard.
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function pad2(n) { return String(n).padStart(2, '0'); }
function toISO(year, month, day) { return `${year}-${pad2(month + 1)}-${pad2(day)}`; } // month is 0-indexed in, 1-indexed out
function parseISO(value) {
  if (!value) return null;
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m - 1, day: d };
}
function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); } // month 0-indexed
function mondayFirstWeekday(year, month, day) { return (new Date(year, month, day).getDay() + 6) % 7; }
function todayParts() {
  const t = new Date();
  return { year: t.getFullYear(), month: t.getMonth(), day: t.getDate() };
}
function typedFromParts(parts) {
  return parts ? `${pad2(parts.day)}-${pad2(parts.month + 1)}-${parts.year}` : '';
}

/**
 * DatePicker — 25 Aug 2026, built to replace native <input type="date">
 * on internal/staff-facing forms only (Mark's explicit scope decision,
 * same date, following the app-wide date-FORMAT sweep, 25 Aug 2026's
 * earlier session, which deliberately left native inputs untouched
 * pending this follow-up). The three Portal (public, prospect-facing)
 * forms deliberately keep the native input — Mark's own call: native
 * date inputs trigger the OS's own picker on mobile (iOS wheel, Android
 * Material calendar), genuinely excellent UX and full accessibility for
 * free, and Portal is where a one-time anonymous visitor fills this in
 * on their own phone. That trade-off runs the other way for staff who
 * live in this app daily, where full visual consistency with every
 * read-only date matters more.
 *
 * Value contract: 'YYYY-MM-DD' string in, 'YYYY-MM-DD' string out via
 * onChange(value) — deliberately a PLAIN VALUE, not a synthetic event,
 * matching the contract this codebase's own EditableField/
 * EditableFieldRow components already use for type='date' (LeadDetail.jsx,
 * AppointmentDetail.jsx) rather than inventing a third convention. Every
 * other call site (previously a raw native input reading e.target.value)
 * had its onChange handler's parameter changed from an event to a plain
 * value to match — see each file's own comment at the call site.
 *
 * Display format matches formatDate() exactly ('d MMM yyyy') — the same
 * visual standard every read-only date in the app already uses
 * (dateFormat.js's own header comment has the full app-wide reasoning).
 *
 * Typed entry: focus the field and type 'DD-MM-YYYY' (strict, unambiguous
 * — day first, matching formatDate()'s own day-first display, and
 * deliberately NOT the same 'd MMM yyyy' shape used for display — a
 * fixed-width all-numeric format is faster to type and impossible to
 * misread as day/month vs month/day). Enter or blur commits a valid typed
 * value, which then re-renders in the 'd MMM yyyy' display format like
 * everything else. An invalid or incomplete typed value is left visible
 * with a red border rather than silently discarded, so the person can see
 * what's wrong and fix it, and is reset back to the last committed value
 * if the field is abandoned (blurred or closed) without ever becoming
 * valid — never left stuck showing bad text with nothing open to fix it.
 *
 * Calendar popover: month/year are two native <select> dropdowns in the
 * header, not prev/next-arrows-only — reaching a birth year by clicking
 * "previous month" 500+ times is a real, common date-picker usability
 * failure this was built specifically to avoid (DOB is roughly half of
 * this component's call sites). Year range is currentYear-100 to
 * currentYear+10, generated from the actual current date, not hardcoded.
 *
 * Accessibility scope, stated plainly rather than left to be discovered:
 * Escape closes the popover, Tab moves between the day buttons in DOM
 * order, Enter/Space selects the focused day (native <button> behaviour,
 * not custom-wired). Full roving-tabindex arrow-key grid navigation (a
 * native <input type="date"> gets this for free from the browser) was NOT
 * built — a real, deliberate scope line, not an oversight. Worth a
 * follow-up if keyboard-only day-grid navigation turns out to matter for
 * how this is actually used.
 *
 * Positioning: absolute within a relative wrapper, not a portal. Correct
 * for every current call site (none sit inside a container with
 * `overflow: hidden` that would clip the popover, checked directly rather
 * than assumed) but would need a portal if that ever changes — noted here
 * rather than silently assumed safe forever.
 *
 * Every <button> inside this component is explicitly type="button" —
 * several call sites (LeadNew.jsx, EventDetail.jsx) place this inside a
 * real <form onSubmit>, where a button with no explicit type defaults to
 * type="submit" and would prematurely submit the form on click.
 *
 * @param {string} value - 'YYYY-MM-DD' or '' / null / undefined
 * @param {(value: string) => void} onChange
 * @param {boolean} [disabled]
 * @param {object} [style] - merged over the default formInput style
 * @param {string} [placeholder]
 */
export default function DatePicker({ value, onChange, disabled, style, placeholder }) {
  const parts = parseISO(value);
  const today = todayParts();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parts?.year ?? today.year);
  const [viewMonth, setViewMonth] = useState(parts?.month ?? today.month);
  const [typedText, setTypedText] = useState('');
  const [typing, setTyping] = useState(false);
  const [typedInvalid, setTypedInvalid] = useState(false);
  const wrapperRef = useRef(null);

  // Keep the popover's displayed month in sync with the committed value
  // whenever it changes from OUTSIDE this component (e.g. a form reset)
  // while the picker itself isn't mid-interaction. Deliberately only
  // re-runs on `value` changing, not on `open`/`typing` too (both are
  // read inside) — this codebase's own ESLint config doesn't actually
  // have the react-hooks plugin loaded (confirmed: useFetch.js already
  // has an identical disable-comment for this same rule, and it errors
  // in lint even there — "Definition for rule … was not found"), so an
  // exhaustive-deps disable-comment here would be pure noise, not a
  // real suppression; left out deliberately rather than added and
  // silently broken.
  useEffect(() => {
    if (open || typing) return;
    const p = parseISO(value);
    setViewYear(p?.year ?? today.year);
    setViewMonth(p?.month ?? today.month);
  }, [value]);

  function abandonTyping() {
    setTyping(false);
    setTypedInvalid(false);
    setTypedText('');
  }

  function commitTyped(text) {
    const match = text.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (!match) { setTypedInvalid(true); return false; }
    const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month - 1)) {
      setTypedInvalid(true);
      return false;
    }
    onChange(toISO(year, month - 1, day));
    abandonTyping();
    return true;
  }

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        // Same reasoning as onBlur below — try to commit whatever was
        // typed; if it isn't valid, don't leave stale invalid text
        // showing with nothing open to fix it.
        if (typing && typedText.trim() && !commitTyped(typedText)) abandonTyping();
        setOpen(false);
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') { setOpen(false); if (typing) abandonTyping(); }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, typing, typedText]);

  function selectDay(day) {
    onChange(toISO(viewYear, viewMonth, day));
    abandonTyping();
    setOpen(false);
  }

  const displayValue = typing ? typedText : (parts ? formatDate(value) : '');
  const yearOptions = [];
  for (let y = today.year + 10; y >= today.year - 100; y--) yearOptions.push(y);

  const firstWeekday = mondayFirstWeekday(viewYear, viewMonth, 1);
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells = Array(firstWeekday).fill(null).concat(
    Array.from({ length: totalDays }, (_, i) => i + 1)
  );

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: style?.width ?? '100%' }}>
      <input
        type="text"
        inputMode="numeric"
        placeholder={placeholder ?? 'DD-MM-YYYY'}
        style={{
          ...s.formInput, ...style,
          paddingRight: '30px',
          borderColor: typedInvalid ? colors.danger : (style?.borderColor ?? colors.inputBorder),
          cursor: disabled ? 'not-allowed' : 'text',
          opacity: disabled ? 0.6 : 1,
        }}
        value={displayValue}
        disabled={disabled}
        onFocus={() => { setTyping(true); setTypedText(typedFromParts(parts)); setOpen(true); }}
        onChange={e => { setTypedText(e.target.value); setTypedInvalid(false); }}
        onBlur={() => { if (typedText.trim()) { if (!commitTyped(typedText)) abandonTyping(); } else { abandonTyping(); } }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitTyped(typedText); } }}
      />
      <button
        type="button"
        aria-label="Open calendar"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
          padding: '4px', display: 'flex', color: colors.ink500,
        }}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="2" y="3" width="12" height="11" rx="1.5" />
          <path d="M2 6.5h12M5 1.5v3M11 1.5v3" />
        </svg>
      </button>

      {open && !disabled && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 1000,
          background: colors.surface, border: `1px solid ${colors.line}`,
          borderRadius: radius.md, boxShadow: shadow.lg, padding: '10px', width: '260px',
        }}>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
            <select
              value={viewMonth}
              onChange={e => setViewMonth(Number(e.target.value))}
              style={{ ...s.formInput, padding: '4px 6px', fontSize: '0.8125rem', flex: 1.4, width: 'auto' }}
            >
              {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select
              value={viewYear}
              onChange={e => setViewYear(Number(e.target.value))}
              style={{ ...s.formInput, padding: '4px 6px', fontSize: '0.8125rem', flex: 1, width: 'auto' }}
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
            {WEEKDAY_LABELS.map(w => (
              <div key={w} style={{ textAlign: 'center', fontSize: '0.6875rem', color: colors.ink400, fontWeight: 600 }}>{w}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
            {cells.map((day, i) => {
              if (day === null) return <div key={`blank-${i}`} />;
              const isSelected = parts && parts.year === viewYear && parts.month === viewMonth && parts.day === day;
              const isToday = today.year === viewYear && today.month === viewMonth && today.day === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  style={{
                    padding: '6px 0', borderRadius: radius.sm, fontFamily: 'inherit', fontSize: '0.8125rem',
                    border: isToday && !isSelected ? `1px solid ${colors.primaryBorder}` : '1px solid transparent',
                    background: isSelected ? colors.primary : 'transparent',
                    color: isSelected ? '#fff' : colors.ink,
                    cursor: 'pointer',
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
