/**
 * pages/Tasks.jsx
 *
 * Task management — production feature, gated by tasks.enabled (Core, default false).
 *
 * TASK GENERATION MODEL:
 * In production, tasks are created server-side from appointment events:
 *   CallbackRequested outcome  → "Call back [lead name] by [callbackDateTime]"
 *   Appointment booked         → "Confirm appointment with [broker] — [date]"
 *   Meeting marked Rescheduled → "Reschedule [lead name] [nth] meeting"
 *   Meeting marked Seen        → "Record outcome — [lead name]"
 *   Appointment unassigned     → "Assign broker — [lead name]"
 *
 * In preview mode the page runs entirely on MOCK_TASKS below.
 *
 * ROLES:
 *   GlobalAdmin/Admin/Supervisor — see all tasks, can create and reassign
 *   Agent                        — sees tasks assigned to them only
 *   Broker                       — sees tasks assigned to them only
 *
 * API (when backend is built):
 *   GET    /api/tasks            ?assignedTo=me&status=pending&category=...
 *   POST   /api/tasks            Create manual task
 *   PATCH  /api/tasks/:id        Update status, assignee, dueDate
 *   DELETE /api/tasks/:id        Admin only
 */

import { useState } from 'react';
import { useRole }       from '../context/RoleContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { s }             from '../styles/tokens.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'all',          label: 'All tasks'    },
  { key: 'callback',     label: 'Callbacks'    },
  { key: 'appointment',  label: 'Appointments' },
  { key: 'rescheduling', label: 'Rescheduling' },
  { key: 'outcome',      label: 'Outcomes'     },
  { key: 'manual',       label: 'Manual'       },
];

const PRIORITIES = ['High', 'Medium', 'Low'];

const CATEGORY_META = {
  callback:     { label: 'Callback',     colour: '#d97706', bg: '#fffbeb' },
  appointment:  { label: 'Appointment',  colour: '#1d4ed8', bg: '#eff6ff' },
  rescheduling: { label: 'Reschedule',   colour: '#7c3aed', bg: '#f5f3ff' },
  outcome:      { label: 'Outcome',      colour: '#15803d', bg: '#f0fdf4' },
  manual:       { label: 'Manual',       colour: '#374151', bg: '#f9fafb' },
};

const PRIORITY_META = {
  High:   { colour: '#dc2626', bg: '#fef2f2' },
  Medium: { colour: '#d97706', bg: '#fffbeb' },
  Low:    { colour: '#6b7280', bg: '#f3f4f6' },
};

// Today for relative due date calculation
const TODAY = new Date('2026-05-20');

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Math.round((d - TODAY) / 86400000);
}

function dueMeta(dateStr, done) {
  if (done) return { label: 'Done', colour: '#15803d', bg: '#f0fdf4' };
  if (!dateStr) return { label: 'No due date', colour: '#9ca3af', bg: '#f3f4f6' };
  const days = daysUntil(dateStr);
  if (days < 0)  return { label: `Overdue ${Math.abs(days)}d`, colour: '#dc2626', bg: '#fef2f2' };
  if (days === 0) return { label: 'Due today',    colour: '#d97706', bg: '#fffbeb' };
  if (days === 1) return { label: 'Due tomorrow', colour: '#d97706', bg: '#fffbeb' };
  return { label: `Due ${dateStr.slice(5)}`, colour: '#1d4ed8', bg: '#eff6ff' };
}

// ─── Mock data ─────────────────────────────────────────────────────────────────
// Production: fetched from GET /api/tasks filtered by role and assignee.
const MOCK_TASKS = [
  {
    id: 't-001', category: 'callback', priority: 'High', done: false,
    title: 'Call back Dr Priya Naidoo',
    detail: 'Callback requested during initial contact. Missed the 10:00 slot.',
    linkedLead: 'Dr Priya Naidoo', linkedLeadId: 'lead-001',
    assignedTo: 'Thabo Molefe', assignedToRole: 'Agent',
    dueDate: '2026-05-19',
    createdAt: '2026-05-19',
    source: 'system',
  },
  {
    id: 't-002', category: 'appointment', priority: 'High', done: false,
    title: 'Confirm appointment — Dr Sipho Dlamini',
    detail: 'First appointment is tomorrow at 14:00. Confirm with broker Riaan Botha and send calendar invite.',
    linkedLead: 'Dr Sipho Dlamini', linkedLeadId: 'lead-002',
    linkedAppointment: 'appt-002',
    assignedTo: 'Thabo Molefe', assignedToRole: 'Agent',
    dueDate: '2026-05-20',
    createdAt: '2026-05-19',
    source: 'system',
  },
  {
    id: 't-003', category: 'rescheduling', priority: 'High', done: false,
    title: 'Reschedule — Dr Amara Osei second meeting',
    detail: 'Client requested reschedule. Original: 20 May 10:00. Find a new slot and update the appointment.',
    linkedLead: 'Dr Amara Osei', linkedLeadId: 'lead-003',
    linkedAppointment: 'appt-003',
    assignedTo: 'Sandra van der Berg', assignedToRole: 'Broker',
    dueDate: '2026-05-20',
    createdAt: '2026-05-20',
    source: 'system',
  },
  {
    id: 't-004', category: 'outcome', priority: 'Medium', done: false,
    title: 'Record outcome — Dr Lerato Mokoena',
    detail: 'First meeting was completed on 19 May. Record the outcome and update appointment status.',
    linkedLead: 'Dr Lerato Mokoena', linkedLeadId: 'lead-004',
    linkedAppointment: 'appt-004',
    assignedTo: 'Sandra van der Berg', assignedToRole: 'Broker',
    dueDate: '2026-05-21',
    createdAt: '2026-05-19',
    source: 'system',
  },
  {
    id: 't-005', category: 'appointment', priority: 'Medium', done: false,
    title: 'Assign broker — Dr James van Rooyen',
    detail: 'Appointment has been unassigned since 14 May. Assign to an available broker in Gauteng.',
    linkedLead: 'Dr James van Rooyen', linkedLeadId: 'lead-005',
    linkedAppointment: 'appt-005',
    assignedTo: 'Supervisor One', assignedToRole: 'Supervisor',
    dueDate: '2026-05-21',
    createdAt: '2026-05-14',
    source: 'system',
  },
  {
    id: 't-006', category: 'callback', priority: 'Medium', done: false,
    title: 'Call back Dr Zanele Dube',
    detail: 'Client called in during lunch, left voicemail. Has shown strong interest in Discovery Life.',
    linkedLead: 'Dr Zanele Dube', linkedLeadId: 'lead-006',
    assignedTo: 'Naledi van Wyk', assignedToRole: 'Agent',
    dueDate: '2026-05-21',
    createdAt: '2026-05-20',
    source: 'system',
  },
  {
    id: 't-007', category: 'manual', priority: 'Medium', done: false,
    title: 'Review Q2 lead import batch',
    detail: 'New SA Medical Register batch arrived. Review for duplicates before importing.',
    linkedLead: null, linkedLeadId: null,
    assignedTo: 'Admin User', assignedToRole: 'Admin',
    dueDate: '2026-05-22',
    createdAt: '2026-05-20',
    source: 'manual',
  },
  {
    id: 't-008', category: 'outcome', priority: 'Low', done: false,
    title: 'Record outcome — Dr Bongani Khumalo',
    detail: 'Second meeting completed 18 May. Waiting on outcome — broker needs to update the record.',
    linkedLead: 'Dr Bongani Khumalo', linkedLeadId: 'lead-008',
    linkedAppointment: 'appt-008',
    assignedTo: 'Pieter Joubert', assignedToRole: 'Broker',
    dueDate: '2026-05-22',
    createdAt: '2026-05-18',
    source: 'system',
  },
  {
    id: 't-009', category: 'rescheduling', priority: 'Low', done: false,
    title: 'Reschedule — Dr Fatima Mahomed first meeting',
    detail: 'Broker cancelled due to scheduling conflict. Needs to be rescheduled within the week.',
    linkedLead: 'Dr Fatima Mahomed', linkedLeadId: 'lead-009',
    linkedAppointment: 'appt-009',
    assignedTo: 'Naledi van Wyk', assignedToRole: 'Agent',
    dueDate: '2026-05-24',
    createdAt: '2026-05-19',
    source: 'system',
  },
  {
    id: 't-010', category: 'manual', priority: 'Low', done: true,
    title: 'Update broker product list — Riaan Botha',
    detail: 'Riaan has completed his Money and Medicine product training. Update his product list in User Admin.',
    linkedLead: null, linkedLeadId: null,
    assignedTo: 'Admin User', assignedToRole: 'Admin',
    dueDate: '2026-05-18',
    createdAt: '2026-05-15',
    source: 'manual',
  },
  {
    id: 't-011', category: 'callback', priority: 'High', done: true,
    title: 'Call back Dr Naledi Dlamini',
    detail: 'Completed. Client agreed to an appointment on 22 May.',
    linkedLead: 'Dr Naledi Dlamini', linkedLeadId: 'lead-011',
    assignedTo: 'Thabo Molefe', assignedToRole: 'Agent',
    dueDate: '2026-05-17',
    createdAt: '2026-05-16',
    source: 'system',
  },
];

const ASSIGNEES = ['All', 'Thabo Molefe', 'Naledi van Wyk', 'Sandra van der Berg',
                   'Pieter Joubert', 'Riaan Botha', 'Supervisor One', 'Admin User'];

// ─── New Task modal ─────────────────────────────────────────────────────────────
function NewTaskModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    title: '', detail: '', category: 'manual', priority: 'Medium',
    assignedTo: 'Admin User', dueDate: '',
  });
  const [error, setError] = useState('');

  function handleSave() {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    onSave({
      ...form,
      id: 't-' + Date.now(),
      done: false,
      linkedLead: null,
      linkedLeadId: null,
      linkedAppointment: null,
      assignedToRole: 'Admin',
      createdAt: '2026-05-20',
      source: 'manual',
    });
    onClose();
  }

  const f = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...s.modal, width: '460px' }}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>New Task</h2>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
              <path d="M3 3l10 10M13 3L3 13"/>
            </svg>
          </button>
        </div>

        {error && <div style={{ ...s.errorBox, marginBottom: '12px' }}>{error}</div>}

        <div style={{ marginBottom: '12px' }}>
          <label style={s.formLabel}>Title *</label>
          <input
            type="text"
            style={s.formInput}
            placeholder="e.g. Follow up with Dr Smith"
            value={form.title}
            onChange={e => f('title', e.target.value)}
          />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={s.formLabel}>Details</label>
          <textarea
            style={{ ...s.formInput, height: '64px', resize: 'vertical' }}
            placeholder="Optional context or instructions…"
            value={form.detail}
            onChange={e => f('detail', e.target.value)}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <div>
            <label style={s.formLabel}>Category</label>
            <select style={s.formInput} value={form.category} onChange={e => f('category', e.target.value)}>
              {Object.entries(CATEGORY_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={s.formLabel}>Priority</label>
            <select style={s.formInput} value={form.priority} onChange={e => f('priority', e.target.value)}>
              {PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
          <div>
            <label style={s.formLabel}>Assign to</label>
            <select style={s.formInput} value={form.assignedTo} onChange={e => f('assignedTo', e.target.value)}>
              {ASSIGNEES.filter(a => a !== 'All').map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={s.formLabel}>Due date</label>
            <input type="date" style={s.formInput} value={form.dueDate} onChange={e => f('dueDate', e.target.value)} />
          </div>
        </div>

        <div style={s.modalFooter}>
          <button style={{ ...s.secondaryBtn, background: 'none', border: 'none' }} onClick={onClose}>Cancel</button>
          <button style={s.primaryBtn} onClick={handleSave}>Create Task</button>
        </div>
      </div>
    </div>
  );
}

// ─── Task row ───────────────────────────────────────────────────────────────────
function TaskRow({ task, onToggle, isAdmin, isMobile }) {
  const [expanded, setExpanded] = useState(false);
  const due  = dueMeta(task.dueDate, task.done);
  const cat  = CATEGORY_META[task.category] ?? CATEGORY_META.manual;
  const pri  = PRIORITY_META[task.priority] ?? PRIORITY_META.Low;

  return (
    <div style={{
      borderBottom: '1px solid #f3f4f6',
      opacity: task.done ? 0.55 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Main row */}
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 0', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Checkbox */}
        <div
          onClick={e => { e.stopPropagation(); onToggle(task.id); }}
          style={{
            width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0, marginTop: '2px',
            border: task.done ? 'none' : '2px solid #d1d5db',
            background: task.done ? '#1d4ed8' : 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          {task.done && (
            <svg viewBox="0 0 12 10" fill="none" stroke="white" strokeWidth="2" width="10" height="8">
              <path d="M1 5l3.5 3.5L11 1"/>
            </svg>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '0.875rem', fontWeight: 500, color: '#111827',
              textDecoration: task.done ? 'line-through' : 'none',
            }}>
              {task.title}
            </span>
            {/* Priority dot — only high */}
            {task.priority === 'High' && !task.done && (
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#dc2626', flexShrink: 0, marginTop: '5px' }} />
            )}
          </div>
          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
              {/* Category chip */}
              <span style={{
                fontSize: '0.6875rem', fontWeight: 600, padding: '1px 7px', borderRadius: '10px',
                background: cat.bg, color: cat.colour,
              }}>
                {cat.label}
              </span>
              {/* Assignee */}
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>→ {task.assignedTo}</span>
              {/* Linked lead */}
              {task.linkedLead && (
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>· {task.linkedLead}</span>
              )}
            </div>
          )}
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{
            fontSize: '0.6875rem', fontWeight: 600, padding: '2px 8px', borderRadius: '20px',
            background: due.bg, color: due.colour, whiteSpace: 'nowrap',
          }}>
            {due.label}
          </span>
          <svg
            viewBox="0 0 16 16" fill="none" stroke="#9ca3af" strokeWidth="1.6"
            width="14" height="14"
            style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}
          >
            <path d="M3 6l5 5 5-5"/>
          </svg>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          marginLeft: '28px', marginBottom: '12px', padding: '12px',
          background: '#f9fafb', borderRadius: '8px', fontSize: '0.8125rem',
        }}>
          {task.detail && (
            <p style={{ color: '#374151', marginBottom: '10px', lineHeight: 1.5 }}>{task.detail}</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '8px' }}>
            <div>
              <span style={{ fontSize: '0.6875rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Priority</span>
              <div style={{ marginTop: '2px' }}>
                <span style={{
                  fontSize: '0.75rem', fontWeight: 600, padding: '1px 7px', borderRadius: '10px',
                  background: pri.bg, color: pri.colour,
                }}>
                  {task.priority}
                </span>
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.6875rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned to</span>
              <div style={{ fontSize: '0.8125rem', color: '#111827', marginTop: '2px', fontWeight: 500 }}>{task.assignedTo}</div>
            </div>
            <div>
              <span style={{ fontSize: '0.6875rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source</span>
              <div style={{ fontSize: '0.8125rem', color: '#111827', marginTop: '2px' }}>
                {task.source === 'system' ? 'Auto-generated' : 'Manual'}
              </div>
            </div>
            {task.linkedLead && (
              <div>
                <span style={{ fontSize: '0.6875rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Linked lead</span>
                <div style={{ fontSize: '0.8125rem', color: '#1d4ed8', marginTop: '2px', fontWeight: 500 }}>{task.linkedLead}</div>
              </div>
            )}
            <div>
              <span style={{ fontSize: '0.6875rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Created</span>
              <div style={{ fontSize: '0.8125rem', color: '#111827', marginTop: '2px' }}>{task.createdAt}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────
export default function Tasks() {
  const { role }     = useRole();
  const { isMobile } = useWindowSize();

  const isAdmin  = ['GlobalAdmin', 'Admin', 'Supervisor'].includes(role);
  const isBroker = role === 'Broker';

  const [tasks,        setTasks]        = useState(MOCK_TASKS);
  const [activeTab,    setActiveTab]    = useState('all');
  const [filterAssign, setFilterAssign] = useState('All');
  const [showDone,     setShowDone]     = useState(false);
  const [showNew,      setShowNew]      = useState(false);
  const [search,       setSearch]       = useState('');

  function toggleDone(id) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }

  function addTask(task) {
    setTasks(prev => [task, ...prev]);
  }

  // Role filter — agents and brokers see only their tasks in production
  // (in preview all tasks are shown, but with a notice)
  const roleName = role === 'Agent' ? 'Thabo Molefe'
                 : role === 'Broker' ? 'Sandra van der Berg'
                 : null;

  const filtered = tasks.filter(t => {
    if (roleName && t.assignedTo !== roleName) return false;
    if (!showDone && t.done) return false;
    if (activeTab !== 'all' && t.category !== activeTab) return false;
    if (filterAssign !== 'All' && t.assignedTo !== filterAssign) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
        !(t.linkedLead ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Metrics — always from full task list, not filtered view
  const myTasks  = roleName ? tasks.filter(t => t.assignedTo === roleName) : tasks;
  const metrics  = [
    { label: 'Pending',   value: myTasks.filter(t => !t.done).length,                                               colour: '#d97706' },
    { label: 'Overdue',   value: myTasks.filter(t => !t.done && t.dueDate && daysUntil(t.dueDate) < 0).length,     colour: '#dc2626' },
    { label: 'Due today', value: myTasks.filter(t => !t.done && t.dueDate && daysUntil(t.dueDate) === 0).length,   colour: '#7c3aed' },
    { label: 'Completed', value: myTasks.filter(t => t.done).length,                                                colour: '#15803d' },
  ];

  return (
    <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '820px' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 600, color: '#111827' }}>Tasks</h1>
          <p style={{ margin: '3px 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
            Actions across appointments, callbacks, and scheduling
          </p>
        </div>
        {isAdmin && (
          <button style={s.primaryBtn} onClick={() => setShowNew(true)}>
            + New Task
          </button>
        )}
      </div>

      {/* ── Metrics ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
        {metrics.map(m => (
          <div key={m.label} style={s.metricCard}>
            <div style={{ fontSize: '0.6875rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
              {m.label}
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: m.colour, lineHeight: 1 }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters row ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search tasks or lead name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...s.formInput, maxWidth: '220px', padding: '5px 10px', fontSize: '0.8125rem' }}
        />
        {isAdmin && (
          <select
            value={filterAssign}
            onChange={e => setFilterAssign(e.target.value)}
            style={{ ...s.formInput, maxWidth: '160px', padding: '5px 8px', fontSize: '0.8125rem' }}
          >
            {ASSIGNEES.map(a => <option key={a}>{a}</option>)}
          </select>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8125rem', color: '#6b7280', cursor: 'pointer', marginLeft: 'auto' }}>
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
          Show completed
        </label>
      </div>

      {/* ── Category tabs ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '4px', overflowX: 'auto' }}>
        {CATEGORIES.map(({ key, label }) => {
          const count = key === 'all'
            ? tasks.filter(t => !t.done && (!roleName || t.assignedTo === roleName)).length
            : tasks.filter(t => t.category === key && !t.done && (!roleName || t.assignedTo === roleName)).length;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '0.8125rem', fontFamily: 'inherit', whiteSpace: 'nowrap',
                fontWeight: activeTab === key ? 600 : 400,
                color: activeTab === key ? '#1d4ed8' : '#6b7280',
                borderBottom: activeTab === key ? '2px solid #1d4ed8' : '2px solid transparent',
                marginBottom: '-1px',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              {label}
              {count > 0 && (
                <span style={{
                  fontSize: '0.625rem', fontWeight: 600,
                  background: activeTab === key ? '#eff6ff' : '#f3f4f6',
                  color: activeTab === key ? '#1d4ed8' : '#9ca3af',
                  borderRadius: '10px', padding: '1px 5px',
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Task list ───────────────────────────────────────────────────── */}
      <div style={s.card}>
        {filtered.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
            {search || filterAssign !== 'All'
              ? 'No tasks match your filters.'
              : showDone ? 'No tasks in this category.' : 'No pending tasks. Good work.'}
          </div>
        ) : (
          filtered.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={toggleDone}
              isAdmin={isAdmin}
              isMobile={isMobile}
            />
          ))
        )}
      </div>

      {/* ── New Task modal ───────────────────────────────────────────────── */}
      {showNew && (
        <NewTaskModal onClose={() => setShowNew(false)} onSave={addTask} />
      )}
    </div>
  );
}
