import { defineConfig, devices } from '@playwright/test';

/*
 * Browser regression tests (24 Sep 2026, app-design-pass skill — grew out
 * of the throwaway screenshot harness used to verify the Reports page
 * pipeline hero, see Status_Vercel.md that date). They load the BUILT
 * frontend (vite preview) in real Chromium with every /api/* call
 * answered from e2e/fixtures.js — no database, no secrets — so they test
 * exactly the class of bug a unit test can't see: a page that crashes on
 * render, a console error, a modal that closes when you select text
 * inside it, a tooltip clipped to invisible.
 *
 * HOW THIS SUITE IS RUN (27 Sep 2026): (1) by GitHub Actions on every
 * push — .github/workflows/ci.yml at the TRUE repo root, outside
 * medbroker-v1/ (process.env.CI switches below apply there: one retry,
 * HTML report uploaded on failure); (2) in the Claude sandbox before every
 * delivery, as the session protocol's verification step. From
 * medbroker-v1/:
 *   npm --prefix frontend run build && npm run test:e2e
 * (sandbox: prefix with PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers).
 */
const PORT = 4173;

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.js/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  outputDir: '../test-results',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /smoke\.spec\.js/ },
  ],
  webServer: {
    command: `npm --prefix ../frontend run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
