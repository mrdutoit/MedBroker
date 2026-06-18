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

import { useState } from 'react';
import { useFlags } from '../context/FlagContext.jsx';
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
    key: 'appointments.claimModel', tier: 'Core',
    label: 'Appointment workflow',
    description: 'Assign: admin assigns appointments to brokers. Claim: brokers self-select from an available queue. Selecting Claim also activates the token economy.',
    valueType: 'enum', allowedValues: ['assign', 'claim'],
    requiresRestart: false, isPhase2: false,
  },
  {
    key: 'appointments.tokens.paymentProvider', tier: 'Core',
    label: 'Token payment provider',
    description: 'Payment gateway for broker token top-ups. "none" = admin top-up only. "stripe" = self-service via Stripe Checkout.',
    valueType: 'enum', allowedValues: ['none', 'stripe'],
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
  // ── Phase 2 — features not yet built ────────────────────────────────────────
  {
    key: 'broker.tokenIncentives.enabled', tier: 'Phase2',
    label: 'Broker deal incentives',
    description: 'Award bonus tokens to brokers who close deals. Not yet implemented.',
    valueType: 'boolean', requiresRestart: false, isPhase2: true,
  },
  {
    key: 'popia.subjectAccessRequest.enabled', tier: 'Phase2',
    label: 'POPIA subject access requests',
    description: 'Enable the admin endpoint and UI for processing POPIA data subject access requests. Not yet implemented.',
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

  const isDirty   = String(localValue) !== String(rawValue);
  const isLocked  = meta.isPhase2;

  async function handleSave() {
    setSaving(true);
    await new Promise(r => setTimeout(r, 400)); // simulate API call
    onSave(meta.key, localValue);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
        <div style={{ flexShrink: 0, paddingTop: '2px' }}>
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
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function FeatureFlags() {
  const { flags, setFlag } = useFlags();
  const [activeTier, setActiveTier] = useState('Core');

  const visibleFlags = FLAG_META
    .filter(m => m.tier === activeTier)
    .filter(m => {
      if (!m.dependsOn) return true;
      // Coerce stored boolean strings — mirrors the flag() helper in FlagContext
      const raw = flags[m.dependsOn.key];
      let val = raw;
      if (raw === '0' || raw === 'false' || raw === false) val = false;
      else if (raw === '1' || raw === 'true' || raw === true) val = true;
      return val === m.dependsOn.value || String(raw) === String(m.dependsOn.value);
    });

  return (
    <div style={s.page}>
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

      {/* Tier tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: '20px' }}>
        {Object.entries(TIER_META).map(([key, meta]) => {
          const count = FLAG_META.filter(f => f.tier === key).length;
          return (
            <button
              key={key}
              onClick={() => setActiveTier(key)}
              style={{
                padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '0.875rem', fontFamily: 'inherit',
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
            onSave={(key, value) => setFlag(key, value)}
          />
        ))}
      </div>
    </div>
  );
}
