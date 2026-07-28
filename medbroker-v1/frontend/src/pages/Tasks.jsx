/**
 * pages/Tasks.jsx
 *
 * Task management — production feature, gated by tasks.enabled (Core, default false).
 *
 * TASK GENERATION MODEL (built 28 Jul 2026, §56):
 * Tasks are created server-side from these five trigger rules — see
 * taskService.createTask()'s call sites in leadService.logCallAttempt()
 * and appointmentService.createAppointment()/saveOutcome():
 *   CallbackRequested outcome  → "Call back [lead name]"
 *   Appointment booked         → "Confirm appointment with [broker] — [date]"
 *   Meeting marked Rescheduled → "Reschedule [lead name] [nth] meeting"
 *   Meeting marked Seen        → "Record outcome — [lead name]"
 *   Appointment unassigned     → "Assign broker — [lead name]"
 *
 * The Entra branch (RoleContext doesn't yet derive a real identity there —
 * see its header comment) still runs entirely on MOCK_TASKS below.
 *
 * ROLES (server-enforced, see api-lib/handlers/taskHandlers.js):
 *   GlobalAdmin/Admin — see all tasks, can create/reassign/delete
 *   Supervisor        — sees self + direct reports' tasks, can create/reassign
 *   Agent/Broker      — sees only tasks assigned to them; can mark done, nothing else
 *
 * API:
 *   GET    /api/tasks            ?assignedToId=<uuid> (Admin/Supervisor filter only —
 *                                 role-scoping itself isn't a query param, see handler)
 *   POST   /api/tasks            Create manual task — Admin/Supervisor/GlobalAdmin only
 *   PATCH  /api/tasks/:id        isComplete: anyone who can see the task.
 *                                 Everything else: Admin/Supervisor/GlobalAdmin only
 *   DELETE /api/tasks/:id        Admin/GlobalAdmin only, manually created tasks only
 *                                 (§58) — a system-generated task represents a real
 *                                 pending action; it should be completed or reassigned,
 *                                 not deleted. Enforced server-side, not just hidden here.
 */

import { useState }      from 'react';
import { useRole }       from '../context/RoleContext.jsx';
import { useAuth }       from '../context/AuthContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { useFetch }      from '../hooks/useFetch.js';
import { s }             from '../styles/tokens.js';
import { apiMode, tasksApi, usersApi } from '../services/api.js';

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
  callback:     { label: 'Callback',     colour: '#d97706', bg: 'color-mix(in srgb, #d97706 14%, var(--panel))' },
  appointment:  { label: 'Appointment',  colour: 'var(--accent)', bg: 'color-mix(in srgb, #1d4ed8 14%, var(--panel))' },
  rescheduling: { label: 'Reschedule',   colour: '#a78bfa', bg: 'color-mix(in srgb, #7c3aed 14%, var(--panel))' },
  outcome:      { label: 'Outcome',      colour: '#15803d', bg: 'color-mix(in srgb, #15803d 14%, var(--panel))' },
  manual:       { label: 'Manual',       colour: 'var(--ink)', bg: 'var(--panel2)' },
};

const PRIORITY_META = {
  High:   { colour: '#dc2626', bg: 'color-mix(in srgb, #dc2626 14%, var(--panel))' },
  Medium: { colour: '#d97706', bg: 'color-mix(in srgb, #d97706 14%, var(--panel))' },
  Low:    { colour: 'var(--mut)', bg: 'var(--panel2)' },
};

// Fixed reference date for MOCK_TASKS' curated relative-date badges
// (Entra branch only — real demo-mode tasks use the real current date,
// computed in the Tasks() component below and threaded through as a
// parameter rather than read off a module-level constant).
const MOCK_TODAY = new Date('2026-05-20');

function daysUntil(dateStr, today) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Math.round((d - today) / 86400000);
}

function dueMeta(dateStr, done, today) {
  if (done) return { label: 'Done', colour: '#15803d', bg: 'color-mix(in srgb, #15803d 14%, var(--panel))' };
  if (!dateStr) return { label: 'No due date', colour: 'var(--mut)', bg: 'var(--panel2)' };
  const days = daysUntil(dateStr, today);
  if (days < 0)  return { label: `Overdue ${Math.abs(days)}d`, colour: '#dc2626', bg: 'color-mix(in srgb, #dc2626 14%, var(--panel))' };
  if (days === 0) return { label: 'Due today',    colour: '#d97706', bg: 'color-mix(in srgb, #d97706 14%, var(--panel))' };
  if (days === 1) return { label: 'Due tomorrow', colour: '#d97706', bg: 'color-mix(in srgb, #d97706 14%, var(--panel))' };
  return { label: `Due ${dateStr.slice(5)}`, colour: 'var(--accent)', bg: 'color-mix(in srgb, #1d4ed8 14%, var(--panel))' };
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
function NewTaskModal({ onClose, onSave, assignees }) {
  const [form, setForm] = useState({
    title: '', detail: '', category: 'manual', priority: 'Medium',
    assignedTo: assignees[0]?.value ?? '', dueDate: '',
  });
  const [error, setError] = useState('');

  function handleSave() {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.assignedTo) { setError('Choose someone to assign this to.'); return; }
    onSave(form);
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
              {assignees.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
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
function TaskRow({ task, onToggle, onDelete, isAdmin, canDelete, isMobile, today }) {
  const [expanded, setExpanded] = useState(false);
  const due  = dueMeta(task.dueDate, task.done, today);
  const cat  = CATEGORY_META[task.category] ?? CATEGORY_META.manual;
  const pri  = PRIORITY_META[task.priority] ?? PRIORITY_META.Low;

  return (
    <div style={{
      borderBottom:'1px solid var(--line)',
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
            border: task.done ? 'none' : '2px solid var(--line)',
            background:task.done ? 'var(--accent)' : 'var(--panel)',
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
              fontSize: '0.875rem', fontWeight: 500, color:'var(--ink)',
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
              <span style={{ fontSize: '0.75rem', color:'var(--mut)' }}>→ {task.assignedTo}</span>
              {/* Linked lead */}
              {task.linkedLead && (
                <span style={{ fontSize: '0.75rem', color:'var(--mut)' }}>· {task.linkedLead}</span>
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
            viewBox="0 0 16 16" fill="none" stroke="var(--mut)" strokeWidth="1.6"
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
          background:'var(--panel2)', borderRadius: '8px', fontSize: '0.8125rem',
        }}>
          {task.detail && (
            <p style={{ color:'var(--ink)', marginBottom: '10px', lineHeight: 1.5 }}>{task.detail}</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '8px' }}>
            <div>
              <span style={{ fontSize: '0.6875rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Priority</span>
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
              <span style={{ fontSize: '0.6875rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned to</span>
              <div style={{ fontSize: '0.8125rem', color:'var(--ink)', marginTop: '2px', fontWeight: 500 }}>{task.assignedTo}</div>
            </div>
            <div>
              <span style={{ fontSize: '0.6875rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source</span>
              <div style={{ fontSize: '0.8125rem', color:'var(--ink)', marginTop: '2px' }}>
                {task.source === 'system' ? 'Auto-generated' : 'Manual'}
              </div>
            </div>
            {task.linkedLead && (
              <div>
                <span style={{ fontSize: '0.6875rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Linked lead</span>
                <div style={{ fontSize: '0.8125rem', color:'var(--accent)', marginTop: '2px', fontWeight: 500 }}>{task.linkedLead}</div>
              </div>
            )}
            <div>
              <span style={{ fontSize: '0.6875rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Created</span>
              <div style={{ fontSize: '0.8125rem', color:'var(--ink)', marginTop: '2px' }}>{task.createdAt}</div>
            </div>
          </div>
          {/* Delete — manually created tasks only (§58): a system-generated
              task represents a real pending action and should be completed
              or reassigned, not deleted; the backend also enforces this,
              this just keeps the control from appearing where it wouldn't
              be allowed anyway. */}
          {canDelete && task.source === 'manual' && (
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--line)' }}>
              <button
                onClick={e => { e.stopPropagation(); onDelete(task.id); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  fontSize: '0.75rem', fontWeight: 600, color: '#dc2626',
                }}
              >
                Delete task
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────
export default function Tasks() {
  const { role }      = useRole();
  const { isMobile }  = useWindowSize();
  const demoMode = apiMode.DEMO_MODE;

  const isAdmin  = ['GlobalAdmin', 'Admin', 'Supervisor'].includes(role);
  const isBroker = role === 'Broker';
  // Narrower than isAdmin — matches the API's own DELETE gate (Admin/
  // GlobalAdmin only, not Supervisor; see taskHandlers.js).
  const canDelete = ['GlobalAdmin', 'Admin'].includes(role);

  // Demo mode: real fetch. Role-scoping already happened server-side
  // (taskHandlers.js) — Agent/Broker only ever receive their own tasks,
  // Supervisor receives self + direct reports, Admin/GlobalAdmin receive
  // everything — so there is no further "is this mine" filtering to do
  // here the way the Entra branch's roleName mechanism still needs below.
  const { data: taskData, refetch: refetchTasks } = useFetch(
    () => demoMode ? tasksApi.list() : Promise.resolve(null),
    [demoMode]
  );
  // Entra branch keeps its own local, mutable copy of MOCK_TASKS so the
  // checkbox/New Task interactions still work with no backend behind them
  // — unchanged behaviour from before this session.
  const [mockTasks, setMockTasks] = useState(MOCK_TASKS);
  const tasks = demoMode ? (taskData?.tasks ?? []) : mockTasks;

  // Real users for the Admin/Supervisor "Assignee" filter and NewTaskModal's
  // "Assign to" field — fetched only when both apply, to avoid the extra
  // round trip for Agent/Broker, who never see either control.
  const { data: userData } = useFetch(
    () => (demoMode && isAdmin) ? usersApi.list() : Promise.resolve(null),
    [demoMode, isAdmin]
  );
  const assignees = demoMode
    ? (userData?.users ?? []).map(u => ({ value: u.id, label: u.displayName }))
    : ASSIGNEES.filter(a => a !== 'All').map(a => ({ value: a, label: a }));

  const [activeTab,    setActiveTab]    = useState('all');
  const [filterAssign, setFilterAssign] = useState('All');
  const [showDone,     setShowDone]     = useState(false);
  const [showNew,      setShowNew]      = useState(false);
  const [search,       setSearch]       = useState('');

  // MOCK_TASKS' relative-date badges were curated against a fixed date;
  // real tasks from a live database need the real current date instead.
  const today = demoMode ? new Date() : MOCK_TODAY;

  async function toggleDone(id) {
    if (demoMode) {
      const task = tasks.find(t => t.id === id);
      if (!task) return;
      try {
        await tasksApi.update(id, { isComplete: !task.done });
        refetchTasks();
      } catch (err) {
        console.error('Could not update task:', err);
      }
    } else {
      setMockTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
    }
  }

  // §58 — manually created tasks only, both here and enforced server-side
  // in taskHandlers.js. window.confirm() matches the existing precedent
  // set in EventDetail.jsx for this class of lower-stakes destructive
  // action, rather than introducing a new confirm-modal pattern for a
  // to-do item.
  async function deleteTaskHandler(id) {
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    if (demoMode) {
      try {
        await tasksApi.remove(id);
        refetchTasks();
      } catch (err) {
        console.error('Could not delete task:', err);
      }
    } else {
      setMockTasks(prev => prev.filter(t => t.id !== id));
    }
  }

  async function addTask(form) {
    if (demoMode) {
      try {
        await tasksApi.create({
          title:        form.title,
          detail:       form.detail || undefined,
          category:     form.category,
          priority:     form.priority,
          assignedToId: form.assignedTo,
          dueDate:      form.dueDate || undefined,
        });
        refetchTasks();
      } catch (err) {
        console.error('Could not create task:', err);
      }
    } else {
      setMockTasks(prev => [{
        ...form,
        id: 't-' + Date.now(),
        done: false,
        linkedLead: null,
        linkedLeadId: null,
        linkedAppointment: null,
        assignedToRole: 'Admin',
        createdAt: MOCK_TODAY.toISOString().slice(0, 10),
        source: 'manual',
      }, ...prev]);
    }
  }

  // Role filter — Entra branch only (matches its fixed PERSONAS names,
  // since RoleContext doesn't derive a real identity there). Demo mode's
  // scoping already happened server-side, see the fetch above.
  const roleName = demoMode ? null
                 : role === 'Agent' ? 'Thabo Molefe'
                 : role === 'Broker' ? 'Sandra van der Berg'
                 : null;

  function matchesAssigneeFilter(t) {
    if (filterAssign === 'All') return true;
    return demoMode ? t.assignedToId === filterAssign : t.assignedTo === filterAssign;
  }

  const filtered = tasks.filter(t => {
    if (roleName && t.assignedTo !== roleName) return false;
    if (!showDone && t.done) return false;
    if (activeTab !== 'all' && t.category !== activeTab) return false;
    if (!matchesAssigneeFilter(t)) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
        !(t.linkedLead ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Metrics — always from the full task list, not the filtered view. In
  // demo mode `tasks` is already exactly the right scope for this person
  // (see the fetch above), so no further roleName filtering applies here.
  const myTasks  = roleName ? tasks.filter(t => t.assignedTo === roleName) : tasks;
  const metrics  = [
    { label: 'Pending',   value: myTasks.filter(t => !t.done).length,                                               colour: '#d97706' },
    { label: 'Overdue',   value: myTasks.filter(t => !t.done && t.dueDate && daysUntil(t.dueDate, today) < 0).length,   colour: '#dc2626' },
    { label: 'Due today', value: myTasks.filter(t => !t.done && t.dueDate && daysUntil(t.dueDate, today) === 0).length, colour: '#7c3aed' },
    { label: 'Completed', value: myTasks.filter(t => t.done).length,                                                colour: '#15803d' },
  ];

  return (
    <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '820px' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 600, color:'var(--ink)' }}>Tasks</h1>
          <p style={{ margin: '3px 0 0', fontSize: '0.8125rem', color:'var(--mut)' }}>
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
            <div style={{ fontSize: '0.6875rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
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
            <option value="All">All</option>
            {assignees.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8125rem', color:'var(--mut)', cursor: 'pointer', marginLeft: 'auto' }}>
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
          Show completed
        </label>
      </div>

      {/* ── Category tabs ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: '4px', overflowX: 'auto' }}>
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
                color: activeTab === key ? 'var(--accent)' : 'var(--mut)',
                borderBottom: activeTab === key ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: '-1px',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              {label}
              {count > 0 && (
                <span style={{
                  fontSize: '0.625rem', fontWeight: 600,
                  background: activeTab === key ? 'color-mix(in srgb, #1d4ed8 14%, var(--panel))' : 'var(--panel2)',
                  color: activeTab === key ? 'var(--accent)' : 'var(--mut)',
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
          <div style={{ padding: '32px', textAlign: 'center', color:'var(--mut)', fontSize: '0.875rem' }}>
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
              onDelete={deleteTaskHandler}
              isAdmin={isAdmin}
              canDelete={canDelete}
              isMobile={isMobile}
              today={today}
            />
          ))
        )}
      </div>

      {/* ── New Task modal ───────────────────────────────────────────────── */}
      {showNew && (
        <NewTaskModal onClose={() => setShowNew(false)} onSave={addTask} assignees={assignees} />
      )}
    </div>
  );
}
