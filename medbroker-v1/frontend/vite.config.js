/**
 * vite.config.js
 * Vite build configuration for MedBroker frontend.
 * Proxies /api requests to the local Azure Functions runtime during development.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:7071', // Azure Functions local port
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  // §114 (4 Aug 2026) — entraAuthService.test.js is the first test file to
  // import anything that transitively imports api-lib/config.js (via
  // entraAuthService.js -> config.js), which throws eagerly at import
  // time if DATABASE_URL isn't set (config.js's required() check runs
  // the moment the module loads, not lazily). The two pre-existing test
  // files (leadStatusService/appointmentStatusService) never hit this —
  // pure logic, no config.js dependency. This placeholder is never
  // actually connected to: db.js's query function (§ rewrite, 12 Aug
  // 2026 — Neon's HTTP driver, no persistent pool at all now) only opens
  // a connection when a query actually runs, and nothing in
  // entraAuthService.test.js calls it, it only exists to satisfy
  // config.js's eager check so `vitest run` doesn't need a live database
  // to run tests that don't need one.
  test: {
    env: {
      DATABASE_URL: 'postgres://test:test@localhost:5432/test_placeholder_never_connected',
    },
  },
});
