/**
 * pages/Tasks.jsx
 *
 * Task management — Phase 2 feature (tasks.enabled flag, default false).
 * Displays a designed UI illustrating the planned capability.
 *
 * Tasks are generated server-side from appointment events:
 *   - Callback requested    → "Call back [lead name]" task
 *   - Appointment tomorrow  → "Confirm appointment" task
 *   - Meeting rescheduled   → "Reschedule [lead name] 2nd meeting" task
 *   - Meeting completed     → "Record outcome" task
 *   - Appointment unassigned → "Assign broker" task
 *
 * This page is only reachable when tasks.enabled = true (route guard in App.jsx).
 * The nav item is also hidden when the flag is off.
 * Flag: tasks.enabled (Phase2 tier, default false)
 */

import { useState } from 'react';
import { s }        from '../styles/tokens.js';
import { useWindowSize } from '../hooks/useWindowSize.js';

// ─── Mock data ─────────────────────────────────────────────────────────────────
const MOCK_TASKS = [
  {
    id: 1,
    category: 'reminders',
    title: 'Call back Dr Priya Naidoo',
    detail: 'Callback requested · Due: Today 10:00',
    dueLabel: 'Overdue',
    dueBg: '#fef2f2',
    dueColor: '#dc2626',
    done: false,
  },
  {
    id: 2,
    category: 'appointments',
    title: 'Confirm appointment — Dr Sipho Dlamini',
    detail: 'Appointment tomorrow 14:00 · Confirm with broker',
    dueLabel: 'Due today',
    dueBg: '#fffbeb',
    dueColor: '#d97706',
    done: false,
  },
  {
    id: 3,
    category: 'rescheduling',
    title: 'Reschedule — Dr Amara Osei 2nd meeting',
    detail: 'Client requested reschedule · Original: 20 May',
    dueLabel: 'Due today',
    dueBg: '#fffbeb',
    dueColor: '#d97706',
    done: false,
  },
  {
    id: 4,
    category: 'appointments',
    title: 'Record outcome — Dr Lerato Mokoena',
    detail: 'First meeting completed — record outcome',
    dueLabel: 'Due 21 May',
    dueBg: '#eff6ff',
    dueColor: '#1d4ed8',
    done: false,
  },
  {
    id: 5,
    category: 'appointments',
    title: 'Assign broker — Dr James van Rooyen',
    detail: 'Appointment unassigned · Booked 14 May 2026',
    dueLabel: 'Due 21 May',
    dueBg: '#eff6ff',
    dueColor: '#1d4ed8',
    done: false,
  },
  {
    id: 6,
    category: 'reminders',
    title: 'Follow up — Dr Naledi Dlamini',
    detail: 'Completed 14 May 2026',
    dueLabel: 'Done',
    dueBg: '#f0fdf4',
    dueColor: '#15803d',
    done: true,
  },
];

const TABS = [
  { key: 'all',          label: 'All tasks'    },
  { key: 'appointments', label: 'Appointments' },
  { key: 'rescheduling', label: 'Rescheduling' },
  { key: 'reminders',    label: 'Reminders'    },
];

// ─── Task row ──────────────────────────────────────────────────────────────────
function TaskRow({ task, onToggle }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      padding: '12px 0',
      borderBottom: '1px solid #f3f4f6',
      opacity: task.done ? 0.6 : 1,
    }}>
      <input
        type="checkbox"
        checked={task.done}
        onChange={() => onToggle(task.id)}
        style={{ marginTop: '3px', width: '15px', height: '15px', cursor: 'pointer', flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.875rem',
          fontWeight: 500,
          color: '#111827',
          textDecoration: task.done ? 'line-through' : 'none',
          marginBottom: '2px',
        }}>
          {task.title}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
          {task.detail}
        </div>
      </div>
      <span style={{
        flexShrink: 0,
        fontSize: '0.6875rem',
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: '20px',
        background: task.dueBg,
        color: task.dueColor,
        whiteSpace: 'nowrap',
      }}>
        {task.dueLabel}
      </span>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function Tasks() {
  const { isMobile }  = useWindowSize();
  const [tab,   setTab]   = useState('all');
  const [tasks, setTasks] = useState(MOCK_TASKS);

  function toggleDone(id) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }

  const pending   = tasks.filter(t => !t.done).length;
  const displayed = tab === 'all'
    ? tasks
    : tasks.filter(t => t.category === tab);

  return (
    <div style={{ ...s.page, padding: isMobile ? '12px' : '24px', maxWidth: '760px' }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 600, color: '#111827' }}>Tasks</h1>
          <p style={{ margin: '3px 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
            Your pending actions across appointments, reminders, and scheduling
          </p>
        </div>
        <button
          style={{ ...s.primaryBtn, opacity: 0.5, cursor: 'not-allowed' }}
          disabled
          title="Task creation coming in Phase 2"
        >
          + New Task
        </button>
      </div>

      {/* ── Phase 2 notice ────────────────────────────────────────────────── */}
      <div style={{ ...s.noticeWarn, marginBottom: '16px' }}>
        <strong>Phase 2 feature.</strong> Task generation from appointment events is not yet active.
        The list below shows example tasks to illustrate the planned workflow.
        Tasks will be created automatically when the backend is connected.
      </div>

      {/* ── Metrics ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
        {[
          { label: 'Pending',    value: pending,                          color: '#d97706' },
          { label: 'Overdue',    value: tasks.filter(t => t.dueLabel === 'Overdue' && !t.done).length, color: '#dc2626' },
          { label: 'Due today',  value: tasks.filter(t => t.dueLabel === 'Due today' && !t.done).length, color: '#7c3aed' },
          { label: 'Completed',  value: tasks.filter(t => t.done).length, color: '#15803d' },
        ].map(m => (
          <div key={m.label} style={s.metricCard}>
            <div style={{ fontSize: '0.6875rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
              {m.label}
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: m.color, lineHeight: 1 }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '4px' }}>
        {TABS.map(({ key, label }) => {
          const count = key === 'all'
            ? tasks.filter(t => !t.done).length
            : tasks.filter(t => t.category === key && !t.done).length;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '8px 14px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
                fontWeight: tab === key ? 600 : 400,
                color: tab === key ? '#1d4ed8' : '#6b7280',
                borderBottom: tab === key ? '2px solid #1d4ed8' : '2px solid transparent',
                marginBottom: '-1px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              {label}
              {count > 0 && (
                <span style={{
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  background: tab === key ? '#eff6ff' : '#f3f4f6',
                  color: tab === key ? '#1d4ed8' : '#9ca3af',
                  borderRadius: '10px',
                  padding: '1px 6px',
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Task list ─────────────────────────────────────────────────────── */}
      <div style={s.card}>
        {displayed.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
            No tasks in this category.
          </div>
        ) : (
          displayed.map(task => (
            <TaskRow key={task.id} task={task} onToggle={toggleDone} />
          ))
        )}
      </div>

    </div>
  );
}
