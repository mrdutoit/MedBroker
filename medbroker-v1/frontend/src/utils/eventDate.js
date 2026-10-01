/** 30 Sep 2026 — event dates arrive as ISO timestamps; compare calendar days in local time. */
export function isPastEventDate(eventDate, now = new Date()) {
  const [y, m, d] = String(eventDate).slice(0, 10).split('-').map(Number);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return new Date(y, m - 1, d) < today;
}
