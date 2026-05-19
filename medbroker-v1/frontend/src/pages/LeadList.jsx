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
import { s, STATUS_META } from '../styles/tokens.js';

const STATUS_CHIPS    = ['All', ...Object.keys(STATUS_META)];
const EXCLUDED_STATUSES = ['AppointmentBooked'];

const OCCUPATIONS = [
  'Anaesthesiologist', 'Cardiologist', 'Dermatologist', 'General Practitioner',
  'Gynaecologist', 'Neurologist', 'Orthopaedic Surgeon', 'Paediatrician',
  'Psychiatrist', 'Radiologist',
];

const AGENTS = [
  'Thabo Molefe', 'Naledi van Wyk', 'Kabelo Petersen', 'Bongani Ntuli', 'Siphiwe Mahlangu',
];

// ─── Preview mock data ────────────────────────────────────────────────────────
const MOCK_LEADS = {
  total: 10,
  leads: [
    { id:'1',  firstName:'Priya',  lastName:'Naidoo',     email:'p.naidoo@netcare.co.za',   occupation:'Anaesthesiologist',   sourceLabel:'Wits Career Fair 2026',   pipelineStatus:'InProgress',    agentName:'Thabo Molefe',    createdAt: new Date(Date.now()-86400000*2).toISOString()  },
    { id:'2',  firstName:'Sipho',  lastName:'Dlamini',    email:'s.dlamini@wits.ac.za',     occupation:'General Practitioner',sourceLabel:'Wits Career Fair 2026',   pipelineStatus:'InProgress',    agentName:'Naledi van Wyk',  createdAt: new Date(Date.now()-86400000*4).toISOString()  },
    { id:'3',  firstName:'Amara',  lastName:'Osei',       email:'a.osei@mediclinic.co.za',  occupation:'Cardiologist',        sourceLabel:'MedLeads SA — Monthly',   pipelineStatus:'ClosedWon',     agentName:'Kabelo Petersen', createdAt: new Date(Date.now()-86400000*7).toISOString()  },
    { id:'4',  firstName:'Lerato', lastName:'Mokoena',    email:'l.mokoena@life.co.za',     occupation:'Orthopaedic Surgeon', sourceLabel:'Manual — Referral',       pipelineStatus:'Assigned',      agentName:'Bongani Ntuli',   createdAt: new Date(Date.now()-86400000*7).toISOString()  },
    { id:'5',  firstName:'James',  lastName:'van Rooyen', email:'j.vanrooyen@uhw.co.za',    occupation:'Radiologist',         sourceLabel:'Healthwise Doctor DB',    pipelineStatus:'Uncontactable', agentName:'Siphiwe Mahlangu',createdAt: new Date(Date.now()-86400000*14).toISOString() },
    { id:'6',  firstName:'Fatima', lastName:'Essop',      email:'f.essop@groote.co.za',     occupation:'Paediatrician',       sourceLabel:'SA Medical Register Q2',  pipelineStatus:'Unassigned',    agentName:'—',               createdAt: new Date(Date.now()-86400000*21).toISOString() },
    { id:'7',  firstName:'Ayesha', lastName:'Moosa',      email:'a.moosa@sunward.co.za',    occupation:'Psychiatrist',        sourceLabel:'Manual — Referral',       pipelineStatus:'Progressed',    agentName:'Thabo Molefe',    createdAt: new Date(Date.now()-86400000*21).toISOString() },
    { id:'8',  firstName:'Ruan',   lastName:'de Beer',    email:'r.debeer@medi.co.za',      occupation:'Dermatologist',       sourceLabel:'MedLeads SA — Monthly',   pipelineStatus:'InProgress',    agentName:'Naledi van Wyk',  createdAt: new Date(Date.now()-86400000*28).toISOString() },
    { id:'9',  firstName:'Zanele', lastName:'Dube',       email:'z.dube@charlotte.co.za',   occupation:'Gynaecologist',       sourceLabel:'Wits Career Fair 2026',   pipelineStatus:'ClosedLost',    agentName:'Kabelo Petersen', createdAt: new Date(Date.now()-86400000*30).toISOString() },
    { id:'10', firstName:'Marco',  lastName:'Ferreira',   email:'m.ferreira@netcare.co.za', occupation:'Neurologist',         sourceLabel:'MedLeads SA — Monthly',   pipelineStatus:'Assigned',      agentName:'Bongani Ntuli',   createdAt: new Date(Date.now()-86400000*30).toISOString() },
  ],
};

// ─── Reassign Lead Modal ──────────────────────────────────────────────────────
function ReassignLeadModal({ lead, onClose }) {
  const currentAgent = lead.agentName && lead.agentName !== '—' ? lead.agentName : '';
  const [agent, setAgent] = useState(currentAgent);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(onClose, 900);
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...s.modal, width: '380px' }}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>Reassign Lead</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '16px' }}>
          {lead.firstName} {lead.lastName}
          {currentAgent ? <> · Currently assigned to <strong>{currentAgent}</strong></> : ' · Currently unassigned'}
        </p>
        {saved && (
          <div style={{ ...s.noticeSuccess, marginBottom: '12px' }}>✓ Lead reassigned successfully.</div>
        )}
        <div style={s.formGroup}>
          <label style={s.formLabel}>Assign to agent</label>
          <select style={s.formInput} value={agent} onChange={e => setAgent(e.target.value)}>
            <option value="">— Unassigned —</option>
            {AGENTS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div style={s.modalFooter}>
          <button style={s.ghostBtn} onClick={onClose}>Cancel</button>
          <button style={s.primaryBtn} onClick={handleSave} disabled={saved}>
            {saved ? 'Saved ✓' : 'Save Changes'}
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
  const { flag } = useFlags();

  const isAdmin      = role === 'Admin' || role === 'GlobalAdmin';
  const isSupervisor = role === 'Supervisor';
  const isAgent      = role === 'Agent';
  const canReassign  = isAdmin || isSupervisor;

  const showImport        = (flag('leads.importCsv.enabled') || flag('leads.importSubscription.enabled')) && (isAdmin || isSupervisor);
  const showOccupationFilter = flag('leads.occupationFilter.enabled');

  const [activeStatus,   setActiveStatus]   = useState('All');
  const [search,         setSearch]         = useState('');
  const [agentFilter,    setAgentFilter]    = useState('');
  const [occFilter,      setOccFilter]      = useState('');
  const [page,           setPage]           = useState(1);
  const [reassignTarget, setReassignTarget] = useState(null);
  const pageSize = 25;

  useEffect(() => { setPage(1); }, [activeStatus, search, agentFilter, occFilter]);

  const apiParams = {
    ...(activeStatus !== 'All' ? { status: activeStatus } : {}),
    excludeStatuses: EXCLUDED_STATUSES.join(','),
    ...(search       ? { search }                         : {}),
    ...(isAgent      ? { agentId: persona.id }            : {}),
    ...(isSupervisor ? { supervisorId: persona.id }       : {}),
    ...(isAdmin && agentFilter ? { agentId: agentFilter } : {}),
    ...(occFilter    ? { occupation: occFilter }          : {}),
    page, pageSize,
  };

  const { data: apiData, loading, error, refetch } = useFetch(
    () => leadsApi.list(apiParams),
    [activeStatus, search, agentFilter, occFilter, page]
  );

  // Preview fallback — filter mock data client-side
  const data = apiData ?? (() => {
    let leads = MOCK_LEADS.leads.filter(l => {
      if (EXCLUDED_STATUSES.includes(l.pipelineStatus)) return false;
      if (isAgent && l.agentName !== 'Thabo Molefe') return false;
      if (activeStatus !== 'All' && l.pipelineStatus !== activeStatus) return false;
      if (occFilter && l.occupation !== occFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = (l.firstName + ' ' + l.lastName).toLowerCase();
        if (!name.includes(q) && !l.email.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    return { total: leads.length, leads };
  })();

  const { data: agentsData } = useFetch(
    () => isAdmin ? usersApi.list() : Promise.resolve(null),
    [isAdmin]
  );
  const agents = agentsData
    ? (agentsData.users ?? agentsData).filter(u => u.role === 'Agent')
    : [];

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;
  const hasFilter  = activeStatus !== 'All' || search || agentFilter || occFilter;

  const subtitle = isAgent      ? 'Showing leads assigned to you'
                 : isSupervisor ? 'Leads for your direct reports'
                 :                'All unassigned and in-progress leads';

  return (
    <div style={s.page}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 600, color: '#111827' }}>Leads</h1>
          <p style={{ margin: '3px 0 0', fontSize: '0.813rem', color: '#6b7280' }}>{subtitle}</p>
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
        {showOccupationFilter && (
          <select value={occFilter} onChange={e => setOccFilter(e.target.value)} style={s.select}>
            <option value="">All occupations</option>
            {OCCUPATIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        {isAdmin && (
          <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)} style={s.select}>
            <option value="">All agents</option>
            {agents.length > 0
              ? agents.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)
              : AGENTS.map(a => <option key={a} value={a}>{a}</option>)
            }
          </select>
        )}
        {hasFilter && (
          <button onClick={() => { setActiveStatus('All'); setSearch(''); setAgentFilter(''); setOccFilter(''); }} style={s.ghostBtn}>
            ✕ Clear filters
          </button>
        )}
      </div>

      {loading && <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Loading leads…</p>}
      {error && <div style={s.errorBox}>Could not load leads: {error.message}</div>}

      {!loading && !error && data && (
        <>
          <div style={{ marginBottom: '8px', fontSize: '0.813rem', color: '#6b7280' }}>
            {data.total} lead{data.total !== 1 ? 's' : ''}
            {activeStatus !== 'All' ? ` · ${STATUS_META[activeStatus]?.label ?? activeStatus}` : ''}
            {occFilter   ? ` · ${occFilter}`      : ''}
            {agentFilter ? ` · filtered by agent` : ''}
            {search      ? ` · "${search}"`       : ''}
          </div>

          <div style={s.tableCard}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Name</th>
                  <th style={s.th}>Occupation</th>
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
                    <td colSpan={isAgent ? 6 : 7} style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                      No leads match your current filters.
                    </td>
                  </tr>
                )}
                {data.leads.map(lead => {
                  const sm = STATUS_META[lead.pipelineStatus] ?? STATUS_META.Unassigned;
                  return (
                    <tr key={lead.id} style={s.tr}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                      <td style={s.td}>
                        <div style={{ fontWeight: 500 }}>{lead.firstName} {lead.lastName}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '1px' }}>{lead.email}</div>
                      </td>
                      <td style={{ ...s.td, fontSize: '0.8125rem' }}>{lead.occupation ?? '—'}</td>
                      <td style={{ ...s.td, fontSize: '0.75rem', color: '#6b7280' }}>{lead.sourceLabel ?? '—'}</td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, background: sm.bg, color: sm.colour, border: `1px solid ${sm.border}` }}>
                          {sm.label}
                        </span>
                      </td>
                      {!isAgent && (
                        <td style={{ ...s.td, color: '#6b7280', fontSize: '0.813rem' }}>
                          {lead.agentName ?? '—'}
                        </td>
                      )}
                      <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.75rem' }}>
                        {lead.createdAt ? formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true }) : '—'}
                      </td>
                      <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                        <button onClick={() => navigate(`/leads/${lead.id}`)} style={s.linkBtn}>
                          View →
                        </button>
                        {canReassign && (
                          <button
                            onClick={() => setReassignTarget(lead)}
                            style={{ ...s.linkBtn, color: '#6b7280', marginLeft: '4px' }}
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
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} style={s.secondaryBtn}>Next</button>
            </div>
          )}
        </>
      )}

      {/* Reassign modal */}
      {reassignTarget && (
        <ReassignLeadModal
          lead={reassignTarget}
          onClose={() => setReassignTarget(null)}
        />
      )}
    </div>
  );
}
