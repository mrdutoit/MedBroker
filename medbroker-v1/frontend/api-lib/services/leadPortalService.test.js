/**
 * leadPortalService.test.js — 30 Sep 2026: portal self-registration must never
 * bind a new account to an existing Lead (account takeover). Existing lead
 * email -> 409 USE_ACTIVATE, no INSERT.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./db.js', () => ({
  executeQuery: vi.fn(),
  executeQueryOne: vi.fn(),
  sql: new Proxy({}, { get: () => () => ({}) }),
}));
vi.mock('./leadService.js', () => ({
  findDuplicate: vi.fn(),
  createLead: vi.fn(),
}));
vi.mock('./systemConfigService.js', () => ({ getSystemConfig: vi.fn() }));
vi.mock('../context/tenant.js', () => ({ resolveOrganisationId: () => 'org-1' }));

import { executeQuery, executeQueryOne } from './db.js';
import { findDuplicate, createLead } from './leadService.js';
import { registerProspect, walkInCheckin } from './leadPortalService.js';

const data = { email: 'victim@example.com', firstName: 'A', lastName: 'B', title: 'Mr',
  dateOfBirth: '1990-01-01', mobileNumber: '0821234567', occupation: 'X' };

const allSql = () => [...executeQuery.mock.calls, ...executeQueryOne.mock.calls].map(c => String(c[0]));

beforeEach(() => { vi.clearAllMocks(); });

describe('registerProspect', () => {
  it('refuses an existing lead email with 409 USE_ACTIVATE and inserts nothing', async () => {
    executeQueryOne.mockResolvedValueOnce(null); // no portal account by email
    findDuplicate.mockResolvedValue('lead-1');
    await expect(registerProspect(data, 'hash')).rejects.toMatchObject({
      status: 409,
      code: 'USE_ACTIVATE',
      message: 'We already have your details. Please activate your account instead.',
    });
    expect(createLead).not.toHaveBeenCalled();
    expect(allSql().some(q => q.includes('INSERT INTO LeadPortalAccount'))).toBe(false);
  });

  it('creates lead and account for a new email', async () => {
    executeQueryOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'acc-1' });
    findDuplicate.mockResolvedValue(null);
    createLead.mockResolvedValue('lead-new');
    const r = await registerProspect(data, 'hash');
    expect(r).toEqual({ leadId: 'lead-new', portalAccountId: 'acc-1', createdNewLead: true });
    expect(allSql().some(q => q.includes('INSERT INTO LeadPortalAccount'))).toBe(true);
  });
});

describe('walkInCheckin', () => {
  it('refuses an existing lead email with 409 USE_ACTIVATE and records no attendance', async () => {
    executeQueryOne
      .mockResolvedValueOnce({ id: 'ev-1', name: 'E', status: 'Active' }) // event
      .mockResolvedValueOnce(null); // no portal account
    findDuplicate.mockResolvedValue('lead-1');
    await expect(walkInCheckin('tok', data, 'hash')).rejects.toMatchObject({ status: 409, code: 'USE_ACTIVATE' });
    expect(allSql().some(q => q.includes('INSERT INTO EventAttendee') || q.includes('INSERT INTO LeadPortalAccount'))).toBe(false);
  });
});
