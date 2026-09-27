import { useRef, useState } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth.js';
import { Tooltip, StageDetail } from './Tooltip.jsx';
import './viz.css';

/**
 * components/viz/PipelineJourney.jsx — NEW. Designed, built and
 * browser-verified 24 Sep 2026 (app-design-pass skill, Reports page pilot);
 * reconstructed and actually DELIVERED 27 Sep 2026 — the original build
 * never made it into a delivery ZIP (see Status_Vercel.md, 27 Sep entry).
 * Replaces PipelineHealth (ReportsWidgets.jsx) as the visual treatment for
 * the SAME data — pitfalls.md: "keep equivalents, modernised," not
 * dropped. Every number PipelineHealth showed (stage counts, stage-to-stage
 * conversion) is still here.
 *
 * THE CONCEPT (agreed with Mark before building): MedBroker's logo draws
 * its name as one continuous connected stroke — the M's last peak flows
 * into the B's spine. A Lead's journey through the pipeline is the same
 * shape: one connected path from first contact to outcome. This draws that
 * path for the whole period's cohort.
 *
 * REAL DATA SEMANTICS, confirmed against reportService.js: `stages` has
 * six entries, but Closed Won and Closed Lost are not a 5th/6th sequential
 * stage — they're two parallel terminal outcomes reached from "Appointment
 * Booked". So the path draws four sequential waypoints, then genuinely
 * FORKS into two branches.
 *
 * HEADLINE TOTAL — 24 Sep 2026 bug, fixed: the first version summed all
 * six buckets. They are scoped by three different clocks — the four
 * sequential stages by Lead.createdAt, Closed Won/Lost by
 * Appointment.closedAt, and Closed Lost additionally includes leads closed
 * with no Appointment at all (Lead.updatedAt). Summing them was never a
 * coherent "leads this period" figure. The headline sums only the four
 * sequential stages (one consistent basis): "N leads still in play".
 * Won/Lost tooltip shares use closedTotal as their denominator. Regression
 * test: e2e/interactions.spec.js ("171 leads still in play").
 *
 * COLOUR SPLIT, deliberate: the connecting SPINE uses the logo's own
 * gradient (#2F4FE0 / #1A7FCF / #17B6C9) — that's what makes this
 * MedBroker's signature visual. WAYPOINT DOTS use the existing per-theme
 * --pl-* status tokens (added 13 Aug 2026 for a donut later removed, and
 * unused since — confirmed by grep). Segment thickness/brightness encodes
 * the conversion ratio, and an explicit colour-coded % badge sits on each
 * segment, because width alone proved too subtle to read at real size.
 *
 * NOT built with scrub/snap-to-nearest (chart-primitives.md rule 4): that
 * rule targets many small, closely spaced marks. Six fixed, well-separated
 * waypoints, each a real <button> with a generous hit target, answer hover
 * and focus directly.
 */

const SEQUENTIAL_COLOUR_VARS = ['--pl-unassigned', '--pl-assigned', '--pl-progress', '--pl-booked'];
const WON_COLOUR_VAR = '--pl-won';
const LOST_COLOUR_VAR = '--pl-lost';

function conversionWeight(ratio) {
  // Thin+dim -> thick+bright as conversion improves. Floor and ceiling keep
  // a 0% segment visibly present (a bottleneck must remain findable) and a
  // 100% segment from overwhelming its neighbours.
  if (ratio === null || ratio === undefined) return { width: 3, opacity: 0.35 };
  const clamped = Math.max(0, Math.min(1, ratio));
  return { width: 3 + clamped * 5, opacity: 0.45 + clamped * 0.55 };
}

// Same 70% / 40% thresholds the retired PipelineHealth's stageColour()
// used — same semantics, re-implemented here since that helper was
// page-local and is gone with the component it served.
function conversionBadgeColour(ratio) {
  if (ratio === null || ratio === undefined) return 'rgba(234, 242, 250, 0.55)';
  if (ratio >= 0.7) return 'var(--pl-won)';
  if (ratio >= 0.4) return '#F5A623';
  return 'var(--pl-lost)';
}

export default function PipelineJourney({ stages, stageConversion, isMobile }) {
  const containerRef = useRef(null);
  const width = useElementWidth(containerRef);
  const [activeKey, setActiveKey] = useState(null);
  const gradientId = 'pj-spine-gradient';

  const isEmpty = !stages || stages.length < 6 || stages.every(st => st.count === 0);
  const sequential = isEmpty ? [] : stages.slice(0, 4);
  const won = isEmpty ? null : stages[4];
  const lost = isEmpty ? null : stages[5];
  const activeLeadsTotal = isEmpty ? 0 : sequential.reduce((sum, st) => sum + st.count, 0);
  const closedTotal = isEmpty ? 0 : (won?.count ?? 0) + (lost?.count ?? 0);

  // ── Geometry in real measured pixels: the measured width IS the viewBox
  // width, so 1 SVG unit = 1 CSS pixel — no stretching.
  //
  // Mobile height 500 (not the original 420) and the fork at y=410 (not
  // 390) — 24 Sep 2026 fix: each label needs ~45px below its dot, and the
  // original spacing put the fork dots inside "Appointment Booked"'s label.
  // Desktop height 260 with the spine fixed at y=118 (was height 220,
  // spine at height/2+8 = 118) — 27 Sep 2026 fix, found in the
  // reconstruction screenshots: the Closed Lost label (dot at y=180, ~45px
  // label below it) overran the 220px plot and sat on the panel's bottom
  // edge. Same spine position as approved; only the room beneath it grew.
  const height = isMobile ? 500 : 260;
  const points = [];
  if (!isEmpty && width > 0) {
    if (isMobile) {
      // Vertical stack, fork opening left (Lost) / right (Won) at the bottom.
      const cx = width / 2;
      const ys = [30, 125, 220, 315];
      sequential.forEach((st, i) => points.push({ key: st.status, x: cx, y: ys[i], stage: st }));
      points.push({ key: won.status, x: cx + Math.min(90, width * 0.28), y: 410, stage: won, isWon: true });
      points.push({ key: lost.status, x: cx - Math.min(90, width * 0.28), y: 410, stage: lost, isLost: true });
    } else {
      const xs = [width * 0.07, width * 0.335, width * 0.60, width * 0.80];
      const midY = 118;
      sequential.forEach((st, i) => points.push({ key: st.status, x: xs[i], y: midY, stage: st }));
      points.push({ key: won.status, x: width * 0.95, y: midY - 62, stage: won, isWon: true });
      points.push({ key: lost.status, x: width * 0.95, y: midY + 62, stage: lost, isLost: true });
    }
  }

  const [uA, aA, ipA, abA, wonPt, lostPt] = points;

  return (
    <div className="pj-panel" data-theme="dark">
      <p className="pj-eyebrow">This period&rsquo;s pipeline</p>
      <h3 className="pj-title">{activeLeadsTotal.toLocaleString()} leads still in play</h3>
      <p className="pj-subtitle">Every lead&rsquo;s path from first contact to outcome — where they are now, and where the journey slows down.</p>

      <div className="pj-plot" ref={containerRef} style={{ height: `${height}px`, marginTop: isMobile ? '18px' : '26px' }}>
        {isEmpty ? (
          <div className="pj-empty">No leads in the pipeline this period.</div>
        ) : width === 0 ? null : (
          <>
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
              <defs>
                {/* userSpaceOnUse, not objectBoundingBox — pitfalls.md: a
                    horizontal line has a zero-height bounding box, so an
                    objectBoundingBox gradient on it renders nothing. */}
                <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={uA.x} y1={uA.y} x2={abA.x} y2={abA.y}>
                  <stop offset="0%" stopColor="#2F4FE0" />
                  <stop offset="52%" stopColor="#1A7FCF" />
                  <stop offset="100%" stopColor="#17B6C9" />
                </linearGradient>
              </defs>

              {/* Sequential spine — width/opacity encode the conversion ratio. */}
              {[uA, aA, ipA].map((pt, i) => {
                const next = [aA, ipA, abA][i];
                const conv = stageConversion?.[i];
                const { width: strokeW, opacity } = conversionWeight(conv?.ratio);
                const isActive = activeKey === pt.key || activeKey === next.key;
                return (
                  <line
                    key={`seg-${pt.key}`}
                    className="pj-segment"
                    x1={pt.x} y1={pt.y} x2={next.x} y2={next.y}
                    stroke={`url(#${gradientId})`}
                    strokeWidth={isActive ? strokeW + 2 : strokeW}
                    opacity={isActive ? Math.min(1, opacity + 0.2) : opacity}
                    strokeLinecap="round"
                  />
                );
              })}

              {/* The fork — genuinely two curves, matching the real data split. */}
              <path
                className="pj-segment"
                d={`M ${abA.x} ${abA.y} Q ${(abA.x + wonPt.x) / 2} ${abA.y} ${wonPt.x} ${wonPt.y}`}
                fill="none" stroke={`url(#${gradientId})`}
                strokeWidth={activeKey === wonPt.key || activeKey === abA.key ? 5 : 3}
                opacity={activeKey === wonPt.key || activeKey === abA.key ? 0.95 : 0.6}
                strokeLinecap="round"
              />
              <path
                className="pj-segment"
                d={`M ${abA.x} ${abA.y} Q ${(abA.x + lostPt.x) / 2} ${abA.y} ${lostPt.x} ${lostPt.y}`}
                fill="none" stroke={`url(#${gradientId})`}
                strokeWidth={activeKey === lostPt.key || activeKey === abA.key ? 5 : 3}
                opacity={activeKey === lostPt.key || activeKey === abA.key ? 0.95 : 0.45}
                strokeLinecap="round"
              />
            </svg>

            {/* Conversion % badges at each sequential segment's midpoint.
                Desktop: just above the line. Mobile: to the right of the
                vertical line, +62px — 24 Sep 2026 fix: +22px overlapped the
                stage-name labels centred on the same line. */}
            {[uA, aA, ipA].map((pt, i) => {
              const next = [aA, ipA, abA][i];
              const conv = stageConversion?.[i];
              if (!conv || conv.ratio === null || conv.ratio === undefined) return null;
              const midX = (pt.x + next.x) / 2;
              const midY = (pt.y + next.y) / 2;
              return (
                <div
                  key={`badge-${pt.key}`}
                  className="pj-conv-badge"
                  style={{
                    left: isMobile ? `${midX + 62}px` : `${midX}px`,
                    top: isMobile ? `${midY}px` : `${pt.y - 22}px`,
                    color: conversionBadgeColour(conv.ratio),
                  }}
                >
                  {Math.round(conv.ratio * 100)}%
                </div>
              );
            })}

            {/* Waypoints — real focusable, aria-labelled buttons (chart-
                primitives.md rule 3). Every label renders BELOW its dot in
                every layout — 24 Sep 2026 fix: a conditional placed the
                mobile Won/Lost labels above their dots, on top of
                "Appointment Booked"'s label. */}
            {points.map((pt, i) => {
              const colourVar = pt.isWon ? WON_COLOUR_VAR : pt.isLost ? LOST_COLOUR_VAR : SEQUENTIAL_COLOUR_VARS[i];
              const size = pt.isWon || pt.isLost ? 30 : 26;
              const conv = !pt.isWon && !pt.isLost && i < 3 ? stageConversion?.[i] : null;
              return (
                <div key={pt.key}>
                  <button
                    type="button"
                    className={`pj-waypoint${activeKey === pt.key ? ' active' : ''}`}
                    style={{
                      left: `${pt.x}px`, top: `${pt.y}px`,
                      width: `${size}px`, height: `${size}px`,
                      background: `var(${colourVar})`,
                    }}
                    aria-label={`${pt.stage.status}: ${pt.stage.count} leads`}
                    onMouseEnter={() => setActiveKey(pt.key)}
                    onMouseLeave={() => setActiveKey(null)}
                    onFocus={() => setActiveKey(pt.key)}
                    onBlur={() => setActiveKey(null)}
                  />
                  <div className="pj-label" style={{ left: `${pt.x}px`, top: `${pt.y + size / 2 + 10}px` }}>
                    <div className="pj-label-count">{pt.stage.count}</div>
                    <div className="pj-label-name">{pt.stage.status}</div>
                  </div>
                  {activeKey === pt.key && (
                    <Tooltip x={pt.x} y={pt.y - size / 2 - 6} containerWidth={width}>
                      <StageDetail
                        label={pt.stage.status}
                        count={pt.stage.count}
                        shareOf={pt.isWon || pt.isLost ? closedTotal : activeLeadsTotal}
                        shareLabel={pt.isWon || pt.isLost ? 'Of closed deals' : 'Of active leads'}
                        conversion={conv ? { to: [aA, ipA, abA][i].stage.status, ratio: conv.ratio } : null}
                      />
                    </Tooltip>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
