import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./encryption.js', () => ({ encrypt: vi.fn(async (x) => 'ENC(' + x + ')') }));
vi.mock('./db.js', () => ({ executeQuery: vi.fn(), executeQueryOne: vi.fn(), sql: new Proxy({}, { get: () => () => ({}) }) }));
vi.mock('../context/tenant.js', () => ({ resolveOrganisationId: () => 'org' }));

import { SENSITIVE_LEAD_FIELDS, sealChange, stripSealed } from './sensitiveFields.js';
import { executeQuery } from './db.js';
import { listAuditLog, listAllAuditLog, exportAuditLog } from './auditService.js';

describe('sealChange', () => {
  it('seals a sensitive field into { changed, sealed }', async () => {
    const out = await sealChange('idNumber', { from: '9403140000000', to: '9403145000000' });
    expect(out).toEqual({ changed: true, sealed: 'ENC({"from":"9403140000000","to":"9403145000000"})' });
  });
  it('seals boolean changes', async () => {
    const out = await sealChange('medicalAid', { from: false, to: true });
    expect(out.sealed).toBe('ENC({"from":false,"to":true})');
  });
  it('leaves other fields unchanged', async () => {
    const c = { from: 'a@x.com', to: 'b@x.com' };
    expect(await sealChange('email', c)).toBe(c);
  });
  it('lists the sensitive fields', () => {
    expect(SENSITIVE_LEAD_FIELDS).toEqual(['idNumber', 'existingCover', 'currentInsurer', 'policies', 'medicalAid', 'medicalAidProvider']);
  });
});

describe('stripSealed', () => {
  it('removes sealed from every field entry', () => {
    expect(stripSealed({ idNumber: { changed: true, sealed: 'x' }, email: { from: 'a', to: 'b' } }))
      .toEqual({ idNumber: { changed: true }, email: { from: 'a', to: 'b' } });
  });
  it('passes null and non-objects through', () => {
    expect(stripSealed(null)).toBe(null);
  });
});

describe('auditService mapping never returns sealed', () => {
  const row = { id: 1, action: 'LeadUpdated', changeDetail: JSON.stringify({ idNumber: { changed: true, sealed: 'ENC(secret)' } }) };
  beforeEach(() => { executeQuery.mockReset(); });
  it.each([
    ['listAuditLog', () => listAuditLog('Lead', 'x')],
    ['listAllAuditLog', () => listAllAuditLog({})],
    ['exportAuditLog', () => exportAuditLog({}, 10)],
  ])('%s', async (_n, call) => {
    executeQuery.mockResolvedValue([row]);
    const out = await call();
    expect(JSON.stringify(out)).not.toContain('sealed');
    expect(JSON.stringify(out)).not.toContain('secret');
  });
});
