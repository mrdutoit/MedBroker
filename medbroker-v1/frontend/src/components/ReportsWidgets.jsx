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
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { s, colors, radius, type } from '../styles/tokens.js';

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

/**
 * Direction -> colour, respecting `lowerIsBetter` (Avg Days to Close: a
 * DROP is the good direction, same underlying computeDelta() shape as
 * every other KPI, just inverted display semantics for this one metric).
 */
function deltaColour(direction, lowerIsBetter) {
  if (direction === 'flat') return colors.ink500;
  const isGood = lowerIsBetter ? direction === 'down' : direction === 'up';
  return isGood ? colors.success : colors.danger;
}
function deltaArrow(direction) {
  return direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→';
}

// ─── Sparkline — tiny inline trend, no axes, no grid, deliberately quiet ───
export function Sparkline({ data, dataKey, colour, height = 32 }) {
  if (!data || data.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line type="monotone" dataKey={dataKey} stroke={colour} strokeWidth={1.75} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * KpiCard — value, prior-period delta with direction + colour, optional
 * sparkline. This is the brief's own item 2 spelled out per-card: "current
 * value + prior period + %/pt change + direction, sparkline where useful."
 */
export function KpiCard({ label, current, format, deltaPct, direction, lowerIsBetter, sparklineData, sparklineKey, sparklineColour }) {
  const formatted =
    format === 'currency' ? fmt(current ?? 0) :
    format === 'ratio'    ? fmtRatio(current) :
    format === 'percent'  ? fmtPct(current) :
    format === 'days'     ? fmtDays(current) :
    (current ?? 0).toLocaleString();
  const hasDelta = deltaPct !== null && deltaPct !== undefined;
  return (
    <div style={s.metricCard}>
      <div style={s.kpiLabel}>{label}</div>
      <div style={s.kpiValue}>{formatted}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', minHeight: '20px' }}>
        {hasDelta ? (
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: deltaColour(direction, lowerIsBetter), display: 'flex', alignItems: 'center', gap: '3px' }}>
            {deltaArrow(direction)} {Math.abs(deltaPct)}% <span style={{ color: colors.ink400, fontWeight: 400 }}>vs last period</span>
          </span>
        ) : (
          <span style={{ fontSize: '0.75rem', color: colors.ink400 }}>No prior-period data</span>
        )}
      </div>
      {sparklineData && sparklineData.length >= 2 && (
        <div style={{ marginTop: '6px' }}>
          <Sparkline data={sparklineData} dataKey={sparklineKey} colour={sparklineColour ?? colors.primary} />
        </div>
      )}
    </div>
  );
}

// ─── Donut — 15 Aug 2026 (§175), REDESIGNED 16 Aug 2026 (§179, §180).
// Genuine parts-of-a-whole data ONLY (every item sums to 100% of
// something real: a cancellation reason, a loss reason, a won/lost
// split) — see this file's own header comment for why the ranked
// tables and sequential pipeline stages don't use this.
//
// §179 fixed the stray Recharts default-cursor artifact on hover
// (cursor={false}, below) and split the donut from its own breakdown
// list into two separate bordered panels, matching Mark's investment-
// tracker reference structurally.
//
// §180 REMOVES the breakdown-list panel entirely — Mark's own words:
// "having a bar chart and donut chart showing the EXACT same thing is
// superfluous... I don't want the bar chart with the same data
// displayed." Splitting into two panels (§179) fixed how it LOOKED but
// not the actual complaint: a bar list repeating numbers the donut
// already shows (now via hover) is still repeating them, panel or no
// panel. DonutBreakdown is now a single self-contained donut widget —
// chart + a plain, number-free colour-key legend, nothing else. Where a
// second visual is actually wanted alongside a donut, it now has to be
// DIFFERENT data (Won by Region next to Lost by Region, for instance —
// see Reports.jsx's Won vs Lost section), never a second rendering of
// the same numbers the donut already carries. Optional `title` renders
// a small label above the chart — needed now that a single section can
// hold more than one of these side by side (e.g. "Won" / "Lost" as a
// pair under a shared "By Region" heading) with no other way to tell
// them apart.
export function DonutBreakdown({ data, isMobile, emptyMessage, title }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return <EmptyState message={emptyMessage ?? 'No data for this period.'} />;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
      padding: '18px', border: `1px solid ${colors.lineSoft}`, borderRadius: radius.md,
      width: isMobile ? '100%' : '200px', boxSizing: 'border-box',
    }}>
      {title && <div style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.ink500 }}>{title}</div>}
      <div style={{ width: '150px', height: '150px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data} dataKey="value" nameKey="label"
              innerRadius="62%" outerRadius="100%" paddingAngle={data.length > 1 ? 2 : 0}
              stroke="none" isAnimationActive={false}
            >
              {data.map(d => <Cell key={d.label} fill={d.colour} />)}
            </Pie>
            {/* cursor={false} — §179. Recharts' Tooltip cursor defaults to
                true, built for Cartesian charts; a <Pie> has no column for
                it to highlight, so leaving it on renders a stray rectangle
                unrelated to the chart. */}
            <Tooltip
              cursor={false}
              formatter={(value, name) => {
                const pct = total === 0 ? 0 : Math.round((value / total) * 100);
                return [`${value} (${pct}%)`, name];
              }}
              contentStyle={{ background: colors.surface, border: `1px solid ${colors.line}`, borderRadius: radius.sm, fontSize: '0.8125rem' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
        {data.map(d => (
          <span key={d.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: colors.ink500 }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: d.colour, flexShrink: 0 }} />
            {d.label}
          </span>
        ))}
      </div>
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

// ─── Primary trend chart — multi-series, toggleable, dual-axis (counts vs
// currency live on genuinely different scales) ──────────────────────────────
const TREND_SERIES = [
  { key: 'leads',       label: 'Leads',        colour: colors.primary,  axis: 'left'  },
  { key: 'appts',       label: 'Appointments', colour: '#7c3aed',       axis: 'left'  },
  { key: 'won',         label: 'Won',          colour: colors.success,  axis: 'left'  },
  { key: 'lost',        label: 'Lost',         colour: colors.danger,   axis: 'left'  },
  { key: 'policyValue', label: 'Policy Value', colour: '#d97706',       axis: 'right' },
];

export function TrendChart({ data, isMobile }) {
  const [hidden, setHidden] = useState(new Set(['policyValue', 'lost']));
  if (!data || data.length === 0) return <EmptyState message="No activity yet this period." />;

  function toggle(key) {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
        <LineChart data={data} margin={{ top: 8, right: isMobile ? 8 : 16, bottom: 4, left: isMobile ? -16 : 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.lineSoft} vertical={false} />
          <XAxis dataKey="label" stroke={colors.ink500} fontSize={11} />
          <YAxis yAxisId="left" stroke={colors.ink500} fontSize={11} allowDecimals={false} />
          <YAxis yAxisId="right" orientation="right" stroke={colors.ink500} fontSize={11} tickFormatter={v => `R${(v / 1000000).toFixed(1)}m`} />
          <Tooltip
            formatter={(value, name) => {
              const series = TREND_SERIES.find(sr => sr.label === name);
              return [series?.key === 'policyValue' ? fmt(value) : value, name];
            }}
            contentStyle={{ background: colors.surface, border: `1px solid ${colors.line}`, borderRadius: radius.sm, fontSize: '0.8125rem' }}
          />
          {TREND_SERIES.map(sr => !hidden.has(sr.key) && (
            <Line
              key={sr.key} yAxisId={sr.axis} type="monotone" dataKey={sr.key} name={sr.label}
              stroke={sr.colour} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {/* Custom legend, not Recharts' built-in — needs to stay clickable
          even for series currently hidden (Recharts' own <Legend> only
          renders entries for series that are actually mounted). */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '4px' }}>
        {TREND_SERIES.map(sr => {
          const isHidden = hidden.has(sr.key);
          return (
            <button
              key={sr.key} onClick={() => toggle(sr.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', padding: '2px 4px',
                color: isHidden ? colors.ink400 : colors.ink700, opacity: isHidden ? 0.5 : 1,
              }}
            >
              <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: sr.colour, display: 'inline-block' }} />
              {sr.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Pipeline health — stage counts + stage-to-stage conversion, bottleneck
// visually obvious via colour on the connector, not just a number ──────────
function stageColour(ratio) {
  if (ratio === null) return colors.ink400;
  if (ratio >= 0.7) return colors.success;
  if (ratio >= 0.4) return colors.warn;
  return colors.danger;
}

/**
 * REDESIGNED TWICE — 15 Aug 2026, both times real feedback, not
 * successive guesses. First pass (this comment, same day, earlier):
 * fixed a genuine structural bug (four side-by-side boxes made bar
 * WIDTHS impossible to compare even though the percentages were already
 * correct) by switching to a shared-scale vertical stack. Mark's
 * follow-up went further: the bars still "just show a number... aren't
 * being compared to anything else" — correct, and a deeper point than
 * the first fix addressed. The sequential stages (Unassigned/Assigned/
 * In Progress/Appointment Booked) aren't parts-of-a-whole data at all —
 * a lead doesn't split across them, it's a snapshot of where each lead
 * in this period's cohort currently sits. A bar chart implies "these
 * add up to something," which was never true here, so no amount of
 * rescaling could make it read as meaningful. Dropped bars from the
 * sequential stages entirely — just the count, the label, and the real
 * stage-to-stage conversion % that already existed (that number was
 * always the actually useful part).
 *
 * Closed Won/Closed Lost ARE genuine parts-of-a-whole (every closed deal
 * is exactly one or the other) — replaced with DonutBreakdown, the same
 * component now used for Cancellation/Loss reasons, framed as what it
 * actually is: a win rate.
 */
export function PipelineHealth({ stages, stageConversion, isMobile }) {
  if (!stages || stages.every(s2 => s2.count === 0)) {
    return <EmptyState message="No leads in the pipeline this period." />;
  }
  const sequential = stages.slice(0, 4); // Unassigned/Assigned/In Progress/Appointment Booked — see reportService.js's own comment on why Closed Won/Lost aren't a 5th sequential stage
  const won  = stages.find(s2 => s2.status === 'Closed Won')?.count ?? 0;
  const lost = stages.find(s2 => s2.status === 'Closed Lost')?.count ?? 0;

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? '4px' : '0' }}>
        {sequential.map((stage, i) => (
          <div key={stage.status} style={{ display: 'flex', alignItems: 'center', flex: isMobile ? 'none' : 1 }}>
            <div style={{ flex: 1, textAlign: isMobile ? 'left' : 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: colors.ink }}>{stage.count}</div>
              <div style={{ fontSize: '0.75rem', color: colors.ink500, marginTop: '2px' }}>{stage.status}</div>
            </div>
            {i < sequential.length - 1 && stageConversion[i] && (
              <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', alignItems: 'center', gap: isMobile ? '6px' : '2px', padding: isMobile ? '2px 0' : '0 10px', flexShrink: 0 }}>
                <span style={{ fontSize: '0.9rem', color: colors.ink400 }}>{isMobile ? '↓' : '→'}</span>
                <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: stageColour(stageConversion[i].ratio), whiteSpace: 'nowrap' }}>
                  {stageConversion[i].ratio === null ? 'No prior data' : `${Math.round(stageConversion[i].ratio * 100)}%`}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${colors.lineSoft}` }}>
        <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: colors.ink400, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '12px' }}>
          Win Rate
        </div>
        <DonutBreakdown
          isMobile={isMobile}
          data={[
            { label: 'Closed Won', value: won, colour: colors.success },
            { label: 'Closed Lost', value: lost, colour: colors.danger },
          ]}
          emptyMessage="No closed appointments this period."
        />
      </div>
    </div>
  );
}

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
