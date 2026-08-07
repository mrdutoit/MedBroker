/**
 * pages/AppAdmin.jsx
 * Application administration — Portfolios, Products, Medical Subscriptions.
 * These are the configurable reference data entities used throughout the app.
 */

import { useState, useEffect, Fragment } from 'react';
import { s } from '../styles/tokens.js';
import { useRole } from '../context/RoleContext.jsx';
import { useFlags } from '../context/FlagContext.jsx';
import { useFetch } from '../hooks/useFetch.js';
import { systemConfigApi, auditApi, usersApi, sarApi, leadsApi } from '../services/api.js';
import { formatDate } from '../utils/dateFormat.js';

// Mirrors auditHandlers.js's VALID_ENTITY_TYPES/VALID_ACTIONS exactly —
// kept in sync manually (no shared module between frontend/backend in
// this architecture). If a new action/entityType is ever added on the
// backend, add it here too or it just won't appear as a filter option
// (existing entries with that value still show up fine in the
// unfiltered view either way — this only affects the dropdown, not
// what data exists).
// §134 (6 Aug 2026) — backfilled TokenLedger/SystemConfig (entity types)
// and AppointmentClaimed/TokenManualTopUp/SystemConfigUpdated (actions) —
// all pre-existing since §117, never added here, same silent-empty-filter
// gap §127 already found and fixed once for SAR. Added this session's own
// new entries (IntegrationCredential, IntegrationCredentialUpdated,
// TokenStripeCredited) alongside them rather than repeating the mistake.
// See auditHandlers.js's matching comment.
const AUDIT_ENTITY_TYPES = [
  'Appointment', 'Lead', 'Event', 'EventAttendee', 'FeatureFlag', 'Task', 'User',
  'Portfolio', 'Product', 'SubjectAccessRequest', 'TokenLedger', 'SystemConfig',
  'IntegrationCredential',
];
const AUDIT_ACTIONS = [
  'AppointmentBrokerAssigned', 'AppointmentCreated', 'AppointmentOutcomeSaved',
  'AppointmentReassigned', 'AppointmentReturnedToLeads', 'AttendeeAdded',
  'AttendeeRemoved', 'EventCreated', 'EventStatusChanged', 'FeatureFlagUpdated',
  'LeadCreated', 'LeadDeleted', 'LeadReopened', 'LeadUpdated',
  'PortalAccountActivated', 'PortalProfileUpdated', 'PortalRegistration',
  'PortalWalkInCheckedIn', 'ProfileUpdated', 'TaskCreated', 'TaskDeleted', 'UserCreated',
  'SarRequestCreated', 'SarStatusChanged', 'SarDataExported', 'SarAssigned', 'UserUnlocked', 'UserSessionsRevoked',
  'PortfolioCreated', 'PortfolioStatusChanged', 'PortfolioDeleted',
  'ProductCreated', 'ProductStatusChanged', 'ProductDeleted',
  'AppointmentClaimed', 'TokenManualTopUp', 'SystemConfigUpdated',
  'IntegrationCredentialUpdated', 'TokenStripeCredited', 'TokenPaystackCredited',
];

// §128 (5 Aug 2026) — mirrors sarService.js's own STATUS_RANK exactly
// (server-side is the actual enforcement; this is purely for disabling
// buttons client-side so a backward click never gets as far as a 409).
// Fulfilled/Rejected share a rank deliberately — reaching either is what
// triggers the lock, they're not ordered against each other.
const SAR_STATUS_RANK = { Received: 0, InProgress: 1, Fulfilled: 2, Rejected: 2 };

/**
 * Today's date as YYYY-MM-DD in LOCAL time — for date input defaults.
 * FIXED 2 Aug 2026, same bug as PeriodSelector.jsx's referenceDateToParam:
 * new Date().toISOString().slice(0, 10) converts to UTC first, which
 * silently shows yesterday's date for a couple of hours after local
 * midnight for anyone east of UTC (South Africa is UTC+2). Building the
 * string from local accessors directly never touches UTC.
 */
function todayLocalDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Formats an AuditLog entry's changeDetail object into a short, readable
 * summary — e.g. {value: '1'} -> "value: Yes". FIXED 2 Aug 2026 (Mark
 * asked why enabling and disabling a flag looked identical in the log):
 * the Detail column only ever rendered entityRef, which for entity
 * types with no specific name resolver (FeatureFlag, Portfolio, Product,
 * Event, Task) falls back to a generic "EntityType: id" string — the
 * SAME string regardless of what actually changed. changeDetail already
 * carried the real answer (the backend has always parsed and returned
 * it), it just was never rendered anywhere. Generic across every action
 * type rather than one bespoke formatter per action — every mutating
 * endpoint in this codebase already writes changeDetail as a small,
 * flat object, so one formatter covers all of them.
 *
 * EXTENDED 3 Aug 2026 (§103) — Mark found raw UUIDs still showing here
 * (assignedToId on a TaskCreated entry) even though several write sites
 * DO resolve a name alongside the id (assignedToName, brokerName,
 * leadName, supervisorName, etc — see auditService.js callers). This
 * function just wasn't hiding the id once a matching name existed. Fix
 * is generic, not per-key: any key ending in "Id" is suppressed if a
 * sibling "<sameprefix>Name" key exists in the same object, since that
 * name is strictly more readable and the id adds nothing on screen (it's
 * still in the raw export for anyone who needs it — this only affects
 * the on-screen summary).
 */
function formatChangeDetail(changeDetail) {
  if (!changeDetail || typeof changeDetail !== 'object') return null;
  const keys = Object.keys(changeDetail);
  const suppressedIdKeys = new Set(
    keys.filter(k => k.endsWith('Id') && keys.includes(`${k.slice(0, -2)}Name`))
  );
  const parts = Object.entries(changeDetail)
    .filter(([k]) => !suppressedIdKeys.has(k))
    .map(([k, v]) => {
      let displayValue = v;
      if (v === '1' || v === true) displayValue = 'Yes';
      else if (v === '0' || v === false) displayValue = 'No';
      else if (v === null || v === undefined) displayValue = '—';
      return `${k}: ${displayValue}`;
    });
  return parts.join(', ');
}

export default function AppAdmin() {
  const [tab, setTab] = useState('portfolios');
  const { flag } = useFlags();
  const { refetchPortfolios: refetchSharedPortfolios } = useRole();

  // App Admin's own management fetch — includeInactive=true, unlike the
  // shared context data every other page reads via useRole(). Without
  // this, deactivating a portfolio/product would make it vanish from
  // this page too, and there'd be no way to reactivate it.
  const { data: portfolioData, refetch: refetchPortfolios } = useFetch(
    () => leadsApi.listPortfolios(true), []
  );
  const portfolios = portfolioData?.portfolios ?? [];

  // Both refetches run together on any change here — this page's own
  // (includeInactive) view, and the shared active-only one every other
  // open page reads, so a portfolio/product added or deactivated here
  // shows up correctly everywhere else immediately too.
  async function refetchBoth() {
    await Promise.all([refetchPortfolios(), refetchSharedPortfolios()]);
  }

  // Portfolio/Product creation (§91 — closing the gap Mark flagged:
  // these tabs looked functional but nothing behind the buttons ever
  // worked; the real Portfolio/Product tables already existed, they
  // just had no API surface).
  const [portShowCreate, setPortShowCreate] = useState(false);
  const [portNewName, setPortNewName] = useState('');
  const [portSaving, setPortSaving] = useState(false);
  const [portError, setPortError] = useState(null);

  const [prodShowCreateFor, setProdShowCreateFor] = useState(null); // portfolioId | null
  const [prodNewName, setProdNewName] = useState('');
  const [prodSaving, setProdSaving] = useState(false);
  const [prodError, setProdError] = useState(null);

  async function handleCreatePortfolio() {
    if (!portNewName.trim()) return;
    setPortSaving(true);
    setPortError(null);
    try {
      await leadsApi.createPortfolio(portNewName.trim());
      await refetchBoth();
      setPortShowCreate(false);
      setPortNewName('');
    } catch (err) {
      setPortError(err.message || 'Could not create portfolio');
    } finally {
      setPortSaving(false);
    }
  }

  async function handleCreateProduct(portfolioId) {
    if (!prodNewName.trim()) return;
    setProdSaving(true);
    setProdError(null);
    try {
      await leadsApi.createProduct(portfolioId, prodNewName.trim());
      await refetchBoth();
      setProdShowCreateFor(null);
      setProdNewName('');
    } catch (err) {
      setProdError(err.message || 'Could not create product');
    } finally {
      setProdSaving(false);
    }
  }

  async function handleTogglePortfolioActive(id, isActive) {
    setPortError(null);
    try {
      await leadsApi.updatePortfolio(id, isActive);
      await refetchBoth();
    } catch (err) {
      setPortError(err.message || 'Could not update portfolio');
    }
  }

  async function handleDeletePortfolio(id, name) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setPortError(null);
    try {
      await leadsApi.deletePortfolio(id);
      await refetchBoth();
    } catch (err) {
      // 409 (still linked to something) arrives with a specific, friendly
      // message from the backend — surfaced as-is, not replaced with a
      // generic one, since the whole point is telling the Admin exactly
      // what's still attached.
      setPortError(err.message || 'Could not delete portfolio');
    }
  }

  async function handleToggleProductActive(portfolioId, productId, isActive) {
    setProdError(null);
    try {
      await leadsApi.updateProduct(portfolioId, productId, isActive);
      await refetchBoth();
    } catch (err) {
      setProdError(err.message || 'Could not update product');
    }
  }

  async function handleDeleteProduct(portfolioId, productId, name) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setProdError(null);
    try {
      await leadsApi.deleteProduct(portfolioId, productId);
      await refetchBoth();
    } catch (err) {
      setProdError(err.message || 'Could not delete product');
    }
  }

  // System Settings state (§72 — real-wired to GET/PUT /api/system-config;
  // this whole tab was mock-only before, including password rotation/
  // lockout, which had real backend enforcement already but no way for
  // an Admin to actually configure it).
  const { data: config, loading: configLoading, refetch: refetchConfig } =
    useFetch(() => systemConfigApi.get(), []);

  const [monthlyTokens,      setMonthlyTokens]      = useState(10);
  const [autoReturnMonths,   setAutoReturnMonths]    = useState(6);
  const [maxCallAttempts,    setMaxCallAttempts]     = useState(3);
  const [rotationPreset,     setRotationPreset]      = useState('90');
  const [rotationCustom,     setRotationCustom]      = useState(90);
  const [lockoutAttempts,    setLockoutAttempts]     = useState(5);
  const [preventReuse,       setPreventReuse]        = useState(true);
  const [settingsSaved,      setSettingsSaved]       = useState(false);
  const [settingsError,      setSettingsError]       = useState(null);
  const [saving,             setSaving]              = useState(false);

  // Audit Log (§76) — real, paginated. Filters + export added (§77).
  const [auditPage, setAuditPage] = useState(1);
  const [auditDateFrom, setAuditDateFrom] = useState('');
  const [auditDateTo, setAuditDateTo] = useState('');
  const [auditEntityType, setAuditEntityType] = useState('');
  const [auditAction, setAuditAction] = useState('');
  const [auditPerformedById, setAuditPerformedById] = useState('');
  const [exporting, setExporting] = useState(null); // 'csv' | 'json' | null, drives button disabled state
  const [auditExportError, setAuditExportError] = useState(null);

  const auditFilters = {
    dateFrom: auditDateFrom || undefined,
    dateTo: auditDateTo || undefined,
    entityType: auditEntityType || undefined,
    action: auditAction || undefined,
    performedById: auditPerformedById || undefined,
  };
  // JSON.stringify as a dependency — the filters object above is a new
  // reference every render, which would make useFetch refire on every
  // render if used directly as a dep; stringifying gives a stable value
  // to compare against instead.
  const auditFiltersKey = JSON.stringify(auditFilters);

  const { data: auditData, loading: auditLoading, error: auditError } = useFetch(
    () => auditApi.list(auditPage, 25, auditFilters),
    [auditPage, auditFiltersKey]
  );
  const auditEntries = auditData?.entries ?? [];
  const auditTotal    = auditData?.total ?? 0;
  const auditTotalPages = Math.max(1, Math.ceil(auditTotal / 25));

  // Users list for the "Performed by" filter dropdown — reuses the same
  // endpoint UserAdmin.jsx already calls, no new backend needed.
  const { data: auditUsersData } = useFetch(() => usersApi.list({}), []);
  const auditUsers = auditUsersData?.users ?? [];

  // Data Requests (§79 — POPIA SAR) state
  const [sarPage, setSarPage] = useState(1);
  const [sarStatusFilter, setSarStatusFilter] = useState('');
  const [sarExpandedId, setSarExpandedId] = useState(null);
  const [sarShowCreate, setSarShowCreate] = useState(false);
  const [sarLeadSearch, setSarLeadSearch] = useState('');
  const [sarLeadResults, setSarLeadResults] = useState([]);
  const [sarSelectedLead, setSarSelectedLead] = useState(null);
  const [sarRequestorName, setSarRequestorName] = useState('');
  const [sarRequestorEmail, setSarRequestorEmail] = useState('');
  const [sarReceivedAt, setSarReceivedAt] = useState(todayLocalDateString);
  const [sarDueDate, setSarDueDate] = useState('');
  const [sarNotes, setSarNotes] = useState('');
  const [sarAssignedToId, setSarAssignedToId] = useState(''); // §128 — assign at creation time
  const [sarSaving, setSarSaving] = useState(false);
  const [sarError, setSarError] = useState(null);
  const [sarExporting, setSarExporting] = useState(null);
  // §125 — assignment, notes thread, per-SAR audit view.
  const [sarAdminUsers, setSarAdminUsers] = useState([]);
  const [sarComments, setSarComments] = useState({}); // { [sarId]: [...] }
  const [sarAuditEntries, setSarAuditEntries] = useState({}); // { [sarId]: [...] }
  const [sarDetailLoading, setSarDetailLoading] = useState(false);
  const [sarNewComment, setSarNewComment] = useState('');
  const [sarCommentSaving, setSarCommentSaving] = useState(false);
  const [sarAssigning, setSarAssigning] = useState(false);
  // §130 (5 Aug 2026) — Mark's request: selecting a new assignee used to
  // fire immediately on change, which is risky specifically because it
  // sends a notification to whoever gets picked — an accidental
  // selection doesn't just leave a wrong value sitting there, it pings a
  // real person. null means "no staged change, show the row's actual
  // current value"; a real (possibly empty-string, for "Unassigned")
  // value means a pick has been made but not yet saved.
  const [sarPendingAssignedToId, setSarPendingAssignedToId] = useState(null);

  // Medical Subscriptions (§80) — real.
  const [subsData, setSubsData] = useState(null);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsError, setSubsError] = useState(null);
  const [subsShowCreate, setSubsShowCreate] = useState(false);
  const [subsNewName, setSubsNewName] = useState('');
  const [subsNewProvider, setSubsNewProvider] = useState('');
  const [subsNewNotes, setSubsNewNotes] = useState('');
  const [subsSaving, setSubsSaving] = useState(false);

  async function refetchSubscriptions() {
    setSubsLoading(true);
    setSubsError(null);
    try {
      const result = await leadsApi.listSubscriptions();
      setSubsData(result.subscriptions ?? []);
    } catch (err) {
      setSubsError(err.message || 'Could not load subscriptions');
    } finally {
      setSubsLoading(false);
    }
  }
  useEffect(() => { refetchSubscriptions(); }, []);

  async function handleCreateSubscription() {
    if (!subsNewName.trim()) return;
    setSubsSaving(true);
    setSubsError(null);
    try {
      await leadsApi.createSubscription({
        name: subsNewName.trim(),
        providerName: subsNewProvider.trim() || undefined,
        notes: subsNewNotes.trim() || undefined,
      });
      await refetchSubscriptions();
      setSubsShowCreate(false);
      setSubsNewName(''); setSubsNewProvider(''); setSubsNewNotes('');
    } catch (err) {
      setSubsError(err.message || 'Could not create subscription');
    } finally {
      setSubsSaving(false);
    }
  }

  const { data: sarData, loading: sarLoading, refetch: refetchSar } = useFetch(
    () => sarApi.list(sarPage, 25, sarStatusFilter || undefined),
    [sarPage, sarStatusFilter]
  );
  const sarRequests = sarData?.requests ?? [];
  const sarTotal = sarData?.total ?? 0;
  const sarTotalPages = Math.max(1, Math.ceil(sarTotal / 25));

  async function handleSarLeadSearch() {
    if (!sarLeadSearch.trim()) { setSarLeadResults([]); return; }
    try {
      const result = await leadsApi.list({ search: sarLeadSearch.trim(), pageSize: 10 });
      setSarLeadResults(result.leads ?? []);
    } catch { setSarLeadResults([]); }
  }

  async function handleSarCreate() {
    if (!sarSelectedLead || !sarRequestorName.trim() || !sarRequestorEmail.trim() || !sarReceivedAt) return;
    setSarSaving(true);
    setSarError(null);
    try {
      await sarApi.create({
        leadId: sarSelectedLead.id,
        requestorName: sarRequestorName.trim(),
        requestorEmail: sarRequestorEmail.trim(),
        receivedAt: sarReceivedAt,
        dueDate: sarDueDate || undefined,
        notes: sarNotes || undefined,
        assignedToId: sarAssignedToId || undefined,
      });
      await refetchSar();
      setSarShowCreate(false);
      setSarSelectedLead(null); setSarLeadSearch(''); setSarLeadResults([]);
      setSarRequestorName(''); setSarRequestorEmail(''); setSarDueDate(''); setSarNotes('');
      setSarAssignedToId('');
      setSarReceivedAt(todayLocalDateString());
    } catch (err) {
      setSarError(err.message || 'Could not log the request');
    } finally {
      setSarSaving(false);
    }
  }

  async function handleSarStatusChange(id, status) {
    try {
      await sarApi.updateStatus(id, { status });
      await refetchSar();
      await refreshSarAuditIfExpanded(id);
    } catch (err) {
      setSarError(err.message || 'Could not update status');
    }
  }

  async function handleSarExport(id, format) {
    setSarExporting(`${id}-${format}`);
    setSarError(null);
    try {
      await sarApi.export(id, format);
      // §125 — export can auto-transition Received -> InProgress
      // server-side; refetch so the table reflects that without
      // requiring a manual reload.
      await refetchSar();
      await refreshSarAuditIfExpanded(id);
    } catch (err) {
      setSarError(err.message || 'Export failed');
    } finally {
      setSarExporting(null);
    }
  }

  // §128 (5 Aug 2026) — CORRECTED: this used to call
  // usersApi.list({ role: 'Admin' }) and usersApi.list({ role:
  // 'GlobalAdmin' }) and merge them — the GlobalAdmin call always failed
  // (CreatableRole, models/user.js, doesn't even accept 'GlobalAdmin' as
  // a valid role filter — a 400, not an empty result), which rejected
  // the whole Promise.all and silently discarded the working Admin
  // results too via the catch below. Mark's report ("dropdown only
  // shows Unassigned") was this exact bug. Fixed by using the dedicated
  // sarApi.assignableUsers() endpoint instead — see its own comment
  // (services/api.js) for why this needed a real new endpoint rather
  // than a parameter fix to the existing one.
  useEffect(() => {
    async function loadSarAdminUsers() {
      try {
        const result = await sarApi.assignableUsers();
        setSarAdminUsers(result.users ?? []);
      } catch {
        setSarAdminUsers([]);
      }
    }
    loadSarAdminUsers();
  }, []);

  // §125 — comments + per-SAR audit trail are fetched lazily, the first
  // time a row is expanded, and cached in sarComments/sarAuditEntries
  // keyed by id — re-expanding the same row later doesn't re-fetch.
  async function handleSarExpand(id) {
    const nextId = sarExpandedId === id ? null : id;
    setSarExpandedId(nextId);
    // §130 (5 Aug 2026) — clear any staged-but-unsaved assignee pick when
    // switching rows, so a pending selection on one request can never
    // leak into a different one that's just been expanded.
    setSarPendingAssignedToId(null);
    if (nextId && !sarComments[nextId]) {
      setSarDetailLoading(true);
      try {
        const [commentsRes, auditRes] = await Promise.all([
          sarApi.listComments(nextId),
          sarApi.auditLog(nextId),
        ]);
        setSarComments(prev => ({ ...prev, [nextId]: commentsRes.comments ?? [] }));
        setSarAuditEntries(prev => ({ ...prev, [nextId]: auditRes.entries ?? [] }));
      } catch (err) {
        setSarError(err.message || 'Could not load request details');
      } finally {
        setSarDetailLoading(false);
      }
    }
  }

  // §129 (5 Aug 2026) — CORRECTED: Mark found that changing "Assigned to"
  // didn't update the visible History for a request whose row was
  // already expanded — had to reload the page to see it. Real gap, not
  // a limitation: sarAuditEntries[id] is fetched exactly once, the
  // first time a row expands (the "if (nextId && !sarComments[nextId])"
  // guard just above), and nothing ever invalidated that cache
  // afterward. Assign, status-change, and export all correctly write
  // new audit entries server-side and refresh the TABLE row via
  // refetchSar() — none of them touched the cached audit trail for a
  // row that was already open. This is the fix: re-fetch and replace
  // just that one row's cached entries, but only if it's actually
  // expanded right now — no point fetching something nobody's looking at.
  async function refreshSarAuditIfExpanded(id) {
    if (sarExpandedId !== id) return;
    try {
      const auditRes = await sarApi.auditLog(id);
      setSarAuditEntries(prev => ({ ...prev, [id]: auditRes.entries ?? [] }));
    } catch {
      // Best-effort refresh — the action itself already succeeded by the
      // time this runs; a failed History refresh isn't worth surfacing
      // as its own error on top of that, same as export's toISOString
      // formatting not being worth its own separate warning elsewhere.
    }
  }

  // §125 — assignedToId may be '' (the "Unassigned" option) or a real
  // user id; sarApi.assign() takes null for "unassign", not ''.
  // §130 — now triggered by the Save button, not select's own onChange
  // (see sarPendingAssignedToId's own comment for why). Clears the
  // staged pick on success so the <select> falls back to showing the
  // row's real value again — refetchSar() just updated it to match.
  async function handleSarAssignConfirm(id, assignedToId) {
    setSarAssigning(true);
    setSarError(null);
    try {
      await sarApi.assign(id, assignedToId || null);
      await refetchSar();
      await refreshSarAuditIfExpanded(id);
      setSarPendingAssignedToId(null);
    } catch (err) {
      setSarError(err.message || 'Could not assign this request');
    } finally {
      setSarAssigning(false);
    }
  }

  async function handleSarAddComment(id) {
    if (!sarNewComment.trim()) return;
    setSarCommentSaving(true);
    setSarError(null);
    try {
      const created = await sarApi.addComment(id, sarNewComment.trim());
      setSarComments(prev => ({ ...prev, [id]: [...(prev[id] ?? []), created] }));
      setSarNewComment('');
    } catch (err) {
      setSarError(err.message || 'Could not add comment');
    } finally {
      setSarCommentSaving(false);
    }
  }

  function resetAuditPageOnFilterChange(setter) {
    return (value) => { setter(value); setAuditPage(1); };
  }

  async function handleAuditExport(format) {
    setExporting(format);
    setAuditExportError(null);
    try {
      await auditApi.export(format, auditFilters);
    } catch (err) {
      setAuditExportError(`Could not export the audit log: ${err.message || 'unknown error'}`);
    } finally {
      setExporting(null);
    }
  }

  // Sync local editable state once the real config actually loads —
  // can't initialise useState directly from it, since the fetch hasn't
  // resolved yet on first render.
  useEffect(() => {
    if (!config) return;
    setMonthlyTokens(config.brokerFreeAppointmentsPerMonth ?? 10);
    setAutoReturnMonths(config.leadAutoUnassignMonths ?? 6);
    setMaxCallAttempts(config.maxCallAttempts ?? 3);
    const days = config.passwordRotationDays ?? 90;
    if ([0, 30, 60, 90, 180].includes(days)) { setRotationPreset(String(days)); }
    else { setRotationPreset('custom'); setRotationCustom(days); }
    setLockoutAttempts(config.passwordLockoutAttempts ?? 5);
    setPreventReuse(config.passwordPreventReuse ?? true);
  }, [config]);

  async function saveSettings() {
    setSaving(true);
    setSettingsError(null);
    try {
      await systemConfigApi.update({
        brokerFreeAppointmentsPerMonth: monthlyTokens,
        leadAutoUnassignMonths:         autoReturnMonths,
        maxCallAttempts,
        passwordRotationDays:    rotationPreset === 'custom' ? rotationCustom : Number(rotationPreset),
        passwordLockoutAttempts: lockoutAttempts,
        passwordPreventReuse:    preventReuse,
      });
      await refetchConfig();
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (err) {
      setSettingsError(err.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.page}>
      <h1 style={{ margin: '0 0 18px', fontSize: '1.375rem', fontWeight: 600, color:'var(--ink)' }}>App Administration</h1>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: '20px' }}>
        {[['portfolios', 'Portfolios'], ['products', 'Products'], ['subscriptions', 'Medical Subscriptions'], ['settings', 'System Settings'], ['audit', 'Audit Log'],
          // §109 — Data Requests only shown when the flag that's supposed
          // to gate it is actually on. Before this it was unconditionally
          // visible to every Admin/GlobalAdmin regardless of the flag's
          // value (§103's finding) — same pattern as tasks.enabled gating
          // the Tasks nav item in App.jsx: frontend-only, not re-checked
          // server-side, since role (Admin/GlobalAdmin) is the real
          // security boundary here and that's already enforced in
          // sarHandlers.js. The flag is about whether this capability
          // exists for a given deployment at all, same as every other
          // feature flag in this app.
          ...(flag('popia.subjectAccessRequest.enabled') ? [['sar', 'Data Requests']] : [])].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '0.875rem', fontFamily: 'inherit',
              fontWeight: tab === key ? 600 : 400,
              color: tab === key ? 'var(--accent)' : 'var(--mut)',
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Portfolios */}
      {tab === 'portfolios' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ color:'var(--mut)', fontSize: '0.875rem', margin: 0 }}>
              Portfolios define the business unit a broker or agent operates under.
            </p>
            <button style={s.primaryBtn} onClick={() => setPortShowCreate(v => !v)}>
              {portShowCreate ? 'Cancel' : '+ Add Portfolio'}
            </button>
          </div>

          {portError && <div style={{ ...s.errorBox, marginBottom: '14px' }}>{portError}</div>}

          {portShowCreate && (
            <div style={{ ...s.card, marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <div style={{ ...s.formGroup, flex: 1, marginBottom: 0 }}>
                <label style={s.formLabel}>Portfolio name *</label>
                <input type="text" style={s.formInput} value={portNewName} onChange={e => setPortNewName(e.target.value)} placeholder="e.g. Corporate Cover" />
              </div>
              <button
                style={{ ...s.primaryBtn, opacity: (!portNewName.trim() || portSaving) ? 0.5 : 1 }}
                disabled={!portNewName.trim() || portSaving}
                onClick={handleCreatePortfolio}
              >
                {portSaving ? 'Saving…' : 'Add'}
              </button>
            </div>
          )}

          <div style={{ ...s.tableCard, overflowX: 'auto' }}>
            <table style={{ ...s.table, minWidth: '500px' }}>
              <thead><tr>
                <th style={s.th}>Portfolio name</th>
                <th style={s.th}>Products</th>
                <th style={s.th}>Status</th>
                <th style={s.th}></th>
              </tr></thead>
              <tbody>
                {portfolios.map(p => (
                  <tr key={p.id} style={{ ...s.tr, opacity: p.isActive ? 1 : 0.6 }}>
                    <td style={{ ...s.td, fontWeight: 500 }}>{p.name}</td>
                    <td style={{ ...s.td, color:'var(--mut)', fontSize: '0.8125rem' }}>
                      {p.products.length} product{p.products.length !== 1 ? 's' : ''}
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, background: p.isActive ? 'color-mix(in srgb, #15803d 14%, var(--panel))' : 'var(--panel2)', color: p.isActive ? '#15803d' : 'var(--mut)' }}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button style={s.linkBtn} onClick={() => handleTogglePortfolioActive(p.id, !p.isActive)}>
                          {p.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button style={{ ...s.linkBtn, color: '#dc2626' }} onClick={() => handleDeletePortfolio(p.id, p.name)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {portfolios.length === 0 && (
                  <tr><td colSpan={4} style={{ ...s.td, textAlign: 'center', color:'var(--mut)' }}>No portfolios yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Products */}
      {tab === 'products' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ color:'var(--mut)', fontSize: '0.875rem', margin: 0 }}>
              Products belong to a portfolio and are selectable as products sold on an appointment.
            </p>
            <select
              style={{ ...s.formInput, width: '220px', padding: '6px 10px', fontSize: '0.8125rem' }}
              value={prodShowCreateFor ?? ''}
              onChange={e => { setProdShowCreateFor(e.target.value || null); setProdNewName(''); setProdError(null); }}
              disabled={portfolios.every(p => !p.isActive)}
            >
              <option value="">+ Add Product to…</option>
              {portfolios.filter(p => p.isActive).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {prodError && <div style={{ ...s.errorBox, marginBottom: '14px' }}>{prodError}</div>}

          {prodShowCreateFor && (
            <div style={{ ...s.card, marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <div style={{ ...s.formGroup, flex: 1, marginBottom: 0 }}>
                <label style={s.formLabel}>
                  Product name — added to {portfolios.find(p => p.id === prodShowCreateFor)?.name} *
                </label>
                <input type="text" style={s.formInput} value={prodNewName} onChange={e => setProdNewName(e.target.value)} placeholder="e.g. Funeral Cover" />
              </div>
              <button
                style={{ ...s.primaryBtn, opacity: (!prodNewName.trim() || prodSaving) ? 0.5 : 1 }}
                disabled={!prodNewName.trim() || prodSaving}
                onClick={() => handleCreateProduct(prodShowCreateFor)}
              >
                {prodSaving ? 'Saving…' : 'Add'}
              </button>
              <button
                style={s.ghostBtn}
                disabled={prodSaving}
                onClick={() => { setProdShowCreateFor(null); setProdNewName(''); setProdError(null); }}
              >
                Cancel
              </button>
            </div>
          )}

          <div style={{ ...s.tableCard, overflowX: 'auto' }}>
            <table style={{ ...s.table, minWidth: '500px' }}>
              <thead><tr>
                <th style={s.th}>Product name</th>
                <th style={s.th}>Portfolio</th>
                <th style={s.th}>Status</th>
                <th style={s.th}></th>
              </tr></thead>
              <tbody>
                {portfolios.flatMap(p => p.products.map(prod => (
                  <tr key={prod.id} style={{ ...s.tr, opacity: prod.isActive ? 1 : 0.6 }}>
                    <td style={{ ...s.td, fontWeight: 500 }}>{prod.name}</td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, fontSize: '0.688rem',
                        background: p.name === 'Discovery' ? 'color-mix(in srgb, #1d4ed8 14%, var(--panel))' : 'color-mix(in srgb, #7c3aed 14%, var(--panel))',
                        color:      p.name === 'Discovery' ? 'var(--accent)' : '#a78bfa',
                      }}>
                        {p.name === 'Money and Medicine' ? 'M&M' : p.name}
                      </span>
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, background: prod.isActive ? 'color-mix(in srgb, #15803d 14%, var(--panel))' : 'var(--panel2)', color: prod.isActive ? '#15803d' : 'var(--mut)' }}>
                        {prod.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button style={s.linkBtn} onClick={() => handleToggleProductActive(p.id, prod.id, !prod.isActive)}>
                          {prod.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button style={{ ...s.linkBtn, color: '#dc2626' }} onClick={() => handleDeleteProduct(p.id, prod.id, prod.name)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )))}
                {portfolios.every(p => p.products.length === 0) && (
                  <tr><td colSpan={4} style={{ ...s.td, textAlign: 'center', color:'var(--mut)' }}>No products yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Subscriptions (§80 — real) */}
      {tab === 'subscriptions' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ color:'var(--mut)', fontSize: '0.875rem', margin: 0 }}>
              Medical lead subscriptions. When importing, select a subscription and it becomes the source for
              every lead imported against it — see Lead Import's "Medical Subscription" tab.
            </p>
            <button style={s.primaryBtn} onClick={() => setSubsShowCreate(v => !v)}>
              {subsShowCreate ? 'Cancel' : '+ Add Subscription'}
            </button>
          </div>

          {subsError && <div style={{ ...s.errorBox, marginBottom: '14px' }}>{subsError}</div>}

          {subsShowCreate && (
            <div style={{ ...s.card, marginBottom: '16px' }}>
              <div style={s.cardTitle}>New Medical Subscription</div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ ...s.formGroup, flex: 1 }}>
                  <label style={s.formLabel}>Name *</label>
                  <input type="text" style={s.formInput} value={subsNewName} onChange={e => setSubsNewName(e.target.value)} placeholder="e.g. MedLeads SA — Monthly Bundle" />
                </div>
                <div style={{ ...s.formGroup, flex: 1 }}>
                  <label style={s.formLabel}>Provider</label>
                  <input type="text" style={s.formInput} value={subsNewProvider} onChange={e => setSubsNewProvider(e.target.value)} />
                </div>
              </div>
              <div style={s.formGroup}>
                <label style={s.formLabel}>Notes</label>
                <textarea style={{ ...s.formInput, minHeight: '50px' }} value={subsNewNotes} onChange={e => setSubsNewNotes(e.target.value)} />
              </div>
              <button
                style={{ ...s.primaryBtn, opacity: (!subsNewName.trim() || subsSaving) ? 0.5 : 1 }}
                disabled={!subsNewName.trim() || subsSaving}
                onClick={handleCreateSubscription}
              >
                {subsSaving ? 'Saving…' : 'Add Subscription'}
              </button>
            </div>
          )}

          {subsLoading && <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>Loading subscriptions…</div>}

          <div style={{ ...s.tableCard, overflowX: 'auto' }}>
            <table style={{ ...s.table, minWidth: '600px' }}>
              <thead><tr>
                <th style={s.th}>Subscription name</th>
                <th style={s.th}>Provider</th>
                <th style={s.th}>Leads imported</th>
                <th style={s.th}>Last import</th>
                <th style={s.th}>Status</th>
              </tr></thead>
              <tbody>
                {(subsData ?? []).map(sub => (
                  <tr key={sub.id} style={s.tr} onMouseEnter={e => e.currentTarget.style.background='color-mix(in srgb, var(--accent) 6%, var(--panel))'} onMouseLeave={e => e.currentTarget.style.background=""}>
                    <td style={{ ...s.td, fontWeight: 500 }}>{sub.name}</td>
                    <td style={{ ...s.td, color:'var(--mut)', fontSize: '0.8125rem' }}>{sub.providerName || '—'}</td>
                    <td style={s.td}>{sub.leadsImported}</td>
                    <td style={{ ...s.td, color:'var(--mut)', fontSize: '0.8125rem' }}>
                      {sub.lastImportAt ? new Date(sub.lastImportAt).toLocaleDateString('en-ZA') : 'Never'}
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.badge,
                        background: sub.isActive ? 'color-mix(in srgb, #15803d 14%, var(--panel))' : 'color-mix(in srgb, #d97706 14%, var(--panel))',
                        color:      sub.isActive ? '#15803d' : '#d97706',
                      }}>
                        {sub.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
                {!subsLoading && (subsData ?? []).length === 0 && (
                  <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color:'var(--mut)' }}>No subscriptions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* System Settings */}
      {tab === 'settings' && (
        <div style={{ maxWidth: '600px' }}>
          <p style={{ color:'var(--mut)', fontSize: '0.875rem', marginBottom: '20px' }}>
            System-wide configuration values. Changes take effect immediately without a deployment.
          </p>

          {configLoading && (
            <div style={{ ...s.noticeInfo, marginBottom: '16px' }}>Loading current settings…</div>
          )}

          {settingsError && (
            <div style={{
              ...s.errorBox,
              // §123 (4 Aug 2026) — CORRECTED: this used to render inline
              // at the top of a long, scrollable settings form, right
              // above Save Settings (which sits at the bottom, well
              // below the fold). Mark's finding: by the time you scroll
              // down to click Save, any feedback at the top is already
              // scrolled out of view — a save looked like it silently did
              // nothing, success or failure. Fixed positioning puts this
              // in the viewport regardless of scroll position, so it's
              // actually seen right after clicking the button that
              // triggered it. Same fix applied to the success banner
              // below — same bug, same cause, both needed it even though
              // Mark only reported the success case.
              position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000,
              maxWidth: '360px', margin: 0, boxShadow: '0 8px 24px -8px rgba(0,0,0,0.35)',
            }}>
              {settingsError}
            </div>
          )}

          {settingsSaved && (
            <div style={{
              ...s.noticeSuccess,
              position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000,
              maxWidth: '360px', margin: 0, boxShadow: '0 8px 24px -8px rgba(0,0,0,0.35)',
            }}>
              ✓ Settings saved successfully.
            </div>
          )}

          {flag('appointments.claimModel', 'claim') && (
            <div style={s.card}>
              <div style={s.cardTitle}>Broker Token Allocation</div>
              <div style={{ ...s.noticeInfo, marginBottom: '14px', fontSize: '0.8125rem' }}>
                Controls how many free appointment claims each broker receives per calendar month.
                Once exhausted, additional claims require tokens. Tokens can be purchased by
                the broker or topped up manually by an administrator.
              </div>
              <div style={s.formGroup}>
                <label style={s.formLabel}>
                  Free appointments per broker per month *
                  <span style={{ marginLeft: '8px', fontSize: '0.75rem', color:'var(--mut)', fontWeight: 400 }}>
                    (stored in SystemConfig.brokerFreeAppointmentsPerMonth)
                  </span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="number" min={1} max={100}
                    value={monthlyTokens}
                    onChange={e => setMonthlyTokens(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                    style={{ ...s.formInput, width: '100px' }}
                  />
                  <span style={{ fontSize: '0.875rem', color:'var(--mut)' }}>per month</span>
                </div>
                <div style={s.formHint}>
                  Recommended: 10. Applies to all brokers. Individual overrides are not currently supported.
                </div>
              </div>
            </div>
          )}

          {flag('leads.autoUnassign.enabled') && (
            <div style={s.card}>
              <div style={s.cardTitle}>Lead Auto-Return</div>
              <div style={{ ...s.noticeInfo, marginBottom: '14px', fontSize: '0.8125rem' }}>
                Appointments that have not been closed (no signed outcome) after this period
                are automatically returned to the Unassigned leads queue by a scheduled daily job.
                The lead can then be worked by an agent and a new appointment booked with the prospect.
              </div>
              <div style={s.formGroup}>
                <label style={s.formLabel}>
                  Return to queue after *
                  <span style={{ marginLeft: '8px', fontSize: '0.75rem', color:'var(--mut)', fontWeight: 400 }}>
                    (stored in SystemConfig.leadAutoUnassignMonths)
                  </span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="number" min={1} max={24}
                    value={autoReturnMonths}
                    onChange={e => setAutoReturnMonths(Math.max(1, Math.min(24, parseInt(e.target.value) || 6)))}
                    style={{ ...s.formInput, width: '100px' }}
                  />
                  <span style={{ fontSize: '0.875rem', color:'var(--mut)' }}>months without closure</span>
                </div>
                <div style={s.formHint}>
                  Default: 6 months. The auto-return job runs daily at 07:00.
                  Manually returning an appointment to the queue is also available from the Appointment Detail page.
                </div>
              </div>
            </div>
          )}

          <div style={s.card}>
            <div style={s.cardTitle}>Agent Call Settings</div>
            <div style={s.formGroup}>
              <label style={s.formLabel}>
                Maximum call attempts before lead is marked Uncontactable *
                <span style={{ marginLeft: '8px', fontSize: '0.75rem', color:'var(--mut)', fontWeight: 400 }}>
                  (stored in SystemConfig.maxCallAttempts)
                </span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="number" min={1} max={20}
                  value={maxCallAttempts}
                  onChange={e => setMaxCallAttempts(Math.max(1, Math.min(20, parseInt(e.target.value) || 3)))}
                  style={{ ...s.formInput, width: '100px' }}
                />
                <span style={{ fontSize: '0.875rem', color:'var(--mut)' }}>attempts</span>
              </div>
              <div style={s.formHint}>Default: 3 attempts.</div>
            </div>
          </div>

          {/* Password Policy (§72) — SystemConfig.passwordRotationDays /
              passwordLockoutAttempts already existed and were already
              enforced at login (rotation forces a change past the
              configured age; lockout locks the account after this many
              failed attempts) — this card is what was actually missing:
              a way for an Admin to configure either one, at all. */}
          <div style={s.card}>
            <div style={s.cardTitle}>Password Policy</div>
            <div style={{ ...s.noticeInfo, marginBottom: '14px', fontSize: '0.8125rem' }}>
              Applies to local email/password accounts. Manually created users are always
              required to set their own password on first login, regardless of these settings.
            </div>

            <div style={s.formGroup}>
              <label style={s.formLabel}>
                Password rotation
                <span style={{ marginLeft: '8px', fontSize: '0.75rem', color:'var(--mut)', fontWeight: 400 }}>
                  (stored in SystemConfig.passwordRotationDays)
                </span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <select
                  value={rotationPreset}
                  onChange={e => setRotationPreset(e.target.value)}
                  style={{ ...s.formInput, width: '160px' }}
                >
                  <option value="0">Never expires</option>
                  <option value="30">Every 30 days</option>
                  <option value="60">Every 60 days</option>
                  <option value="90">Every 90 days</option>
                  <option value="180">Every 180 days</option>
                  <option value="custom">Custom…</option>
                </select>
                {rotationPreset === 'custom' && (
                  <>
                    <input
                      type="number" min={1} max={3650}
                      value={rotationCustom}
                      onChange={e => setRotationCustom(Math.max(1, Math.min(3650, parseInt(e.target.value) || 90)))}
                      style={{ ...s.formInput, width: '100px' }}
                    />
                    <span style={{ fontSize: '0.875rem', color:'var(--mut)' }}>days</span>
                  </>
                )}
              </div>
              <div style={s.formHint}>
                A user is prompted to set a new password the next time they log in after this many
                days. "Never expires" disables the check entirely.
              </div>
            </div>

            <div style={s.formGroup}>
              <label style={s.formLabel}>
                Account lockout
                <span style={{ marginLeft: '8px', fontSize: '0.75rem', color:'var(--mut)', fontWeight: 400 }}>
                  (stored in SystemConfig.passwordLockoutAttempts)
                </span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="number" min={1} max={100}
                  value={lockoutAttempts}
                  onChange={e => setLockoutAttempts(Math.max(1, Math.min(100, parseInt(e.target.value) || 5)))}
                  style={{ ...s.formInput, width: '100px' }}
                />
                <span style={{ fontSize: '0.875rem', color:'var(--mut)' }}>failed attempts</span>
              </div>
              <div style={s.formHint}>Default: 5 attempts. A locked account needs an Admin to unlock it.</div>
            </div>

            <div style={s.formGroup}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', color:'var(--ink)', cursor: 'pointer' }}>
                <input type="checkbox" checked={preventReuse} onChange={e => setPreventReuse(e.target.checked)} />
                Prevent reusing a password from the current calendar year
              </label>
              <div style={s.formHint}>
                (stored in SystemConfig.passwordPreventReuse) — a user cannot set a new password
                that matches any password they've used since 1 January this year.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button style={s.primaryBtn} onClick={saveSettings}>Save Settings</button>
          </div>
        </div>
      )}
      {/* Audit Log */}
      {tab === 'audit' && (
        <>
          <div style={{ marginBottom: '12px' }}>
            <p style={{ color:'var(--mut)', fontSize: '0.875rem', margin: '0 0 6px' }}>
              Immutable record of significant system actions for FAIS Act and POPIA compliance.
              Entries are written by the system and cannot be edited or deleted.
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end', marginBottom: '14px' }}>
            <div>
              <label style={{ ...s.formLabel, fontSize: '0.75rem' }}>From</label>
              <input type="date" style={{ ...s.formInput, padding: '6px 8px', fontSize: '0.8125rem' }}
                value={auditDateFrom} onChange={e => resetAuditPageOnFilterChange(setAuditDateFrom)(e.target.value)} />
            </div>
            <div>
              <label style={{ ...s.formLabel, fontSize: '0.75rem' }}>To</label>
              <input type="date" style={{ ...s.formInput, padding: '6px 8px', fontSize: '0.8125rem' }}
                value={auditDateTo} onChange={e => resetAuditPageOnFilterChange(setAuditDateTo)(e.target.value)} />
            </div>
            <div>
              <label style={{ ...s.formLabel, fontSize: '0.75rem' }}>Entity</label>
              <select style={{ ...s.formInput, padding: '6px 8px', fontSize: '0.8125rem' }}
                value={auditEntityType} onChange={e => resetAuditPageOnFilterChange(setAuditEntityType)(e.target.value)}>
                <option value="">All</option>
                {AUDIT_ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ ...s.formLabel, fontSize: '0.75rem' }}>Action</label>
              <select style={{ ...s.formInput, padding: '6px 8px', fontSize: '0.8125rem' }}
                value={auditAction} onChange={e => resetAuditPageOnFilterChange(setAuditAction)(e.target.value)}>
                <option value="">All</option>
                {AUDIT_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label style={{ ...s.formLabel, fontSize: '0.75rem' }}>Performed by</label>
              <select style={{ ...s.formInput, padding: '6px 8px', fontSize: '0.8125rem', maxWidth: '180px' }}
                value={auditPerformedById} onChange={e => resetAuditPageOnFilterChange(setAuditPerformedById)(e.target.value)}>
                <option value="">All</option>
                {auditUsers.map(u => <option key={u.id} value={u.id}>{u.displayName}</option>)}
              </select>
            </div>
            {(auditDateFrom || auditDateTo || auditEntityType || auditAction || auditPerformedById) && (
              <button
                style={{ ...s.ghostBtn, fontSize: '0.8125rem' }}
                onClick={() => { setAuditDateFrom(''); setAuditDateTo(''); setAuditEntityType(''); setAuditAction(''); setAuditPerformedById(''); setAuditPage(1); }}
              >
                Clear filters
              </button>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <button style={{ ...s.secondaryBtn, fontSize: '0.8125rem', opacity: exporting ? 0.5 : 1 }}
                disabled={!!exporting} onClick={() => handleAuditExport('csv')}>
                {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
              </button>
              <button style={{ ...s.secondaryBtn, fontSize: '0.8125rem', opacity: exporting ? 0.5 : 1 }}
                disabled={!!exporting} onClick={() => handleAuditExport('json')}>
                {exporting === 'json' ? 'Exporting…' : 'Export JSON'}
              </button>
            </div>
          </div>

          {auditLoading && (
            <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>Loading audit log…</div>
          )}
          {auditError && (
            <div style={{ ...s.errorBox, marginBottom: '14px' }}>Could not load the audit log.</div>
          )}
          {auditExportError && (
            <div style={{ ...s.errorBox, marginBottom: '14px' }}>{auditExportError}</div>
          )}

          <div style={{ ...s.tableCard, overflowX: 'auto' }}>
            <table style={{ ...s.table, minWidth: '760px' }}>
              <thead><tr>
                <th style={s.th}>Timestamp</th>
                <th style={s.th}>Action</th>
                <th style={s.th}>Entity</th>
                <th style={s.th}>Detail</th>
                <th style={s.th}>Performed by</th>
              </tr></thead>
              <tbody>
                {auditEntries.map(entry => (
                  <tr key={entry.id} style={s.tr}
                    onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 6%, var(--panel))'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ ...s.td, color:'var(--mut)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                      {new Date(entry.performedAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td style={{ ...s.td, fontWeight: 500, fontSize: '0.8125rem' }}>{entry.action}</td>
                    <td style={s.td}>
                      <span style={{
                        ...s.badge, fontSize: '0.688rem',
                        background:'var(--panel2)', color:'var(--ink)',
                      }}>
                        {entry.entityType}
                      </span>
                    </td>
                    <td style={{ ...s.td, color:'var(--mut)', fontSize: '0.8125rem', maxWidth: '260px' }}>
                      <div>{entry.entityRef}</div>
                      {formatChangeDetail(entry.changeDetail) && (
                        <div style={{ fontSize: '0.75rem', color:'var(--mut)', opacity: 0.8, marginTop: '2px' }}>
                          {formatChangeDetail(entry.changeDetail)}
                        </div>
                      )}
                    </td>
                    <td style={{ ...s.td, fontSize: '0.8125rem' }}>
                      {entry.performedByName}
                    </td>
                  </tr>
                ))}
                {!auditLoading && auditEntries.length === 0 && (
                  <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color:'var(--mut)' }}>No audit log entries yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {auditTotalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '14px' }}>
              <button
                style={{ ...s.secondaryBtn, opacity: auditPage <= 1 ? 0.5 : 1 }}
                disabled={auditPage <= 1}
                onClick={() => setAuditPage(p => Math.max(1, p - 1))}
              >
                ← Previous
              </button>
              <span style={{ fontSize: '0.8125rem', color:'var(--mut)' }}>Page {auditPage} of {auditTotalPages}</span>
              <button
                style={{ ...s.secondaryBtn, opacity: auditPage >= auditTotalPages ? 0.5 : 1 }}
                disabled={auditPage >= auditTotalPages}
                onClick={() => setAuditPage(p => Math.min(auditTotalPages, p + 1))}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Data Requests — POPIA Subject Access Requests (§79) */}
      {tab === 'sar' && flag('popia.subjectAccessRequest.enabled') && (
        <div style={{ maxWidth: '900px' }}>
          <p style={{ color:'var(--mut)', fontSize: '0.875rem', margin: '0 0 14px' }}>
            Track and fulfil POPIA Subject Access Requests — a data subject's right to see what
            personal information MedBroker holds about them. Every request is tied to a Lead record;
            fulfilling one compiles everything held about that lead into a downloadable export.
          </p>

          {sarError && <div style={{ ...s.errorBox, marginBottom: '14px' }}>{sarError}</div>}

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
            <select
              value={sarStatusFilter}
              onChange={e => { setSarStatusFilter(e.target.value); setSarPage(1); }}
              style={{ ...s.formInput, width: '160px', padding: '6px 8px', fontSize: '0.8125rem' }}
            >
              <option value="">All statuses</option>
              <option value="Received">Received</option>
              <option value="InProgress">In Progress</option>
              <option value="Fulfilled">Fulfilled</option>
              <option value="Rejected">Rejected</option>
            </select>
            <button style={{ ...s.primaryBtn, marginLeft: 'auto' }} onClick={() => setSarShowCreate(v => !v)}>
              {sarShowCreate ? 'Cancel' : '+ Log New Request'}
            </button>
          </div>

          {sarShowCreate && (
            <div style={{ ...s.card, marginBottom: '16px' }}>
              <div style={s.cardTitle}>Log a Subject Access Request</div>

              <div style={s.formGroup}>
                <label style={s.formLabel}>Find the Lead this request is about *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text" style={{ ...s.formInput, flex: 1 }}
                    placeholder="Search by name or email…"
                    value={sarLeadSearch}
                    onChange={e => setSarLeadSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSarLeadSearch(); }}
                  />
                  <button style={s.secondaryBtn} onClick={handleSarLeadSearch}>Search</button>
                </div>
                {sarSelectedLead && (
                  <div style={{ ...s.noticeSuccess, marginTop: '8px', fontSize: '0.8125rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Selected: {[sarSelectedLead.title, sarSelectedLead.firstName, sarSelectedLead.lastName].filter(Boolean).join(' ')} ({sarSelectedLead.email})</span>
                    <button
                      type="button"
                      onClick={() => setSarSelectedLead(null)}
                      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline', padding: 0 }}
                    >
                      Change
                    </button>
                  </div>
                )}
                {/* §127 — Mark's request: select from a dropdown, not a
                    custom clickable list. Search still narrows by name/
                    email first (unchanged) — the results just render as
                    a real <select> now, rather than each result needing
                    its own click handler. Narrowing via search first
                    also keeps the dropdown a manageable size rather than
                    listing every Lead in the organisation. */}
                {sarLeadResults.length > 0 && !sarSelectedLead && (
                  <select
                    value=""
                    onChange={e => {
                      const lead = sarLeadResults.find(l => l.id === e.target.value);
                      if (lead) { setSarSelectedLead(lead); setSarLeadResults([]); setSarLeadSearch(''); }
                    }}
                    style={{ ...s.formInput, marginTop: '8px' }}
                  >
                    <option value="" disabled>Select from {sarLeadResults.length} match{sarLeadResults.length === 1 ? '' : 'es'}…</option>
                    {sarLeadResults.map(l => (
                      <option key={l.id} value={l.id}>
                        {[l.title, l.firstName, l.lastName].filter(Boolean).join(' ')} — {l.email}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ ...s.formGroup, flex: 1 }}>
                  <label style={s.formLabel}>Requestor name *</label>
                  <input type="text" style={s.formInput} value={sarRequestorName} onChange={e => setSarRequestorName(e.target.value)} />
                </div>
                <div style={{ ...s.formGroup, flex: 1 }}>
                  <label style={s.formLabel}>Requestor email *</label>
                  <input type="email" style={s.formInput} value={sarRequestorEmail} onChange={e => setSarRequestorEmail(e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ ...s.formGroup, flex: 1 }}>
                  <label style={s.formLabel}>Date received *</label>
                  <input type="date" style={s.formInput} value={sarReceivedAt} onChange={e => setSarReceivedAt(e.target.value)} />
                </div>
                <div style={{ ...s.formGroup, flex: 1 }}>
                  <label style={s.formLabel}>Target due date</label>
                  <input type="date" style={s.formInput} value={sarDueDate} onChange={e => setSarDueDate(e.target.value)} />
                </div>
              </div>

              <div style={s.formGroup}>
                <label style={s.formLabel}>Notes</label>
                <textarea style={{ ...s.formInput, minHeight: '60px' }} value={sarNotes} onChange={e => setSarNotes(e.target.value)} />
              </div>

              {/* §128 — assign at creation time, not only afterward
                  (Mark's own request). Same pool as the after-the-fact
                  assign control — Admin + GlobalAdmin, sarAdminUsers. */}
              <div style={s.formGroup}>
                <label style={s.formLabel}>Assign to (optional)</label>
                <select
                  value={sarAssignedToId}
                  onChange={e => setSarAssignedToId(e.target.value)}
                  style={s.formInput}
                >
                  <option value="">Unassigned</option>
                  {sarAdminUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.displayName}</option>
                  ))}
                </select>
              </div>

              <button
                style={{ ...s.primaryBtn, opacity: (!sarSelectedLead || !sarRequestorName.trim() || !sarRequestorEmail.trim() || sarSaving) ? 0.5 : 1 }}
                disabled={!sarSelectedLead || !sarRequestorName.trim() || !sarRequestorEmail.trim() || sarSaving}
                onClick={handleSarCreate}
              >
                {sarSaving ? 'Saving…' : 'Log Request'}
              </button>
            </div>
          )}

          {sarLoading && <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>Loading requests…</div>}

          <div style={{ ...s.tableCard, overflowX: 'auto' }}>
            <table style={{ ...s.table, minWidth: '760px' }}>
              <thead><tr>
                <th style={s.th}>Received</th>
                <th style={s.th}>Lead</th>
                <th style={s.th}>Requestor</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Assigned</th>
                <th style={s.th}>Due</th>
                <th style={s.th}></th>
              </tr></thead>
              <tbody>
                {sarRequests.map(r => {
                  // §125 — once Fulfilled or Rejected, the backend
                  // rejects any further status/assignment/comment change
                  // (sarService.assertNotLocked) — this mirrors that
                  // exact rule client-side purely for disabling controls;
                  // the server-side check is what actually enforces it.
                  const sarLocked = r.status === 'Fulfilled' || r.status === 'Rejected';
                  return (
                  <Fragment key={r.id}>
                    <tr style={{ ...s.tr, cursor: 'pointer' }} onClick={() => handleSarExpand(r.id)}>
                      <td style={s.td}>{formatDate(r.receivedAt)}</td>
                      <td style={s.td}>{r.leadName}</td>
                      <td style={s.td}>{r.requestorName}</td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, fontSize: '0.688rem', background:'var(--panel2)' }}>{r.status}</span>
                        {sarLocked && <span style={{ marginLeft: '6px', fontSize: '0.688rem', color:'var(--mut)' }}>🔒</span>}
                      </td>
                      <td style={{ ...s.td, fontSize: '0.8125rem', color: r.assignedToName ? 'var(--ink)' : 'var(--mut)' }}>
                        {r.assignedToName || 'Unassigned'}
                      </td>
                      <td style={{ ...s.td, color:'var(--mut)' }}>{formatDate(r.dueDate)}</td>
                      <td style={s.td}>{sarExpandedId === r.id ? '▲' : '▼'}</td>
                    </tr>
                    {sarExpandedId === r.id && (
                      <tr><td colSpan={7} style={{ ...s.td, background: 'var(--panel2)' }}>
                        {r.notes && <p style={{ fontSize: '0.8125rem', margin: '0 0 10px' }}>{r.notes}</p>}

                        {sarLocked && (
                          <div style={{ ...s.noticeWarn, fontSize: '0.8125rem', marginBottom: '12px' }}>
                            🔒 This request is {r.status.toLowerCase()} and locked — status, assignment, and notes
                            can no longer be changed. Exports remain available below.
                          </div>
                        )}

                        {/* Assignment — §125, GlobalAdmin+Admin users only */}
                        <div style={{ marginBottom: '12px' }}>
                          <span style={{ fontSize: '0.75rem', color:'var(--mut)', marginRight: '8px' }}>Assigned to:</span>
                          {/* §130 (5 Aug 2026) — CORRECTED: used to fire
                              sarApi.assign() straight from onChange.
                              Assignment sends a notification to whoever
                              gets picked, so an accidental selection
                              wasn't just a wrong value sitting there —
                              it pinged a real person. Selecting now only
                              stages sarPendingAssignedToId; nothing calls
                              the API until Save is clicked. */}
                          <select
                            value={sarPendingAssignedToId !== null ? sarPendingAssignedToId : (r.assignedToId ?? '')}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setSarPendingAssignedToId(e.target.value)}
                            disabled={sarLocked || sarAssigning}
                            style={{ ...s.formInput, width: '220px', display: 'inline-block', padding: '5px 8px', fontSize: '0.8125rem' }}
                          >
                            <option value="">Unassigned</option>
                            {sarAdminUsers.map(u => (
                              <option key={u.id} value={u.id}>{u.displayName}</option>
                            ))}
                          </select>
                          {sarPendingAssignedToId !== null && sarPendingAssignedToId !== (r.assignedToId ?? '') && (
                            <>
                              <button
                                style={{ ...s.primaryBtn, fontSize: '0.75rem', padding: '4px 10px', marginLeft: '8px' }}
                                disabled={sarAssigning}
                                onClick={e => { e.stopPropagation(); handleSarAssignConfirm(r.id, sarPendingAssignedToId); }}
                              >
                                {sarAssigning ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                style={{ ...s.secondaryBtn, fontSize: '0.75rem', padding: '4px 10px', marginLeft: '4px' }}
                                disabled={sarAssigning}
                                onClick={e => { e.stopPropagation(); setSarPendingAssignedToId(null); }}
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
                          <span style={{ fontSize: '0.75rem', color:'var(--mut)' }}>Status:</span>
                          {['Received', 'InProgress', 'Fulfilled', 'Rejected'].map(s2 => {
                            // §128 — Mark's rule: status only moves
                            // forward. A button whose rank isn't
                            // strictly greater than the current status
                            // is disabled — covers both "backward"
                            // (InProgress -> Received) and "re-click the
                            // current one, pointless either way" in one
                            // check, same rank comparison the server
                            // itself enforces (sarService.updateSarStatus).
                            const isBackward = SAR_STATUS_RANK[s2] <= SAR_STATUS_RANK[r.status];
                            return (
                            <button
                              key={s2}
                              onClick={e => { e.stopPropagation(); handleSarStatusChange(r.id, s2); }}
                              disabled={sarLocked || isBackward}
                              title={isBackward && !sarLocked ? 'Status can only move forward' : undefined}
                              style={{
                                ...s.secondaryBtn, fontSize: '0.75rem', padding: '4px 10px',
                                opacity: (sarLocked || isBackward) ? 0.5 : 1,
                                ...(r.status === s2 ? { background: 'var(--accent)', color: '#fff' } : {}),
                              }}
                            >
                              {s2}
                            </button>
                            );
                          })}
                          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                            <button
                              style={{ ...s.secondaryBtn, fontSize: '0.75rem', opacity: sarExporting ? 0.5 : 1 }}
                              disabled={!!sarExporting}
                              onClick={e => { e.stopPropagation(); handleSarExport(r.id, 'json'); }}
                            >
                              {sarExporting === `${r.id}-json` ? '…' : 'Export JSON'}
                            </button>
                            <button
                              style={{ ...s.secondaryBtn, fontSize: '0.75rem', opacity: sarExporting ? 0.5 : 1 }}
                              disabled={!!sarExporting}
                              onClick={e => { e.stopPropagation(); handleSarExport(r.id, 'csv'); }}
                            >
                              {sarExporting === `${r.id}-csv` ? '…' : 'Export CSV'}
                            </button>
                          </div>
                        </div>

                        {sarDetailLoading && !sarComments[r.id] && (
                          <div style={{ fontSize: '0.8125rem', color:'var(--mut)', marginBottom: '12px' }}>Loading notes and history…</div>
                        )}

                        {/* Notes thread — §125, mirrors Tasks' own comment thread */}
                        <div style={{ marginBottom: '14px' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color:'var(--ink)', marginBottom: '6px' }}>Notes</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                            {(sarComments[r.id] ?? []).map(c => (
                              <div key={c.id} style={{ fontSize: '0.8125rem', background:'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px', padding: '8px 10px' }}>
                                <div style={{ color:'var(--mut)', fontSize: '0.6875rem', marginBottom: '2px' }}>
                                  {c.authorName ?? c.author} · {new Date(c.createdAt).toLocaleString('en-ZA')}
                                </div>
                                {c.body}
                              </div>
                            ))}
                            {sarComments[r.id]?.length === 0 && (
                              <div style={{ fontSize: '0.75rem', color:'var(--mut)' }}>No notes yet.</div>
                            )}
                          </div>
                          {!sarLocked && (
                            <div style={{ display: 'flex', gap: '8px' }} onClick={e => e.stopPropagation()}>
                              <input
                                type="text" style={{ ...s.formInput, flex: 1, fontSize: '0.8125rem' }}
                                placeholder="Add a note…"
                                value={sarNewComment}
                                onChange={e => setSarNewComment(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleSarAddComment(r.id); }}
                              />
                              <button
                                style={{ ...s.secondaryBtn, fontSize: '0.75rem', opacity: (sarCommentSaving || !sarNewComment.trim()) ? 0.5 : 1 }}
                                disabled={sarCommentSaving || !sarNewComment.trim()}
                                onClick={() => handleSarAddComment(r.id)}
                              >
                                {sarCommentSaving ? '…' : 'Add'}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Per-request audit trail — §125, distinct from
                            App Admin's own global Audit Log tab (that one
                            shows every action across the whole app; this
                            shows just this SAR's own history). */}
                        <div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color:'var(--ink)', marginBottom: '6px' }}>History</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {(sarAuditEntries[r.id] ?? []).map((entry, i) => (
                              <div key={i} style={{ fontSize: '0.75rem', color:'var(--mut)' }}>
                                <strong style={{ color:'var(--ink)' }}>{entry.action}</strong>
                                {' — '}{entry.performedByName ?? entry.performedBy ?? 'System'}
                                {', '}{new Date(entry.performedAt).toLocaleString('en-ZA')}
                                {entry.changeDetail && (
                                  <span> ({formatChangeDetail(entry.changeDetail)})</span>
                                )}
                              </div>
                            ))}
                            {sarAuditEntries[r.id]?.length === 0 && (
                              <div style={{ fontSize: '0.75rem', color:'var(--mut)' }}>No history yet.</div>
                            )}
                          </div>
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                  );
                })}
                {!sarLoading && sarRequests.length === 0 && (
                  <tr><td colSpan={7} style={{ ...s.td, textAlign: 'center', color:'var(--mut)' }}>No requests logged yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {sarTotalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '14px' }}>
              <button style={{ ...s.secondaryBtn, opacity: sarPage <= 1 ? 0.5 : 1 }} disabled={sarPage <= 1} onClick={() => setSarPage(p => Math.max(1, p - 1))}>← Previous</button>
              <span style={{ fontSize: '0.8125rem', color:'var(--mut)' }}>Page {sarPage} of {sarTotalPages}</span>
              <button style={{ ...s.secondaryBtn, opacity: sarPage >= sarTotalPages ? 0.5 : 1 }} disabled={sarPage >= sarTotalPages} onClick={() => setSarPage(p => Math.min(sarTotalPages, p + 1))}>Next →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
