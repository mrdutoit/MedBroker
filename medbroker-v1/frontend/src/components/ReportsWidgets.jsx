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
 */

import { useState } from 'react';
import { s, colors, radius, shadow, type } from '../styles/tokens.js';
// 27 Sep 2026 (app-design-pass, Reports page completion) — Recharts
// removed from this file (and from the app: nothing else imported it).
// The ring and the trend are now hand-built, interactive components in
// components/viz/; KpiCard and Sparkline are replaced by viz/MetricStrip.
import BreakdownRing from './viz/BreakdownRing.jsx';
import TrendLines from './viz/TrendLines.jsx';

// ─── Formatting — shared with Reports.jsx, single source of truth ──────────
export const fmt = v => `R${(v / 1000000).toFixed(2)}m`;
export const fmtDays = d => d === null || d === undefined ? '—' : `${d.toFixed(1)} days`;
export const fmtRatio = v => v === null || v === undefined ? '—' : v.toFixed(1);
export const fmtPct = v => v === null || v === undefined ? '—' : `${v.toFixed(1)}%`;

// 15 Aug 2026 (§175) — fixed hex values, deliberately NOT theme CSS
// variables (var(--accent) etc.) — a rotating multi-colour palette needs
// to stay mutually distinct regardless of which of the app's own accent
// themes is currently selected; tying rotation to a single theme
// variable wouldn't make sense here the way it does for the rest of this
// file's semantic colours. 'Not captured' / neutral buckets use
// colors.ink400 instead of a palette slot — see DonutBreakdown's own
// comment for why that stays a special case, not just another category.
export const CATEGORICAL_PALETTE = ['#2563eb', '#0d9488', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];

// ─── KpiCard + Sparkline — REPLACED 27 Sep 2026 by components/viz/
// MetricStrip.jsx (app-design-pass skill). Same value / prior-period
// delta / lowerIsBetter / "no prior-period data" semantics and the same
// per-bucket sparkline, now one hairline-divided instrument strip rather
// than a grid of identical cards, with a sparkline that answers hover
// and keyboard focus. Only Reports.jsx ever used either (grep-confirmed).

// ─── Donut — 15 Aug 2026 (§175), REDESIGNED REPEATEDLY through 16 Aug
// 2026 (§179, §180, §182, §183, §184). Genuine parts-of-a-whole data
// ONLY (every item sums to 100% of something real) — see this file's
// own header comment for why the ranked tables and sequential pipeline
// stages don't use this.
//
// §187 — Mark, after the §184/§186 patches: "it seems that you are
// deliberately making things worse... tell me if that looks like it
// was designed by a data scientist for the information, and a design
// studio for the UX?" Fair. Every prior pass fixed something real in
// isolation (a stray cursor artifact, unequal heights, a redundant bar
// list, a trivial single-category ring) without ever addressing the
// actual root cause: this component had almost no visual weight of its
// own — a narrow column, a bare number, a tiny below-legend with no
// values shown — so no amount of show/hide logic could make it read as
// intentional. Removing cards (§186) just moved the emptiness around
// rather than fixing what was empty about the cards that remained.
//
// Mark supplied a concrete reference (a real analytics dashboard) and
// was explicit: keep this app's own theme system and colour tokens,
// change the STRUCTURE. Three concrete, specific things that reference
// does that this component didn't:
//   1. The donut has a real centre label (the total, not decoration) —
//      the ring itself carries information beyond its slice angles.
//   2. The legend sits BESIDE the donut with real values and
//      percentages always visible — not a hover-only mystery, not a
//      bare colour-key underneath with numbers you have to go find.
//   3. Every card has real visual weight regardless of how many
//      categories are in it — nothing in that reference is a bare
//      number in a mostly-empty box.
//
// REBUILT accordingly. §184's separate "compact stat" branch for a
// single real category is GONE — a real donut with a centre label and
// a one-row legend is MORE informative at n=1 than a bare number ever
// was (it still shows the count, the category name, AND the percentage
// in the same visual language as every other card), and having one
// consistent treatment instead of two is itself part of "reads like
// one coherent product." A single-slice ring is no longer awkward
// because it's not standing alone anymore — the centre label and the
// legend row give it the same weight as a genuinely multi-category one.
export function DonutBreakdown({ data, isMobile, emptyMessage, notCapturedMessage, title }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const realTotal = data.filter(d => d.label !== 'Not captured').reduce((sum, d) => sum + d.value, 0);

  const cardStyle = {
    display: 'flex', flexDirection: 'column', gap: '14px',
    // 16 Aug 2026 (§189) — border/radius/shadow changed from one-off
    // values (radius.lg, shadow.xs) to the SAME shared tokens s.card and
    // s.metricCard already use everywhere else on this page (KPI cards,
    // Section wrapper, in fact everywhere in the whole app) — colors.line
    // (not colors.lineSoft), radius.md, shadow.sm. Mark's ask was for
    // "a contemporary design system," not a new one sitting beside the
    // existing one; this card was quietly using a different border
    // weight and shadow than its own siblings, which undermines exactly
    // the "reads like one coherent product" goal §187 was aiming for.
    padding: '20px 22px', border: `1px solid ${colors.line}`, borderRadius: radius.md,
    background: colors.surface, boxShadow: shadow.sm,
    width: isMobile ? '100%' : '360px',
    // minHeight — 18 Aug 2026, raised from a flat 184px at Mark's
    // request ("slightly higher, almost responsive"). Mobile keeps a
    // flat floor deliberately: clamp()'s vw term scales off the FULL
    // viewport width, and on a narrow portrait phone that number is too
    // small to mean anything (21vw of a 375px screen is ~79px) — using
    // it there would make cards SHORTER, the opposite of the ask.
    // Desktop gets a real clamp(): 210px floor (up from 184px), scaling
    // gently with viewport up to a 250px ceiling — genuinely responsive
    // within a bounded range, not just one more fixed pixel value.
    minHeight: isMobile ? '210px' : 'clamp(210px, 20vw, 250px)',
    boxSizing: 'border-box',
    justifyContent: total === 0 || realTotal === 0 ? 'center' : 'flex-start',
  };
  // Reserved regardless of whether `title` is actually passed — a
  // title-less card and a titled card need identical internal
  // structure for flexbox's own align-items:stretch to equalise a row
  // of them correctly (§183's own finding, still true here).
  const titleSlot = (
    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.ink500, height: '16px', lineHeight: '16px', visibility: title ? 'visible' : 'hidden' }}>
      {title || '\u00A0'}
    </div>
  );

  if (total === 0) {
    return (
      <div style={{ ...cardStyle, alignItems: 'center' }}>
        {titleSlot}
        <div style={{ fontSize: '0.8125rem', color: colors.ink400, textAlign: 'center' }}>
          {emptyMessage ?? 'No data for this period.'}
        </div>
      </div>
    );
  }
  if (realTotal === 0) {
    return (
      <div style={{ ...cardStyle, alignItems: 'center' }}>
        {titleSlot}
        <div style={{ fontSize: '0.8125rem', color: colors.ink400, textAlign: 'center' }}>
          {notCapturedMessage ?? emptyMessage ?? 'Not captured for this period.'}
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      {titleSlot}
      {/* 27 Sep 2026 — ring + legend now BreakdownRing (components/viz/),
          hand-built and interactive; see its header. Card chrome, title
          slot, width, minHeight and both empty states above are
          unchanged — they carry the §179-§191 layout decisions. */}
      <BreakdownRing data={data} title={title} />
    </div>
  );
}

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
