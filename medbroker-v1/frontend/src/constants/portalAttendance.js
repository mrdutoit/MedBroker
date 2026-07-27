/**
 * constants/portalAttendance.js — NEW, 24 Jul 2026.
 * Single source of truth for the RSVP/walk-in/registered colour-and-label
 * language used on both PortalCheckinConfirm.jsx (the full banner shown
 * right after scanning) and PortalDashboard.jsx (the compact per-event
 * pill in "Your Events" — Mark's ask that this status persist and be
 * visible without re-scanning). Keep both in sync via this file rather
 * than two copies drifting apart.
 */
export const ATTENDANCE_META = {
  rsvp: {
    bg: 'color-mix(in srgb, #15803d 14%, var(--panel))',
    color: '#15803d',
    border: 'color-mix(in srgb, #15803d 30%, var(--panel))',
    label: 'RSVP Attendance',
  },
  walkin: {
    bg: 'color-mix(in srgb, #db2777 14%, var(--panel))',
    color: '#db2777',
    border: 'color-mix(in srgb, #db2777 30%, var(--panel))',
    label: 'Walk-In Attendance',
  },
  // Registered but not yet checked in — neutral, not green or pink, since
  // neither confirms actual attendance yet.
  registered: {
    bg: 'var(--panel2)',
    color: 'var(--mut)',
    border: 'var(--line)',
    label: 'Registered',
  },
};
