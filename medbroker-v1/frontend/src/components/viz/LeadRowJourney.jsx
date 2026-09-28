import { useRef, useState } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth.js';
import { buildRowJourney, WINDOW } from './leadRowModel.js';
import { todayDay } from './leadJourneyModel.js';
import './viz.css';

/**
 * components/viz/LeadRowJourney.jsx — NEW, 28 Sep 2026 (app-design-pass,
 * Leads list; the canvas design Mark approved, second revision). One
 * lead's last 60 days drawn in the Appointment Detail journey's language,
 * on the list's journey band (the page's one bold element; its colours come
 * from the theme's --hero-* / --path-* tokens, so it follows the theme).
 *
 * The caption continues the line: past the shared today line a short
 * stroke fades from the line's colour into the caption's, and the words
 * sit on the same baseline — "where it stands now" (Mark: the caption
 * floating under the line looked "in the middle of nowhere").
 *
 * The whole journey is one real <button> (keyboard-focusable, aria-label
 * summarising it); hover or focus shows a detail card. The card is
 * position: fixed from the button's rectangle, because the table scrolls
 * sideways inside an overflow container that would clip an absolutely
 * positioned card (the 24 Sep tooltip-clipping lesson). Clicking bubbles to
 * the row, which opens the lead as before.
 *
 * Rules (quiet, reached, outcome) live in leadRowModel.js.
 */

const TONE = {
  quiet: 'var(--pl-progress)', accent: 'var(--hero-accent)', booked: 'var(--pl-booked)',
  won: 'var(--pl-won)', lost: 'var(--pl-lost)', muted: 'var(--hero-mut)',
};
const LANE = 150;          // caption lane to the right of the today line
const LANE_PHONE = 148;   // phone: the caption needs ~145px; leaves ~165px of timeline

export default function LeadRowJourney({ lead, isMobile, todayDn = todayDay() }) {
  const ref = useRef(null);
  const btnRef = useRef(null);
  const width = useElementWidth(ref);
  const [card, setCard] = useState(null);
  const r = buildRowJourney(lead, todayDn);
  const h = 32, y = h / 2;
  const lane = isMobile ? LANE_PHONE : LANE;
  const xToday = Math.max(80, width - lane);
  const px = (xToday - 10) / WINDOW;
  const X = a => xToday - a * px;
  const xs = X(Math.min(r.createdAgo, WINDOW));
  const tone = TONE[r.caption.tone];
  const ends = [r.outcome?.ago, ...r.calls.map(c => c.ago), r.bookedAgo].filter(v => v !== null && v !== undefined);
  const solidEnd = ends.length ? X(Math.min(...ends)) : null;
  const uid = `lrj-${lead.id}`;

  const open = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setCard({ left: rect.left + Math.min(xToday, rect.width - 20), top: rect.top - 6 });
  };
  const summary = `${r.caption.text}. ${r.callCount} ${r.callCount === 1 ? 'call' : 'calls'} in total${r.calls.length ? `, ${r.reachedCount} of the last ${r.calls.length} reached the client` : ''}.`;

  return (
    <div ref={ref} className="lrj">
      {width > 0 && (
        <button ref={btnRef} type="button" className="lrj-hit" aria-label={`Journey: ${summary}`}
          onPointerEnter={open} onPointerLeave={() => setCard(null)} onFocus={open} onBlur={() => setCard(null)}>
          <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} aria-hidden="true">
            <defs>
              <linearGradient id={uid} gradientUnits="userSpaceOnUse" x1={X(WINDOW)} y1="0" x2={xToday} y2="0">
                <stop offset="0" stopColor="var(--path-a)" stopOpacity={r.clipped ? 0.35 : 1} />
                <stop offset="0.2" stopColor="var(--path-a)" />
                <stop offset="0.55" stopColor="var(--path-b)" />
                <stop offset="1" stopColor="var(--path-c)" />
              </linearGradient>
              <linearGradient id={`${uid}-c`} gradientUnits="userSpaceOnUse" x1={xToday} y1="0" x2={xToday + 22} y2="0">
                <stop offset="0" stopColor={tone} stopOpacity="0.9" /><stop offset="1" stopColor={tone} stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Desktop: runs past the row so rows join into one continuous today line; phone: stays inside its strip. */}
            <line x1={xToday} y1={isMobile ? 0 : -16} x2={xToday} y2={isMobile ? h : h + 16} className="lrj-today" />
            {solidEnd !== null && <line x1={xs} y1={y} x2={solidEnd} y2={y} stroke={`url(#${uid})`} strokeWidth="4" strokeLinecap="round" />}
            {!r.outcome && (() => {
              const start = solidEnd ?? xs;
              if (r.noCall) return <line x1={start} y1={y} x2={xToday} y2={y} className="lrj-nocall" />;
              if (r.quiet) return (
                <>
                  <line x1={start} y1={y} x2={xToday} y2={y} stroke="var(--pl-progress)" strokeWidth="8" opacity="0.16" strokeLinecap="round" />
                  <line x1={start} y1={y} x2={xToday} y2={y} className="lrj-quiet" />
                </>
              );
              return <line x1={start} y1={y} x2={xToday} y2={y} stroke={r.withBroker ? 'var(--pl-booked)' : 'var(--hero-accent)'} className="lrj-recent" />;
            })()}
            {r.clipped
              ? <text x={X(WINDOW) - 6} y={y + 4} textAnchor="end" className="lrj-age">{r.createdAgo}d</text>
              : <circle cx={xs} cy={y} r="4.5" fill="var(--pl-unassigned)" className="lrj-ring" />}
            {r.calls.map((c, i) => c.reached
              ? <circle key={i} cx={X(c.ago)} cy={y} r="3.6" fill="var(--hero-strong)" className="lrj-ring thin" />
              : <circle key={i} cx={X(c.ago)} cy={y} r="3.4" className="lrj-missed" />)}
            {r.bookedAgo !== null && <circle cx={X(r.bookedAgo)} cy={y} r="6" fill="var(--pl-booked)" className="lrj-ring" />}
            {r.outcome && (
              <>
                <circle cx={X(r.outcome.ago)} cy={y} r="12" fill={TONE[r.caption.tone]} opacity="0.25" />
                <circle cx={X(r.outcome.ago)} cy={y} r="6.5" fill={TONE[r.caption.tone]} className="lrj-ring" />
              </>
            )}
            <line x1={xToday + 4} y1={y} x2={xToday + 22} y2={y} stroke={`url(#${uid}-c)`} strokeWidth="2.5" strokeLinecap="round" />
            <text x={xToday + 28} y={y + 4.5} className="lrj-caption" style={{ fill: tone }}>{r.caption.text}</text>
          </svg>
        </button>
      )}
      {card && (
        <div className="mbv-tip lrj-card" style={{ left: card.left, top: card.top }} role="tooltip">
          <div className="mbv-tip-title">{lead.firstName} {lead.lastName}</div>
          {[
            ['Source', lead.sourceLabel ?? '—'],
            ['Lead created', r.createdAgo === 0 ? 'Today' : `${r.createdAgo} days ago`],
            ['Calls', r.callCount === 0 ? 'None yet' : `${r.callCount}${r.calls.length ? `, ${r.reachedCount} of the last ${r.calls.length} reached` : ''}`],
            ['Last contact', r.lastContactAgo === null ? '—' : r.lastContactAgo === 0 ? 'Today' : `${r.lastContactAgo} days ago`],
            ['Email', lead.email ?? '—'],
          ].map(([k, v]) => <div key={k} className="mbv-tip-row"><span className="mbv-tip-label">{k}</span><span>{v}</span></div>)}
        </div>
      )}
    </div>
  );
}
