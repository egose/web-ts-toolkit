import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadAccessRouterRuntimeConfigSync } from '../src/index';

describe('config loader', () => {
  const previousCwd = process.cwd();

  afterEach(() => {
    process.chdir(previousCwd);
  });

  it('loads a TypeScript config file via jiti', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'access-router-runtime-config-'));
    const configPath = join(tempDir, 'access-router.config.ts');

    writeFileSync(
      configPath,
      [
        'export default {',
        "  db: { url: 'mongodb://example.test:27017/demo' },",
        "  rootRouter: { basePath: '/api/root', operationAccess: true },",
        '};',
        '',
      ].join('\n'),
      'utf8',
    );

    process.chdir(tempDir);
    const config = loadAccessRouterRuntimeConfigSync('./access-router.config.ts');

    expect(config.db?.url).toBe('mongodb://example.test:27017/demo');
    expect(config.rootRouter?.basePath).toBe('/api/root');
  });
});
