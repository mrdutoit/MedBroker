/**
 * pages/Tasks.jsx
 *
 * Task management — production feature, gated by tasks.enabled (Core, default false).
 *
 * TASK GENERATION MODEL — REDESIGNED §138, 12 Aug 2026 (was 5 rules, §56,
 * 28 Jul 2026). Down to 2 — see taskService.createTask()'s call sites in
 * leadService.logCallAttempt() and appointmentService.createAppointment():
 *   CallbackRequested outcome  → "Call back [lead name]"
 *   Appointment unassigned     → "Assign broker — [lead name]"
 * Reschedule and Outcome (meeting-status-driven) both dropped to zero
 * events entirely — the appointment's own state already carries that
 * information without a duplicate Task, and rescheduling captures its own
 * outcome atomically at the moment it happens. "Confirm appointment with
 * [broker]" also dropped — it never had a real closing action; broker-
 * chosen-at-booking now fires an AppointmentAssigned Notification instead.
 *
 * COMPLETION MODEL — also §138: Callback and Assign-broker tasks (the two
 * remaining system-generated types) are NOT completable from this list —
 * they only complete as a side effect of acting on the real entity (Log
 * Call on the Lead; assigning a broker on the Appointment). This list
 * shows a link through to that entity instead of a checkbox for those two.
 * Manual tasks keep direct completion exactly as before.
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

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useNavigate }   from 'react-router';
import { useRole }       from '../context/RoleContext.jsx';
import { useAuth }       from '../context/AuthContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { useFetch }      from '../hooks/useFetch.js';
import { s }             from '../styles/tokens.js';
import { tasksApi, usersApi } from '../services/api.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'all',          label: 'All tasks'    },
  { key: 'callback',     label: 'Callbacks'    },
  { key: 'appointment',  label: 'Appointments' },
  { key: 'manual',       label: 'Manual'       },
];

const PRIORITIES = ['High', 'Medium', 'Low'];

const CATEGORY_META = {
  callback:     { label: 'Callback',     colour: '#d97706', bg: 'color-mix(in srgb, #d97706 14%, var(--panel))' },
  appointment:  { label: 'Appointment',  colour: 'var(--accent)', bg: 'color-mix(in srgb, #1d4ed8 14%, var(--panel))' },
  manual:       { label: 'Manual',       colour: 'var(--ink)', bg: 'var(--panel2)' },
};

const PRIORITY_META = {
  High:   { colour: '#dc2626', bg: 'color-mix(in srgb, #dc2626 14%, var(--panel))' },
  Medium: { colour: '#d97706', bg: 'color-mix(in srgb, #d97706 14%, var(--panel))' },
  Low:    { colour: 'var(--mut)', bg: 'var(--panel2)' },
};

function daysUntil(dateStr, today) {
  if (!dateStr) return null;
  // Parse Y/M/D directly rather than new Date(dateStr), which interprets
  // a date-only string as UTC midnight — for anyone east of UTC, that
  // instant has already passed by a couple of hours into the actual due
  // date, silently making "due today" look overdue depending on the time
  // of day this runs. Constructing both dates via the LOCAL Date
  // constructor and comparing calendar dates directly (not raw
  // millisecond gaps against the current moment, hours-of-day included)
  // avoids the whole class of error.
  const [y, m, d] = dateStr.split('-').map(Number);
  const dueDateLocal = new Date(y, m - 1, d);
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((dueDateLocal - todayLocal) / 86400000);
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
function TaskRow({ task, onToggle, onDelete, onReassign, isAdmin, canDelete, assignees, isMobile, today }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const due  = dueMeta(task.dueDate, task.done, today);
  const cat  = CATEGORY_META[task.category] ?? CATEGORY_META.manual;
  const pri  = PRIORITY_META[task.priority] ?? PRIORITY_META.Low;

  // Reassign (§104) — inline edit on the existing "Assigned to" field
  // rather than a modal, matching the economy of the Delete control
  // just below it. Any task can be reassigned (system-generated or
  // manual) — unlike Delete, the backend puts no source restriction on
  // this (taskHandlers.js's EDIT_FIELDS gate is role-only), so this
  // isn't scoped down to task.source === 'manual' the way Delete is.
  const [reassigning, setReassigning] = useState(false);
  const [pendingAssignee, setPendingAssignee] = useState(task.assignedToId);
  const [reassignSaving, setReassignSaving] = useState(false);

  async function handleSaveReassign() {
    if (!pendingAssignee || pendingAssignee === task.assignedToId) { setReassigning(false); return; }
    setReassignSaving(true);
    try {
      await onReassign(task.id, pendingAssignee);
      setReassigning(false);
    } catch (err) {
      console.error('Could not reassign task:', err);
    }
    setReassignSaving(false);
  }

  // Comment thread (§71) — lazy-loaded only once a task is actually
  // expanded, not fetched for every row in the list up front.
  const [comments, setComments] = useState([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  useEffect(() => {
    if (!expanded || commentsLoaded) return;
    tasksApi.listComments(task.id)
      .then(({ comments }) => { setComments(comments); setCommentsLoaded(true); })
      .catch(err => console.error('Could not load comments:', err));
  }, [expanded, commentsLoaded, task.id]);

  async function handlePostComment() {
    const body = newComment.trim();
    if (!body) return;
    setPostingComment(true);
    try {
      const created = await tasksApi.addComment(task.id, body);
      setComments(prev => [...prev, created]);
      setNewComment('');
    } catch (err) {
      console.error('Could not post comment:', err);
    }
    setPostingComment(false);
  }

  // §138, 12 Aug 2026 — Callback and Assign-broker tasks only complete as
  // a side effect of acting on their real entity (Log Call on the Lead;
  // assigning a broker on the Appointment) — ticking them off here isn't
  // possible any more, by design. Keyed off category being specifically
  // 'callback' or 'appointment' (the only two with an automated closing
  // path) AND actually having a linked entity — NOT "any non-manual task
  // with a linked entity". That broader check was a real bug caught while
  // reasoning through old data (12 Aug 2026): a Reschedule- or Outcome-
  // type task created before this deploy still has entityType/entityId
  // set (that was always true for those types) but, now that both
  // creation rules are gone, has NO mechanism left to ever complete it —
  // no checkbox (removed), no auto-completion (never built for those two
  // types, unlike Callback/Assign-broker). The broader check would have
  // made any such task permanently stuck if it was still open. This
  // narrower one leaves an old open Reschedule/Outcome task exactly as
  // completable as it always was (checkbox), which is the only way it
  // can still be resolved. A manually created task can still be given
  // category 'callback' or 'appointment' in the New Task modal, but
  // always has entityType/entityId = NULL (no entity-linking UI there),
  // so it correctly falls through to the checkbox below regardless of
  // which category was picked.
  const linkTarget = task.linkedLeadId
    ? `/leads/${task.linkedLeadId}`
    : task.linkedAppointment
      ? `/appointments/${task.linkedAppointment}`
      : null;
  const isRedirectOnly = linkTarget !== null && (task.category === 'callback' || task.category === 'appointment');

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
        {isRedirectOnly ? (
          <div
            onClick={e => { e.stopPropagation(); navigate(linkTarget); }}
            title={task.done ? 'Completed — view record' : 'Go to record to action this'}
            style={{
              width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0, marginTop: '2px',
              border: task.done ? 'none' : '2px solid var(--line)',
              background: task.done ? 'var(--accent)' : 'var(--panel)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {task.done ? (
              <svg viewBox="0 0 12 10" fill="none" stroke="white" strokeWidth="2" width="10" height="8">
                <path d="M1 5l3.5 3.5L11 1"/>
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" fill="none" stroke="var(--mut)" strokeWidth="1.6" width="11" height="11">
                <path d="M6 3.5H3.5A1.5 1.5 0 0 0 2 5v8a1.5 1.5 0 0 0 1.5 1.5h8A1.5 1.5 0 0 0 13 13v-2.5M9.5 2H14v4.5M14 2 7 9"/>
              </svg>
            )}
          </div>
        ) : (
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
        )}

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
              <span style={{ fontSize: '0.6875rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Due date</span>
              <div style={{ fontSize: '0.8125rem', color:'var(--ink)', marginTop: '2px' }}>
                {task.dueDate || 'No due date'}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.6875rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned to</span>
              {reassigning ? (
                <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                  <select
                    value={pendingAssignee}
                    onChange={e => setPendingAssignee(e.target.value)}
                    style={{ ...s.formInput, padding: '4px 8px', fontSize: '0.8125rem', width: 'auto' }}
                    autoFocus
                  >
                    {assignees.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                  <button
                    onClick={handleSaveReassign}
                    disabled={reassignSaving}
                    style={{ ...s.linkBtn, padding: '3px 6px', opacity: reassignSaving ? 0.5 : 1 }}
                  >
                    {reassignSaving ? '…' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setPendingAssignee(task.assignedToId); setReassigning(false); }}
                    style={{ ...s.linkBtn, padding: '3px 6px', color: 'var(--mut)' }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                  <span style={{ fontSize: '0.8125rem', color:'var(--ink)', fontWeight: 500 }}>{task.assignedTo}</span>
                  {isAdmin && (
                    <button
                      onClick={e => { e.stopPropagation(); setReassigning(true); }}
                      style={{ ...s.linkBtn, padding: '2px 5px', fontSize: '0.75rem' }}
                    >
                      Reassign
                    </button>
                  )}
                </div>
              )}
            </div>
            <div>
              <span style={{ fontSize: '0.6875rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source</span>
              <div style={{ fontSize: '0.8125rem', color:'var(--ink)', marginTop: '2px' }}>
                {task.source === 'system' ? 'Auto-generated' : 'Manual'}
              </div>
            </div>
            {task.createdBy && (
              <div>
                <span style={{ fontSize: '0.6875rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Created by</span>
                <div style={{ fontSize: '0.8125rem', color:'var(--ink)', marginTop: '2px' }}>{task.createdBy}</div>
              </div>
            )}
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

          {/* Comment thread (§71) */}
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--line)' }} onClick={e => e.stopPropagation()}>
            <span style={{ fontSize: '0.6875rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Comments {comments.length > 0 ? `(${comments.length})` : ''}
            </span>
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {comments.length === 0 && (
                <p style={{ fontSize: '0.8125rem', color:'var(--mut)', margin: 0 }}>No comments yet.</p>
              )}
              {comments.map(c => (
                <div key={c.id} style={{ background: 'var(--panel2)', borderRadius: '6px', padding: '8px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color:'var(--ink)' }}>{c.author}</span>
                    <span style={{ fontSize: '0.6875rem', color:'var(--mut)' }}>
                      {(() => { try { return format(new Date(c.createdAt), 'd MMM yyyy, HH:mm'); } catch { return ''; } })()}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color:'var(--ink)', margin: 0, whiteSpace: 'pre-wrap' }}>{c.body}</p>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <input
                type="text"
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !postingComment) handlePostComment(); }}
                placeholder="Add a comment…"
                style={{ ...s.formInput, flex: 1, fontSize: '0.8125rem', padding: '6px 10px' }}
              />
              <button
                onClick={handlePostComment}
                disabled={!newComment.trim() || postingComment}
                style={{ ...s.secondaryBtn, fontSize: '0.8125rem', padding: '6px 14px', opacity: (!newComment.trim() || postingComment) ? 0.5 : 1 }}
              >
                {postingComment ? '…' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────
export default function Tasks() {
  const { role, persona } = useRole();
  const { isMobile }  = useWindowSize();

  const isAdmin  = ['GlobalAdmin', 'Admin', 'Supervisor'].includes(role);
  const isBroker = role === 'Broker';
  // Narrower than isAdmin — matches the API's own DELETE gate (Admin/
  // GlobalAdmin only, not Supervisor; see taskHandlers.js).
  const canDelete = ['GlobalAdmin', 'Admin'].includes(role);

  // Role-scoping already happened server-side (taskHandlers.js) — Agent/
  // Broker only ever receive their own tasks, Supervisor receives self +
  // direct reports, Admin/GlobalAdmin receive everything — so there is
  // no further "is this mine" filtering to do here.
  const { data: taskData, refetch: refetchTasks } = useFetch(() => tasksApi.list(), []);
  const tasks = taskData?.tasks ?? [];

  // Real users for the Admin/Supervisor "Assignee" filter and NewTaskModal's
  // "Assign to" field — fetched only for Admin/Supervisor, to avoid the
  // extra round trip for Agent/Broker, who never see either control.
  const { data: userData } = useFetch(() => isAdmin ? usersApi.list() : Promise.resolve(null), [isAdmin]);
  const assignees = (userData?.users ?? []).map(u => ({ value: u.id, label: u.displayName }));

  // §108 — team-scoped assignee list, now used everywhere a Supervisor
  // picks or filters by assignee: NewTaskModal's "Assign to", the
  // Assignee filter, and TaskRow's Reassign control. §105 only scoped
  // Reassign; Mark asked for the other two to match. A Supervisor sees
  // themselves + direct reports only; Admin/GlobalAdmin still see the
  // full org (assignees, unchanged). Renamed from reassignTargets now
  // that it's no longer reassignment-specific.
  const teamScopedAssignees = (role === 'Supervisor')
    ? (userData?.users ?? [])
        .filter(u => u.id === persona.id || u.supervisorId === persona.id)
        .map(u => ({ value: u.id, label: u.displayName }))
    : assignees;

  const [activeTab,    setActiveTab]    = useState('all');
  const [filterAssign, setFilterAssign] = useState('All');
  const [showDone,     setShowDone]     = useState(false);
  // §69 — Mark asked whether Tasks should show things created, not just
  // assigned — demo mode's server-side scoping already ensures a
  // Supervisor never LOSES visibility of a task they created (viewerId
  // in the handler), so this checkbox is purely a convenience NARROW,
  // not a visibility fix — it lets someone filter down to just their
  // own creations on top of whatever's already visible to them.
  const [createdByMeOnly, setCreatedByMeOnly] = useState(false);
  const [showNew,      setShowNew]      = useState(false);
  const [search,       setSearch]       = useState('');

  const today = new Date();

  async function toggleDone(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    try {
      await tasksApi.update(id, { isComplete: !task.done });
      refetchTasks();
    } catch (err) {
      console.error('Could not update task:', err);
    }
  }

  // §58 — manually created tasks only, both here and enforced server-side
  // in taskHandlers.js. window.confirm() matches the existing precedent
  // set in EventDetail.jsx for this class of lower-stakes destructive
  // action, rather than introducing a new confirm-modal pattern for a
  // to-do item.
  async function deleteTaskHandler(id) {
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    try {
      await tasksApi.remove(id);
      refetchTasks();
    } catch (err) {
      console.error('Could not delete task:', err);
    }
  }

  // §104 — Mark found the backend already supported this (EDIT_FIELDS
  // includes assignedToId, gated to Admin/Supervisor) but no control
  // ever called it — tasksApi.update() was only ever invoked for the
  // isComplete toggle. Re-throws on failure so TaskRow's own handler can
  // decide what to do (keep the inline editor open) rather than this
  // function silently deciding that for every caller.
  async function reassignTask(id, assignedToId) {
    await tasksApi.update(id, { assignedToId });
    refetchTasks();
  }

  async function addTask(form) {
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
  }

  function matchesAssigneeFilter(t) {
    if (filterAssign === 'All') return true;
    return t.assignedToId === filterAssign;
  }

  const filtered = tasks.filter(t => {
    if (!showDone && t.done) return false;
    if (createdByMeOnly && t.createdById !== persona.id) return false;
    if (activeTab !== 'all' && t.category !== activeTab) return false;
    if (!matchesAssigneeFilter(t)) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
        !(t.linkedLead ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Metrics — always from the full task list, not the filtered view.
  // Server-side scoping (see the fetch above) already ensures `tasks` is
  // exactly the right scope for this person.
  const myTasks  = tasks;
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
            {teamScopedAssignees.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        )}
        {isAdmin && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8125rem', color:'var(--mut)', cursor: 'pointer' }}>
            <input type="checkbox" checked={createdByMeOnly} onChange={e => setCreatedByMeOnly(e.target.checked)} />
            Created by me
          </label>
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
            ? tasks.filter(t => !t.done).length
            : tasks.filter(t => t.category === key && !t.done).length;
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
              onReassign={reassignTask}
              isAdmin={isAdmin}
              canDelete={canDelete}
              assignees={teamScopedAssignees}
              isMobile={isMobile}
              today={today}
            />
          ))
        )}
      </div>

      {/* ── New Task modal ───────────────────────────────────────────────── */}
      {showNew && (
        <NewTaskModal onClose={() => setShowNew(false)} onSave={addTask} assignees={teamScopedAssignees} />
      )}
    </div>
  );
}
