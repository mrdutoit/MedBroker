/**
 * pages/AppointmentList.jsx
 *
 * Role behaviour:
 *   GlobalAdmin/Admin — all appointments, broker/source/portfolio filters, Reassign
 *   Supervisor        — direct reports only, Reassign
 *   Agent             — appointments they booked
 *   Broker (assign)   — assigned appointments only, no claim tab
 *   Broker (claim)    — two tabs: My Appointments | Available to Claim
 *
 * Feature flags consumed:
 *   appointments.claimModel     'assign' | 'claim'
 *   appointments.tokens.enabled token balance card in claim mode
 *
 * Book Appointment does NOT exist here — only on Lead Detail.
 *
 * HOW TO TEST THE CLAIM MODEL:
 *   1. Switch to GlobalAdmin in the role switcher
 *   2. Go to Admin → Feature Flags
 *   3. Under Core, change "Appointment workflow" to "claim" and click Save
 *   4. Switch role to Broker
 *   5. Navigate to Appointments — you will see two tabs
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext.jsx';
import { useFlags } from '../context/FlagContext.jsx';
import { appointmentsApi } from '../services/api.js';
import { s, APPT_STATUS_META, MEETING_STATUS_META, PORTFOLIO_META } from '../styles/tokens.js';

// ─── Mock data ────────────────────────────────────────────────────────────────
const ALL_APPOINTMENTS = [
  { id:'A1', leadName:'Dr Priya Naidoo',     leadEmail:'p.naidoo@netcare.co.za',
    occupation:'Anaesthesiologist',   portfolio:'Discovery',
    source:'Wits Career Fair 2026',    status:'Assigned',   brokerCode:'SB',
    brokerName:'Sandra van der Berg',  agentName:'T. Molefe',
    firstDate:'Today · 10:00',    isToday:true,  m1:'Pending',    m2:null,          signed:null  },
  { id:'A2', leadName:'Dr Sipho Dlamini',    leadEmail:'s.dlamini@wits.ac.za',
    occupation:'General Practitioner',portfolio:'Discovery',
    source:'Wits Career Fair 2026',    status:'Unassigned', brokerCode:'',
    brokerName:'—',                    agentName:'N. van Wyk',
    firstDate:'Tomorrow · 14:00', isToday:false, m1:'Pending',    m2:null,          signed:null  },
  { id:'A3', leadName:'Dr Amara Osei',       leadEmail:'a.osei@mediclinic.co.za',
    occupation:'Cardiologist',        portfolio:'M&M',
    source:'MedLeads SA — Monthly',    status:'Assigned',   brokerCode:'SB',
    brokerName:'Sandra van der Berg',  agentName:'K. Petersen',
    firstDate:'14 May 2026',      isToday:false, m1:'Seen',       m2:'Rescheduled', signed:'Yes' },
  { id:'A4', leadName:'Dr Lerato Mokoena',   leadEmail:'l.mokoena@life.co.za',
    occupation:'Orthopaedic Surgeon', portfolio:'Discovery',
    source:'Manual — Referral',        status:'Assigned',   brokerCode:'SB',
    brokerName:'Sandra van der Berg',  agentName:'T. Molefe',
    firstDate:'21 May 2026',      isToday:false, m1:'Pending',    m2:null,          signed:null  },
  { id:'A5', leadName:'Dr James van Rooyen', leadEmail:'j.vanrooyen@uhw.co.za',
    occupation:'Radiologist',         portfolio:'Discovery',
    source:'Healthwise Doctor DB',     status:'Assigned',   brokerCode:'PJ',
    brokerName:'Pieter Joubert',       agentName:'B. Ntuli',
    firstDate:'22 May 2026',      isToday:false, m1:'Pending',    m2:null,          signed:null  },
  { id:'A6', leadName:'Dr Ayesha Moosa',     leadEmail:'a.moosa@sunward.co.za',
    occupation:'Psychiatrist',        portfolio:'M&M',
    source:'Manual — Referral',        status:'Unassigned', brokerCode:'',
    brokerName:'—',                    agentName:'T. Molefe',
    firstDate:'23 May 2026',      isToday:false, m1:'Pending',    m2:null,          signed:null  },
  { id:'A7', leadName:'Dr Marco Ferreira',   leadEmail:'m.ferreira@netcare.co.za',
    occupation:'Neurologist',         portfolio:'M&M',
    source:'MedLeads SA — Monthly',    status:'Assigned',   brokerCode:'RB',
    brokerName:'Riaan Botha',          agentName:'N. van Wyk',
    firstDate:'24 May 2026',      isToday:false, m1:'Cancelled',  m2:null,          signed:'No'  },
  { id:'A8', leadName:'Dr Zanele Dube',      leadEmail:'z.dube@charlotte.co.za',
    occupation:'Gynaecologist',       portfolio:'Discovery',
    source:'Wits Career Fair 2026',    status:'Unassigned', brokerCode:'',
    brokerName:'—',                    agentName:'K. Petersen',
    firstDate:'25 May 2026',      isToday:false, m1:'Pending',    m2:null,          signed:null  },
];

// Appointments available for brokers to claim (unassigned, matched to broker region/portfolio)
const AVAILABLE_TO_CLAIM = [
  { id:'C1', leadName:'Dr Sipho Dlamini',    occupation:'General Practitioner', portfolio:'Discovery', date:'Tomorrow · 14:00', region:'Gauteng',  source:'Wits Career Fair 2026',  token:'Free'    },
  { id:'C2', leadName:'Dr Fatima Essop',     occupation:'Paediatrician',        portfolio:'Discovery', date:'22 May · 09:30',  region:'Gauteng',  source:'SA Medical Register Q2', token:'Free'    },
  { id:'C3', leadName:'Dr Marco Ferreira',   occupation:'Neurologist',          portfolio:'M&M',       date:'23 May · 11:00',  region:'Gauteng',  source:'MedLeads SA — Monthly',  token:'Free'    },
  { id:'C4', leadName:'Dr Zanele Dube',      occupation:'Gynaecologist',        portfolio:'Discovery', date:'25 May · 14:00',  region:'Limpopo',  source:'Wits Career Fair 2026',  token:'1 token' },
  { id:'C5', leadName:'Dr Ruan de Beer',     occupation:'Dermatologist',        portfolio:'Discovery', date:'27 May · 10:00',  region:'Gauteng',  source:'MedLeads SA — Monthly',  token:'1 token' },
];

// Sandra van der Berg's assigned appointments
const MY_APPOINTMENTS = ALL_APPOINTMENTS.filter(a => a.brokerCode === 'SB');

const SOURCES     = [...new Set(ALL_APPOINTMENTS.map(a => a.source))].sort();
const PORTFOLIOS  = ['Discovery', 'M&M'];
const AGENTS      = ['Thabo Molefe','Naledi van Wyk','Kabelo Petersen','Bongani Ntuli','Siphiwe Mahlangu'];
const BROKERS     = ['Sandra van der Berg','Pieter Joubert','Riaan Botha','Marelize Swart'];

// ─── Badge helpers ─────────────────────────────────────────────────────────────
function MeetingBadge({ status }) {
  if (!status) return <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>—</span>;
  const meta = MEETING_STATUS_META[status] ?? { colour: '#6b7280', bg: '#f3f4f6' };
  return <span style={{ ...s.badge, background: meta.bg, color: meta.colour, fontSize: '0.688rem' }}>{status}</span>;
}
function SignedBadge({ signed }) {
  if (!signed) return <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>—</span>;
  return (
    <span style={{ ...s.badge, fontSize: '0.688rem',
      background: signed === 'Yes' ? '#f0fdf4' : '#fef2f2',
      color:      signed === 'Yes' ? '#15803d' : '#dc2626' }}>
      {signed}
    </span>
  );
}
function PortfolioBadge({ portfolio }) {
  const meta = PORTFOLIO_META[portfolio] ?? { colour: '#6b7280', bg: '#f3f4f6' };
  return <span style={{ ...s.badge, background: meta.bg, color: meta.colour, fontSize: '0.688rem' }}>{portfolio}</span>;
}

// ─── Assign / Reassign modal ───────────────────────────────────────────────────
// isAssign=true  → calls appointmentsApi.assignBroker() (Unassigned → Assigned)
// isAssign=false → calls appointmentsApi.reassign()     (keeps existing status)
// In preview mode both return null silently (PREVIEW_MODE in api.js).
function ReassignModal({ appointment, onClose, isAssign = false }) {
  const [broker, setBroker] = useState(appointment.brokerName === '—' ? '' : appointment.brokerName);
  const [agent,  setAgent]  = useState(appointment.agentName ?? '');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  async function handleSave() {
    if (!broker) return;
    setSaving(true);
    setError('');
    try {
      // In preview mode these return null silently — no error thrown
      if (isAssign) {
        await appointmentsApi.assignBroker(appointment.id, broker, agent);
      } else {
        await appointmentsApi.reassign(appointment.id, broker, agent);
      }
      setSaved(true);
      setTimeout(onClose, 900);
      // Sam review item: row status in list updates on next page refresh.
      // In production, refetch() is called after modal close to sync the list.
    } catch (err) {
      setError(err.message ?? 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...s.modal, width: '420px' }}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>{isAssign ? 'Assign Broker' : 'Reassign Appointment'}</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '16px' }}>
          {appointment.leadName} · {appointment.firstDate}
          {isAssign
            ? ' · This appointment has no broker assigned'
            : appointment.brokerName !== '—'
              ? <> · Currently assigned to <strong>{appointment.brokerName}</strong></>
              : ''
          }
        </p>
        {saved && <div style={{ ...s.noticeSuccess, marginBottom: '12px' }}>✓ {isAssign ? 'Broker assigned' : 'Reassigned'} successfully.</div>}
        {error && <div style={{ ...s.errorBox, marginBottom: '12px' }}>{error}</div>}
        <div style={s.formGroup}>
          <label style={s.formLabel}>Broker *</label>
          <select style={s.formInput} value={broker} onChange={e => setBroker(e.target.value)}>
            <option value="">— Select broker —</option>
            {BROKERS.map(b => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div style={s.formGroup}>
          <label style={s.formLabel}>Agent</label>
          <select style={s.formInput} value={agent} onChange={e => setAgent(e.target.value)}>
            <option value="">Select agent…</option>
            {AGENTS.map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div style={s.modalFooter}>
          <button style={s.ghostBtn} onClick={onClose}>Cancel</button>
          <button
            style={{ ...s.primaryBtn, opacity: (!broker || saving) ? 0.5 : 1 }}
            onClick={handleSave}
            disabled={saved || saving || !broker}
          >
            {saving ? 'Saving…' : saved ? 'Saved ✓' : isAssign ? 'Assign Broker' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function AppointmentList() {
  const navigate = useNavigate();
  const { role } = useRole();
  const { flag, flags } = useFlags();

  const isAdmin      = role === 'Admin' || role === 'GlobalAdmin';
  const isSupervisor = role === 'Supervisor';
  const isBroker     = role === 'Broker';
  const canReassign  = isAdmin || isSupervisor;

  // ── Claim model ─────────────────────────────────────────────────────────────
  // Read the raw string from flags — 'assign' or 'claim'.
  // The flag() helper coerces booleans but leaves strings untouched.
  // We read flags[key] directly to avoid any coercion ambiguity for this enum.
  const claimModel    = flags['appointments.claimModel'] ?? 'assign';
  const tokensEnabled = flag('appointments.tokens.enabled');
  // Broker sees the two-tab layout ONLY when flag = 'claim'
  const showClaimTabs = isBroker && claimModel === 'claim';

  // ── State ────────────────────────────────────────────────────────────────────
  const [activeTab,      setActiveTab]      = useState('mine');
  const [statusFilter,   setStatusFilter]   = useState('All');
  const [search,         setSearch]         = useState('');
  const [sourceFilter,   setSourceFilter]   = useState('');
  const [portfolioFilter,setPortfolioFilter]= useState('');
  const [brokerFilter,   setBrokerFilter]   = useState('');
  const [claimedIds,     setClaimedIds]     = useState(new Set());
  const [reassignTarget, setReassignTarget] = useState(null);
  const [isAssignMode,   setIsAssignMode]   = useState(false);

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = ALL_APPOINTMENTS.filter(a => {
    if (isBroker && a.brokerCode !== 'SB') return false;
    if (statusFilter === 'Unassigned' && a.status !== 'Unassigned') return false;
    if (statusFilter === 'Assigned'   && a.status !== 'Assigned')   return false;
    if (statusFilter === 'Today'      && !a.isToday)                return false;
    if (statusFilter === 'Signed'     && a.signed !== 'Yes')        return false;
    if (sourceFilter    && a.source    !== sourceFilter)    return false;
    if (portfolioFilter && a.portfolio !== portfolioFilter) return false;
    if (brokerFilter    && a.brokerCode !== brokerFilter)   return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.leadName.toLowerCase().includes(q) && !a.leadEmail.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const myAppts     = isBroker ? MY_APPOINTMENTS : ALL_APPOINTMENTS;
  const unassigned  = myAppts.filter(a => a.status === 'Unassigned').length;
  const assigned    = myAppts.filter(a => a.status === 'Assigned').length;
  const todayCount  = myAppts.filter(a => a.isToday).length;
  const signedCount = myAppts.filter(a => a.signed === 'Yes').length;
  const availCount  = AVAILABLE_TO_CLAIM.filter(a => !claimedIds.has(a.id)).length;

  const subtitleMap = {
    GlobalAdmin: 'All appointments across all brokers',
    Admin:       'All appointments across all brokers',
    Supervisor:  'Appointments for your direct reports',
    Agent:       'Appointments you have booked',
    Broker:      claimModel === 'claim'
      ? 'My Appointments and Available to Claim'
      : 'Appointments assigned to you',
  };
  const subtitle = subtitleMap[role] ?? '';

  const hasFilter = statusFilter !== 'All' || search || sourceFilter || portfolioFilter || brokerFilter;

  function clearFilters() {
    setStatusFilter('All'); setSearch(''); setSourceFilter('');
    setPortfolioFilter(''); setBrokerFilter('');
  }

  // ── Appointments table (shared between My Appointments and main view) ────────
  function AppointmentsTable({ rows, showBroker = true }) {
    return (
      <div style={s.tableCard}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Lead</th>
              <th style={s.th}>Portfolio</th>
              <th style={s.th}>Source</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>First appt</th>
              <th style={s.th}>1st meeting</th>
              <th style={s.th}>2nd meeting</th>
              <th style={s.th}>Signed?</th>
              {showBroker && !isBroker && <th style={s.th}>Broker</th>}
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                  No appointments match your current filters.
                </td>
              </tr>
            )}
            {rows.map(a => {
              const sm = APPT_STATUS_META[a.status] ?? APPT_STATUS_META.Unassigned;
              return (
                <tr key={a.id} style={s.tr}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {a.isToday && <span style={{ width: '7px', height: '7px', background: '#d97706', borderRadius: '50%', flexShrink: 0 }} />}
                      {a.leadName}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{a.leadEmail}</div>
                  </td>
                  <td style={s.td}><PortfolioBadge portfolio={a.portfolio} /></td>
                  <td style={{ ...s.td, fontSize: '0.75rem', color: '#6b7280', maxWidth: '140px' }}>{a.source}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: sm.bg, color: sm.colour, border: `1px solid ${sm.border}` }}>
                      {a.status}
                    </span>
                  </td>
                  <td style={{ ...s.td, fontSize: '0.8125rem', fontWeight: a.isToday ? 600 : 400, color: a.isToday ? '#d97706' : '#111827' }}>
                    {a.firstDate}
                  </td>
                  <td style={s.td}><MeetingBadge status={a.m1} /></td>
                  <td style={s.td}><MeetingBadge status={a.m2} /></td>
                  <td style={s.td}><SignedBadge signed={a.signed} /></td>
                  {showBroker && !isBroker && (
                    <td style={{ ...s.td, fontSize: '0.8125rem', color: '#6b7280' }}>{a.brokerName}</td>
                  )}
                  <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => navigate(`/appointments/${a.id}`)} style={s.linkBtn}>
                      View →
                    </button>
                    {canReassign && a.status === 'Unassigned' && (
                      <button
                        onClick={() => { setReassignTarget(a); setIsAssignMode(true); }}
                        style={{
                          background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a',
                          borderRadius: '6px', padding: '3px 10px', cursor: 'pointer',
                          fontSize: '0.75rem', fontWeight: 500, fontFamily: 'inherit', marginLeft: '6px',
                        }}
                      >
                        Assign
                      </button>
                    )}
                    {canReassign && a.status !== 'Unassigned' && (
                      <button
                        onClick={() => { setReassignTarget(a); setIsAssignMode(false); }}
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
    );
  }

  // ── Filters bar (used in My Appointments tab and main view) ──────────────────
  function FiltersBar() {
    return (
      <>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {['All','Unassigned','Assigned','Today','Signed'].map(st => (
            <button key={st} onClick={() => setStatusFilter(st)}
              style={{ ...s.chip, ...(statusFilter === st ? s.chipActive : {}) }}>
              {st}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Search lead name or email…"
            value={search} onChange={e => setSearch(e.target.value)} style={s.searchInput} />
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={s.select}>
            <option value="">All sources</option>
            {SOURCES.map(src => <option key={src} value={src}>{src}</option>)}
          </select>
          <select value={portfolioFilter} onChange={e => setPortfolioFilter(e.target.value)} style={s.select}>
            <option value="">All portfolios</option>
            {PORTFOLIOS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {(isAdmin || isSupervisor) && (
            <select value={brokerFilter} onChange={e => setBrokerFilter(e.target.value)} style={s.select}>
              <option value="">All brokers</option>
              <option value="SB">Sandra van der Berg</option>
              <option value="PJ">Pieter Joubert</option>
              <option value="RB">Riaan Botha</option>
              <option value="MS">Marelize Swart</option>
            </select>
          )}
          {hasFilter && (
            <button onClick={clearFilters} style={s.ghostBtn}>✕ Clear</button>
          )}
        </div>
      </>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 600, color: '#111827' }}>Appointments</h1>
          <p style={{ margin: '3px 0 0', fontSize: '0.813rem', color: '#6b7280' }}>{subtitle}</p>
        </div>
      </div>

      {/* Claim model indicator — Admin/Supervisor only */}
      {(isAdmin || isSupervisor) && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '14px',
          padding: '6px 12px', borderRadius: '6px', fontSize: '0.8125rem',
          background: claimModel === 'claim' ? '#f0fdf4' : '#eff6ff',
          color:      claimModel === 'claim' ? '#15803d' : '#1d4ed8',
          border: `1px solid ${claimModel === 'claim' ? '#bbf7d0' : '#bfdbfe'}`,
        }}>
          <span style={{ fontWeight: 600 }}>
            {claimModel === 'claim' ? '⚡ Claim model active' : '👤 Assign model active'}
          </span>
          <span style={{ opacity: 0.75 }}>
            {claimModel === 'claim'
              ? '— brokers self-select from the available queue'
              : '— admin/supervisor assigns brokers to appointments'}
          </span>
        </div>
      )}

      {/* Broker notices */}
      {isBroker && claimModel === 'assign' && (
        <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>
          You are viewing appointments assigned to you.
        </div>
      )}
      {isBroker && claimModel === 'claim' && (
        <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>
          <strong>Claim model is active.</strong> Browse available appointments below and claim
          them, or view the ones already assigned to you.
        </div>
      )}
      {isSupervisor && (
        <div style={{ ...s.noticeWarn, marginBottom: '14px' }}>
          You are viewing appointments for your direct reports only.
        </div>
      )}

      {/* ── BROKER: CLAIM MODEL — two tabs ─────────────────────────────────── */}
      {showClaimTabs && (
        <>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '18px' }}>
            {[
              { key: 'mine',      label: 'My Appointments',    badge: MY_APPOINTMENTS.length + claimedIds.size },
              { key: 'available', label: 'Available to Claim', badge: availCount },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: '9px 16px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '0.875rem', fontFamily: 'inherit',
                fontWeight: activeTab === tab.key ? 600 : 400,
                color: activeTab === tab.key ? '#1d4ed8' : '#6b7280',
                borderBottom: activeTab === tab.key ? '2px solid #1d4ed8' : '2px solid transparent',
                marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '7px',
              }}>
                {tab.label}
                {tab.badge > 0 && (
                  <span style={{ background: tab.key === 'available' ? '#d97706' : '#1d4ed8', color: 'white', borderRadius: '10px', fontSize: '0.625rem', fontWeight: 600, padding: '1px 6px' }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab 1 — My Appointments */}
          {activeTab === 'mine' && (
            <>
              {tokensEnabled && (
                <div style={{ ...s.noticeInfo, marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><strong>Token balance: 7 of 10 monthly free remaining.</strong> Additional claims cost 1 token each.</span>
                  <button style={s.ghostBtn}>Buy tokens</button>
                </div>
              )}
              {/* Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '16px' }}>
                {[
                  { label: 'Total assigned',    value: MY_APPOINTMENTS.length + claimedIds.size, colour: '#1d4ed8' },
                  { label: 'Today',             value: MY_APPOINTMENTS.filter(a => a.isToday).length, colour: '#d97706' },
                  { label: 'Signed this month', value: MY_APPOINTMENTS.filter(a => a.signed === 'Yes').length, colour: '#15803d' },
                ].map(m => (
                  <div key={m.label} style={s.metricCard}>
                    <div style={{ fontSize: '0.688rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{m.label}</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600, color: m.colour, lineHeight: 1 }}>{m.value}</div>
                  </div>
                ))}
              </div>
              <AppointmentsTable rows={MY_APPOINTMENTS} showBroker={false} />
              {/* Newly claimed rows */}
              {claimedIds.size > 0 && (
                <div style={{ ...s.noticeSuccess, marginTop: '10px' }}>
                  {claimedIds.size} appointment{claimedIds.size !== 1 ? 's' : ''} just claimed — pending broker system confirmation.
                </div>
              )}
            </>
          )}

          {/* Tab 2 — Available to Claim */}
          {activeTab === 'available' && (
            <>
              <div style={{ ...s.noticeWarn, marginBottom: '14px', display: 'flex', gap: '8px' }}>
                <span style={{ flexShrink: 0 }}>⚡</span>
                <span>
                  <strong>Claim model active.</strong> These appointments are matched to your
                  region (Gauteng) and portfolios (Discovery, M&M). First-come-first-served.
                  {!tokensEnabled && <> All claims are free until the token economy is activated.</>}
                  {tokensEnabled && <> 10 free per month, then 1 token each.</>}
                </span>
              </div>

              {tokensEnabled && (
                <div style={{ ...s.noticeInfo, marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><strong>Token balance: 7 of 10 monthly free remaining.</strong></span>
                  <button style={s.ghostBtn}>Buy tokens</button>
                </div>
              )}

              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Available to claim
                <span style={{ ...s.badge, background: '#fffbeb', color: '#d97706', fontSize: '0.75rem' }}>
                  {availCount} unassigned
                </span>
              </div>

              <div style={s.tableCard}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Lead</th>
                      <th style={s.th}>Occupation</th>
                      <th style={s.th}>Portfolio</th>
                      <th style={s.th}>First appt</th>
                      <th style={s.th}>Region</th>
                      <th style={s.th}>Source</th>
                      <th style={s.th}>Cost</th>
                      <th style={s.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {AVAILABLE_TO_CLAIM.filter(a => !claimedIds.has(a.id)).map(a => (
                      <tr key={a.id} style={s.tr}
                        onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                        onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                        <td style={{ ...s.td, fontWeight: 500 }}>{a.leadName}</td>
                        <td style={{ ...s.td, fontSize: '0.8125rem' }}>{a.occupation}</td>
                        <td style={s.td}><PortfolioBadge portfolio={a.portfolio} /></td>
                        <td style={{ ...s.td, fontWeight: 500 }}>{a.date}</td>
                        <td style={{ ...s.td, fontSize: '0.8125rem', color: '#6b7280' }}>{a.region}</td>
                        <td style={{ ...s.td, fontSize: '0.75rem', color: '#6b7280' }}>{a.source}</td>
                        <td style={s.td}>
                          <span style={{ ...s.badge, fontSize: '0.688rem',
                            background: a.token === 'Free' ? '#f0fdf4' : '#fffbeb',
                            color:      a.token === 'Free' ? '#15803d' : '#d97706' }}>
                            {a.token}
                          </span>
                        </td>
                        <td style={s.td}>
                          <button style={s.primaryBtn} onClick={() => {
                            setClaimedIds(prev => new Set([...prev, a.id]));
                            // After claiming, switch to My Appointments tab
                            setActiveTab('mine');
                          }}>
                            Claim
                          </button>
                        </td>
                      </tr>
                    ))}
                    {availCount === 0 && (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                          No available appointments in your region and portfolio right now.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div style={{ padding: '9px 14px', fontSize: '0.75rem', color: '#9ca3af', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
                  Appointments matched to your region (Gauteng) and portfolios (Discovery, M&M).
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── ALL OTHER ROLES + BROKER ASSIGN MODE — single list view ─────────── */}
      {!showClaimTabs && (
        <>
          {/* Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: isBroker ? 'My appointments' : 'Unassigned', value: isBroker ? assigned    : unassigned,  colour: '#d97706' },
              { label: isBroker ? 'Today'           : 'Assigned',   value: isBroker ? todayCount  : assigned,    colour: '#1d4ed8' },
              { label: 'Today',             value: todayCount,  colour: '#7c3aed' },
              { label: 'Signed this month', value: signedCount, colour: '#15803d' },
            ].map(m => (
              <div key={m.label} style={s.metricCard}>
                <div style={{ fontSize: '0.688rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{m.label}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 600, color: m.colour, lineHeight: 1 }}>{m.value}</div>
              </div>
            ))}
          </div>

          <FiltersBar />
          <AppointmentsTable rows={filtered} />
        </>
      )}

      {/* Reassign modal */}
      {reassignTarget && (
        <ReassignModal
          appointment={reassignTarget}
          isAssign={isAssignMode}
          onClose={() => { setReassignTarget(null); setIsAssignMode(false); }}
        />
      )}
    </div>
  );
}
