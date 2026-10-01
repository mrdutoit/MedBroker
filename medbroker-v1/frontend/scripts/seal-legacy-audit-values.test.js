import { describe, it, expect, vi } from 'vitest';
vi.mock('../api-lib/services/encryption.js', () => ({ encrypt: vi.fn(async (x) => 'ENC(' + x + ')') }));
import { sealLegacyDetail } from './seal-legacy-audit-values.js';

describe('sealLegacyDetail', () => {
  it('seals legacy plaintext, leaves non-sensitive alone', async () => {
    const { detail, changed } = await sealLegacyDetail({
      idNumber: { from: '9403140000000', to: '9403145000000' },
      email: { from: 'a@x.com', to: 'b@x.com' },
    });
    expect(changed).toBe(true);
    expect(detail.idNumber).toEqual({ changed: true, sealed: 'ENC({"from":"9403140000000","to":"9403145000000"})' });
    expect(detail.email).toEqual({ from: 'a@x.com', to: 'b@x.com' });
  });
  it('is idempotent on already-sealed entries', async () => {
    const input = { idNumber: { changed: true, sealed: 'ENC(x)' } };
    const { detail, changed } = await sealLegacyDetail(input);
    expect(changed).toBe(false);
    expect(detail).toEqual(input);
  });
  it('ignores rows with no sensitive fields', async () => {
    expect((await sealLegacyDetail({ email: { from: 'a', to: 'b' } })).changed).toBe(false);
  });
});
