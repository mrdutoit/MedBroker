import { describe, it, expect, vi } from 'vitest';

vi.mock('../api-lib/services/db.js', () => ({ sql: new Proxy({}, { get: () => () => ({}) }), executeQuery: vi.fn() }));
vi.mock('../api-lib/services/encryption.js', () => ({
  encrypt: vi.fn(async (v) => `enc(${v})`),
  encryptBoolean: vi.fn(async (v) => (v === null || v === undefined ? null : `enc(${v})`)),
}));

import { buildUpdateSql, buildRowParams } from './backfill-encrypt-lead-fields.js';

const COLS = ['existingCover', 'currentInsurer', 'policies', 'medicalAid', 'medicalAidProvider'];

describe('backfill', () => {
  it('never overwrites an existing encrypted value', () => {
    const q = buildUpdateSql();
    for (const c of COLS) expect(q).toContain(`${c}Encrypted = COALESCE(${c}Encrypted, @${c}Encrypted)`);
  });
  it('encrypts only non-null plaintext, including booleans', async () => {
    const p = await buildRowParams({ id: 'I', organisationId: 'O', existingCover: false, currentInsurer: null, policies: null, medicalAid: null, medicalAidProvider: 'Disc' });
    expect(p.existingCoverEncrypted.value).toBe('enc(false)');
    expect(p.currentInsurerEncrypted.value).toBeNull();
    expect(p.medicalAidEncrypted.value).toBeNull();
    expect(p.medicalAidProviderEncrypted.value).toBe('enc(Disc)');
  });
});
