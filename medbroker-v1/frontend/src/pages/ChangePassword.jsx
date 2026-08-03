/**
 * pages/ChangePassword.jsx — NEW (§72).
 * One component, two entry points:
 *   - forced={true}  — rendered directly by App.jsx's AuthGate when
 *     user.passwordMustChange is true, blocking access to the rest of
 *     the app until it's done. No cancel option — there's nowhere to
 *     cancel back TO.
 *   - forced={false} (default) — a normal route (/change-password),
 *     reached from Settings.jsx's "Change password" button. Has a
 *     Cancel link back to Settings.
 * Same backend endpoint either way (PUT /api/auth/change-password) —
 * see that handler's own comment for why currentPassword is required in
 * both cases, not just the voluntary one.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext.jsx';
import { Logo } from '../components/Logo.jsx';
import { s, colors, radius } from '../styles/tokens.js';
import { authApi, ApiError } from '../services/api.js';

const COMPLEXITY_HINTS = [
  { test: v => v.length >= 12,       label: 'At least 12 characters' },
  { test: v => /[a-z]/.test(v),      label: 'A lowercase letter' },
  { test: v => /[A-Z]/.test(v),      label: 'An uppercase letter' },
  { test: v => /[0-9]/.test(v),      label: 'A digit' },
  { test: v => /[^A-Za-z0-9]/.test(v), label: 'A symbol' },
];

export default function ChangePassword({ forced = false }) {
  const { updateUser, refreshToken, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const hintsMet = COMPLEXITY_HINTS.map(h => h.test(newPassword));
  const allHintsMet = hintsMet.every(Boolean);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = currentPassword.length > 0 && allHintsMet && passwordsMatch;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await authApi.changePassword(currentPassword, newPassword);
      // §97 — the old token was just revoked server-side (so a stolen one
      // can't outlive this change); result.token is the fresh replacement
      // for THIS session specifically, so the user isn't logged out by
      // their own password change.
      refreshToken(result.token);
      // Clears passwordMustChange in the persisted session — see
      // AuthContext's updateUser() and authHandlers.js's own comment on
      // why this endpoint always clears it, whether it was a forced
      // first-login change or a rotation deadline that triggered it.
      updateUser({ passwordMustChange: false });
      if (forced) {
        setSuccess(true);
        // AuthGate re-renders into the app automatically once
        // user.passwordMustChange flips false — nothing else to do.
      } else {
        setSuccess(true);
        setTimeout(() => navigate('/settings'), 1200);
      }
    } catch (err) {
      if (err instanceof ApiError && typeof err.body?.error === 'object' && err.body.error.passwordProblems) {
        setError(err.body.error.passwordProblems.join('; '));
      } else {
        setError(err.message || 'Could not change password');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '24px',
    }}>
      <div style={{
        width: '420px', maxWidth: '100%',
        background: colors.surface, border: `1px solid ${colors.line}`,
        borderRadius: radius.lg, padding: '32px', boxShadow: '0 24px 60px -20px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <Logo size={36} withWordmark />
        </div>

        <h1 style={{ ...s.pageTitle, fontSize: '1.125rem', textAlign: 'center', marginBottom: '4px' }}>
          {forced ? 'Set a new password' : 'Change password'}
        </h1>
        <p style={{ ...s.pageSubtitle, textAlign: 'center', marginBottom: '22px' }}>
          {forced
            ? 'For security, you need to set your own password before continuing.'
            : 'Choose a new password for your account.'}
        </p>

        {success ? (
          <div style={{ ...s.noticeSuccess, textAlign: 'center' }}>
            ✓ Password changed successfully.{forced ? ' Taking you into MedBroker…' : ''}
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div style={{ ...s.errorBox, marginBottom: '16px' }}>{error}</div>}

            <div style={s.formGroup}>
              <label style={s.formLabel} htmlFor="cp-current">Current password</label>
              <input
                id="cp-current" type="password" autoComplete="current-password"
                style={s.formInput} value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required autoFocus
              />
            </div>

            <div style={s.formGroup}>
              <label style={s.formLabel} htmlFor="cp-new">New password</label>
              <input
                id="cp-new" type="password" autoComplete="new-password"
                style={s.formInput} value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
              />
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {COMPLEXITY_HINTS.map((h, i) => (
                  <span key={h.label} style={{ fontSize: '0.75rem', color: hintsMet[i] ? '#15803d' : 'var(--mut)' }}>
                    {hintsMet[i] ? '✓' : '○'} {h.label}
                  </span>
                ))}
              </div>
            </div>

            <div style={s.formGroup}>
              <label style={s.formLabel} htmlFor="cp-confirm">Confirm new password</label>
              <input
                id="cp-confirm" type="password" autoComplete="new-password"
                style={s.formInput} value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '4px' }}>Passwords do not match</div>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit || submitting}
              style={{ ...s.primaryBtn, width: '100%', justifyContent: 'center', marginTop: '6px', opacity: (!canSubmit || submitting) ? 0.5 : 1 }}
            >
              {submitting ? 'Changing…' : 'Change password'}
            </button>

            {!forced && (
              <button
                type="button"
                onClick={() => navigate('/settings')}
                style={{ ...s.secondaryBtn, width: '100%', justifyContent: 'center', marginTop: '10px' }}
              >
                Cancel
              </button>
            )}
            {forced && (
              <button
                type="button"
                onClick={logout}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', width: '100%',
                  marginTop: '14px', fontSize: '0.8125rem', color:'var(--mut)', fontFamily: 'inherit',
                }}
              >
                Log out instead
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
