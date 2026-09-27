import { useState } from 'react';
import './viz.css';

/**
 * components/viz/SplitFigures.jsx — NEW, 27 Sep 2026 (app-design-pass,
 * Reports page). A small parts-of-a-whole split (Meeting type: in person
 * vs virtual) as large figures over one proportional bar. Replaces the
 * Meeting Type ring: with two or three categories, the figures ARE the
 * story, and one bar shows the proportion more exactly than an angle.
 *
 * Each figure is a real <button>; hover or focus picks out its segment.
 * parts: [{ key, label, count, colour }], total: their sum.
 */
export default function SplitFigures({ parts, total, label }) {
  const [active, setActive] = useState(null);
  const share = n => (total > 0 ? Math.round((n / total) * 100) : 0);
  return (
    <div className="mbv-split" role="group" aria-label={label}>
      <div className="mbv-split-figures">
        {parts.map(p => (
          <button
            key={p.key}
            type="button"
            className={`mbv-split-figure${active !== null && active !== p.key ? ' dim' : ''}`}
            aria-label={`${p.label}: ${p.count}, ${share(p.count)}%`}
            onPointerEnter={() => setActive(p.key)}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(p.key)}
            onBlur={() => setActive(null)}
          >
            <span className="mbv-split-count">{p.count}</span>
            <span className="mbv-split-label">
              <span className="mbv-key" style={{ background: p.colour }} />{p.label} <span className="mbv-split-pct">{share(p.count)}%</span>
            </span>
          </button>
        ))}
      </div>
      <div className="mbv-split-bar" aria-hidden="true">
        {parts.filter(p => p.count > 0).map(p => (
          <span
            key={p.key}
            className={`mbv-split-seg${active !== null && active !== p.key ? ' dim' : ''}`}
            style={{ flexGrow: p.count, background: p.colour }}
          />
        ))}
      </div>
    </div>
  );
}
