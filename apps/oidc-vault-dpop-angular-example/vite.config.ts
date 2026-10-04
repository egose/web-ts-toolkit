import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';

// The `angular` plugin must come first. `include` declares the compilation
// entry (globs resolve against the workspace root); without it the plugin
// compiles nothing. `useAngularCompilationAPI` selects the AOT path whose
// emit the transform consults; without it the entry never reaches the module
// graph. Default (non-fast) compilation keeps full Angular template
// type-checking; `ngc --noEmit` in the typecheck script is the second gate.
export default defineConfig({
  resolve: { mainFields: ['module'] },
  plugins: [angular({ include: ['/src/main.ts'], experimental: { useAngularCompilationAPI: true } })],
  server: { host: '127.0.0.1', port: 4322, strictPort: true },
  build: { target: 'es2022' },
});
