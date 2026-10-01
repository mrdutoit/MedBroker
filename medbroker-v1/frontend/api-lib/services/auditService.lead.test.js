import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./encryption.js', () => ({ encrypt: vi.fn(async (x) => 'ENC(' + x + ')') }));
vi.mock('./db.js', () => ({ executeQuery: vi.fn(), executeQueryOne: vi.fn(), sql: new Proxy({}, { get: () => () => ({}) }) }));
vi.mock('../context/tenant.js', () => ({ resolveOrganisationId: () => 'org' }));

import { executeQuery } from './db.js';
import { listAuditLogForLead } from './auditService.js';

// 1 Oct 2026 — lead history now also carries its appointments' change log
describe('listAuditLogForLead', () => {
  beforeEach(() => executeQuery.mockReset());

  it('has three branches: Lead, SubjectAccessRequest, Appointment', async () => {
    executeQuery.mockResolvedValue([]);
    await listAuditLogForLead('lead-1');
    const sqlText = executeQuery.mock.calls[0][0];
    expect(sqlText.match(/UNION ALL/g)).toHaveLength(2);
    expect(sqlText.match(/\bSELECT al\.id/g)).toHaveLength(3);
    expect(sqlText).toMatch(/al\.entityType = 'Lead'/);
    expect(sqlText).toMatch(/al\.entityType = 'SubjectAccessRequest'/);
    expect(sqlText).toMatch(/al\.entityType = 'Appointment' AND al\.entityId IN \(SELECT id::text FROM Appointment WHERE leadId = @leadId::uuid AND organisationId = @organisationId\)/);
    expect(sqlText.match(/ORDER BY "performedAt" DESC/g)).toHaveLength(1);
  });

  it('every branch selects entityType and entityId', async () => {
    executeQuery.mockResolvedValue([]);
    await listAuditLogForLead('lead-1');
    const sqlText = executeQuery.mock.calls[0][0];
    expect(sqlText.match(/al\.entityType AS "entityType"/g)).toHaveLength(3);
    expect(sqlText.match(/al\.entityId AS "entityId"/g)).toHaveLength(3);
  });

  it('still strips sealed values and keeps the new fields', async () => {
    executeQuery.mockResolvedValue([
      { id: 1, action: 'LeadUpdated', entityType: 'Appointment', entityId: 'a1',
        changeDetail: JSON.stringify({ idNumber: { changed: true, sealed: 'x' }, email: { from: 'a', to: 'b' } }) },
      { id: 2, action: 'X', entityType: 'Lead', entityId: 'l1', changeDetail: null },
    ]);
    const out = await listAuditLogForLead('lead-1');
    expect(out[0]).toMatchObject({ entityType: 'Appointment', entityId: 'a1' });
    expect(out[0].changeDetail).toEqual({ idNumber: { changed: true }, email: { from: 'a', to: 'b' } });
    expect(out[1].changeDetail).toBeNull();
  });
});
