/**
 * pages/EventList.jsx
 * University events management — create events, view attendance, download QR codes.
 *
 * Style: migrated from local const s to shared tokens.js (s, imported).
 * All business logic and mock data unchanged.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isPast } from 'date-fns';
import { s } from '../styles/tokens.js';
import { useWindowSize } from '../hooks/useWindowSize.js';

const MOCK_EVENTS = [
  {
    id: '1', name: 'Wits Medical School Career Fair 2026',
    university: 'University of the Witwatersrand', eventDate: '2026-06-15',
    venue: 'Wits Great Hall, Braamfontein', status: 'Active',
    rsvpCount: 142, attendedCount: 118, walkinCount: 23,
  },
  {
    id: '2', name: 'UCT Faculty of Health Sciences Expo',
    university: 'University of Cape Town', eventDate: '2026-07-03',
    venue: 'UCT Health Sciences Faculty Centre', status: 'Active',
    rsvpCount: 89, attendedCount: 0, walkinCount: 0,
  },
  {
    id: '3', name: 'UP Medical Students Association Networking',
    university: 'University of Pretoria', eventDate: '2026-05-02',
    venue: 'Hatfield Campus, Pretoria', status: 'Closed',
    rsvpCount: 67, attendedCount: 54, walkinCount: 11,
  },
  {
    id: '4', name: 'UKZN Medicine & Health Careers Day',
    university: 'University of KwaZulu-Natal', eventDate: '2026-08-20',
    venue: 'Howard College, Durban', status: 'Draft',
    rsvpCount: 0, attendedCount: 0, walkinCount: 0,
  },
];

const STATUS_STYLE = {
  Draft:     { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' },
  Active:    { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  Closed:    { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe' },
  Cancelled: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
};

export default function EventList() {
  const navigate = useNavigate();
  const { isMobile } = useWindowSize();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', university: '', venue: '', eventDate: '' });
  const [creating, setCreating] = useState(false);

  function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setTimeout(() => {
      setCreating(false);
      setShowCreate(false);
      setForm({ name: '', university: '', venue: '', eventDate: '' });
    }, 1000);
  }

  return (
    <div style={{ padding: isMobile ? '12px' : '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 600, color: '#111827', margin: 0 }}>Events</h1>
        <button onClick={() => setShowCreate(true)} style={s.primaryBtn}>+ Create Event</button>
      </div>

      {/* Summary metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total events',   value: MOCK_EVENTS.length },
          { label: 'Active',         value: MOCK_EVENTS.filter(e => e.status === 'Active').length },
          { label: 'Total RSVPs',    value: MOCK_EVENTS.reduce((a, e) => a + e.rsvpCount, 0) },
          { label: 'Total attended', value: MOCK_EVENTS.reduce((a, e) => a + e.attendedCount + e.walkinCount, 0) },
        ].map(c => (
          <div key={c.label} style={s.metricCard}>
            <div style={{ fontSize: '0.6875rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>{c.label}</div>
            <div style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827' }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Events grid */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
        {MOCK_EVENTS.map(event => {
          const ss = STATUS_STYLE[event.status] ?? STATUS_STYLE.Draft;
          const pastEvent = isPast(new Date(event.eventDate));
          const attendanceRate = event.rsvpCount > 0
            ? Math.round((event.attendedCount / event.rsvpCount) * 100)
            : 0;

          return (
            <div key={event.id} style={{
              background: 'white', border: '1px solid #e5e7eb',
              borderRadius: '10px', padding: '18px 20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <span style={{ ...s.badge, background: ss.bg, color: ss.text, border: `1px solid ${ss.border}` }}>
                  {event.status}
                </span>
                <span style={{ fontSize: '0.8125rem', color: pastEvent ? '#9ca3af' : '#374151', fontWeight: 500 }}>
                  {format(new Date(event.eventDate), 'd MMM yyyy')}
                </span>
              </div>

              <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827', margin: '0 0 4px', lineHeight: 1.35 }}>{event.name}</h3>
              <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: '0 0 12px' }}>{event.university}</p>
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '0 0 14px' }}>📍 {event.venue}</p>

              {event.status !== 'Draft' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
                  {[
                    { label: 'RSVPs',    value: event.rsvpCount },
                    { label: 'Attended', value: event.attendedCount + event.walkinCount },
                    { label: 'Walk-ins', value: event.walkinCount },
                  ].map(stat => (
                    <div key={stat.label} style={{ background: '#f9fafb', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>{stat.value}</div>
                      <div style={{ fontSize: '0.6875rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {event.status === 'Closed' && event.rsvpCount > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Attendance rate</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#15803d' }}>{attendanceRate}%</span>
                  </div>
                  <div style={{ background: '#e5e7eb', borderRadius: '4px', height: '6px' }}>
                    <div style={{ background: '#10b981', width: `${attendanceRate}%`, height: '100%', borderRadius: '4px' }} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => navigate(`/events/${event.id}`)} style={s.secondaryBtn}>View details</button>
                {event.status === 'Active'  && <button style={s.secondaryBtn}>Download QR</button>}
                {event.status === 'Closed' && <button style={s.secondaryBtn}>Download report</button>}
              </div>
            </div>
          );
        })}
      </div>

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
            <form onSubmit={handleCreate}>
              {[
                { key: 'name',       label: 'Event Name *',  type: 'text', placeholder: 'Wits Medical School Career Fair' },
                { key: 'university', label: 'University *',  type: 'text', placeholder: 'University of the Witwatersrand' },
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
