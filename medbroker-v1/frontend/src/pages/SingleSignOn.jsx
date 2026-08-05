/**
 * pages/SingleSignOn.jsx
 * REWRITTEN §120 (4 Aug 2026, SSO stage 4) — this page previously (§75,
 * 31 Jul 2026) correctly said SSO was not part of this deployment: "this
 * app has never had a working SSO integration; it uses local email/
 * password auth exclusively." That was true when written. It stopped
 * being true on 4 Aug 2026 (§114) — Entra ID SSO is now real, working,
 * end to end (validate an Entra ID token, JIT-provision or match an
 * existing user, issue the same session local login issues). Leaving
 * §75's copy in place after that would have made THIS version of the
 * page the misleading one — telling a GlobalAdmin "turning this flag on
 * has no functional effect here" right next to a working "Sign in with
 * Microsoft" button on the login page would be actively wrong, not just
 * stale.
 *
 * What's still true and kept from §75's own reasoning: don't claim
 * anything is configured/active that isn't actually verified. This page
 * reflects the REAL current flag state (auth.sso.enabled) rather than a
 * fixed claim either way, and is explicit that whether the backend env
 * vars (ENTRA_TENANT_ID/ENTRA_CLIENT_ID) are actually set isn't
 * something the frontend can see — same "don't claim what isn't
 * verified" principle §75 established, applied to what's now true
 * instead of what was true in July.
 *
 * UPDATED §121 (4 Aug 2026, SSO stage 3): added the password-fallback
 * toggle explanation and the GlobalAdmin-only Offboarding Sync action.
 */

import { useState } from 'react';
import { useRole } from '../context/RoleContext.jsx';
import { useFlags } from '../context/FlagContext.jsx';
import { authApi, ApiError } from '../services/api.js';
import { s } from '../styles/tokens.js';

export default function SingleSignOn() {
  const { role } = useRole();
  const isGlobalAdmin = role === 'GlobalAdmin';
  const { flag } = useFlags();
  const ssoEnabled = flag('auth.sso.enabled');
  const fallbackDisabled = flag('auth.sso.disableLocalFallback');

  const [syncRunning, setSyncRunning] = useState(false);
  const [syncResult,  setSyncResult]  = useState(null);
  const [syncError,   setSyncError]   = useState(null);

  async function handleRunSync() {
    setSyncError(null);
    setSyncResult(null);
    setSyncRunning(true);
    try {
      const result = await authApi.offboardingSync();
      setSyncResult(result);
    } catch (err) {
      setSyncError(err instanceof ApiError ? err.message : 'Could not run the offboarding sync.');
    } finally {
      setSyncRunning(false);
    }
  }

  return (
    <div style={{ ...s.page, maxWidth: '700px' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: '1.375rem', fontWeight: 600, color: 'var(--ink)' }}>Single Sign-On</h1>
      <p style={{ color: 'var(--mut)', fontSize: '0.875rem', margin: '0 0 18px' }}>How authentication works in this deployment</p>

      <div style={{ ...s.noticeInfo, marginBottom: '18px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <span style={{ fontSize: '1rem' }}>ⓘ</span>
        <div>
          <strong>Local email/password authentication is always available.</strong> Every user has a MedBroker
          account managed in <strong>User Admin</strong>, regardless of whether SSO is turned on below. Password
          rotation, account lockout, and reuse-prevention policies are configurable in{' '}
          <strong>App Admin → System Settings</strong>.
        </div>
      </div>

      <div style={{ ...s.card, marginBottom: '18px' }}>
        <div style={s.cardTitle}>Microsoft Entra ID sign-in</div>
        <p style={{ fontSize: '0.875rem', color: 'var(--ink)', lineHeight: 1.6, margin: '0 0 10px' }}>
          Staff can sign in with an existing Microsoft 365 account instead of a MedBroker password. A first-time
          sign-in matches or creates a User record automatically (by email, or by manual link if the addresses
          don't match — see User Admin's "Sign-in Identity" section on any Broker/Agent/Supervisor/Admin's profile).
          Google Workspace sign-in is a defined option (<code style={{ fontSize: '0.8125rem' }}>auth.sso.provider</code>)
          but is not built — Entra ID only, for now.
        </p>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px',
          borderRadius: '6px', background: 'var(--panel2)', fontSize: '0.8125rem', marginBottom: '10px',
        }}>
          <span>{ssoEnabled ? '✅' : '➖'}</span>
          <span>
            <code>auth.sso.enabled</code> is currently <strong>{ssoEnabled ? 'ON' : 'OFF'}</strong>
            {ssoEnabled
              ? ' — the "Sign in with Microsoft" button is showing on the login page.'
              : ' — the login page only shows local email/password. Turn this on in Feature Flags to enable SSO.'}
          </span>
        </div>
        {ssoEnabled && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px',
            borderRadius: '6px', background: 'var(--panel2)', fontSize: '0.8125rem', marginBottom: '10px',
          }}>
            <span>{fallbackDisabled ? '🔒' : '➖'}</span>
            <span>
              <code>auth.sso.disableLocalFallback</code> is currently <strong>{fallbackDisabled ? 'ON' : 'OFF'}</strong>
              {fallbackDisabled
                ? ' — any user with a linked Microsoft identity must use SSO; their local password no longer works. GlobalAdmin accounts are always exempt, as a permanent recovery path.'
                : ' — local email/password still works for everyone, even users who\u2019ve signed in with Microsoft before. Turn this on in Feature Flags to require SSO for linked users.'}
            </span>
          </div>
        )}
        <p style={{ fontSize: '0.75rem', color: 'var(--mut)', lineHeight: 1.6, margin: 0 }}>
          Turning SSO on also requires <code>ENTRA_TENANT_ID</code> and <code>ENTRA_CLIENT_ID</code> to be set
          in this deployment's environment variables (backend), and <code>VITE_ENTRA_CLIENT_ID</code>/{' '}
          <code>VITE_ENTRA_AUTHORITY</code> (frontend) — these are set once, outside the app, not from this page.
          If the flag is on but those aren't configured, sign-in attempts will fail with a clear error rather than
          silently doing nothing.
        </p>
      </div>

      {ssoEnabled && (
        <div style={s.card}>
          <div style={s.cardTitle}>Offboarding sync</div>
          <p style={{ fontSize: '0.875rem', color: 'var(--ink)', lineHeight: 1.6, margin: '0 0 10px' }}>
            Checks every active MedBroker user with a linked Microsoft identity against your Microsoft 365
            directory, and deactivates anyone whose account has been removed or disabled there. This runs
            on demand, not automatically — there's no scheduled job in this deployment, so run it whenever
            you've offboarded staff in Microsoft 365 and want MedBroker access revoked to match.
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--mut)', lineHeight: 1.6, margin: '0 0 12px' }}>
            Requires <code>ENTRA_CLIENT_SECRET</code> to be set (a different credential from sign-in itself),
            and the app registration to have <code>User.Read.All</code> Graph API permission with admin consent
            granted — set up once, outside the app.
          </p>

          {!isGlobalAdmin && (
            <div style={{ ...s.noticeWarn, fontSize: '0.8125rem' }}>Only a GlobalAdmin can run this.</div>
          )}

          {isGlobalAdmin && (
            <>
              {syncError && <div style={{ ...s.errorBox, marginBottom: '10px' }}>{syncError}</div>}
              {syncResult && (
                <div style={{ ...s.noticeSuccess, marginBottom: '10px', fontSize: '0.8125rem' }}>
                  Checked {syncResult.checked} linked account{syncResult.checked === 1 ? '' : 's'}.{' '}
                  {syncResult.deactivatedCount > 0
                    ? `Deactivated ${syncResult.deactivatedCount}: ${syncResult.deactivated.map(u => u.displayName).join(', ')}.`
                    : 'No accounts needed deactivating.'}
                  {syncResult.errors.length > 0 && ` ${syncResult.errors.length} could not be checked — see below.`}
                </div>
              )}
              {syncResult?.errors?.length > 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--mut)', marginBottom: '10px' }}>
                  {syncResult.errors.map(e => (
                    <div key={e.id}>{e.displayName}: {e.message}</div>
                  ))}
                </div>
              )}
              <button style={s.secondaryBtn} onClick={handleRunSync} disabled={syncRunning}>
                {syncRunning ? 'Checking Microsoft 365…' : 'Run Sync Now'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
