import path from 'path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import svgr from 'vite-plugin-svgr';

// See https://vite.dev/config/
// See https://github.com/frandiox/vite-ssr for SSG
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.IN_DOCKER ? 'http://backend:8000' : 'http://localhost:8000',
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
    allowedHosts: [],
  },
  plugins: [
    react(),
    tailwindcss(),
    svgr({ include: '**/*.svg?react' }),
    VitePWA({
      includeAssets: ['favicon.ico', 'react-vite.png', 'robots.txt'],
      manifest: {
        name: 'Starter App',
        short_name: 'StarterApp',
        description: 'A Starter application',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'react-vite.png',
            sizes: '192x192 512x512',
            type: 'image/png',
          },
          {
            src: 'favicon.ico',
            sizes: '16x16 32x32 48x48 64x64',
            type: 'image/x-icon',
          },
        ],
      },
      registerType: 'autoUpdate',
      workbox: {
        // SPA fallback for normal routes
        navigateFallback: '/index.html',
        // Skip PWA fallback for Keycloak auth routes
        navigateFallbackDenylist: [/^\/api\/v1\/auth\/keycloak\/.*$/],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
