import { describe, it, expect } from 'vitest';
import { createLatestGuard } from './latestOnly.js';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

// Mirrors useFetch's execute(): only the latest call may commit its result.
function run(guard, store, p) {
  const id = guard.next();
  return p.then(v => { if (guard.isLatest(id)) store.data = v; });
}

describe('createLatestGuard', () => {
  it('ignores an older response that resolves after a newer one', async () => {
    const guard = createLatestGuard(); const store = { data: null };
    const a = deferred(); const b = deferred();
    const pa = run(guard, store, a.promise); const pb = run(guard, store, b.promise);
    b.resolve('second'); await pb;
    a.resolve('first'); await pa;
    expect(store.data).toBe('second');
  });
  it('accepts the only call', async () => {
    const guard = createLatestGuard(); const store = { data: null };
    await run(guard, store, Promise.resolve('only'));
    expect(store.data).toBe('only');
  });
});
