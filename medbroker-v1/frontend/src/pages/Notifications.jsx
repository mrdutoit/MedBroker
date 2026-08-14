/**
 * pages/Notifications.jsx
 * In-app notification inbox.
 *
 * BACKEND WIRING (added 28 Jul 2026, §61; scheduled types added via
 * Vercel Cron, §68; TaskAssigned/TaskDueReminder added §98 — Tasks had
 * never been wired into notifications at all before then, confirmed
 * while investigating something Mark noticed testing, not something
 * that predated this feature): every type this file's own TYPE_ICON
 * table lists is wired to a real backend now, except RescheduleReminder,
 * confirmed dead code rather than a missed requirement (see §68).
 * LeadAssigned/AppointmentAssigned/TaskAssigned are synchronous,
 * action-driven triggers; AppointmentReminder/CallbackReminder/
 * LeadAutoReturned/TaskDueReminder run off the daily Cron scan.
 *
 * RETENTION (added 3 Aug 2026, §99): Mark asked directly whether this
 * list would just grow forever — it would have, there was no dismiss
 * action and no automatic cleanup at all. Both now exist: a per-
 * notification × dismiss, a "Clear read" bulk action for read ones only
 * (an unread notification still needs to be seen — clearing it would be
 * indistinguishable from losing it), and an automatic sweep in the same
 * daily Cron tick that already handles the reminder checks, removing
 * anything read more than 30 days ago on its own.
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
import { notificationsApi } from '../services/api.js';
import { useFetch }       from '../hooks/useFetch.js';

const TYPE_ICON = {
  LeadAssigned:         '👤',
  AppointmentReminder:  '📅',
  CallbackReminder:     '⏰',
  AppointmentAssigned:  '🤝',
  LeadAutoReturned:     '🔄',
  RescheduleReminder:   '📋',
  TaskAssigned:         '✅',
  TaskDueReminder:      '⏳',
  // 14 Aug 2026 (§160) — outstanding item 2.
  AppointmentUnassignedWarning: '⚠️',
};

export default function Notifications() {
  // Always self-scoped server-side (see notificationHandlers.js) — no
  // role/identity filtering needed here.
  const { data, refetch } = useFetch(() => notificationsApi.list(), []);

  const items = (data?.notifications ?? []).map(n => ({
    id: n.id, type: n.type, title: n.title, body: n.body,
    time: formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }),
    read: n.isRead,
  }));

  const [tab, setTab] = useState('all');

  const filtered = items.filter(n => {
    if (tab === 'unread')      return !n.read;
    if (tab === 'assignments') return n.type.includes('Assigned');
    if (tab === 'reminders')   return n.type.includes('Reminder');
    return true;
  });

  const unreadCount = items.filter(n => !n.read).length;

  async function markAllRead() {
    try {
      await notificationsApi.markAllRead();
      refetch();
    } catch (err) {
      console.error('Could not mark all notifications read:', err);
    }
  }

  async function markRead(id) {
    const n = items.find(x => x.id === id);
    if (!n || n.read) return; // already read — no-op, matches cursor:'default' below
    try {
      await notificationsApi.markRead(id);
      refetch();
    } catch (err) {
      console.error('Could not mark notification read:', err);
    }
  }

  async function handleDismiss(id, e) {
    e.stopPropagation(); // sits inside the clickable row — don't also trigger markRead
    try {
      await notificationsApi.dismiss(id);
      refetch();
    } catch (err) {
      console.error('Could not dismiss notification:', err);
    }
  }

  async function handleClearRead() {
    try {
      await notificationsApi.clearRead();
      refetch();
    } catch (err) {
      console.error('Could not clear read notifications:', err);
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
        <div style={{ display: 'flex', gap: '8px' }}>
          {unreadCount > 0 && (
            <button style={s.ghostBtn} onClick={markAllRead}>Mark all read</button>
          )}
          {items.some(n => n.read) && (
            <button style={s.ghostBtn} onClick={handleClearRead}>Clear read</button>
          )}
        </div>
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
            <button
              onClick={(e) => handleDismiss(n.id, e)}
              title="Dismiss"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', color:'var(--mut)',
                fontSize: '1rem', lineHeight: 1, padding: '2px 4px', flexShrink: 0, marginTop: '2px',
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
