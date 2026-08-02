/**
 * components/PeriodSelector.jsx — NEW (§94).
 * Period-type toggle (Monthly/Quarterly/Yearly) plus a picker for WHICH
 * instance of that period to view — a specific month, quarter, or year,
 * not just "the one we're in right now". Shared by Reports.jsx,
 * AgentDetail.jsx, and BrokerDetail.jsx, all three of which previously
 * had their own independent copy of the simple three-button toggle with
 * no way to pick a different instance at all. Built as one shared
 * component rather than tripled again, specifically to avoid the same
 * class of drift already found and fixed once this session (AppAdmin's
 * audit-log filter lists silently diverging from the backend's).
 *
 * Controlled component: the parent owns period/referenceDate state,
 * this only renders the controls and calls back on change. Switching
 * period type resets referenceDate to undefined (the current instance)
 * rather than carrying over a specific date that may not make sense in
 * the new period type (e.g. a specific month selected, then switching
 * to Yearly — carrying that date over is fine here since only its
 * year/month component are ever read, but resetting instead is simpler
 * to reason about and matches the least-surprising default: switching
 * period type returns you to "now" in the new type, not a half-mapped
 * carryover).
 */

import { s, colors } from '../styles/tokens.js';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Last N months, including the current one, newest first. */
function monthOptions(count = 24) {
  const now = new Date();
  const options = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
    });
  }
  return options;
}

/** Last N quarters, including the current one, newest first. */
function quarterOptions(count = 8) {
  const now = new Date();
  const currentQStart = Math.floor(now.getMonth() / 3) * 3;
  const options = [];
  for (let i = 0; i < count; i++) {
    const monthsBack = i * 3;
    const d = new Date(now.getFullYear(), currentQStart - monthsBack, 1);
    const q = Math.floor(d.getMonth() / 3) + 1;
    options.push({ value: `${d.getFullYear()}-Q${q}`, label: `Q${q} ${d.getFullYear()}` });
  }
  return options;
}

/** Last N years, including the current one, newest first. */
function yearOptions(count = 5) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const y = now.getFullYear() - i;
    return { value: String(y), label: String(y) };
  });
}

/** "2026-06" -> Date(2026, 5, 1). Any day within the month works — the
 * backend only ever reads the year/month off this. */
function monthValueToDate(value) {
  const [y, m] = value.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

/** "2026-Q1" -> Date(2026, 0, 1) — first day of that quarter's first month. */
function quarterValueToDate(value) {
  const [y, qStr] = value.split('-Q');
  const q = Number(qStr);
  return new Date(Number(y), (q - 1) * 3, 1);
}

function yearValueToDate(value) {
  return new Date(Number(value), 0, 1);
}

/** Inverse of the above three — current referenceDate (or "now" when
 * unset) back to the matching dropdown value, so the control shows the
 * right selection on load and after a period-type switch. */
function dateToMonthValue(date) {
  const d = date ?? new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function dateToQuarterValue(date) {
  const d = date ?? new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}
function dateToYearValue(date) {
  return String((date ?? new Date()).getFullYear());
}

const selectStyle = {
  ...s.formInput, width: 'auto', minWidth: '140px', padding: '6px 10px', fontSize: '0.8125rem',
};

export function PeriodSelector({ period, onPeriodChange, referenceDate, onReferenceDateChange }) {
  function handlePeriodChange(next) {
    onPeriodChange(next);
    onReferenceDateChange(undefined); // reset to "now" in the new period type
  }

  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={s.segment}>
        {['Monthly', 'Quarterly', 'Yearly'].map((p, i) => (
          <button
            key={p}
            onClick={() => handlePeriodChange(p)}
            style={{
              ...s.segmentBtn,
              ...(period === p ? s.segmentBtnActive : {}),
              borderRight: i !== 2 ? `1px solid ${colors.line}` : 'none',
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {period === 'Monthly' && (
        <select
          style={selectStyle}
          value={dateToMonthValue(referenceDate)}
          onChange={e => onReferenceDateChange(monthValueToDate(e.target.value))}
        >
          {monthOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      {period === 'Quarterly' && (
        <select
          style={selectStyle}
          value={dateToQuarterValue(referenceDate)}
          onChange={e => onReferenceDateChange(quarterValueToDate(e.target.value))}
        >
          {quarterOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      {period === 'Yearly' && (
        <select
          style={selectStyle}
          value={dateToYearValue(referenceDate)}
          onChange={e => onReferenceDateChange(yearValueToDate(e.target.value))}
        >
          {yearOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </div>
  );
}

/**
 * Formats a referenceDate + period into the same "Month to date (August
 * 2026)" / "Quarter to date (Q3 2026)" / "Year to date (Jan-Dec 2026)"
 * style label Reports.jsx already used — but correctly drops "to date"
 * for a COMPLETED past period (a full month that's already over isn't
 * "to date" of anything), matching the same current-vs-past distinction
 * getPeriodRange applies on the backend.
 */
export function getPeriodLabel(period, referenceDate) {
  const d = referenceDate ?? new Date();
  const now = new Date();
  const isCurrentMonth = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  const isCurrentQuarter = d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3);
  const isCurrentYear = d.getFullYear() === now.getFullYear();

  if (period === 'Monthly') {
    const label = d.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
    return isCurrentMonth ? `Month to date (${label})` : label;
  }
  if (period === 'Quarterly') {
    const q = Math.floor(d.getMonth() / 3) + 1;
    return isCurrentQuarter ? `Quarter to date (Q${q} ${d.getFullYear()})` : `Q${q} ${d.getFullYear()}`;
  }
  return isCurrentYear ? `Year to date (Jan–Dec ${d.getFullYear()})` : `${d.getFullYear()} (Jan–Dec)`;
}

/** referenceDate (a Date or undefined) -> the ISO string reportsApi expects. */
export function referenceDateToParam(referenceDate) {
  return referenceDate ? referenceDate.toISOString().slice(0, 10) : undefined;
}
