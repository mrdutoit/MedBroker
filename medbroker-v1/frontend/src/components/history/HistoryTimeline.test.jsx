import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import HistoryTimeline from './HistoryTimeline.jsx';

// HistoryTimeline.test.jsx — 1 Oct 2026. Static-markup smoke test (node, no
// DOM): the states and structure render; the rules are in historyModel.test.js.
const html = props => renderToStaticMarkup(<StaticRouter location="/leads/lead-1"><HistoryTimeline {...props} /></StaticRouter>);
const row = (k, extra = {}) => ({
  id: `e${k}`, action: 'LeadUpdated', performedAt: `2026-08-${String(28 - k).padStart(2, '0')}T10:00:00Z`,
  performedByName: 'Thabo Molefe', entityType: 'Lead', entityId: 'lead-1',
  changeDetail: { email: { from: 'a@x.co', to: 'b@x.co' }, idNumber: { changed: true } }, ...extra,
});

describe('HistoryTimeline', () => {
  it('empty', () => {
    expect(html({ entries: [] })).toContain('No history yet. Entries appear here as the lead is assigned, called and booked.');
  });

  it('error with retry', () => {
    const out = html({ entries: undefined, error: 'boom', onRetry: () => {} });
    expect(out).toContain('role="alert"');
    expect(out).toContain('Try again');
  });

  it('entries: heading, count, chips, diff, link, and "Show N older entries" after 15', () => {
    const entries = Array.from({ length: 17 }, (_, k) => row(k));
    entries[0] = row(0, { action: 'AppointmentCreated', entityType: 'Appointment', entityId: 'appt-9', changeDetail: null });
    const out = html({ entries });
    expect(out).toContain('aria-label="History"');
    expect(out).toContain('17 entries · newest first');
    expect(out).toContain('aria-pressed="true">All</button>');
    expect(out).toContain('aria-pressed="false">Calls</button>');
    expect(out).toContain('href="/appointments/appt-9"');
    expect(out).toContain('<span class="tl-from">a@x.co</span>');
    expect(out).toContain('ID Number changed');
    expect(out).toContain('Show 2 older entries');
    expect(out.match(/class="tl-item"/g)).toHaveLength(15);
  });
});
