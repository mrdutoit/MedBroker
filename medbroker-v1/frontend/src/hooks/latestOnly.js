/** 30 Sep 2026 — request counter: only the most recent call may commit its result. */
export function createLatestGuard() {
  let current = 0;
  return { next: () => ++current, isLatest: (id) => id === current };
}
