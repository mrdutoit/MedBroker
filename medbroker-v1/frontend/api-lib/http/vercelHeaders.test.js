// api-lib/http/vercelHeaders.test.js
// Security audit I1, I2 (30 Sep 2026) — Permissions-Policy and CSP allow camera and Entra SSO
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const vercelJsonPath = resolve(__dir, '../../vercel.json');
const vercelConfig = JSON.parse(readFileSync(vercelJsonPath, 'utf-8'));

describe('vercel.json — security headers (I1, I2)', () => {
  it('Permissions-Policy allows same-origin camera for QR check-in', () => {
    const headerObj = vercelConfig.headers[1];
    const permPolicyHeader = headerObj.headers.find(h => h.key === 'Permissions-Policy');
    expect(permPolicyHeader).toBeDefined();
    expect(permPolicyHeader.value).toContain('camera=(self)');
  });

  it('CSP connect-src allows self and Entra SSO token endpoint', () => {
    const headerObj = vercelConfig.headers[1];
    const cspHeader = headerObj.headers.find(h => h.key === 'Content-Security-Policy');
    expect(cspHeader).toBeDefined();
    expect(cspHeader.value).toContain("connect-src 'self' https://login.microsoftonline.com");
  });
});
