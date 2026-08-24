import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { afterEach, describe, expect, it } from 'vitest';
import { loadAccessRouterRuntimeConfigSync, normalizeAccessRouterRuntimeConfigExport } from '../src/index';
import { assertNoTrackedTempProjects, cleanupTempProjects, createTempProject } from './support/tmp';

describe('config loader', () => {
  const previousCwd = process.cwd();

  afterEach(() => {
    process.chdir(previousCwd);
    mongoose.deleteModel(/AccessRouterRuntimeLoader.*/);
    cleanupTempProjects();
    assertNoTrackedTempProjects();
  });

  it('loads a TypeScript config file via jiti', () => {
    const { dir: tempDir } = createTempProject('access-router-runtime-config-');
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

  it('loads a synchronous default factory config file via jiti', () => {
    const { dir: tempDir } = createTempProject('access-router-runtime-config-factory-');
    const configPath = join(tempDir, 'access-router.config.ts');

    writeFileSync(
      configPath,
      [
        'export default function configFactory() {',
        "  return { rootRouter: { basePath: '/factory', operationAccess: true } };",
        '}',
        '',
      ].join('\n'),
      'utf8',
    );

    process.chdir(tempDir);
    const config = loadAccessRouterRuntimeConfigSync('./access-router.config.ts');

    expect(config.rootRouter?.basePath).toBe('/factory');
  });

  it('loads a named config object export via jiti', () => {
    const { dir: tempDir } = createTempProject('access-router-runtime-config-named-');
    const configPath = join(tempDir, 'access-router.config.ts');

    writeFileSync(
      configPath,
      "export const config = { rootRouter: { basePath: '/named', operationAccess: true } };\n",
      'utf8',
    );

    process.chdir(tempDir);
    const config = loadAccessRouterRuntimeConfigSync('./access-router.config.ts');

    expect(config.rootRouter?.basePath).toBe('/named');
  });

  it('normalizes generated-entry module namespace values with the same contract', () => {
    const defaultObject = normalizeAccessRouterRuntimeConfigExport(
      { default: { rootRouter: { basePath: '/default', operationAccess: true } } },
      'generated-entry.js',
    );
    const defaultFactory = normalizeAccessRouterRuntimeConfigExport(
      { default: () => ({ rootRouter: { basePath: '/factory', operationAccess: true } }) },
      'generated-entry.js',
    );
    const namedConfig = normalizeAccessRouterRuntimeConfigExport(
      { config: { rootRouter: { basePath: '/named', operationAccess: true } } },
      'generated-entry.js',
    );

    expect(defaultObject.rootRouter?.basePath).toBe('/default');
    expect(defaultFactory.rootRouter?.basePath).toBe('/factory');
    expect(namedConfig.rootRouter?.basePath).toBe('/named');
  });

  it('normalizes direct factory exports and null-prototype config objects', () => {
    const directFactory = normalizeAccessRouterRuntimeConfigExport(
      () => ({ rootRouter: { basePath: '/direct-factory', operationAccess: true } }),
      'direct-factory.js',
    );
    const nullPrototypeConfig = Object.assign(Object.create(null), {
      rootRouter: { basePath: '/null-prototype', operationAccess: true },
    });

    expect(directFactory.rootRouter?.basePath).toBe('/direct-factory');
    expect(
      normalizeAccessRouterRuntimeConfigExport(nullPrototypeConfig, 'null-prototype.js').rootRouter?.basePath,
    ).toBe('/null-prototype');
  });

  it('rejects unsupported export values with the config path in the error', () => {
    const cases: Array<[string, string]> = [
      ['array', 'export default [];\n'],
      ['promise', 'export default Promise.resolve({});\n'],
      ['date', 'export default new Date();\n'],
      ['async-factory', 'export default async function configFactory() { return {}; }\n'],
      ['unrelated-export', 'export const helper = 1;\n'],
    ];

    for (const [name, contents] of cases) {
      const { dir: tempDir } = createTempProject(`access-router-runtime-config-invalid-${name}-`);
      const configPath = join(tempDir, 'access-router.config.ts');
      writeFileSync(configPath, contents, 'utf8');

      process.chdir(tempDir);
      expect(() => loadAccessRouterRuntimeConfigSync('./access-router.config.ts')).toThrow(
        /Invalid access-router-runtime config "\.\/access-router\.config\.ts"/,
      );
    }
  });

  it('rejects duplicate exports and named factory exports as unsupported forms', () => {
    expect(() => normalizeAccessRouterRuntimeConfigExport({ default: {}, config: {} }, 'generated-entry.js')).toThrow(
      /generated-entry\.js.*both default and named "config"/,
    );
    expect(() => normalizeAccessRouterRuntimeConfigExport({ config: () => ({}) }, 'generated-entry.js')).toThrow(
      /generated-entry\.js.*named "config" export must be an object/,
    );
  });

  it('rejects thenables from every supported export path without runtime assembly', () => {
    const thenable = { then() {} };

    expect(() => normalizeAccessRouterRuntimeConfigExport(thenable, 'direct-thenable.js')).toThrow(
      /direct-thenable\.js.*module export must not be a promise or thenable/,
    );
    expect(() => normalizeAccessRouterRuntimeConfigExport({ default: () => thenable }, 'factory-thenable.js')).toThrow(
      /factory-thenable\.js.*config export must be a synchronous object/,
    );
    expect(() => normalizeAccessRouterRuntimeConfigExport({ config: thenable }, 'named-thenable.js')).toThrow(
      /named-thenable\.js.*config export must be a synchronous object/,
    );
  });

  it('rejects invalid collection and database ownership fields before side effects', () => {
    const userModel = mongoose.model('AccessRouterRuntimeLoaderCollectionUser', new mongoose.Schema({ name: String }));

    expect(() =>
      normalizeAccessRouterRuntimeConfigExport({ default: { db: { connection: { models: {} } } } }, 'db-connection.js'),
    ).toThrow(/db-connection\.js.*db\.connection/);
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport(
        { default: { db: { disconnectOnShutdown: 'yes' } } },
        'db-disconnect.js',
      ),
    ).toThrow(/db-disconnect\.js.*db\.disconnectOnShutdown/);
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport(
        { default: { models: [{ model: userModel, collection: 'users', router: { operationAccess: false } }] } },
        'existing-model-collection.js',
      ),
    ).toThrow(/existing-model-collection\.js.*collection.*existing "model"/);
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport(
        {
          default: {
            models: [
              {
                name: 'AccessRouterRuntimeLoaderBadCollection',
                schema: new mongoose.Schema({ title: String }),
                collection: 1,
                router: { operationAccess: false },
              },
            ],
          },
        },
        'schema-collection.js',
      ),
    ).toThrow(/schema-collection\.js.*collection/);
  });

  it('rejects invalid dev defaults before CLI defaults are applied', () => {
    for (const delay of [Infinity, 1.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        normalizeAccessRouterRuntimeConfigExport({ default: { dev: { delay } } }, 'generated-entry.js'),
      ).toThrow(/generated-entry\.js.*dev\.delay/);
    }

    expect(() =>
      normalizeAccessRouterRuntimeConfigExport({ default: { dev: { watch: './src' } } }, 'generated-entry.js'),
    ).toThrow(/generated-entry\.js.*dev\.watch/);
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport({ default: { dev: { ext: ['ts', 1] } } }, 'generated-entry.js'),
    ).toThrow(/generated-entry\.js.*dev\.ext/);
  });

  it('rejects invalid database and router-name fields before runtime assembly', () => {
    expect(() => normalizeAccessRouterRuntimeConfigExport({ default: { db: 'mongodb://example' } }, 'db.js')).toThrow(
      /db\.js.*field "db" must be a plain object/,
    );
    expect(() => normalizeAccessRouterRuntimeConfigExport({ default: { db: { url: 1 } } }, 'db-url.js')).toThrow(
      /db-url\.js.*db\.url/,
    );
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport(
        { default: { db: { url: 'mongodb://x', connection: { model() {}, models: {} } } } },
        'db-both.js',
      ),
    ).toThrow(/db-both\.js.*cannot define both/);
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport(
        {
          default: {
            models: [
              {
                name: 'Post',
                schema: new mongoose.Schema({ title: String }),
                router: { modelName: 1 },
              },
            ],
          },
        },
        'router-name.js',
      ),
    ).toThrow(/router-name\.js.*router\.modelName/);
  });

  it('rejects ambiguous model definitions and duplicate names before runtime assembly', () => {
    const schema = new mongoose.Schema({ title: String });
    const model = mongoose.model('AccessRouterRuntimeLoaderPost', schema);

    expect(() =>
      normalizeAccessRouterRuntimeConfigExport(
        { default: { models: [{ name: 'Post', model, schema, router: { operationAccess: true } }] } },
        'generated-entry.js',
      ),
    ).toThrow(/generated-entry\.js.*models\[0\].*exactly one/);
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport(
        { default: { models: [{ name: 'Post', router: { operationAccess: true } }] } },
        'generated-entry.js',
      ),
    ).toThrow(/generated-entry\.js.*models\[0\].*exactly one/);
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport(
        {
          default: {
            models: [
              { name: 'Post', schema, router: { operationAccess: true } },
              { name: 'Post', schema: new mongoose.Schema({ title: String }), router: { operationAccess: true } },
            ],
          },
        },
        'generated-entry.js',
      ),
    ).toThrow(/generated-entry\.js.*duplicate model name "Post"/);
  });

  it('rejects conflicting model names and duplicate collections', () => {
    const userModel = mongoose.model('AccessRouterRuntimeLoaderUser', new mongoose.Schema({ name: String }));

    expect(() =>
      normalizeAccessRouterRuntimeConfigExport(
        { default: { models: [{ name: 'OtherUser', model: userModel, router: { operationAccess: true } }] } },
        'generated-entry.js',
      ),
    ).toThrow(/generated-entry\.js.*models\[0\]\.name.*conflicts/);
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport(
        {
          default: {
            models: [
              { name: 'A', schema: new mongoose.Schema({ title: String }), collection: 'shared', router: {} },
              { name: 'B', schema: new mongoose.Schema({ title: String }), collection: 'shared', router: {} },
            ],
          },
        },
        'generated-entry.js',
      ),
    ).toThrow(/generated-entry\.js.*duplicate collection name "shared"/);
  });

  it('rejects duplicate data names and duplicate resolved data names', () => {
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport(
        {
          default: {
            data: [
              { name: 'status', router: {} },
              { name: 'status', router: {} },
            ],
          },
        },
        'generated-entry.js',
      ),
    ).toThrow(/generated-entry\.js.*duplicate data name "status"/);
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport(
        {
          default: {
            data: [
              { name: 'status', router: { dataName: 'shared' } },
              { name: 'health', router: { dataName: 'shared' } },
            ],
          },
        },
        'generated-entry.js',
      ),
    ).toThrow(/generated-entry\.js.*duplicate resolved data name "shared"/);
  });

  it('supports tsconfig path aliases when a tsconfig path is provided', () => {
    const { dir: tempDir } = createTempProject('access-router-runtime-config-alias-');
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
