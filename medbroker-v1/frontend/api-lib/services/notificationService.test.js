import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./db.js', () => ({ sql: new Proxy({}, { get: () => () => ({}) }), executeQuery: vi.fn(), executeQueryOne: vi.fn() }));
vi.mock('../context/tenant.js', () => ({ resolveOrganisationId: () => 'ORG' }));
vi.mock('./flagService.js', () => ({ getFlagMeta: vi.fn(async () => ({ value: '1' })) }));
vi.mock('./userService.js', () => ({ getUserEmailById: vi.fn(async () => 'a@b.co') }));
vi.mock('./emailService.js', () => ({ sendEmail: vi.fn() }));

import { executeQuery, executeQueryOne } from './db.js';
import { sendEmail } from './emailService.js';
import { escapeHtml, createNotification } from './notificationService.js';

beforeEach(() => { vi.clearAllMocks(); executeQuery.mockResolvedValue([]); executeQueryOne.mockResolvedValue({ id: 'N1' }); });

describe('escapeHtml', () => {
  it('escapes & < > " \'', () => {
    expect(escapeHtml('<a href=x>Jo</a> & co')).toBe('&lt;a href=x&gt;Jo&lt;/a&gt; &amp; co');
    expect(escapeHtml(`"x" 'y'`)).toBe('&quot;x&quot; &#39;y&#39;');
  });
});

describe('notification email', () => {
  it('escapes title and body in html but leaves text plain', async () => {
    await createNotification({ recipientId: 'U', type: 'T', title: '<b>T</b>', body: '<a href=x>Jo</a> & co' });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const arg = sendEmail.mock.calls[0][0];
    expect(arg.text).toBe('<a href=x>Jo</a> & co');
    expect(arg.html).toContain('&lt;a href=x&gt;Jo&lt;/a&gt; &amp; co');
    expect(arg.html).not.toContain('<a href');
  });
});
