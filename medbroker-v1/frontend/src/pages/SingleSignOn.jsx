/**
 * pages/SingleSignOn.jsx
 * SSO configuration and documentation page.
 * Shows the active provider (Microsoft 365 / Entra ID) and documents both
 * the Azure and GCP authentication flows.
 *
 * The active/inactive banner now reflects the real auth.sso.enabled flag
 * (added 22 July 2026) rather than always claiming SSO is active — this
 * page previously said so unconditionally regardless of the flag's actual
 * value, which was misleading once local auth became a real, switchable
 * alternative. The step-by-step provider documentation below is unchanged —
 * it's reference material for whichever architecture profile a real
 * customer deployment uses, not a live config form.
 */

import { useState } from 'react';
import { useFlags } from '../context/FlagContext.jsx';
import { s } from '../styles/tokens.js';

function Step({ num, colour, children }) {
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '10px' }}>
      <div style={{
        width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
        background: colour === 'blue' ? 'color-mix(in srgb, #1d4ed8 14%, var(--panel))' : 'color-mix(in srgb, #15803d 14%, var(--panel))',
        color:      colour === 'blue' ? 'var(--accent)' : '#15803d',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.6875rem', fontWeight: 600,
      }}>
        {num}
      </div>
      <div style={{ fontSize: '0.875rem', color: 'var(--ink)', lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

export default function SingleSignOn() {
  const [tab, setTab] = useState('m365');
  const { flag } = useFlags();
  const ssoEnabled = flag('auth.sso.enabled');

  return (
    <div style={{ ...s.page, maxWidth: '800px' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: '1.375rem', fontWeight: 600, color: 'var(--ink)' }}>Single Sign-On</h1>
      <p style={{ color: 'var(--mut)', fontSize: '0.875rem', margin: '0 0 18px' }}>Configure how users authenticate into MedBroker</p>

      {ssoEnabled ? (
        <div style={{ ...s.noticeSuccess, marginBottom: '18px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '1rem' }}>✅</span>
          <div>
            <strong>SSO is active.</strong> Users sign in with their existing Microsoft 365 or Google Workspace accounts.
            No separate MedBroker password is required. New users receive an email invitation and are provisioned
            automatically on first sign-in.
          </div>
        </div>
      ) : (
        <div style={{ ...s.noticeWarn, marginBottom: '18px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '1rem' }}>ⓘ</span>
          <div>
            <strong>SSO is not currently enabled.</strong> Users sign in with a standalone email and password
            managed within MedBroker (see User Admin). Turn on <strong>Single Sign-On</strong> in Feature Flags
            to switch new users over to the flow documented below — existing users keep signing in with their
            password either way; nothing about their account breaks when this changes.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: '20px' }}>
        {[['m365', 'Microsoft 365 (Entra ID)'], ['google', 'Google Workspace']].map(([key, label]) => (
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

      {/* Microsoft 365 */}
      {tab === 'm365' && (
        <>
          <div style={{ ...s.card, marginBottom: '14px' }}>
            <div style={s.cardTitle}>Microsoft Entra ID External — Configuration</div>
            {[
              ['Provider',                 'Microsoft Entra ID External'],
              ['Tenant ID',                'a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
              ['Application (client) ID',  'b2c3d4e5-f6a7-8901-bcde-f12345678901'],
              ['Redirect URI',             'https://medbroker.co.za'],
              ['Token validation',         '✅ Active — JWKS endpoint'],
              ['User provisioning',        'Auto-provisioned on first sign-in'],
              ['M365 calendar integration','✅ Active — Graph API scopes granted'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: '0.875rem', gap: '12px' }}>
                <span style={{ color: 'var(--mut)', flexShrink: 0 }}>{label}</span>
                <span style={{ fontWeight: 500, textAlign: 'right', fontFamily: label.includes('ID') || label.includes('URI') ? 'monospace' : 'inherit', fontSize: label.includes('ID') || label.includes('URI') ? '0.75rem' : '0.875rem' }}>{value}</span>
              </div>
            ))}
            <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
              <button style={s.secondaryBtn}>Test connection</button>
              <button style={s.ghostBtn}>Edit configuration</button>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>How Microsoft 365 SSO works in MedBroker</div>
            <Step num="1" colour="blue">
              Admin adds a user in <strong>User Admin</strong> and enters their Microsoft 365 email address.
              The user receives an email invitation to access MedBroker.
            </Step>
            <Step num="2" colour="blue">
              The user clicks <strong>Sign in with Microsoft</strong> on the MedBroker login page and authenticates
              with their existing Microsoft 365 credentials — including any MFA or Conditional Access policies
              configured by their organisation.
            </Step>
            <Step num="3" colour="blue">
              Entra ID issues a signed JWT token. MedBroker validates it against the JWKS endpoint and maps the
              user's Entra Object ID to their MedBroker profile, role, portfolio, and supervisor assignments.
            </Step>
            <Step num="4" colour="blue">
              Broker availability for appointment booking is checked via the <strong>Microsoft 365 Calendar API</strong>
              (Graph API) using the broker's Entra identity — no Calendly account required. Brokers are ranked
              by fewest upcoming appointments in the matching portfolio and region.
            </Step>
          </div>
        </>
      )}

      {/* Google Workspace */}
      {tab === 'google' && (
        <>
          <div style={{ ...s.noticeWarn, marginBottom: '16px' }}>
            Google Workspace SSO is available when MedBroker is deployed on the{' '}
            <strong>Google Cloud (Profile B)</strong> architecture. Contact your administrator to
            switch architecture profiles.
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>How Google Workspace SSO works in MedBroker</div>
            <Step num="1" colour="green">
              Admin configures a <strong>Firebase Authentication</strong> project linked to the customer's
              Google Workspace domain. Users are restricted to verified domain email addresses only.
            </Step>
            <Step num="2" colour="green">
              Users click <strong>Sign in with Google</strong> and authenticate using their existing Google
              Workspace account — including any Google-enforced MFA or device policies.
            </Step>
            <Step num="3" colour="green">
              Firebase issues an ID token. The MedBroker API validates it using the Firebase Admin SDK and
              maps the Google UID to the user's MedBroker profile, role, and portfolio assignments.
            </Step>
            <Step num="4" colour="green">
              Broker calendar availability is checked via the <strong>Google Calendar API</strong> using
              OAuth 2.0 service account delegation against the broker's Google Workspace calendar.
            </Step>
            <div style={{ marginTop: '16px' }}>
              <button style={s.secondaryBtn}>Configure Google Workspace SSO</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
