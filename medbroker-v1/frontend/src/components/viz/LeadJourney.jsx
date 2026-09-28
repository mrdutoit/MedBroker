import { useRef, useState } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth.js';
import { buildJourney, fmtDate, STATUS_TEXT, todayDay } from './leadJourneyModel.js';
import './viz.css';

/**
 * components/viz/LeadJourney.jsx — NEW, 28 Sep 2026 (app-design-pass,
 * Appointment Detail; approved by Mark from the canvas mock-up unchanged).
 * The page's signature panel: this ONE lead's path from lead created to
 * outcome — the per-lead version of the Reports hero's "where the journey
 * slows down".
 *
 * TIME IS REAL: waypoints sit at their actual dates, so a long wait looks
 * long. The one bend in that rule: waypoints never sit closer than
 * MIN_GAP px (a lead booked the same day it was created would otherwise
 * draw two dots on top of each other) — later ones are nudged along, order
 * always kept.
 *
 * WHAT IT DRAWS (all from GET /api/appointments/:id — no new data except
 * closedAt, added to the SELECT 28 Sep 2026):
 *   - Lead created (leadCreatedAt), Appointment booked (createdAt, by the
 *     agent) — solid waypoints.
 *   - Each meeting number's CURRENT attempt (latest by createdAt, the same
 *     "current state" rule appointmentService uses): held -> a solid
 *     waypoint; scheduled for a future date -> a hollow one beyond Today;
 *     scheduled for a past date with nothing logged -> hollow, "not logged
 *     yet". Earlier attempts of that meeting (Rescheduled / Cancelled /
 *     Missed), and a current attempt that is itself cancelled or missed,
 *     are small hollow markers on the path — friction, visible at a glance.
 *   - The outcome: Signed (value, products), Lost (reason), Returned to
 *     leads — or, while open, a "Today, day N" line with the path dashed
 *     towards any meeting still to come.
 *   - Brackets above the path naming each stretch ("7 days to book"),
 *     with the friction inside it counted.
 *
 * Every waypoint and marker is a real <button>; hover or focus shows its
 * detail card (status, date, cancellation reason). Meeting NOTES are
 * deliberately not shown here — they can hold personal information and
 * already live in the Meetings section below. On a phone the path runs
 * down the page.
 */

const MIN_GAP = 30;

const TONE = {
  lead: 'var(--pl-unassigned)', booked: 'var(--pl-booked)', met: 'var(--hero-accent)',
  won: 'var(--pl-won)', lost: 'var(--pl-lost)', returned: 'var(--pl-unassigned)',
  resched: 'var(--pl-progress)', miss: 'var(--pl-lost)', planned: 'var(--hero-strong)',
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

export default function LeadJourney({ appt, isMobile, todayDn = todayDay() }) {
  const ref = useRef(null);
  const width = useElementWidth(ref);
  const [active, setActive] = useState(null);
  const j = buildJourney(appt, todayDn);
  const name = `${appt.firstName ?? ''} ${appt.lastName ?? ''}`.trim() || appt.leadName;

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
  const cardFor = e => [
    e.meeting ?? e.title,
    [
      ['Date', fmtDate(e.dn)],
      ['Day of the journey', e.rel],
      ...(e.kind === 'marker' ? [['What happened', STATUS_TEXT[e.status]]] : []),
      ...(e.cancelReason ? [['Reason', appt.cancelReasonLabels?.[e.cancelReason] ?? e.cancelReason]] : []),
      ...(e.detail ? [['Detail', e.detail]] : []),
    ],
  ];
  const ariaFor = e => `${e.meeting ? `${e.meeting}: ${e.title}` : e.title}, ${fmtDate(e.dn)}, day ${e.rel}${e.detail ? `, ${e.detail}` : ''}${e.cancelReason ? `, reason: ${appt.cancelReasonLabels?.[e.cancelReason] ?? e.cancelReason}` : ''}`;

  // ── Phone: vertical
  if (isMobile) {
    const top = 20, per = 16;
    const placed = place(j.events.filter(e => e.kind !== 'marker'), rel => rel * per, top, Infinity);
    // markers placed by their own day between neighbours, never on top of a waypoint
    const markers = j.events.filter(e => e.kind === 'marker').map(e => {
      const before = [...placed].reverse().find(p => p.rel <= e.rel) ?? placed[0];
      const after = placed.find(p => p.rel > e.rel);
      const p = after ? before.p + ((e.rel - before.rel) / Math.max(1, after.rel - before.rel)) * (after.p - before.p) : before.p + 24;
      return { ...e, p: Math.max(before.p + 18, after ? Math.min(p, after.p - 18) : p) };
    });
    const todayP = j.open ? (() => {
      const before = [...placed].reverse().find(p => p.rel <= j.todayRel) ?? placed[0];
      const after = placed.find(p => p.rel > j.todayRel);
      return after ? Math.min(after.p - 22, Math.max(before.p + 22, before.p + (j.todayRel - before.rel) * per)) : before.p + 40;
    })() : null;
    const solidEnd = j.open ? todayP : placed[placed.length - 1].p;
    const H = Math.max(...placed.map(p => p.p), ...markers.map(m => m.p), todayP ?? 0) + 50;
    const lx = 22;
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
            <line x1={lx} y1={top} x2={lx} y2={solidEnd} stroke="url(#lj-vg)" strokeWidth="6" strokeLinecap="round" />
            {placed[placed.length - 1].p > solidEnd && (
              <line x1={lx} y1={solidEnd} x2={lx} y2={placed[placed.length - 1].p} className="lj-future-path" />
            )}
            {j.open && <line x1={lx - 12} y1={todayP} x2="100%" y2={todayP} className="lj-today" />}
          </svg>
          {j.open && <div className="lj-today-label" style={{ top: todayP - 20, right: 0 }}>Today, day {j.todayRel}</div>}
          {[...placed, ...markers].map(e => (
            <button key={e.key} type="button" className={`lj-node lj-${e.kind}${active === e.key ? ' active' : ''}`}
              style={{ left: lx, top: e.p, '--tone': TONE[e.tone] }} aria-label={ariaFor(e)} {...on(e.key)}>
              <span className="lj-dot" />
              <span className="lj-vlabel">
                <span className="lj-title">{e.kind === 'marker' ? `${e.title}, ${fmtDate(e.dn)}` : e.title}</span>
                {e.kind !== 'marker' && <span className="lj-sub">{fmtDate(e.dn)}{e.detail ? `, ${e.detail}` : ''}</span>}
              </span>
            </button>
          ))}
          {active && (() => {
            const e = [...placed, ...markers].find(x => x.key === active);
            const [t, rows] = cardFor(e);
            return (
              <div className="mbv-tip mbv-tip-side" style={{ left: 40, top: e.p + 18 }} role="tooltip">
                <div className="mbv-tip-title">{t}</div>
                {rows.map(([k, v]) => <div key={k} className="mbv-tip-row"><span className="mbv-tip-label">{k}</span><span>{v}</span></div>)}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // ── Desktop: horizontal, real time scale
  const x0 = 70, x1 = Math.max(x0 + 200, width - 120);
  const scale = rel => (rel / j.endRel) * (x1 - x0);
  const all = place(j.events, scale, x0, x1 + 40);
  const pos = Object.fromEntries(all.map(e => [e.key, e.p]));
  const todayX = j.open ? Math.min(x1, x0 + scale(j.todayRel)) : null;
  const lastSolid = all.filter(e => !(e.kind === 'planned' && e.future)).at(-1);
  const solidEnd = j.open ? Math.max(todayX, lastSolid?.p ?? x0) : all.at(-1).p;
  const futureEnd = all.at(-1).p;
  const ly = 96;

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
  const H = ly + 36 + Math.max(0, ...labelled.map(e => e.tier)) * 54 + 48;

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
            </svg>
            {all.map(e => (
              <button key={e.key} type="button" className={`lj-node lj-${e.kind}${active === e.key ? ' active' : ''}`}
                style={{ left: pos[e.key], top: ly, '--tone': TONE[e.tone] }} aria-label={ariaFor(e)} {...on(e.key)}>
                <span className="lj-dot" />
              </button>
            ))}
            {active && (() => {
              const e = all.find(x => x.key === active);
              const [t, rows] = cardFor(e);
              let cls = 'mbv-tip';
              if (e.p > width - 160) cls += ' mbv-tip-left';
              else if (e.p < 160) cls += ' mbv-tip-right';
              return (
                <div className={cls} style={{ left: e.p, top: ly - 14 }} role="tooltip">
                  <div className="mbv-tip-title">{t}</div>
                  {rows.map(([k, v]) => <div key={k} className="mbv-tip-row"><span className="mbv-tip-label">{k}</span><span>{v}</span></div>)}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
