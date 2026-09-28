import { useState } from 'react';
import './viz.css';

/**
 * components/viz/ValueStroke.jsx — NEW, 27 Sep 2026 (app-design-pass,
 * Broker Detail). The page's signature panel, replacing the "Products
 * Sold" bar list: the policy value this broker signed in the period, drawn
 * as one continuous stroke — the logo's own device — divided by product,
 * each segment's length its share of the value.
 *
 * DATA SEMANTICS (reportService.js, getBrokerDetailReport): productsSold
 * sums AppointmentProduct.policyValue on appointments CLOSED WON in the
 * period (closedAt), one row per product sold, so the segments genuinely
 * sum to the total — the same total the Policy value figure shows. Every
 * product also shows how many were sold, always visible.
 *
 * Colour: a ramp through the theme's journey gradient (--path-a/b/c)
 * by rank, not a rainbow — the categories are products, not statuses, and
 * the stroke should read as one thing.
 *
 * Every segment and row is a real <button>; hover or focus picks one out.
 * A product sold with no value recorded still gets its row; it has no
 * length to draw.
 */

// Ramp by rank along the theme's journey gradient (--path-a -> --path-b ->
// --path-c; the logo's blues on Midnight/Linen). color-mix, not computed
// rgb: the stops are theme tokens since 28 Sep 2026, unknown in JS.
function ramp(i, n) {
  if (n <= 1) return 'var(--path-b)';
  const t = i / (n - 1);
  if (t <= 0.5) return `color-mix(in srgb, var(--path-a) ${Math.round((1 - t / 0.5) * 100)}%, var(--path-b))`;
  return `color-mix(in srgb, var(--path-b) ${Math.round((1 - (t - 0.5) / 0.5) * 100)}%, var(--path-c))`;
}
const rand = v => `R${Math.round(v).toLocaleString('en-ZA')}`;
const fmtM = v => `R${(v / 1000000).toFixed(2)}m`;

// variant (28 Sep 2026): 'hero' (default) is the dark signature panel;
// 'plain' draws just the stroke and rows on the ambient page theme, for
// Broker Detail once AppointmentFlow became its hero (one bold panel per
// page). The caller supplies the section heading in 'plain'.
export default function ValueStroke({ productsSold, signed, variant = 'hero' }) {
  const [active, setActive] = useState(null);
  const products = [...(productsSold ?? [])].sort((a, b) => b.value - a.value);
  const total = products.reduce((t, p) => t + p.value, 0);
  const units = products.reduce((t, p) => t + p.count, 0);
  const share = v => (total > 0 ? `${Math.round((v / total) * 100)}%` : '—');
  const coloured = products.map((p, i) => ({ ...p, colour: ramp(i, products.length) }));
  const on = key => ({
    onPointerEnter: () => setActive(key), onPointerLeave: () => setActive(null),
    onFocus: () => setActive(key), onBlur: () => setActive(null),
  });

  const body = products.length > 0 && (
    <div className={`mbv-stroke${variant === 'plain' ? ' plain' : ''}`}>
      {total > 0 && (
        <div className="mbv-stroke-line" role="group" aria-label="Policy value by product">
          {coloured.filter(p => p.value > 0).map(p => (
            <button
              key={p.name} type="button"
              className={`mbv-stroke-seg${active === p.name ? ' active' : ''}${active !== null && active !== p.name ? ' dim' : ''}`}
              style={{ flexGrow: p.value, background: p.colour }}
              aria-label={`${p.name}: ${rand(p.value)}, ${share(p.value)} of the value`}
              {...on(p.name)}
            />
          ))}
        </div>
      )}
      <ul className="mbv-stroke-rows" aria-label="Products sold">
        {coloured.map(p => (
          <li key={p.name}>
            <button
              type="button"
              className={`mbv-stroke-row${active === p.name ? ' active' : ''}${active !== null && active !== p.name ? ' dim' : ''}`}
              aria-label={`${p.name}: ${p.count} sold, ${rand(p.value)}, ${share(p.value)} of the value`}
              {...on(p.name)}
            >
              <span className="mbv-stroke-swatch" style={{ background: p.colour }} />
              <span className="mbv-stroke-name">{p.name}<span className="mbv-stroke-count">{p.count} sold</span></span>
              <span className="mbv-stroke-value">{rand(p.value)}<span className="mbv-stroke-share">{share(p.value)}</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
  if (variant === 'plain') {
    return products.length > 0
      ? body
      : <p style={{ margin: 0, color: 'var(--mut)', fontSize: '0.875rem' }}>No policies signed this period.</p>;
  }

  return (
    <div className="pj-panel">
      <p className="pj-eyebrow">This period’s signed policy value</p>
      <h3 className="pj-title">{total > 0 ? fmtM(total) : 'Nothing signed yet'}</h3>
      <p className="pj-subtitle">
        {products.length > 0
          ? `${units} ${units === 1 ? 'product' : 'products'} across ${signed} signed ${signed === 1 ? 'deal' : 'deals'}. Each segment is one product’s share of the value.`
          : 'No policies signed this period.'}
      </p>
      {body}
    </div>
  );
}
