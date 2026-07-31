/**
 * pages/AppAdmin.jsx
 * Application administration — Portfolios, Products, Medical Subscriptions.
 * These are the configurable reference data entities used throughout the app.
 */

import { useState, useEffect } from 'react';
import { s } from '../styles/tokens.js';
import { PORTFOLIOS, PRODUCTS_BY_PORTFOLIO } from '../context/RoleContext.jsx';
import { useFlags } from '../context/FlagContext.jsx';
import { useFetch } from '../hooks/useFetch.js';
import { apiMode, systemConfigApi, auditApi, usersApi } from '../services/api.js';

// Mirrors auditHandlers.js's VALID_ENTITY_TYPES/VALID_ACTIONS exactly —
// kept in sync manually (no shared module between frontend/backend in
// this architecture). If a new action/entityType is ever added on the
// backend, add it here too or it just won't appear as a filter option
// (existing entries with that value still show up fine in the
// unfiltered view either way — this only affects the dropdown, not
// what data exists).
const AUDIT_ENTITY_TYPES = ['Appointment', 'Lead', 'Event', 'EventAttendee', 'FeatureFlag', 'Task', 'User'];
const AUDIT_ACTIONS = [
  'AppointmentBrokerAssigned', 'AppointmentCreated', 'AppointmentOutcomeSaved',
  'AppointmentReassigned', 'AppointmentReturnedToLeads', 'AttendeeAdded',
  'AttendeeRemoved', 'EventCreated', 'EventStatusChanged', 'FeatureFlagUpdated',
  'LeadCreated', 'LeadDeleted', 'LeadReopened', 'LeadUpdated',
  'PortalAccountActivated', 'PortalProfileUpdated', 'PortalRegistration',
  'PortalWalkInCheckedIn', 'ProfileUpdated', 'TaskCreated', 'TaskDeleted', 'UserCreated',
];

const MOCK_AUDIT_LOG = [
  { id: 1, action: 'Lead assigned',             entity: 'Lead',        entityRef: 'Dr Priya Naidoo',     performedBy: 'Admin User',   role: 'Admin',       timestamp: '2026-05-20 14:32' },
  { id: 2, action: 'Broker reassigned',          entity: 'Appointment', entityRef: 'Dr Sipho Dlamini',    performedBy: 'Admin User',   role: 'Admin',       timestamp: '2026-05-20 13:15' },
  { id: 3, action: 'Appointment returned to queue', entity: 'Appointment', entityRef: 'Dr Amara Osei',    performedBy: 'Supervisor One', role: 'Supervisor', timestamp: '2026-05-20 11:04' },
  { id: 4, action: 'Feature flag updated',       entity: 'FeatureFlag', entityRef: 'tasks.enabled → true', performedBy: 'Global Administrator', role: 'GlobalAdmin', timestamp: '2026-05-20 10:47' },
  { id: 5, action: 'User created',               entity: 'User',        entityRef: 'Riaan Botha (Broker)', performedBy: 'Admin User',  role: 'Admin',       timestamp: '2026-05-19 16:22' },
  { id: 6, action: 'System settings updated',    entity: 'SystemConfig', entityRef: 'brokerFreeAppointmentsPerMonth: 10 → 12', performedBy: 'Admin User', role: 'Admin', timestamp: '2026-05-19 15:08' },
  { id: 7, action: 'Lead auto-returned to queue', entity: 'Lead',       entityRef: 'Dr Ruan de Beer',     performedBy: 'System',       role: 'System',      timestamp: '2026-05-19 07:00' },
  { id: 8, action: 'Appointment outcome saved',  entity: 'Appointment', entityRef: 'Dr Lerato Mokoena — ClosedWon', performedBy: 'Sandra van der Berg', role: 'Broker', timestamp: '2026-05-18 16:45' },
  { id: 9, action: 'Lead imported (batch)',      entity: 'LeadImportBatch', entityRef: 'SA Medical Register — Q2 2026 (42 records)', performedBy: 'Admin User', role: 'Admin', timestamp: '2026-05-15 09:30' },
  { id: 10, action: 'Call outcome logged',       entity: 'CallAttempt', entityRef: 'Dr Zanele Dube — CallbackRequested', performedBy: 'Thabo Molefe', role: 'Agent', timestamp: '2026-05-14 11:22' },
];

const MOCK_SUBSCRIPTIONS = [
  { name: 'MedLeads SA — Monthly Bundle',   provider: 'MedLeads SA (Pty) Ltd',  imported: 342, lastImport: '1 May 2026',  status: 'Active' },
  { name: 'Healthwise Doctor Database',     provider: 'Healthwise Data',         imported: 187, lastImport: '15 Apr 2026', status: 'Active' },
  { name: 'SA Medical Register — Q2 2026', provider: 'HPCSA Data Services',      imported: 0,   lastImport: 'Never',       status: 'Pending' },
];

const ALL_PRODUCTS = [
  ...PRODUCTS_BY_PORTFOLIO.disc.map((name, i) => ({ name, portfolio: 'Discovery',          sold: [23,18,14,9,6,11,16,8,12,5][i] ?? 0, status: 'Active' })),
  ...PRODUCTS_BY_PORTFOLIO.mm.map((name, i)   => ({ name, portfolio: 'Money and Medicine', sold: [4,3,2][i] ?? 0,                      status: 'Active' })),
];

export default function AppAdmin() {
  const [tab, setTab] = useState('portfolios');
  const { flag } = useFlags();
  const demoMode = apiMode.DEMO_MODE;

  // System Settings state (§72 — real-wired to GET/PUT /api/system-config
  // in demo mode; this whole tab was mock-only before, including
  // password rotation/lockout, which had real backend enforcement
  // already but no way for an Admin to actually configure it).
  const { data: config, loading: configLoading, refetch: refetchConfig } =
    useFetch(() => demoMode ? systemConfigApi.get() : Promise.resolve(null), [demoMode]);

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
  // demoMode-gated like everything else with a real backend;
  // MOCK_AUDIT_LOG below is the Entra-branch fallback only, not shown
  // when a real fetch is possible.
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
    () => demoMode ? auditApi.list(auditPage, 25, auditFilters) : Promise.resolve(null),
    [demoMode, auditPage, auditFiltersKey]
  );
  const auditEntries = demoMode ? (auditData?.entries ?? []) : MOCK_AUDIT_LOG;
  const auditTotal    = demoMode ? (auditData?.total ?? 0) : MOCK_AUDIT_LOG.length;
  const auditTotalPages = Math.max(1, Math.ceil(auditTotal / 25));

  // Users list for the "Performed by" filter dropdown — reuses the same
  // endpoint UserAdmin.jsx already calls, no new backend needed.
  const { data: auditUsersData } = useFetch(() => demoMode ? usersApi.list({}) : Promise.resolve(null), [demoMode]);
  const auditUsers = auditUsersData?.users ?? [];

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
    if (!demoMode) {
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
      return;
    }
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
        {[['portfolios', 'Portfolios'], ['products', 'Products'], ['subscriptions', 'Medical Subscriptions'], ['settings', 'System Settings'], ['audit', 'Audit Log']].map(([key, label]) => (
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
            <button style={s.primaryBtn}>+ Add Portfolio</button>
          </div>
          <div style={{ ...s.tableCard, overflowX: 'auto' }}>
            <table style={{ ...s.table, minWidth: '600px' }}>
              <thead><tr>
                <th style={s.th}>Portfolio name</th>
                <th style={s.th}>Brokers assigned</th>
                <th style={s.th}>Agents assigned</th>
                <th style={s.th}>Active leads</th>
                <th style={s.th}>Status</th>
                <th style={s.th}></th>
              </tr></thead>
              <tbody>
                <tr style={s.tr} onMouseEnter={e => e.currentTarget.style.background='color-mix(in srgb, var(--accent) 6%, var(--panel))'} onMouseLeave={e => e.currentTarget.style.background=""}>
                  <td style={{ ...s.td, fontWeight: 500 }}>Discovery</td>
                  <td style={s.td}>3</td><td style={s.td}>3</td>
                  <td style={{ ...s.td, color:'var(--accent)', fontWeight: 600 }}>487</td>
                  <td style={s.td}><span style={{ ...s.badge, background: 'color-mix(in srgb, #15803d 14%, var(--panel))', color: '#15803d' }}>Active</span></td>
                  <td style={s.td}><button style={s.linkBtn}>Edit</button></td>
                </tr>
                <tr style={s.tr} onMouseEnter={e => e.currentTarget.style.background='color-mix(in srgb, var(--accent) 6%, var(--panel))'} onMouseLeave={e => e.currentTarget.style.background=""}>
                  <td style={{ ...s.td, fontWeight: 500 }}>Money and Medicine</td>
                  <td style={s.td}>2</td><td style={s.td}>2</td>
                  <td style={{ ...s.td, color:'var(--accent)', fontWeight: 600 }}>214</td>
                  <td style={s.td}><span style={{ ...s.badge, background: 'color-mix(in srgb, #15803d 14%, var(--panel))', color: '#15803d' }}>Active</span></td>
                  <td style={s.td}><button style={s.linkBtn}>Edit</button></td>
                </tr>
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
            <button style={s.primaryBtn}>+ Add Product</button>
          </div>
          <div style={{ ...s.tableCard, overflowX: 'auto' }}>
            <table style={{ ...s.table, minWidth: '600px' }}>
              <thead><tr>
                <th style={s.th}>Product name</th>
                <th style={s.th}>Portfolio</th>
                <th style={s.th}>Sold this month</th>
                <th style={s.th}>Status</th>
                <th style={s.th}></th>
              </tr></thead>
              <tbody>
                {ALL_PRODUCTS.map(p => (
                  <tr key={p.name} style={s.tr} onMouseEnter={e => e.currentTarget.style.background='color-mix(in srgb, var(--accent) 6%, var(--panel))'} onMouseLeave={e => e.currentTarget.style.background=""}>
                    <td style={{ ...s.td, fontWeight: 500 }}>{p.name}</td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, fontSize: '0.688rem',
                        background: p.portfolio === 'Discovery' ? 'color-mix(in srgb, #1d4ed8 14%, var(--panel))' : 'color-mix(in srgb, #7c3aed 14%, var(--panel))',
                        color:      p.portfolio === 'Discovery' ? 'var(--accent)' : '#a78bfa',
                      }}>
                        {p.portfolio === 'Money and Medicine' ? 'M&M' : p.portfolio}
                      </span>
                    </td>
                    <td style={s.td}>{p.sold}</td>
                    <td style={s.td}><span style={{ ...s.badge, background: 'color-mix(in srgb, #15803d 14%, var(--panel))', color: '#15803d' }}>Active</span></td>
                    <td style={s.td}><button style={s.linkBtn}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Subscriptions */}
      {tab === 'subscriptions' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ color:'var(--mut)', fontSize: '0.875rem', margin: 0 }}>
              Medical lead subscriptions. When importing, select a subscription and the name is used as the lead source.
            </p>
            <button style={s.primaryBtn}>+ Add Subscription</button>
          </div>
          <div style={{ ...s.tableCard, overflowX: 'auto' }}>
            <table style={{ ...s.table, minWidth: '600px' }}>
              <thead><tr>
                <th style={s.th}>Subscription name</th>
                <th style={s.th}>Provider</th>
                <th style={s.th}>Leads imported</th>
                <th style={s.th}>Last import</th>
                <th style={s.th}>Status</th>
                <th style={s.th}></th>
              </tr></thead>
              <tbody>
                {MOCK_SUBSCRIPTIONS.map(sub => (
                  <tr key={sub.name} style={s.tr} onMouseEnter={e => e.currentTarget.style.background='color-mix(in srgb, var(--accent) 6%, var(--panel))'} onMouseLeave={e => e.currentTarget.style.background=""}>
                    <td style={{ ...s.td, fontWeight: 500 }}>{sub.name}</td>
                    <td style={{ ...s.td, color:'var(--mut)', fontSize: '0.8125rem' }}>{sub.provider}</td>
                    <td style={s.td}>{sub.imported}</td>
                    <td style={{ ...s.td, color:'var(--mut)', fontSize: '0.8125rem' }}>{sub.lastImport}</td>
                    <td style={s.td}>
                      <span style={{ ...s.badge,
                        background: sub.status === 'Active' ? 'color-mix(in srgb, #15803d 14%, var(--panel))' : 'color-mix(in srgb, #d97706 14%, var(--panel))',
                        color:      sub.status === 'Active' ? '#15803d' : '#d97706',
                      }}>
                        {sub.status}
                      </span>
                    </td>
                    <td style={s.td}><button style={s.linkBtn}>Edit</button></td>
                  </tr>
                ))}
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

          {demoMode && configLoading && (
            <div style={{ ...s.noticeInfo, marginBottom: '16px' }}>Loading current settings…</div>
          )}

          {settingsError && (
            <div style={{ ...s.errorBox, marginBottom: '16px' }}>{settingsError}</div>
          )}

          {settingsSaved && (
            <div style={{ ...s.noticeSuccess, marginBottom: '16px' }}>
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

          {demoMode && (
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
          )}

          {demoMode && auditLoading && (
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
                      {demoMode ? new Date(entry.performedAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) : entry.timestamp}
                    </td>
                    <td style={{ ...s.td, fontWeight: 500, fontSize: '0.8125rem' }}>{entry.action}</td>
                    <td style={s.td}>
                      <span style={{
                        ...s.badge, fontSize: '0.688rem',
                        background:'var(--panel2)', color:'var(--ink)',
                      }}>
                        {demoMode ? entry.entityType : entry.entity}
                      </span>
                    </td>
                    <td style={{ ...s.td, color:'var(--mut)', fontSize: '0.8125rem', maxWidth: '260px' }}>
                      {entry.entityRef}
                    </td>
                    <td style={{ ...s.td, fontSize: '0.8125rem' }}>
                      {demoMode ? entry.performedByName : entry.performedBy}
                    </td>
                  </tr>
                ))}
                {demoMode && !auditLoading && auditEntries.length === 0 && (
                  <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color:'var(--mut)' }}>No audit log entries yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {demoMode && auditTotalPages > 1 && (
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
    </div>
  );
}
