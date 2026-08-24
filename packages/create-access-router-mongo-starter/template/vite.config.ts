import path from 'path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { normalizeApiBaseURL } from './src/shared/normalize-api-base-url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Explicit process values (including deploy overrides) take precedence over
  // project .env files so a release build cannot silently target another path.
  const apiBaseURL = normalizeApiBaseURL(process.env.API_BASE_URL ?? env.API_BASE_URL);

  return {
    define: {
      'import.meta.env.API_BASE_URL': JSON.stringify(apiBaseURL),
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        [apiBaseURL]: {
          target: process.env.IN_DOCKER ? 'http://backend:8000' : 'http://localhost:8000',
          changeOrigin: true,
        },
      },
      allowedHosts: [],
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
