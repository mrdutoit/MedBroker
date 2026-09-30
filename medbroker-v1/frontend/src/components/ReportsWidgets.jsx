/**
 * components/ReportsWidgets.jsx — NEW, 14 Aug 2026 (§156/§162).
 * Shared presentational pieces for the rebuilt Reports page. Split out of
 * Reports.jsx itself because these are genuinely reusable building blocks
 * (a KPI card with a delta, a sortable ranked table) rather than one-off
 * markup — matches this app's existing components/ directory pattern
 * (PeriodSelector.jsx already lives here for the same reason).
 *
 * Visual direction, from §156's own brief: contemporary premium-SaaS
 * restraint (Linear/Stripe/Attio-class information hierarchy, not their
 * branding). Dense but not cluttered. Large numbers, strong headings, no
 * microscopic labels. Restrained semantic colour — green/red/neutral used
 * MEANINGFULLY (a real direction, a real comparison). Real empty/low-data
 * states, not a chart rendering ridiculously at n=1.
 *
 * REVERSED 15 Aug 2026 (§175): §156's original brief explicitly ruled out
 * "one colour per category" rotating donuts for share-of-whole data (this
 * comment used to say so directly). Mark asked for exactly that, pointing
 * at a concrete reference (a donut + value-share list from another app of
 * his) — genuine, specific design feedback, not an oversight to quietly
 * paper over. CATEGORICAL_PALETTE and DonutBreakdown (below) are the
 * result — used ONLY for genuine parts-of-a-whole data (a cancellation/
 * loss reason, a won/lost split — every item sums to 100% of something
 * real), never for the ranked tables or the sequential pipeline stages,
 * where a rotating category colour would still be decoration, not
 * information, and the original restraint principle still holds.
 * RETIRED 27 Sep 2026: every ring is gone (see the note where
 * DonutBreakdown used to be); the rotating palette went with them.
 */

import { useState } from 'react';
import { s, colors, radius, shadow, type } from '../styles/tokens.js';
// 27 Sep 2026 (app-design-pass, Reports page completion) — Recharts
// removed from this file (and from the app: nothing else imported it).
// The ring and the trend are now hand-built, interactive components in
// components/viz/; KpiCard and Sparkline are replaced by viz/MetricStrip.
import TrendLines from './viz/TrendLines.jsx';
import { formatRand } from '../utils/formatMoney.js';

// ─── Formatting — shared with Reports.jsx, single source of truth ──────────
export const fmt = formatRand;
export const fmtDays = d => d === null || d === undefined ? '—' : `${d.toFixed(1)} days`;
export const fmtRatio = v => v === null || v === undefined ? '—' : v.toFixed(1);
export const fmtPct = v => v === null || v === undefined ? '—' : `${v.toFixed(1)}%`;

// ─── KpiCard + Sparkline — REPLACED 27 Sep 2026 by components/viz/
// MetricStrip.jsx (app-design-pass skill). Same value / prior-period
// delta / lowerIsBetter / "no prior-period data" semantics and the same
// per-bucket sparkline, now one hairline-divided instrument strip rather
// than a grid of identical cards, with a sparkline that answers hover
// and keyboard focus. Only Reports.jsx ever used either (grep-confirmed).

// ─── DonutBreakdown + CATEGORICAL_PALETTE — REMOVED 27 Sep 2026 (later).
// Every ring on Reports was replaced from the canvas mock-up Mark approved:
// region/outcome/loss reasons → components/viz/OutcomeFlow, portfolio →
// PortfolioSplit, meeting type → SplitFigures, cancellation reasons →
// ReasonRows. The §175-§191 rules the rings carried (values and shares
// always visible, never hover-only; honest "Not captured"; show a
// breakdown whenever there's any data) are kept by those components. The
// full ring history is in Status_Vercel_Archive.md. Only Reports.jsx ever
// used either (grep-confirmed).

// ─── Empty / low-data state — deliberately designed, not a chart at n=1 ────
export function EmptyState({ message }) {
  return (
    <div style={{
      padding: '28px 16px', textAlign: 'center', color: colors.ink400,
      fontSize: '0.8125rem', border: `1px dashed ${colors.line}`, borderRadius: radius.sm,
    }}>
      {message}
    </div>
  );
}

// ─── Primary trend chart — 27 Sep 2026: now a thin wrapper around
// components/viz/TrendLines.jsx (hand-built, interactive; same five
// series, same separate scales, same clickable legend, same defaults —
// see its header). Kept here under the same name so Reports.jsx's call
// site and empty state are unchanged.
export function TrendChart({ data, isMobile }) {
  if (!data || data.length === 0) return <EmptyState message="No activity yet this period." />;
  return <TrendLines data={data} isMobile={isMobile} />;
}

// ─── Pipeline health — REPLACED by components/viz/PipelineJourney.jsx
// (app-design-pass skill, Reports page pilot; designed 24 Sep 2026,
// delivered 27 Sep 2026). Same data (stage counts + stage-to-stage
// conversion), new visual treatment — kept, modernised, not dropped.
// stageColour() and PipelineHealth removed together; grep confirmed
// neither had any other call site. The 15-16 Aug 2026 design history
// that lived in PipelineHealth's comment (why the sequential stages
// aren't parts-of-a-whole, why Win Rate moved to Won vs Lost, §182) is
// preserved in Status_Vercel_Archive.md and still holds.

// ─── Ranked / sortable table — reused across Broker, Agent, Lead Source,
// Portfolio Performance. `highlightKey` gets a subtle inline bar, matching
// the brief's "subtle inline bars", not a rotating-colour chart. ───────────
export function DataTable({ columns, rows, defaultSortKey, defaultSortDir = 'desc', highlightKey, onRowClick, emptyMessage }) {
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [sortDir, setSortDir] = useState(defaultSortDir);

  if (!rows || rows.length === 0) return <EmptyState message={emptyMessage ?? 'No data for this period.'} />;

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    const an = typeof av === 'string' ? parseFloat(av) || 0 : av ?? 0;
    const bn = typeof bv === 'string' ? parseFloat(bv) || 0 : bv ?? 0;
    return sortDir === 'asc' ? an - bn : bn - an;
  });
  const highlightMax = highlightKey ? Math.max(...rows.map(r => {
    const v = r[highlightKey];
    return typeof v === 'string' ? parseFloat(v) || 0 : v ?? 0;
  }), 1) : 1;

  function toggleSort(key) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  return (
    <div style={s.tableCard}>
      <table style={s.table}>
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key} onClick={col.sortable === false ? undefined : () => toggleSort(col.key)}
                style={{ ...s.th, textAlign: col.align ?? 'left', cursor: col.sortable === false ? 'default' : 'pointer', userSelect: 'none' }}
              >
                {col.label}{sortKey === col.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.id ?? i} style={{ ...s.tr, cursor: onRowClick ? 'pointer' : 'default' }}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onMouseEnter={e => onRowClick && (e.currentTarget.style.background = colors.surfaceMuted)}
              onMouseLeave={e => onRowClick && (e.currentTarget.style.background = 'transparent')}
            >
              {columns.map(col => {
                const raw = row[col.key];
                const numeric = typeof raw === 'string' ? parseFloat(raw) || 0 : raw ?? 0;
                return (
                  <td key={col.key} style={{ ...s.td, textAlign: col.align ?? 'left' }}>
                    {col.key === highlightKey && rows.length > 1 ? (
                      // 15 Aug 2026 — the bar is only meaningful when
                      // there's something to compare it against; a
                      // single-row table (rows.length === 1, checked
                      // here rather than on `sorted`, since that's
                      // already been through the same-length sort above)
                      // rendered it at 100% width every time regardless
                      // of the actual value, conveying nothing but
                      // visual weight. Matches this file's own header
                      // comment: "not a chart rendering ridiculously at
                      // n=1." Width also capped at 85%, not 100%, for
                      // n>1 tables — same reasoning as the reason-list
                      // bars in Reports.jsx: the single largest value
                      // filling the ENTIRE track read as more dominant
                      // than the underlying data actually supports.
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start' }}>
                        <div style={{ width: '46px', height: '5px', background: colors.surfaceSubtle, borderRadius: radius.pill, overflow: 'hidden', flexShrink: 0 }}>
                          <div style={{ width: `${Math.min(85, Math.max(4, (numeric / highlightMax) * 85))}%`, height: '100%', background: colors.primary, borderRadius: radius.pill }} />
                        </div>
                        <span style={{ fontWeight: 600 }}>{col.render ? col.render(row) : raw}</span>
                      </div>
                    ) : (
                      col.render ? col.render(row) : raw
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section wrapper — consistent card chrome for every dashboard section ──
export function Section({ title, subtitle, children, right }) {
  return (
    <div style={{ ...s.card, marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
        <div>
          <h3 style={{ fontFamily: type.display, fontSize: '1rem', fontWeight: 700, color: colors.ink, margin: 0 }}>{title}</h3>
          {subtitle && <p style={{ fontSize: '0.75rem', color: colors.ink500, margin: '2px 0 0' }}>{subtitle}</p>}
        </div>
        {right}
      </div>
      <div style={{ borderBottom: `1px solid ${colors.lineSoft}`, marginTop: '10px', marginBottom: '14px' }} />
      {children}
    </div>
  );
}
