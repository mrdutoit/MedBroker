/** 30 Sep 2026 — quote a CSV cell; prefix ' so spreadsheets don't run attendee-supplied values as formulas. */
export function csvEscape(v) {
  let t = String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return `"${t.replace(/"/g, '""')}"`;
}
