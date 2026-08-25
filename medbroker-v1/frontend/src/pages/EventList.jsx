/**
 * pages/EventList.jsx
 * University events management — create events, view attendance, download QR codes.
 *
 * Rewired to real data, 24 Jul 2026 — the first backend this domain has
 * ever had. Role behaviour matches the pre-existing App.jsx nav gating
 * (Events visible to all five roles behind the events.enabled flag);
 * Create Event is restricted to Admin/Supervisor/GlobalAdmin, matching the
 * same gating already used for Lead creation.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { s } from '../styles/tokens.js';
import { formatDate } from '../utils/dateFormat.js';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { useFetch } from '../hooks/useFetch.js';
import { useRole } from '../context/RoleContext.jsx';
import { eventsApi } from '../services/api.js';

const STATUS_STYLE = {
  Draft:     { bg: 'var(--panel2)', text: 'var(--mut)', border: 'var(--line)' },
  Active:    { bg: 'color-mix(in srgb, #15803d 14%, var(--panel))', text: '#15803d', border: 'color-mix(in srgb, #15803d 30%, var(--panel))' },
  Closed:    { bg: 'color-mix(in srgb, #7c3aed 14%, var(--panel))', text: '#a78bfa', border: 'color-mix(in srgb, #7c3aed 30%, var(--panel))' },
  Cancelled: { bg: 'color-mix(in srgb, #dc2626 14%, var(--panel))', text: '#dc2626', border: 'color-mix(in srgb, #dc2626 30%, var(--panel))' },
};

export default function EventList() {
  const navigate = useNavigate();
  const { isMobile } = useWindowSize();
  const { role } = useRole();
  const isAdmin      = role === 'Admin' || role === 'GlobalAdmin';
  const isSupervisor = role === 'Supervisor';
  const canManage    = isAdmin || isSupervisor;

  const { data, loading, error, refetch } = useFetch(() => eventsApi.list());
  const events = data?.events ?? [];

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', university: '', venue: '', eventDate: '', description: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      await eventsApi.create(form);
      setShowCreate(false);
      setForm({ name: '', university: '', venue: '', eventDate: '', description: '' });
      await refetch();
    } catch (err) {
      setCreateError(err.message ?? 'Could not create event. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ padding: isMobile ? '12px' : '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 600, color:'var(--ink)', margin: 0 }}>Events</h1>
        {canManage && (
          <button onClick={() => setShowCreate(true)} style={s.primaryBtn}>+ Create Event</button>
        )}
      </div>

      {loading && <p style={{ color: 'var(--mut)', fontSize: '0.875rem' }}>Loading events…</p>}
      {error && (
        <div style={{ ...s.errorBox, marginBottom: '16px' }}>
          Could not load events: {error.message}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Summary metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Total events',   value: events.length },
              { label: 'Active',         value: events.filter(e => e.status === 'Active').length },
              { label: 'Total RSVPs',    value: events.reduce((a, e) => a + e.rsvpCount, 0) },
              { label: 'Total attended', value: events.reduce((a, e) => a + e.attendedCount + e.walkinCount, 0) },
            ].map(c => (
              <div key={c.label} style={s.metricCard}>
                <div style={{ fontSize: '0.6875rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>{c.label}</div>
                <div style={{ fontSize: '1.875rem', fontWeight: 700, color:'var(--ink)' }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Events grid */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
            {events.map(event => {
              const ss = STATUS_STYLE[event.status] ?? STATUS_STYLE.Draft;
              // FIXED — isPast(new Date(event.eventDate)) compared the
              // event against the raw current moment, but a date-only
              // string parses as UTC midnight; for anyone east of UTC
              // (South Africa is UTC+2) an event happening later TODAY
              // would show as "past" as soon as local time passed 2am,
              // hours before the event even started. Comparing calendar
              // dates directly (year/month/day, both in local time) avoids
              // the whole class of error — same root cause and fix as
              // Tasks.jsx's daysUntil().
              const [evY, evM, evD] = event.eventDate.split('-').map(Number);
              const eventDateLocal = new Date(evY, evM - 1, evD);
              const todayLocal = new Date(); todayLocal.setHours(0, 0, 0, 0);
              const pastEvent = eventDateLocal < todayLocal;
              const attendanceRate = event.rsvpCount > 0
                ? Math.round((event.attendedCount / event.rsvpCount) * 100)
                : 0;

              return (
                <div key={event.id} style={{
                  background:'var(--panel)', border: '1px solid var(--line)',
                  borderRadius: '10px', padding: '18px 20px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <span style={{ ...s.badge, background: ss.bg, color: ss.text, border: `1px solid ${ss.border}` }}>
                      {event.status}
                    </span>
                    <span style={{ fontSize: '0.8125rem', color:pastEvent ? 'var(--mut)' : 'var(--ink)', fontWeight: 500 }}>
                      {/* 24 Aug 2026 — eventDate is a DATE column,
                          switched to formatDate() (dateFormat.js's own
                          header comment has the full reasoning). */}
                      {formatDate(event.eventDate)}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color:'var(--ink)', margin: '0 0 4px', lineHeight: 1.35 }}>{event.name}</h3>
                  {event.university && <p style={{ fontSize: '0.8125rem', color:'var(--mut)', margin: '0 0 12px' }}>{event.university}</p>}
                  {event.venue && <p style={{ fontSize: '0.75rem', color:'var(--mut)', margin: '0 0 14px' }}>📍 {event.venue}</p>}

                  {event.status !== 'Draft' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
                      {[
                        { label: 'RSVPs',    value: event.rsvpCount },
                        { label: 'Attended', value: event.attendedCount + event.walkinCount },
                        { label: 'Walk-ins', value: event.walkinCount },
                      ].map(stat => (
                        <div key={stat.label} style={{ background:'var(--panel2)', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '1.125rem', fontWeight: 700, color:'var(--ink)' }}>{stat.value}</div>
                          <div style={{ fontSize: '0.6875rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{stat.label}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {event.status === 'Closed' && event.rsvpCount > 0 && (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.75rem', color:'var(--mut)' }}>Attendance rate</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#15803d' }}>{attendanceRate}%</span>
                      </div>
                      <div style={{ background: 'var(--panel2)', borderRadius: '4px', height: '6px' }}>
                        <div style={{ background: '#10b981', width: `${attendanceRate}%`, height: '100%', borderRadius: '4px' }} />
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => navigate(`/events/${event.id}`)} style={s.secondaryBtn}>View details</button>
                  </div>
                </div>
              );
            })}
            {events.length === 0 && (
              <p style={{ color: 'var(--mut)', fontSize: '0.875rem' }}>No events yet.</p>
            )}
          </div>
        </>
      )}

      {/* Create event modal */}
      {showCreate && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div style={{ ...s.modal, width: '460px' }}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>Create Event</h2>
              <button onClick={() => setShowCreate(false)} style={s.closeBtn}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
                  <path d="M3 3l10 10M13 3L3 13"/>
                </svg>
              </button>
            </div>
            {createError && <div style={{ ...s.errorBox, marginBottom: '12px' }}>{createError}</div>}
            <form onSubmit={handleCreate}>
              {[
                { key: 'name',       label: 'Event Name *',  type: 'text', placeholder: 'Wits Medical School Career Fair' },
                { key: 'university', label: 'University',    type: 'text', placeholder: 'University of the Witwatersrand' },
                { key: 'venue',      label: 'Venue',         type: 'text', placeholder: 'Great Hall, Braamfontein' },
                { key: 'eventDate',  label: 'Event Date *',  type: 'date', placeholder: '' },
              ].map(field => (
                <div key={field.key} style={{ marginBottom: '12px' }}>
                  <label style={s.formLabel}>{field.label}</label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={form[field.key]}
                    onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                    style={s.formInput}
                    required={field.label.endsWith('*')}
                  />
                </div>
              ))}
              <p style={{ ...s.formHint, marginBottom: '14px' }}>
                Created as Draft — activate it from the event's detail page once it's ready to accept registrations.
              </p>
              <div style={s.modalFooter}>
                <button type="button" onClick={() => setShowCreate(false)} style={{ ...s.secondaryBtn, background: 'none', border: 'none' }}>
                  Cancel
                </button>
                <button type="submit" disabled={creating} style={s.primaryBtn}>
                  {creating ? 'Creating…' : 'Create Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
