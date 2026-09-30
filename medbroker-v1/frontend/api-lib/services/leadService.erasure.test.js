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

let calls;
beforeEach(() => {
  calls = [];
  executeQuery.mockReset();
  executeQuery.mockImplementation(async (query, params = {}) => {
    const values = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.value]));
    calls.push({ query, values });
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

describe('scrubAuditDetail', () => {
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
