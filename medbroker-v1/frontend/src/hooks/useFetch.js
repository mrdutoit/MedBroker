/**
 * hooks/useFetch.js
 * Generic data-fetching hook with loading, error, and refetch states.
 * Accepts a fetch function and calls it on mount (or when deps change).
 * 30 Sep 2026 — only the latest call may set state; a slower, older response is ignored.
 *
 * @example
 * const { data, loading, error, refetch } = useFetch(() => leadsApi.list({ status: 'Assigned' }));
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createLatestGuard } from './latestOnly.js';

export function useFetch(fetchFn, deps = []) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const guard = useRef(null);
  if (!guard.current) guard.current = createLatestGuard();

  const execute = useCallback(async () => {
    const id = guard.current.next();
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      if (guard.current.isLatest(id)) setData(result);
    } catch (err) {
      if (guard.current.isLatest(id)) setError(err);
    } finally {
      if (guard.current.isLatest(id)) setLoading(false);
    }
  }, deps);

  useEffect(() => {
    execute();
  }, [execute]);

  return { data, loading, error, refetch: execute };
}
