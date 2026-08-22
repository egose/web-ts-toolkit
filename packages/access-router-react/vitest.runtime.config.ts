import { defineConfig } from 'vitest/config';

import { runtimeTestConfig } from './vitest.runtime-shared';

export default defineConfig({
  test: runtimeTestConfig,
});
