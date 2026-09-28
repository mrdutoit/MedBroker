import { useId, useRef, useState } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth.js';
import ReasonRows from './ReasonRows.jsx';
import './viz.css';

/**
 * components/viz/CallFlow.jsx — NEW, 27 Sep 2026 (app-design-pass, Agent
 * Detail). The page's signature panel, replacing the "Call Outcome
 * Breakdown" bar list: every call the agent made this period, flowing into
 * whether the client was reached, and on to what the call ended in.
 *
 * Same language as the Reports hero and OutcomeFlow: bands start in the
 * logo's blue and turn into the outcome colour; the dark panel is the
 * page's one bold surface.
 *
 * DATA SEMANTICS (reportService.js, getAgentDetailReport): callOutcomes
 * counts CallAttempt rows by outcome, one outcome per call, so the bands
 * genuinely sum to the calls made. "Reached" / "Not reached" is a grouping
 * this chart adds, stated on screen: not reached = no answer, voicemail or
 * wrong number (the lead wasn't spoken to); everything else reached them.
 * "Appointment booked" here is a CALL outcome — it can differ from the
 * Appointments booked figure, which counts appointments created.
 *
 * Each node is a real <button>: hover or focus traces what's connected
 * and shows a detail card. On a phone the third column moves below as
 * ranked rows.
 */

const NOT_REACHED = new Set(['No Answer', 'Voicemail', 'Wrong Number']);
const OUTCOME_COLOUR = {
  'Appointment Booked': 'var(--pl-booked)',
  'Client Contacted':   'var(--pl-won)',
  'Callback Requested': 'var(--pl-progress)',
  'Not Interested':     'var(--pl-lost)',
  'No Answer':          'var(--pl-unassigned)',
  'Voicemail':          'var(--pl-unassigned)',
  'Wrong Number':       'var(--pl-unassigned)',
};
// Plain sentence-case labels on screen; the API's labels stay the keys.
const LABEL = {
  'Appointment Booked': 'Appointment booked', 'Client Contacted': 'Client contacted',
  'Callback Requested': 'Callback requested', 'Not Interested': 'Not interested',
  'No Answer': 'No answer', 'Voicemail': 'Voicemail', 'Wrong Number': 'Wrong number',
};
const ORDER = ['Appointment Booked', 'Callback Requested', 'Client Contacted', 'Not Interested', 'No Answer', 'Voicemail', 'Wrong Number'];

const NODE_W = 10;
const SLOT_MIN = 40;

function ribbon(x1, a1, b1, x2, a2, b2) {
  const m = (x1 + x2) / 2;
  return `M${x1} ${a1} C${m} ${a1} ${m} ${a2} ${x2} ${a2} L${x2} ${b2} C${m} ${b2} ${m} ${b1} ${x1} ${b1} Z`;
}
const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');

export default function CallFlow({ callOutcomes, isMobile }) {
  const ref = useRef(null);
  const width = useElementWidth(ref);
  const uid = useId().replace(/:/g, '');
  const [active, setActive] = useState(null);

  const outcomes = ORDER
    .map(key => ({ key, label: LABEL[key], count: (callOutcomes ?? []).find(o => o.label === key)?.count ?? 0, reached: !NOT_REACHED.has(key) }))
    .filter(o => o.count > 0);
  const total = outcomes.reduce((t, o) => t + o.count, 0);
  const reached = outcomes.filter(o => o.reached);
  const missed = outcomes.filter(o => !o.reached);
  const reachedN = reached.reduce((t, o) => t + o.count, 0);
  const missedN = total - reachedN;
  const bookedN = outcomes.find(o => o.key === 'Appointment Booked')?.count ?? 0;

  const header = (
    <>
      <p className="pj-eyebrow">Where this agent’s calls led</p>
      <h3 className="pj-title">{total.toLocaleString()} {total === 1 ? 'call' : 'calls'} this period</h3>
      <p className="pj-subtitle">
        {total > 0
          ? `${reachedN} reached the client, ${bookedN} ended in a booking. Not reached means no answer, voicemail or a wrong number.`
          : 'No calls logged this period.'}
      </p>
    </>
  );
  if (total === 0) {
    return <div className="pj-panel" data-theme="dark">{header}</div>;
  }

  const showRight = !isMobile;
  const top = 36;
  const xL = isMobile ? 70 : 96;
  const xR = showRight ? width - 200 : null;
  const xM = showRight ? Math.round((xL + NODE_W + xR) / 2) : width - 118;
  const px = Math.min(40, (isMobile ? 220 : 280) / total);

  // Middle nodes
  const mid = [];
  let my = 0;
  for (const [key, label, n, colour] of [['reached', 'Reached', reachedN, '#17B6C9'], ['missed', 'Not reached', missedN, 'var(--pl-unassigned)']]) {
    if (n === 0) continue;
    const h = Math.max(2, n * px), slot = Math.max(h, SLOT_MIN + 6);
    mid.push({ key, label, n, colour, slotTop: my, slotH: slot, y: my + (slot - h) / 2, h });
    my += slot + 48;
  }
  const midH = my - 48;

  // Right nodes, grouped under their middle node
  let right = [];
  let rH = 0;
  if (showRight) {
    let ry = 0;
    for (const group of [reached, missed]) {
      if (group.length === 0) continue;
      for (const o of group) {
        const h = Math.max(2, o.count * px), slot = Math.max(h, SLOT_MIN);
        right.push({ ...o, slotTop: ry, slotH: slot, y: ry + (slot - h) / 2, h });
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

  // Bands
  const bands = [];
  let lc = leftY;
  for (const m of mid) {
    const h = m.n * px;
    bands.push({ id: `calls>${m.key}`, from: 'calls', to: m.key, d: ribbon(xL + NODE_W, lc, lc + h, xM, m.y, m.y + h), fill: `url(#${uid}-${m.key})` });
    lc += h;
  }
  if (showRight) {
    const cur = Object.fromEntries(mid.map(m => [m.key, m.y]));
    for (const o of right) {
      const parent = o.reached ? 'reached' : 'missed';
      const h = o.count * px;
      bands.push({ id: `${parent}>${o.key}`, from: parent, to: o.key, d: ribbon(xM + NODE_W, cur[parent], cur[parent] + h, xR, o.y, o.y + h), fill: OUTCOME_COLOUR[o.key], outcome: true });
      cur[parent] += h;
    }
  }

  const lit = new Set();
  if (active) {
    for (const b of bands) {
      const on = active === 'calls'
        || b.from === active || b.to === active
        || (right.some(o => o.key === active) && b.to === (right.find(o => o.key === active).reached ? 'reached' : 'missed'));
      if (on) { lit.add(b.id); lit.add(b.from); lit.add(b.to); }
    }
    lit.add(active);
  }
  const dim = key => active !== null && !lit.has(key);

  let card = null;
  if (active && width > 0) {
    // Every card sits top-left, above the calls node — the one area the
    // flow never draws in (first screenshot: a card beside an outcome
    // covered the band being traced).
    const corner = { x: 0, y: 0, side: 'r' };
    if (active === 'calls') card = { ...corner, title: 'Calls made', rows: [['Calls', total], ['Reached the client', `${reachedN} (${pct(reachedN, total)})`], ['Ended in a booking', `${bookedN} (${pct(bookedN, total)})`]] };
    else if (active === 'reached' || active === 'missed') {
      const m = mid.find(x => x.key === active);
      card = { ...corner, title: m.label, rows: [['Calls', m.n], ['Share of calls', pct(m.n, total)]] };
    } else {
      const o = right.find(x => x.key === active);
      card = { ...corner, title: o.label, rows: [['Calls', o.count], ['Share of calls', pct(o.count, total)]] };
    }
  }
  const on = key => ({
    onPointerEnter: () => setActive(key), onPointerLeave: () => setActive(null),
    onFocus: () => setActive(key), onBlur: () => setActive(null),
  });

  return (
    <div className="pj-panel" data-theme="dark">
      {header}
      <div ref={ref} className="mbv-flow-plot mbv-flow-dark" style={{ height: width > 0 ? `${height}px` : '260px', marginTop: isMobile ? '14px' : '20px' }}>
        {width > 0 && (
          <>
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
              <defs>
                {mid.map(m => (
                  <linearGradient key={m.key} id={`${uid}-${m.key}`} gradientUnits="userSpaceOnUse" x1={xL + NODE_W} y1="0" x2={xM} y2="0">
                    <stop offset="0" stopColor="#2F4FE0" /><stop offset="1" stopColor={m.colour} />
                  </linearGradient>
                ))}
              </defs>
              {bands.map(b => (
                <path key={b.id} d={b.d} fill={b.fill}
                  className={`mbv-flow-band${b.outcome ? ' reason' : ''}${active ? (lit.has(b.id) ? ' lit' : ' dim') : ''}`} />
              ))}
              <g className={dim('calls') ? 'mbv-dim' : ''}>
                <rect x={xL} y={leftY} width={NODE_W} height={leftH} rx="3" fill="#2F4FE0" />
                <text x={xL - 12} y={leftY + leftH / 2 - 2} textAnchor="end" className="mbv-flow-big">{total}</text>
                <text x={xL - 12} y={leftY + leftH / 2 + 16} textAnchor="end" className="mbv-flow-sub">calls</text>
              </g>
              {mid.map(m => (
                <g key={m.key} className={dim(m.key) ? 'mbv-dim' : ''}>
                  <rect x={xM} y={m.y} width={NODE_W} height={m.h} rx="3" fill={m.colour} />
                  {/* Label ABOVE the node, right-aligned to it (27 Sep 2026,
                      from the first screenshot): beside the node it sat on
                      top of the bands leaving for the outcomes. */}
                  {showRight ? (
                    <text x={xM + NODE_W} y={m.y - 10} textAnchor="end" className="mbv-flow-label">
                      {m.label}<tspan className="mbv-flow-sub" dx="8">{m.n}, {pct(m.n, total)}</tspan>
                    </text>
                  ) : (
                    // Phone: nothing flows out of the middle column (the
                    // outcomes are rows below), so the label sits beside it.
                    <>
                      <text x={xM + NODE_W + 12} y={m.slotTop + m.slotH / 2 - 3} className="mbv-flow-label">{m.label}</text>
                      <text x={xM + NODE_W + 12} y={m.slotTop + m.slotH / 2 + 14} className="mbv-flow-sub">{m.n}, {pct(m.n, total)}</text>
                    </>
                  )}
                </g>
              ))}
              {right.map(o => (
                <g key={o.key} className={dim(o.key) ? 'mbv-dim' : ''}>
                  <rect x={xR} y={o.y} width={NODE_W} height={o.h} rx="3" fill={OUTCOME_COLOUR[o.key]} />
                  <text x={xR + NODE_W + 12} y={o.slotTop + o.slotH / 2 - 3} className="mbv-flow-label">{o.label}</text>
                  <text x={xR + NODE_W + 12} y={o.slotTop + o.slotH / 2 + 14} className="mbv-flow-sub">{o.count}, {pct(o.count, total)} of calls</text>
                </g>
              ))}
            </svg>
            <button type="button" className="mbv-flow-hit" style={{ left: 0, top: leftY - 6, width: xL + NODE_W + 4, height: leftH + 12 }}
              aria-label={`${total} calls: ${reachedN} reached the client, ${bookedN} ended in a booking`} {...on('calls')} />
            {mid.map(m => (
              <button key={m.key} type="button" className="mbv-flow-hit" style={showRight ? { left: xM - 150, top: m.y - 28, width: 164, height: m.h + 28 } : { left: xM - 4, top: m.slotTop, width: 120, height: m.slotH }}
                aria-label={`${m.label}: ${m.n} calls, ${pct(m.n, total)}`} {...on(m.key)} />
            ))}
            {right.map(o => (
              <button key={o.key} type="button" className="mbv-flow-hit" style={{ left: xR - 4, top: o.slotTop, width: Math.max(0, width - xR + 4), height: o.slotH }}
                aria-label={`${o.label}: ${o.count} calls, ${pct(o.count, total)}`} {...on(o.key)} />
            ))}
            {card && (
              <div className={`mbv-tip mbv-tip-side ${card.side === 'l' ? 'mbv-tip-side-l' : 'mbv-tip-side-r'}`} style={{ left: card.x, top: card.y }} role="tooltip">
                <div className="mbv-tip-title">{card.title}</div>
                {card.rows.map(([k, v]) => <div key={k} className="mbv-tip-row"><span className="mbv-tip-label">{k}</span><span>{v}</span></div>)}
              </div>
            )}
          </>
        )}
      </div>
      {isMobile && (
        <div className="mbv-flow-mobile-reasons">
          <div className="mbv-subpanel-kicker">What the calls ended in</div>
          <ReasonRows label="What the calls ended in" total={total} colour="#17B6C9"
            rows={outcomes.map(o => ({ key: o.key, label: o.label, count: o.count, muted: !o.reached }))} />
        </div>
      )}
    </div>
  );
}
