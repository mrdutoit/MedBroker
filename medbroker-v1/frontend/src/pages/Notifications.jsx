/**
 * pages/Notifications.jsx
 * In-app notification inbox.
 *
 * BACKEND WIRING (added 28 Jul 2026, §61): only two of the six types this
 * file's own TYPE_ICON table lists are wired to a real backend —
 * LeadAssigned (leadHandlers.js's assign handler) and AppointmentAssigned
 * (appointmentService.assignBroker()), both synchronous, action-driven
 * triggers. AppointmentReminder, CallbackReminder, LeadAutoReturned, and
 * RescheduleReminder are all time-based and need a scheduled job — no
 * Vercel Cron exists anywhere in this stack yet, so those stay
 * unbuilt (see Status.md §61 for the full reasoning). The Entra branch
 * (RoleContext doesn't yet derive a real identity there — see its header
 * comment) still runs entirely on MOCK_NOTIFICATIONS below, covering all
 * six types so the UI/UX can still be demonstrated end-to-end.
 *
 * Also fixed in passing: the unread-row background was a hardcoded
 * rgba(239,246,255,0.3) — a light-mode-only blue tint that never adapted
 * to Terra/Midnight/Ember, a violation of the INLINE COLOUR ANTI-PATTERN
 * rule already documented in Project_Context.md §8. Now a themed
 * color-mix(), matching every other tinted surface in this app.
 */

import { useState }      from 'react';
import { formatDistanceToNow } from 'date-fns';
import { s }              from '../styles/tokens.js';
import { apiMode, notificationsApi } from '../services/api.js';
import { useFetch }       from '../hooks/useFetch.js';

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
  const demoMode = apiMode.DEMO_MODE;

  // Demo mode: real fetch, always self-scoped server-side (see
  // notificationHandlers.js) — no role/identity filtering needed here.
  const { data, refetch } = useFetch(
    () => demoMode ? notificationsApi.list() : Promise.resolve(null),
    [demoMode]
  );
  // Entra branch keeps its own local, mutable copy of MOCK_NOTIFICATIONS
  // so mark-read/mark-all-read still work with no backend behind them —
  // unchanged behaviour from before this session.
  const [mockItems, setMockItems] = useState(MOCK_NOTIFICATIONS);

  const items = demoMode
    ? (data?.notifications ?? []).map(n => ({
        id: n.id, type: n.type, title: n.title, body: n.body,
        time: formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }),
        read: n.isRead,
      }))
    : mockItems;

  const [tab, setTab] = useState('all');

  const filtered = items.filter(n => {
    if (tab === 'unread')      return !n.read;
    if (tab === 'assignments') return n.type.includes('Assigned');
    if (tab === 'reminders')   return n.type.includes('Reminder');
    return true;
  });

  const unreadCount = items.filter(n => !n.read).length;

  async function markAllRead() {
    if (demoMode) {
      try {
        await notificationsApi.markAllRead();
        refetch();
      } catch (err) {
        console.error('Could not mark all notifications read:', err);
      }
    } else {
      setMockItems(prev => prev.map(n => ({ ...n, read: true })));
    }
  }

  async function markRead(id) {
    if (demoMode) {
      const n = items.find(x => x.id === id);
      if (!n || n.read) return; // already read — matches the Entra branch's cursor:'default' no-op below
      try {
        await notificationsApi.markRead(id);
        refetch();
      } catch (err) {
        console.error('Could not mark notification read:', err);
      }
    } else {
      setMockItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    }
  }

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
              background: n.read ? 'transparent' : 'color-mix(in srgb, var(--accent) 6%, var(--panel))',
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
