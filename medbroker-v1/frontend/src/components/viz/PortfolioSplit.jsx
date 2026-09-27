import { useState } from 'react';
import './viz.css';

/**
 * components/viz/PortfolioSplit.jsx — NEW, 27 Sep 2026 (app-design-pass,
 * Reports page). Won vs lost per portfolio: lost bars to the left of a
 * centre line, won to the right, then that portfolio's win rate.
 * Replaces the By Portfolio · Won and By Portfolio · Lost rings.
 *
 * WHY NOT A RING: reportService.js deliberately counts a deal in every
 * portfolio it covers (portClosedCountRows / portNoApptRows fan out), so
 * the parts can add up to MORE than the deals — the old rings showed
 * "4 total" for 3 won deals. A ring asserts parts-of-a-whole; this data
 * isn't. Each portfolio is compared on its own terms instead, and the
 * panel says so whenever the overlap actually shows.
 *
 * won/lost: [{ portfolio, count }] as returned by the API.
 */
export default function PortfolioSplit({ won, lost }) {
  const [active, setActive] = useState(null);
  const map = new Map();
  for (const r of won ?? []) map.set(r.portfolio, { won: r.count, lost: 0 });
  for (const r of lost ?? []) map.set(r.portfolio, { ...(map.get(r.portfolio) ?? { won: 0 }), lost: r.count });
  const rows = [...map.entries()]
    .map(([name, v]) => ({ name, ...v, total: v.won + v.lost, notCaptured: name === 'Not captured' }))
    .filter(r => r.total > 0)
    .sort((a, b) => (a.notCaptured !== b.notCaptured ? (a.notCaptured ? 1 : -1) : b.total - a.total));
  const max = Math.max(1, ...rows.map(r => Math.max(r.won, r.lost)));
  return (
    <div className="mbv-port">
      <div className="mbv-port-head" aria-hidden="true">
        <span className="mbv-port-head-bars"><span>Lost</span><span>Won</span></span>
        <span className="mbv-port-head-rate">Win rate</span>
      </div>
      <ul className="mbv-port-rows" aria-label="Won and lost by portfolio">
        {rows.map(r => {
          const rate = Math.round((r.won / r.total) * 100);
          return (
            <li key={r.name}>
              <button
                type="button"
                className={`mbv-port-row${active !== null && active !== r.name ? ' dim' : ''}${active === r.name ? ' active' : ''}`}
                aria-label={`${r.name}: ${r.won} won, ${r.lost} lost, win rate ${rate}%`}
                onPointerEnter={() => setActive(r.name)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(r.name)}
                onBlur={() => setActive(null)}
              >
                <span className="mbv-port-name">{r.name}</span>
                <span className="mbv-port-line">
                  <span className="mbv-port-bars">
                    <span className="mbv-port-side lost">
                      <span className="mbv-port-n">{r.lost}</span>
                      <span className="mbv-port-bar lost" style={{ width: `${(r.lost / max) * 100}%` }} />
                    </span>
                    <span className="mbv-port-spine" />
                    <span className="mbv-port-side won">
                      <span className="mbv-port-bar won" style={{ width: `${(r.won / max) * 100}%` }} />
                      <span className="mbv-port-n">{r.won}</span>
                    </span>
                  </span>
                  <span className="mbv-port-rate">{rate}%</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
