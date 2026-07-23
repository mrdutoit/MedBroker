/**
 * pages/LeadList.jsx
 *
 * Role behaviour:
 *   GlobalAdmin/Admin — all leads, agent filter, Reassign action per row
 *   Supervisor        — direct reports only, Reassign action per row
 *   Agent             — own leads only, no reassign, no import
 *   Broker            — never sees this page (redirected to /appointments)
 *
 * Feature flags consumed:
 *   leads.importCsv.enabled
 *   leads.importSubscription.enabled
 *   leads.occupationFilter.enabled
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch.js';
import { leadsApi, usersApi } from '../services/api.js';
import { formatDistanceToNow } from 'date-fns';
import { useRole } from '../context/RoleContext.jsx';
import { useFlags } from '../context/FlagContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { s, STATUS_META } from '../styles/tokens.js';
import { JOB_TITLES } from '../constants/leadOptions.js';
const STATUS_CHIPS      = ['All', ...Object.keys(STATUS_META)];
// Leads with AppointmentScheduled are shown in Appointments, not here
const EXCLUDED_STATUSES = ['AppointmentScheduled'];

// ─── Assign / Reassign Lead Modal ─────────────────────────────────────────────
// isAssign=true  → "Assign Lead"   — calls leadsApi.assign()   (Unassigned → Assigned)
// isAssign=false → "Reassign Lead" — calls leadsApi.reassign() (keeps existing status)
// These hit distinct backend endpoints with different server-side behaviour
// and audit log entries.
function ReassignLeadModal({ lead, agents, onClose, onSaved, isAssign = false }) {
  const currentAgent = lead.assignedAgentId ?? '';
  const [agent, setAgent] = useState(currentAgent);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  async function handleSave() {
    if (!agent) return;
    setSaving(true);
    setError('');
    try {
      if (isAssign) {
        await leadsApi.assign(lead.id, agent);
      } else {
        await leadsApi.reassign(lead.id, agent);
      }
      setSaved(true);
      await onSaved?.();
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err.message ?? 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...s.modal, width: '380px' }}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>{isAssign ? 'Assign Lead' : 'Reassign Lead'}</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: '0.8125rem', color:'var(--mut)', marginBottom: '16px' }}>
          {lead.firstName} {lead.lastName}
          {isAssign
            ? ' · This lead is currently unassigned'
            : lead.agentName && lead.agentName !== '—'
              ? <> · Currently assigned to <strong>{lead.agentName}</strong></>
              : ' · Currently unassigned'
          }
        </p>
        {saved && (
          <div style={{ ...s.noticeSuccess, marginBottom: '12px' }}>
            ✓ Lead {isAssign ? 'assigned' : 'reassigned'} successfully.
          </div>
        )}
        {error && <div style={{ ...s.errorBox, marginBottom: '12px' }}>{error}</div>}
        <div style={s.formGroup}>
          <label style={s.formLabel}>Assign to agent *</label>
          <select style={s.formInput} value={agent} onChange={e => setAgent(e.target.value)}>
            <option value="">— Select agent —</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}
          </select>
        </div>
        <div style={s.modalFooter}>
          <button style={s.ghostBtn} onClick={onClose}>Cancel</button>
          <button
            style={{ ...s.primaryBtn, opacity: (!agent || saving) ? 0.5 : 1 }}
            onClick={handleSave}
            disabled={saved || saving || !agent}
          >
            {saving ? 'Saving…' : saved ? 'Saved ✓' : isAssign ? 'Assign' : 'Reassign'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LeadList() {
  const navigate = useNavigate();
  const { role, persona } = useRole();
  const { isMobile } = useWindowSize();
  const { flag } = useFlags();

  const isAdmin      = role === 'Admin' || role === 'GlobalAdmin';
  const isSupervisor = role === 'Supervisor';
  const isAgent      = role === 'Agent';
  const canReassign  = isAdmin || isSupervisor;

  const showImport           = (flag('leads.importCsv.enabled') || flag('leads.importSubscription.enabled')) && (isAdmin || isSupervisor);
  const showOccupationFilter = flag('leads.occupationFilter.enabled');

  const [activeStatus,   setActiveStatus]   = useState('All');
  const [search,         setSearch]         = useState('');
  const [agentFilter,    setAgentFilter]    = useState('');
  const [occFilter,      setOccFilter]      = useState('');
  const [sourceFilter,   setSourceFilter]   = useState('');
  const [page,           setPage]           = useState(1);
  const [reassignTarget, setReassignTarget] = useState(null);
  const [isAssignMode,   setIsAssignMode]   = useState(false);
  const pageSize = 25;

  useEffect(() => { setPage(1); }, [activeStatus, search, agentFilter, occFilter, sourceFilter]);

  const apiParams = {
    ...(activeStatus !== 'All' ? { status: activeStatus } : {}),
    excludeStatuses: EXCLUDED_STATUSES.join(','),
    ...(search       ? { search }                         : {}),
    ...(isAgent      ? { agentId: persona.id }            : {}),
    ...(isSupervisor ? { supervisorId: persona.id }       : {}),
    ...(isAdmin && agentFilter ? { agentId: agentFilter } : {}),
    ...(occFilter    ? { occupation: occFilter }          : {}),
    ...(sourceFilter ? { source: sourceFilter }           : {}),
    page, pageSize,
  };

  const { data: apiData, loading, error, refetch } = useFetch(
    () => leadsApi.list(apiParams),
    [activeStatus, search, agentFilter, occFilter, page]
  );

  // apiData is null only briefly, while the fetch is in flight — the
  // loading check below (line ~326) keeps that window from rendering
  // anything at all, so this default only matters for the brief instant
  // before that check applies.
  const data = apiData ?? { total: 0, leads: [] };

  // Source filter — fetches from API.
  const { data: sourcesData } = useFetch(
    () => leadsApi.sources(),
    []
  );
  const sourceOptions = sourcesData?.sources ?? [];

  const { data: agentsData } = useFetch(
    () => (isAdmin || isSupervisor) ? usersApi.list() : Promise.resolve(null),
    [isAdmin, isSupervisor]
  );
  const agents = agentsData
    ? (agentsData.users ?? agentsData).filter(u => u.role === 'Agent')
    : [];

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;
  const hasFilter  = activeStatus !== 'All' || search || agentFilter || occFilter || sourceFilter;

  const subtitle = isAgent      ? 'Showing leads assigned to you'
                 : isSupervisor ? 'Leads for your direct reports'
                 :                'All unassigned and in-progress leads';

  return (
    <div style={{ ...s.page, padding: isMobile ? '12px' : '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 600, color:'var(--ink)' }}>Leads</h1>
          <p style={{ margin: '3px 0 0', fontSize: '0.813rem', color:'var(--mut)' }}>{subtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={refetch} style={s.secondaryBtn}>Refresh</button>
          {showImport && (
            <button onClick={() => navigate('/leads/import')} style={s.primaryBtn}>
              Import Leads
            </button>
          )}
        </div>
      </div>

      {/* Notices */}
      {isAgent && (
        <div style={{ ...s.noticeWarn, marginBottom: '14px' }}>
          You are viewing leads assigned to you only.
        </div>
      )}
      {isSupervisor && (
        <div style={{ ...s.noticeWarn, marginBottom: '14px' }}>
          You are viewing leads for your direct reports only.
        </div>
      )}
      <div style={{ ...s.noticeInfo, marginBottom: '14px', fontSize: '0.8125rem' }}>
        ℹ Leads with a booked appointment are shown in Appointments. Leads are automatically
        returned to the queue after 6 months without closure.
      </div>

      {/* Status chips */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {STATUS_CHIPS.filter(st => !EXCLUDED_STATUSES.includes(st)).map(status => {
          const isActive = activeStatus === status;
          const meta     = STATUS_META[status];
          return (
            <button
              key={status}
              onClick={() => setActiveStatus(status)}
              style={{
                ...s.chip,
                ...(isActive && status === 'All' ? s.chipActive : {}),
                ...(isActive && status !== 'All' ? { background: meta.bg, color: meta.colour, borderColor: meta.border, fontWeight: 500 } : {}),
              }}
            >
              {meta?.label ?? status}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text" placeholder="Search name or email…" value={search}
          onChange={e => setSearch(e.target.value)} style={s.searchInput}
        />
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={s.select}>
          <option value="">All sources</option>
          {sourceOptions.map(src => <option key={src} value={src}>{src}</option>)}
        </select>
        {showOccupationFilter && (
          <select value={occFilter} onChange={e => setOccFilter(e.target.value)} style={s.select}>
            <option value="">All job titles</option>
            {JOB_TITLES.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        {isAdmin && (
          <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)} style={s.select}>
            <option value="">All agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}
          </select>
        )}
        {hasFilter && (
          <button
            onClick={() => { setActiveStatus('All'); setSearch(''); setAgentFilter(''); setOccFilter(''); setSourceFilter(''); }}
            style={s.ghostBtn}
          >
            ✕ Clear filters
          </button>
        )}
      </div>

      {loading && <p style={{ color:'var(--mut)', fontSize: '0.875rem' }}>Loading leads…</p>}
      {error && <div style={s.errorBox}>Could not load leads: {error.message}</div>}

      {!loading && !error && data && (
        <>
          <div style={{ marginBottom: '8px', fontSize: '0.813rem', color:'var(--mut)' }}>
            {data.total} lead{data.total !== 1 ? 's' : ''}
            {activeStatus !== 'All' ? ` · ${STATUS_META[activeStatus]?.label ?? activeStatus}` : ''}
            {occFilter   ? ` · ${occFilter}`      : ''}
            {agentFilter ? ` · filtered by agent` : ''}
            {search      ? ` · "${search}"`       : ''}
          </div>

          <div style={{ ...s.tableCard, overflowX: 'auto' }}>
            <table style={{ ...s.table, minWidth: '700px' }}>
              <thead>
                <tr>
                  <th style={s.th}>Name</th>
                  <th style={s.th}>Job Title</th>
                  <th style={s.th}>Source</th>
                  <th style={s.th}>Status</th>
                  {!isAgent && <th style={s.th}>Agent</th>}
                  <th style={s.th}>Added</th>
                  <th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {data.leads.length === 0 && (
                  <tr>
                    <td colSpan={isAgent ? 6 : 7} style={{ textAlign: 'center', padding: '40px', color:'var(--mut)' }}>
                      No leads match your current filters.
                    </td>
                  </tr>
                )}
                {data.leads.map(lead => {
                  const sm = STATUS_META[lead.pipelineStatus] ?? STATUS_META.Unassigned;
                  return (
                    <tr key={lead.id} style={s.tr}
                      onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 6%, var(--panel))'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={s.td}>
                        <div style={{ fontWeight: 500 }}>{lead.firstName} {lead.lastName}</div>
                        <div style={{ fontSize: '0.75rem', color:'var(--mut)', marginTop: '1px' }}>{lead.email}</div>
                      </td>
                      <td style={{ ...s.td, fontSize: '0.8125rem' }}>{lead.occupation ?? '—'}</td>
                      <td style={{ ...s.td, fontSize: '0.75rem', color:'var(--mut)' }}>{lead.sourceLabel ?? '—'}</td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, background: sm.bg, color: sm.colour, border: `1px solid ${sm.border}` }}>
                          {sm.label}
                        </span>
                      </td>
                      {!isAgent && (
                        <td style={{ ...s.td, color:'var(--mut)', fontSize: '0.813rem' }}>
                          {lead.agentName ?? '—'}
                        </td>
                      )}
                      <td style={{ ...s.td, color:'var(--mut)', fontSize: '0.75rem' }}>
                        {lead.createdAt ? formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true }) : '—'}
                      </td>
                      <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                        <button onClick={() => navigate(`/leads/${lead.id}`)} style={s.linkBtn}>
                          View →
                        </button>
                        {canReassign && lead.pipelineStatus === 'Unassigned' && (
                          <button
                            onClick={() => { setReassignTarget(lead); setIsAssignMode(true); }}
                            style={{
                              background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a',
                              borderRadius: '6px', padding: '3px 10px', cursor: 'pointer',
                              fontSize: '0.75rem', fontWeight: 500, fontFamily: 'inherit', marginLeft: '6px',
                            }}
                          >
                            Assign
                          </button>
                        )}
                        {canReassign && lead.pipelineStatus !== 'Unassigned' && (
                          <button
                            onClick={() => { setReassignTarget(lead); setIsAssignMode(false); }}
                            style={{ ...s.linkBtn, color:'var(--mut)', marginLeft: '4px' }}
                          >
                            Reassign
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '14px', alignItems: 'center' }}>
              <button onClick={() => setPage(p => p - 1)} disabled={page <= 1} style={s.secondaryBtn}>Previous</button>
              <span style={{ fontSize: '0.875rem', color:'var(--mut)' }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} style={s.secondaryBtn}>Next</button>
            </div>
          )}
        </>
      )}

      {/* Reassign modal */}
      {reassignTarget && (
        <ReassignLeadModal
          lead={reassignTarget}
          agents={agents}
          isAssign={isAssignMode}
          onSaved={refetch}
          onClose={() => { setReassignTarget(null); setIsAssignMode(false); }}
        />
      )}
    </div>
  );
}
