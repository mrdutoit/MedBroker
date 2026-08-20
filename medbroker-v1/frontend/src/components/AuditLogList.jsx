/**
 * components/AuditLogList.jsx — NEW, 23 Jul 2026.
 * Renders entries from GET /api/leads/:id/audit or /api/appointments/:id/audit
 * (both backed by the same generic AuditLog table / auditService.listAuditLog()).
 * Shared by LeadDetail.jsx (Audit Log) and AppointmentDetail.jsx (Change Log) —
 * same shape, same "alternating row shading" request from Mark, no reason for
 * two copies of the same list.
 *
 * FIXED 24 Jul 2026 (Mark's request): assign/reassign entries now show the
 * resolved display name ("Lead assigned to Thabo Molefe"), not just the
 * label — the writing handlers (leadHandlers.js, appointmentHandlers.js)
 * now resolve agentId/brokerId to a name via userService.getUserDisplayNameById()
 * at write time and store both id and name in changeDetail. Older entries
 * written before this fix only have the raw id, so describeEntry() falls
 * back to the generic action label for those rather than showing "undefined".
 */

import { format } from 'date-fns';

const ACTION_LABELS = {
  LeadCreated:                 'Lead created',
  LeadAssigned:                'Lead assigned to an agent',
  LeadReassigned:               'Lead reassigned to a different agent',
  LeadUpdated:                 'Lead details updated',
  LeadReopened:                'Lead reopened after Closed Lost',
  LeadDeleted:                 'Lead deleted',
  // §142, item 3 (13 Aug 2026) — the write itself (§138) and this label
  // were two separate gaps; the write always worked, this was always
  // falling back to describeEntry()'s raw entry.action string below.
  CallLogged:                  'Call logged',
  AppointmentCreated:          'Appointment booked',
  AppointmentBrokerAssigned:   'Broker assigned',
  AppointmentReassigned:       'Broker reassigned',
  AppointmentReturnedToLeads:  'Returned to Leads',
  AppointmentOutcomeSaved:     'Outcome updated',
  // 19 Aug 2026 — added alongside the new describeEntry() case below,
  // same session the write side (appointmentHandlers.js) shipped. Only
  // ever shown as a fallback if changeDetail is somehow empty — the
  // handler only writes this action when changeDetail has at least one
  // key — same defensive symmetry LeadUpdated's own fallback above has,
  // for the identical reason.
  AppointmentUpdated:          'Appointment details updated',
  // §12a (20 Aug 2026) — fallback only; describeEntry() below builds the
  // real message from changeDetail.outcome/retentionExpiresAt, same
  // pattern as LeadAssigned/AppointmentBrokerAssigned above.
  SarDeletionExecuted:         'POPIA deletion request executed',
};

const FIELD_LABELS = {
  dateOfBirth: 'Date of Birth', email: 'Email', mobileNumber: 'Contact Number',
  whatsappNumber: 'WhatsApp', universityAttended: 'University', yearOfAttendance: 'Year',
  degreeAttained: 'Degree', occupation: 'Job Title', hospitalOrPractice: 'Hospital / Practice',
  existingCover: 'Existing cover', policies: 'Current policies', medicalAid: 'Medical aid',
  medicalAidProvider: 'Medical aid provider', portfolios: 'Portfolio',
  // 19 Aug 2026 — Appointment-native fields (UPDATE_APPOINTMENT_COLUMNS,
  // appointmentService.js), added alongside the AppointmentUpdated
  // describeEntry() case below. idNumber deliberately NOT re-added here
  // despite also being editable now (AppointmentDetail.jsx) — it's a
  // Lead-owned field, always logged under LeadUpdated regardless of
  // which page the edit was made from, so it only ever needs the one
  // entry FIELD_LABELS is missing (added separately below).
  currentInsurer: 'Current insurer', meetingType: 'Meeting type',
  firstAppointmentDate: 'Appointment date', firstAppointmentTime: 'Appointment time',
  firstAppointmentAddress: 'Address', virtualMeetingLink: 'Meeting link',
  idNumber: 'ID Number',
};

function describeEntry(entry) {
  const label = ACTION_LABELS[entry.action] ?? entry.action;
  const detail = entry.changeDetail;
  if (!detail) return label;

  if (entry.action === 'LeadAssigned') {
    return detail.newAgentName ? `Lead assigned to ${detail.newAgentName}` : label;
  }

  if (entry.action === 'LeadReassigned') {
    if (detail.newAgentName && detail.previousAgentName) {
      return `Lead reassigned from ${detail.previousAgentName} to ${detail.newAgentName}`;
    }
    if (detail.newAgentName) return `Lead reassigned to ${detail.newAgentName}`;
    return label;
  }

  if (entry.action === 'AppointmentBrokerAssigned') {
    return detail.brokerName ? `Broker assigned: ${detail.brokerName}` : label;
  }

  if (entry.action === 'AppointmentReassigned') {
    const parts = [];
    if (detail.brokerName) {
      parts.push(detail.previousBrokerName
        ? `Broker reassigned from ${detail.previousBrokerName} to ${detail.brokerName}`
        : `Broker reassigned to ${detail.brokerName}`);
    }
    if (detail.agentName) parts.push(`Agent reassigned to ${detail.agentName}`);
    return parts.length ? parts.join('; ') : label;
  }

  // §12a (20 Aug 2026) — one action, two materially different outcomes;
  // distinguished by changeDetail.outcome rather than two action names,
  // same reasoning executeSarDeletion() (sarService.js) gives for
  // keeping this a single write.
  if (entry.action === 'SarDeletionExecuted') {
    if (detail.outcome === 'Erased') return 'POPIA deletion executed — personal information erased';
    if (detail.outcome === 'Restricted') {
      const until = detail.retentionExpiresAt
        ? format(new Date(detail.retentionExpiresAt), 'd MMM yyyy')
        : 'the FAIS retention date';
      return `POPIA deletion executed — retained under restriction until ${until} (FAIS record-keeping)`;
    }
    return label;
  }

  if (entry.action === 'LeadUpdated') {
    const format = (v) => {
      if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
      return v ?? '—';
    };
    const changes = Object.entries(detail).map(([field, change]) => {
      const fieldLabel = FIELD_LABELS[field] ?? field;
      return `${fieldLabel}: ${format(change?.from)} → ${format(change?.to)}`;
    });
    return changes.length ? changes.join('; ') : label;
  }

  // 19 Aug 2026 — added same session the write side shipped
  // (appointmentHandlers.js's PUT /appointments/:id). Mark caught this
  // one live: the write was correct from the start (real changeDetail,
  // confirmed against real Postgres before delivery), but nothing here
  // knew how to format the 'AppointmentUpdated' action, so it fell
  // through to the bare action-name fallback at the bottom of this
  // function — same bug shape as LeadUpdated would have had if this
  // case were missing, just never caught until now because this action
  // name didn't exist until this session. Deliberately identical
  // formatting to LeadUpdated immediately above — same shape of data,
  // same rule (FIELD_LABELS lookup, "—" for a missing from/to), no
  // reason for it to look different.
  if (entry.action === 'AppointmentUpdated') {
    const format = (v) => {
      if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
      return v ?? '—';
    };
    const changes = Object.entries(detail).map(([field, change]) => {
      const fieldLabel = FIELD_LABELS[field] ?? field;
      return `${fieldLabel}: ${format(change?.from)} → ${format(change?.to)}`;
    });
    return changes.length ? changes.join('; ') : label;
  }

  if (entry.action === 'AppointmentOutcomeSaved') {
    const parts = [];
    if (detail.customerSigned === true)  parts.push('Customer signed: Yes');
    if (detail.customerSigned === false) parts.push('Customer signed: No');
    for (const m of detail.meetings ?? []) {
      if (m.status) parts.push(`Meeting ${m.number}: ${m.status}`);
    }
    if (detail.newStatus) parts.push(`Status → ${detail.newStatus}`);
    return parts.length ? parts.join('; ') : label;
  }

  return label;
}

export default function AuditLogList({ entries, emptyLabel = 'No changes recorded yet.' }) {
  if (!entries || entries.length === 0) {
    return <p style={{ color: 'var(--mut)', fontSize: '0.875rem' }}>{emptyLabel}</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {entries.map((entry, i) => (
        <div
          key={entry.id}
          style={{
            padding: '8px 10px',
            borderRadius: '6px',
            // Alternating row shading, per Mark's request — even rows stay
            // transparent, odd rows get a faint theme-driven tint so it
            // still reads correctly on all four themes (light and dark).
            background: i % 2 === 1 ? 'var(--panel2)' : 'transparent',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--ink)', fontWeight: 500 }}>
              {describeEntry(entry)}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--mut)', whiteSpace: 'nowrap' }}>
              {format(new Date(entry.performedAt), 'd MMM yyyy, HH:mm')}
            </span>
          </div>
          {entry.performedByName && (
            <div style={{ fontSize: '0.75rem', color: 'var(--mut)', marginTop: '2px' }}>
              by {entry.performedByName}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
