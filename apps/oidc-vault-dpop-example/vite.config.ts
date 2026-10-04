import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: '127.0.0.1', port: 4317, strictPort: true },
  build: { target: 'es2022', outDir: 'dist/client' },
});
