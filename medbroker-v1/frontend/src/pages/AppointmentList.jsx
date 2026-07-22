/**
 * pages/AppointmentList.jsx
 *
 * Role behaviour:
 *   GlobalAdmin/Admin — all appointments, broker/source/portfolio filters
 *                       Assign (assign model only) and Reassign (assign model only)
 *   Supervisor        — direct reports only, same actions as Admin
 *   Agent             — appointments they booked
 *   Broker (assign)   — assigned appointments only
 *   Broker (claim)    — two tabs: My Appointments | Available to Claim
 *
 * Feature flags:
 *   appointments.claimModel           'assign' | 'claim'
 *   appointments.tokens.paymentProvider 'none' | 'stripe'
 *
 * WORKFLOW RULES:
 *   - An Appointment always has an Agent (set at booking time from Lead Detail).
 *     The Agent field is read-only on the Assign Broker modal.
 *   - In CLAIM model: Assign and Reassign buttons are hidden — brokers self-serve
 *     via the Available to Claim tab.
 *   - In ASSIGN model: Admin/Supervisor can assign a broker to Unassigned appointments
 *     and reassign the broker on already-assigned ones.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext.jsx';
import { useFlags } from '../context/FlagContext.jsx';
import { appointmentsApi, usersApi, apiMode } from '../services/api.js';
import { useFetch } from '../hooks/useFetch.js';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { s, APPT_STATUS_META, MEETING_STATUS_META, PORTFOLIO_META } from '../styles/tokens.js';

// ─── Mock data ────────────────────────────────────────────────────────────────
const ALL_APPOINTMENTS = [
  { id:'A1', leadName:'Dr Priya Naidoo',     leadEmail:'p.naidoo@netcare.co.za',
    occupation:'Anaesthesiologist',   portfolio:'Discovery',
    source:'Wits Career Fair 2026',    status:'Assigned',   brokerCode:'SB',
    brokerName:'Sandra van der Berg',  agentName:'Thabo Molefe',
    firstDate:'Today · 10:00',    isToday:true,  m1:'Pending',    m2:null,          signed:null  },
  { id:'A2', leadName:'Dr Sipho Dlamini',    leadEmail:'s.dlamini@wits.ac.za',
    occupation:'General Practitioner',portfolio:'Discovery',
    source:'Wits Career Fair 2026',    status:'Unassigned', brokerCode:'',
    brokerName:'—',                    agentName:'Naledi van Wyk',
    firstDate:'Tomorrow · 14:00', isToday:false, m1:'Pending',    m2:null,          signed:null  },
  { id:'A3', leadName:'Dr Amara Osei',       leadEmail:'a.osei@mediclinic.co.za',
    occupation:'Cardiologist',        portfolio:'M&M',
    source:'MedLeads SA — Monthly',    status:'ClosedWon',  brokerCode:'SB',
    brokerName:'Sandra van der Berg',  agentName:'Kabelo Petersen',
    firstDate:'14 May 2026',      isToday:false, m1:'Seen',       m2:'Seen',        signed:'Yes' },
  { id:'A4', leadName:'Dr Lerato Mokoena',   leadEmail:'l.mokoena@life.co.za',
    occupation:'Orthopaedic Surgeon', portfolio:'Discovery',
    source:'Manual — Referral',        status:'InProgress', brokerCode:'SB',
    brokerName:'Sandra van der Berg',  agentName:'Thabo Molefe',
    firstDate:'21 May 2026',      isToday:false, m1:'Seen',       m2:null,          signed:null  },
  { id:'A5', leadName:'Dr James van Rooyen', leadEmail:'j.vanrooyen@uhw.co.za',
    occupation:'Radiologist',         portfolio:'Discovery',
    source:'Healthwise Doctor DB',     status:'Assigned',   brokerCode:'PJ',
    brokerName:'Pieter Joubert',       agentName:'Bongani Ntuli',
    firstDate:'22 May 2026',      isToday:false, m1:'Pending',    m2:null,          signed:null  },
  { id:'A6', leadName:'Dr Ayesha Moosa',     leadEmail:'a.moosa@sunward.co.za',
    occupation:'Psychiatrist',        portfolio:'M&M',
    source:'Manual — Referral',        status:'Unassigned', brokerCode:'',
    brokerName:'—',                    agentName:'Thabo Molefe',
    firstDate:'23 May 2026',      isToday:false, m1:'Pending',    m2:null,          signed:null  },
  { id:'A7', leadName:'Dr Marco Ferreira',   leadEmail:'m.ferreira@netcare.co.za',
    occupation:'Neurologist',         portfolio:'M&M',
    source:'MedLeads SA — Monthly',    status:'ClosedLost', brokerCode:'RB',
    brokerName:'Riaan Botha',          agentName:'Naledi van Wyk',
    firstDate:'24 May 2026',      isToday:false, m1:'Seen',       m2:'Seen',        signed:'No'  },
  { id:'A8', leadName:'Dr Zanele Dube',      leadEmail:'z.dube@charlotte.co.za',
    occupation:'Gynaecologist',       portfolio:'Discovery',
    source:'Wits Career Fair 2026',    status:'Unassigned', brokerCode:'',
    brokerName:'—',                    agentName:'Kabelo Petersen',
    firstDate:'25 May 2026',      isToday:false, m1:'Pending',    m2:null,          signed:null  },
];

// Unassigned appointments matched to Sandra van der Berg's region and portfolios
const AVAILABLE_TO_CLAIM = [
  { id:'C1', leadName:'Dr Sipho Dlamini',  occupation:'General Practitioner', portfolio:'Discovery', date:'Tomorrow · 14:00', region:'Gauteng',  source:'Wits Career Fair 2026',  token:'Free'    },
  { id:'C2', leadName:'Dr Fatima Essop',   occupation:'Paediatrician',        portfolio:'Discovery', date:'22 May · 09:30',  region:'Gauteng',  source:'SA Medical Register Q2', token:'Free'    },
  { id:'C3', leadName:'Dr Marco Ferreira', occupation:'Neurologist',          portfolio:'M&M',       date:'23 May · 11:00',  region:'Gauteng',  source:'MedLeads SA — Monthly',  token:'Free'    },
  { id:'C4', leadName:'Dr Zanele Dube',    occupation:'Gynaecologist',        portfolio:'Discovery', date:'25 May · 14:00',  region:'Limpopo',  source:'Wits Career Fair 2026',  token:'1 token' },
  { id:'C5', leadName:'Dr Ruan de Beer',   occupation:'Dermatologist',        portfolio:'Discovery', date:'27 May · 10:00',  region:'Gauteng',  source:'MedLeads SA — Monthly',  token:'1 token' },
];

const MY_APPOINTMENTS = ALL_APPOINTMENTS.filter(a => a.brokerCode === 'SB');
const SOURCES         = [...new Set(ALL_APPOINTMENTS.map(a => a.source))].sort();
const PORTFOLIOS      = ['Discovery', 'M&M'];
const BROKERS         = ['Sandra van der Berg','Pieter Joubert','Riaan Botha','Marelize Swart'];

// ─── Badge helpers ─────────────────────────────────────────────────────────────
function MeetingBadge({ status }) {
  if (!status) return <span style={{ color:'var(--mut)', fontSize: '0.75rem' }}>—</span>;
  const meta = MEETING_STATUS_META[status] ?? { colour: 'var(--mut)', bg: 'var(--panel2)' };
  return <span style={{ ...s.badge, background: meta.bg, color: meta.colour, fontSize: '0.688rem' }}>{status}</span>;
}
function SignedBadge({ signed }) {
  if (!signed) return <span style={{ color:'var(--mut)', fontSize: '0.75rem' }}>—</span>;
  return <span style={{ ...s.badge, fontSize: '0.688rem', background: signed === 'Yes' ? 'color-mix(in srgb, #15803d 14%, var(--panel))' : 'color-mix(in srgb, #dc2626 14%, var(--panel))', color: signed === 'Yes' ? '#15803d' : '#dc2626' }}>{signed}</span>;
}
function PortfolioBadge({ portfolio }) {
  const meta = PORTFOLIO_META[portfolio] ?? { colour: 'var(--mut)', bg: 'var(--panel2)' };
  return <span style={{ ...s.badge, background: meta.bg, color: meta.colour, fontSize: '0.688rem' }}>{portfolio}</span>;
}

// ─── Buy Tokens modal ──────────────────────────────────────────────────────────
function BuyTokensModal({ onClose, paymentProvider }) {
  const PACKS = [
    { tokens: 5,  price: 'R250',  label: '5 tokens' },
    { tokens: 10, price: 'R450',  label: '10 tokens — save R50' },
    { tokens: 20, price: 'R800',  label: '20 tokens — save R200' },
  ];
  const [selected, setSelected] = useState(1);
  const [purchasing, setPurchasing] = useState(false);
  const [done, setDone] = useState(false);

  async function handlePurchase() {
    if (paymentProvider === 'none') { setDone(true); return; }
    setPurchasing(true);
    // In production: POST /api/tokens/checkout → Stripe Checkout Session URL
    await new Promise(r => setTimeout(r, 800));
    setDone(true);
    setPurchasing(false);
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...s.modal, width: '440px' }}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>Buy Additional Tokens</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {paymentProvider === 'none' ? (
          <div style={{ ...s.noticeWarn, marginBottom: '14px', fontSize: '0.8125rem' }}>
            <strong>Payment not yet configured.</strong> Contact your administrator to top up
            your token balance. Token purchases via Stripe will be available in Phase 2.
          </div>
        ) : (
          <>
            <p style={{ fontSize: '0.8125rem', color:'var(--mut)', marginBottom: '14px' }}>
              Select a token pack. You will be redirected to a secure payment page.
            </p>
            {!done && PACKS.map((pack, i) => (
              <label key={i} style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                border: `1px solid ${selected === i ? 'var(--accent)' : 'var(--line)'}`,
                borderRadius: '6px', marginBottom: '8px', cursor: 'pointer',
                background: selected === i ? 'color-mix(in srgb, var(--accent) 10%, var(--panel))' : 'var(--panel)',
              }}>
                <input type="radio" name="token-pack" checked={selected === i}
                  onChange={() => setSelected(i)} style={{ accentColor: 'var(--accent)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{pack.label}</div>
                </div>
                <span style={{ fontWeight: 600 }}>{pack.price}</span>
              </label>
            ))}
            {done && (
              <div style={{ ...s.noticeSuccess, marginBottom: '14px' }}>
                ✓ Redirecting to secure payment… (Phase 2 — payment not yet active in preview)
              </div>
            )}
          </>
        )}

        <div style={s.modalFooter}>
          <button style={s.ghostBtn} onClick={onClose}>Close</button>
          {paymentProvider !== 'none' && !done && (
            <button style={s.primaryBtn} onClick={handlePurchase} disabled={purchasing}>
              {purchasing ? 'Redirecting…' : `Purchase ${PACKS[selected].label}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Assign Broker modal ───────────────────────────────────────────────────────
// Agent is always present (set at booking from Lead Detail) and is shown read-only.
// Only the Broker field is editable.
// isAssign=true  → Unassigned appointment → calls appointmentsApi.assignBroker()
// isAssign=false → Already assigned → calls appointmentsApi.reassign()
function AssignBrokerModal({ appointment, onClose, isAssign = false, brokers, onSaved }) {
  const [broker,  setBroker]  = useState(appointment.brokerId ?? '');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  async function handleSave() {
    if (!broker) return;
    setSaving(true);
    setError('');
    try {
      if (isAssign) {
        // agentId is NOT passed — the API derives it from the Appointment record.
        // Agent is set at booking time and never changed through this modal.
        await appointmentsApi.assignBroker(appointment.id, broker);
      } else {
        await appointmentsApi.reassign(appointment.id, broker);
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
      <div style={{ ...s.modal, width: '420px' }}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>{isAssign ? 'Assign Broker' : 'Reassign Broker'}</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: '0.8125rem', color:'var(--mut)', marginBottom: '14px' }}>
          {appointment.leadName} · {appointment.firstDate}
        </p>

        {/* Agent — always read-only on both Assign and Reassign */}
        <div style={s.formGroup}>
          <label style={s.formLabel}>Qualified by (Agent)</label>
          <div style={{
            padding: '9px 12px', borderRadius: '6px', background:'var(--panel2)',
            border: '1px solid var(--line)', fontSize: '0.875rem', color:'var(--ink)',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ color:'var(--mut)', fontSize: '0.75rem' }}>🔒</span>
            {appointment.agentName}
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color:'var(--mut)' }}>Read only</span>
          </div>
          <div style={s.formHint}>
            The agent who booked this appointment is read only and cannot be changed here.
          </div>
        </div>

        {/* Broker — editable on both Assign and Reassign */}
        <div style={s.formGroup}>
          <label style={s.formLabel}>
            {isAssign ? 'Assign broker *' : 'Reassign broker *'}
          </label>
          {!isAssign && appointment.brokerName && appointment.brokerName !== '—' && (
            <div style={{ fontSize: '0.75rem', color:'var(--mut)', marginBottom: '6px' }}>
              Currently assigned to: <strong>{appointment.brokerName}</strong>
            </div>
          )}
          <select style={s.formInput} value={broker} onChange={e => setBroker(e.target.value)}>
            <option value="">— Select broker —</option>
            {brokers.map(b => <option key={b.id} value={b.id}>{b.displayName}</option>)}
          </select>
        </div>

        {saved  && <div style={{ ...s.noticeSuccess, marginBottom: '10px' }}>✓ Broker {isAssign ? 'assigned' : 'reassigned'} successfully.</div>}
        {error  && <div style={{ ...s.errorBox,      marginBottom: '10px' }}>{error}</div>}

        <div style={s.modalFooter}>
          <button style={s.ghostBtn} onClick={onClose}>Cancel</button>
          <button
            style={{ ...s.primaryBtn, opacity: (!broker || saving) ? 0.5 : 1 }}
            onClick={handleSave}
            disabled={saved || saving || !broker}
          >
            {saving ? 'Saving…' : saved ? 'Saved ✓' : isAssign ? 'Assign Broker' : 'Reassign Broker'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function AppointmentList() {
  const navigate = useNavigate();
  const { role, persona } = useRole();
  const { flag, flags } = useFlags();
  const { isMobile } = useWindowSize();

  const isAdmin      = role === 'Admin' || role === 'GlobalAdmin';
  const isSupervisor = role === 'Supervisor';
  const isBroker     = role === 'Broker';
  const canManage    = isAdmin || isSupervisor;

  const claimModel     = flags['appointments.claimModel'] ?? 'assign';
  const tokensEnabled  = claimModel === 'claim';   // token economy is a claim-model feature, not a separate flag
  const paymentProvider= flags['appointments.tokens.paymentProvider'] ?? 'none';
  const showClaimTabs  = isBroker && claimModel === 'claim';
  // In claim model, admin/supervisor do NOT assign brokers — brokers self-serve.
  // Assign and Reassign buttons are hidden when claimModel = 'claim'.
  const showAssignActions = canManage && claimModel === 'assign';

  // Monthly token allocation from SystemConfig (configurable in AppAdmin → System Settings)
  // Default 10 — matches SystemConfig.brokerFreeAppointmentsPerMonth seed value
  const monthlyAllocation = 10;
  const tokenBalance      = 7; // mock — in production read from TokenLedger

  const [activeTab,      setActiveTab]      = useState('mine');
  const [statusFilter,   setStatusFilter]   = useState('All');
  const [search,         setSearch]         = useState('');
  const [sourceFilter,   setSourceFilter]   = useState('');
  const [portfolioFilter,setPortfolioFilter]= useState('');
  const [brokerFilter,   setBrokerFilter]   = useState('');
  // Tracks appointments claimed this session as full row objects so they
  // render in the My Appointments table immediately, without a round trip.
  // In production, claiming triggers PUT /api/appointments/:id/claim which
  // sets assignedBrokerId and status = Assigned; the table is then re-fetched.
  const [claimedAppointments, setClaimedAppointments] = useState([]);
  const [assignTarget,   setAssignTarget]   = useState(null);
  const [isAssignMode,   setIsAssignMode]   = useState(false);
  const [showBuyTokens,  setShowBuyTokens]  = useState(false);

  // Real data — assign model only (claim-mode's AVAILABLE_TO_CLAIM stays
  // mock; wiring that is a separate, larger piece of work, see
  // models/appointment.js header). Row-level scoping (own bookings for
  // Agent, own assignments for Broker, direct reports for Supervisor) is
  // already applied server-side — nothing extra needed client-side for that.
  const { data: apptData, loading: apptLoading, refetch: refetchAppts } = useFetch(
    () => appointmentsApi.list({}), []
  );
  const { data: brokersData } = useFetch(() => usersApi.list({ role: 'Broker' }), []);
  const realBrokers = brokersData?.users ?? [];

  const today = new Date().toDateString();
  const realAppointments = (apptData?.appointments ?? []).map(a => ({
    id:          a.id,
    leadName:    `${a.title ?? ''} ${a.firstName} ${a.lastName}`.trim(),
    leadEmail:   a.leadEmail,
    occupation:  a.occupation,
    portfolio:   a.portfolio === 'Money and Medicine' ? 'M&M' : a.portfolio,
    source:      a.sourceLabel ?? '—',
    status:      a.status,
    brokerCode:  a.brokerId ?? '',   // repurposed to hold the real id — see note below
    brokerName:  a.brokerName ?? '—',
    agentName:   a.agentName ?? '—',
    firstDate:   a.firstAppointmentDate
                   ? `${new Date(a.firstAppointmentDate).toDateString() === today ? 'Today' : new Date(a.firstAppointmentDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })} · ${(a.firstAppointmentTime ?? '').slice(0, 5)}`
                   : '—',
    isToday:     a.firstAppointmentDate ? new Date(a.firstAppointmentDate).toDateString() === today : false,
    m1:          a.meeting1Status || null,
    m2:          a.meeting2Status || null,
    signed:      a.customerSigned === true ? 'Yes' : a.customerSigned === false ? 'No' : null,
    brokerId:    a.brokerId ?? null, // real id, used directly by the Assign/Reassign modal
    agentId:     a.agentId,
  }));

  // PREVIEW_MODE (no backend at all): apptData/brokersData are always
  // null, forever — the mock arrays below are correct and permanent here.
  // DEMO_MODE: both are null only briefly, while their fetches are in
  // flight (or, for brokers, genuinely empty if none have been created
  // yet) — falling back to mock in either case (as this used to) meant
  // real users would briefly see fake appointments and fake broker names
  // on screen before the real, possibly-empty data replaced them. Gate on
  // PREVIEW_MODE directly instead of data truthiness/length so DEMO_MODE
  // always shows real data, even while genuinely empty.
  const sourceData = apiMode.PREVIEW_MODE ? ALL_APPOINTMENTS : realAppointments;
  const brokerOptions = apiMode.PREVIEW_MODE
    ? BROKERS.map(name => ({ id: name, displayName: name })) // preview fallback, matches mock's name-as-identifier
    : realBrokers.map(b => ({ id: b.id, displayName: b.displayName }));

  const filtered = sourceData.filter(a => {
    // brokerCode holds the real brokerId in the real-data path (see mapping
    // above) — compare against the current user's own id, not a mock code.
    if (isBroker && a.brokerCode !== persona.id) return false;
    // Status chips — 'Today' is date-derived, others are status values
    if (statusFilter === 'Today'      && !a.isToday)                              return false;
    if (statusFilter !== 'All' && statusFilter !== 'Today'
        && a.status !== statusFilter)                                              return false;
    if (sourceFilter    && a.source    !== sourceFilter)    return false;
    if (portfolioFilter && a.portfolio !== portfolioFilter) return false;
    if (brokerFilter    && a.brokerCode !== brokerFilter)   return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.leadName.toLowerCase().includes(q) && !a.leadEmail.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const myAppts     = isBroker ? sourceData.filter(a => a.brokerCode === persona.id) : sourceData;
  const unassigned  = myAppts.filter(a => a.status === 'Unassigned').length;
  const assigned    = myAppts.filter(a => a.status === 'Assigned').length;
  const inProgress  = myAppts.filter(a => a.status === 'InProgress').length;
  const todayCount  = myAppts.filter(a => a.isToday).length;
  const closedWon   = myAppts.filter(a => a.status === 'ClosedWon').length;
  const claimedIds  = new Set(claimedAppointments.map(a => a.id));
  const availCount  = AVAILABLE_TO_CLAIM.filter(a => !claimedIds.has(a.id)).length;
  const hasFilter  = statusFilter !== 'All' || search || sourceFilter || portfolioFilter || brokerFilter;

  const subtitleMap = {
    GlobalAdmin: 'All appointments across all brokers',
    Admin:       'All appointments across all brokers',
    Supervisor:  'Appointments for your direct reports',
    Agent:       'Appointments you have booked',
    Broker:      claimModel === 'claim' ? 'My appointments and available to claim' : 'Appointments assigned to you',
  };

    function AppointmentsTable({ rows, showBroker = true }) {
      return (
        <div style={{ ...s.tableCard, overflowX: 'auto' }}>
          <table style={{ ...s.table, minWidth: '860px' }}>
          <thead>
            <tr>
              <th style={s.th}>Lead</th>
              <th style={s.th}>Portfolio</th>
              <th style={s.th}>Source</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>First appt</th>
              <th style={s.th}>Agent</th>
              <th style={s.th}>1st mtg</th>
              <th style={s.th}>2nd mtg</th>
              <th style={s.th}>Signed?</th>
              {showBroker && !isBroker && <th style={s.th}>Broker</th>}
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} style={{ textAlign: 'center', padding: '40px', color:'var(--mut)' }}>
                  No appointments match your current filters.
                </td>
              </tr>
            )}
            {rows.map(a => {
              const sm = APPT_STATUS_META[a.status] ?? APPT_STATUS_META.Unassigned;
              const isUnassigned = a.status === 'Unassigned';
              return (
                <tr key={a.id} style={s.tr}
                  onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 6%, var(--panel))'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {a.isToday && <span style={{ width: '7px', height: '7px', background: '#d97706', borderRadius: '50%', flexShrink: 0 }} />}
                      {a.leadName}
                    </div>
                    <div style={{ fontSize: '0.75rem', color:'var(--mut)' }}>{a.leadEmail}</div>
                  </td>
                  <td style={s.td}><PortfolioBadge portfolio={a.portfolio} /></td>
                  <td style={{ ...s.td, fontSize: '0.75rem', color:'var(--mut)', maxWidth: '130px' }}>{a.source}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: sm.bg, color: sm.colour, border: `1px solid ${sm.border}` }}>
                      {a.status}
                    </span>
                  </td>
                  <td style={{ ...s.td, fontSize: '0.8125rem', fontWeight: a.isToday ? 600 : 400, color: a.isToday ? '#d97706' : 'var(--ink)' }}>
                    {a.firstDate}
                  </td>
                  {/* Agent — always present, always read-only */}
                  <td style={{ ...s.td, fontSize: '0.8125rem', color:'var(--ink)' }}>
                    {a.agentName}
                  </td>
                  <td style={s.td}><MeetingBadge status={a.m1} /></td>
                  <td style={s.td}><MeetingBadge status={a.m2} /></td>
                  <td style={s.td}><SignedBadge signed={a.signed} /></td>
                  {showBroker && !isBroker && (
                    <td style={{ ...s.td, fontSize: '0.8125rem', color:'var(--mut)' }}>{a.brokerName}</td>
                  )}
                  <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => navigate(`/appointments/${a.id}`)} style={s.linkBtn}>
                      View →
                    </button>
                    {/* Assign/Reassign — only shown in assign model, never in claim model */}
                    {showAssignActions && isUnassigned && (
                      <button
                        onClick={() => { setAssignTarget(a); setIsAssignMode(true); }}
                        style={{
                          background: 'color-mix(in srgb, #d97706 14%, var(--panel))', color: '#d97706', border: '1px solid color-mix(in srgb, #d97706 30%, var(--panel))',
                          borderRadius: '6px', padding: '3px 10px', cursor: 'pointer',
                          fontSize: '0.75rem', fontWeight: 500, fontFamily: 'inherit', marginLeft: '6px',
                        }}
                      >
                        Assign
                      </button>
                    )}
                    {showAssignActions && !isUnassigned && (
                      <button
                        onClick={() => { setAssignTarget(a); setIsAssignMode(false); }}
                        style={{ ...s.linkBtn, color:'var(--mut)', marginLeft: '4px' }}
                      >
                        Reassign
                      </button>
                    )}
                    {/* In claim model — show info note instead of action buttons */}
                    {canManage && claimModel === 'claim' && isUnassigned && (
                      <span style={{ fontSize: '0.688rem', color:'var(--mut)', marginLeft: '6px' }}>
                        Broker will claim
                      </span>
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

  function FiltersBar() {
    // Chips: All + the 5 appointment statuses + Today (date-derived, not a status)
    const chips = ['All', 'Unassigned', 'Assigned', 'InProgress', 'ClosedWon', 'ClosedLost', 'Today'];
    return (
      <>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {chips.map(chip => {
            const isActive = statusFilter === chip;
            const meta = APPT_STATUS_META[chip];
            return (
              <button key={chip} onClick={() => setStatusFilter(chip)} style={{
                ...s.chip,
                ...(isActive && chip === 'All'   ? s.chipActive : {}),
                ...(isActive && chip === 'Today' ? s.chipActive : {}),
                ...(isActive && meta ? { background: meta.bg, color: meta.colour, borderColor: meta.border, fontWeight: 500 } : {}),
              }}>
                {chip === 'InProgress' ? 'In Progress'
                  : chip === 'ClosedWon'  ? 'Closed Won'
                  : chip === 'ClosedLost' ? 'Closed Lost'
                  : chip}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Search lead name or email…"
            value={search} onChange={e => setSearch(e.target.value)} style={s.searchInput} />
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={s.select}>
            <option value="">All sources</option>
            {[...new Set(sourceData.map(a => a.source))].sort().map(src => <option key={src} value={src}>{src}</option>)}
          </select>
          <select value={portfolioFilter} onChange={e => setPortfolioFilter(e.target.value)} style={s.select}>
            <option value="">All portfolios</option>
            {PORTFOLIOS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {(isAdmin || isSupervisor) && (
            <select value={brokerFilter} onChange={e => setBrokerFilter(e.target.value)} style={s.select}>
              <option value="">All brokers</option>
              {brokerOptions.map(b => <option key={b.id} value={b.id}>{b.displayName}</option>)}
            </select>
          )}
          {hasFilter && (
            <button onClick={() => { setStatusFilter('All'); setSearch(''); setSourceFilter(''); setPortfolioFilter(''); setBrokerFilter(''); }} style={s.ghostBtn}>
              ✕ Clear
            </button>
          )}
        </div>
      </>
    );
  }

  // ── Token card ────────────────────────────────────────────────────────────────
  function TokenCard() {
    if (!tokensEnabled) return null;
    const pct = Math.round((tokenBalance / monthlyAllocation) * 100);
    return (
      <div style={{ background:'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color:'var(--ink)', marginBottom: '6px' }}>
            Monthly token balance
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ flex: 1, background: 'var(--panel2)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '4px', background: pct > 30 ? 'var(--accent)' : '#dc2626', width: `${pct}%`, transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: pct > 30 ? 'var(--accent)' : '#dc2626', whiteSpace: 'nowrap' }}>
              {tokenBalance} / {monthlyAllocation} free remaining
            </span>
          </div>
          {tokenBalance === 0 && (
            <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '4px' }}>
              Free allocation exhausted — additional claims cost 1 token each.
            </div>
          )}
        </div>
        <button
          onClick={() => setShowBuyTokens(true)}
          style={s.secondaryBtn}
        >
          Buy tokens
        </button>
      </div>
    );
  }

  return (
    <div style={{ ...s.page, padding: isMobile ? '12px' : '24px' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 600, color:'var(--ink)' }}>Appointments</h1>
          <p style={{ margin: '3px 0 0', fontSize: '0.813rem', color:'var(--mut)' }}>{subtitleMap[role] ?? ''}</p>
        </div>
      </div>

      {/* Claim model indicator */}
      {(isAdmin || isSupervisor) && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '14px',
          padding: '6px 12px', borderRadius: '6px', fontSize: '0.8125rem',
          background: claimModel === 'claim' ? 'color-mix(in srgb, #15803d 14%, var(--panel))' : 'color-mix(in srgb, #1d4ed8 14%, var(--panel))',
          color:      claimModel === 'claim' ? '#15803d' : 'var(--accent)',
          border: `1px solid ${claimModel === 'claim' ? 'color-mix(in srgb, #15803d 30%, var(--panel))' : 'color-mix(in srgb, #1d4ed8 30%, var(--panel))'}`,
        }}>
          <span style={{ fontWeight: 600 }}>
            {claimModel === 'claim' ? '⚡ Claim model active' : '👤 Assign model active'}
          </span>
          <span style={{ opacity: 0.75 }}>
            {claimModel === 'claim'
              ? '— brokers self-select from the Available to Claim queue'
              : '— use the Assign button to allocate brokers to unassigned appointments'}
          </span>
        </div>
      )}

      {apiMode.DEMO_MODE && apptLoading && (
        <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>Loading appointments…</div>
      )}

      {isBroker && claimModel === 'assign' && (
        <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>You are viewing appointments assigned to you.</div>
      )}
      {isBroker && claimModel === 'claim' && (
        <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>
          <strong>Claim model is active.</strong> Use the Available to Claim tab to browse and claim appointments in your region and portfolio.
        </div>
      )}
      {isSupervisor && (
        <div style={{ ...s.noticeWarn, marginBottom: '14px' }}>You are viewing appointments for your direct reports only.</div>
      )}

      {/* ── BROKER: CLAIM MODEL — two tabs ──────────────────────────────── */}
      {showClaimTabs && (
        <>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: '18px' }}>
            {[
              { key: 'mine',      label: 'My Appointments',    badge: MY_APPOINTMENTS.length + claimedAppointments.length },
              { key: 'available', label: 'Available to Claim', badge: availCount },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: '9px 16px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '0.875rem', fontFamily: 'inherit',
                fontWeight: activeTab === tab.key ? 600 : 400,
                color: activeTab === tab.key ? 'var(--accent)' : 'var(--mut)',
                borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '7px',
              }}>
                {tab.label}
                {tab.badge > 0 && (
                  <span style={{ background: tab.key === 'available' ? '#d97706' : 'var(--accent)', color: 'white', borderRadius: '10px', fontSize: '0.625rem', fontWeight: 600, padding: '1px 6px' }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeTab === 'mine' && (
            <>
              <TokenCard />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '16px' }}>
                {[
                  { label: 'Total assigned',    value: MY_APPOINTMENTS.length + claimedAppointments.length, colour: 'var(--accent)' },
                  { label: 'Today',             value: MY_APPOINTMENTS.filter(a => a.isToday).length, colour: '#d97706' },
                  { label: 'Closed Won',        value: MY_APPOINTMENTS.filter(a => a.status === 'ClosedWon').length, colour: '#15803d' },
                ].map(m => (
                  <div key={m.label} style={s.metricCard}>
                    <div style={{ fontSize: '0.688rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{m.label}</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600, color: m.colour, lineHeight: 1 }}>{m.value}</div>
                  </div>
                ))}
              </div>
              <AppointmentsTable rows={[...MY_APPOINTMENTS, ...claimedAppointments]} showBroker={false} />
              {claimedAppointments.length > 0 && (
                <div style={{ ...s.noticeSuccess, marginTop: '10px' }}>
                  ✓ {claimedAppointments.length} appointment{claimedAppointments.length !== 1 ? 's' : ''} claimed successfully.
                </div>
              )}
            </>
          )}

          {activeTab === 'available' && (
            <>
              <div style={{ ...s.noticeWarn, marginBottom: '14px', display: 'flex', gap: '8px' }}>
                <span style={{ flexShrink: 0 }}>⚡</span>
                <span>
                  <strong>Claim model active.</strong> Appointments matched to your region (Gauteng) and portfolios.
                  {tokensEnabled ? ` ${tokenBalance} of ${monthlyAllocation} free claims remaining this month.` : ' All claims are currently free.'}
                </span>
              </div>
              <TokenCard />
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color:'var(--ink)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Available to claim
                <span style={{ ...s.badge, background: 'color-mix(in srgb, #d97706 14%, var(--panel))', color: '#d97706', fontSize: '0.75rem' }}>{availCount} unassigned</span>
              </div>
              <div style={{ ...s.tableCard, overflowX: 'auto' }}>
                <table style={{ ...s.table, minWidth: '680px' }}>
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
                        onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 6%, var(--panel))'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <td style={{ ...s.td, fontWeight: 500 }}>{a.leadName}</td>
                        <td style={{ ...s.td, fontSize: '0.8125rem' }}>{a.occupation}</td>
                        <td style={s.td}><PortfolioBadge portfolio={a.portfolio} /></td>
                        <td style={{ ...s.td, fontWeight: 500 }}>{a.date}</td>
                        <td style={{ ...s.td, fontSize: '0.8125rem', color:'var(--mut)' }}>{a.region}</td>
                        <td style={{ ...s.td, fontSize: '0.75rem', color:'var(--mut)' }}>{a.source}</td>
                        <td style={s.td}>
                          <span style={{ ...s.badge, fontSize: '0.688rem', background: a.token === 'Free' ? 'color-mix(in srgb, #15803d 14%, var(--panel))' : 'color-mix(in srgb, #d97706 14%, var(--panel))', color: a.token === 'Free' ? '#15803d' : '#d97706' }}>
                            {a.token}
                          </span>
                        </td>
                        <td style={s.td}>
                          <button style={s.primaryBtn} onClick={() => {
                            // Map the Available-to-Claim shape into a full appointment row.
                            // In production this is a PUT /api/appointments/:id/claim that
                            // sets assignedBrokerId and status = Assigned server-side;
                            // the list is then re-fetched. In preview we derive it locally.
                            const claimed = {
                              id:         a.id,
                              leadName:   a.leadName,
                              leadEmail:  '',
                              occupation: a.occupation,
                              portfolio:  a.portfolio,
                              source:     a.source,
                              status:     'Assigned',
                              brokerCode: 'SB',
                              brokerName: 'Sandra van der Berg',
                              agentName:  '—',
                              firstDate:  a.date,
                              isToday:    false,
                              m1:         'Pending',
                              m2:         null,
                              signed:     null,
                            };
                            setClaimedAppointments(prev => [...prev, claimed]);
                            setActiveTab('mine');
                          }}>
                            Claim
                          </button>
                        </td>
                      </tr>
                    ))}
                    {availCount === 0 && (
                      <tr><td colSpan={8} style={{ textAlign: 'center', padding: '36px', color:'var(--mut)' }}>No available appointments right now.</td></tr>
                    )}
                  </tbody>
                </table>
                <div style={{ padding: '9px 14px', fontSize: '0.75rem', color:'var(--mut)', borderTop: '1px solid var(--line)', background:'var(--panel2)' }}>
                  Matched to your region (Gauteng) and portfolios (Discovery, M&M).
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── ALL OTHER ROLES + BROKER ASSIGN MODE ────────────────────────── */}
      {!showClaimTabs && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Unassigned',  value: unassigned,  colour: '#d97706' },
              { label: 'Assigned',    value: assigned,    colour: 'var(--accent)' },
              { label: 'In Progress', value: inProgress,  colour: '#0891b2' },
              { label: 'Closed Won',  value: closedWon,   colour: '#15803d' },
            ].map(m => (
              <div key={m.label} style={s.metricCard}>
                <div style={{ fontSize: '0.688rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{m.label}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 600, color: m.colour, lineHeight: 1 }}>{m.value}</div>
              </div>
            ))}
          </div>
          <FiltersBar />
          <AppointmentsTable rows={filtered} />
        </>
      )}

      {/* Modals */}
      {assignTarget && (
        <AssignBrokerModal
          appointment={assignTarget}
          isAssign={isAssignMode}
          brokers={brokerOptions}
          onSaved={refetchAppts}
          onClose={() => { setAssignTarget(null); setIsAssignMode(false); }}
        />
      )}
      {showBuyTokens && (
        <BuyTokensModal
          paymentProvider={paymentProvider}
          onClose={() => setShowBuyTokens(false)}
        />
      )}
    </div>
  );
}
