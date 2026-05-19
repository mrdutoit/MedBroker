/**
 * pages/FeatureFlags.jsx
 * Feature flag management UI — Admin role only.
 * Reads from and writes to FlagContext. In production, changes are
 * persisted via PATCH /api/flags/:key.
 */

import { useState } from 'react';
import { useFlags } from '../context/FlagContext.jsx';
import { s } from '../styles/tokens.js';

// Flag metadata for the admin UI — mirrors the FeatureFlag table seed data.
// In production this would come from GET /api/flags/meta.
const FLAG_META = [
  // ── Core ────────────────────────────────────────────────────────────────────
  {
    key: 'auth.sso.enabled', tier: 'Core',
    label: 'Single Sign-On',
    description: 'Enable SSO via Microsoft 365 or Google Workspace. When disabled, users log in with a standalone email and password managed within MedBroker.',
    valueType: 'boolean',
    requiresRestart: false, isPhase2: false,
  },
  {
    key: 'auth.sso.provider', tier: 'Core',
    label: 'SSO Provider',
    description: 'Which identity provider to use. Only applies when SSO is enabled.',
    valueType: 'enum', allowedValues: ['none', 'microsoft', 'google'],
    requiresRestart: true, isPhase2: false,
  },
  {
    key: 'appointments.claimModel', tier: 'Core',
    label: 'Appointment workflow',
    description: 'Assign: admin assigns appointments to brokers. Claim: brokers self-select from an available queue.',
    valueType: 'enum', allowedValues: ['assign', 'claim'],
    requiresRestart: false, isPhase2: false,
  },
  {
    key: 'appointments.tokens.enabled', tier: 'Core',
    label: 'Broker token economy',
    description: 'Brokers receive 10 free appointments per month. Additional appointments cost tokens. Requires claim model.',
    valueType: 'boolean',
    requiresRestart: false, isPhase2: false,
    dependsOn: { key: 'appointments.claimModel', value: 'claim' },
  },
  {
    key: 'appointments.tokens.paymentProvider', tier: 'Core',
    label: 'Token payment provider',
    description: 'Payment gateway for broker token top-ups. "none" = admin top-up only. "stripe" = self-service via Stripe Checkout.',
    valueType: 'enum', allowedValues: ['none', 'stripe'],
    requiresRestart: false, isPhase2: false,
    dependsOn: { key: 'appointments.tokens.enabled', value: true },
  },
  {
    key: 'events.enabled', tier: 'Core',
    label: 'Events module',
    description: 'Show the Events section in navigation. Disable for customers who do not run career fair or university events.',
    valueType: 'boolean',
    requiresRestart: false, isPhase2: false,
  },
  {
    key: 'leads.autoUnassign.enabled', tier: 'Core',
    label: 'Lead auto-return',
    description: 'Automatically return leads to the Unassigned queue after the configured inactivity period.',
    valueType: 'boolean',
    requiresRestart: false, isPhase2: false,
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
  // ── Phase 2 ─────────────────────────────────────────────────────────────────
  {
    key: 'tasks.enabled', tier: 'Phase2',
    label: 'Task management',
    description: 'Enable the Tasks page and automatic task generation from appointment events, callbacks, and rescheduling.',
    valueType: 'boolean', requiresRestart: false, isPhase2: true,
  },
  {
    key: 'broker.tokenIncentives.enabled', tier: 'Phase2',
    label: 'Broker deal incentives',
    description: 'Award bonus tokens to brokers who close deals.',
    valueType: 'boolean', requiresRestart: false, isPhase2: true,
  },
  {
    key: 'popia.subjectAccessRequest.enabled', tier: 'Phase2',
    label: 'POPIA subject access requests',
    description: 'Enable the admin endpoint and UI for processing POPIA data subject access requests.',
    valueType: 'boolean', requiresRestart: false, isPhase2: true,
  },
];

const TIER_META = {
  Core:        { label: 'Core',        description: 'Fundamental behaviour — vary between customers. Review at onboarding.',  colour: '#dc2626', bg: '#fef2f2' },
  Operational: { label: 'Operational', description: 'UI and workflow preferences — can be changed at any time.',              colour: '#1d4ed8', bg: '#eff6ff' },
  Phase2:      { label: 'Phase 2',     description: 'Features not yet live. Turning these on has no effect until Phase 2 is deployed.', colour: '#9ca3af', bg: '#f3f4f6' },
};

// ─── Toggle component ─────────────────────────────────────────────────────────
function Toggle({ value, onChange, disabled }) {
  const on = value === true || value === '1' || value === 'true';
  return (
    <div
      onClick={() => !disabled && onChange(!on)}
      style={{
        width: '42px', height: '24px', borderRadius: '12px', flexShrink: 0,
        background: on ? '#1d4ed8' : '#e5e7eb',
        position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s', opacity: disabled ? 0.4 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: '3px',
        left: on ? '21px' : '3px',
        width: '18px', height: '18px', borderRadius: '50%',
        background: 'white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transition: 'left 0.2s',
      }} />
    </div>
  );
}

// ─── Single flag row ──────────────────────────────────────────────────────────
function FlagRow({ meta, rawValue, onSave }) {
  const [localValue, setLocalValue] = useState(rawValue);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);

  const isDirty = String(localValue) !== String(rawValue);

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
      padding: '14px 0', borderBottom: '1px solid #f3f4f6',
      opacity: meta.isPhase2 ? 0.65 : 1,
    }}>
      {/* Control */}
      <div style={{ width: '160px', flexShrink: 0, paddingTop: '2px' }}>
        {meta.valueType === 'boolean' && (
          <Toggle value={boolValue} onChange={v => setLocalValue(v)} disabled={meta.isPhase2} />
        )}
        {meta.valueType === 'enum' && (
          <select
            value={localValue}
            onChange={e => setLocalValue(e.target.value)}
            disabled={meta.isPhase2}
            style={{ ...s.select, fontSize: '0.8125rem', padding: '5px 8px', width: '150px' }}
          >
            {(meta.allowedValues ?? []).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
      </div>

      {/* Label + description */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{meta.label}</span>
          <code style={{ fontSize: '0.688rem', color: '#9ca3af', background: '#f3f4f6', padding: '1px 5px', borderRadius: '3px' }}>
            {meta.key}
          </code>
          {meta.requiresRestart && (
            <span style={{ fontSize: '0.625rem', background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', borderRadius: '3px', padding: '1px 5px' }}>
              Restart required
            </span>
          )}
          {meta.isPhase2 && (
            <span style={{ fontSize: '0.625rem', background: '#f3f4f6', color: '#9ca3af', borderRadius: '3px', padding: '1px 5px' }}>
              Phase 2
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.8125rem', color: '#6b7280', lineHeight: 1.5 }}>{meta.description}</div>
        {meta.dependsOn && (
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '3px' }}>
            Requires: <code style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: '2px' }}>{meta.dependsOn.key}</code> = {String(meta.dependsOn.value)}
          </div>
        )}
      </div>

      {/* Save action */}
      <div style={{ width: '80px', flexShrink: 0, textAlign: 'right', paddingTop: '2px' }}>
        {saved && <span style={{ color: '#15803d', fontSize: '0.75rem' }}>✓ Saved</span>}
        {!saved && isDirty && !meta.isPhase2 && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ ...s.primaryBtn, fontSize: '0.75rem', padding: '5px 10px' }}
          >
            {saving ? '…' : 'Save'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function FeatureFlags() {
  const { flags, setFlag } = useFlags();
  const [activeTier, setActiveTier] = useState('Core');

  const visibleFlags = FLAG_META.filter(m => m.tier === activeTier);

  return (
    <div style={s.page}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: '1.375rem', fontWeight: 600, color: '#111827' }}>Feature Flags</h1>
        <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
          Control which features are active for this deployment. Changes take effect immediately unless marked "Restart required".
        </p>
      </div>

      <div style={{ ...s.noticeWarn, marginBottom: '18px', fontSize: '0.8125rem' }}>
        <strong>Admin only.</strong> Flag changes affect all users immediately. Core flags should be reviewed
        at customer onboarding and not changed in production without testing.
      </div>

      {/* Tier tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '20px' }}>
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
                color: activeTier === key ? '#1d4ed8' : '#6b7280',
                borderBottom: activeTier === key ? '2px solid #1d4ed8' : '2px solid transparent',
                marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '7px',
              }}
            >
              {meta.label}
              <span style={{ fontSize: '0.688rem', background: activeTier === key ? '#eff6ff' : '#f3f4f6', color: activeTier === key ? '#1d4ed8' : '#9ca3af', borderRadius: '10px', padding: '1px 6px' }}>
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
