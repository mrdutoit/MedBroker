import './viz.css';

/**
 * components/viz/Tooltip.jsx — NEW (built 24 Sep 2026, delivered 27 Sep
 * 2026). app-design-pass skill, Reports page pilot. Positioning logic
 * adapted from the skill's reference implementation (assets/viz/
 * Tooltip.jsx) — the flip-to-avoid-clipping behaviour is unchanged. The
 * reference's card CONTENT (WayPoint's OKR/Check-in detail) is not reused;
 * StageDetail below is MedBroker's own.
 *
 * One shared card for every chart mark, per chart-primitives.md rule 3
 * ("every mark answers hover and keyboard focus with the detail behind it,
 * through one shared Tooltip card"). Inherits the ambient page theme — a
 * light card on Linen/Terra, a dark card on Midnight/Ember — deliberately.
 */

/**
 * Positioned in px inside its (relative) container; flips to the left/
 * right edge near the container's sides so it never clips, and drops
 * below when there's no room above.
 */
export function Tooltip({ x, y, containerWidth, below = false, children }) {
  let cls = 'mbv-tip';
  if (below) cls += ' mbv-tip-below';
  else if (containerWidth && x > containerWidth - 150) cls += ' mbv-tip-left';
  else if (containerWidth && x < 150) cls += ' mbv-tip-right';
  return (
    <div className={cls} style={{ left: x, top: y }} role="tooltip">
      {children}
    </div>
  );
}

/**
 * The detail card for one pipeline-stage waypoint: count, share, and (for a
 * sequential stage that isn't the last) the real conversion ratio to the
 * next stage — the number this chart exists to surface.
 *
 * `shareOf` / `shareLabel` are deliberately generic, not "totalLeads": a
 * sequential stage's share is of activeLeadsTotal (Lead.createdAt-scoped),
 * while Won/Lost's share is of closedTotal (Appointment.closedAt-scoped).
 * Two genuinely different denominators, never interchangeable — see
 * PipelineJourney.jsx's header for why summing all six stages was a real
 * bug. The caller picks which applies per waypoint.
 */
export function StageDetail({ label, count, shareOf, shareLabel, conversion }) {
  const share = shareOf > 0 ? Math.round((count / shareOf) * 100) : null;
  return (
    <>
      <div className="mbv-tip-title">{label}</div>
      <div className="mbv-tip-row"><span className="mbv-tip-label">Leads</span><span>{count}</span></div>
      {share !== null && (
        <div className="mbv-tip-row"><span className="mbv-tip-label">{shareLabel}</span><span>{share}%</span></div>
      )}
      {conversion && (
        <div className="mbv-tip-row">
          <span className="mbv-tip-label">Converted to {conversion.to}</span>
          <span>{conversion.ratio === null ? 'No prior data' : `${Math.round(conversion.ratio * 100)}%`}</span>
        </div>
      )}
    </>
  );
}
