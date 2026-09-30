// 30 Sep 2026 — pure period maths for reports. All boundaries are South African
// calendar boundaries (UTC+02:00, no DST) expressed as UTC instants, so results
// don't depend on the server's zone (Vercel runs in UTC, dev machines don't).
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Calendar parts of an instant as seen in SAST.
function sastParts(date) {
  const d = new Date(date.getTime() + SAST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

// SAST midnight of the given calendar day, as a UTC instant (month may overflow).
function sastMidnight(year, month, day = 1) {
  return new Date(Date.UTC(year, month, day) - SAST_OFFSET_MS);
}

/**
 * @param {'Monthly'|'Quarterly'|'Yearly'} period
 * @param {Date} [referenceDate] a date within the period instance to view.
 * The current period ends at `now`; a past period ends at its last millisecond.
 */
export function getPeriodRange(period, referenceDate = new Date(), now = new Date()) {
  const ref = sastParts(referenceDate);
  let startMonth;
  let monthSpan;
  if (period === 'Monthly') { startMonth = ref.month; monthSpan = 1; }
  else if (period === 'Quarterly') { startMonth = Math.floor(ref.month / 3) * 3; monthSpan = 3; }
  else { startMonth = 0; monthSpan = 12; }

  const start = sastMidnight(ref.year, startMonth, 1);
  const nextStart = sastMidnight(ref.year, startMonth + monthSpan, 1);
  const isCurrent = now.getTime() >= start.getTime() && now.getTime() < nextStart.getTime();
  const end = isCurrent ? new Date(now) : new Date(nextStart.getTime() - 1);
  return { start, end };
}

/** Full calendar prior period, computed from the period's own start (day pinned to 1). */
export function getPriorPeriodRange(period, referenceDate = new Date(), now = new Date()) {
  const { start } = getPeriodRange(period, referenceDate, now);
  const s = sastParts(start);
  const back = period === 'Monthly' ? 1 : period === 'Quarterly' ? 3 : 12;
  return getPeriodRange(period, sastMidnight(s.year, s.month - back, 1), now);
}

// Monthly: weeks within the viewed month. Quarterly/Yearly: months within the period.
export function getTrendBuckets(period, referenceDate = new Date(), now = new Date()) {
  const { start, end } = getPeriodRange(period, referenceDate, now);
  const s = sastParts(start);
  const buckets = [];
  if (period === 'Monthly') {
    let weekStart = new Date(start);
    let weekNum = 1;
    while (sastParts(weekStart).month === s.month) {
      const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS - 1);
      buckets.push({ label: `W${weekNum}`, start: new Date(weekStart), end: weekEnd > end ? end : weekEnd });
      weekStart = new Date(weekStart.getTime() + 7 * DAY_MS);
      weekNum += 1;
      if (weekNum > 5) break;
    }
  } else {
    const monthCount = period === 'Quarterly' ? 3 : 12;
    for (let i = 0; i < monthCount; i++) {
      const monthStart = sastMidnight(s.year, s.month + i, 1);
      const monthEnd = new Date(sastMidnight(s.year, s.month + i + 1, 1).getTime() - 1);
      const label = MONTH_LABELS[(s.month + i) % 12];
      buckets.push({ label, start: monthStart, end: monthEnd, future: monthStart > end });
    }
  }
  return buckets;
}
