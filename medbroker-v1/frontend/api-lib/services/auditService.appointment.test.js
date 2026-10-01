import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./encryption.js', () => ({ encrypt: vi.fn(async (x) => 'ENC(' + x + ')') }));
vi.mock('./db.js', () => ({ executeQuery: vi.fn(), executeQueryOne: vi.fn(), sql: new Proxy({}, { get: () => () => ({}) }) }));
vi.mock('../context/tenant.js', () => ({ resolveOrganisationId: () => 'org' }));

import { executeQuery } from './db.js';
import { listAuditLogForAppointment } from './auditService.js';

// 1 Oct 2026 — the Appointment page's History needs each row's entity, so
// it can tell this appointment's entries from its lead's.
describe('listAuditLogForAppointment', () => {
  beforeEach(() => executeQuery.mockReset());

  it('keeps its two branches: this Appointment, then its Lead', async () => {
    executeQuery.mockResolvedValue([]);
    await listAuditLogForAppointment('appt-1', 'lead-1');
    const sqlText = executeQuery.mock.calls[0][0];
    expect(sqlText.match(/UNION ALL/g)).toHaveLength(1);
    expect(sqlText.match(/\bSELECT al\.id/g)).toHaveLength(2);
    expect(sqlText).toMatch(/al\.entityType = 'Appointment' AND al\.entityId = @appointmentId::text/);
    expect(sqlText).toMatch(/al\.entityType = 'Lead' AND al\.entityId = @leadId::text/);
    expect(sqlText.match(/ORDER BY "performedAt" DESC/g)).toHaveLength(1);
  });

  it('both branches select entityType and entityId', async () => {
    executeQuery.mockResolvedValue([]);
    await listAuditLogForAppointment('appt-1', 'lead-1');
    const sqlText = executeQuery.mock.calls[0][0];
    expect(sqlText.match(/al\.entityType AS "entityType"/g)).toHaveLength(2);
    expect(sqlText.match(/al\.entityId AS "entityId"/g)).toHaveLength(2);
  });

  it('still strips sealed values and keeps the new fields', async () => {
    executeQuery.mockResolvedValue([
      { id: 1, action: 'LeadUpdated', entityType: 'Lead', entityId: 'lead-1',
        changeDetail: JSON.stringify({ idNumber: { changed: true, sealed: 'x' }, email: { from: 'a', to: 'b' } }) },
      { id: 2, action: 'AppointmentCreated', entityType: 'Appointment', entityId: 'appt-1', changeDetail: null },
    ]);
    const out = await listAuditLogForAppointment('appt-1', 'lead-1');
    expect(out[0]).toMatchObject({ entityType: 'Lead', entityId: 'lead-1' });
    expect(out[0].changeDetail).toEqual({ idNumber: { changed: true }, email: { from: 'a', to: 'b' } });
    expect(out[1]).toMatchObject({ entityType: 'Appointment', entityId: 'appt-1', changeDetail: null });
  });
});
