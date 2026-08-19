/**
 * pages/FeatureFlags.jsx
 *
 * Feature flag management UI — GlobalAdmin only.
 * Reads from and writes to FlagContext. In production, changes are
 * persisted via PATCH /api/flags/:key.
 *
 * FLAG TIERS:
 *   Core        — fundamental per-customer behaviour; review at onboarding
 *   Operational — UI/workflow preferences; can be changed at any time
 *   Phase2      — not yet built; toggling has no effect until Phase 2 deploys
 *
 * tasks.enabled sits in Core (not Phase2) because the Tasks page IS built
 * and functional — it is simply off by default. Phase2 flags are for features
 * that do not exist yet in the codebase.
 */

import { useState, useEffect } from 'react';
import { useFlags } from '../context/FlagContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { flagsApi } from '../services/api.js';
import { s }        from '../styles/tokens.js';

// ─── Flag metadata ─────────────────────────────────────────────────────────────
// Mirrors the FeatureFlag table seed data. In production comes from GET /api/flags/meta.
const FLAG_META = [
  // ── Core ────────────────────────────────────────────────────────────────────
  {
    key: 'auth.sso.enabled', tier: 'Core',
    label: 'Single Sign-On',
    description: 'Enable SSO via Microsoft 365 or Google Workspace. When disabled, users log in with a standalone email and password managed within MedBroker.',
    valueType: 'boolean', requiresRestart: false, isPhase2: false,
  },
  {
    key: 'auth.sso.provider', tier: 'Core',
    label: 'SSO Provider',
    description: 'Which identity provider to use. Only applies when SSO is enabled.',
    valueType: 'enum', allowedValues: ['none', 'microsoft', 'google'],
    requiresRestart: true, isPhase2: false,
    dependsOn: { key: 'auth.sso.enabled', value: true },
  },
  {
    // §121 — the password-fallback toggle. Off by default, non-breaking:
    // local login keeps working for everyone regardless of this flag
    // until a GlobalAdmin deliberately turns it on. See handleLogin's
    // own comment (authHandlers.js) for the permanent GlobalAdmin
    // exemption this enforces even when on.
    key: 'auth.sso.disableLocalFallback', tier: 'Core',
    label: 'Require SSO for linked users',
    description: 'When SSO is enabled, also block local email/password login for any user with a linked Microsoft identity — they must sign in with Microsoft. GlobalAdmin accounts are always exempt. Off by default: local login stays available as a fallback for everyone.',
    valueType: 'boolean', requiresRestart: false, isPhase2: false,
    dependsOn: { key: 'auth.sso.enabled', value: true },
  },
  {
    key: 'appointments.claimModel', tier: 'Core',
    label: 'Appointment workflow',
    description: 'Assign: admin assigns appointments to brokers. Claim: brokers self-select from an available queue. Selecting Claim also activates the token economy.',
    valueType: 'enum', allowedValues: ['assign', 'claim'],
    requiresRestart: false, isPhase2: false,
  },
  {
    key: 'appointments.tokens.paymentProvider', tier: 'Core',
    label: 'Token payment provider',
    description: 'Payment gateway for broker token top-ups. "none" = admin top-up only. "stripe" = self-service via Stripe Checkout (not usable in South Africa). "paystack" = self-service via Paystack (ZAR-native, South Africa-supported, §135).',
    valueType: 'enum', allowedValues: ['none', 'stripe', 'paystack'],
    requiresRestart: false, isPhase2: false,
    dependsOn: { key: 'appointments.claimModel', value: 'claim' },
  },
  {
    key: 'events.enabled', tier: 'Core',
    label: 'Events module',
    description: 'Show the Events section in navigation. Disable for customers who do not run career fair or university events.',
    valueType: 'boolean', requiresRestart: false, isPhase2: false,
  },
  {
    key: 'leads.autoUnassign.enabled', tier: 'Core',
    label: 'Lead auto-return',
    description: 'Automatically return leads to the Unassigned queue after the configured inactivity period.',
    valueType: 'boolean', requiresRestart: false, isPhase2: false,
  },
  // tasks.enabled is Core — the Tasks page IS built and functional.
  // It is off by default but fully operational when enabled.
  // Phase2 flags are reserved for features not yet built.
  {
    key: 'tasks.enabled', tier: 'Core',
    label: 'Task management',
    description: 'Enable the Tasks page. Tasks are generated automatically from appointment events, callbacks, and rescheduling activity.',
    valueType: 'boolean', requiresRestart: false, isPhase2: false,
  },
  {
    // §112 — Core, not Operational: this changes fundamental backend
    // security behaviour (which encryption backend protects Lead ID
    // numbers), not a UI/workflow preference. Off by default,
    // deliberately, so the app keeps working with zero AWS setup — see
    // encryption.js's header comment for the required env vars before
    // turning this on, and requiresRestart: this doesn't literally
    // require a redeploy (Vercel serverless functions read env vars
    // fresh per invocation), but IS the kind of flag that should only be
    // flipped after real AWS infrastructure exists, not casually.
    key: 'security.kmsEncryption.enabled', tier: 'Core',
    label: 'AWS KMS-backed field encryption',
    description: 'Encrypt new Lead ID numbers using AWS KMS instead of a local key. Requires KMS_MASTER_KEY_ID, AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY to be set and verified first — this does not silently fall back if turned on without AWS configured. Already-encrypted values stay readable either way.',
    valueType: 'boolean', requiresRestart: true, isPhase2: false,
  },
  // ── Operational ─────────────────────────────────────────────────────────────
  {
    key: 'leads.importCsv.enabled', tier: 'Operational',
    label: 'CSV lead import',
    description: 'Show the Historical CSV import tab on the Lead Import page.',
    valueType: 'boolean', requiresRestart: false, isPhase2: false,
  },
  {
    key: 'leads.importSubscription.enabled', tier: 'Operational',
    label: 'Subscription lead import',
    description: 'Show the Medical Subscription import tab on the Lead Import page.',
    valueType: 'boolean', requiresRestart: false, isPhase2: false,
  },
  {
    key: 'leads.occupationFilter.enabled', tier: 'Operational',
    label: 'Occupation filter on Leads',
    description: 'Show the occupation dropdown filter on the Leads list.',
    valueType: 'boolean', requiresRestart: false, isPhase2: false,
  },
  {
    key: 'reports.agentDetail.enabled', tier: 'Operational',
    label: 'Agent detail report',
    description: 'Enable the drill-down report for individual agent performance.',
    valueType: 'boolean', requiresRestart: false, isPhase2: false,
  },
  {
    key: 'reports.brokerDetail.enabled', tier: 'Operational',
    label: 'Broker detail report',
    description: 'Enable the drill-down report for individual broker performance.',
    valueType: 'boolean', requiresRestart: false, isPhase2: false,
  },
  {
    key: 'notifications.email.enabled', tier: 'Operational',
    label: 'Email notifications',
    description: 'Dispatch email notifications via Azure Communication Services. Requires ACS connection string in environment config.',
    valueType: 'boolean', requiresRestart: false, isPhase2: false,
  },
  {
    key: 'appointments.thirdMeeting.enabled', tier: 'Operational',
    label: 'Optional third meeting',
    description: 'Show the third meeting section on the Appointment Detail page.',
    valueType: 'boolean', requiresRestart: false, isPhase2: false,
  },
  {
    // §109 — moved here from Phase 2. Was miscategorised as "not yet
    // implemented" even after the Data Requests feature (AppAdmin.jsx)
    // shipped for real (§79) — the flag just never actually gated it
    // until this delivery. Matches migration 020 / feature-
    // flags.postgres.sql's own tier correction for the same flag.
    key: 'popia.subjectAccessRequest.enabled', tier: 'Operational',
    label: 'POPIA subject access requests',
    description: 'Enable the Data Requests tab in App Admin for logging and fulfilling POPIA subject access requests against a Lead.',
    valueType: 'boolean', requiresRestart: false, isPhase2: false,
  },
  {
    // 18-19 Aug 2026 — added to feature-flags.postgres.sql when this
    // flag was created, but missed here, which is the ONLY reason it
    // never appeared as a toggle: this array, not the database, is what
    // the settings page actually renders from (see this file's own
    // header comment). Root-caused and fixed same session Mark reported
    // "no flag to turn it on" — not a database or SQL problem.
    key: 'data.export.enabled', tier: 'Operational',
    label: 'Full data export',
    description: 'Enable the Data Export tab in App Admin — a full Leads/Appointments/Meeting Attempts/Call Attempts export to Excel or JSON, Admin/GlobalAdmin only.',
    valueType: 'boolean', requiresRestart: false, isPhase2: false,
  },
  // ── Phase 2 — features not yet built ────────────────────────────────────────
  {
    key: 'broker.tokenIncentives.enabled', tier: 'Phase2',
    label: 'Broker deal incentives',
    description: 'Award bonus tokens to brokers who close deals. Not yet implemented.',
    valueType: 'boolean', requiresRestart: false, isPhase2: true,
  },
];

const TIER_META = {
  Core:        { label: 'Core',        description: 'Fundamental behaviour — varies between customers. Review at onboarding and do not change in production without testing.' },
  Operational: { label: 'Operational', description: 'UI and workflow preferences — can be changed at any time without a deployment.' },
  Phase2:      { label: 'Phase 2',     description: 'Features not yet built. These flags are visible for planning purposes only — enabling them has no effect until Phase 2 is deployed.' },
};

// ─── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ value, onChange, disabled }) {
  const on = value === true || value === '1' || value === 'true';
  return (
    <div
      onClick={() => !disabled && onChange(!on)}
      style={{
        width: '42px', height: '24px', borderRadius: '12px', flexShrink: 0,
        background: on ? 'var(--accent)' : 'color-mix(in srgb, var(--mut) 30%, var(--panel))',
        position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s', opacity: disabled ? 0.4 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: '3px',
        left: on ? '21px' : '3px',
        width: '18px', height: '18px', borderRadius: '50%',
        background:'var(--panel)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transition: 'left 0.2s',
      }} />
    </div>
  );
}

// ─── FlagRow ───────────────────────────────────────────────────────────────────
function FlagRow({ meta, rawValue, onSave }) {
  const [localValue, setLocalValue] = useState(rawValue);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [error,      setError]      = useState(null);

  // FIXED — this row keeps the same key across re-renders (it's the same
  // flag, not a new one), so React never re-runs useState's initializer
  // when rawValue changes; localValue would silently drift out of sync
  // with the actual saved value on the server/context after the first
  // save. Explicitly resyncing here whenever the saved value changes
  // underneath this row is what a fully-controlled input would do
  // automatically — this fixes it without restructuring the component.
  useEffect(() => {
    setLocalValue(rawValue);
  }, [rawValue]);

  const isDirty   = String(localValue) !== String(rawValue);
  const isLocked  = meta.isPhase2;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(meta.key, localValue); // real PATCH /api/flags/:key now, not a fake delay
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err?.body?.error ?? err?.message ?? 'Could not save this flag.');
      setLocalValue(rawValue); // revert the control to the last known-good value
    } finally {
      setSaving(false);
    }
  }

  const boolValue = localValue === true || localValue === '1' || localValue === 'true';

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '14px',
      padding: '14px 0', borderBottom:'1px solid var(--line)',
      opacity: isLocked ? 0.5 : 1,
    }}>
      {/* Control */}
      <div style={{ paddingTop: '2px', flexShrink: 0 }}>
        {meta.valueType === 'boolean' && (
          <Toggle value={localValue} onChange={v => setLocalValue(v)} disabled={isLocked} />
        )}
        {meta.valueType === 'enum' && (
          <select
            value={localValue}
            onChange={e => setLocalValue(e.target.value)}
            disabled={isLocked}
            style={{
              border: '1px solid var(--line)', borderRadius: '6px', padding: '4px 8px',
              fontSize: '0.8125rem', background: 'var(--panel)', color: 'var(--ink)',
              cursor: isLocked ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', minWidth: '110px',
            }}
          >
            {(meta.allowedValues ?? []).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
      </div>

      {/* Label and description */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 500, color:'var(--ink)' }}>{meta.label}</span>
          <span style={{ fontSize: '0.6875rem', color:'var(--mut)', fontFamily: 'monospace' }}>{meta.key}</span>
          {meta.requiresRestart && (
            <span style={{
              fontSize: '0.625rem', fontWeight: 600, padding: '1px 6px', borderRadius: '10px',
              background: 'color-mix(in srgb, #d97706 15%, var(--panel))', color: '#d97706', border: '1px solid color-mix(in srgb, #d97706 35%, var(--panel))',
            }}>
              Restart required
            </span>
          )}
          {isLocked && (
            <span style={{
              fontSize: '0.625rem', fontWeight: 600, padding: '1px 6px', borderRadius: '10px',
              background:'var(--panel2)', color:'var(--mut)',
            }}>
              Phase 2 — not yet available
            </span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: '0.8125rem', color:'var(--mut)', lineHeight: 1.5 }}>{meta.description}</p>
      </div>

      {/* Save action */}
      {!isLocked && (
        <div style={{ flexShrink: 0, paddingTop: '2px', textAlign: 'right' }}>
          {saved ? (
            <span style={{ fontSize: '0.8125rem', color: '#15803d', fontWeight: 500 }}>✓ Saved</span>
          ) : isDirty ? (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '4px 12px', borderRadius: '6px', border: 'none',
                background:'var(--accent)', color:'white', fontSize:'0.8125rem',
                cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 500,
              }}
            >
              {saving ? '…' : 'Save'}
            </button>
          ) : null}
          {error && (
            <div style={{ fontSize: '0.6875rem', color: 'var(--danger)', marginTop: '4px', maxWidth: '160px' }}>{error}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function FeatureFlags() {
  const { isMobile } = useWindowSize();
  const { flags, setFlag, refetch } = useFlags();
  const [activeTier, setActiveTier] = useState('Core');

  // Real PATCH /api/flags/:key, reflected in context on success.
  // §124 — setFlag(key, value) gives instant feedback on the flag just
  // changed; refetch() afterward picks up any OTHER flags the server
  // may have cascade-reset in the same call (flagHandlers.js's
  // DEPENDENT_RESETS — e.g. turning appointments.claimModel back to
  // 'assign' also resets appointments.tokens.paymentProvider server-
  // side). Without the refetch, this context's cached value for a reset
  // child would stay stale until the next full page load, even though
  // the database was already correct.
  async function handleSaveFlag(key, value) {
    await flagsApi.update(key, value); // throws ApiError on failure — caller (FlagRow) catches it
    setFlag(key, value);
    await refetch();
  }

  // Shared by the visible list AND the tab counts below — CORRECTED §122
  // (4 Aug 2026): the tab count used to be FLAG_META.filter(f => f.tier
  // === key).length, counting every flag in a tier regardless of
  // dependsOn. A dependsOn flag hidden by its parent's current value
  // (e.g. auth.sso.provider/auth.sso.disableLocalFallback while
  // auth.sso.enabled is off) was still counted, so "Core 9" never
  // matched how many rows were actually on screen — confirmed from
  // Mark's own screenshot, not assumed. Factoring the dependsOn check
  // out into one function used by both the list and the count means
  // they can't drift apart again the way two separate copies of the
  // same logic just did.
  function isFlagVisible(meta) {
    if (!meta.dependsOn) return true;
    // Coerce stored boolean strings — mirrors the flag() helper in FlagContext
    const raw = flags[meta.dependsOn.key];
    let val = raw;
    if (raw === '0' || raw === 'false' || raw === false) val = false;
    else if (raw === '1' || raw === 'true' || raw === true) val = true;
    return val === meta.dependsOn.value || String(raw) === String(meta.dependsOn.value);
  }

  const visibleFlags = FLAG_META
    .filter(m => m.tier === activeTier)
    .filter(isFlagVisible);

  return (
    <div style={{ ...s.page, padding: isMobile ? '12px' : '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: '1.375rem', fontWeight: 600, color:'var(--ink)' }}>Feature Flags</h1>
        <p style={{ margin: 0, fontSize: '0.875rem', color:'var(--mut)' }}>
          Control which features are active for this deployment. Changes take effect immediately unless marked "Restart required".
        </p>
      </div>

      <div style={{ ...s.noticeWarn, marginBottom: '18px', fontSize: '0.8125rem' }}>
        <strong>GlobalAdmin only.</strong> Flag changes affect all users immediately. Core flags should be reviewed
        at customer onboarding and not changed in production without testing.
      </div>

      {/* Tier tabs — same overflow gap as AppAdmin.jsx's own tab bar, fixed
          identically: overflowX: 'auto' + flexShrink: 0 on each button,
          rather than letting a handful of tier labels overflow a narrow
          phone's width outright. */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: '20px', overflowX: 'auto' }}>
        {Object.entries(TIER_META).map(([key, meta]) => {
          const count = FLAG_META.filter(f => f.tier === key && isFlagVisible(f)).length;
          return (
            <button
              key={key}
              onClick={() => setActiveTier(key)}
              style={{
                padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '0.875rem', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
                fontWeight: activeTier === key ? 600 : 400,
                color: activeTier === key ? 'var(--accent)' : 'var(--mut)',
                borderBottom: activeTier === key ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '7px',
              }}
            >
              {meta.label}
              <span style={{
                fontSize: '0.6875rem',
                background: activeTier === key ? 'color-mix(in srgb, var(--accent) 15%, var(--panel))' : 'var(--panel2)',
                color: activeTier === key ? 'var(--accent)' : 'var(--mut)',
                borderRadius: '10px', padding: '1px 6px',
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tier description */}
      <div style={{ ...s.noticeInfo, marginBottom: '16px', fontSize: '0.8125rem' }}>
        {TIER_META[activeTier]?.description}
      </div>

      {/* Flag rows */}
      <div style={s.card}>
        {visibleFlags.map(meta => (
          <FlagRow
            key={meta.key}
            meta={meta}
            rawValue={flags[meta.key] ?? false}
            onSave={handleSaveFlag}
          />
        ))}
      </div>
    </div>
  );
}
