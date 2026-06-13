/**
 * pages/Notifications.jsx
 * In-app notification inbox. Notifications are created by server-side jobs
 * for: lead assignments, appointment assignments, appointment reminders,
 * callback reminders, rescheduling reminders, and lead auto-return events.
 */

import { useState } from 'react';
import { s } from '../styles/tokens.js';

const MOCK_NOTIFICATIONS = [
  { id:1, type:'LeadAssigned',      title:'New lead assigned — Dr Priya Naidoo',            body:'Admin User assigned this lead to you. Anaesthesiologist · Netcare Sunninghill.', time:'2 min ago',    read:false },
  { id:2, type:'AppointmentReminder', title:'Appointment reminder — Dr Sipho Dlamini',      body:'You have an appointment with Dr Sipho Dlamini tomorrow at 14:00. Broker: Riaan Botha.', time:'1 hr ago', read:false },
  { id:3, type:'CallbackReminder',  title:'Follow-up reminder — Dr Ayesha Moosa',           body:'Callback scheduled for today at 10:00. You set this on 14 May 2026.',            time:'3 hr ago',    read:false },
  { id:4, type:'AppointmentAssigned', title:'New appointment assigned — Dr Amara Osei',     body:'You have been assigned as broker for this appointment. First meeting: 21 May, 09:30.', time:'Yesterday', read:false },
  { id:5, type:'LeadAutoReturned',  title:'Lead auto-returned to queue — Dr Ruan de Beer', body:'This lead has been unassigned after 6 months without closure and returned to the queue.', time:'2 days ago', read:true },
  { id:6, type:'AppointmentReminder', title:'Daily appointment digest — 3 upcoming today',  body:'Dr Priya Naidoo at 10:00, Dr Marco Ferreira at 13:00, Dr Zanele Dube at 15:30.',  time:'Today 07:00', read:true },
];

const TYPE_ICON = {
  LeadAssigned:         '👤',
  AppointmentReminder:  '📅',
  CallbackReminder:     '⏰',
  AppointmentAssigned:  '🤝',
  LeadAutoReturned:     '🔄',
  RescheduleReminder:   '📋',
};

export default function Notifications() {
  const [tab,   setTab]   = useState('all');
  const [items, setItems] = useState(MOCK_NOTIFICATIONS);

  const filtered = items.filter(n => {
    if (tab === 'unread')      return !n.read;
    if (tab === 'assignments') return n.type.includes('Assigned');
    if (tab === 'reminders')   return n.type.includes('Reminder');
    return true;
  });

  const unreadCount = items.filter(n => !n.read).length;

  function markAllRead() { setItems(prev => prev.map(n => ({ ...n, read: true }))); }
  function markRead(id)  { setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n)); }

  return (
    <div style={{ ...s.page, maxWidth: '760px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 600, color:'var(--ink)' }}>Notifications</h1>
          {unreadCount > 0 && (
            <p style={{ margin: '3px 0 0', fontSize: '0.813rem', color:'var(--mut)' }}>
              {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button style={s.ghostBtn} onClick={markAllRead}>Mark all read</button>
        )}
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: '18px' }}>
        {[['all','All'], ['unread','Unread'], ['assignments','Assignments'], ['reminders','Reminders']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '0.875rem', fontFamily: 'inherit',
              fontWeight: tab === key ? 600 : 400,
              color: tab === key ? 'var(--accent)' : 'var(--mut)',
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={s.card}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px', color:'var(--mut)', fontSize: '0.875rem' }}>
            No notifications in this category.
          </div>
        )}
        {filtered.map((n, i) => (
          <div
            key={n.id}
            onClick={() => markRead(n.id)}
            style={{
              display: 'flex', gap: '12px', padding: '12px 0',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--line)' : 'none',
              cursor: n.read ? 'default' : 'pointer',
              background: n.read ? 'transparent' : 'rgba(239,246,255,0.3)',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontSize: '1.25rem', width: '24px', flexShrink: 0, textAlign: 'center' }}>
              {TYPE_ICON[n.type] ?? '🔔'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '3px' }}>
                <span style={{ fontWeight: n.read ? 400 : 600, fontSize: '0.875rem', color:'var(--ink)' }}>{n.title}</span>
                <span style={{ fontSize: '0.75rem', color:'var(--mut)', whiteSpace: 'nowrap' }}>{n.time}</span>
              </div>
              <p style={{ fontSize: '0.8125rem', color:'var(--mut)', margin: 0, lineHeight: 1.5 }}>{n.body}</p>
            </div>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: n.read ? 'transparent' : 'var(--accent)', flexShrink: 0, marginTop: '6px' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
