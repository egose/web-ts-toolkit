import { afterEach } from 'vitest';

import { defaultRuntime } from '../dist/index.mjs';

afterEach(() => {
  defaultRuntime.clearOpenApiRoutes();
});
