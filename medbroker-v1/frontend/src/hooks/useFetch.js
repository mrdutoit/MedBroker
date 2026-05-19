/**
 * hooks/useFetch.js
 * Generic data-fetching hook with loading, error, and refetch states.
 * Accepts a fetch function and calls it on mount (or when deps change).
 *
 * @example
 * const { data, loading, error, refetch } = useFetch(() => leadsApi.list({ status: 'Assigned' }));
 */

import { useState, useEffect, useCallback } from 'react';

export function useFetch(fetchFn, deps = []) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    execute();
  }, [execute]);

  return { data, loading, error, refetch: execute };
}
