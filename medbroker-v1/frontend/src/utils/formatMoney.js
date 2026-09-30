/** 30 Sep 2026 — one rand formatter: R1.84m / R45k / R4,000; null/undefined -> em dash. */
export function formatRand(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  if (n >= 1e6) return 'R' + (n / 1e6).toFixed(2) + 'm';
  if (n >= 1e4) return 'R' + Math.round(n / 1000) + 'k';
  const whole = String(Math.round(n));
  return 'R' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
