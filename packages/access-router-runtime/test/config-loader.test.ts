import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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

  it('supports tsconfig path aliases when a tsconfig path is provided', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'access-router-runtime-config-alias-'));
    const configPath = join(tempDir, 'access-router.config.ts');
    const sourceDir = join(tempDir, 'src');

    mkdirSync(sourceDir);
    writeFileSync(
      join(tempDir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            baseUrl: '.',
            paths: {
              '@app/config': ['src/runtime-config.ts'],
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );
    writeFileSync(
      join(sourceDir, 'runtime-config.ts'),
      "export default { rootRouter: { basePath: '/aliased', operationAccess: true } };\n",
      'utf8',
    );
    writeFileSync(configPath, "export { default } from '@app/config';\n", 'utf8');

    process.chdir(tempDir);
    const config = loadAccessRouterRuntimeConfigSync('./access-router.config.ts', { tsconfigPath: './tsconfig.json' });

    expect(config.rootRouter?.basePath).toBe('/aliased');
  });
});
