import { useId, useRef, useState } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth.js';
import ReasonRows from './ReasonRows.jsx';
import './viz.css';

/**
 * components/viz/BranchFlow.jsx — NEW, 28 Sep 2026 (app-design-pass).
 * The shared engine behind the detail-page heroes: one source (a count of
 * calls, or of appointments) flowing into a few branches, and some
 * branches fanning out into their own children. Extracted from CallFlow
 * (27 Sep) when Broker Detail needed the same shape for its appointments,
 * so the two pages draw with one piece of code rather than two copies.
 *
 * Same language as the Reports hero and OutcomeFlow: bands start in the
 * logo blue and turn into the branch colour, on the page's one dark panel.
 *
 * RULE the callers own: only use this where the bands genuinely sum —
 * every item in exactly one branch, every child counted once in its
 * branch. The components that call it document why their data qualifies.
 *
 * Every node is a real <button>: hover or focus traces what's connected and
 * shows a detail card in the empty top-left (beside a node it covered the
 * traced band — first CallFlow screenshot). Branch labels sit above their
 * nodes on desktop (beside them they sat on the outgoing bands); on a phone
 * the third column moves below as ranked rows and labels go beside.
 *
 * props:
 *   eyebrow, title, subtitle        header text on the dark panel
 *   total, unit ('calls' | …)       the source figure and its noun
 *   branches: [{ key, label, colour, children?: [{ key, label, count,
 *               colour, hatched?, muted? }], count? }]  (count is derived
 *               from children when they're given)
 *   childKicker                     heading for the phone's rows
 */

const NODE_W = 10;
const SLOT_MIN = 40;

function ribbon(x1, a1, b1, x2, a2, b2) {
  const m = (x1 + x2) / 2;
  return `M${x1} ${a1} C${m} ${a1} ${m} ${a2} ${x2} ${a2} L${x2} ${b2} C${m} ${b2} ${m} ${b1} ${x1} ${b1} Z`;
}
const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');

export default function BranchFlow({ eyebrow, title, subtitle, total, unit, branches, childKicker, isMobile }) {
  const ref = useRef(null);
  const width = useElementWidth(ref);
  const uid = useId().replace(/:/g, '');
  const [active, setActive] = useState(null);

  const header = (
    <>
      <p className="pj-eyebrow">{eyebrow}</p>
      <h3 className="pj-title">{title}</h3>
      <p className="pj-subtitle">{subtitle}</p>
    </>
  );
  const bs = (branches ?? [])
    .map(b => {
      const children = (b.children ?? []).filter(c => c.count > 0);
      const n = b.children ? children.reduce((t, c) => t + c.count, 0) : (b.count ?? 0);
      return { ...b, children, n };
    })
    .filter(b => b.n > 0);
  if (total === 0 || bs.length === 0) {
    return <div className="pj-panel" data-theme="dark">{header}</div>;
  }

  const hasChildren = bs.some(b => b.children.length > 0);
  const showRight = !isMobile && hasChildren;
  const top = 36;
  const xL = isMobile ? 70 : 96;
  const xR = showRight ? width - 210 : null;
  const xM = showRight ? Math.round((xL + NODE_W + xR) / 2) : width - 118;
  const px = Math.min(40, (isMobile ? 220 : 280) / total);

  const mid = [];
  let my = 0;
  for (const b of bs) {
    const h = Math.max(2, b.n * px), slot = Math.max(h, SLOT_MIN + 6);
    mid.push({ ...b, slotTop: my, slotH: slot, y: my + (slot - h) / 2, h });
    my += slot + 48;
  }
  const midH = my - 48;

  let right = [];
  let rH = 0;
  if (showRight) {
    let ry = 0;
    for (const b of bs) {
      if (b.children.length === 0) continue;
      for (const c of b.children) {
        const h = Math.max(2, c.count * px), slot = Math.max(h, SLOT_MIN);
        right.push({ ...c, key: `${b.key}/${c.key}`, parent: b.key, slotTop: ry, slotH: slot, y: ry + (slot - h) / 2, h });
        ry += slot + 8;
      }
      ry += 16;
    }
    rH = ry - 24;
  }
  const leftH = total * px;
  const colH = Math.max(leftH, midH, rH);
  const leftY = top + (colH - leftH) / 2;
  const midOff = top + (colH - midH) / 2;
  mid.forEach(n => { n.y += midOff; n.slotTop += midOff; });
  const rOff = top + (colH - rH) / 2;
  right.forEach(n => { n.y += rOff; n.slotTop += rOff; });
  const height = Math.ceil(top + colH + 20);

  const bands = [];
  let lc = leftY;
  for (const m of mid) {
    const h = m.n * px;
    bands.push({ id: `src>${m.key}`, from: 'src', to: m.key, d: ribbon(xL + NODE_W, lc, lc + h, xM, m.y, m.y + h), fill: `url(#${uid}-g-${m.key})` });
    lc += h;
  }
  if (showRight) {
    const cur = Object.fromEntries(mid.map(m => [m.key, m.y]));
    for (const c of right) {
      const h = c.count * px;
      bands.push({ id: `${c.parent}>${c.key}`, from: c.parent, to: c.key, d: ribbon(xM + NODE_W, cur[c.parent], cur[c.parent] + h, xR, c.y, c.y + h), fill: c.hatched ? `url(#${uid}-hatch)` : c.colour, child: true });
      cur[c.parent] += h;
    }
  }

  const lit = new Set();
  if (active) {
    const child = right.find(c => c.key === active);
    for (const b of bands) {
      const on = active === 'src' || b.from === active || b.to === active || (child && b.to === child.parent);
      if (on) { lit.add(b.id); lit.add(b.from); lit.add(b.to); }
    }
    lit.add(active);
  }
  const dim = key => active !== null && !lit.has(key);

  let card = null;
  if (active && width > 0) {
    const corner = { x: 0, y: 0 };
    if (active === 'src') {
      card = { ...corner, title: `${total} ${unit}`, rows: mid.map(m => [m.label, `${m.n} (${pct(m.n, total)})`]) };
    } else {
      const m = mid.find(x => x.key === active);
      const c = right.find(x => x.key === active);
      const node = m ?? c;
      const n = m ? m.n : c.count;
      card = { ...corner, title: node.label, rows: [[`${unit[0].toUpperCase()}${unit.slice(1)}`, n], [`Share of ${unit}`, pct(n, total)], ...(c ? [[`Share of ${mid.find(x => x.key === c.parent).label.toLowerCase()}`, pct(n, mid.find(x => x.key === c.parent).n)]] : [])] };
    }
  }
  const on = key => ({
    onPointerEnter: () => setActive(key), onPointerLeave: () => setActive(null),
    onFocus: () => setActive(key), onBlur: () => setActive(null),
  });
  const phoneRows = bs.flatMap(b => b.children.map(c => ({ key: `${b.key}/${c.key}`, label: c.label, count: c.count, muted: c.muted, notCaptured: c.hatched })));

  return (
    <div className="pj-panel" data-theme="dark">
      {header}
      <div ref={ref} className="mbv-flow-plot mbv-flow-dark" style={{ height: width > 0 ? `${height}px` : '260px', marginTop: isMobile ? '14px' : '20px' }}>
        {width > 0 && (
          <>
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
              <defs>
                {mid.map(m => (
                  <linearGradient key={m.key} id={`${uid}-g-${m.key}`} gradientUnits="userSpaceOnUse" x1={xL + NODE_W} y1="0" x2={xM} y2="0">
                    <stop offset="0" stopColor="#2F4FE0" /><stop offset="1" stopColor={m.colour} />
                  </linearGradient>
                ))}
                <pattern id={`${uid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(234, 242, 250, 0.55)" strokeWidth="1.6" />
                </pattern>
              </defs>
              {bands.map(b => (
                <path key={b.id} d={b.d} fill={b.fill}
                  className={`mbv-flow-band${b.child ? ' reason' : ''}${active ? (lit.has(b.id) ? ' lit' : ' dim') : ''}`} />
              ))}
              <g className={dim('src') ? 'mbv-dim' : ''}>
                <rect x={xL} y={leftY} width={NODE_W} height={leftH} rx="3" fill="#2F4FE0" />
                <text x={xL - 12} y={leftY + leftH / 2 - 2} textAnchor="end" className="mbv-flow-big">{total}</text>
                <text x={xL - 12} y={leftY + leftH / 2 + 16} textAnchor="end" className="mbv-flow-sub">{unit}</text>
              </g>
              {mid.map(m => (
                <g key={m.key} className={dim(m.key) ? 'mbv-dim' : ''}>
                  <rect x={xM} y={m.y} width={NODE_W} height={m.h} rx="3" fill={m.colour} />
                  {showRight ? (
                    <text x={xM + NODE_W} y={m.y - 10} textAnchor="end" className="mbv-flow-label">
                      {m.label}<tspan className="mbv-flow-sub" dx="8">{m.n}, {pct(m.n, total)}</tspan>
                    </text>
                  ) : (
                    <>
                      <text x={xM + NODE_W + 12} y={m.slotTop + m.slotH / 2 - 3} className="mbv-flow-label">{m.label}</text>
                      <text x={xM + NODE_W + 12} y={m.slotTop + m.slotH / 2 + 14} className="mbv-flow-sub">{m.n}, {pct(m.n, total)}</text>
                    </>
                  )}
                </g>
              ))}
              {right.map(c => (
                <g key={c.key} className={dim(c.key) ? 'mbv-dim' : ''}>
                  <rect x={xR} y={c.y} width={NODE_W} height={c.h} rx="3" fill={c.hatched ? `url(#${uid}-hatch)` : c.colour} stroke={c.hatched ? 'rgba(234, 242, 250, 0.55)' : 'none'} />
                  <text x={xR + NODE_W + 12} y={c.slotTop + c.slotH / 2 - 3} className="mbv-flow-label">{c.label}</text>
                  <text x={xR + NODE_W + 12} y={c.slotTop + c.slotH / 2 + 14} className="mbv-flow-sub">{c.count}, {pct(c.count, total)} of {unit}</text>
                </g>
              ))}
            </svg>
            <button type="button" className="mbv-flow-hit" style={{ left: 0, top: leftY - 6, width: xL + NODE_W + 4, height: leftH + 12 }}
              aria-label={`${total} ${unit}: ${mid.map(m => `${m.n} ${m.label.toLowerCase()}`).join(', ')}`} {...on('src')} />
            {mid.map(m => (
              <button key={m.key} type="button" className="mbv-flow-hit"
                style={showRight ? { left: xM - 150, top: m.y - 28, width: 164, height: m.h + 28 } : { left: xM - 4, top: m.slotTop, width: 120, height: m.slotH }}
                aria-label={`${m.label}: ${m.n} ${unit}, ${pct(m.n, total)}`} {...on(m.key)} />
            ))}
            {right.map(c => (
              <button key={c.key} type="button" className="mbv-flow-hit" style={{ left: xR - 4, top: c.slotTop, width: Math.max(0, width - xR + 4), height: c.slotH }}
                aria-label={`${c.label}: ${c.count} ${unit}, ${pct(c.count, total)}`} {...on(c.key)} />
            ))}
            {card && (
              <div className="mbv-tip mbv-tip-side" style={{ left: card.x, top: card.y }} role="tooltip">
                <div className="mbv-tip-title">{card.title}</div>
                {card.rows.map(([k, v]) => <div key={k} className="mbv-tip-row"><span className="mbv-tip-label">{k}</span><span>{v}</span></div>)}
              </div>
            )}
          </>
        )}
      </div>
      {isMobile && phoneRows.length > 0 && (
        <div className="mbv-flow-mobile-reasons">
          <div className="mbv-subpanel-kicker">{childKicker}</div>
          <ReasonRows label={childKicker} total={total} colour="#17B6C9" rows={phoneRows} />
        </div>
      )}
    </div>
  );
}
