/**
 * styles/tokens.js
 * Shared design tokens used across all page components.
 * Centralised here so badge colours, spacing, and card styles are consistent.
 *
 * Status sets (v2.2):
 *
 * LEAD pipeline statuses:
 *   Unassigned           — imported, not yet assigned to an agent
 *   Assigned             — agent assigned, not yet called
 *   InProgress           — agent is actively working the lead
 *   AppointmentScheduled — agent has booked an appointment (lead moves to Appointments list)
 *   Closed               — pipeline ended (won, lost, or uncontactable — outcome on Appointment)
 *
 * APPOINTMENT statuses:
 *   Unassigned — appointment booked, no broker assigned yet
 *   Assigned   — broker assigned (by admin/supervisor in assign model, or claimed in claim model)
 *   InProgress — meetings are underway
 *   ClosedWon  — customer signed
 *   ClosedLost — customer did not sign
 */

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
  Discovery:          { colour: '#1d4ed8', bg: '#eff6ff' },
  'Money and Medicine': { colour: '#7c3aed', bg: '#f5f3ff' },
  'M&M':              { colour: '#7c3aed', bg: '#f5f3ff' },
};

// Common inline style objects
export const s = {
  page: { padding: '24px' },
  primaryBtn: {
    background: '#1d4ed8', color: 'white', border: 'none',
    borderRadius: '6px', padding: '8px 16px', cursor: 'pointer',
    fontSize: '0.875rem', fontWeight: 500, fontFamily: 'inherit',
    display: 'inline-flex', alignItems: 'center', gap: '6px',
  },
  secondaryBtn: {
    background: 'white', color: '#374151', border: '1px solid #d1d5db',
    borderRadius: '6px', padding: '7px 12px', cursor: 'pointer',
    fontSize: '0.875rem', fontFamily: 'inherit',
  },
  ghostBtn: {
    background: 'none', color: '#6b7280', border: '1px solid #e5e7eb',
    borderRadius: '6px', padding: '7px 12px', cursor: 'pointer',
    fontSize: '0.875rem', fontFamily: 'inherit',
  },
  dangerBtn: {
    background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
    borderRadius: '6px', padding: '7px 12px', cursor: 'pointer',
    fontSize: '0.875rem', fontFamily: 'inherit',
  },
  linkBtn: {
    background: 'none', border: 'none', color: '#1d4ed8',
    cursor: 'pointer', fontSize: '0.813rem', padding: '3px 6px',
    fontFamily: 'inherit',
  },
  chip: {
    background: 'white', color: '#6b7280', border: '1px solid #e5e7eb',
    borderRadius: '20px', padding: '4px 12px', cursor: 'pointer',
    fontSize: '0.813rem', fontFamily: 'inherit', transition: 'all 0.1s',
  },
  chipActive: {
    background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe', fontWeight: 500,
  },
  searchInput: {
    border: '1px solid #d1d5db', borderRadius: '6px',
    padding: '8px 12px', fontSize: '0.875rem', minWidth: '220px', outline: 'none',
  },
  select: {
    border: '1px solid #d1d5db', borderRadius: '6px',
    padding: '8px 12px', fontSize: '0.875rem', background: 'white',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  tableCard: {
    background: 'white', border: '1px solid #e5e7eb',
    borderRadius: '8px', overflow: 'hidden',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' },
  th: {
    textAlign: 'left', padding: '10px 16px', fontSize: '0.75rem',
    fontWeight: 600, color: '#6b7280', textTransform: 'uppercase',
    letterSpacing: '0.04em', borderBottom: '1px solid #e5e7eb',
    background: '#f9fafb', whiteSpace: 'nowrap',
  },
  td: { padding: '11px 16px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' },
  tr: { background: 'white', transition: 'background 0.1s', cursor: 'default' },
  card: {
    background: 'white', border: '1px solid #e5e7eb',
    borderRadius: '8px', padding: '16px 18px',
  },
  cardTitle: {
    fontSize: '0.875rem', fontWeight: 600, color: '#374151',
    marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f3f4f6',
  },
  badge: {
    display: 'inline-block', padding: '2px 9px',
    borderRadius: '20px', fontSize: '0.75rem', fontWeight: 500,
  },
  noticeInfo: {
    background: '#eff6ff', border: '1px solid #bfdbfe',
    borderRadius: '6px', padding: '10px 14px', fontSize: '0.813rem', color: '#1e40af',
  },
  noticeWarn: {
    background: '#fffbeb', border: '1px solid #fde68a',
    borderRadius: '6px', padding: '10px 14px', fontSize: '0.813rem', color: '#92400e',
  },
  noticeSuccess: {
    background: '#f0fdf4', border: '1px solid #bbf7d0',
    borderRadius: '6px', padding: '10px 14px', fontSize: '0.813rem', color: '#15803d',
  },
  errorBox: {
    background: '#fef2f2', border: '1px solid #fecaca',
    borderRadius: '6px', padding: '12px 16px', color: '#dc2626', fontSize: '0.875rem',
  },
  formGroup: { marginBottom: '14px' },
  formLabel: {
    display: 'block', fontSize: '0.8125rem', fontWeight: 500,
    color: '#374151', marginBottom: '5px',
  },
  formInput: {
    width: '100%', border: '1px solid #d1d5db', borderRadius: '6px',
    padding: '8px 10px', fontSize: '0.875rem', fontFamily: 'inherit',
    boxSizing: 'border-box', outline: 'none',
  },
  formHint: { fontSize: '0.75rem', color: '#9ca3af', marginTop: '3px' },
  metricCard: {
    background: 'white', border: '1px solid #e5e7eb',
    borderRadius: '8px', padding: '14px 16px',
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
  },
  modal: {
    background: 'white', borderRadius: '10px', padding: '24px',
    width: '480px', maxWidth: '95vw', maxHeight: '88vh',
    overflowY: 'auto', border: '1px solid #e5e7eb',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  modalHeader: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: '16px',
  },
  modalTitle: { fontSize: '1rem', fontWeight: 600, color: '#111827' },
  closeBtn: {
    background: 'none', border: 'none', fontSize: '1.25rem',
    cursor: 'pointer', color: '#6b7280', lineHeight: 1,
  },
  modalFooter: {
    display: 'flex', gap: '8px', justifyContent: 'flex-end',
    marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #e5e7eb',
  },
  backBtn: {
    background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer',
    fontSize: '0.813rem', padding: 0, fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px',
  },
  barTrack: { background: '#e5e7eb', borderRadius: '4px', height: '7px', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: '4px' },
};
