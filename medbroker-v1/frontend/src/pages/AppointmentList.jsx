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
import { useNavigate } from 'react-router';
import { useRole } from '../context/RoleContext.jsx';
import { useFlags } from '../context/FlagContext.jsx';
import { appointmentsApi, usersApi, ApiError } from '../services/api.js';
import { useFetch } from '../hooks/useFetch.js';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { s, APPT_STATUS_META, MEETING_STATUS_META, PORTFOLIO_META } from '../styles/tokens.js';

const PORTFOLIOS = ['Discovery', 'M&M'];

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
function AssignBrokerModal({ appointment, onClose, isAssign = false, brokers, agents, onSaved }) {
  const [broker,  setBroker]  = useState(appointment.brokerId ?? '');
  const [agent,   setAgent]   = useState(appointment.agentId ?? '');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  const agentChanged = !isAssign && agent !== (appointment.agentId ?? '') && !!agent;

  async function handleSave() {
    if (!broker) return;
    setSaving(true);
    setError('');
    try {
      if (isAssign) {
        // agentId is NOT passed — the API derives it from the Lead record
        // at booking time. Agent isn't part of this first-allocation flow.
        await appointmentsApi.assignBroker(appointment.id, broker);
      } else {
        await appointmentsApi.reassign(appointment.id, broker, agentChanged ? agent : undefined);
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
          <h2 style={s.modalTitle}>{isAssign ? 'Assign Broker' : 'Reassign Broker / Agent'}</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: '0.8125rem', color:'var(--mut)', marginBottom: '14px' }}>
          {appointment.leadName} · {appointment.firstDate}
        </p>

        {/* Agent — read-only on first Assign (agent is set from the Lead at
            booking time, not part of this flow); editable on Reassign
            (Mark's request, 23 Jul 2026 — corrects a wrong agent-on-booking
            without going into Appointment Detail). */}
        <div style={s.formGroup}>
          <label style={s.formLabel}>Qualified by (Agent)</label>
          {isAssign ? (
            <div style={{
              padding: '9px 12px', borderRadius: '6px', background:'var(--panel2)',
              border: '1px solid var(--line)', fontSize: '0.875rem', color:'var(--ink)',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <span style={{ color:'var(--mut)', fontSize: '0.75rem' }}>🔒</span>
              {appointment.agentName}
              <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color:'var(--mut)' }}>Read only</span>
            </div>
          ) : (
            <select style={s.formInput} value={agent} onChange={e => setAgent(e.target.value)}>
              <option value="">— Select agent —</option>
              {(agents ?? []).map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}
            </select>
          )}
          {isAssign && (
            <div style={s.formHint}>
              Set from the lead's assigned agent at booking time.
            </div>
          )}
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

  // §117 — real now. monthlyAllocation/tokenLedger come from the tokens.me
  // fetch below (server-computed, includes the lazy monthly-reset value —
  // see tokenService.js), not a hardcoded constant.

  const [activeTab,      setActiveTab]      = useState('mine');
  const [statusFilter,   setStatusFilter]   = useState('Active');
  const [search,         setSearch]         = useState('');
  const [sourceFilter,   setSourceFilter]   = useState('');
  const [portfolioFilter,setPortfolioFilter]= useState('');
  const [brokerFilter,   setBrokerFilter]   = useState('');
  const [assignTarget,   setAssignTarget]   = useState(null);
  const [isAssignMode,   setIsAssignMode]   = useState(false);
  const [showBuyTokens,  setShowBuyTokens]  = useState(false);
  // §117 — claim-in-flight tracking (disables the Claim button for the
  // specific row being claimed) and a surfaced error (insufficient
  // tokens, lost the race to another broker, etc.) — no more local-state
  // mock appending; a successful claim refetches real data instead.
  const [claimingId,     setClaimingId]     = useState(null);
  const [claimError,     setClaimError]     = useState(null);

  // Real data — assign model AND claim model both, as of §117. Row-level
  // scoping (own bookings for Agent, own assignments for Broker, direct
  // reports for Supervisor) is already applied server-side — nothing
  // extra needed client-side for that, and this already correctly
  // includes a broker's own Claimed appointments too (claiming sets
  // brokerId server-side, same column this list already filters on).
  const { data: apptData, loading: apptLoading, refetch: refetchAppts } = useFetch(
    () => appointmentsApi.list({}), []
  );
  const { data: brokersData } = useFetch(() => usersApi.list({ role: 'Broker' }), []);
  const realBrokers = brokersData?.users ?? [];
  const { data: agentsData } = useFetch(() => usersApi.list({ role: 'Agent' }), []);
  const realAgents = agentsData?.users ?? [];

  // §117 — only fetched for a Broker under the claim model; resolving to
  // an empty/null result rather than not calling useFetch at all for
  // other roles (hooks must run unconditionally either way), avoiding a
  // guaranteed 403 network call for every non-Broker page load.
  const { data: availableData, loading: availableLoading, refetch: refetchAvailable } = useFetch(
    () => (isBroker && claimModel === 'claim') ? appointmentsApi.listAvailableToClaim() : Promise.resolve({ appointments: [] }),
    [isBroker, claimModel]
  );
  const { data: tokenData, refetch: refetchTokens } = useFetch(
    () => (isBroker && tokensEnabled) ? appointmentsApi.tokens.me() : Promise.resolve(null),
    [isBroker, tokensEnabled]
  );
  const tokenLedger       = tokenData?.ledger ?? { freeRemaining: 0, balance: 0 };
  const monthlyAllocation = tokenData?.monthlyAllocation ?? 0;

  const today = new Date().toDateString();
  const realAppointments = (apptData?.appointments ?? []).map(a => ({
    id:          a.id,
    leadName:    `${a.title ?? ''} ${a.firstName} ${a.lastName}`.trim(),
    leadEmail:   a.leadEmail,
    occupation:  a.occupation,
    portfolio:   a.portfolio === 'Money and Medicine' ? 'M&M' : a.portfolio,
    // Full set (§45) — an appointment can now cover more than one
    // portfolio; filtering needs to check membership here, not just
    // equality against the primary above.
    portfolios:  (a.portfolios ?? [a.portfolio]).map(p => p === 'Money and Medicine' ? 'M&M' : p),
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

  // §117 — the claim pool. Only ever non-empty for a Broker under
  // claimModel = 'claim' (availableData resolves to { appointments: [] }
  // otherwise, see the useFetch call above), so no extra role check
  // needed here.
  const availableAppointments = (availableData?.appointments ?? []).map(a => ({
    id:             a.id,
    leadName:       `${a.title ?? ''} ${a.firstName} ${a.lastName}`.trim(),
    occupation:     a.occupation,
    portfolios:     (a.portfolios ?? [a.portfolio]).map(p => p === 'Money and Medicine' ? 'M&M' : p),
    date:           a.firstAppointmentDate
                      ? `${new Date(a.firstAppointmentDate).toDateString() === today ? 'Today' : new Date(a.firstAppointmentDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })} · ${(a.firstAppointmentTime ?? '').slice(0, 5)}`
                      : '—',
    region:         a.agentRegion ?? '—',
    source:         a.sourceLabel ?? '—',
    claimTokenCost: a.claimTokenCost ?? 0,
  }));

  // apptLoading (checked below, near the top of the render) keeps
  // the brief window while fetches are in flight from rendering an empty
  // state as if it were the final result.
  const sourceData = realAppointments;
  const brokerOptions = realBrokers.map(b => ({ id: b.id, displayName: b.displayName }));

  const ACTIVE_APPT_STATUSES = ['Unassigned', 'Assigned', 'InProgress'];
  const CLOSED_APPT_STATUSES = ['ClosedWon', 'ClosedLost', 'ReturnedToLeads'];

  const filtered = sourceData.filter(a => {
    // brokerCode holds the real brokerId in the real-data path (see mapping
    // above) — compare against the current user's own id, not a mock code.
    if (isBroker && a.brokerCode !== persona.id) return false;
    // Status chips — 'Today' is date-derived; 'Active'/'Closed' are composite
    // groups (Mark's request); others are exact status values.
    if (statusFilter === 'Today'  && !a.isToday) return false;
    if (statusFilter === 'Active' && !ACTIVE_APPT_STATUSES.includes(a.status)) return false;
    if (statusFilter === 'Closed' && !CLOSED_APPT_STATUSES.includes(a.status)) return false;
    if (statusFilter !== 'All' && statusFilter !== 'Today' && statusFilter !== 'Active' && statusFilter !== 'Closed'
        && a.status !== statusFilter)                                              return false;
    if (sourceFilter    && a.source    !== sourceFilter)    return false;
    if (portfolioFilter && !a.portfolios.includes(portfolioFilter)) return false;
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
  // §117 — claimed appointments now show up in myAppts naturally (real
  // data, status='Claimed', brokerCode=this broker's own id) — no
  // separate claimedAppointments list to merge in any more.
  const claimedCount = myAppts.filter(a => a.status === 'Claimed').length;
  const availCount  = availableAppointments.length;
  const hasFilter  = statusFilter !== 'Active' || search || sourceFilter || portfolioFilter || brokerFilter;

  // §117 — the actual claim action. Debit-then-claim ordering, race
  // handling, and the refund-on-lost-race path all live server-side
  // (appointmentService.claimAppointment/tokenService.debitTokensForClaim)
  // — this is just the call + refetch + surfaced error.
  async function handleClaim(id) {
    setClaimError(null);
    setClaimingId(id);
    try {
      await appointmentsApi.claim(id);
      await Promise.all([refetchAppts(), refetchAvailable(), refetchTokens()]);
      setActiveTab('mine');
    } catch (err) {
      setClaimError(err instanceof ApiError ? err.message : 'Could not claim this appointment.');
    } finally {
      setClaimingId(null);
    }
  }

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
                <tr key={a.id} style={{ ...s.tr, cursor: 'pointer' }}
                  onClick={() => navigate(`/appointments/${a.id}`)}
                  onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 6%, var(--panel))'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {a.isToday && <span style={{ width: '7px', height: '7px', background: '#d97706', borderRadius: '50%', flexShrink: 0 }} />}
                      {a.leadName}
                    </div>
                    <div style={{ fontSize: '0.75rem', color:'var(--mut)' }}>{a.leadEmail}</div>
                  </td>
                  <td style={s.td}><div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>{a.portfolios.map(p => <PortfolioBadge key={p} portfolio={p} />)}</div></td>
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
    // Chips: composite Active/Closed groups (Mark's request, mirrors
    // LeadList.jsx) + All + the 6 individual statuses + Today (date-derived).
    const chips = ['Active', 'Closed', 'All', 'Unassigned', 'Assigned', 'InProgress', 'ClosedWon', 'ClosedLost', 'ReturnedToLeads', 'Today'];
    return (
      <>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {chips.map(chip => {
            const isActive = statusFilter === chip;
            const meta = APPT_STATUS_META[chip];
            return (
              <button key={chip} onClick={() => setStatusFilter(chip)} style={{
                ...s.chip,
                ...(isActive && !meta ? s.chipActive : {}),
                ...(isActive && meta ? { background: meta.bg, color: meta.colour, borderColor: meta.border, fontWeight: 500 } : {}),
              }}>
                {meta?.label ?? chip}
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
            <button onClick={() => { setStatusFilter('Active'); setSearch(''); setSourceFilter(''); setPortfolioFilter(''); setBrokerFilter(''); }} style={s.ghostBtn}>
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
    const { freeRemaining, balance } = tokenLedger;
    const pct = monthlyAllocation > 0 ? Math.round((freeRemaining / monthlyAllocation) * 100) : 0;
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
              {freeRemaining} / {monthlyAllocation} free remaining
            </span>
          </div>
          {balance > 0 && (
            <div style={{ fontSize: '0.75rem', color:'var(--mut)', marginTop: '4px' }}>
              + {balance} paid token{balance === 1 ? '' : 's'} available
            </div>
          )}
          {freeRemaining === 0 && balance === 0 && (
            <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '4px' }}>
              Free allocation exhausted — additional claims cost tokens you don't currently have.
            </div>
          )}
          {freeRemaining === 0 && balance > 0 && (
            <div style={{ fontSize: '0.75rem', color: '#d97706', marginTop: '4px' }}>
              Free allocation exhausted — further claims will use your paid tokens.
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

      {apptLoading && (
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
              { key: 'mine',      label: 'My Appointments',    badge: myAppts.length },
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
                  { label: 'Total assigned',    value: myAppts.length, colour: 'var(--accent)' },
                  { label: 'Today',             value: todayCount, colour: '#d97706' },
                  { label: 'Closed Won',        value: closedWon, colour: '#15803d' },
                ].map(m => (
                  <div key={m.label} style={s.metricCard}>
                    <div style={{ fontSize: '0.688rem', color:'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{m.label}</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600, color: m.colour, lineHeight: 1 }}>{m.value}</div>
                  </div>
                ))}
              </div>
              <AppointmentsTable rows={myAppts} showBroker={false} />
              {claimedCount > 0 && (
                <div style={{ ...s.noticeSuccess, marginTop: '10px' }}>
                  ✓ {claimedCount} appointment{claimedCount !== 1 ? 's' : ''} claimed.
                </div>
              )}
            </>
          )}

          {activeTab === 'available' && (
            <>
              <div style={{ ...s.noticeWarn, marginBottom: '14px', display: 'flex', gap: '8px' }}>
                <span style={{ flexShrink: 0 }}>⚡</span>
                <span>
                  <strong>Claim model active.</strong> Appointments matched to your registered region(s) and portfolios.
                  {tokensEnabled ? ` ${tokenLedger.freeRemaining} of ${monthlyAllocation} free claims remaining this month.` : ' All claims are currently free.'}
                </span>
              </div>
              {claimError && <div style={{ ...s.errorBox, marginBottom: '14px' }}>{claimError}</div>}
              <TokenCard />
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color:'var(--ink)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Available to claim
                <span style={{ ...s.badge, background: 'color-mix(in srgb, #d97706 14%, var(--panel))', color: '#d97706', fontSize: '0.75rem' }}>{availCount} unassigned</span>
              </div>
              {availableLoading && (
                <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>Loading available appointments…</div>
              )}
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
                    {availableAppointments.map(a => (
                      <tr key={a.id} style={s.tr}
                        onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 6%, var(--panel))'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <td style={{ ...s.td, fontWeight: 500 }}>{a.leadName}</td>
                        <td style={{ ...s.td, fontSize: '0.8125rem' }}>{a.occupation}</td>
                        <td style={s.td}><div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>{a.portfolios.map(p => <PortfolioBadge key={p} portfolio={p} />)}</div></td>
                        <td style={{ ...s.td, fontWeight: 500 }}>{a.date}</td>
                        <td style={{ ...s.td, fontSize: '0.8125rem', color:'var(--mut)' }}>{a.region}</td>
                        <td style={{ ...s.td, fontSize: '0.75rem', color:'var(--mut)' }}>{a.source}</td>
                        <td style={s.td}>
                          <span style={{ ...s.badge, fontSize: '0.688rem', background: a.claimTokenCost === 0 ? 'color-mix(in srgb, #15803d 14%, var(--panel))' : 'color-mix(in srgb, #d97706 14%, var(--panel))', color: a.claimTokenCost === 0 ? '#15803d' : '#d97706' }}>
                            {a.claimTokenCost === 0 ? 'Free' : `${a.claimTokenCost} token${a.claimTokenCost === 1 ? '' : 's'}`}
                          </span>
                        </td>
                        <td style={s.td}>
                          <button style={s.primaryBtn} onClick={() => handleClaim(a.id)} disabled={claimingId === a.id}>
                            {claimingId === a.id ? 'Claiming…' : 'Claim'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {availCount === 0 && !availableLoading && (
                      <tr><td colSpan={8} style={{ textAlign: 'center', padding: '36px', color:'var(--mut)' }}>No available appointments right now.</td></tr>
                    )}
                  </tbody>
                </table>
                <div style={{ padding: '9px 14px', fontSize: '0.75rem', color:'var(--mut)', borderTop: '1px solid var(--line)', background:'var(--panel2)' }}>
                  Matched to your registered region(s) and portfolios.
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
          agents={realAgents}
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
