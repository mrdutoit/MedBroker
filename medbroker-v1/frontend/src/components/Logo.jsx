/**
 * components/Logo.jsx
 * MedBroker "Aperture" mark — a monoline MB (the M's right stem doubles as the
 * B's spine) on an accent-gradient tile, with a thin orbital arc + node and a
 * soft corner sheen for a precise, futuristic finish. The tile gradient and
 * sheen use the active theme's accent variables, so the mark reskins with the
 * theme. useId keeps gradient ids unique when multiple Logos render.
 */

import { useId } from 'react';

export function Logo({ size = 32, withWordmark = false }) {
  const raw = useId().replace(/:/g, '');
  const g = `mbg-${raw}`;
  const sh = `mbs-${raw}`;
  const small = size < 28;

  const mark = (
    <svg
      viewBox="0 0 120 120" width={size} height={size}
      role="img" aria-label="MedBroker" style={{ flexShrink: 0, display: 'block' }}
    >
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent2)" />
        </linearGradient>
        <radialGradient id={sh} cx="0.28" cy="0.16" r="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.30" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="120" height="120" rx="28" fill={`url(#${g})`} />
      <rect width="120" height="120" rx="28" fill={`url(#${sh})`} />
      {!small && (
        <>
          <path d="M14,40 A 56 56 0 0 1 108 18" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
          <circle cx="108" cy="18" r="4.6" fill="#fff" opacity="0.9" />
        </>
      )}
      <g fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="26,90 26,28 49,60 72,28 72,90" />
        <path d="M72,28 C 98,28 98,56 72,56" />
        <path d="M72,60 C 98,60 98,90 72,90" />
      </g>
    </svg>
  );

  if (!withWordmark) return mark;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {mark}
      <div>
        <div style={{
          fontFamily: 'var(--disp)', fontWeight: 800, fontSize: '1rem',
          color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1,
        }}>
          MedBroker
        </div>
        <div style={{
          fontSize: '0.625rem', color: 'var(--mut)', textTransform: 'uppercase',
          letterSpacing: '0.16em', marginTop: '3px',
        }}>
          Lead Management
        </div>
      </div>
    </div>
  );
}

export default Logo;
