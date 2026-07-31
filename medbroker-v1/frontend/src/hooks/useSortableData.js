/**
 * hooks/useSortableData.js — NEW.
 * Client-side column sorting for a table — click a header to sort by
 * it, click again to reverse direction, click a different header to
 * switch to that one (ascending). Deliberately client-side: every table
 * in this app that would use this is personal/org-scale (dozens to a
 * few hundred rows — Users, Tasks, a single agent's Leads view), not the
 * kind of dataset that needs server-side sorting with pagination.
 *
 * Usage:
 *   const { sorted, sortKey, sortDirection, requestSort } =
 *     useSortableData(users, 'displayName', 'asc');
 *   ...
 *   <th onClick={() => requestSort('displayName')}>
 *     Name {sortKey === 'displayName' && (sortDirection === 'asc' ? '▲' : '▼')}
 *   </th>
 *
 * Nulls/undefined always sort to the end regardless of direction — the
 * common convention (an empty "Region" column shouldn't jump to the top
 * just because the direction flipped).
 */
import { useState, useMemo, useCallback } from 'react';

export function useSortableData(items, defaultKey = null, defaultDirection = 'asc') {
  const [sortKey, setSortKey]             = useState(defaultKey);
  const [sortDirection, setSortDirection] = useState(defaultDirection);

  const requestSort = useCallback((key) => {
    if (key === sortKey) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  }, [sortKey]);

  const sorted = useMemo(() => {
    if (!sortKey) return items;
    const withIndex = items.map((item, i) => ({ item, i })); // stable sort — see comment below
    withIndex.sort((a, b) => {
      const av = a.item[sortKey];
      const bv = b.item[sortKey];
      const aEmpty = av === null || av === undefined || av === '';
      const bEmpty = bv === null || bv === undefined || bv === '';
      if (aEmpty && bEmpty) return a.i - b.i;
      if (aEmpty) return 1;  // empty always last, regardless of direction
      if (bEmpty) return -1;

      let cmp;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });

      if (cmp === 0) return a.i - b.i; // stable — preserve original relative order on ties
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return withIndex.map(w => w.item);
  }, [items, sortKey, sortDirection]);

  return { sorted, sortKey, sortDirection, requestSort };
}
