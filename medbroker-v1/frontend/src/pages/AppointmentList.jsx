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
 *   appointments.tokens.paymentProvider 'none' | 'stripe' | 'paystack'
 *
 * WORKFLOW RULES:
 *   - An Appointment always has an Agent (set at booking time from Lead Detail).
 *     The Agent field is read-only on the Assign Broker modal.
 *   - In CLAIM model: Assign and Reassign buttons are hidden — brokers self-serve
 *     via the Available to Claim tab.
 *   - In ASSIGN model: Admin/Supervisor can assign a broker to Unassigned appointments
 *     and reassign the broker on already-assigned ones.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useRole } from '../context/RoleContext.jsx';
import { useFlags } from '../context/FlagContext.jsx';
import { appointmentsApi, usersApi, ApiError } from '../services/api.js';
import { useFetch } from '../hooks/useFetch.js';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { s, APPT_STATUS_META, MEETING_STATUS_META, MEETING_STATUS_LABELS, PORTFOLIO_META } from '../styles/tokens.js';
import { formatDate } from '../utils/dateFormat.js';

const PORTFOLIOS = ['Discovery', 'M&M'];

// ─── Badge helpers ─────────────────────────────────────────────────────────────
function MeetingBadge({ status }) {
  if (!status) return <span style={{ color:'var(--mut)', fontSize: '0.75rem' }}>—</span>;
  const meta = MEETING_STATUS_META[status] ?? { colour: 'var(--mut)', bg: 'var(--panel2)' };
  return <span style={{ ...s.badge, background: meta.bg, color: meta.colour, fontSize: '0.688rem' }}>{MEETING_STATUS_LABELS[status] ?? status}</span>;
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
// §134 (6 Aug 2026) — REWIRED to a real Stripe Checkout redirect. Was a
// Phase-2 mockup (setTimeout + "Phase 2 — payment not yet active"); the
// three packs shown here are unchanged from that mockup — pricing is now
// also enforced server-side from the exact same values (tokenPacks.js,
// shared by both providers), so this list is display-only, not the
// source of truth. §135 (7 Aug 2026) — EXTENDED to Paystack; this
// component doesn't need to know or care which provider is actually
// active, since /tokens/checkout (appointmentsApi.tokens.checkout)
// already dispatches server-side and just returns a URL either way.
// handlePurchase() redirects the whole browser tab to that provider's
// hosted payment page (window.location.href = url) — this component
// never touches card details or either provider's secret key.
function BuyTokensModal({ onClose, paymentProvider }) {
  const PACKS = [
    { tokens: 5,  price: 'R250',  label: '5 tokens' },
    { tokens: 10, price: 'R450',  label: '10 tokens — save R50' },
    { tokens: 20, price: 'R800',  label: '20 tokens — save R200' },
  ];
  const [selected, setSelected] = useState(1);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState('');

  async function handlePurchase() {
    setPurchasing(true);
    setError('');
    try {
      const { url } = await appointmentsApi.tokens.checkout(selected);
      window.location.href = url; // full-page redirect to the active provider's hosted payment page (Stripe or Paystack)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start checkout — please try again.');
      setPurchasing(false);
    }
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
            your token balance.
          </div>
        ) : (
          <>
            <p style={{ fontSize: '0.8125rem', color:'var(--mut)', marginBottom: '14px' }}>
              Select a token pack. You will be redirected to a secure payment page.
            </p>
            {error && <div style={{ ...s.errorBox, marginBottom: '14px', fontSize: '0.8125rem' }}>{error}</div>}
            {PACKS.map((pack, i) => (
              <label key={i} style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                border: `1px solid ${selected === i ? 'var(--accent)' : 'var(--line)'}`,
                borderRadius: '6px', marginBottom: '8px', cursor: 'pointer',
                background: selected === i ? 'color-mix(in srgb, var(--accent) 10%, var(--panel))' : 'var(--panel)',
              }}>
                <input type="radio" name="token-pack" checked={selected === i}
                  onChange={() => setSelected(i)} style={{ accentColor: 'var(--accent)' }} disabled={purchasing} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{pack.label}</div>
                </div>
                <span style={{ fontWeight: 600 }}>{pack.price}</span>
              </label>
            ))}
          </>
        )}

        <div style={s.modalFooter}>
          <button style={s.ghostBtn} onClick={onClose} disabled={purchasing}>Close</button>
          {paymentProvider !== 'none' && (
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
  // 16 Aug 2026 — lifted up from inside AppointmentsTable (where it used
  // to live as its own local state) so the Clear button in FiltersBar can
  // reset it too — a sibling component can't reach another component's
  // local state. Both AppointmentsTable render sites (claim-model "mine"
  // tab, and the assign-model/other-roles path) are mutually exclusive —
  // never both mounted at once — so one shared piece of state at this
  // level is safe, not a case of two tables silently fighting over it.
  const [sortKey,        setSortKey]        = useState(null);
  const [sortDir,        setSortDir]        = useState('asc');
  function toggleSort(key) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }
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
  // pageSize explicit as of 16 Aug 2026 — REAL BUG: this used to call
  // appointmentsApi.list({}) with no pageSize at all, which silently
  // defaulted to 25 server-side (AppointmentListQuerySchema,
  // models/appointment.js) while every filter/sort/KPI count below
  // operates on the result as if it already held every appointment.
  // Past 25 total, anything further was invisible with no indication
  // — no pagination UI on this page to reach it. pageSize: 2000 matches
  // the schema's own raised cap; see that schema's comment for why 2000
  // and not genuine pagination.
  const { data: apptData, loading: apptLoading, refetch: refetchAppts } = useFetch(
    () => appointmentsApi.list({ pageSize: 2000 }), []
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

  // §134 — Stripe redirects back to /appointments?stripe=success|cancel
  // (createCheckoutSession's success_url/cancel_url, stripeService.js).
  // §135 (7 Aug 2026) — Paystack redirects back to
  // /appointments?paystack=success (createTransaction's callback_url,
  // paystackService.js) — Paystack only has one callback URL, not a
  // separate success/cancel pair the way Stripe does, so a broker who
  // abandons the Paystack payment page just never returns here at all,
  // there's no "cancel" state to detect on this end for that provider.
  // Either way, the webhook (not this redirect) is what actually credits
  // the tokens — both providers' own guidance is explicit that a
  // success/callback redirect is reached the instant payment succeeds
  // client-side, which can arrive at this page BEFORE the webhook has
  // been delivered and processed server-side. So this banner is
  // deliberately worded as "payment received, tokens on the way" rather
  // than claiming the balance is already updated, and refetchTokens()
  // below is a best-effort immediate check, not the source of truth for
  // whether the credit landed — the broker's balance will reflect it
  // within moments regardless of whether this refetch catches it before
  // or after the webhook lands.
  const [paymentReturn, setPaymentReturn] = useState(null); // 'success' | 'cancel' | null
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const result = searchParams.get('stripe') ?? searchParams.get('paystack');
    if (result === 'success' || result === 'cancel') {
      setPaymentReturn(result);
      if (result === 'success') refetchTokens();
      // Clear whichever query param is present so a page refresh doesn't
      // re-show the banner.
      const next = new URLSearchParams(searchParams);
      next.delete('stripe');
      next.delete('paystack');
      setSearchParams(next, { replace: true });
    }
  }, []);

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
    // 24 Aug 2026 — the 'Today' branch's own `new Date(…).toDateString()`
    // comparison is left exactly as-is (see this file's own `today` const
    // a few lines up) — MedBroker's whole user base is SAST (UTC+2, always
    // ahead of UTC), so that comparison is safe for real usage even though
    // it constructs a Date object; not touching a mechanism that isn't
    // actually broken for anyone using this app today. Only the non-Today
    // branch's FORMAT changed — was toLocaleDateString('en-ZA', {day,
    // month, year}), same visual shape as the new standard already, but
    // switched to formatDate() anyway for the same DATE-only/timezone
    // safety reasoning as every other call site in this sweep (dateFormat.
    // js's own header comment).
    firstDate:   a.firstAppointmentDate
                   ? `${new Date(a.firstAppointmentDate).toDateString() === today ? 'Today' : formatDate(a.firstAppointmentDate)} · ${(a.firstAppointmentTime ?? '').slice(0, 5)}`
                   : '—',
    // 14 Aug 2026 — Mark's request: sortable columns. firstDate above is
    // already a pretty display string ("Today · 09:00" / "15 Aug 2026 ·
    // 09:00") — sorting THAT alphabetically would be wrong (e.g. "1 Jan
    // 2027" sorts before "15 Aug 2026" as text even though it's later
    // chronologically; "Today" sorts nowhere sensible at all). Kept as
    // its own separate field specifically so the sort comparator has a
    // real, comparable value while the <td> keeps showing the friendly
    // string unchanged.
    firstDateRaw: a.firstAppointmentDate ?? null,
    isToday:     a.firstAppointmentDate ? new Date(a.firstAppointmentDate).toDateString() === today : false,
    // 16 Aug 2026 — Mark's request: "date of first meeting doesn't really
    // tell me when the Lead was created." Same firstDate/firstDateRaw
    // split above, same reason — leadCreatedAt is the friendly display
    // string, leadCreatedAtRaw is what the sort comparator actually
    // compares. Backend addition: leadCreatedAt now joined through from
    // Lead.createdAt in APPOINTMENT_SELECT (appointmentService.js) —
    // wasn't fetched by this query at all before.
    // 24 Aug 2026 — leadCreatedAt is Lead.createdAt, a genuine TIMESTAMPTZ
    // (confirmed against schema.postgres.sql), not a DATE-only column —
    // left on toLocaleDateString() deliberately, not an oversight: it
    // already renders the exact same visual shape as the new 'd MMM yyyy'
    // standard (day/month/year, short month), and a real timestamp needs
    // timezone-aware conversion, which formatDate() deliberately does NOT
    // do (see dateFormat.js's own header comment) — formatDate() would be
    // the wrong tool here, not a stricter one.
    leadCreatedAt:    a.leadCreatedAt ? new Date(a.leadCreatedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
    leadCreatedAtRaw: a.leadCreatedAt ?? null,
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
    // 24 Aug 2026 — same treatment as firstDate above (this file's own
    // Active Appointments mapping) — see that comment for the full
    // reasoning.
    date:           a.firstAppointmentDate
                      ? `${new Date(a.firstAppointmentDate).toDateString() === today ? 'Today' : formatDate(a.firstAppointmentDate)} · ${(a.firstAppointmentTime ?? '').slice(0, 5)}`
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

  // §140b, 12 Aug 2026 — 'Claimed' was missing here, meaning a freshly
  // claimed appointment (the most active state there is — a broker owns
  // it and hasn't started the meeting process yet) disappeared from the
  // Active tab entirely until its first meeting moved it to InProgress.
  // ReturnedToLeads deliberately stays excluded — it already has its own
  // dedicated filter chip, same as ClosedWon/ClosedLost.
  const ACTIVE_APPT_STATUSES = ['Unassigned', 'Assigned', 'Claimed', 'InProgress'];
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
  const hasFilter  = statusFilter !== 'Active' || search || sourceFilter || portfolioFilter || brokerFilter || !!sortKey;
  // 16 Aug 2026 — the other half of the pageSize fix above: if the org
  // ever genuinely has more appointments than the 2000 cap requests,
  // this makes that fact visible instead of silently truncating again
  // the way the old default-25 behaviour did. Should never fire in
  // practice for a single brokerage; if it ever does, that's the actual
  // signal real pagination is now warranted.
  const truncated = apptData ? apptData.total > (apptData.appointments?.length ?? 0) : false;

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

    // 14 Aug 2026 — Mark's request: "I cannot sort the list of
    // Appointments from oldest to newest (or in any other way either)."
    // Matches Reports.jsx's own DataTable click-header/toggle-direction/
    // ↑↓-indicator convention, kept separate from that component rather
    // than reused — this table's cells are hand-written JSX (portfolio
    // pills, status badges, a broker-claim action link), not the
    // generic columns+render shape DataTable expects, so lifting this
    // into that shared component would have meant a larger rewrite of
    // working table markup for a single-page feature. 1st/2nd mtg stay
    // non-sortable — categorical, no meaningful single ranking to click
    // into.
    // Portfolio added 16 Aug 2026 — genuinely multi-value (an appointment
    // can carry more than one), so there's no single true sort position.
    // Sorts by the FIRST portfolio alphabetically — a stable, useful
    // ordering rather than pretending a multi-value field has one
    // correct answer; ['Discovery'] sorts before ['M&M'], and
    // ['Discovery','M&M'] sorts the same as ['Discovery'] alone.
    const SORT_VALUE = {
      leadName:   r => r.leadName ?? '',
      portfolio:  r => (r.portfolios && r.portfolios.length > 0 ? [...r.portfolios].sort()[0] : ''),
      source:     r => r.source ?? '',
      status:     r => r.status ?? '',
      firstDate:  r => r.firstDateRaw ?? '',
      // 16 Aug 2026 — see the parent-level createdAtRaw comment in the
      // realAppointments mapping above: sorts on the underlying Lead's
      // own createdAt, distinct from firstDate (the meeting date), same
      // reasoning as that field's own comment on why firstDateRaw exists
      // as a separate sort value from the pretty display string.
      createdAt:  r => r.leadCreatedAtRaw ?? '',
      agentName:  r => r.agentName ?? '',
      signed:     r => r.signed ?? '',
      brokerName: r => r.brokerName ?? '',
    };
    // 16 Aug 2026 — sortKey/sortDir/toggleSort lifted to the parent
    // (AppointmentList) so FiltersBar's Clear button can reset sort too;
    // this component no longer owns that state itself.
    function AppointmentsTable({ rows, showBroker = true }) {
      function thProps(key) {
        const sortable = !!SORT_VALUE[key];
        return {
          onClick: sortable ? () => toggleSort(key) : undefined,
          style: { ...s.th, cursor: sortable ? 'pointer' : 'default', userSelect: 'none' },
        };
      }
      const sortedRows = sortKey
        ? [...rows].sort((a, b) => {
            const av = SORT_VALUE[sortKey](a), bv = SORT_VALUE[sortKey](b);
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return sortDir === 'asc' ? cmp : -cmp;
          })
        : rows;

      return (
        <div style={{ ...s.tableCard, overflowX: 'auto' }}>
          <table style={{ ...s.table, minWidth: '860px' }}>
          <thead>
            <tr>
              <th {...thProps('leadName')}>Lead{sortKey === 'leadName' && (sortDir === 'asc' ? ' ↑' : ' ↓')}</th>
              <th {...thProps('portfolio')}>Portfolio{sortKey === 'portfolio' && (sortDir === 'asc' ? ' ↑' : ' ↓')}</th>
              <th {...thProps('source')}>Source{sortKey === 'source' && (sortDir === 'asc' ? ' ↑' : ' ↓')}</th>
              <th {...thProps('status')}>Status{sortKey === 'status' && (sortDir === 'asc' ? ' ↑' : ' ↓')}</th>
              <th {...thProps('firstDate')}>First appt{sortKey === 'firstDate' && (sortDir === 'asc' ? ' ↑' : ' ↓')}</th>
              {/* 16 Aug 2026 — Mark's request: nothing on this page showed
                  when the LEAD was created, only the first meeting's own
                  date, which "doesn't really tell me when the Lead was
                  created" — his own words. leadCreatedAt/leadCreatedAtRaw
                  added to the realAppointments mapping above. */}
              <th {...thProps('createdAt')}>Created{sortKey === 'createdAt' && (sortDir === 'asc' ? ' ↑' : ' ↓')}</th>
              <th {...thProps('agentName')}>Agent{sortKey === 'agentName' && (sortDir === 'asc' ? ' ↑' : ' ↓')}</th>
              <th style={s.th}>1st mtg</th>
              <th style={s.th}>2nd mtg</th>
              <th {...thProps('signed')}>Signed?{sortKey === 'signed' && (sortDir === 'asc' ? ' ↑' : ' ↓')}</th>
              {showBroker && !isBroker && <th {...thProps('brokerName')}>Broker{sortKey === 'brokerName' && (sortDir === 'asc' ? ' ↑' : ' ↓')}</th>}
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={13} style={{ textAlign: 'center', padding: '40px', color:'var(--mut)' }}>
                  No appointments match your current filters.
                </td>
              </tr>
            )}
            {sortedRows.map(a => {
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
                  <td style={{ ...s.td, fontSize: '0.75rem', color:'var(--mut)' }}>
                    {a.leadCreatedAt}
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
            <button onClick={() => { setStatusFilter('Active'); setSearch(''); setSourceFilter(''); setPortfolioFilter(''); setBrokerFilter(''); setSortKey(null); setSortDir('asc'); }} style={s.ghostBtn}>
              ✕ Clear Sort & Filters
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
      <>
        {paymentReturn === 'success' && (
          <div style={{ ...s.noticeSuccess, marginBottom: '14px' }}>
            ✓ Payment received — your tokens will appear on your balance below shortly.
          </div>
        )}
        {paymentReturn === 'cancel' && (
          <div style={{ ...s.noticeWarn, marginBottom: '14px' }}>
            Checkout was cancelled — no payment was made.
          </div>
        )}
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
      </>
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
      {truncated && (
        <div style={{ ...s.noticeWarn, marginBottom: '14px' }}>
          Showing {apptData.appointments.length} of {apptData.total} appointments — this list has grown past what
          loads in one request. Let Mark know so this page can get real pagination.
        </div>
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
              {/* §119 — this tab previously had no filtering at all,
                  unlike every other view in this file: FiltersBar wasn't
                  rendered here, and the table read straight from myAppts
                  (broker-scoped only) instead of filtered (broker-scoped
                  + statusFilter + search + source + portfolio), so a
                  claim-model Broker had no way to hide Closed appointments
                  from their own list — every other role, and even a
                  Broker under the assign model, already had this. Metric
                  cards above deliberately keep reading myAppts, not
                  filtered — they're meant to show true totals regardless
                  of the current filter selection, matching the same
                  convention the non-claim-tab metric cards below already use. */}
              <FiltersBar />
              <AppointmentsTable rows={filtered} showBroker={false} />
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
