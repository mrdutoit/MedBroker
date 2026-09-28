import { useId, useRef, useState } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth.js';
import './viz.css';

/**
 * components/viz/OrbitPanel.jsx — NEW, 28 Sep 2026 (app-design-pass).
 * Chosen by Mark from four canvas options ("Orbit") for the two role-page
 * heroes: Agent Detail (calls) and Broker Detail (appointments). Replaces
 * BranchFlow there; Reports' Won vs Lost keeps its flow.
 *
 * THE RULE THAT DECIDED WHERE IT GOES (Project_Context_Vercel.md): Orbit
 * draws ONE hierarchy — a total split into parts (inner ring), some parts
 * split again (outer ring). It fits calls → reached/not → outcome and
 * appointments → where each stands → why. It does NOT fit Won vs Lost,
 * where deals move between two independent breakdowns (region, outcome);
 * a ring there would have to drop one of them.
 *
 * Honest by construction:
 *   - Every count and share is always visible in the legend beside the
 *     orbit — angles are harder to compare than lengths, so no figure
 *     depends on reading one.
 *   - The tick ring marks one item per tick. Past TICK_LIMIT items the
 *     ticks would crowd into a solid band, so each tick then stands for
 *     several items, evenly spaced and coloured by the part it falls in,
 *     and the panel says how many ("Each tick marks 3 calls").
 *   - "No data" children (hatched: true) are hatched, never a colour.
 *
 * Interaction: every segment and legend row answers hover and keyboard
 * focus (legend rows are real <button>s): the other segments step back and
 * the centre switches from the total to that part's count and share — the
 * centre IS the detail card, as it was for the retired BreakdownRing, so
 * nothing floats over the thing it describes. A child also lights its
 * parent; a parent lights its children.
 *
 * props: eyebrow, title, subtitle, total, unit, unitOne,
 *   branches: [{ key, label, colour, count?, children?: [{ key, label,
 *               count, colour, hatched? }] }]   (count derived from
 *               children when given — the caller guarantees they sum)
 */

const TICK_LIMIT = 120;

function sector(cx, cy, r0, r1, a0, a1) {
  const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r1} ${r1} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} A${r0} ${r0} 0 ${large} 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`;
}
const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');

export default function OrbitPanel({ eyebrow, title, subtitle, total, unit, unitOne, branches, isMobile }) {
  const ref = useRef(null);
  const width = useElementWidth(ref);
  const uid = useId().replace(/:/g, '');
  const [active, setActive] = useState(null);
  const noun = n => (n === 1 ? (unitOne ?? unit) : unit);

  const header = (
    <>
      <p className="pj-eyebrow">{eyebrow}</p>
      <h3 className="pj-title">{title}</h3>
      <p className="pj-subtitle">{subtitle}</p>
    </>
  );
  const bs = (branches ?? [])
    .map(b => {
      const children = (b.children ?? []).filter(c => c.count > 0).map(c => ({ ...c, key: `${b.key}/${c.key}`, parent: b.key }));
      const n = b.children ? children.reduce((t, c) => t + c.count, 0) : (b.count ?? 0);
      return { ...b, children, n };
    })
    .filter(b => b.n > 0);
  if (total === 0 || bs.length === 0) {
    return <div className="pj-panel">{header}</div>;
  }

  // ── Geometry, in measured pixels
  const D = isMobile ? Math.min(width, 330) : Math.min(460, Math.max(300, width * 0.42));
  const R = D / 2;
  const cx = R, cy = R;
  const rIn0 = R * 0.50, rIn1 = R * 0.70;       // parts
  const rOut0 = R * 0.735, rOut1 = R * 0.84;    // sub-parts
  const rT0 = R * 0.885, rT1 = R * 0.935;       // ticks
  const rOrbit = R * 0.985;
  const GAP = 0.018;                            // radians between segments
  const START = -Math.PI / 2;
  const perItem = (2 * Math.PI) / total;

  let a = START;
  const parts = bs.map(b => {
    const a0 = a, a1 = a + b.n * perItem;
    let c0 = a0;
    // Siblings sharing a colour (three loss reasons, or no answer / voicemail
    // / wrong number) would read as one block — the first screenshot showed
    // it. Each repeat steps toward the panel's base colour (--hero-solid), so neighbours
    // differ in lightness, not only by the hairline gap.
    const seen = {};
    const kids = b.children.map(c => {
      const nth = seen[c.colour] = (seen[c.colour] ?? -1) + 1;
      const colour = nth === 0 || c.hatched ? c.colour : `color-mix(in srgb, ${c.colour} ${Math.max(40, 100 - nth * 24)}%, var(--hero-solid))`;
      const k = { ...c, colour, a0: c0, a1: c0 + c.count * perItem };
      c0 = k.a1;
      return k;
    });
    a = a1;
    return { ...b, a0, a1, kids };
  });
  const allKids = parts.flatMap(p => p.kids);

  // Ticks: one per item, or one per `step` items past the limit.
  const step = total > TICK_LIMIT ? Math.ceil(total / TICK_LIMIT) : 1;
  const ticks = [];
  for (let i = 0; i * step < total; i++) {
    const pos = (i * step + Math.min(step, total - i * step) / 2) * perItem + START;
    const owner = parts.find(p => pos >= p.a0 && pos < p.a1) ?? parts[parts.length - 1];
    ticks.push({ a: pos, colour: owner.colour, key: owner.key });
  }

  // Tracing: parent lights children, child lights parent.
  const activeKid = allKids.find(k => k.key === active);
  const litKeys = new Set();
  if (active) {
    litKeys.add(active);
    if (activeKid) litKeys.add(activeKid.parent);
    const p = parts.find(x => x.key === active);
    if (p) p.kids.forEach(k => litKeys.add(k.key));
  }
  const cls = (base, key) => `${base}${active ? (litKeys.has(key) ? ' lit' : ' dim') : ''}${active === key ? ' focus' : ''}`;

  const focusNode = parts.find(p => p.key === active) ?? activeKid;
  const centreFigure = focusNode ? (focusNode.n ?? focusNode.count) : total;
  const centreLine = focusNode
    ? `${focusNode.label}, ${pct(focusNode.n ?? focusNode.count, total)}`
    : noun(total);

  const on = key => ({
    onPointerEnter: () => setActive(key), onPointerLeave: () => setActive(null),
    onFocus: () => setActive(key), onBlur: () => setActive(null),
  });

  return (
    <div className="pj-panel">
      {header}
      <div ref={ref} className={`mbv-orbit${isMobile ? ' mobile' : ''}`}>
        {width > 0 && (
          <div className="mbv-orbit-dial" style={{ width: `${D}px`, height: `${D}px` }} onPointerLeave={() => setActive(null)}>
            <svg width={D} height={D} viewBox={`0 0 ${D} ${D}`} aria-hidden="true">
              <defs>
                <pattern id={`${uid}-hatch`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="5" height="5" fill="color-mix(in srgb, var(--hero-ink) 8%, transparent)" />
                  <line x1="0" y1="0" x2="0" y2="5" stroke="color-mix(in srgb, var(--hero-ink) 75%, transparent)" strokeWidth="1.5" />
                </pattern>
              </defs>
              <circle cx={cx} cy={cy} r={rOrbit} className="mbv-orbit-ring" />
              <circle cx={cx} cy={cy} r={rIn0 - R * 0.05} className="mbv-orbit-core" />
              {parts.map(p => (
                <path key={p.key} d={sector(cx, cy, rIn0, rIn1 + (active === p.key ? 4 : 0), p.a0 + GAP / 2, p.a1 - GAP / 2)}
                  fill={p.colour} className={cls('mbv-orbit-seg', p.key)} onPointerEnter={() => setActive(p.key)} />
              ))}
              {allKids.map(k => (
                <path key={k.key} d={sector(cx, cy, rOut0, rOut1 + (active === k.key ? 4 : 0), k.a0 + GAP / 2, k.a1 - GAP / 2)}
                  fill={k.hatched ? `url(#${uid}-hatch)` : k.colour} className={cls('mbv-orbit-seg sub', k.key)} onPointerEnter={() => setActive(k.key)} />
              ))}
              {ticks.map((t, i) => (
                <line key={i} x1={cx + rT0 * Math.cos(t.a)} y1={cy + rT0 * Math.sin(t.a)} x2={cx + rT1 * Math.cos(t.a)} y2={cy + rT1 * Math.sin(t.a)}
                  stroke={t.colour} className={cls('mbv-orbit-tick', t.key)} />
              ))}
            </svg>
            <div className="mbv-orbit-centre" aria-live="polite">
              <span className="mbv-orbit-figure">{centreFigure.toLocaleString()}</span>
              <span className="mbv-orbit-caption">{centreLine}</span>
            </div>
          </div>
        )}

        <div className="mbv-orbit-legend">
          {parts.map(p => (
            <div key={p.key} className="mbv-orbit-group">
              <button type="button" className={cls('mbv-orbit-row', p.key)}
                aria-label={`${p.label}: ${p.n} ${noun(p.n)}, ${pct(p.n, total)}`} {...on(p.key)}>
                <span className="mbv-orbit-swatch" style={{ background: p.colour }} />
                <span className="mbv-orbit-name">{p.label}</span>
                <span className="mbv-orbit-n">{p.n.toLocaleString()}</span>
                <span className="mbv-orbit-pct">{pct(p.n, total)}</span>
              </button>
              {p.kids.map(k => (
                <button key={k.key} type="button" className={cls('mbv-orbit-row sub', k.key)}
                  aria-label={`${k.label}: ${k.count} ${noun(k.count)}, ${pct(k.count, total)}`} {...on(k.key)}>
                  <span className={`mbv-orbit-swatch small${k.hatched ? ' hatched' : ''}`} style={k.hatched ? undefined : { background: k.colour }} />
                  <span className="mbv-orbit-name">{k.label}</span>
                  <span className="mbv-orbit-n">{k.count.toLocaleString()}</span>
                  <span className="mbv-orbit-pct">{pct(k.count, total)}</span>
                </button>
              ))}
            </div>
          ))}
          {step > 1 && <p className="mbv-orbit-note">Each tick on the outer ring marks {step} {unit}.</p>}
        </div>
      </div>
    </div>
  );
}
