/**
 * components/PasswordInput.jsx — NEW, 3 Aug 2026.
 * Shared password field with a Show/Hide toggle. Extracted from the
 * pattern already used on the staff Login page (pages/Login.jsx), which
 * had it but the Lead Portal's four password screens (Login, Register,
 * Activate, walk-in Check-in) never did — Mark caught this in testing.
 * Renders just the input + toggle button; callers keep their own
 * <div style={s.formGroup}> and <label> wrapper exactly as they do today
 * for a plain <input>, so this is a drop-in swap.
 */
import { useState } from 'react';
import { s, colors } from '../styles/tokens.js';

export function PasswordInput({
  id, value, onChange, autoComplete = 'current-password',
  required, minLength, style, autoFocus,
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        style={{ ...s.formInput, paddingRight: '56px', ...style }}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        style={{
          position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', color: colors.ink500,
          fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit', padding: '4px',
        }}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
