/**
 * components/Logo.jsx — MedBroker mark (final, fixed).
 *
 * M: round caps, two open peaks, left leg down, no right descender.
 * B: angular bowls (flat runs + tight Q corners + square caps), equal size.
 *    B spine offset 6px right of M peak — no stroke overlap.
 * Single gradient (blue→cyan) across the full mark width, userSpaceOnUse.
 * dark prop: brightened colours for dark theme backgrounds.
 */
import { useId } from 'react';

const GRAD_STD    = ['#2F4FE0','#1A7FCF','#17B6C9'];
const GRAD_BRIGHT = ['#4F6FFF','#2090DD','#22D3EE'];

export function Logo({ size = 30, withWordmark = false, dark = false }) {
  const uid  = useId().replace(/:/g,'');
  const gid  = `mbg-${uid}`;
  const cols = dark ? GRAD_BRIGHT : GRAD_STD;
  // Natural bbox incl. half-stroke (6.5): x 13.5–136.5, y 17.5–98.5
  // Aspect ratio 123:81 ≈ 1.52
  const w = Math.round(size * 1.52);

  const mark = (
    <svg
      viewBox="13.5 17.5 123 81" width={w} height={size}
      role="img" aria-label="MedBroker"
      style={{ flexShrink:0, display:'block' }}
    >
      <defs>
        <linearGradient id={gid} x1="20" y1="0" x2="130" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={cols[0]}/>
          <stop offset="52%"  stopColor={cols[1]}/>
          <stop offset="100%" stopColor={cols[2]}/>
        </linearGradient>
      </defs>
      <g fill="none" stroke={`url(#${gid})`} strokeWidth="13" strokeLinejoin="round">
        {/* M — round caps */}
        <polyline points="20,92 20,24 52,62 84,24" strokeLinecap="round"/>
        {/* B top bowl — offset from M peak, equal geometry to bottom */}
        <path d="M90,24 L118,24 Q130,24 130,36 L130,46 Q130,58 118,58 L90,58" strokeLinecap="square"/>
        {/* B bottom bowl — identical width and corner radius */}
        <path d="M90,58 L118,58 Q130,58 130,70 L130,80 Q130,92 118,92 L90,92" strokeLinecap="square"/>
      </g>
    </svg>
  );

  if (!withWordmark) return mark;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
      {mark}
      <div>
        <div style={{ fontFamily:'var(--disp)', fontWeight:800, fontSize:'1rem',
                      color:'var(--ink)', letterSpacing:'-0.02em', lineHeight:1 }}>
          MedBroker
        </div>
        <div style={{ fontSize:'0.625rem', color:'var(--mut)', textTransform:'uppercase',
                      letterSpacing:'0.16em', marginTop:'3px' }}>
          Lead Management
        </div>
      </div>
    </div>
  );
}
export default Logo;
