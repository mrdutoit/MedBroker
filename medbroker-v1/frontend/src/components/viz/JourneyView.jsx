import { useRef, useState } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth.js';
import { fmtDate, STATUS_TEXT } from './leadJourneyModel.js';
import './viz.css';

/**
 * components/viz/JourneyView.jsx — NEW, 1 Oct 2026. The drawing half of
 * LeadJourney.jsx, lifted out unchanged so Lead Detail's journey
 * (LeadPathJourney.jsx) draws with the same scale, label tiers, collision
 * rules and detail cards instead of a copy. See LeadJourney.jsx's header
 * for what each part of the drawing means.
 *
 * Two optional extras, drawn only when the model has them (so Appointment
 * Detail's journey is unchanged):
 *   - `call` events: small dots on the path (reached filled, missed
 *     hollow), placed by their own day and kept off the waypoints; no
 *     label on desktop, one line beside the dot on a phone.
 *   - `j.bands`: who holds the lead ("With the agent", "With the broker")
 *     as rounded bands under the waypoint labels — a bar beside the path on
 *     a phone — dashed beyond Today towards a meeting still to come.
 */

const MIN_GAP = 30;
const CALL_GAP = 15;   // a call dot never sits on a waypoint's dot
const CALL_SPACING = 13;

export const TONE = {
  lead: 'var(--pl-unassigned)', booked: 'var(--pl-booked)', met: 'var(--hero-accent)',
  won: 'var(--pl-won)', lost: 'var(--pl-lost)', returned: 'var(--pl-unassigned)',
  resched: 'var(--pl-progress)', miss: 'var(--pl-lost)', planned: 'var(--hero-strong)',
  reached: 'var(--hero-accent)', missed: 'var(--hero-strong)',
};

function place(events, scale, lo, hi) {
  // Proportional position, then nudge forward so nothing sits closer than MIN_GAP.
  const out = [];
  let prev = -Infinity;
  for (const e of events) {
    let p = lo + scale(e.rel);
    if (p - prev < MIN_GAP) p = prev + MIN_GAP;
    out.push({ ...e, p: Math.min(p, hi) });
    prev = p;
  }
  return out;
}

const nodeClass = (e, active) =>
  `lj-node lj-${e.kind}${e.kind === 'call' ? ` lpj-call lpj-${e.tone}` : ''}${active === e.key ? ' active' : ''}`;
const lower = t => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);

export default function JourneyView({ j, name, isMobile, cancelReasonLabels, legend = null }) {
  const ref = useRef(null);
  const width = useElementWidth(ref);
  const [active, setActive] = useState(null);
  const bands = j.bands?.length ? j.bands : null;

  const header = (
    <>
      <p className="pj-eyebrow">{name}’s journey</p>
      <h3 className="pj-title">{j.title}</h3>
      <p className="pj-subtitle lj-subtitle">{j.subtitle}</p>
    </>
  );

  const on = key => ({
    onPointerEnter: () => setActive(key), onPointerLeave: () => setActive(null),
    onFocus: () => setActive(key), onBlur: () => setActive(null),
  });
  const reason = e => cancelReasonLabels?.[e.cancelReason] ?? e.cancelReason;
  const cardFor = e => (e.kind === 'call'
    ? [e.title, [
      ['Date', fmtDate(e.dn)],
      ['Day of the journey', e.rel],
      ...(e.detail ? [['Outcome', e.detail]] : []),
      ...(e.callbackDn != null ? [['Callback', fmtDate(e.callbackDn)]] : []),
    ]]
    : [e.meeting ?? e.title, [
      ['Date', fmtDate(e.dn)],
      ['Day of the journey', e.rel],
      ...(e.kind === 'marker' ? [['What happened', STATUS_TEXT[e.status]]] : []),
      ...(e.cancelReason ? [['Reason', reason(e)]] : []),
      ...(e.detail ? [['Detail', e.detail]] : []),
    ]]);
  const ariaFor = e => `${e.meeting ? `${e.meeting}: ${e.title}` : e.title}, ${fmtDate(e.dn)}, day ${e.rel}${e.detail ? `, ${e.detail}` : ''}${e.cancelReason ? `, reason: ${reason(e)}` : ''}`;
  const card = (e, cls, style) => {
    const [t, rows] = cardFor(e);
    return (
      <div className={cls} style={style} role="tooltip">
        <div className="mbv-tip-title">{t}</div>
        {rows.map(([k, v]) => <div key={k} className="mbv-tip-row"><span className="mbv-tip-label">{k}</span><span>{v}</span></div>)}
      </div>
    );
  };

  // ── Phone: vertical
  if (isMobile) {
    // Room under "Appointment booked" for the broker band's label — two
    // lines when a long broker name makes it wrap.
    const bandGap = bands && bands.length > 1 ? (bands[1].label.length > 32 ? 42 : 26) : 0;
    const top = 20 + (bands ? 22 : 0), per = 16;
    const lx = bands ? 34 : 22;
    let placed = place(j.events.filter(e => e.kind !== 'marker'), rel => rel * per, top, Infinity);
    // Room for the broker band's label just under "Appointment booked".
    const bookedAt = bandGap ? placed.findIndex(e => e.key === 'booked') : -1;
    if (bookedAt >= 0) placed = placed.map((e, i) => (i > bookedAt ? { ...e, p: e.p + bandGap } : e));
    // markers placed by their own day between neighbours, never on top of a waypoint
    const markers = j.events.filter(e => e.kind === 'marker').map(e => {
      const before = [...placed].reverse().find(p => p.rel <= e.rel) ?? placed[0];
      const after = placed.find(p => p.rel > e.rel);
      const p = after ? before.p + ((e.rel - before.rel) / Math.max(1, after.rel - before.rel)) * (after.p - before.p) : before.p + 24;
      const floor = before.p + 18 + (before.key === 'booked' ? bandGap : 0); // never on the band label
      return { ...e, p: Math.max(floor, after ? Math.min(p, after.p - 18) : p) };
    });
    const todayP = j.open ? (() => {
      const before = [...placed].reverse().find(p => p.rel <= j.todayRel) ?? placed[0];
      const after = placed.find(p => p.rel > j.todayRel);
      return after ? Math.min(after.p - 22, Math.max(before.p + 22, before.p + (j.todayRel - before.rel) * per)) : before.p + 40;
    })() : null;
    const solidEnd = j.open ? todayP : placed[placed.length - 1].p;
    const lastP = placed[placed.length - 1].p;
    const H = Math.max(...placed.map(p => p.p), ...markers.map(m => m.p), todayP ?? 0) + 50;
    const booked = placed[bookedAt];
    const vbands = bands ? bands.map((b, i) => {
      const from = i === 0 ? top - 9 : booked.p + 12;
      const to = i === 0 && bands.length > 1 ? booked.p - 12 : solidEnd;
      return { ...b, from, to, labelTop: i === 0 ? 0 : booked.p + 20 };
    }) : [];
    return (
      <div className="pj-panel lj-panel">
        {header}
        <div ref={ref} className="lj-plot" style={{ height: `${H}px`, marginTop: '18px' }}>
          <svg width="100%" height={H} aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
            <defs>
              <linearGradient id="lj-vg" gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={solidEnd}>
                <stop offset="0" stopColor="var(--path-a)" /><stop offset="1" stopColor="var(--path-c)" />
              </linearGradient>
            </defs>
            {vbands.map(b => (
              <rect key={b.tone} x="0" y={b.from} width="6" height={Math.max(6, b.to - b.from)} rx="3" className={`lpj-vband lpj-vband-${b.tone}`} />
            ))}
            {vbands.some(b => b.open) && lastP > solidEnd && (
              <line x1="3" y1={solidEnd + 6} x2="3" y2={lastP} className="lpj-vband-future" />
            )}
            <line x1={lx} y1={top} x2={lx} y2={solidEnd} stroke="url(#lj-vg)" strokeWidth="6" strokeLinecap="round" />
            {lastP > solidEnd && (
              <line x1={lx} y1={solidEnd} x2={lx} y2={lastP} className="lj-future-path" />
            )}
            {j.open && <line x1={lx - 12} y1={todayP} x2="100%" y2={todayP} className="lj-today" />}
          </svg>
          {vbands.map(b => (
            <div key={`bl-${b.tone}`} className="lpj-vband-label" style={{ left: lx + 23, right: 0, top: b.labelTop }}>{b.label}</div>
          ))}
          {j.open && <div className="lj-today-label" style={{ top: todayP - 20, right: 0 }}>Today, day {j.todayRel}</div>}
          {[...placed, ...markers].map(e => (
            <button key={e.key} type="button" className={nodeClass(e, active)}
              style={{ left: lx, top: e.p, '--tone': TONE[e.tone] }} aria-label={ariaFor(e)} {...on(e.key)}>
              <span className="lj-dot" />
              <span className="lj-vlabel">
                {e.kind === 'call'
                  ? <span className="lj-sub">{`${e.title}, ${fmtDate(e.dn)}${e.detail ? `: ${lower(e.detail)}` : ''}`}</span>
                  : <span className="lj-title">{e.kind === 'marker' ? `${e.title}, ${fmtDate(e.dn)}` : e.title}</span>}
                {e.kind !== 'marker' && e.kind !== 'call' && <span className="lj-sub">{fmtDate(e.dn)}{e.detail ? `, ${e.detail}` : ''}</span>}
              </span>
            </button>
          ))}
          {active && (() => {
            const e = [...placed, ...markers].find(x => x.key === active);
            return card(e, 'mbv-tip mbv-tip-side', { left: 40, top: e.p + 18 });
          })()}
        </div>
        {legend}
      </div>
    );
  }

  // ── Desktop: horizontal, real time scale
  const x0 = 70, x1 = Math.max(x0 + 200, width - 120);
  const scale = rel => (rel / j.endRel) * (x1 - x0);
  const all = place(j.events.filter(e => e.kind !== 'call'), scale, x0, x1 + 40);
  const todayX = j.open ? Math.min(x1, x0 + scale(j.todayRel)) : null;
  const lastSolid = all.filter(e => !(e.kind === 'planned' && e.future)).at(-1);
  const solidEnd = j.open ? Math.max(todayX, lastSolid?.p ?? x0) : all.at(-1).p;
  const futureEnd = all.at(-1).p;
  const ly = 96;

  // Calls: by their own day, kept off the waypoints' dots and each other's.
  const anchors = all.filter(e => e.kind !== 'marker');
  let prevCall = -Infinity;
  const calls = j.events.filter(e => e.kind === 'call').map(e => {
    let p = Math.min(x0 + scale(e.rel), x1 + 40);
    const hit = anchors.find(a => Math.abs(a.p - p) < CALL_GAP);
    if (hit) p = hit.key === 'lead' ? hit.p + CALL_GAP : hit.p - CALL_GAP;
    if (p - prevCall < CALL_SPACING) p = prevCall + CALL_SPACING;
    prevCall = p;
    return { ...e, p };
  });
  const nodes = [...calls, ...all]; // calls first so a waypoint's button sits on top

  // Label tiers below the line for waypoints (two tiers, alternate on collision)
  const tierEnd = [-Infinity, -Infinity];
  const labelled = all.filter(e => e.kind !== 'marker').map(e => {
    const w = Math.max(e.title.length * 7.6, (e.detail ?? '').length * 6.6, 60) + 16;
    let tier = e.p - w / 2 > tierEnd[0] ? 0 : 1;
    tierEnd[tier] = e.p + w / 2;
    return { ...e, tier };
  });
  // Marker labels above the line; alternate height if two sit close
  let lastMarker = -Infinity, alt = 0;
  const markers = all.filter(e => e.kind === 'marker').map(e => {
    alt = e.p - lastMarker < 80 ? 1 - alt : 0;
    lastMarker = e.p;
    return { ...e, alt };
  });
  const spanX = rel => {
    const exact = all.find(e => e.rel === rel && e.kind !== 'marker');
    return exact ? exact.p : (rel === j.todayRel ? todayX : x0 + scale(rel));
  };
  // Height fits the label tiers actually used (the first build always
  // reserved two, leaving an empty band under a single-tier journey).
  const labelsEnd = ly + 36 + Math.max(0, ...labelled.map(e => e.tier)) * 54;
  const bandY = labelsEnd + 64;
  const H = labelsEnd + 48 + (bands ? 52 : 0);
  const hbands = bands ? bands.map((b, i) => {
    const a = spanX(b.from) + (i > 0 ? 4 : 0);
    const z = (b.to === j.todayRel && j.open ? todayX : spanX(b.to)) - (i < bands.length - 1 ? 4 : 0);
    const w = Math.max(12, z - a);
    const text = b.label.length * 6.6 + 24 < w ? b.label : (b.short.length * 6.6 + 24 < w ? b.short : null);
    return { ...b, a, w, text };
  }) : [];

  return (
    <div className="pj-panel lj-panel">
      {header}
      <div ref={ref} className="lj-plot" style={{ height: `${H}px`, marginTop: '18px' }}>
        {width > 0 && (
          <>
            <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
              <defs>
                <linearGradient id="lj-hg" gradientUnits="userSpaceOnUse" x1={x0} y1="0" x2={x1} y2="0">
                  <stop offset="0" stopColor="var(--path-a)" /><stop offset="0.52" stopColor="var(--path-b)" /><stop offset="1" stopColor="var(--path-c)" />
                </linearGradient>
              </defs>
              <line x1={x0} y1={ly} x2={solidEnd} y2={ly} stroke="url(#lj-hg)" strokeWidth="6" strokeLinecap="round" />
              {futureEnd > solidEnd && <line x1={solidEnd} y1={ly} x2={futureEnd} y2={ly} className="lj-future-path" />}
              {j.open && (
                <>
                  <line x1={todayX} y1={ly - 64} x2={todayX} y2={ly + 16} className="lj-today" />
                  <text x={todayX} y={ly - 72} textAnchor="middle" className="lj-today-text">Today, day {j.todayRel}</text>
                </>
              )}
              {j.spans.map((sp, i) => {
                const a = spanX(sp.from) + 8, b = spanX(sp.to) - 8;
                if (b - a < 24) return null;
                const text = sp.long.length * 6.4 < b - a ? sp.long : (sp.short.length * 6.4 < b - a ? sp.short : null);
                const y = ly - 40;
                return (
                  <g key={i}>
                    <path d={`M${a} ${y + 6} L${a} ${y} L${b} ${y} L${b} ${y + 6}`} className="lj-span" />
                    {text && <text x={(a + b) / 2} y={y - 8} textAnchor="middle" className="lj-span-text">{text}</text>}
                  </g>
                );
              })}
              {labelled.filter(e => e.tier === 1).map(e => (
                <line key={`lead-${e.key}`} x1={e.p} y1={ly + 16} x2={e.p} y2={ly + 36 + 54 - 16} className="lj-leader" />
              ))}
              {markers.map(e => (
                <text key={`mt-${e.key}`} x={e.p} y={ly - 14 - e.alt * 12} textAnchor="middle" className="lj-marker-text" style={{ fill: TONE[e.tone] }}>{e.title}</text>
              ))}
              {labelled.map(e => {
                const ty = ly + 36 + e.tier * 54;
                return (
                  <g key={`l-${e.key}`}>
                    <text x={e.p} y={ty} textAnchor="middle" className={e.kind === 'outcome' ? 'lj-outcome-text' : 'lj-title-text'}>{e.title}</text>
                    <text x={e.p} y={ty + 17} textAnchor="middle" className="lj-sub-text">{fmtDate(e.dn)}</text>
                    {e.detail && <text x={e.p} y={ty + 33} textAnchor="middle" className="lj-sub-text">{e.detail}</text>}
                  </g>
                );
              })}
              {hbands.map(b => (
                <g key={`b-${b.tone}`}>
                  <rect x={b.a} y={bandY} width={b.w} height="26" rx="13" className={`lpj-band lpj-band-${b.tone}`} />
                  {b.text && <text x={b.a + b.w / 2} y={bandY + 17} textAnchor="middle" className="lpj-band-text">{b.text}</text>}
                </g>
              ))}
              {hbands.some(b => b.open) && futureEnd > solidEnd + 8 && (
                <rect x={solidEnd} y={bandY} width={futureEnd - solidEnd} height="26" rx="13" className="lpj-band-future" />
              )}
            </svg>
            {nodes.map(e => (
              <button key={e.key} type="button" className={nodeClass(e, active)}
                style={{ left: e.p, top: ly, '--tone': TONE[e.tone] }} aria-label={ariaFor(e)} {...on(e.key)}>
                <span className="lj-dot" />
              </button>
            ))}
            {active && (() => {
              const e = nodes.find(x => x.key === active);
              let cls = 'mbv-tip';
              if (e.p > width - 160) cls += ' mbv-tip-left';
              else if (e.p < 160) cls += ' mbv-tip-right';
              return card(e, cls, { left: e.p, top: ly - 14 });
            })()}
          </>
        )}
      </div>
      {legend}
    </div>
  );
}
