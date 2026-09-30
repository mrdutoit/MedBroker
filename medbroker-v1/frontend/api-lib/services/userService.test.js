import { describe, it, expect, vi } from 'vitest';

vi.mock('./db.js', () => ({
  executeQuery: vi.fn(), executeQueryOne: vi.fn().mockResolvedValue(null),
  sql: new Proxy({}, { get: () => () => ({}) }),
}));
vi.mock('../context/tenant.js', () => ({ resolveOrganisationId: () => 'org' }));
vi.mock('./authService.js', () => ({ hashPassword: vi.fn(), verifyPassword: vi.fn() }));

import { executeQueryOne } from './db.js';
import { getUserForSsoMatch } from './userService.js';

describe('getUserForSsoMatch', () => {
  it('matches email exactly (case-insensitive), never with a LIKE pattern', async () => {
    await getUserForSsoMatch('a_b@x.co.za');
    const query = executeQueryOne.mock.calls[0][0];
    expect(query).toContain('LOWER(email) = LOWER(@email)');
    expect(query).not.toMatch(/ILIKE/i);
  });
});
