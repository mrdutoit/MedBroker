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
});
