import { describe, it, expect, vi, beforeEach } from 'vitest';

// 30 Sep 2026 — I6: a fresh assignment or edit (updatedAt) resets the stale-lead clock.
vi.mock('./db.js', () => ({ sql: new Proxy({}, { get: () => () => ({}) }), executeQuery: vi.fn() }));
vi.mock('../context/tenant.js', () => ({ resolveOrganisationId: () => 'ORG' }));
vi.mock('./notificationService.js', () => ({ createNotification: vi.fn() }));
vi.mock('./taskService.js', () => ({ deleteTasksForEntity: vi.fn() }));
vi.mock('./flagService.js', () => ({ getFlagMeta: vi.fn(async () => ({ value: '1' })) }));
vi.mock('./systemConfigService.js', () => ({ getSystemConfig: vi.fn(async () => ({ leadAutoUnassignMonths: 6 })) }));
vi.mock('./userService.js', () => ({ findLeastLoadedSupervisorForRegion: vi.fn() }));
vi.mock('./appointmentService.js', () => ({ shortDateLabel: vi.fn() }));

import { executeQuery } from './db.js';
import { autoReturnStaleLeads } from './schedulerService.js';

beforeEach(() => { executeQuery.mockReset(); executeQuery.mockResolvedValue([]); });

describe('autoReturnStaleLeads', () => {
  it('uses the later of last call (or createdAt) and updatedAt as the activity clock', async () => {
    await autoReturnStaleLeads();
    const q = executeQuery.mock.calls[0][0];
    expect(q).toMatch(/GREATEST\(\s*COALESCE\(\s*\(SELECT MAX\(ca\.callTime\) FROM CallAttempt ca WHERE ca\.leadId = l\.id\),\s*l\.createdAt\s*\),\s*l\.updatedAt\s*\)/);
  });
});
