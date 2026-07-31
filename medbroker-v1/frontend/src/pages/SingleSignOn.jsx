/**
 * pages/SingleSignOn.jsx
 * REWRITTEN 31 Jul 2026 (§75) — the previous version of this page
 * presented FABRICATED configuration as if it were live: a made-up
 * Tenant ID, Client ID, "Token validation: Active — JWKS endpoint",
 * "M365 calendar integration: Active — Graph API scopes granted", plus
 * "Test connection" / "Edit configuration" buttons that did nothing at
 * all. None of it was real — this app has never had a working SSO
 * integration; it uses local email/password auth exclusively (see
 * authService.js, User Admin). Showing a real customer a page that
 * looks like an active SSO configuration, when none exists, is
 * materially misleading, not just an unfinished feature — worse than
 * every other "coming soon" stub in this app, which are all honest
 * about being unbuilt.
 *
 * The detailed Microsoft Entra ID / Google Workspace step-by-step setup
 * documentation that used to live here described the ORIGINAL Azure
 * Functions / Entra ID architecture (api/src/, the separate, now
 * out-of-scope production target — see Project_Context_Vercel.md's own
 * header for why this project only covers the Vercel deployment going
 * forward). That documentation may still have real value for whoever
 * eventually builds that Azure deployment, but it doesn't belong
 * embedded in THIS product's live UI, presented as if it might already
 * be configured — it's been removed from here entirely, not just
 * hidden behind a flag.
 *
 * What's left: an honest statement of how auth actually works in this
 * deployment (local email/password, with real, working policy controls
 * — rotation/lockout/reuse, all built in §72), and a brief, clearly
 * non-live note that SSO is a capability of a separate enterprise
 * deployment profile, without claiming anything about it is active here.
 */

import { useFlags } from '../context/FlagContext.jsx';
import { s } from '../styles/tokens.js';

export default function SingleSignOn() {
  const { flag } = useFlags();
  const ssoEnabled = flag('auth.sso.enabled');

  return (
    <div style={{ ...s.page, maxWidth: '700px' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: '1.375rem', fontWeight: 600, color: 'var(--ink)' }}>Single Sign-On</h1>
      <p style={{ color: 'var(--mut)', fontSize: '0.875rem', margin: '0 0 18px' }}>How authentication works in this deployment</p>

      <div style={{ ...s.noticeInfo, marginBottom: '18px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <span style={{ fontSize: '1rem' }}>ⓘ</span>
        <div>
          <strong>This deployment uses local email/password authentication.</strong> Every user signs in with a
          MedBroker account and password managed in <strong>User Admin</strong>. Password rotation, account
          lockout, and reuse-prevention policies are configurable in <strong>App Admin → System Settings</strong>.
        </div>
      </div>

      <div style={s.card}>
        <div style={s.cardTitle}>Single sign-on is not part of this deployment</div>
        <p style={{ fontSize: '0.875rem', color: 'var(--ink)', lineHeight: 1.6, margin: '0 0 10px' }}>
          SSO (signing in with an existing Microsoft 365 or Google Workspace account) is a capability of a
          separate, enterprise-hosted deployment profile — not something configured or available here. The{' '}
          <code style={{ fontSize: '0.8125rem' }}>auth.sso.enabled</code> flag below currently reflects that:
        </p>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px',
          borderRadius: '6px', background: 'var(--panel2)', fontSize: '0.8125rem',
        }}>
          <span>{ssoEnabled ? '⚠️' : '✅'}</span>
          <span>
            <code>auth.sso.enabled</code> is currently <strong>{ssoEnabled ? 'ON' : 'OFF'}</strong>
            {ssoEnabled && ' — but no SSO provider is actually connected in this deployment; turning this flag on has no functional effect here.'}
          </span>
        </div>
      </div>
    </div>
  );
}
