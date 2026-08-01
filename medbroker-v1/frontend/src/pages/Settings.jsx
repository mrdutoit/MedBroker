/**
 * pages/Settings.jsx
 * Account preferences — available to every role.
 *   • Appearance: choose the design-system theme (applied live; saved to
 *     the user's profile in demo mode — see below).
 *   • Profile: display name, email, role.
 *   • Avatar: initials with an accent colour choice. Photo upload is a
 *     deliberate stub (Phase 2) — real file/blob storage is a separate
 *     piece of scope, not bundled into this pass.
 *
 * BACKEND WIRING (added 28 Jul 2026, §55): previously every preference here
 * — theme, display name, avatar colour, timezone — persisted to
 * sessionStorage only, both here and in ThemeContext.jsx/dateFormat.js,
 * each with a "when a Users API exists, wire this up" comment. It does now
 * (PUT /api/users/me — self-service, separate from the Admin-only
 * PUT /api/users/:id UserAdmin.jsx uses to edit OTHER people). Initial
 * values come straight off the authenticated session (useAuth().user —
 * already carries these fields from login, no extra fetch needed) and
 * saves go to the real backend, then patch the cached session via
 * updateUser() so the rest of the app (sidebar avatar, displayName)
 * reflects the change immediately.
 */

import { useState }     from 'react';
import { useNavigate }  from 'react-router';
import { useRole }       from '../context/RoleContext.jsx';
import { useAuth }       from '../context/AuthContext.jsx';
import { useTheme }      from '../context/ThemeContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { s, colors }     from '../styles/tokens.js';
import { usersApi, ApiError } from '../services/api.js';
import { AVATAR_OPTIONS, avatarColourValue } from '../constants/avatarOptions.js';
import { getUserTimezone, setUserTimezone, SUPPORTED_TIMEZONES } from '../utils/dateFormat.js';

export default function Settings() {
  const navigate = useNavigate();
  const { persona }            = useRole();
  const { user, updateUser }   = useAuth();
  const { theme, setTheme, themes } = useTheme();
  const { isMobile }           = useWindowSize();

  // Real values off the authenticated session.
  const initialDisplayName = user?.displayName ?? persona.displayName;
  const initialAvatarId    = user?.avatarColour ?? AVATAR_OPTIONS[0].id;
  const initialTimezone    = user?.timezone ?? getUserTimezone();

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [avatarId, setAvatarId]       = useState(initialAvatarId);
  const [timezone, setTimezone]       = useState(initialTimezone);

  // Saved baseline — what was last committed
  const [savedName,     setSavedName]     = useState(initialDisplayName);
  const [savedAvatarId, setSavedAvatarId] = useState(initialAvatarId);
  const [savedTimezone, setSavedTimezone] = useState(initialTimezone);
  const [saveStatus,  setSaveStatus]  = useState(null); // null | 'saving' | 'saved'
  const [saveError,   setSaveError]   = useState('');

  const isDirty = displayName !== savedName || avatarId !== savedAvatarId || timezone !== savedTimezone;

  async function handleSave() {
    if (!isDirty) return;
    setSaveStatus('saving');
    setSaveError('');

    try {
      const updated = await usersApi.updateMe({ displayName, avatarColour: avatarId, timezone });
      updateUser(updated); // patches the cached session — sidebar/persona reflect this immediately
      setUserTimezone(timezone); // dateFormat.js's own display helpers still read this locally
      setSavedName(displayName);
      setSavedAvatarId(avatarId);
      setSavedTimezone(timezone);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save your changes. Please try again.');
      setSaveStatus(null);
    }
  }

  // Theme applies instantly on click regardless of the Save button (same UX
  // as before), and persists immediately rather than waiting on the profile
  // Save, matching that same "instant" semantic. Best-effort: a failed save
  // here doesn't block the (already-applied) live theme change, since
  // reverting the swatch after the fact would be more confusing than a
  // preference that didn't quite make it to the server.
  function handleThemeSelect(themeId) {
    setTheme(themeId);
    usersApi.updateMe({ themePreference: themeId })
      .then(updated => updateUser(updated))
      .catch(err => console.error('Could not save theme preference:', err));
  }

  return (
    <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '880px' }}>
      <div style={{ marginBottom: '18px' }}>
        <h1 style={s.pageTitle}>Settings</h1>
        <p style={s.pageSubtitle}>Account · Preferences</p>
      </div>

      {/* ── Appearance ───────────────────────────────────────────────────── */}
      <div style={{ ...s.card, marginBottom: '16px' }}>
        <h2 style={s.cardTitle}>Appearance</h2>
        <p style={{ fontSize: '0.8125rem', color: colors.ink500, margin: '0 0 14px' }}>
          Choose the design system applied across MedBroker. Your choice is saved to your profile.
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap: '12px',
        }}>
          {themes.map(t => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => handleThemeSelect(t.id)}
                style={{
                  textAlign: 'left', cursor: 'pointer', padding: 0, overflow: 'hidden',
                  background: colors.surface, fontFamily: 'inherit',
                  border: `1px solid ${active ? 'var(--accent)' : colors.line}`,
                  borderRadius: 'var(--r-card)',
                  boxShadow: active ? '0 0 0 2px color-mix(in srgb, var(--accent) 50%, transparent)' : 'none',
                  transition: 'box-shadow 0.18s, border-color 0.18s, transform 0.18s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '5px', height: '64px', padding: '12px' }}>
                  {[90, 60, 38].map((h, i) => (
                    <span key={i} style={{
                      flex: 1, height: `${h}%`, borderRadius: '4px 4px 0 0',
                      background: i === 0 ? t.swatch[0] : i === 1 ? t.swatch[1] : colors.ink500,
                    }} />
                  ))}
                </div>
                <div style={{ padding: '10px 12px', borderTop: `1px solid ${colors.line}` }}>
                  <div style={{ fontFamily: 'var(--disp)', fontSize: '0.85rem', fontWeight: 700, color: colors.ink }}>
                    {t.name}{active && <span style={{ color: colors.primary }}> ✓</span>}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: colors.ink500, marginTop: '2px' }}>{t.mood}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Date & Time ──────────────────────────────────────────────────── */}
      <div style={{ ...s.card, marginBottom: '16px' }}>
        <h2 style={s.cardTitle}>Date &amp; Time</h2>
        <p style={{ fontSize: '0.8125rem', color: colors.ink500, margin: '0 0 14px' }}>
          Dates display as DD-MM-YYYY throughout MedBroker. Choose the timezone
          appointment times are shown in.
        </p>
        <div style={{ maxWidth: '360px' }}>
          <label style={s.formLabel}>Timezone</label>
          <select style={s.formInput} value={timezone} onChange={e => setTimezone(e.target.value)}>
            {SUPPORTED_TIMEZONES.map(tz => (
              <option key={tz.id} value={tz.id}>{tz.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 1fr', gap: '16px' }}>
        {/* ── Profile ────────────────────────────────────────────────────── */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>Profile</h2>
          <div style={s.formGroup}>
            <label style={s.formLabel}>Display name</label>
            <input style={s.formInput} value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </div>
          <div style={s.formGroup}>
            <label style={s.formLabel}>Email</label>
            <input style={{ ...s.formInput, opacity: 0.6 }} value={user?.email ?? ''} disabled />
          </div>
          <div style={s.formGroup}>
            <label style={s.formLabel}>Role</label>
            <span style={{ ...s.badge, background: colors.primarySoft, color: colors.primary }}>{persona.role}</span>
          </div>
        </div>

        {/* ── Security (§72) ─────────────────────────────────────────────── */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>Security</h2>
          <p style={{ fontSize: '0.8125rem', color:'var(--mut)', margin: '0 0 12px' }}>
            Change your password. You'll need your current password to do this.
          </p>
          <button style={s.secondaryBtn} onClick={() => navigate('/change-password')}>
            Change password
          </button>
        </div>

        {/* ── Avatar ─────────────────────────────────────────────────────── */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>Avatar</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '62px', height: '62px', borderRadius: '50%', flexShrink: 0,
              display: 'grid', placeItems: 'center', color: '#fff',
              fontSize: '1.3rem', fontWeight: 700, background: avatarColourValue(avatarId),
              boxShadow: '0 6px 18px -6px var(--glow)',
            }}>
              {persona.initials}
            </div>
            <div style={{ fontSize: '0.78rem', color: colors.ink500 }}>
              Initials show until a photo is uploaded.<br />Pick an accent below.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            {AVATAR_OPTIONS.map(o => (
              <button
                key={o.id}
                onClick={() => setAvatarId(o.id)}
                aria-label={`Avatar colour ${o.id}`}
                style={{
                  width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer',
                  background: o.value, padding: 0,
                  border: `2px solid ${avatarId === o.id ? colors.ink : 'transparent'}`,
                }}
              />
            ))}
          </div>
          {/* Photo upload — deliberate Phase 2 stub. Real file/blob storage
              (Vercel Blob or equivalent) is a separate, larger piece of scope
              than the colour/name/theme/timezone preferences this pass wires
              up — disabled rather than a clickable no-op, so it doesn't look
              like a live control that silently does nothing. */}
          <button style={{ ...s.secondaryBtn, marginTop: '16px', opacity: 0.5, cursor: 'default' }} disabled title="Coming soon">
            Upload photo — coming soon
          </button>
        </div>
      </div>

      {/* ── Save row ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--line)',
      }}>
        <button
          onClick={handleSave}
          disabled={!isDirty || saveStatus === 'saving'}
          style={{
            ...s.primaryBtn,
            opacity: (!isDirty || saveStatus === 'saving') ? 0.45 : 1,
            cursor:  (!isDirty || saveStatus === 'saving') ? 'default' : 'pointer',
            transition: 'opacity 0.2s',
          }}
        >
          {saveStatus === 'saving' ? 'Saving…' : 'Save changes'}
        </button>
        {saveStatus === 'saved' && (
          <span style={{ fontSize: '0.8125rem', color: colors.success, fontWeight: 500 }}>
            ✓ Changes saved
          </span>
        )}
        {isDirty && saveStatus === null && !saveError && (
          <span style={{ fontSize: '0.8125rem', color: colors.ink500 }}>
            You have unsaved changes
          </span>
        )}
        {saveError && (
          <span style={{ fontSize: '0.8125rem', color: colors.danger, fontWeight: 500 }}>
            {saveError}
          </span>
        )}
      </div>
    </div>
  );
}
