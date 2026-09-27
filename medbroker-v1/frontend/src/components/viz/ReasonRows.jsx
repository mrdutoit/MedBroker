import { useState } from 'react';
import './viz.css';

/**
 * components/viz/ReasonRows.jsx — NEW, 27 Sep 2026 (app-design-pass,
 * Reports page). Ranked, directly labelled rows for a set of reasons that
 * each count once (cancellation reasons; loss reasons on a phone, where
 * the OutcomeFlow's third column doesn't fit). Replaces the reason rings.
 *
 * Label, a bar scaled to the largest reason, then count and share of the
 * whole — all always visible, never hover-only (the §175 rule the rings
 * kept). Long reasons get a full label column instead of wrapping onto
 * three lines beside a 112px ring. "Not captured" is hatched; a muted
 * branch (e.g. "Closed before an appointment") is grey.
 *
 * Every row is a real <button>: hover or focus emphasises it and steps
 * the others back.
 *
 * rows: [{ key, label, count, notCaptured?, muted? }], total: the whole the
 * shares are of. `colour` is the bar colour for real reasons.
 */
export default function ReasonRows({ rows, total, colour = 'var(--accent)', label }) {
  const [active, setActive] = useState(null);
  const max = Math.max(1, ...rows.map(r => r.count));
  const share = n => (total > 0 ? `${Math.round((n / total) * 100)}%` : '—');
  return (
    <ul className="mbv-reasons" aria-label={label}>
      {rows.map(r => (
        <li key={r.key}>
          <button
            type="button"
            className={`mbv-reason${active === r.key ? ' active' : ''}${active !== null && active !== r.key ? ' dim' : ''}`}
            aria-label={`${r.label}: ${r.count}, ${share(r.count)}`}
            onPointerEnter={() => setActive(r.key)}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(r.key)}
            onBlur={() => setActive(null)}
          >
            <span className="mbv-reason-name">{r.label}</span>
            <span className="mbv-reason-track">
              <span
                className={`mbv-reason-bar${r.notCaptured ? ' hatched' : ''}`}
                style={{ width: `${(r.count / max) * 100}%`, ...(r.notCaptured ? {} : { background: r.muted ? 'var(--mut)' : colour }) }}
              />
            </span>
            <span className="mbv-reason-value">{r.count} <span className="mbv-reason-pct">{share(r.count)}</span></span>
          </button>
        </li>
      ))}
    </ul>
  );
}
