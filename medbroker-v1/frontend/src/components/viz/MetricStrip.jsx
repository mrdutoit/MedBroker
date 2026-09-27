import { useRef, useState } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth.js';
import { monotonePath } from './curve.js';
import './viz.css';

/**
 * components/viz/MetricStrip.jsx — NEW, 27 Sep 2026 (app-design-pass
 * skill, Reports page completion). Replaces KpiCard.
 *
 * WHY: every metric row on Reports was a grid of identical rounded cards
 * (6 in Executive Summary, 4 in Won vs Lost, 5 in Appointment Analysis,
 * 4 in the Agent/Broker self-view) — the "wall of identical stat cards"
 * design-language.md names as the generic-dashboard look to avoid. This is
 * ONE quiet instrument panel, metrics separated by hairlines, so the page's
 * only bold surface stays the PipelineJourney hero.
 *
 * Kept from KpiCard, unchanged in meaning: the value, the prior-period
 * delta with direction and good/bad colour (lowerIsBetter respected), the
 * honest "no prior-period data" fallback, and the per-bucket sparkline
 * where the trend has a matching series.
 *
 * NEW: the sparkline answers hover AND keyboard focus (chart-primitives.md
 * rule 3). The readout is written INLINE, in place of the delta line,
 * rather than as a floating card — the strip clips its rounded corners,
 * and a floating card inside a clipping container is exactly the
 * PipelineJourney tooltip bug from 24 Sep. Inline is also the calmer
 * choice for a 28px-tall line.
 *
 * Buckets flagged `future` (reportService, 27 Sep) are never drawn — the
 * line stops at the last bucket that has actually happened.
 */

export const fmtMetric = (v, format) => {
  if (v === null || v === undefined) return '—';
  if (format === 'currency') return `R${(v / 1000000).toFixed(2)}m`;
  if (format === 'ratio')    return v.toFixed(1);
  if (format === 'percent')  return `${v.toFixed(1)}%`;
  if (format === 'days')     return `${v.toFixed(1)} days`;
  return Number(v).toLocaleString();
};

function deltaTone(direction, lowerIsBetter) {
  if (direction === 'flat') return 'flat';
  const good = lowerIsBetter ? direction === 'down' : direction === 'up';
  return good ? 'good' : 'bad';
}

function Spark({ points, format, label, onActive }) {
  const ref = useRef(null);
  const width = useElementWidth(ref);
  const [active, setActive] = useState(null);
  const h = 30;
  const pad = 3;
  const values = points.map(p => p.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const x = i => pad + (points.length === 1 ? 0 : (i / (points.length - 1)) * (width - pad * 2));
  const y = v => h - pad - ((v - min) / span) * (h - pad * 2);

  function set(i) {
    setActive(i);
    onActive(i === null ? null : `${points[i].label}: ${fmtMetric(points[i].value, format)}`);
  }
  function fromPointer(e) {
    if (!width) return;
    const rect = ref.current.getBoundingClientRect();
    const rel = (e.clientX - rect.left - pad) / Math.max(1, width - pad * 2);
    set(Math.max(0, Math.min(points.length - 1, Math.round(rel * (points.length - 1)))));
  }
  function onKey(e) {
    const last = points.length - 1;
    const cur = active ?? last;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); set(Math.max(0, cur - 1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); set(Math.min(last, cur + 1)); }
    else if (e.key === 'Home') { e.preventDefault(); set(0); }
    else if (e.key === 'End')  { e.preventDefault(); set(last); }
    else if (e.key === 'Escape') { set(null); }
  }

  // Same monotone curve as the trend chart (27 Sep 2026) — one line language.
  const d = width ? monotonePath(points.map((p, i) => ({ x: x(i), y: y(p.value) }))) : '';
  return (
    <div
      ref={ref}
      className="mbv-spark"
      tabIndex={0}
      role="group"
      aria-label={`${label} trend — use the arrow keys to step through each period`}
      onPointerMove={fromPointer}
      onPointerLeave={() => set(null)}
      onFocus={() => set(active ?? points.length - 1)}
      onBlur={() => set(null)}
      onKeyDown={onKey}
    >
      {width > 0 && (
        <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} aria-hidden="true">
          <path d={`${d} L${x(points.length - 1).toFixed(1)} ${h} L${x(0).toFixed(1)} ${h} Z`} className="mbv-spark-area" />
          <path d={d} className="mbv-spark-line" />
          {active !== null && (
            <>
              <line x1={x(active)} x2={x(active)} y1={0} y2={h} className="mbv-spark-guide" />
              <circle cx={x(active)} cy={y(points[active].value)} r={3} className="mbv-spark-dot" />
            </>
          )}
        </svg>
      )}
    </div>
  );
}

function Cell({ item }) {
  const [readout, setReadout] = useState(null);
  const hasDelta = item.deltaPct !== null && item.deltaPct !== undefined;
  const tone = hasDelta ? deltaTone(item.direction, item.lowerIsBetter) : null;
  const arrow = item.direction === 'up' ? '↑' : item.direction === 'down' ? '↓' : '→';
  const points = (item.spark ?? []).filter(p => !p.future);
  return (
    <div className="mbv-strip-cell">
      <div className="mbv-strip-label">{item.label}</div>
      <div className="mbv-strip-value">{item.value}</div>
      {(hasDelta || item.note || item.showNoPrior || points.length >= 2) && (
      <div className="mbv-strip-meta" aria-live="polite">
        {readout ? (
          <span className="mbv-strip-readout">{readout}</span>
        ) : hasDelta ? (
          <span className={`mbv-delta mbv-delta-${tone}`}>
            {arrow} {Math.abs(item.deltaPct)}% <span className="mbv-strip-muted">on last period</span>
          </span>
        ) : item.note ? (
          <span className="mbv-strip-muted">{item.note}</span>
        ) : item.showNoPrior ? (
          <span className="mbv-strip-muted">No prior-period data</span>
        ) : null}
      </div>
      )}
      {points.length >= 2 && (
        <Spark points={points} format={item.sparkFormat} label={item.label} onActive={setReadout} />
      )}
    </div>
  );
}

/**
 * items: [{ key, label, value (already formatted), deltaPct, direction,
 *           lowerIsBetter, note, showNoPrior,
 *           spark: [{ label, value, future }], sparkFormat }]
 */
export default function MetricStrip({ items, label }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mbv-strip" style={{ '--cols': items.length }} role="group" aria-label={label}>
      {items.map(item => <Cell key={item.key ?? item.label} item={item} />)}
    </div>
  );
}
