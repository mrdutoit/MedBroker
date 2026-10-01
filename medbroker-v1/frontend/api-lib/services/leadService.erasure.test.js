import { describe, it, expect, vi, beforeEach } from 'vitest';

// 30 Sep 2026 — S-I7: erasure must reach the PII embedded in the rows it keeps.
vi.mock('./db.js', () => ({
  sql: new Proxy({}, { get: () => { const m = () => m; m.MAX = 'MAX'; return m; } }),
  executeQuery: vi.fn(),
  executeQueryOne: vi.fn(),
}));

import { executeQuery } from './db.js';
import { eraseLeadPII, scrubAuditDetail } from './leadService.js';

const AUDIT_ROW = {
  id: 'A1',
  changeDetail: '{"email":{"from":"a@b.co","to":"c@d.co"},"idNumber":{"changed":true,"sealed":"ENC(x)"},"leadName":"Jo Soap"}',
};

const ATTENDEE_ROWS = [
  { id: 'E1', changeDetail: '{"leadId":"L1","leadName":"Jo Soap","createdNewLead":false}' },
  { id: 'E2', changeDetail: '{"leadId":"L1x","leadName":"Someone Else"}' }, // LIKE-prefilter false positive
];
const SAR_ROW = { id: 'S1', changeDetail: '{"sarId":"S1","assignedToId":null,"leadName":"Jo Soap"}' };

let calls;
beforeEach(() => {
  calls = [];
  executeQuery.mockReset();
  executeQuery.mockImplementation(async (query, params = {}) => {
    const values = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.value]));
    calls.push({ query, values });
    if (/AttendeeAdded/.test(query)) return ATTENDEE_ROWS;
    if (/entityType = 'SubjectAccessRequest'/.test(query)) return [SAR_ROW];
    if (/SELECT[\s\S]*FROM AuditLog/i.test(query)) return [AUDIT_ROW];
    return [];
  });
});

const find = (re) => calls.filter((c) => re.test(c.query));

describe('eraseLeadPII — PII outside the Lead row', () => {
  it('soft-deletes and scrubs the lead\'s portal account', async () => {
    await eraseLeadPII('L1');
    const [c] = find(/UPDATE LeadPortalAccount/i);
    expect(c).toBeDefined();
    expect(c.query).toMatch(/deletedAt\s*=/i);
    expect(c.query).toMatch(/passwordHash\s*=/i);
    expect(c.values.leadId).toBe('L1');
    expect(c.values.erasedEmail).toMatch(/@erased\.invalid$/);
  });

  it('nulls CallAttempt notes for the lead and MeetingAttempt notes for its appointments', async () => {
    await eraseLeadPII('L1');
    const [call] = find(/UPDATE CallAttempt SET notes = NULL/i);
    expect(call.values.leadId).toBe('L1');
    const [meeting] = find(/UPDATE MeetingAttempt SET notes = NULL/i);
    expect(meeting.query).toMatch(/FROM Appointment/i);
    expect(meeting.values.leadId).toBe('L1');
  });

  it('blanks the titles of kept tasks for the lead and its appointments', async () => {
    await eraseLeadPII('L1');
    const [c] = find(/UPDATE Task SET title = '\[Erased\]'/i);
    expect(c.query).toMatch(/entityType = 'Appointment'/);
    expect(c.values.leadId).toBe('L1');
  });

  it('deletes notifications about the lead and its appointments', async () => {
    await eraseLeadPII('L1');
    const [c] = find(/DELETE FROM Notification/i);
    expect(c.query).toMatch(/entityType = 'Lead'/);
    expect(c.query).toMatch(/entityType = 'Appointment'/);
    expect(c.values.leadId).toBe('L1');
  });

  it('rewrites audit changeDetail with values dropped and leadName removed', async () => {
    await eraseLeadPII('L1');
    const [select] = find(/SELECT[\s\S]*FROM AuditLog/i);
    expect(select.query).toMatch(/entityType = 'Lead'/);
    expect(select.query).toMatch(/entityType = 'Appointment'/);
    expect(select.values.leadId).toBe('L1');
    const [update] = find(/UPDATE AuditLog SET changeDetail/i);
    expect(update.values.id).toBe('A1');
    expect(JSON.parse(update.values.changeDetail)).toEqual({
      email: { changed: true },
      idNumber: { changed: true },
    });
  });
});

describe('eraseLeadPII — fix round 1', () => {
  it('deletes task notifications before the lead\'s open tasks are deleted', async () => {
    await eraseLeadPII('L1');
    const idx = (re) => calls.findIndex((c) => re.test(c.query));
    expect(idx(/DELETE FROM Notification/i)).toBeGreaterThan(-1);
    expect(idx(/DELETE FROM Task\b/i)).toBeGreaterThan(idx(/DELETE FROM Notification/i));
  });

  it('nulls the appointment address, link and feedback, and the call-attempt address', async () => {
    await eraseLeadPII('L1');
    const [appt] = find(/UPDATE Appointment SET/i);
    for (const col of ['firstAppointmentAddress', 'virtualMeetingLink', 'meeting1Feedback', 'meeting2Feedback', 'meeting3Feedback']) {
      expect(appt.query).toMatch(new RegExp(`${col} = NULL`));
    }
    expect(appt.values.leadId).toBe('L1');
    const [call] = find(/UPDATE CallAttempt SET/i);
    expect(call.query).toMatch(/appointmentAddress = NULL/);
  });

  it('blanks comments on the lead\'s tasks', async () => {
    await eraseLeadPII('L1');
    const [c] = find(/UPDATE TaskComment SET body = '\[Erased\]'/i);
    expect(c.values.leadId).toBe('L1');
  });

  it('drops leadName from this lead\'s AttendeeAdded rows only', async () => {
    await eraseLeadPII('L1');
    const [sel] = find(/AttendeeAdded/);
    expect(sel.values.leadIdPattern).toBe('%"leadId":"L1"%');
    const updates = find(/UPDATE AuditLog SET changeDetail/i);
    const e1 = updates.find((u) => u.values.id === 'E1');
    expect(JSON.parse(e1.values.changeDetail)).toEqual({ leadId: 'L1', createdNewLead: false });
    expect(updates.find((u) => u.values.id === 'E2')).toBeUndefined();
  });

  it('drops leadName from this lead\'s SAR audit rows, keeping the rest', async () => {
    await eraseLeadPII('L1');
    const [sel] = find(/entityType = 'SubjectAccessRequest'/);
    expect(sel.values.leadId).toBe('L1');
    const u = find(/UPDATE AuditLog SET changeDetail/i).find((x) => x.values.id === 'S1');
    expect(JSON.parse(u.values.changeDetail)).toEqual({ sarId: 'S1', assignedToId: null });
  });
});

describe('eraseLeadPII — fix round 2 (SAR operational artefacts)', () => {
  it('blanks titles/detail and comments of this lead\'s SAR tasks', async () => {
    await eraseLeadPII('L1');
    const sarScope = /entityType = 'SubjectAccessRequest' AND entityId::text IN \(SELECT id::text FROM SubjectAccessRequest WHERE leadId::text = @leadId AND organisationId = @organisationId\)/;
    const [task] = find(/UPDATE Task SET title = '\[Erased\]', detail = NULL/i);
    expect(task.query).toMatch(sarScope);
    const [comment] = find(/UPDATE TaskComment SET body/i);
    expect(comment.query).toMatch(sarScope);
  });

  it('deletes notifications on this lead\'s SARs and on their tasks', async () => {
    await eraseLeadPII('L1');
    const [c] = find(/DELETE FROM Notification/i);
    expect(c.query).toMatch(/entityType = 'SubjectAccessRequest' AND entityId IN \(SELECT id::text FROM SubjectAccessRequest WHERE leadId::text = @leadId/);
    // Task-typed notifications reuse the same task scope, SAR tasks included.
    expect(c.query).toMatch(/entityType = 'Task' AND entityId IN \([\s\S]*'SubjectAccessRequest'/);
  });
});

describe('scrubAuditDetail', () => {
  it('nameOnly drops leadName and leaves other keys, including notes and requestor details', () => {
    expect(scrubAuditDetail({ leadName: 'Jo', notes: 'n', requestorName: 'Jo', email: { from: 'a', to: 'b' } }, { nameOnly: true }))
      .toEqual({ notes: 'n', requestorName: 'Jo', email: { from: 'a', to: 'b' } });
  });

  it('reduces appointment address/feedback changes to { changed: true }', () => {
    expect(scrubAuditDetail({
      firstAppointmentAddress: { from: '1 Main Rd', to: '2 Main Rd' },
      virtualMeetingLink: { from: null, to: 'https://meet/x' },
      meeting2Feedback: { from: null, to: 'talked about his diabetes' },
    })).toEqual({
      firstAppointmentAddress: { changed: true }, virtualMeetingLink: { changed: true }, meeting2Feedback: { changed: true },
    });
  });

  it('drops leadName and notes, keeps non-PII keys', () => {
    expect(scrubAuditDetail({ callAttemptId: 'c1', outcome: 'NoAnswer', notes: 'has diabetes', leadName: 'Jo' }))
      .toEqual({ callAttemptId: 'c1', outcome: 'NoAnswer' });
  });

  it('reduces identity and sensitive field changes to { changed: true }', () => {
    const out = scrubAuditDetail({
      firstName: { from: 'Jo', to: 'Joe' },
      lastName: { from: 'Soap', to: 'Soape' },
      mobileNumber: { from: '0821', to: '0822' },
      whatsappNumber: { from: null, to: '0823' },
      dateOfBirth: { from: '1990-01-01', to: '1990-01-02' },
      hospitalOrPractice: { from: 'X', to: 'Y' },
      medicalAid: { changed: true, sealed: 'ENC(y)' },
      policies: { from: 'a', to: 'b' },
      pipelineStatus: { from: 'New', to: 'Contacted' },
    });
    expect(out).toEqual({
      firstName: { changed: true }, lastName: { changed: true },
      mobileNumber: { changed: true }, whatsappNumber: { changed: true },
      dateOfBirth: { changed: true }, hospitalOrPractice: { changed: true },
      medicalAid: { changed: true }, policies: { changed: true },
      pipelineStatus: { from: 'New', to: 'Contacted' },
    });
    expect(JSON.stringify(out)).not.toMatch(/sealed|Jo|Soap|082/);
  });

  it('passes through null and non-objects', () => {
    expect(scrubAuditDetail(null)).toBeNull();
    expect(scrubAuditDetail('x')).toBe('x');
  });
});
