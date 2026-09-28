import { useRef, useState } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth.js';
import { monotonePath } from './curve.js';
import './viz.css';

/**
 * components/viz/TrendLines.jsx — NEW, 27 Sep 2026 (app-design-pass
 * skill, Reports page completion). Replaces the Recharts LineChart that
 * TrendChart (ReportsWidgets.jsx) used to render.
 *
 * Kept, unchanged in meaning: the same five series from the same trend
 * buckets; counts and policy value on genuinely separate scales (policy
 * value gets its own right-hand scale, shown only while that series is
 * visible); the clickable legend that hides/shows a series, including
 * series currently hidden; Policy Value and Lost hidden by default.
 *
 * Changed:
 *   - Hand-built SVG in real measured pixels (1 unit = 1 CSS px), so type
 *     and dots never stretch.
 *   - Hover/scrub snaps to the nearest period (chart-primitives.md rule
 *     4: many small marks), with one guide line and one card listing every
 *     visible series for that period. Keyboard: Tab onto the chart, then
 *     Left/Right/Home/End; Escape clears. Legend entries are real toggle
 *     buttons (aria-pressed).
 *   - Periods that haven't happened yet (`future`, reportService 27 Sep)
 *     are not drawn as zeros — the lines stop at the last real period and
 *     the remainder is a faint hatched band labelled "Still to come".
 *   - Monotone curves (curve.js) — CHANGED 27 Sep 2026 at Mark's request
 *     from straight segments. Monotone, not generic smoothing: it never
 *     overshoots, so the rounding can't invent a peak or dip.
 *
 * Tooltip placement: beside the guide line (right, or left near the
 * right edge), hanging from the top of the plot — never above it, so no
 * ancestor can clip it (the 24 Sep PipelineJourney lesson).
 */

export const TREND_SERIES = [
  { key: 'leads',       label: 'Leads',        colour: 'var(--accent)',  scale: 'count' },
  { key: 'appts',       label: 'Appointments', colour: '#7c3aed',        scale: 'count' },
  { key: 'won',         label: 'Won',          colour: 'var(--live)',    scale: 'count' },
  { key: 'lost',        label: 'Lost',         colour: 'var(--danger)',  scale: 'count' },
  { key: 'policyValue', label: 'Policy value', colour: '#d97706',        scale: 'value' },
];

const fmtValue = v => `R${(v / 1000000).toFixed(2)}m`;
const fmtValueTick = v => (v === 0 ? 'R0' : `R${(v / 1000000).toFixed(1)}m`);

// A "nice" ceiling and tick step so gridlines land on round numbers.
function niceScale(max, ticks = 4) {
  if (max <= 0) return { top: ticks, step: 1 };
  const raw = max / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = nice * mag;
  return { top: step * ticks, step };
}

// series / defaultHidden / label — 27 Sep 2026: generalised so Agent
// Detail's calls-and-bookings activity uses the same chart. Reports passes
// nothing and gets exactly what it had.
export default function TrendLines({ data, isMobile, series = TREND_SERIES, defaultHidden = ['policyValue', 'lost'], label = 'Trend over the period' }) {
  const ref = useRef(null);
  const width = useElementWidth(ref);
  const [hidden, setHidden] = useState(() => new Set(defaultHidden));
  const [active, setActive] = useState(null);

  const visible = series.filter(sr => !hidden.has(sr.key));
  const showValue = visible.some(sr => sr.scale === 'value');
  const realCount = data.findIndex(d => d.future);
  const lastReal = (realCount === -1 ? data.length : realCount) - 1;

  const height = isMobile ? 230 : 290;
  const padL = isMobile ? 30 : 40;
  const padR = showValue ? (isMobile ? 44 : 54) : 12;
  const padT = 12;
  const padB = 26;
  const plotW = Math.max(0, width - padL - padR);
  const plotH = height - padT - padB;

  const real = data.slice(0, lastReal + 1);
  const countMax = Math.max(0, ...real.flatMap(d => visible.filter(sr => sr.scale === 'count').map(sr => d[sr.key] ?? 0)));
  const valueMax = Math.max(0, ...real.map(d => d.policyValue ?? 0));
  const countScale = niceScale(countMax);
  const valueScale = niceScale(valueMax);

  const n = data.length;
  const x = i => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yFor = (sr, v) => {
    const sc = sr.scale === 'value' ? valueScale : countScale;
    return padT + plotH - (v / sc.top) * plotH;
  };

  const labelEvery = n <= (isMobile ? 7 : 13) ? 1 : Math.ceil(n / (isMobile ? 6 : 10));

  function toggle(key) {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function setFromPointer(e) {
    if (!plotW || lastReal < 0) return;
    const rect = ref.current.getBoundingClientRect();
    const rel = (e.clientX - rect.left - padL) / plotW;
    const i = Math.round(rel * (n - 1));
    setActive(Math.max(0, Math.min(lastReal, i)));
  }
  function onKey(e) {
    if (lastReal < 0) return;
    const cur = active ?? lastReal;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); setActive(Math.max(0, cur - 1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setActive(Math.min(lastReal, cur + 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End')  { e.preventDefault(); setActive(lastReal); }
    else if (e.key === 'Escape') { setActive(null); }
  }

  const countTicks = [];
  for (let v = 0; v <= countScale.top + 1e-9; v += countScale.step) countTicks.push(v);
  const valueTicks = [];
  for (let v = 0; v <= valueScale.top + 1e-9; v += valueScale.step) valueTicks.push(v);

  const tipOnLeft = active !== null && x(active) > width - 200;
  const futureStart = lastReal + 1 < n ? (x(lastReal) + x(lastReal + 1)) / 2 : null;

  return (
    <div className="mbv-trend">
      <div
        ref={ref}
        className="mbv-trend-plot"
        style={{ height: `${height}px` }}
        tabIndex={0}
        role="group"
        aria-label={`${label} — use the arrow keys to step through each period`}
        onPointerMove={setFromPointer}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(a => a ?? lastReal)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
      >
        {width > 0 && (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
            <defs>
              <pattern id="mbv-trend-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" className="mbv-hatch-line" />
              </pattern>
            </defs>

            {/* Count scale — the gridlines carry meaning here (reading a
                value off the chart), so they stay, but faint. */}
            {countTicks.map(v => {
              const yy = padT + plotH - (v / countScale.top) * plotH;
              return (
                <g key={`c${v}`}>
                  <line x1={padL} x2={padL + plotW} y1={yy} y2={yy} className="mbv-grid" />
                  <text x={padL - 8} y={yy + 4} textAnchor="end" className="mbv-axis">{Number.isInteger(v) ? v : v.toFixed(1)}</text>
                </g>
              );
            })}
            {showValue && valueTicks.map(v => {
              const yy = padT + plotH - (v / valueScale.top) * plotH;
              return <text key={`v${v}`} x={padL + plotW + 8} y={yy + 4} textAnchor="start" className="mbv-axis">{fmtValueTick(v)}</text>;
            })}

            {futureStart !== null && (
              <g>
                <rect x={futureStart} y={padT} width={padL + plotW - futureStart + 6} height={plotH} fill="url(#mbv-trend-hatch)" />
                {/* Label only where it fits — on a phone the band can be
                    ~40px wide and the text would run off the chart. The
                    hatching alone still reads as "not yet". */}
                {padL + plotW - futureStart >= 90 && (
                  <text x={futureStart + 8} y={padT + 14} className="mbv-axis">Still to come</text>
                )}
              </g>
            )}

            {data.map((d, i) => (i % labelEvery === 0 || i === n - 1) && (
              <text key={`x${i}`} x={x(i)} y={height - 8} textAnchor="middle" className={`mbv-axis${i === active ? ' mbv-axis-active' : ''}`}>{d.label}</text>
            ))}

            {active !== null && <line x1={x(active)} x2={x(active)} y1={padT} y2={padT + plotH} className="mbv-guide" />}

            {visible.map(sr => {
              if (lastReal < 0) return null;
              const d = monotonePath(real.map((pt, i) => ({ x: x(i), y: yFor(sr, pt[sr.key] ?? 0) })));
              return (
                <g key={sr.key}>
                  <path d={d} fill="none" stroke={sr.colour} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {real.length <= 16 && real.map((pt, i) => (
                    <circle key={i} cx={x(i)} cy={yFor(sr, pt[sr.key] ?? 0)} r={i === active ? 4.5 : 2.5} fill={sr.colour} className="mbv-trend-dot" />
                  ))}
                  {real.length > 16 && active !== null && (
                    <circle cx={x(active)} cy={yFor(sr, real[active][sr.key] ?? 0)} r={4.5} fill={sr.colour} className="mbv-trend-dot" />
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {active !== null && width > 0 && (
          <div
            className={`mbv-tip mbv-tip-side ${tipOnLeft ? 'mbv-tip-side-l' : 'mbv-tip-side-r'}`}
            style={{ left: x(active), top: padT }}
            role="tooltip"
          >
            <div className="mbv-tip-title">{data[active].label}</div>
            {visible.length === 0 ? (
              <div className="mbv-tip-label">No series selected</div>
            ) : visible.map(sr => (
              <div key={sr.key} className="mbv-tip-row">
                <span className="mbv-tip-label"><span className="mbv-key" style={{ background: sr.colour }} />{sr.label}</span>
                <span>{sr.scale === 'value' ? fmtValue(data[active][sr.key] ?? 0) : (data[active][sr.key] ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mbv-legend" role="group" aria-label="Show or hide a series">
        {series.map(sr => {
          const on = !hidden.has(sr.key);
          return (
            <button key={sr.key} type="button" className={`mbv-legend-item${on ? '' : ' off'}`} aria-pressed={on} onClick={() => toggle(sr.key)}>
              <span className="mbv-key" style={{ background: sr.colour }} />
              {sr.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
