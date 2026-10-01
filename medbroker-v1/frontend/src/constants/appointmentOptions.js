/**
 * constants/appointmentOptions.js — NEW, 1 Oct 2026. Cancellation and loss
 * reason wording, moved out of AppointmentDetail.jsx unchanged so Lead
 * Detail's journey (LeadPathJourney) shows the same labels.
 */

// 15 Aug 2026 (§172, migration 034) — mirrors AppointmentDetail's own
// lostReason dropdown exactly (same six-ish-category pattern, same
// "only shown once the triggering status is actually selected" UX).
export const CANCEL_REASONS = [
  { value: 'NoLongerInterested', label: 'No longer interested' },
  { value: 'FoundAlternative',   label: 'Found an alternative broker/solution' },
  { value: 'SchedulingConflict', label: 'Scheduling conflict, wants to rebook' },
  { value: 'Uncontactable',      label: 'Uncontactable' },
  { value: 'Other',              label: 'Other' },
];
export const CANCEL_REASON_LABELS = Object.fromEntries(CANCEL_REASONS.map(r => [r.value, r.label]));
// 28 Sep 2026 — for LeadJourney's outcome label; the same wording as
// AppointmentDetail's lostReason dropdown (and Reports.jsx's copy, §163).
export const LOST_REASON_LABELS = {
  PriceTooHigh: 'Price too high', ChoseCompetitor: 'Chose a competitor',
  NoLongerInterested: 'No longer interested', Uncontactable: 'Uncontactable',
  NotEligible: 'Not eligible', Other: 'Other', ConsentWithdrawn: 'Consent withdrawn (POPIA)',
};
