import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  validateToken: vi.fn(),
}));
vi.mock('../services/userService.js', () => ({
  listUsers: vi.fn(), createUserFull: vi.fn(), listSupervisors: vi.fn(),
  getUserForAdmin: vi.fn(), updateUserFull: vi.fn(), getOwnProfile: vi.fn(),
  updateOwnProfile: vi.fn(), unlockUser: vi.fn(), revokeUserSessions: vi.fn(),
  getUserDisplayNameById: vi.fn(), linkUserIdentity: vi.fn(), forcePasswordReset: vi.fn(),
}));
vi.mock('../services/authService.js', () => ({ checkPasswordComplexity: vi.fn() }));
vi.mock('../services/auditService.js', () => ({ writeAuditLog: vi.fn(), clientIp: vi.fn() }));

import { validateToken } from '../middleware/auth.js';
import { getUserForAdmin, updateUserFull } from '../services/userService.js';
import { handleUserById } from './userHandlers.js';

const ID = '11111111-1111-4111-8111-111111111111';
function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (n) => { res.statusCode = n; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = () => res;
  return res;
}
const put = (body = { displayName: 'New Name' }) => ({ method: 'PUT', body, query: {}, headers: {} });

describe('PUT /api/users/:id on a GlobalAdmin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('403s an Admin and does not write', async () => {
    validateToken.mockResolvedValue({ oid: 'a1', roles: ['Admin'] });
    getUserForAdmin.mockResolvedValue({ id: ID, role: 'GlobalAdmin' });
    const res = mockRes();
    await handleUserById(put(), res, ID);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Only a GlobalAdmin can change a GlobalAdmin account.');
    expect(updateUserFull).not.toHaveBeenCalled();
  });

  it('lets a GlobalAdmin proceed', async () => {
    validateToken.mockResolvedValue({ oid: 'g1', roles: ['GlobalAdmin'] });
    getUserForAdmin.mockResolvedValue({ id: ID, role: 'GlobalAdmin' });
    const res = mockRes();
    await handleUserById(put(), res, ID);
    expect(res.statusCode).toBe(200);
    expect(updateUserFull).toHaveBeenCalledTimes(1);
  });

  it('lets an Admin edit a non-GlobalAdmin', async () => {
    validateToken.mockResolvedValue({ oid: 'a1', roles: ['Admin'] });
    getUserForAdmin.mockResolvedValue({ id: ID, role: 'Agent' });
    const res = mockRes();
    await handleUserById(put(), res, ID);
    expect(res.statusCode).toBe(200);
    expect(updateUserFull).toHaveBeenCalledTimes(1);
  });
});
