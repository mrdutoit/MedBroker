import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; // 1 Oct 2026 — ESM has no __dirname (CI lint error)
import { ACTION_LABELS, describeEntry } from './AuditLogList.jsx';

// AuditLogList.test.js — 1 Oct 2026. Every audit action api-lib writes has a
// human label, so no Change Log or History entry ever shows a raw action name.
const WRITTEN = [
  'AppointmentBrokerAssigned', 'AppointmentClaimed', 'AppointmentClosedForErasure', 'AppointmentCreated',
  'AppointmentOutcomeSaved', 'AppointmentReassigned', 'AppointmentReopened', 'AppointmentReturnedToLeads',
  'AppointmentUpdated', 'AttendeeAdded', 'AttendeeCheckInReverted', 'AttendeeCheckedIn', 'AttendeeRemoved',
  'CallLogged', 'EventCreated', 'EventStatusChanged', 'FeatureFlagUpdated', 'IntegrationCredentialUpdated',
  'LeadAssigned', 'LeadCreated', 'LeadDeleted', 'LeadReassigned', 'LeadReopened', 'LeadUpdated',
  'MedicalSubscriptionCreated', 'MeetingAttemptSaved', 'PasswordForceReset', 'PortalAccountActivated',
  'PortalCheckedIn', 'PortalProfileUpdated', 'PortalRegistration', 'PortalWalkInCheckedIn', 'PortfolioCreated',
  'PortfolioDeleted', 'PortfolioStatusChanged', 'ProductCreated', 'ProductDeleted', 'ProductStatusChanged',
  'ProfileUpdated', 'SarAssigned', 'SarDataExported', 'SarDeletionExecuted', 'SarRequestCreated',
  'SarStatusChanged', 'SsoUserJitProvisioned', 'SystemConfigUpdated', 'TaskAutoCompleted', 'TaskCompleted',
  'TaskCreated', 'TaskDeleted', 'TaskReopened', 'TaskUpdated', 'TokenManualTopUp', 'TokenPaystackCredited',
  'TokenStripeCredited', 'UserCreated', 'UserDeactivated', 'UserEmailCorrected', 'UserIdentityLinked',
  'UserIdentityUnlinked', 'UserReactivated', 'UserSessionsRevoked', 'UserUnlocked', 'UserUpdated',
];

// The quoted action names in every writeAuditLog({ action: ... }) in api-lib,
// ternaries included — so a new action that skips the list above fails here.
function scanApiLib(dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../api-lib'), out = new Set()) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { scanApiLib(p, out); continue; }
    if (!p.endsWith('.js') || p.endsWith('.test.js')) continue;
    const s = fs.readFileSync(p, 'utf8');
    for (let i = s.indexOf('action:'); i !== -1; i = s.indexOf('action:', i + 1)) {
      let chunk = s.slice(i + 7, i + 400);
      const stop = chunk.search(/performedById|\n\s*[a-zA-Z]+:/);
      if (stop >= 0) chunk = chunk.slice(0, stop);
      for (const m of chunk.matchAll(/'([A-Z][A-Za-z]+)'/g)) out.add(m[1]);
    }
  }
  return out;
}

describe('ACTION_LABELS', () => {
  it('the static list covers every action api-lib writes', () => {
    const missing = [...scanApiLib()].filter(a => !WRITTEN.includes(a));
    expect(missing).toEqual([]);
  });

  it.each(WRITTEN)('%s has a human label', (action) => {
    expect(ACTION_LABELS[action]).toBeTruthy();
    expect(describeEntry({ action, changeDetail: null })).not.toBe(action);
  });

  it('the controller-specified wording', () => {
    expect(ACTION_LABELS).toMatchObject({
      AppointmentReopened: 'Appointment reopened after Closed Lost', AppointmentClaimed: 'Claimed by broker',
      MeetingAttemptSaved: 'Meeting outcome recorded', SarRequestCreated: 'POPIA request created',
      SarStatusChanged: 'POPIA request status changed', SarAssigned: 'POPIA request assigned',
      SarDataExported: 'POPIA data exported', PortalRegistration: 'Registered on the portal',
      PortalAccountActivated: 'Portal account activated', PortalProfileUpdated: 'Updated their details on the portal',
    });
  });
});
