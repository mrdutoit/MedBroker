/**
 * pages/UserAdmin.jsx
 * User management — create, edit, activate/deactivate.
 *
 * Wired to the real Users API (usersApi.list/create/update/listSupervisors).
 * The list is real, creation/edits persist, and deactivation actually
 * deactivates the user server-side.
 *
 * SSO vs local-auth creation — driven by the auth.sso.enabled flag, which
 * already existed and already defaults to false (see feature-flags.sql):
 *   - flag ON:  original behaviour — SSO-invite notice, no password field.
 *   - flag OFF: a password field replaces the SSO notice, since that's the
 *     active auth path this demo actually uses (see api-demo's
 *     services/authService.js). Editing an existing user never shows a
 *     password field either way — password changes are a separate,
 *     not-yet-built flow (self-service change-password / admin reset).
 *
 * Everything else — layout, portfolio/product checkboxes, supervisor
 * assignment, region logic — is unchanged from the original.
 */

import { useState } from 'react';
import { useRole } from '../context/RoleContext.jsx';
import { useFlags } from '../context/FlagContext.jsx';
import { useFetch } from '../hooks/useFetch.js';
import { useSortableData } from '../hooks/useSortableData.js';
import { usersApi, appointmentsApi, ApiError } from '../services/api.js';
import { REGIONS } from '../constants/leadOptions.js';
import { s } from '../styles/tokens.js';

const ROLES = ['Admin', 'Supervisor', 'Agent', 'Broker'];


const ROLE_STYLE = {
  GlobalAdmin: { bg: '#fdf2ff', colour: '#7e22ce' },
  Admin:      { bg: 'color-mix(in srgb, #dc2626 14%, var(--panel))', colour: '#dc2626' },
  Supervisor: { bg: 'color-mix(in srgb, #d97706 14%, var(--panel))', colour: '#d97706' },
  Agent:      { bg: 'color-mix(in srgb, #1d4ed8 14%, var(--panel))', colour: 'var(--accent)' },
  Broker:     { bg: 'color-mix(in srgb, #15803d 14%, var(--panel))', colour: '#15803d' },
};

const BLANK_FORM = {
  displayName: '', email: '', role: 'Agent', region: '',
  supervisorId: '', portfolios: [], products: [], password: '',
};

// ─── Portfolio + product selector (reused in both modals) ────────────────────
/**
 * A clickable <th> that sorts by activeKey when clicked, showing a ▲/▼
 * indicator when it's the currently active sort column. Local to this
 * file for now — worth extracting alongside useSortableData if the same
 * pattern gets applied to another table later.
 */
function SortableTh({ label, activeKey, currentSortKey, currentDirection, requestSort }) {
  const isActive = currentSortKey === activeKey;
  return (
    <th
      style={{ ...s.th, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      onClick={() => requestSort(activeKey)}
    >
      {label}
      <span style={{ marginLeft: '4px', fontSize: '0.6875rem', color: isActive ? 'var(--ink)' : 'var(--mut)', opacity: isActive ? 1 : 0.4 }}>
        {isActive ? (currentDirection === 'asc' ? '▲' : '▼') : '▲'}
      </span>
    </th>
  );
}

function PortfolioProductSelector({ portfolios, products, onPortfolioChange, onProductChange, role, allPortfolios, productsByPortfolio }) {
  const needsPortfolio = ['Agent', 'Supervisor', 'Broker'].includes(role);
  const needsProducts  = role === 'Broker';
  if (!needsPortfolio) return null;

  return (
    <div>
      <div style={s.formGroup}>
        <label style={s.formLabel}>Portfolio {role !== 'Supervisor' ? '*' : ''}</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
          {allPortfolios.map(p => {
            const checked = portfolios.includes(p.name);
            return (
              <label
                key={p.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  cursor: 'pointer', padding: '6px 12px',
                  border: `1px solid ${checked ? 'var(--accent)' : 'var(--line)'}`,
                  borderRadius: '6px', fontSize: '0.875rem',
                  background: checked ? 'color-mix(in srgb, var(--accent) 10%, var(--panel))' : 'var(--panel)',
                  color: checked ? 'var(--accent)' : 'var(--ink)',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onPortfolioChange(p.name)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                {p.name}
              </label>
            );
          })}
        </div>
      </div>

      {needsProducts && portfolios.map(portName => {
        const allProds = productsByPortfolio[portName] || [];
        return (
          <div key={portName} style={{ ...s.formGroup }}>
            <label style={{ ...s.formLabel, color:'var(--accent)' }}>{portName} products</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
              {allProds.map(prod => {
                const checked = products.includes(prod);
                return (
                  <label
                    key={prod}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      fontSize: '0.75rem', cursor: 'pointer',
                      padding: '3px 8px', borderRadius: '20px',
                      background: checked ? 'color-mix(in srgb, #15803d 14%, var(--panel))' : 'var(--panel2)',
                      color: checked ? '#15803d' : 'var(--ink)',
                      border: `1px solid ${checked ? 'color-mix(in srgb, #15803d 30%, var(--panel))' : 'var(--line)'}`,
                      userSelect: 'none',
                    }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => onProductChange(prod)} style={{ accentColor: '#15803d' }} />
                    {prod}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function UserModal({ mode, user, supervisors, ssoEnabled, onClose, onSave, onUnlock, onForceLogout, onLinkIdentity, onTopUp, onForcePasswordReset }) {
  const { role, portfolios: allPortfolios, productsByPortfolio } = useRole();
  const isEdit = mode === 'edit';
  const isGlobalAdmin = role === 'GlobalAdmin';
  // §117 — broader than isGlobalAdmin above; the token top-up endpoint is
  // Admin+GlobalAdmin (matches every other broker-management action on
  // this page), unlike link-identity's GlobalAdmin-only scope.
  const isAdminOrAbove = role === 'Admin' || isGlobalAdmin;
  const [form, setForm] = useState(
    isEdit
      ? {
          ...user,
          portfolios:   Array.isArray(user.portfolios) ? user.portfolios : [],
          products:     Array.isArray(user.products)   ? user.products   : [],
          supervisorId: user.supervisorId ?? '',
          password:     '',
        }
      : { ...BLANK_FORM }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  // §114 — GlobalAdmin-only identity form (email correction + manual
  // Entra Object ID link/unlink). Deliberately a separate form/save
  // action from the one above: it hits a different endpoint
  // (PUT /api/users/:id/link-identity, GlobalAdmin-gated server-side too)
  // with different audit semantics, so it can't just be folded into
  // handleSave's payload.
  const [identityForm, setIdentityForm] = useState({
    email: user?.email ?? '',
    entraObjectId: user?.entraObjectId ?? '',
  });
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityError, setIdentityError]   = useState(null);

  // §118 — GlobalAdmin-only forced password reset. Own dedicated state
  // block (not the shared saving/error Unlock/Force Logout use) since
  // this needs its own inline form, not a one-click confirm-and-go action.
  const [showResetForm, setShowResetForm]   = useState(false);
  const [resetPassword, setResetPassword]   = useState('');
  const [resetShowPw,   setResetShowPw]     = useState(false);
  const [resetSaving,   setResetSaving]     = useState(false);
  const [resetError,    setResetError]      = useState(null);

  // §117 — token balance + manual top-up. Only relevant for a Broker;
  // only fetched when this modal is actually showing one (isEdit &&
  // isAdminOrAbove && user.role === 'Broker'), same "resolve to null
  // rather than skip the hook" pattern AppointmentList.jsx's own §117
  // fetches use, since hooks must run unconditionally either way.
  const showTokenSection = isEdit && isAdminOrAbove && user?.role === 'Broker';
  const { data: tokenData, loading: tokenLoading, refetch: refetchTokenLedger } = useFetch(
    () => showTokenSection ? appointmentsApi.tokens.forBroker(user.id) : Promise.resolve(null),
    [showTokenSection, user?.id]
  );
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpSaving, setTopUpSaving] = useState(false);
  const [topUpError, setTopUpError]   = useState(null);

  function togglePortfolio(name) {
    setForm(f => {
      const next = f.portfolios.includes(name)
        ? f.portfolios.filter(p => p !== name)
        : [...f.portfolios, name];
      const validProds = next.flatMap(n => productsByPortfolio[n] || []);
      return { ...f, portfolios: next, products: f.products.filter(pr => validProds.includes(pr)) };
    });
  }

  function toggleProduct(name) {
    setForm(f => ({
      ...f,
      products: f.products.includes(name) ? f.products.filter(p => p !== name) : [...f.products, name],
    }));
  }

  const needsSupervisor = ['Agent', 'Broker'].includes(form.role);
  const needsPassword   = !isEdit && !ssoEnabled;

  async function handleSave() {
    setError(null);

    if (needsPassword && form.password && form.password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await onSave({
          displayName:  form.displayName,
          role:         form.role,
          region:       form.region || undefined,
          supervisorId: form.supervisorId || undefined,
          portfolios:   form.portfolios,
          products:     form.products,
          isActive:     form.isActive,
        });
      } else {
        await onSave({
          displayName:  form.displayName,
          email:        form.email,
          role:         form.role,
          region:       form.region || undefined,
          supervisorId: form.supervisorId || undefined,
          portfolios:   form.portfolios,
          products:     form.products,
          ...(needsPassword && form.password ? { password: form.password } : {}),
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong saving this user.');
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  async function handleDeactivate() {
    setSaving(true);
    setError(null);
    try {
      await onSave({ isActive: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not deactivate this user.');
      setSaving(false);
    }
  }

  async function handleUnlock() {
    setSaving(true);
    setError(null);
    try {
      await onUnlock();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not unlock this account.');
      setSaving(false);
    }
  }

  async function handleForceLogout() {
    if (!window.confirm(`Sign ${user.displayName} out everywhere? They'll need to log in again on every device.`)) return;
    setSaving(true);
    setError(null);
    try {
      await onForceLogout();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign this user out.');
      setSaving(false);
    }
  }

  // §114 — sends only the field(s) that actually changed from what the
  // user row currently has, matching LinkIdentitySchema's "at least one
  // of email/entraObjectId" requirement and keeping the audit log
  // (UserEmailCorrected vs UserIdentityLinked/Unlinked, written per field
  // server-side) accurate to what was really touched, not every field
  // resent unconditionally.
  async function handleLinkIdentity() {
    setIdentityError(null);

    const payload = {};
    if (identityForm.email !== user.email) payload.email = identityForm.email;
    const currentEntraId = user.entraObjectId ?? '';
    if (identityForm.entraObjectId !== currentEntraId) {
      payload.entraObjectId = identityForm.entraObjectId.trim() === '' ? null : identityForm.entraObjectId.trim();
    }
    if (Object.keys(payload).length === 0) return;

    setIdentitySaving(true);
    try {
      await onLinkIdentity(payload); // closes the modal on success (handleModalLinkIdentity)
    } catch (err) {
      setIdentityError(err instanceof ApiError ? err.message : 'Could not update this identity.');
      setIdentitySaving(false);
    }
  }

  // §118 — closes the modal on success, same convention Unlock/Force
  // Logout use: this is a completed recovery action, not something an
  // Admin would want to immediately follow up with more edits to.
  async function handleForcePasswordReset() {
    setResetError(null);
    if (!resetPassword) {
      setResetError('Enter a temporary password.');
      return;
    }
    setResetSaving(true);
    try {
      await onForcePasswordReset(resetPassword); // closes the modal on success
    } catch (err) {
      // Same special-case ChangePassword.jsx already needs — the backend's
      // complexity-check failure comes back as { passwordProblems: [...] },
      // a shape usersApi's shared formatErrorBody() doesn't know how to
      // read (it only understands Zod's fieldErrors/formErrors), so this
      // reads err.body directly rather than trusting err.message here.
      if (err instanceof ApiError && typeof err.body?.error === 'object' && err.body.error.passwordProblems) {
        setResetError(err.body.error.passwordProblems.join('; '));
      } else {
        setResetError(err instanceof ApiError ? err.message : 'Could not reset this password.');
      }
      setResetSaving(false);
    }
  }

  // §117 — deliberately does NOT close the modal on success, unlike
  // handleLinkIdentity above: an Admin topping up a broker's balance is
  // plausibly going to check the new total or top up again, not leave
  // immediately — closing on every save would be a worse flow for a
  // number-entry action like this one. Clears the input and refetches
  // the ledger instead.
  async function handleTopUp() {
    setTopUpError(null);
    const amount = Number(topUpAmount);
    if (!Number.isInteger(amount) || amount < 1) {
      setTopUpError('Enter a whole number of at least 1.');
      return;
    }

    setTopUpSaving(true);
    try {
      await onTopUp(amount);
      setTopUpAmount('');
      await refetchTokenLedger();
    } catch (err) {
      setTopUpError(err instanceof ApiError ? err.message : 'Could not top up this broker\u2019s balance.');
    } finally {
      setTopUpSaving(false);
    }
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...s.modal, width: '520px' }}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>{isEdit ? 'Edit User' : 'Add User'}</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error && <div style={{ ...s.errorBox, marginBottom: '14px' }}>{error}</div>}

        {/* Locked notice — §81, visible immediately rather than only implied by the Unlock button */}
        {isEdit && user.isLocked && (
          <div style={{ ...s.errorBox, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🔒 This account is locked after too many failed login attempts. Use "Unlock Account" below to restore access.
          </div>
        )}

        {/* SSO notice — only when SSO is actually the active auth path */}
        {ssoEnabled && (
          <div style={{ ...s.noticeInfo, marginBottom: '16px', fontSize: '0.8125rem' }}>
            {isEdit
              ? `This user signs in via SSO using their existing Microsoft 365 or Google account.`
              : `The user will be invited via SSO using their Microsoft 365 or Google Workspace account. No separate password is created.`
            }
          </div>
        )}

        {/* Identity card for edit */}
        {isEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background:'var(--panel2)', borderRadius: '6px', marginBottom: '14px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
              background: ROLE_STYLE[form.role]?.bg ?? 'var(--panel2)',
              color: ROLE_STYLE[form.role]?.colour ?? 'var(--ink)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.75rem', fontWeight: 600,
            }}>
              {form.displayName.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <div style={{ fontWeight: 500 }}>{form.displayName}</div>
              <div style={{ fontSize: '0.75rem', color:'var(--mut)' }}>{form.email}{ssoEnabled ? ' · SSO' : ''}</div>
            </div>
          </div>
        )}

        {/* §114 — Sign-in identity: GlobalAdmin only, edit mode only.
            Email correction + manual Entra Object ID link/unlink — the
            action design decision (a), §109/§110, deliberately scoped
            tighter than the Admin+GlobalAdmin fields below. Also where a
            JIT-provisioned SSO user (created inactive, pending review) or
            an email-mismatch case gets resolved — same admin visibility
            as this list already provides, no separate page. */}
        {isEdit && isGlobalAdmin && (
          <div style={{
            border: '1px solid var(--line)', borderRadius: '8px',
            padding: '12px 14px', marginBottom: '16px', background: 'var(--panel2)',
          }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '10px' }}>
              Sign-in Identity <span style={{ fontWeight: 400, color: 'var(--mut)' }}>(GlobalAdmin only)</span>
            </div>

            {identityError && <div style={{ ...s.errorBox, marginBottom: '10px' }}>{identityError}</div>}

            <div style={s.formGroup}>
              <label style={s.formLabel}>Email address</label>
              <input
                type="email"
                style={s.formInput}
                value={identityForm.email}
                onChange={e => setIdentityForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>

            <div style={s.formGroup}>
              <label style={s.formLabel}>
                Entra Object ID <span style={{ fontWeight: 400, color: 'var(--mut)' }}>(leave blank to unlink)</span>
              </label>
              <input
                style={s.formInput}
                value={identityForm.entraObjectId}
                onChange={e => setIdentityForm(f => ({ ...f, entraObjectId: e.target.value }))}
                placeholder="e.g. 3fa85f64-5717-4562-b3fc-2c963f66afa6"
              />
              <div style={s.formHint}>
                Manually links this account to a Microsoft Entra ID identity. Only needed when a
                user's SSO email doesn't match their MedBroker email, or to resolve a pending
                sign-in that couldn't be matched automatically.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button style={s.secondaryBtn} onClick={handleLinkIdentity} disabled={identitySaving}>
                {identitySaving ? 'Saving…' : 'Update Identity'}
              </button>
            </div>
          </div>
        )}

        {/* §118 — GlobalAdmin-only forced password reset, for a genuinely
            forgotten password. Sets a temporary value the real owner is
            forced to replace at next login (passwordMustChange=TRUE),
            clears any lockout, and revokes existing sessions — all three
            folded into this one action, see userService.forcePasswordReset()'s
            header for why. */}
        {isEdit && isGlobalAdmin && (
          <div style={{
            border: '1px solid var(--line)', borderRadius: '8px',
            padding: '12px 14px', marginBottom: '16px', background: 'var(--panel2)',
          }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: showResetForm ? '10px' : 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Forgotten Password <span style={{ fontWeight: 400, color: 'var(--mut)' }}>(GlobalAdmin only)</span></span>
              {!showResetForm && (
                <button style={s.secondaryBtn} onClick={() => setShowResetForm(true)}>
                  Force Password Reset
                </button>
              )}
            </div>

            {showResetForm && (
              <>
                {resetError && <div style={{ ...s.errorBox, marginBottom: '10px' }}>{resetError}</div>}
                <div style={s.formGroup}>
                  <label style={s.formLabel}>Temporary password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={resetShowPw ? 'text' : 'password'}
                      style={{ ...s.formInput, paddingRight: '56px' }}
                      value={resetPassword}
                      onChange={e => setResetPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setResetShowPw(v => !v)}
                      style={{
                        position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: 'var(--mut)',
                        fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit', padding: '4px',
                      }}
                    >
                      {resetShowPw ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div style={s.formHint}>
                    {user.displayName} will be required to set their own password on next
                    login — this value is temporary, and any active lockout or session is
                    cleared as part of this action.
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    style={s.secondaryBtn}
                    onClick={() => { setShowResetForm(false); setResetPassword(''); setResetError(null); }}
                    disabled={resetSaving}
                  >
                    Cancel
                  </button>
                  <button style={s.primaryBtn} onClick={handleForcePasswordReset} disabled={resetSaving}>
                    {resetSaving ? 'Setting…' : 'Set Temporary Password'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* §117 — token balance + manual top-up: Admin+GlobalAdmin (broader
            than Sign-in Identity's GlobalAdmin-only scope above — this
            matches PUT /api/appointments/tokens/:brokerId/topup's actual
            gate), edit mode only, Broker role only. The ENTIRE 'none'
            payment-provider path — see tokenService.manualTopUp()'s header
            for why this isn't a stopgap standing in for Stripe. */}
        {showTokenSection && (
          <div style={{
            border: '1px solid var(--line)', borderRadius: '8px',
            padding: '12px 14px', marginBottom: '16px', background: 'var(--panel2)',
          }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '10px' }}>
              Token Balance <span style={{ fontWeight: 400, color: 'var(--mut)' }}>(Admin)</span>
            </div>

            {tokenLoading && <div style={{ fontSize: '0.8125rem', color: 'var(--mut)' }}>Loading balance…</div>}

            {tokenData?.ledger && (
              <div style={{ display: 'flex', gap: '18px', marginBottom: '12px', fontSize: '0.8125rem' }}>
                <div>
                  <div style={{ color: 'var(--mut)', fontSize: '0.688rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Free remaining</div>
                  <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>{tokenData.ledger.freeRemaining} / {tokenData.monthlyAllocation}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--mut)', fontSize: '0.688rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Paid balance</div>
                  <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>{tokenData.ledger.balance}</div>
                </div>
              </div>
            )}

            {topUpError && <div style={{ ...s.errorBox, marginBottom: '10px' }}>{topUpError}</div>}

            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <div style={{ ...s.formGroup, marginBottom: 0, flex: 1 }}>
                <label style={s.formLabel}>Add tokens</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  style={s.formInput}
                  value={topUpAmount}
                  onChange={e => setTopUpAmount(e.target.value)}
                  placeholder="e.g. 10"
                />
              </div>
              <button style={s.secondaryBtn} onClick={handleTopUp} disabled={topUpSaving || !topUpAmount}>
                {topUpSaving ? 'Adding…' : 'Top Up'}
              </button>
            </div>
            <div style={s.formHint}>
              Manual top-up — the only way to add paid tokens while Stripe payment isn't
              connected yet. Adds to the paid balance, not the monthly free allocation.
            </div>
          </div>
        )}

        {!isEdit && (
          <>
            <div style={s.formGroup}>
              <label style={s.formLabel}>Display name *</label>
              <input style={s.formInput} value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Dr Jane Smith" />
            </div>
            <div style={s.formGroup}>
              <label style={s.formLabel}>
                Email address * {ssoEnabled && <span style={{ fontSize: '0.688rem', color:'var(--mut)' }}>(Microsoft 365 or Google Workspace)</span>}
              </label>
              <input type="email" style={s.formInput} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane.smith@medbroker.co.za" />
            </div>

            {needsPassword && (
              <div style={s.formGroup}>
                <label style={s.formLabel}>Password <span style={{ fontSize: '0.688rem', color:'var(--mut)' }}>(optional — leave blank for an SSO-style invite with no local password)</span></label>
                <input
                  type="password"
                  style={s.formInput}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="At least 12 characters"
                  autoComplete="new-password"
                />
              </div>
            )}
          </>
        )}

      {/* Role + Status row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={s.formGroup}>
            <label style={s.formLabel}>Role *</label>
            <select
              style={s.formInput}
              value={form.role}
              onChange={e => {
                const newRole = e.target.value;
                const keepPortfolios = ['Agent', 'Supervisor', 'Broker'].includes(newRole);
                setForm(f => ({
                  ...f,
                  role: newRole,
                  portfolios: keepPortfolios ? f.portfolios : [],
                  products:   newRole === 'Broker' ? f.products : [],
                }));
              }}
            >
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {isEdit && (
            <div style={s.formGroup}>
              <label style={s.formLabel}>Status</label>
              <select style={s.formInput} value={form.isActive ? 'Active' : 'Inactive'} onChange={e => setForm(f => ({ ...f, isActive: e.target.value === 'Active' }))}>
                <option>Active</option><option>Inactive</option>
              </select>
            </div>
          )}
          {!['Admin', 'Supervisor', 'GlobalAdmin'].includes(form.role) && (
            <div style={s.formGroup}>
              <label style={s.formLabel}>Region *</label>
              <select style={s.formInput} value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}>
                <option value="">Select region…</option>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Supervisor assignment */}
        {needsSupervisor && (
          <div style={s.formGroup}>
            <label style={s.formLabel}>Supervisor *</label>
            <select style={s.formInput} value={form.supervisorId} onChange={e => setForm(f => ({ ...f, supervisorId: e.target.value }))}>
              <option value="">Select supervisor…</option>
              {supervisors.map(sv => <option key={sv.id} value={sv.id}>{sv.displayName}</option>)}
            </select>
            <div style={s.formHint}>The supervisor can view all leads and appointments assigned to this user.</div>
          </div>
        )}

        {/* Portfolio + products */}
        <PortfolioProductSelector
          portfolios={form.portfolios}
          products={form.products}
          onPortfolioChange={togglePortfolio}
          onProductChange={toggleProduct}
          role={form.role}
          allPortfolios={allPortfolios}
          productsByPortfolio={productsByPortfolio}
        />

        <div style={{ ...s.modalFooter, justifyContent: isEdit ? 'space-between' : 'flex-end' }}>
          {isEdit && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={s.dangerBtn} onClick={handleDeactivate} disabled={saving}>
                {saving ? 'Working…' : 'Deactivate'}
              </button>
              {user.isLocked && (
                <button style={s.secondaryBtn} onClick={handleUnlock} disabled={saving}>
                  {saving ? 'Working…' : 'Unlock Account'}
                </button>
              )}
              <button style={s.secondaryBtn} onClick={handleForceLogout} disabled={saving}>
                {saving ? 'Working…' : 'Force Logout'}
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={s.ghostBtn} onClick={onClose} disabled={saving}>Cancel</button>
            <button style={s.primaryBtn} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : ssoEnabled ? 'Send Invitation' : 'Create User'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function UserAdmin() {
  const [roleFilter, setRoleFilter] = useState('All');
  const [modal,      setModal]      = useState(null);   // { mode: 'create'|'edit', user? }
  const { flag } = useFlags();
  const ssoEnabled = flag('auth.sso.enabled');

  const { data: usersData, loading: usersLoading, refetch: refetchUsers } = useFetch(
    () => usersApi.list({ role: roleFilter !== 'All' ? roleFilter : undefined }),
    [roleFilter]
  );
  // FIXED 30 Jul 2026 — this used to fetch once on mount and never again.
  // Changing a user's role TO Supervisor (or away from it) never refreshed
  // this list, so the "Select supervisor…" dropdown on every OTHER user's
  // edit form kept showing the pre-change roster until a full page reload
  // remounted the component. Now refetched in the same place refetchUsers
  // already is — see handleModalSave below.
  const { data: supervisorsData, refetch: refetchSupervisors } = useFetch(() => usersApi.listSupervisors(), []);

  // usersLoading (checked below, near the top of the render) keeps the
  // brief window while the real fetch is in flight from showing an empty
  // table as if it were the final result.
  const allUsers = (usersData?.users ?? []).map(u => ({ ...u, supervisor: u.supervisorName ?? '—' }));
  const supervisors = supervisorsData?.supervisors ?? [];

  const filtered = allUsers.filter(u => roleFilter === 'All' || u.role === roleFilter);
  const counts   = ROLES.reduce((acc, r) => { acc[r] = allUsers.filter(u => u.role === r).length; return acc; }, {});

  // Sorting (default: Name, ascending — alphabetical, per Mark's request).
  // Applied AFTER filtering, so sorting always acts on whatever's
  // currently visible, not the full unfiltered roster.
  const { sorted: sortedFiltered, sortKey, sortDirection, requestSort } = useSortableData(filtered, 'displayName', 'asc');

  async function handleModalUnlock() {
    if (!modal?.user) return;
    await usersApi.unlock(modal.user.id);
    await Promise.all([refetchUsers(), refetchSupervisors()]);
    setModal(null);
  }

  async function handleModalForceLogout() {
    if (!modal?.user) return;
    await usersApi.forceLogout(modal.user.id);
    setModal(null);
  }

  async function handleModalSave(payload) {
    if (modal.mode === 'edit') {
      await usersApi.update(modal.user.id, payload);
    } else {
      await usersApi.create(payload);
    }
    // Both lists derive from the same underlying User table, so any save
    // that could plausibly change WHO qualifies as a supervisor (a role
    // change either way) needs both refetched together, not just the one
    // the edited user happens to show up in directly.
    await Promise.all([refetchUsers(), refetchSupervisors()]);
    setModal(null);
  }

  // §114 — same shape as handleModalUnlock/handleModalForceLogout above:
  // call the API, refetch (an email correction can change who a search
  // filter matches), close the modal. Deliberately doesn't try to keep
  // the modal open and re-sync in place — simpler, and consistent with
  // every other admin action on this page.
  async function handleModalLinkIdentity(payload) {
    if (!modal?.user) return;
    await usersApi.linkIdentity(modal.user.id, payload);
    await Promise.all([refetchUsers(), refetchSupervisors()]);
    setModal(null);
  }

  // §117 — deliberately does NOT touch modal state or refetchUsers/
  // refetchSupervisors at all, unlike every handler above: a token
  // top-up changes nothing about the User row itself (role, email,
  // identity, active status), only TokenLedger, which this page's own
  // user list doesn't display. UserModal's own refetchTokenLedger (via
  // useFetch) handles refreshing the balance shown in the modal.
  async function handleModalTopUp(amount) {
    if (!modal?.user) return;
    await appointmentsApi.tokens.topUp(modal.user.id, amount);
  }

  // §118 — closes the modal on success, matching Unlock/Force Logout's
  // own convention (this is a completed recovery action). refetchUsers
  // isn't strictly needed for anything this changes to be visible in the
  // list (isLocked does show there, and this does clear it — worth
  // refetching so the red "Locked" badge, if it was showing, disappears
  // immediately rather than on the next unrelated refresh).
  async function handleModalForcePasswordReset(newPassword) {
    if (!modal?.user) return;
    await usersApi.forcePasswordReset(modal.user.id, newPassword);
    await Promise.all([refetchUsers(), refetchSupervisors()]);
    setModal(null);
  }

  return (
    <div style={s.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 600, color:'var(--ink)' }}>User Administration</h1>
        <button style={s.primaryBtn} onClick={() => setModal({ mode: 'create' })}>+ Add User</button>
      </div>

      {usersLoading && (
        <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>Loading users…</div>
      )}

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '18px' }}>
        {ROLES.map(r => {
          const rs = ROLE_STYLE[r];
          return (
            <div
              key={r}
              style={{ ...s.metricCard, cursor: 'pointer', border: roleFilter === r ? `1px solid ${rs.colour}` : '1px solid var(--line)' }}
              onClick={() => setRoleFilter(roleFilter === r ? 'All' : r)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8125rem', color:'var(--ink)' }}>{r}s</span>
                <span style={{ ...s.badge, background: rs.bg, color: rs.colour, fontSize: '0.688rem' }}>{r}</span>
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 600, color:'var(--ink)', marginTop: '8px' }}>{counts[r] ?? 0}</div>
            </div>
          );
        })}
      </div>

      {/* Role chips */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {['All', ...ROLES].map(r => (
          <button
            key={r}
            onClick={() => setRoleFilter(r)}
            style={{ ...s.chip, ...(roleFilter === r ? s.chipActive : {}) }}
          >
            {r === 'All' ? 'All users' : r + 's'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ ...s.tableCard, overflowX: 'auto' }}>
        <table style={{ ...s.table, minWidth: '600px' }}>
          <thead>
            <tr>
              <SortableTh label="Name"       activeKey="displayName" currentSortKey={sortKey} currentDirection={sortDirection} requestSort={requestSort} />
              <SortableTh label="Email"      activeKey="email"       currentSortKey={sortKey} currentDirection={sortDirection} requestSort={requestSort} />
              <SortableTh label="Role"       activeKey="role"        currentSortKey={sortKey} currentDirection={sortDirection} requestSort={requestSort} />
              <SortableTh label="Region"     activeKey="region"      currentSortKey={sortKey} currentDirection={sortDirection} requestSort={requestSort} />
              <th style={s.th}>Portfolio</th>
              <SortableTh label="Supervisor" activeKey="supervisor"  currentSortKey={sortKey} currentDirection={sortDirection} requestSort={requestSort} />
              <th style={s.th}>Products</th>
              <SortableTh label="Status"     activeKey="isActive"    currentSortKey={sortKey} currentDirection={sortDirection} requestSort={requestSort} />
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {sortedFiltered.map(user => {
              const rs = ROLE_STYLE[user.role] ?? ROLE_STYLE.Agent;
              return (
                <tr
                  key={user.id}
                  style={{ ...s.tr, cursor: 'pointer' }}
                  onClick={() => setModal({ mode: 'edit', user })}
                  onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 6%, var(--panel))'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={s.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                        background: rs.bg, color: rs.colour,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.625rem', fontWeight: 600,
                      }}>
                        {user.displayName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{user.displayName}</span>
                    </div>
                  </td>
                  <td style={{ ...s.td, fontSize: '0.75rem', color:'var(--mut)', fontFamily: 'monospace' }}>{user.email}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: rs.bg, color: rs.colour }}>{user.role}</span>
                  </td>
                  <td style={{ ...s.td, fontSize: '0.8125rem' }}>{user.region || '—'}</td>
                  <td style={s.td}>
                    {user.portfolios.length > 0
                      ? user.portfolios.map(p => (
                          <span key={p} style={{
                            ...s.badge, fontSize: '0.688rem', marginRight: '3px',
                            background: p === 'Discovery' ? 'color-mix(in srgb, #1d4ed8 14%, var(--panel))' : 'color-mix(in srgb, #7c3aed 14%, var(--panel))',
                            color:      p === 'Discovery' ? 'var(--accent)' : '#a78bfa',
                          }}>{p === 'Money and Medicine' ? 'M&M' : p}</span>
                        ))
                      : <span style={{ color:'var(--mut)', fontSize: '0.8125rem' }}>—</span>
                    }
                  </td>
                  <td style={{ ...s.td, fontSize: '0.8125rem', color:'var(--mut)' }}>{user.supervisor || '—'}</td>
                  <td style={s.td}>
                    {user.products.length > 0
                      ? user.products.slice(0, 2).map(p => (
                          <span key={p} style={{ ...s.badge, background: 'color-mix(in srgb, #15803d 14%, var(--panel))', color: '#15803d', fontSize: '0.625rem', marginRight: '2px' }}>{p}</span>
                        ))
                      : <span style={{ color:'var(--mut)', fontSize: '0.8125rem' }}>—</span>
                    }
                    {user.products.length > 2 && <span style={{ fontSize: '0.75rem', color:'var(--mut)' }}> +{user.products.length - 2}</span>}
                  </td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: user.isActive ? 'color-mix(in srgb, #15803d 14%, var(--panel))' : 'var(--panel2)', color: user.isActive ? '#15803d' : 'var(--mut)' }}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {user.isLocked && (
                      <span style={{ ...s.badge, background: 'color-mix(in srgb, #dc2626 14%, var(--panel))', color: '#dc2626', marginLeft: '4px' }}>
                        Locked
                      </span>
                    )}
                  </td>
                  <td style={s.td} onClick={e => e.stopPropagation()}>
                    <button style={s.linkBtn} onClick={() => setModal({ mode: 'edit', user })}>Edit</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <UserModal
          mode={modal.mode}
          user={modal.user}
          supervisors={supervisors}
          ssoEnabled={ssoEnabled}
          onClose={() => setModal(null)}
          onSave={handleModalSave}
          onUnlock={handleModalUnlock}
          onForceLogout={handleModalForceLogout}
          onLinkIdentity={handleModalLinkIdentity}
          onTopUp={handleModalTopUp}
          onForcePasswordReset={handleModalForcePasswordReset}
        />
      )}
    </div>
  );
}
