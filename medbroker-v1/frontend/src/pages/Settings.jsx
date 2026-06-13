/**
 * pages/Settings.jsx
 * Account preferences — available to every role.
 *   • Appearance: choose the design-system theme (applied live, saved to profile).
 *   • Profile: display name, email, role.
 *   • Avatar: initials with an accent choice (photo upload is a stub until the
 *     Users API exists; name/avatar persist locally for now).
 */

import { useState }     from 'react';
import { useRole }       from '../context/RoleContext.jsx';
import { useTheme }      from '../context/ThemeContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { s, colors }     from '../styles/tokens.js';

const AVATAR_OPTIONS = [
  { id: 'grad',    value: 'linear-gradient(135deg, var(--accent), var(--accent2))' },
  { id: 'violet',  value: '#7c3aed' },
  { id: 'cyan',    value: '#0891b2' },
  { id: 'green',   value: '#15803d' },
  { id: 'amber',   value: '#d97706' },
];

export default function Settings() {
  const { persona }            = useRole();
  const { theme, setTheme, themes } = useTheme();
  const { isMobile }           = useWindowSize();

  const [displayName, setDisplayName] = useState(persona.displayName);
  const [avatar, setAvatar]           = useState(AVATAR_OPTIONS[0].value);

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
                onClick={() => setTheme(t.id)}
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
            <input style={{ ...s.formInput, opacity: 0.6 }} value="user@medbroker.co.za" disabled />
          </div>
          <div style={s.formGroup}>
            <label style={s.formLabel}>Role</label>
            <span style={{ ...s.badge, background: colors.primarySoft, color: colors.primary }}>{persona.role}</span>
          </div>
        </div>

        {/* ── Avatar ─────────────────────────────────────────────────────── */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>Avatar</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '62px', height: '62px', borderRadius: '50%', flexShrink: 0,
              display: 'grid', placeItems: 'center', color: '#fff',
              fontSize: '1.3rem', fontWeight: 700, background: avatar,
              boxShadow: '0 6px 18px -6px var(--glow)',
            }}>
              {persona.initials}
            </div>
            <div style={{ fontSize: '0.78rem', color: colors.ink500 }}>
              Initials show until a photo is uploaded.<br />Pick an accent or upload an image.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            {AVATAR_OPTIONS.map(o => (
              <button
                key={o.id}
                onClick={() => setAvatar(o.value)}
                aria-label={`Avatar colour ${o.id}`}
                style={{
                  width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer',
                  background: o.value, padding: 0,
                  border: `2px solid ${avatar === o.value ? colors.ink : 'transparent'}`,
                }}
              />
            ))}
          </div>
          <button style={{ ...s.primaryBtn, marginTop: '16px' }}>Upload photo</button>
        </div>
      </div>
    </div>
  );
}
