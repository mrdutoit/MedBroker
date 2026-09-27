import { useId, useRef, useState } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth.js';
import ReasonRows from './ReasonRows.jsx';
import './viz.css';

/**
 * components/viz/OutcomeFlow.jsx — NEW, 27 Sep 2026 (app-design-pass,
 * Reports page; approved by Mark from the canvas mock-up the same day).
 * Replaces the Overall, By Region · Won and By Region · Lost rings and
 * the Loss reasons ring in Won vs Lost.
 *
 * CONCEPT: the PipelineJourney hero ends by forking into Closed Won and
 * Closed Lost; this picks up at that fork. Closed deals flow from the
 * region they came from into Won or Lost, and Lost fans out into why.
 * Bands start in the logo's blue and turn into the outcome colour — the
 * same continuous-stroke language as the hero.
 *
 * DATA SEMANTICS (checked against reportService.js, getDashboardReport):
 *   - Region → outcome is a genuine flow: every closed deal has exactly one
 *     region ('Not captured' included), so region bands sum to the Won and
 *     Lost nodes. Node sizes are those sums, never an independent count.
 *   - Lost → reason: lossReasons counts closed-lost APPOINTMENTS. Lost also
 *     includes leads closed with no appointment at all (the regionNoAppt
 *     query), which can have no loss reason. The difference is drawn as
 *     its own branch, "Closed before an appointment" — shown, never hidden.
 *   - There is NO region × reason breakdown in the data, so tracing a
 *     region lights its region → outcome bands only, not any reason. (The
 *     canvas mock-up traced Western Cape through to a reason; that was
 *     illustrative and would have been invented data.)
 *
 * INTERACTION: every node is a real <button> over the drawing — hover or
 * keyboard focus traces everything connected to it and shows a detail
 * card. On a phone the third column doesn't fit legibly, so the flow stops
 * at Won/Lost and the reasons follow as ranked rows (ReasonRows).
 */

const PX_MAX = 44;           // px per deal at small volumes
const SLOT_MIN = 42;         // room a two-line label needs
const NODE_W = 10;

function ribbon(x1, a1, b1, x2, a2, b2) {
  const m = (x1 + x2) / 2;
  return `M${x1} ${a1} C${m} ${a1} ${m} ${a2} ${x2} ${a2} L${x2} ${b2} C${m} ${b2} ${m} ${b1} ${x1} ${b1} Z`;
}

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    if (a.notCaptured !== b.notCaptured) return a.notCaptured ? 1 : -1;
    return b.count - a.count;
  });
}

const fmtValue = v => `R${(v / 1000000).toFixed(2)}m`;
const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');

export default function OutcomeFlow({ wonByRegion, lostByRegion, lossReasons, policyValue, isMobile }) {
  const ref = useRef(null);
  const width = useElementWidth(ref);
  const uid = useId().replace(/:/g, '');
  const [active, setActive] = useState(null); // { kind, key }

  // ── Data
  const regionMap = new Map();
  for (const r of wonByRegion ?? []) regionMap.set(r.region, { won: r.count, lost: 0 });
  for (const r of lostByRegion ?? []) regionMap.set(r.region, { ...(regionMap.get(r.region) ?? { won: 0 }), lost: r.count });
  const regions = [...regionMap.entries()]
    .map(([name, v]) => ({ key: `r:${name}`, label: name, won: v.won, lost: v.lost, count: v.won + v.lost, notCaptured: name === 'Not captured' }))
    .filter(r => r.count > 0);
  const regionsSorted = sortRows(regions);
  const wonTotal = regions.reduce((s, r) => s + r.won, 0);
  const lostTotal = regions.reduce((s, r) => s + r.lost, 0);
  if (wonTotal + lostTotal === 0) return null;

  // Keys are namespaced (r: region, x: reason) — 'Not captured' can be both.
  const reasonRows = sortRows((lossReasons ?? []).filter(r => r.count > 0).map(r => ({ ...r, key: `x:${r.key}` })));
  const reasonsTotal = reasonRows.reduce((s, r) => s + r.count, 0);
  const before = lostTotal - reasonsTotal;
  const reasonsConsistent = before >= 0;
  const reasons = reasonsConsistent
    ? [...reasonRows, ...(before > 0 ? [{ key: 'x:__before', label: 'Closed before an appointment', count: before, muted: true }] : [])]
    : [];
  const showReasonsColumn = !isMobile && lostTotal > 0 && reasons.length > 0;

  // ── Geometry, in measured pixels
  const top = 40;
  // Phone: a wider label column and a compact outcome label, so the bands
  // keep real length at 390px (first build had 12px bands and overlapping
  // column headings — caught in the phone screenshot).
  const labelL = isMobile ? 118 : 176;
  const xL = labelL + 10;
  const xR = showReasonsColumn ? width - 210 : null;
  const xM = showReasonsColumn ? Math.round((xL + NODE_W + xR) / 2) : width - (isMobile ? 96 : 150);
  const avail = isMobile ? 250 : 300;
  const px = Math.min(PX_MAX, avail / Math.max(1, wonTotal + lostTotal));

  // Left column
  let y = 0;
  const left = regionsSorted.map(r => {
    const h = Math.max(2, r.count * px);
    const slot = Math.max(h, SLOT_MIN);
    const node = { ...r, slotTop: y, slotH: slot, y: y + (slot - h) / 2, h };
    y += slot + 12;
    return node;
  });
  const leftH = y - 12;

  // Middle column
  const mid = [];
  let my = 0;
  for (const [key, count] of [['won', wonTotal], ['lost', lostTotal]]) {
    if (count === 0) continue;
    const h = Math.max(2, count * px);
    const slot = Math.max(h, SLOT_MIN + 4);
    mid.push({ key, count, slotTop: my, slotH: slot, y: my + (slot - h) / 2, h });
    my += slot + 48;
  }
  const midH = my - 48;
  const colH = Math.max(leftH, midH);
  const leftOff = top + (colH - leftH) / 2;
  const midOff = top + (colH - midH) / 2;
  left.forEach(n => { n.y += leftOff; n.slotTop += leftOff; });
  mid.forEach(n => { n.y += midOff; n.slotTop += midOff; });
  const wonNode = mid.find(n => n.key === 'won');
  const lostNode = mid.find(n => n.key === 'lost');

  // Right column, centred on the Lost node
  let right = [];
  if (showReasonsColumn && lostNode) {
    let ry = 0;
    right = reasons.map(r => {
      const h = Math.max(2, r.count * px);
      const slot = Math.max(h, SLOT_MIN);
      const node = { ...r, slotTop: ry, slotH: slot, y: ry + (slot - h) / 2, h };
      ry += slot + 10;
      return node;
    });
    const rH = ry - 10;
    const off = Math.max(top, lostNode.y + lostNode.h / 2 - rH / 2);
    right.forEach(n => { n.y += off; n.slotTop += off; });
  }

  const bottom = Math.max(
    ...left.map(n => n.slotTop + n.slotH),
    ...(lostNode ? [lostNode.y + lostNode.h + 44] : []),
    ...(wonNode ? [wonNode.slotTop + wonNode.slotH] : []),
    ...right.map(n => n.slotTop + n.slotH),
  );
  const height = Math.ceil(bottom + 12);

  // Bands
  const bands = [];
  const wonCur = { v: wonNode?.y ?? 0 }, lostCur = { v: lostNode?.y ?? 0 };
  for (const n of left) {
    let cur = n.y;
    for (const [outcome, count, target, curRef] of [['won', n.won, wonNode, wonCur], ['lost', n.lost, lostNode, lostCur]]) {
      if (!count || !target) continue;
      const h = count * px;
      bands.push({ id: `${n.key}>${outcome}`, from: n.key, to: outcome, d: ribbon(xL + NODE_W, cur, cur + h, xM, curRef.v, curRef.v + h), fill: `url(#${uid}-${outcome})` });
      cur += h; curRef.v += h;
    }
  }
  if (showReasonsColumn && lostNode) {
    let cur = lostNode.y;
    for (const r of right) {
      const h = r.count * px;
      bands.push({ id: `lost>${r.key}`, from: 'lost', to: r.key, d: ribbon(xM + NODE_W, cur, cur + h, xR, r.y, r.y + h), fill: r.muted ? 'var(--mut)' : (r.notCaptured ? `url(#${uid}-hatch)` : 'var(--pl-lost)'), reason: true });
      cur += h;
    }
  }

  // Tracing
  const lit = new Set();
  if (active) {
    const k = active.key;
    for (const b of bands) {
      const on = (active.kind === 'region' && b.from === k)
        || (active.kind === 'won' && b.to === 'won')
        || (active.kind === 'lost' && (b.to === 'lost' || b.from === 'lost'))
        || (active.kind === 'reason' && b.to === k);
      if (on) { lit.add(b.id); lit.add(b.from); lit.add(b.to); }
    }
    lit.add(k);
  }
  const isDim = key => active !== null && !lit.has(key);

  // Detail card content. Placement (27 Sep 2026, from the hover screenshot):
  // beside the node, the card covered the very path being traced (and the
  // "won" label). On desktop, region/won/lost cards sit in the plot's
  // top-right corner, clear of the traced bands; a reason's card sits just
  // left of its node, over bands that are dimmed while it's active. On a
  // phone the region card drops below its label.
  const corner = { x: width, y: 26, side: 'l' };  // below the column headings
  let card = null;
  if (active && width > 0) {
    if (active.kind === 'region') {
      const n = left.find(r => r.key === active.key);
      card = { ...(isMobile ? { x: 4, y: n.slotTop + n.slotH, side: 'r' } : corner), title: n.label,
        rows: [['Closed', n.count], ['Won', n.won], ['Lost', n.lost], ['Win rate', pct(n.won, n.count)]] };
    } else if (active.kind === 'won') {
      card = { ...(isMobile ? { x: xM - 12, y: wonNode.slotTop + wonNode.slotH, side: 'l' } : corner), title: 'Won',
        rows: [['Deals', wonTotal], ...(policyValue > 0 ? [['Policy value', fmtValue(policyValue)]] : []), ['Share of closed', pct(wonTotal, wonTotal + lostTotal)]] };
    } else if (active.kind === 'lost') {
      card = { ...(isMobile ? { x: xM - 12, y: lostNode.y + lostNode.h + 44, side: 'l' } : corner), title: 'Lost',
        rows: [['Deals', lostTotal], ...(reasonsConsistent ? [['With a loss reason recorded', reasonRows.filter(r => !r.notCaptured).reduce((s, r) => s + r.count, 0)]] : []), ...(before > 0 ? [['Closed before an appointment', before]] : [])] };
    } else {
      const n = right.find(r => r.key === active.key);
      card = { x: xR - 12, y: n.slotTop, side: 'l', title: n.label, rows: [['Deals', n.count], ['Share of lost', pct(n.count, lostTotal)]] };
    }
  }

  const on = (kind, key) => ({
    onPointerEnter: () => setActive({ kind, key }),
    onPointerLeave: () => setActive(null),
    onFocus: () => setActive({ kind, key }),
    onBlur: () => setActive(null),
  });

  return (
    <div className="mbv-flow">
      <div ref={ref} className="mbv-flow-plot" style={{ height: width > 0 ? `${height}px` : '240px' }}>
        {width > 0 && (
          <>
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
              <defs>
                {/* userSpaceOnUse — pitfalls.md: objectBoundingBox gradients vanish on flat shapes. */}
                <linearGradient id={`${uid}-won`} gradientUnits="userSpaceOnUse" x1={xL + NODE_W} y1="0" x2={xM} y2="0">
                  <stop offset="0" stopColor="#1A7FCF" /><stop offset="1" stopColor="var(--pl-won)" />
                </linearGradient>
                <linearGradient id={`${uid}-lost`} gradientUnits="userSpaceOnUse" x1={xL + NODE_W} y1="0" x2={xM} y2="0">
                  <stop offset="0" stopColor="#1A7FCF" /><stop offset="1" stopColor="var(--pl-lost)" />
                </linearGradient>
                <pattern id={`${uid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" className="mbv-hatch-line-strong" />
                </pattern>
              </defs>

              <text x={xL + NODE_W / 2} y="18" textAnchor="middle" className="mbv-flow-col">Region</text>
              <text x={xM + NODE_W / 2} y="18" textAnchor="middle" className="mbv-flow-col">Outcome</text>
              {showReasonsColumn && <text x={xR + NODE_W / 2} y="18" textAnchor="middle" className="mbv-flow-col">Why it was lost</text>}

              {bands.map(b => (
                <path key={b.id} d={b.d} fill={b.fill}
                  className={`mbv-flow-band${b.reason ? ' reason' : ''}${active ? (lit.has(b.id) ? ' lit' : ' dim') : ''}`} />
              ))}

              {left.map(n => (
                <g key={n.key} className={isDim(n.key) ? 'mbv-dim' : ''}>
                  <rect x={xL} y={n.y} width={NODE_W} height={n.h} rx="3" fill={n.notCaptured ? `url(#${uid}-hatch)` : 'var(--accent)'} className={n.notCaptured ? 'mbv-flow-node hatched' : 'mbv-flow-node'} />
                  <text x={xL - 12} y={n.slotTop + n.slotH / 2 - 3} textAnchor="end" className="mbv-flow-label">{n.label}</text>
                  <text x={xL - 12} y={n.slotTop + n.slotH / 2 + 14} textAnchor="end" className="mbv-flow-sub">{n.count} closed, {n.won === 0 ? 'none' : pct(n.won, n.count)} won</text>
                </g>
              ))}

              {wonNode && (
                <g className={isDim('won') ? 'mbv-dim' : ''}>
                  <rect x={xM} y={wonNode.y} width={NODE_W} height={wonNode.h} rx="3" fill="var(--pl-won)" className="mbv-flow-node" />
                  <text x={xM + NODE_W + 14} y={wonNode.y + wonNode.h / 2 + (policyValue > 0 ? 0 : 8)} className="mbv-flow-big">{wonTotal} won</text>
                  {policyValue > 0 && <text x={xM + NODE_W + 14} y={wonNode.y + wonNode.h / 2 + 20} className="mbv-flow-sub">{fmtValue(policyValue)}{isMobile ? '' : ' in policy value'}</text>}
                </g>
              )}
              {lostNode && (
                <g className={isDim('lost') ? 'mbv-dim' : ''}>
                  <rect x={xM} y={lostNode.y} width={NODE_W} height={lostNode.h} rx="3" fill="var(--pl-lost)" className="mbv-flow-node" />
                  <text x={xM + NODE_W / 2} y={lostNode.y + lostNode.h + 32} textAnchor="middle" className="mbv-flow-big">{lostTotal} lost</text>
                </g>
              )}

              {right.map(n => (
                <g key={n.key} className={isDim(n.key) ? 'mbv-dim' : ''}>
                  <rect x={xR} y={n.y} width={NODE_W} height={n.h} rx="3" fill={n.muted ? 'var(--mut)' : n.notCaptured ? `url(#${uid}-hatch)` : 'var(--pl-lost)'} className={n.notCaptured ? 'mbv-flow-node hatched' : 'mbv-flow-node'} />
                  <text x={xR + NODE_W + 12} y={n.slotTop + n.slotH / 2 - 3} className="mbv-flow-label">{n.label}</text>
                  <text x={xR + NODE_W + 12} y={n.slotTop + n.slotH / 2 + 14} className="mbv-flow-sub">{n.count} {n.count === 1 ? 'deal' : 'deals'}, {pct(n.count, lostTotal)} of lost</text>
                </g>
              ))}
            </svg>

            {/* Real buttons over each node + its label: hover and keyboard focus trace the flow. */}
            {left.map(n => (
              <button key={n.key} type="button" className="mbv-flow-hit"
                style={{ left: 0, top: n.slotTop, width: xL + NODE_W + 4, height: n.slotH }}
                aria-label={`${n.label}: ${n.count} closed, ${n.won} won, ${n.lost} lost, win rate ${pct(n.won, n.count)}`}
                {...on('region', n.key)} />
            ))}
            {wonNode && (
              <button type="button" className="mbv-flow-hit"
                style={{ left: xM - 4, top: wonNode.slotTop, width: 150, height: wonNode.slotH }}
                aria-label={`Won: ${wonTotal} deals${policyValue > 0 ? `, ${fmtValue(policyValue)} in policy value` : ''}`}
                {...on('won', 'won')} />
            )}
            {lostNode && (
              <button type="button" className="mbv-flow-hit"
                style={{ left: xM - 40, top: lostNode.y, width: NODE_W + 80, height: lostNode.h + 44 }}
                aria-label={`Lost: ${lostTotal} deals${before > 0 ? `, ${before} closed before an appointment` : ''}`}
                {...on('lost', 'lost')} />
            )}
            {right.map(n => (
              <button key={n.key} type="button" className="mbv-flow-hit"
                style={{ left: xR - 4, top: n.slotTop, width: Math.max(0, width - xR + 4), height: n.slotH }}
                aria-label={`${n.label}: ${n.count} of ${lostTotal} lost deals, ${pct(n.count, lostTotal)}`}
                {...on('reason', n.key)} />
            ))}

            {card && (
              <div className={`mbv-tip mbv-tip-side ${card.side === 'l' ? 'mbv-tip-side-l' : 'mbv-tip-side-r'}`} style={{ left: card.x, top: card.y }} role="tooltip">
                <div className="mbv-tip-title">{card.title}</div>
                {card.rows.map(([k, v]) => (
                  <div key={k} className="mbv-tip-row"><span className="mbv-tip-label">{k}</span><span>{v}</span></div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {isMobile && lostTotal > 0 && reasons.length > 0 && (
        <div className="mbv-flow-mobile-reasons">
          <div className="mbv-subpanel-kicker">Why deals were lost</div>
          <ReasonRows rows={reasons} total={lostTotal} colour="var(--pl-lost)" label="Why deals were lost" />
        </div>
      )}
    </div>
  );
}
