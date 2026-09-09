import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadAccessRouterRuntimeConfigSync,
  normalizeAccessRouterRuntimeConfigExport,
  validateAccessRouterRuntimeConfig,
} from '../src/index';
import { assertNoTrackedTempProjects, cleanupTempProjects, createTempProject } from './support/tmp';
import { assertSubprocessResult, cleanupTrackedChildren, runSubprocess } from './support/subprocess';

describe('config loader', () => {
  const previousCwd = process.cwd();

  afterEach(async () => {
    await cleanupTrackedChildren();
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

  it('does not invoke identifiable async factories', () => {
    let rawInvoked = false;
    let defaultInvoked = false;
    const rawAsync = async () => {
      rawInvoked = true;
      return { rootRouter: { basePath: '/async', operationAccess: true } };
    };
    const defaultAsync = async () => {
      defaultInvoked = true;
      return { rootRouter: { basePath: '/async', operationAccess: true } };
    };

    expect(() => normalizeAccessRouterRuntimeConfigExport(rawAsync, 'async-fn.js')).toThrow(
      /async-fn\.js.*config export must be a synchronous object/,
    );
    expect(() => normalizeAccessRouterRuntimeConfigExport({ default: defaultAsync }, 'async-default.js')).toThrow(
      /async-default\.js.*config export must be a synchronous object/,
    );
    expect(rawInvoked).toBe(false);
    expect(defaultInvoked).toBe(false);
  });

  it('never invokes arbitrary thenable bodies for cleanup', () => {
    let thenCalls = 0;
    const thenable = {
      then() {
        thenCalls += 1;
      },
    };

    expect(() => normalizeAccessRouterRuntimeConfigExport(thenable, 'arbitrary-thenable.js')).toThrow(
      /arbitrary-thenable\.js.*module export must not be a promise or thenable/,
    );
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport({ default: () => thenable }, 'arbitrary-factory-thenable.js'),
    ).toThrow(/arbitrary-factory-thenable\.js.*config export must be a synchronous object/);
    expect(() => normalizeAccessRouterRuntimeConfigExport({ config: thenable }, 'arbitrary-named-thenable.js')).toThrow(
      /arbitrary-named-thenable\.js.*config export must be a synchronous object/,
    );
    expect(thenCalls).toBe(0);
  });

  it('catches rejected native promises on every export path in isolated subprocesses without unhandled rejection', async () => {
    const distPath = new URL('../dist/index.mjs', import.meta.url).pathname;
    const distUrl = pathToFileURL(distPath).href;
    const cases: Array<{ name: string; configPath: string; expression: string }> = [
      {
        name: 'raw rejected promise',
        configPath: 'raw-reject.js',
        expression: `normalize(Promise.reject(new Error('raw-boom')), 'raw-reject.js')`,
      },
      {
        name: 'default rejected promise',
        configPath: 'default-reject.js',
        expression: `normalize({ default: Promise.reject(new Error('default-boom')) }, 'default-reject.js')`,
      },
      {
        name: 'named rejected promise',
        configPath: 'named-reject.js',
        expression: `normalize({ config: Promise.reject(new Error('named-boom')) }, 'named-reject.js')`,
      },
      {
        name: 'sync function returning rejected promise',
        configPath: 'fn-reject.js',
        expression: `normalize(() => Promise.reject(new Error('fn-boom')), 'fn-reject.js')`,
      },
      {
        name: 'default sync factory returning rejected promise',
        configPath: 'default-fn-reject.js',
        expression: `normalize({ default: () => Promise.reject(new Error('default-fn-boom')) }, 'default-fn-reject.js')`,
      },
    ];

    for (const { name, configPath, expression } of cases) {
      const script = [
        `import { normalizeAccessRouterRuntimeConfigExport as normalize } from ${JSON.stringify(distUrl)};`,
        `let unhandled = 0;`,
        `process.on('unhandledRejection', () => { unhandled += 1; });`,
        `let caught = '';`,
        `try { ${expression}; } catch (error) { caught = error instanceof Error ? error.message : String(error); }`,
        `if (!caught.includes(${JSON.stringify(configPath)})) { console.error(${JSON.stringify(`missing path for ${name}`)} + ': ' + caught); process.exit(2); }`,
        `await new Promise((resolve) => setTimeout(resolve, 50));`,
        `if (unhandled !== 0) { console.error('unhandledRejection count=' + unhandled); process.exit(3); }`,
        `console.log('CAUGHT-OK:' + caught);`,
        ``,
      ].join('\n');

      const result = await runSubprocess(process.execPath, ['--input-type=module', '-e', script], {
        timeoutMs: 10_000,
      });
      assertSubprocessResult(result, { exitCode: 0, stdoutIncludes: 'CAUGHT-OK:', timedOut: false });
      expect(result.stderr).not.toContain('unhandledRejection');
      expect(result.stdout).toContain(configPath);
    }
  });

  it('avoids async factories and arbitrary thenables in an isolated subprocess without a second diagnostic', async () => {
    const distPath = new URL('../dist/index.mjs', import.meta.url).pathname;
    const distUrl = pathToFileURL(distPath).href;
    const script = [
      `import { normalizeAccessRouterRuntimeConfigExport as normalize } from ${JSON.stringify(distUrl)};`,
      `let unhandled = 0;`,
      `process.on('unhandledRejection', () => { unhandled += 1; });`,
      `let invoked = false;`,
      `let thenCalls = 0;`,
      `const asyncFactory = async () => { invoked = true; return {}; };`,
      `try { normalize(asyncFactory, 'async-avoid.js'); } catch {}`,
      `try { normalize({ default: asyncFactory }, 'async-default-avoid.js'); } catch {}`,
      `const thenable = { then() { thenCalls += 1; } };`,
      `try { normalize(thenable, 'arbitrary-avoid.js'); } catch {}`,
      `try { normalize({ default: () => thenable }, 'arbitrary-factory-avoid.js'); } catch {}`,
      `try { normalize({ config: thenable }, 'arbitrary-named-avoid.js'); } catch {}`,
      `await new Promise((resolve) => setTimeout(resolve, 50));`,
      `if (invoked) { console.error('async factory was invoked'); process.exit(4); }`,
      `if (thenCalls !== 0) { console.error('then body executed'); process.exit(5); }`,
      `if (unhandled !== 0) { console.error('unhandledRejection count=' + unhandled); process.exit(3); }`,
      `console.log('AVOID-OK');`,
      ``,
    ].join('\n');

    const result = await runSubprocess(process.execPath, ['--input-type=module', '-e', script], {
      timeoutMs: 10_000,
    });
    assertSubprocessResult(result, { exitCode: 0, stdoutIncludes: 'AVOID-OK', timedOut: false });
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

  it('validates dev shape as ignored metadata while rejecting invalid dev fields', () => {
    // `dev` is ignored deprecated metadata: valid shapes are accepted (and
    // preserved) but never consumed by the watch supervisor, which uses only
    // explicit CLI flags.
    const accepted = normalizeAccessRouterRuntimeConfigExport(
      { default: { dev: { watch: ['./should-not-watch'], ext: ['distinctive-ext'], delay: 12345 } } },
      'generated-entry.js',
    );
    expect(accepted.dev).toEqual({ watch: ['./should-not-watch'], ext: ['distinctive-ext'], delay: 12345 });

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

  it('rejects missing/null/primitive/array router containers before registration', () => {
    const schema = new mongoose.Schema({ title: String });
    const invalidRouters: Array<{ label: string; router: unknown }> = [
      { label: 'missing', router: undefined },
      { label: 'null', router: null },
      { label: 'string', router: 'router' },
      { label: 'number', router: 1 },
      { label: 'array', router: [] },
    ];

    for (const { router } of invalidRouters) {
      const models = [
        { name: 'AccessRouterRuntimeLoaderB07Model', schema, ...(router === undefined ? {} : { router }) },
      ];
      const before = mongoose.modelNames().slice();
      expect(() => normalizeAccessRouterRuntimeConfigExport({ default: { models } }, 'generated-entry.js')).toThrow(
        /generated-entry\.js.*models\[0\]\.router.*must be a plain object/,
      );
      expect(() => validateAccessRouterRuntimeConfig({ models } as never, 'runtime config')).toThrow(
        /runtime config.*models\[0\]\.router.*must be a plain object/,
      );
      expect(mongoose.modelNames()).toEqual(before);
      expect((mongoose.models as Record<string, unknown>)['AccessRouterRuntimeLoaderB07Model']).toBeUndefined();
    }

    for (const { router } of invalidRouters) {
      const data = [{ name: 'status', ...(router === undefined ? {} : { router }) }];
      expect(() => normalizeAccessRouterRuntimeConfigExport({ default: { data } }, 'generated-entry.js')).toThrow(
        /generated-entry\.js.*data\[0\]\.router.*must be a plain object/,
      );
      expect(() => validateAccessRouterRuntimeConfig({ data } as never, 'runtime config')).toThrow(
        /runtime config.*data\[0\]\.router.*must be a plain object/,
      );
    }

    // Valid empty model/data router options retain supported behavior.
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport(
        {
          default: {
            models: [{ name: 'AccessRouterRuntimeLoaderB07Empty', schema, router: {} }],
            data: [{ name: 'status', router: {} }],
          },
        },
        'generated-entry.js',
      ),
    ).not.toThrow();
    expect(() =>
      validateAccessRouterRuntimeConfig(
        {
          models: [{ name: 'AccessRouterRuntimeLoaderB07Empty', schema, router: {} }],
          data: [{ name: 'status', router: {} }],
        } as never,
        'runtime config',
      ),
    ).not.toThrow();
  });

  it('rejects duplicate schema-option and mixed collections while allowing explicit overrides', () => {
    const schemaCollection = (collection: string) => new mongoose.Schema({ title: String }, { collection });

    // Duplicate schema-option collections rejected before registration.
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport(
        {
          default: {
            models: [
              {
                name: 'AccessRouterRuntimeLoaderB07SchemaA',
                schema: schemaCollection('b07-shared-schema'),
                router: {},
              },
              {
                name: 'AccessRouterRuntimeLoaderB07SchemaB',
                schema: schemaCollection('b07-shared-schema'),
                router: {},
              },
            ],
          },
        },
        'generated-entry.js',
      ),
    ).toThrow(/generated-entry\.js.*duplicate collection name "b07-shared-schema".*models\[1\]/);
    expect(() =>
      validateAccessRouterRuntimeConfig(
        {
          models: [
            { name: 'AccessRouterRuntimeLoaderB07SchemaA', schema: schemaCollection('b07-shared-schema'), router: {} },
            { name: 'AccessRouterRuntimeLoaderB07SchemaB', schema: schemaCollection('b07-shared-schema'), router: {} },
          ],
        } as never,
        'runtime config',
      ),
    ).toThrow(/runtime config.*duplicate collection name "b07-shared-schema"/);

    // Mixed schema-option/definition-level collision rejected.
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport(
        {
          default: {
            models: [
              { name: 'AccessRouterRuntimeLoaderB07MixedA', schema: schemaCollection('b07-mixed'), router: {} },
              {
                name: 'AccessRouterRuntimeLoaderB07MixedB',
                schema: new mongoose.Schema({ title: String }),
                collection: 'b07-mixed',
                router: {},
              },
            ],
          },
        },
        'generated-entry.js',
      ),
    ).toThrow(/generated-entry\.js.*duplicate collection name "b07-mixed"/);

    // Mixed schema-option/existing-model collision rejected.
    const existing = mongoose.model(
      'AccessRouterRuntimeLoaderB07Existing',
      new mongoose.Schema({ title: String }, { collection: 'b07-existing-mixed' }),
    );
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport(
        {
          default: {
            models: [
              { model: existing, router: {} },
              {
                name: 'AccessRouterRuntimeLoaderB07MixedSchema',
                schema: schemaCollection('b07-existing-mixed'),
                router: {},
              },
            ],
          },
        },
        'generated-entry.js',
      ),
    ).toThrow(/generated-entry\.js.*duplicate collection name "b07-existing-mixed"/);

    // Legitimate explicit override avoids a false collision: definition-level
    // collection takes precedence over its own schema option.
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport(
        {
          default: {
            models: [
              {
                name: 'AccessRouterRuntimeLoaderB07OverrideA',
                schema: schemaCollection('b07-base'),
                collection: 'b07-explicit-a',
                router: {},
              },
              { name: 'AccessRouterRuntimeLoaderB07OverrideB', schema: schemaCollection('b07-other'), router: {} },
            ],
          },
        },
        'generated-entry.js',
      ),
    ).not.toThrow();
  });

  it('shares router and collection validation across direct, sync-load, and generated-entry paths', () => {
    const directRouterConfig = { data: [{ name: 'status', router: null }] } as never;
    expect(() => validateAccessRouterRuntimeConfig(directRouterConfig, 'runtime config')).toThrow(
      /runtime config.*data\[0\]\.router/,
    );
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport({ default: directRouterConfig }, 'generated-entry.js'),
    ).toThrow(/generated-entry\.js.*data\[0\]\.router/);

    const { dir: routerDir } = createTempProject('access-router-runtime-config-b07-router-');
    writeFileSync(
      join(routerDir, 'access-router.config.ts'),
      "export default { data: [{ name: 'status', router: null }] };\n",
      'utf8',
    );
    process.chdir(routerDir);
    expect(() => loadAccessRouterRuntimeConfigSync('./access-router.config.ts')).toThrow(
      /Invalid access-router-runtime config.*data\[0\]\.router/,
    );

    const directCollectionConfig = {
      models: [
        {
          name: 'AccessRouterRuntimeLoaderB07SyncA',
          schema: new mongoose.Schema({ title: String }, { collection: 'b07-sync-shared' }),
          router: {},
        },
        {
          name: 'AccessRouterRuntimeLoaderB07SyncB',
          schema: new mongoose.Schema({ title: String }, { collection: 'b07-sync-shared' }),
          router: {},
        },
      ],
    } as never;
    expect(() => validateAccessRouterRuntimeConfig(directCollectionConfig, 'runtime config')).toThrow(
      /runtime config.*duplicate collection name "b07-sync-shared"/,
    );
    expect(() =>
      normalizeAccessRouterRuntimeConfigExport({ default: directCollectionConfig }, 'generated-entry.js'),
    ).toThrow(/generated-entry\.js.*duplicate collection name "b07-sync-shared"/);

    const { dir: collectionDir } = createTempProject('access-router-runtime-config-b07-collection-');
    writeFileSync(
      join(collectionDir, 'access-router.config.ts'),
      [
        "import mongoose from 'mongoose';",
        'export default {',
        '  models: [',
        "    { name: 'AccessRouterRuntimeLoaderB07SyncA', schema: new mongoose.Schema({ title: String }, { collection: 'b07-sync-shared' }), router: {} },",
        "    { name: 'AccessRouterRuntimeLoaderB07SyncB', schema: new mongoose.Schema({ title: String }, { collection: 'b07-sync-shared' }), router: {} },",
        '  ],',
        '};',
        '',
      ].join('\n'),
      'utf8',
    );
    process.chdir(collectionDir);
    expect(() => loadAccessRouterRuntimeConfigSync('./access-router.config.ts')).toThrow(
      /Invalid access-router-runtime config.*duplicate collection name "b07-sync-shared"/,
    );
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
