/**
 * styles/tokens.js
 * Shared design tokens. Named exports only — NO default export (a default import
 * breaks the Rollup/Vercel build).
 *
 * Theming: colour values resolve to the CSS variables defined per theme in
 * themes.css (var(--accent), var(--ink), var(--panel)…). Because every token
 * points at a variable, switching data-theme on <html> reskins the entire app
 * with no re-render. Structural tokens (radius, shadow, type) are theme-neutral.
 *
 * Status sets (schema v2.4 — unchanged since v2.2; v2.3/v2.4 were additive).
 *   Lead: Unassigned, Assigned, InProgress, AppointmentScheduled, Closed
 *   Appointment: Unassigned, Assigned, InProgress, ClosedWon, ClosedLost
 *
 * Note: STATUS_META / APPT_STATUS_META / MEETING_STATUS_META / PORTFOLIO_META
 * keep fixed semantic colours for now (recognisable status chips). Mapping them
 * onto theme tokens is part of the page-by-page inline-colour sweep.
 */

const mix = (v, pct) => `color-mix(in srgb, ${v} ${pct}%, transparent)`;

// ─── Scale tokens ────────────────────────────────────────────────────────────
export const colors = {
  primary:       'var(--accent)',
  primaryDark:   'var(--accent2)',
  primarySoft:   mix('var(--accent)', 15),
  primaryBorder: mix('var(--accent)', 38),

  ink:           'var(--ink)',
  ink700:        'var(--ink)',
  ink500:        'var(--mut)',
  ink400:        'var(--mut)',
  line:          'var(--line)',
  lineSoft:      'var(--line)',
  inputBorder:   'var(--line)',
  surface:       'var(--panel)',
  surfaceMuted:  'var(--panel2)',
  surfaceSubtle: 'var(--glass)',

  success: 'var(--live)',    successSoft: mix('var(--live)', 14),    successBorder: mix('var(--live)', 34),
  warn:    'var(--limited)', warnSoft:    mix('var(--limited)', 14), warnBorder:    mix('var(--limited)', 34),
  danger:  'var(--danger)',  dangerSoft:  mix('var(--danger)', 14),  dangerBorder:  mix('var(--danger)', 34),
};

export const radius = { sm: '10px', md: '14px', lg: '18px', pill: '999px' };

export const shadow = {
  xs:    '0 1px 2px rgba(0,0,0,0.05)',
  sm:    '0 1px 2px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.06)',
  md:    '0 2px 4px rgba(0,0,0,0.05), 0 12px 32px -12px rgba(0,0,0,0.18)',
  lg:    '0 24px 60px -20px rgba(0,0,0,0.35)',
  glow:  '0 16px 40px -18px var(--glow)',
  focus: '0 0 0 3px color-mix(in srgb, var(--accent) 45%, transparent)',
};

export const type = {
  xs: '0.6875rem', sm: '0.75rem', base: '0.8125rem', md: '0.875rem',
  lg: '1rem', xl: '1.375rem', xxl: '1.5rem',
  numeric: { fontVariantNumeric: 'tabular-nums' },
  display: 'var(--disp)', body: 'var(--body)', mono: 'var(--mono)',
};

export const CHART_PALETTE = {
  leads: 'var(--accent)', won: 'var(--live)',
  grid: 'var(--line)', axis: 'var(--mut)', future: 'var(--na)',
};

// ─── Status / portfolio metadata (fixed semantics; swept later) ─────────────────
export const STATUS_META = {
  Unassigned:            { colour: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb', label: 'Unassigned' },
  Assigned:              { colour: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', label: 'Assigned' },
  InProgress:            { colour: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'In Progress' },
  AppointmentScheduled:  { colour: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', label: 'Appt Scheduled' },
  Closed:                { colour: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb', label: 'Closed' },
};

export const APPT_STATUS_META = {
  Unassigned: { colour: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'Unassigned' },
  Assigned:   { colour: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', label: 'Assigned'   },
  InProgress: { colour: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', label: 'In Progress' },
  ClosedWon:  { colour: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', label: 'Closed Won'  },
  ClosedLost: { colour: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Closed Lost' },
};

export const MEETING_STATUS_META = {
  Pending:     { colour: '#6b7280', bg: '#f3f4f6' },
  Seen:        { colour: '#15803d', bg: '#f0fdf4' },
  Rescheduled: { colour: '#d97706', bg: '#fffbeb' },
  Cancelled:   { colour: '#dc2626', bg: '#fef2f2' },
};

export const PORTFOLIO_META = {
  Discovery:            { colour: '#1d4ed8', bg: '#eff6ff' },
  'Money and Medicine': { colour: '#7c3aed', bg: '#f5f3ff' },
  'M&M':                { colour: '#7c3aed', bg: '#f5f3ff' },
};

// ─── Common inline style objects (all theme-driven via colors above) ────────────
export const s = {
  page: { padding: '24px' },

  primaryBtn: {
    background: colors.primary, color: '#fff', border: 'none',
    borderRadius: radius.sm, padding: '8px 16px', cursor: 'pointer',
    fontSize: '0.875rem', fontWeight: 600, fontFamily: 'inherit',
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    boxShadow: shadow.glow, transition: 'transform 0.15s, box-shadow 0.15s, filter 0.15s',
  },
  secondaryBtn: {
    background: colors.surface, color: colors.ink700, border: `1px solid ${colors.line}`,
    borderRadius: radius.sm, padding: '7px 12px', cursor: 'pointer',
    fontSize: '0.875rem', fontFamily: 'inherit', transition: 'background 0.15s, border-color 0.15s',
  },
  ghostBtn: {
    background: 'none', color: colors.ink500, border: `1px solid ${colors.line}`,
    borderRadius: radius.sm, padding: '7px 12px', cursor: 'pointer',
    fontSize: '0.875rem', fontFamily: 'inherit', transition: 'background 0.15s',
  },
  dangerBtn: {
    background: colors.dangerSoft, color: colors.danger, border: `1px solid ${colors.dangerBorder}`,
    borderRadius: radius.sm, padding: '7px 12px', cursor: 'pointer',
    fontSize: '0.875rem', fontFamily: 'inherit', transition: 'background 0.15s',
  },
  linkBtn: {
    background: 'none', border: 'none', color: colors.primary,
    cursor: 'pointer', fontSize: '0.813rem', padding: '3px 6px',
    fontFamily: 'inherit', fontWeight: 600,
  },
  viewBtn: {
    background: 'none', border: 'none', color: colors.primary, fontWeight: 700,
    fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit',
    padding: '4px 8px', borderRadius: radius.sm, transition: 'background 0.15s',
  },

  chip: {
    background: colors.surface, color: colors.ink500, border: `1px solid ${colors.line}`,
    borderRadius: radius.pill, padding: '4px 12px', cursor: 'pointer',
    fontSize: '0.813rem', fontFamily: 'inherit', transition: 'all 0.12s',
  },
  chipActive: {
    background: colors.primarySoft, color: colors.primary, borderColor: colors.primaryBorder, fontWeight: 600,
  },
  segment: {
    display: 'inline-flex', border: `1px solid ${colors.line}`,
    borderRadius: radius.sm, overflow: 'hidden', background: colors.surface,
  },
  segmentBtn: {
    padding: '7px 14px', border: 'none', cursor: 'pointer',
    fontSize: '0.8125rem', fontFamily: 'inherit', fontWeight: 500,
    background: 'transparent', color: colors.ink500, transition: 'background 0.15s, color 0.15s',
  },
  segmentBtnActive: { background: colors.primary, color: '#fff', fontWeight: 600 },

  searchInput: {
    border: `1px solid ${colors.inputBorder}`, borderRadius: radius.sm,
    padding: '8px 12px', fontSize: '0.875rem', minWidth: '220px', outline: 'none',
    fontFamily: 'inherit', background: colors.surface, color: colors.ink,
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  select: {
    border: `1px solid ${colors.inputBorder}`, borderRadius: radius.sm,
    padding: '8px 12px', fontSize: '0.875rem', background: colors.surface, color: colors.ink,
    cursor: 'pointer', fontFamily: 'inherit', outline: 'none', colorScheme: 'light dark',
  },

  tableCard: {
    background: colors.surface, border: `1px solid ${colors.line}`,
    borderRadius: radius.md, overflow: 'auto', boxShadow: shadow.sm,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' },
  th: {
    textAlign: 'left', padding: '11px 16px', fontSize: '0.75rem',
    fontWeight: 600, color: colors.ink500, textTransform: 'uppercase',
    letterSpacing: '0.04em', borderBottom: `1px solid ${colors.line}`,
    background: colors.surfaceMuted, whiteSpace: 'nowrap',
  },
  td: { padding: '11px 16px', borderBottom: `1px solid ${colors.lineSoft}`, verticalAlign: 'middle' },
  tr: { background: 'transparent', transition: 'background 0.12s', cursor: 'default' },

  card: {
    background: colors.surface, border: `1px solid ${colors.line}`,
    borderRadius: radius.md, padding: '16px 18px', boxShadow: shadow.sm,
    transition: 'box-shadow 0.18s, transform 0.18s',
  },
  cardHover: { boxShadow: shadow.glow, transform: 'translateY(-2px)' },
  cardTitle: {
    fontFamily: type.display, fontSize: '0.95rem', fontWeight: 700, color: colors.ink, margin: 0,
    marginBottom: '12px', paddingBottom: '10px', borderBottom: `1px solid ${colors.lineSoft}`,
  },
  metricCard: {
    background: colors.surface, border: `1px solid ${colors.line}`,
    borderRadius: radius.md, padding: '14px 16px', boxShadow: shadow.sm,
  },

  pageTitle:    { margin: 0, fontFamily: type.display, fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', color: colors.ink },
  pageSubtitle: { margin: '4px 0 0', fontSize: '0.8125rem', color: colors.ink500 },
  kpiLabel:     { fontSize: '0.6875rem', color: colors.ink500, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 },
  kpiValue:     { fontFamily: type.display, fontSize: '1.75rem', fontWeight: 800, color: colors.ink, lineHeight: 1.1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' },
  kpiSub:       { fontSize: '0.75rem', color: colors.ink400, marginTop: '4px' },

  badge: {
    display: 'inline-block', padding: '2px 9px',
    borderRadius: radius.pill, fontSize: '0.75rem', fontWeight: 500,
  },
  noticeInfo: {
    background: colors.primarySoft, border: `1px solid ${colors.primaryBorder}`,
    borderRadius: radius.sm, padding: '10px 14px', fontSize: '0.813rem', color: colors.primary,
  },
  noticeWarn: {
    background: colors.warnSoft, border: `1px solid ${colors.warnBorder}`,
    borderRadius: radius.sm, padding: '10px 14px', fontSize: '0.813rem', color: colors.warn,
  },
  noticeSuccess: {
    background: colors.successSoft, border: `1px solid ${colors.successBorder}`,
    borderRadius: radius.sm, padding: '10px 14px', fontSize: '0.813rem', color: colors.success,
  },
  errorBox: {
    background: colors.dangerSoft, border: `1px solid ${colors.dangerBorder}`,
    borderRadius: radius.sm, padding: '12px 16px', color: colors.danger, fontSize: '0.875rem',
  },

  formGroup: { marginBottom: '14px' },
  formLabel: {
    display: 'block', fontSize: '0.8125rem', fontWeight: 500,
    color: colors.ink700, marginBottom: '5px',
  },
  formInput: {
    width: '100%', border: `1px solid ${colors.inputBorder}`, borderRadius: radius.sm,
    padding: '8px 10px', fontSize: '0.875rem', fontFamily: 'inherit',
    background: colors.surface, color: colors.ink, colorScheme: 'light dark',
    boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  formHint: { fontSize: '0.75rem', color: colors.ink400, marginTop: '3px' },

  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.55)',
    backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
  },
  modal: {
    background: colors.surface, borderRadius: radius.lg, padding: '24px',
    width: '480px', maxWidth: '95vw', maxHeight: '88vh',
    overflowY: 'auto', border: `1px solid ${colors.line}`, boxShadow: shadow.lg,
  },
  modalHeader: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: '16px',
  },
  modalTitle: { fontFamily: type.display, fontSize: '1rem', fontWeight: 700, color: colors.ink },
  closeBtn: {
    background: 'none', border: 'none', fontSize: '1.25rem',
    cursor: 'pointer', color: colors.ink500, lineHeight: 1,
  },
  modalFooter: {
    display: 'flex', gap: '8px', justifyContent: 'flex-end',
    marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${colors.line}`,
  },

  backBtn: {
    background: 'none', border: 'none', color: colors.ink500, cursor: 'pointer',
    fontSize: '0.813rem', padding: 0, fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px',
  },
  barTrack: { background: colors.surfaceSubtle, borderRadius: '999px', height: '7px', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: '999px' },
};
