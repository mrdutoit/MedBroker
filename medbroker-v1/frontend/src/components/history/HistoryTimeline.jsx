/**
 * components/history/HistoryTimeline.jsx — NEW, 1 Oct 2026. Lead Detail's
 * History: every audit entry for the lead (and its appointments) as a
 * day-grouped timeline, built to the approved canvas artboard. All the
 * rules live in historyModel.js (unit-tested); this only draws them.
 * entries: GET /leads/:id/audit rows (undefined while loading).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { buildHistory, filterDays, limitDays, FILTERS, HISTORY_LIMIT } from './historyModel.js';
import { plural } from '../viz/leadJourneyModel.js';
import './history.css';

function Entry({ item }) {
  return (
    <li className="tl-item" style={{ '--c': item.color }}>
      <span className={`tl-dot${item.hollow ? ' hollow' : ''}`} aria-hidden="true" />
      <div className="tl-row">
        {item.appointmentId
          ? <Link className="tl-title" to={`/appointments/${item.appointmentId}`}>{item.title}</Link>
          : <span className="tl-title">{item.title}</span>}
        <span className="tl-time">{item.time}</span>
      </div>
      <div className="tl-meta">
        <span className="tl-cat">{item.label}</span>{item.meta ? ` · ${item.meta}` : ''}
      </div>
      {item.diff?.length > 0 && (
        <div className="tl-diff">
          {item.diff.map(d => d.changed
            ? <span key={d.field} className="tl-sealed">{d.field} changed</span>
            : [
              <span key={`${d.field}-f`} className="tl-f">{d.field}</span>,
              <span key={`${d.field}-v`}><span className="tl-from">{d.from}</span> → <span className="tl-to">{d.to}</span></span>,
            ])}
        </div>
      )}
    </li>
  );
}

export default function HistoryTimeline({ entries, error, onRetry }) {
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(false);
  const history = useMemo(() => buildHistory(entries), [entries]);
  const { days, hidden } = limitDays(filterDays(history.days, filter), expanded ? Infinity : HISTORY_LIMIT);
  const total = history.counts.all;

  let body;
  if (error) {
    body = (
      <>
        <div className="tl-err" role="alert">Could not load this lead’s history.</div>
        <button type="button" className="tl-retry" onClick={onRetry}>Try again</button>
      </>
    );
  } else if (!entries) {
    body = <p className="tl-empty">Loading history…</p>;
  } else if (total === 0) {
    body = <p className="tl-empty">No history yet. Entries appear here as the lead is assigned, called and booked.</p>;
  } else {
    body = (
      <>
        <div className="tl-filters" role="group" aria-label="Show">
          {FILTERS.map(f => (
            <button key={f.key} type="button" className="tl-chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        {days.length === 0 && <p className="tl-empty">Nothing in this category yet.</p>}
        {days.map(d => (
          <div key={d.key}>
            <div className="tl-day">{d.label}</div>
            <ol className="tl-list">{d.items.map(i => <Entry key={i.id} item={i} />)}</ol>
          </div>
        ))}
        {hidden > 0 && (
          <button type="button" className="tl-more" onClick={() => setExpanded(true)}>
            Show {plural(hidden, 'older entry', 'older entries')}
          </button>
        )}
      </>
    );
  }

  return (
    <section className="tl" aria-label="History">
      <div className="tl-head">
        <h2 className="tl-h">History</h2>
        {entries && !error && total > 0 && <span className="tl-count">{plural(total, 'entry', 'entries')} · newest first</span>}
      </div>
      {body}
    </section>
  );
}
