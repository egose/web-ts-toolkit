import path from 'path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

function normalizeApiBaseURL(value: string | undefined) {
  const normalized = value?.trim().replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '/api';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBaseURL = normalizeApiBaseURL(env.API_BASE_URL ?? env.VITE_API_BASE_URL);

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
