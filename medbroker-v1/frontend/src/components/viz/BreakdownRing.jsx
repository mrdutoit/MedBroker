import { useId, useState } from 'react';
import './viz.css';

/**
 * components/viz/BreakdownRing.jsx — NEW, 27 Sep 2026 (app-design-pass
 * skill, Reports page completion). The ring + legend inside
 * DonutBreakdown (ReportsWidgets.jsx), replacing the Recharts PieChart.
 *
 * Every rule the 15-18 Aug 2026 donut redesigns established is kept
 * (§175-§191, recorded on DonutBreakdown itself): a real centre label
 * (the total); the legend BESIDE the ring with value and share always
 * visible, never hover-only; long reason labels wrap without dragging the
 * value column down; identical treatment at one category or six.
 *
 * NEW:
 *   - Interactive (chart-primitives.md rule 3). Hovering a segment, or
 *     hovering / keyboard-focusing its legend row, isolates it: the other
 *     segments dim and the centre switches from the total to that
 *     category's count and share. The centre IS the detail card here — a
 *     floating card over a 112px ring would cover the thing it describes.
 *   - "Not captured" is hatched, not flat grey (design-language.md: no
 *     data is never a status colour). It was already kept out of the
 *     rotating palette for the same reason; now it also reads as absence.
 *   - Hover growth room: the ring's radius leaves space for the active
 *     segment to thicken without clipping (pitfalls.md).
 */

const SIZE = 112;
const STROKE = 13;
const GROW = 4;
const R = (SIZE - STROKE - GROW) / 2;
const C = 2 * Math.PI * R;

export default function BreakdownRing({ data, title }) {
  const uid = useId().replace(/:/g, '');
  const [active, setActive] = useState(null);
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const gap = data.length > 1 ? 2.5 : 0;

  let offset = 0;
  const segments = data.map(d => {
    const len = total === 0 ? 0 : (d.value / total) * C;
    const seg = { ...d, len: Math.max(0, len - gap), offset };
    offset += len;
    return seg;
  });
  const pctOf = v => (total === 0 ? 0 : Math.round((v / total) * 100));
  const act = active === null ? null : data[active];

  return (
    <div className="mbv-ring-wrap">
      <div className="mbv-ring" onPointerLeave={() => setActive(null)}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <defs>
            <pattern id={`hatch-${uid}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="5" height="5" className="mbv-hatch-bg" />
              <line x1="0" y1="0" x2="0" y2="5" className="mbv-hatch-line-strong" />
            </pattern>
          </defs>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} className="mbv-ring-track" strokeWidth={STROKE} fill="none" />
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {segments.map((sg, i) => (
              <circle
                key={sg.label}
                cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
                stroke={sg.label === 'Not captured' ? `url(#hatch-${uid})` : sg.colour}
                strokeWidth={active === i ? STROKE + GROW : STROKE}
                strokeDasharray={`${sg.len} ${C - sg.len}`}
                strokeDashoffset={-sg.offset}
                opacity={active === null || active === i ? 1 : 0.28}
                className="mbv-ring-seg"
                onPointerEnter={() => setActive(i)}
              />
            ))}
          </g>
        </svg>
        <div className="mbv-ring-centre" aria-live="polite">
          <span className="mbv-ring-figure">{act ? act.value : total}</span>
          <span className="mbv-ring-caption">{act ? `${pctOf(act.value)}%` : 'total'}</span>
        </div>
      </div>

      <ul className="mbv-ring-legend" aria-label={title ? `${title} breakdown` : 'Breakdown'}>
        {data.map((d, i) => (
          <li key={d.label}>
            <button
              type="button"
              className={`mbv-ring-row${active === i ? ' active' : ''}${active !== null && active !== i ? ' dim' : ''}`}
              aria-label={`${d.label}: ${d.value}, ${pctOf(d.value)}%`}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            >
              <span
                className={`mbv-ring-swatch${d.label === 'Not captured' ? ' hatched' : ''}`}
                style={d.label === 'Not captured' ? undefined : { background: d.colour }}
              />
              <span className="mbv-ring-name">{d.label}</span>
              <span className="mbv-ring-value">{d.value} <span className="mbv-ring-pct">({pctOf(d.value)}%)</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
