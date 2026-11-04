import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertCollectionDiagnostics,
  assertMigrationDiagnostics,
  extractMigrationBlocks,
} from './migration-guide-fixture';

const packageRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '..', '..');
const tempDirs: string[] = [];
const TSC_PATH = ['node_modules', 'typescript', 'bin', 'tsc'];

type Link = { kind: 'pkg'; name: string } | { kind: 'scoped'; scope: string; name: string };

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function stageConsumerDir(): string {
  const consumerDir = mkdtempSync(path.join(os.tmpdir(), 'access-router-arf14-consumer-'));
  tempDirs.push(consumerDir);

  const consumerPkgRoot = path.join(consumerDir, 'node_modules', '@web-ts-toolkit', 'access-router');
  mkdirSync(consumerPkgRoot, { recursive: true });
  cpSync(path.resolve(packageRoot, 'dist'), path.resolve(consumerPkgRoot, 'dist'), { recursive: true });
  cpSync(path.resolve(packageRoot, 'package.json'), path.resolve(consumerPkgRoot, 'package.json'));
  cpSync(path.resolve(packageRoot, 'README.md'), path.resolve(consumerPkgRoot, 'README.md'));
  cpSync(path.resolve(packageRoot, 'MIGRATION.md'), path.resolve(consumerPkgRoot, 'MIGRATION.md'));

  const hoistedDirs = [path.join(packageRoot, 'node_modules'), path.join(workspaceRoot, 'node_modules')];
  const ensure = (link: Link): boolean => {
    for (const base of hoistedDirs) {
      const realPath = link.kind === 'pkg' ? path.join(base, link.name) : path.join(base, link.scope, link.name);
      if (!existsSync(realPath)) continue;

      const symlinkPath =
        link.kind === 'pkg'
          ? path.join(consumerDir, 'node_modules', link.name)
          : path.join(consumerDir, 'node_modules', link.scope, link.name);
      mkdirSync(path.dirname(symlinkPath), { recursive: true });
      if (!existsSync(symlinkPath)) {
        symlinkSync(realPath, symlinkPath, 'dir');
      }
      return true;
    }

    return false;
  };

  const required: Link[] = [
    { kind: 'pkg', name: 'express' },
    { kind: 'pkg', name: 'mongoose' },
    { kind: 'pkg', name: 'typescript' },
    { kind: 'pkg', name: 'zod' },
    { kind: 'pkg', name: 'ajv' },
    { kind: 'pkg', name: 'just-diff' },
    { kind: 'pkg', name: 'sift' },
    { kind: 'pkg', name: 'winston' },
    { kind: 'pkg', name: 'mongoose-schema-jsonschema' },
    { kind: 'scoped', scope: '@web-ts-toolkit', name: 'utils' },
    { kind: 'scoped', scope: '@web-ts-toolkit', name: 'express-json-router' },
    { kind: 'scoped', scope: '@types', name: 'node' },
    { kind: 'scoped', scope: '@types', name: 'express' },
  ];

  for (const link of required) {
    if (!ensure(link)) {
      throw new Error(`ARF-14 consumer stage failed: missing dependency ${JSON.stringify(link)}`);
    }
  }

  return consumerDir;
}

function run(cmd: string, args: string[], cwd: string): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const error = err as { status?: number; stdout?: string; stderr?: string; message?: string };
    return {
      status: error.status ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message ?? '',
    };
  }
}

describe('ARF-14 strict packed-consumer types', () => {
  let consumerDir: string;

  beforeAll(() => {
    consumerDir = stageConsumerDir();
  });

  it.each([
    ['Bundler', 'ts', 'ESNext'],
    ['NodeNext', 'mts', 'NodeNext'],
    ['NodeNext', 'cts', 'NodeNext'],
    ['Node16', 'mts', 'Node16'],
    ['Node16', 'cts', 'Node16'],
  ])(
    'OAR-09F checks conservative collection types and real negative diagnostics (%s / %s)',
    (resolution, extension, module) => {
      const sources = ['owned-authorization-many.types.fixture', 'owned-authorization-many-consumer.types.fixture'];
      for (const source of [...sources, 'owned-authorization-many.invalid.types.fixture'])
        writeFileSync(
          path.resolve(consumerDir, `${source}.${extension}`),
          readFileSync(path.resolve(packageRoot, `test/${source}.ts`), 'utf8'),
        );
      const compile = (files: string[]) => {
        const config = `tsconfig-many-${resolution}-${extension}.json`;
        writeFileSync(
          path.resolve(consumerDir, config),
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              module,
              moduleResolution: resolution,
              strict: true,
              noUnusedLocals: true,
              noUnusedParameters: true,
              noEmit: true,
              skipLibCheck: false,
              esModuleInterop: true,
              types: ['node'],
            },
            files,
          }),
        );
        return run('node', [path.resolve(consumerDir, ...TSC_PATH), '-p', config], consumerDir);
      };
      const positive = compile(sources.map((source) => `${source}.${extension}`));
      expect(positive.stdout + positive.stderr).toBe('');
      expect(positive.status).toBe(0);
      const file = `owned-authorization-many.invalid.types.fixture.${extension}`;
      const negative = compile([file]);
      expect(negative.status).not.toBe(0);
      assertCollectionDiagnostics(
        readFileSync(path.resolve(consumerDir, file), 'utf8'),
        file,
        negative.stdout + negative.stderr,
      );
    },
  );

  it.each([
    ['Bundler', 'ts', 'ESNext'],
    ['NodeNext', 'mts', 'NodeNext'],
    ['NodeNext', 'cts', 'NodeNext'],
    ['Node16', 'mts', 'Node16'],
    ['Node16', 'cts', 'Node16'],
  ])(
    'OAR-08 checks installed modes, immutable diagnostics and exact guide workflow (%s / %s)',
    (resolution, extension, module) => {
      const source = `fast-path-${resolution}.${extension}`;
      const example = `fast-path-readme-${resolution}.${extension}`;
      writeFileSync(
        path.resolve(consumerDir, source),
        readFileSync(path.resolve(packageRoot, 'test/authorization-fast-path-consumer.types.fixture.ts'), 'utf8'),
      );
      const readme = readFileSync(
        path.resolve(consumerDir, 'node_modules/@web-ts-toolkit/access-router/MIGRATION.md'),
        'utf8',
      );
      const snippet = [...readme.matchAll(/<!--\s*doc-example:\s*complete-runtime\s*-->\s*```ts\n([\s\S]*?)```/g)]
        .map((match) => match[1])
        .find((text) => text.includes('async function runOwnedAuthorizationExample()'));
      expect(snippet, 'installed runnable owned-authorization guide').toBeDefined();
      writeFileSync(path.resolve(consumerDir, example), snippet!);
      const config = `tsconfig-fast-path-${resolution}-${extension}.json`;
      writeFileSync(
        path.resolve(consumerDir, config),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module,
            moduleResolution: resolution,
            strict: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            noEmit: true,
            skipLibCheck: false,
            esModuleInterop: true,
            types: ['node'],
          },
          files: [source, example],
        }),
      );
      const result = run('node', [path.resolve(consumerDir, ...TSC_PATH), '-p', config], consumerDir);
      if (result.status !== 0)
        throw new Error(`Owned guide workflow compile failed:\n${result.stdout}${result.stderr}`);
      expect(result.stdout + result.stderr).toBe('');
      expect(result.status).toBe(0);
    },
  );

  it.each([
    ['Bundler', 'ts', 'ESNext'],
    ['NodeNext', 'mts', 'NodeNext'],
    ['NodeNext', 'cts', 'NodeNext'],
    ['Node16', 'mts', 'Node16'],
    ['Node16', 'cts', 'Node16'],
  ])(
    'OAR-08 retires ten flags and keeps unshipped fusion controls absent (%s / %s)',
    (resolution, extension, module) => {
      const source = `publication-withdrawal-${resolution}.${extension}`;
      writeFileSync(
        path.resolve(consumerDir, source),
        readFileSync(path.resolve(packageRoot, 'test/output-publication-fusion-withdrawal.types.fixture.ts'), 'utf8'),
      );
      const config = `tsconfig-publication-withdrawal-${resolution}-${extension}.json`;
      writeFileSync(
        path.resolve(consumerDir, config),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module,
            moduleResolution: resolution,
            strict: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            noEmit: true,
            skipLibCheck: false,
            esModuleInterop: true,
            types: ['node'],
          },
          files: [source],
        }),
      );
      const result = run('node', [path.resolve(consumerDir, ...TSC_PATH), '-p', config], consumerDir);
      expect(result.stdout + result.stderr).toBe('');
      expect(result.status).toBe(0);
    },
  );

  it.each([
    ['Bundler', 'ts', 'ESNext'],
    ['NodeNext', 'mts', 'NodeNext'],
    ['NodeNext', 'cts', 'NodeNext'],
    ['Node16', 'mts', 'Node16'],
    ['Node16', 'cts', 'Node16'],
  ])(
    'OAR-08 compiles every guide target and separately rejects every old statement (%s / %s)',
    (resolution, extension, module) => {
      const guide = readFileSync(
        path.resolve(consumerDir, 'node_modules/@web-ts-toolkit/access-router/MIGRATION.md'),
        'utf8',
      );
      const blocks = extractMigrationBlocks(guide);
      const positive: string[] = [];
      const invalid = [
        {
          source: readFileSync(
            path.resolve(packageRoot, 'test/owned-authorization-migration.invalid.types.fixture.ts'),
            'utf8',
          ),
        },
        ...blocks.filter((block) => block.kind === 'expected-error'),
      ];
      blocks
        .filter((block) => block.kind !== 'expected-error')
        .forEach((block, index) => {
          const file = `guide-${resolution}-${index}.${extension}`;
          writeFileSync(path.resolve(consumerDir, file), block.source);
          positive.push(file);
        });
      const compile = (files: string[]) => {
        const config = `tsconfig-guide-${resolution}-${extension}.json`;
        writeFileSync(
          path.resolve(consumerDir, config),
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              module,
              moduleResolution: resolution,
              strict: true,
              noUnusedLocals: true,
              noUnusedParameters: true,
              noEmit: true,
              skipLibCheck: false,
              esModuleInterop: true,
              types: ['node'],
            },
            files,
          }),
        );
        return run('node', [path.resolve(consumerDir, ...TSC_PATH), '-p', config], consumerDir);
      };
      const result = compile(positive);
      if (result.status !== 0) throw new Error(`Owned guide targets compile failed:\n${result.stdout}${result.stderr}`);
      expect(result.stdout + result.stderr).toBe('');
      expect(result.status).toBe(0);
      invalid.forEach((block, index) => {
        const file = `guide-invalid-${resolution}-${index}.${extension}`;
        writeFileSync(path.resolve(consumerDir, file), block.source);
        const rejected = compile([file]);
        expect(rejected.status).not.toBe(0);
        assertMigrationDiagnostics(block.source, file, rejected.stdout + rejected.stderr);
      });
    },
  );

  it.each(['ts', 'mts', 'cts'])('DPV-01 checks private populated getter inputs (%s)', (extension) => {
    const source = `virtuals-populate-dependencies.${extension}`;
    writeFileSync(
      path.resolve(consumerDir, source),
      readFileSync(path.resolve(packageRoot, 'test/virtuals-populate-dependencies.types.fixture.ts'), 'utf8'),
    );
    const config = `tsconfig-dpv01-${extension}.json`;
    writeFileSync(
      path.resolve(consumerDir, config),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: extension === 'ts' ? 'ESNext' : 'NodeNext',
          moduleResolution: extension === 'ts' ? 'Bundler' : 'NodeNext',
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noEmit: true,
          skipLibCheck: true,
          types: ['node'],
          lib: ['ES2022', 'DOM'],
        },
        files: [source],
      }),
    );
    const result = run('node', [path.resolve(consumerDir, ...TSC_PATH), '-p', config], consumerDir);
    expect(result.stdout + result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it.each(['ts', 'mts', 'cts'])(
    'MPO-03 checks precise optional target/default populate flags and caller boundaries (%s)',
    (extension) => {
      const source = `private-populate-read-policy.${extension}`;
      writeFileSync(
        path.resolve(consumerDir, source),
        readFileSync(path.resolve(packageRoot, 'test/private-populate-read-policy.types.fixture.ts'), 'utf8'),
      );
      const config = `tsconfig-pop04-${extension}.json`;
      writeFileSync(
        path.resolve(consumerDir, config),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: extension === 'ts' ? 'ESNext' : 'NodeNext',
            moduleResolution: extension === 'ts' ? 'Bundler' : 'NodeNext',
            strict: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            noEmit: true,
            skipLibCheck: false,
            types: ['node'],
            lib: ['ES2022', 'DOM'],
          },
          files: [source],
        }),
      );
      const result = run('node', [path.resolve(consumerDir, ...TSC_PATH), '-p', config], consumerDir);
      expect(result.stdout + result.stderr).toBe('');
      expect(result.status).toBe(0);
    },
  );

  it.each([
    ['Bundler', 'ts', 'ESNext'],
    ['NodeNext', 'mts', 'NodeNext'],
    ['NodeNext', 'cts', 'NodeNext'],
    ['Node16', 'mts', 'Node16'],
    ['Node16', 'cts', 'Node16'],
  ])('ARL-08 checks installed numeric count API (%s / %s)', (resolution, extension, module) => {
    const source = `grouped-count-${resolution}.${extension}`;
    writeFileSync(
      path.resolve(consumerDir, source),
      readFileSync(path.resolve(packageRoot, 'test/grouped-count-consumer.types.fixture.ts'), 'utf8'),
    );
    const config = `tsconfig-grouped-count-${resolution}-${extension}.json`;
    writeFileSync(
      path.resolve(consumerDir, config),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module,
          moduleResolution: resolution,
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noEmit: true,
          skipLibCheck: true,
          esModuleInterop: true,
          types: ['node'],
        },
        files: [source],
      }),
    );
    const result = run('node', [path.resolve(consumerDir, ...TSC_PATH), '-p', config], consumerDir);
    expect(result.stdout + result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it.each([
    ['Bundler', 'ts', 'ESNext'],
    ['NodeNext', 'mts', 'NodeNext'],
    ['NodeNext', 'cts', 'NodeNext'],
    ['Node16', 'mts', 'Node16'],
    ['Node16', 'cts', 'Node16'],
  ])('SVA-F03 checks finite named helper migrations (%s / %s)', (resolution, extension, module) => {
    const source = `field-helper-${resolution}.${extension}`;
    writeFileSync(
      path.resolve(consumerDir, source),
      readFileSync(path.resolve(packageRoot, 'test/field-helper-migration.types.fixture.ts'), 'utf8'),
    );
    const runtime = `field-helper-runtime-${resolution}.${extension}`;
    writeFileSync(
      path.resolve(consumerDir, runtime),
      readFileSync(path.resolve(packageRoot, 'test/field-helper-consumer.runtime.fixture.ts'), 'utf8'),
    );
    const config = `tsconfig-helper-${resolution}-${extension}.json`;
    writeFileSync(
      path.resolve(consumerDir, config),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module,
          moduleResolution: resolution,
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noEmit: true,
          skipLibCheck: true,
          esModuleInterop: true,
          types: ['node'],
        },
        files: [source, runtime],
      }),
    );
    const result = run('node', [path.resolve(consumerDir, ...TSC_PATH), '-p', config], consumerDir);
    expect(result.stdout + result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it.each(['ts', 'mts', 'cts'])(
    'SVA-10 checks installed authorization types and public boundaries (%s)',
    (extension) => {
      const sources = [
        'service-authorization-consumer.types.fixture',
        'service-authorization-boundary.types.fixture',
        'hydration-consumer.types.fixture',
        'document-permissions-dependencies.types.fixture',
      ];
      for (const source of sources) {
        const snippet = readFileSync(path.resolve(packageRoot, `test/${source}.ts`), 'utf8')
          .replaceAll("'../dist/index.js'", "'@web-ts-toolkit/access-router'")
          .replaceAll("'../dist/advanced.js'", "'@web-ts-toolkit/access-router/advanced'");
        writeFileSync(path.resolve(consumerDir, `${source}.${extension}`), snippet);
      }
      const configFile = `tsconfig-sva10-${extension}.json`;
      writeFileSync(
        path.resolve(consumerDir, configFile),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: extension === 'ts' ? 'ESNext' : 'NodeNext',
            moduleResolution: extension === 'ts' ? 'Bundler' : 'NodeNext',
            strict: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            noEmit: true,
            skipLibCheck: true,
            types: ['node'],
            lib: ['ES2022', 'DOM'],
          },
          files: sources.map((source) => `${source}.${extension}`),
        }),
      );
      const result = run('node', [path.resolve(consumerDir, ...TSC_PATH), '-p', configFile], consumerDir);
      expect(result.stdout + result.stderr).toBe('');
      expect(result.status).toBe(0);
    },
  );

  it.each(['ts', 'mts', 'cts'])('rejects the removed service overrides surface (%s)', (extension) => {
    const sourceFile = `sva09-migration.${extension}`;
    writeFileSync(
      path.resolve(consumerDir, sourceFile),
      readFileSync(path.resolve(packageRoot, 'test/service-authorization-migration.types.fixture.ts'), 'utf8'),
    );
    const configFile = `tsconfig-sva09-${extension}.json`;
    writeFileSync(
      path.resolve(consumerDir, configFile),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: extension === 'ts' ? 'ESNext' : 'NodeNext',
          moduleResolution: extension === 'ts' ? 'Bundler' : 'NodeNext',
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noEmit: true,
          skipLibCheck: true,
          types: ['node'],
          lib: ['ES2022', 'DOM'],
        },
        files: [sourceFile],
      }),
    );
    const result = run('node', [path.resolve(consumerDir, ...TSC_PATH), '-p', configFile], consumerDir);
    expect(result.stdout + result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it.each(['ts', 'mts', 'cts'])(
    'accepts real AJV overloads and rejects unsupported structural validators (%s)',
    (extension) => {
      const sourceFile = `ajv-consumer.${extension}`;
      writeFileSync(
        path.resolve(consumerDir, sourceFile),
        `
      import { Ajv, type AsyncSchema, type ValidateFunction, type AsyncValidateFunction } from 'ajv';
      import { fromAjv, type AjvValidatorLike, type RequestSchemaValidator } from '@web-ts-toolkit/access-router';

      const ajv = new Ajv();
      const sync: ValidateFunction<boolean> = ajv.compile<boolean>({ type: 'boolean' });
      const asyncSchema: AsyncSchema = { $async: true, type: 'boolean' };
      const async: AsyncValidateFunction<boolean> = ajv.compile<boolean>(asyncSchema);
      const syncShape: AjvValidatorLike<boolean> = sync;
      const asyncShape: AjvValidatorLike<boolean> = async;
      const syncAdapter: RequestSchemaValidator<boolean> = fromAjv<boolean>(sync);
      const inferredAsync = fromAjv(async);
      const asyncAdapter: RequestSchemaValidator<boolean> = inferredAsync;
      const plainSync = fromAjv(sync);
      const inferredSync: RequestSchemaValidator<boolean> = plainSync;
      function acceptUnion(validate: ValidateFunction<boolean> | AsyncValidateFunction<boolean>) { return fromAjv<boolean>(validate); }
      const retrieved = ajv.getSchema<boolean>('registered-schema');
      if (retrieved) fromAjv<boolean>(retrieved);
      const inline = ajv.compile<boolean>({ $async: true, type: 'boolean' });
      fromAjv<boolean>(inline);
      const inferredInline = fromAjv(inline);
      const inlineAdapter: RequestSchemaValidator<boolean> = inferredInline;
      // AJV permits erasing an async validator to its sync base interface. The
      // actual runtime tag still decides semantics; don't copy or wrap it away.
      const erased: ValidateFunction<boolean> = async;
      const erasedAdapter = fromAjv<boolean>(erased);
      const structuralSync: AjvValidatorLike = () => true;
      const structuralAsync: AjvValidatorLike<boolean> = Object.assign(async () => false, { $async: true as const });
      const thenable: AjvValidatorLike<boolean> = Object.assign(
        (): PromiseLike<boolean> => Promise.resolve(false), { $async: true as const },
      );
      const structuralAdapter: RequestSchemaValidator<boolean> = fromAjv(structuralAsync);
      // @ts-expect-error async output is boolean, not string
      const wrongAdapter: RequestSchemaValidator<string> = inferredAsync;
      // @ts-expect-error untagged async verdicts are unsupported
      fromAjv(async () => false);
      // @ts-expect-error an explicit false tag cannot return a promise
      fromAjv(Object.assign(async () => false, { $async: false as const }));
      // @ts-expect-error tag must be the literal true, not a widened boolean
      fromAjv(Object.assign(async () => false, { $async: true }));
      // @ts-expect-error tagged async structural calls must return a promise/thenable
      fromAjv(Object.assign(() => false, { $async: true as const }));
      // @ts-expect-error synchronous data-returning validators are unsupported
      fromAjv(() => ({ value: true }));
      async function compiledLater() {
        const loadedSync = await ajv.compileAsync<boolean>({ type: 'boolean' });
        const loadedAsync: AsyncValidateFunction<boolean> = await ajv.compileAsync<boolean>(asyncSchema);
        const inferredLoaded = fromAjv(loadedAsync);
        const s: RequestSchemaValidator<boolean> = fromAjv<boolean>(loadedSync);
        const a: RequestSchemaValidator<boolean> = inferredLoaded;
        return [s, a];
      }
      void [syncShape, asyncShape, syncAdapter, asyncAdapter, inferredSync, inlineAdapter, acceptUnion,
        erasedAdapter, structuralSync, structuralAdapter, thenable, wrongAdapter, compiledLater];
    `,
      );
      const tsconfigPath = path.resolve(consumerDir, `tsconfig.ajv-${extension}.json`);
      writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: extension === 'ts' ? 'ESNext' : 'NodeNext',
            moduleResolution: extension === 'ts' ? 'Bundler' : 'NodeNext',
            strict: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            noEmit: true,
            skipLibCheck: true,
            types: ['node'],
            lib: ['ES2022', 'DOM'],
          },
          files: [sourceFile],
        }),
      );
      const result = run('node', [path.resolve(consumerDir, ...TSC_PATH), '-p', tsconfigPath], consumerDir);
      expect(result.stdout + result.stderr).toBe('');
      expect(result.status).toBe(0);
    },
  );

  it('accepts valid filters/projections/runtime calls and rejects invalid ones across public subpaths', () => {
    const sourceFile = path.resolve(consumerDir, 'strict-consumer.ts');
    const tsconfigPath = path.resolve(consumerDir, 'tsconfig.strict-consumer.json');
    const snippet = `
      import acl, {
        ModelRouter,
        createAccessRuntime,
        getModelInstance,
        guard,
        registerModelInstance,
        type ExtendedModelRouterOptions,
        type GuardModelCondition,
        type ModelDocumentHook,
        type ModelHook,
        type ModelListHook,
        type ModelRouterOptions,
      } from '@web-ts-toolkit/access-router';
      import { Codes, type Filter, type Projection, type SelectedPublicOutput } from '@web-ts-toolkit/access-router/advanced';
      import {
        copyAndDepopulate,
        type CopyAndDepopulateOptions,
        type CopyAndDepopulateOutput,
        type ProcessCopy,
      } from '@web-ts-toolkit/access-router/processors';
      import mongoose from 'mongoose';

      type User = {
        name: string;
        age: number;
        profile: { email: string; active: boolean };
        tags: Array<{ label: string }>;
      };

      type OptUser = {
        name: string;
        age: number;
        profile?: { email: string; active: boolean } | null;
        tags?: Array<{ label: string }> | null;
        meta?: { count: number; note?: string | null } | null;
      };

      const runtime = createAccessRuntime();
      runtime.setGlobalOption('requestPermissionField', '_permissions');

      const condition: GuardModelCondition = {
        modelName: 'User',
        id: { type: 'param', key: 'id' },
        condition: 'canReadUser',
      };
      const handler = guard(condition);

      const filter: Filter<User> = {
        age: { $gte: 18 },
        'profile.email': { $regex: /@example\\.com$/ },
        'tags.label': 'vip',
      };
      const projection: Projection = ['name', 'profile.email'];
      const selected: SelectedPublicOutput<User, ['name', 'profile.email']> = {
        name: 'Ada',
        profile: { email: 'ada@example.com' },
      };

      const UserSchema = new mongoose.Schema(
        { name: { type: String, required: true }, age: { type: Number, required: true } },
        { strict: false },
      );
      const UserModel = mongoose.model<User>('ARH10User', UserSchema);

      registerModelInstance('ARH10User', UserModel);
      acl.registerModelInstance('ARH10User', UserModel);
      runtime.registerModelInstance('ARH10User', UserModel);
      const namedRetrieved: mongoose.Model<User> | null = getModelInstance<User>('ARH10User');
      const facadeRetrieved: mongoose.Model<User> | null = acl.getModelInstance<User>('ARH10User');
      const runtimeRetrieved: mongoose.Model<User> | null = runtime.getModelInstance<User>('ARH10User');

      const typedRouter = acl.createRouter(UserModel, { permissionSchema: { name: true } });
      const typedRouterCheck: ModelRouter<User> = typedRouter;
      const inferredRouter = ModelRouter.fromModel(UserModel, { permissionSchema: { age: true } });
      const inferredCheck: ModelRouter<User> = inferredRouter;
      // @ts-expect-error fromModel must infer User, not an unrelated shape
      const inferredMismatch: ModelRouter<{ unrelated: number }> = inferredRouter;

      const decorateValid: ModelHook<User> = function (value) {
        void value.name;
        return value;
      };
      const decorateBad: ModelHook<User> = function (value) {
        // @ts-expect-error unknown hook field must fail
        void value.missing;
        return value;
      };
      const listValid: ModelListHook<User> = function (value) {
        void value[0].name;
        return value;
      };
      const listBad: ModelListHook<User> = function (value) {
        // @ts-expect-error unknown list hook field must fail
        void value[0].missing;
        return value;
      };
      const docValid: ModelDocumentHook<User> = function (value) {
        void value.name;
        return value;
      };
      const docBad: ModelDocumentHook<User> = function (value) {
        // @ts-expect-error unknown document hook field must fail
        void value.missing;
        return value;
      };

      const modelOpts: ModelRouterOptions<User> = {
        decorate: function (value) {
          void value.name;
          return value;
        },
        decorateAll: function (value) {
          void value[0].name;
          return value;
        },
        transform: function (value) {
          void value.name;
          return value;
        },
        afterPersist: function (value) {
          void value.age;
          return value;
        },
      };

      const dottedOpts: ExtendedModelRouterOptions<User> = {
        'decorate.list': function (value) {
          void value.name;
          return value;
        },
        'decorateAll.list': function (value) {
          void value[0].age;
          return value;
        },
        'prepare.create': function (value) {
          void value.age;
          return value;
        },
        'transform.update': function (value) {
          void value.name;
          return value;
        },
        'afterPersist.create': function (value) {
          void value.age;
          return value;
        },
      };
      const dottedBad: ExtendedModelRouterOptions<User> = {
        'decorate.list': function (value) {
          // @ts-expect-error dotted hook must reject unknown field
          void value.missing;
          return value;
        },
      };

      typedRouter.set('decorate.list', function (value) {
        void value.name;
        return value;
      });
      typedRouter.set('decorateAll.list', function (value) {
        void value[0].name;
        return value;
      });
      typedRouter.set('transform.update', function (value) {
        void value.name;
        return value;
      });
      typedRouter.set('decorate.list', function (value) {
        // @ts-expect-error router.set must reject unknown hook field
        void value.missing;
        return value;
      });

      const optFilter: Filter<OptUser> = {
        'profile.email': 'ada@example.com',
        'profile.active': true,
        'tags.label': 'vip',
        'meta.count': 1,
        'meta.note': 'hello',
      };
      // @ts-expect-error nonexistent optional dotted path must fail
      const optBadPath: Filter<OptUser> = { 'profile.missing': true };
      // @ts-expect-error wrong leaf value must fail
      const optBadLeaf: Filter<OptUser> = { 'profile.email': 123 };

      const op: ProcessCopy = { src: 'profile', dest: 'profileId' };
      const processorOptions: CopyAndDepopulateOptions = { mutable: false };
      type DepopulatedProfile = { profile: string; profileId: { _id: string; email: string } };
      const depopulated = copyAndDepopulate<DepopulatedProfile>(
        { profile: { _id: 'p1', email: 'ada@example.com' } },
        [op],
        processorOptions,
      );
      const conservativeDepopulated: CopyAndDepopulateOutput = copyAndDepopulate(
        { profile: { _id: 'p1', email: 'ada@example.com' } },
        [op],
        processorOptions,
      );
      const depopulatedProfileId: string = depopulated.profile;

      // @ts-expect-error default processor output cannot be treated as the original populated object shape
      conservativeDepopulated.profile.email;

      // @ts-expect-error requestPermissionField must remain a string
      runtime.setGlobalOption('requestPermissionField', 123);

      // @ts-expect-error unknown filter field must fail to compile
      const badFilter: Filter<User> = { missing: true };

      // @ts-expect-error unknown nested filter field must fail to compile
      const badNestedFilter: Filter<User> = { 'profile.missing': true };

      // @ts-expect-error selected output cannot expose fields outside the projection
      const badSelected: SelectedPublicOutput<User, ['name']> = { age: 1 };

      // @ts-expect-error guard ids must be strings or GuardModelConditionID objects
      const badCondition: GuardModelCondition = { modelName: 'User', id: 123, condition: 'canReadUser' };

      type VirtUser = { name: string; address: string };
      type VirtUserVirtuals = { fullAddress: string };

      const VirtSchema = new mongoose.Schema(
        { name: { type: String }, address: { type: String } },
        { strict: false },
      );
      const VirtModel = mongoose.model<VirtUser>('ARH10VirtUser', VirtSchema);
      runtime.registerModelInstance('ARH10VirtUser', VirtModel);

      const virtRouter = acl.createRouter<VirtUser, VirtUserVirtuals>(VirtModel, {
        permissionSchema: {
          name: { read: true },
          address: { read: 'canViewAddress' },
          fullAddress: { read: 'canViewAddress' },
        },
        virtuals: {
          fullAddress: {
            dependsOn: ['address'],
            read: async function (doc, _permissions, _ctx) {
              if (doc.address === undefined) return undefined;
              return \`addr:\${doc.address}\`;
            },
          },
        },
      });
      const virtRouterCheck: ModelRouter<VirtUser, VirtUserVirtuals> = virtRouter;

      virtRouter.virtuals({
        fullAddress: {
          dependsOn: ['address'],
          read: async function (doc) {
            void doc.address;
            return \`addr:\${doc.address}\`;
          },
        },
      });

      virtRouter.set('virtuals.fullAddress.read', {
        get: async function (doc) {
          void doc.address;
          return \`addr:\${doc.address}\`;
        },
        dependsOn: ['address'],
      });

      const virtBadDepends: ModelRouterOptions<VirtUser, VirtUserVirtuals> = {
        permissionSchema: { name: true, fullAddress: true },
        virtuals: {
          // @ts-expect-error 'addres' is not a persisted field of User
          fullAddress: { dependsOn: ['addres'], read: async (doc) => String((doc as never as { addres?: string }).addres) },
        },
      };

      virtRouter.set('virtuals.fullAddress.read', {
        get: async function (doc) {
          // @ts-expect-error unknown getter field must fail (dotted setter)
          void doc.missing;
          return undefined;
        },
        dependsOn: ['address'],
      });

      const virtSelected: SelectedPublicOutput<VirtUser, ['name', 'fullAddress'], VirtUserVirtuals> = {
        name: 'Ada',
        fullAddress: 'addr:x',
      };
      const virtSelectedOptional: SelectedPublicOutput<VirtUser, ['name', 'fullAddress'], VirtUserVirtuals> = {
        name: 'Ada',
      };

      // @ts-expect-error virtual fields must never widen persisted filters
      const virtBadFilter: Filter<VirtUser> = { fullAddress: 'x' };

      void [
        runtime,
        handler,
        filter,
        projection,
        selected,
        UserModel,
        namedRetrieved,
        facadeRetrieved,
        runtimeRetrieved,
        typedRouter,
        typedRouterCheck,
        inferredRouter,
        inferredCheck,
        inferredMismatch,
        decorateValid,
        decorateBad,
        listValid,
        listBad,
        docValid,
        docBad,
        modelOpts,
        dottedOpts,
        dottedBad,
        optFilter,
        optBadPath,
        optBadLeaf,
        depopulated,
        depopulatedProfileId,
        conservativeDepopulated,
        badFilter,
        badNestedFilter,
        badSelected,
        badCondition,
        VirtModel,
        virtRouter,
        virtRouterCheck,
        virtBadDepends,
        virtSelected,
        virtSelectedOptional,
        virtBadFilter,
        Codes.Success,
      ];
    `;

    writeFileSync(sourceFile, snippet);
    writeFileSync(
      tsconfigPath,
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            strict: true,
            noImplicitAny: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            noEmit: true,
            skipLibCheck: true,
            types: ['node'],
            lib: ['ES2022', 'DOM'],
          },
          include: ['strict-consumer.ts'],
        },
        null,
        2,
      ),
    );

    const tscAbsPath = path.resolve(consumerDir, ...TSC_PATH);
    const result = run('node', [tscAbsPath, '-p', tsconfigPath, '--noEmit'], consumerDir);

    if (result.status !== 0) {
      throw new Error(`ARF-14 strict consumer compile failed:\n${result.stdout}${result.stderr}`);
    }

    expect(result.status).toBe(0);
  });

  it.each(['ts', 'mts', 'cts'])('accepts nested operation rules and real typed setter paths (%s)', (extension) => {
    const sourceFile = `operation-access-consumer.${extension}`;
    const tsconfigPath = path.resolve(consumerDir, `tsconfig.operation-access-${extension}.json`);
    writeFileSync(
      path.resolve(consumerDir, sourceFile),
      `
      import acl, {
        createAccessRuntime,
        setModelOption,
        setDefaultModelOption,
        setDefaultModelOptions,
        type AccessRuntime,
        type AccessRouterPermissions,
        type AccessRouterRequest,
        type DataRouter,
        type DataRouterOptions,
        type DefaultModelRouterOptions,
        type ExtendedDataRouterOptions,
        type ExtendedDefaultModelRouterOptions,
        type ExtendedModelRouterOptions,
        type FieldOperationAccess,
        type GuardHook,
        type ModelRouter,
        type ModelRouterOptions,
        type OperationAccess,
        type OperationAccessContext,
        type OperationAccessRule,
        type OperationAccessVariants,
        type PairedRouteAccess,
        type PermissionSchema,
        type RouteBaseAccess,
        type RouteGuardAccess,
        type RouteVariant,
        type SubOperationAccess,
        type SubRouteGuardOptions,
        type Validation,
      } from '@web-ts-toolkit/access-router';
      import type {
        OperationAccess as AdvancedOperationAccess,
        OperationAccessContext as AdvancedOperationAccessContext,
        OperationAccessRule as AdvancedOperationAccessRule,
        OperationAccessVariants as AdvancedOperationAccessVariants,
        FieldOperationAccess as AdvancedFieldOperationAccess,
        PairedRouteAccess as AdvancedPairedRouteAccess,
        RouteBaseAccess as AdvancedRouteBaseAccess,
        RouteGuardAccess as AdvancedRouteGuardAccess,
        RouteVariant as AdvancedRouteVariant,
        SubOperationAccess as AdvancedSubOperationAccess,
        SubRouteGuardOptions as AdvancedSubRouteGuardOptions,
        ExtendedDataRouterOptions as AdvancedExtendedDataRouterOptions,
        AdvancedListBody,
        AdvancedReadBody,
        AdvancedReadFilterBody,
        AdvancedCreateBody,
        AdvancedUpdateBody,
        AdvancedUpsertBody,
        PopulateAccess,
      } from '@web-ts-toolkit/access-router/advanced';

      type Row = { name: string; comments: Array<{ text: string }> };
      type Virtuals = { displayName: string };

      const guard: GuardHook = async function (permissions) {
        const request: AccessRouterRequest = this;
        const checkedPermissions: AccessRouterPermissions = permissions;
        void [request, checkedPermissions];
        return true;
      };
      const variants = {
        list: { default: true, basic: true, advanced: 'canList', root: false },
        read: { default: true, basic: false, advanced: ['canRead', 'isAdmin'], root: guard },
        create: { default: true, basic: guard, advanced: true, root: 'canCreate' },
        update: { default: true, basic: 'canUpdate isOwner', advanced: guard, root: false },
        upsert: { default: true, basic: false, advanced: ['canCreate', 'canUpdate'], root: guard },
        count: { default: true, basic: true, advanced: guard, root: false },
        distinct: { default: true, basic: 'canRead', advanced: false, root: guard },
      } satisfies Record<PairedRouteAccess, OperationAccessVariants>;
      const operationKeys = ['list', 'read', 'create', 'update', 'upsert', 'count', 'distinct'] as const satisfies readonly PairedRouteAccess[];
      const contexts = ['basic', 'advanced', 'root'] as const satisfies readonly OperationAccessContext[];
      const dataVariantKeys = ['list.basic', 'list.advanced', 'list.root', 'read.basic', 'read.advanced', 'read.root'] as const;

      const subRules: SubOperationAccess = {
        list: { default: true, basic: false, advanced: guard, root: true },
        read: { default: 'canRead', basic: true, advanced: 'isAdmin', root: false },
        create: guard, update: false, delete: ['isAdmin'],
        customOperation: 'legacyPermission', omittedCustomOperation: undefined,
      };
      // Keep the existing broad dynamic sub-rule assignment compatible.
      const legacySubs: Record<string, Validation | Record<string, Validation>> = {
        comments: { list: true, customOperation: 'legacyPermission' },
        anotherField: guard,
      };
      const subs: SubRouteGuardOptions = legacySubs;
      const access: OperationAccess = {
        default: 'canAccess',
        new: { default: true, basic: guard, root: false }, delete: false,
        ...variants,
        subs: { ...subs, comments: subRules, scalarField: guard },
      };
      const optionalAccess: OperationAccess = { read: { basic: undefined }, list: { advanced: undefined } };
      const emptyAccess: OperationAccess = {};
      const umbrellaAccess: OperationAccess = { subs: 'legacyUmbrella' };
      const modelOptions: ModelRouterOptions<Row> = {
        basePath: '/rows', operationAccess: access, permissionSchema: { name: { read: true } },
      };
      const defaultOptions: DefaultModelRouterOptions = { operationAccess: { default: true, ...variants } };
      const virtualOptions: ModelRouterOptions<Row, Virtuals> = {
        operationAccess: access, permissionSchema: { name: true, displayName: { read: true } },
      };
      const api = createAccessRuntime();
      const runtime: AccessRuntime = api.runtime;
      const modelRouter: ModelRouter<Row> = api.createRouter<Row>('Oav01Consumer', modelOptions);
      const virtualRouter: ModelRouter<Row, Virtuals> = api.createRouter<Row, Virtuals>('Oav01VirtualConsumer', virtualOptions);

      for (const operation of operationKeys) for (const context of ['default', ...contexts] as const) {
        const key = \`\${operation}.\${context}\` as const;
        const optionPath = \`operationAccess.\${key}\` as const;
        const routeKey: keyof OperationAccess = operation;
        const rule: Validation = variants[operation][context];
        modelRouter.set(optionPath, rule).setOption(optionPath, rule);
        virtualRouter.set(optionPath, rule).setOption(optionPath, rule);
        modelRouter.operationAccess(key, rule);
        runtime.setModelOption('Oav01Consumer', optionPath, rule);
        api.setModelOption('Oav01Consumer', optionPath, rule);
        acl.setModelOption('Oav01Consumer', optionPath, rule);
        setModelOption('Oav01Consumer', optionPath, rule);
        runtime.setDefaultModelOption(optionPath, rule);
        api.setDefaultModelOption(optionPath, rule);
        acl.setDefaultModelOption(optionPath, rule);
        setDefaultModelOption(optionPath, rule);
        const modelDotted: ExtendedModelRouterOptions<Row, Virtuals> = {};
        const defaultDotted: ExtendedDefaultModelRouterOptions<Row> = {};
        modelDotted[optionPath] = rule;
        defaultDotted[optionPath] = rule;
        const selectedRule: Validation | undefined = runtime.getExactModelOption('Oav01Consumer', optionPath);
        void [routeKey, modelDotted, defaultDotted, selectedRule];
      }
      modelRouter.set('operationAccess.default', guard).setOption('operationAccess.read.basic', undefined);
      modelRouter.set({ operationAccess: { default: true, read: { basic: false } } });
      modelRouter.setOptions({ operationAccess: access });
      modelRouter.operationAccess(access).operationAccess('read.basic', false);
      modelRouter.operationAccess('subs.comments.read.basic', false);
      modelRouter.operationAccess('subs.comments.list.advanced', guard);
      modelRouter.operationAccess('read', { default: guard, root: false });
      modelRouter.setOption('operationAccess.delete', { default: false, basic: guard, root: true });
      modelRouter.set('operationAccess.subs', { comments: subRules });
      modelRouter.setOption('operationAccess.subs', 'legacyUmbrella');
      runtime.setModelOptions('Oav01Consumer', modelOptions);
      runtime.setModelOption('Oav01Consumer', 'operationAccess', { default: true, ...variants });
      api.setModelOptions('Oav01Consumer', modelOptions);
      runtime.setDefaultModelOptions(defaultOptions);
      api.setDefaultModelOptions(defaultOptions);
      setDefaultModelOptions(defaultOptions);
      setDefaultModelOption('operationAccess.default', true);
      api.setDefaultModelOption('operationAccess.subs', { comments: subRules });

      const shorthand: Validation[] = [true, false, 'canAccess', ['canAccess', 'isAdmin'], guard];
      for (const operationAccess of shorthand) {
        const modelShorthand: ModelRouterOptions<Row> = { operationAccess };
        const dataShorthand: DataRouterOptions<Row> = { operationAccess };
        modelRouter.operationAccess(operationAccess);
        void [modelShorthand, dataShorthand];
      }

      // Data keeps previously accepted model/base/sub rules; only list/read routes are generated.
      const dataOptions: DataRouterOptions<Row> = {
        data: [], operationAccess: {
          default: true, new: true, create: true, update: true,
          upsert: true, delete: false, count: true, distinct: true, subs: legacySubs,
          list: { default: true, basic: false, advanced: 'canList', root: guard },
          read: { default: true, basic: guard, advanced: ['isAdmin'], root: false },
        },
      };
      const dataRouter: DataRouter<Row> = api.createDataRouter('Oav01DataConsumer', dataOptions);
      for (const key of dataVariantKeys) {
        const optionPath = \`operationAccess.\${key}\` as const;
        dataRouter.set(optionPath, guard).setOption(optionPath, false);
        runtime.setDataOption('Oav01DataConsumer', optionPath, true);
        dataRouter.runtime.setDataOption('Oav01DataConsumer', optionPath, 'canAccess');
        dataRouter.operationAccess(key, guard);
        const dotted: ExtendedDataRouterOptions<Row> = { [optionPath]: false };
        const advancedDotted: AdvancedExtendedDataRouterOptions<Row> = dotted;
        const selectedRule: Validation | undefined = runtime.getDataOption('Oav01DataConsumer', optionPath);
        const exactRule: Validation | undefined = runtime.getExactDataOption('Oav01DataConsumer', optionPath);
        void [dotted, advancedDotted, selectedRule, exactRule];
      }
      dataRouter.set('operationAccess.default', true).setOption('operationAccess.list', guard);
      dataRouter.setOption('operationAccess.read', 'canRead');
      dataRouter.setOption('operationAccess.read.basic', undefined);
      dataRouter.set({ operationAccess: { default: true, read: { basic: false } } });
      dataRouter.setOptions(dataOptions);
      dataRouter.operationAccess({ default: true, list: { advanced: false } }).operationAccess('read.basic', false);
      dataRouter.operationAccess('subs.comments.read.basic', false);
      runtime.setDataOptions('Oav01DataConsumer', dataOptions);
      runtime.setDataOption('Oav01DataConsumer', 'operationAccess.default', guard);

      const legacyFieldRule: FieldOperationAccess = {
        new: true, list: true, read: guard, create: true, update: true,
        upsert: true, delete: false, count: true, distinct: true, subs: legacySubs,
      };
      const fieldSchema: PermissionSchema<'name'> = { name: legacyFieldRule };
      const advancedFieldRule: AdvancedFieldOperationAccess = legacyFieldRule;
      const advancedAccess: AdvancedOperationAccess = access;
      const advancedSubs: AdvancedSubRouteGuardOptions = subs;
      const advancedSubRule: AdvancedSubOperationAccess = subRules;
      const paired: PairedRouteAccess = 'upsert';
      const advancedPaired: AdvancedPairedRouteAccess = paired;
      const base: RouteBaseAccess = 'delete';
      const advancedBase: AdvancedRouteBaseAccess = base;
      const variant: RouteVariant = 'advanced';
      const advancedVariant: AdvancedRouteVariant = variant;
      const context: OperationAccessContext = 'root';
      const advancedContext: AdvancedOperationAccessContext = context;
      const rule: OperationAccessRule = { default: guard, [context]: false };
      const advancedRule: AdvancedOperationAccessRule = rule;
      const advancedVariants: AdvancedOperationAccessVariants = variants.read;
      const customGuardAccess: RouteGuardAccess = 'customAudit';
      const advancedCustomGuardAccess: AdvancedRouteGuardAccess = customGuardAccess;

      // OAV-06: advanced wire bodies use base-only PopulateAccess, not route variants.
      const listBody: AdvancedListBody = { options: { populateAccess: 'list' } };
      const readBody: AdvancedReadBody = { options: { populateAccess: 'read' } };
      const readFilterBody: AdvancedReadFilterBody = { options: { populateAccess: 'list' } };
      const createBody: AdvancedCreateBody = { data: {}, options: { populateAccess: 'read' } };
      const updateBody: AdvancedUpdateBody = { data: {}, options: { populateAccess: 'list' } };
      const upsertBody: AdvancedUpsertBody = { data: {}, options: { populateAccess: 'read' } };
      const populateAccess: PopulateAccess = 'read';
      // @ts-expect-error route-only variants cannot select populated target policy
      const badPopulateAccess: PopulateAccess = 'advancedRead';
      // @ts-expect-error list wire options must use list/read access
      listBody.options = { populateAccess: 'basicList' };
      // @ts-expect-error identifier read wire options must use list/read access
      readBody.options = { populateAccess: 'advancedRead' };
      // @ts-expect-error filtered read wire options must use list/read access
      readFilterBody.options = { populateAccess: 'basicRead' };
      // @ts-expect-error create wire options must use list/read access
      createBody.options = { populateAccess: 'advancedCreate' };
      // @ts-expect-error update wire options must use list/read access
      updateBody.options = { populateAccess: 'advancedUpdate' };
      // @ts-expect-error upsert wire options must use list/read access
      upsertBody.options = { populateAccess: 'advancedUpsert' };

      // @ts-expect-error misspelled top-level route variants are rejected
      const badTop: OperationAccess = { basicReed: true };
      // @ts-expect-error context values must be Validation
      const badValue: OperationAccess = { read: { basic: 401 } };
      // @ts-expect-error guards must return boolean or Promise<boolean>
      const badGuard: OperationAccess = { read: { advanced: () => 'allowed' } };
      // @ts-expect-error guard arrays contain permission strings, not booleans
      const badArray: OperationAccess = { list: { basic: [true] } };
      // @ts-expect-error data top-level variants are also checked
      const badData: DataRouterOptions<Row> = { operationAccess: { advancedReed: true } };
      // @ts-expect-error transport keys do not grant model field permission
      const badField: ModelRouterOptions<Row> = { permissionSchema: { name: { basicRead: true } } };
      // @ts-expect-error transport keys do not grant data field permission
      const badDataField: DataRouterOptions<Row> = { permissionSchema: { name: { advancedRead: true } } };
      // @ts-expect-error the public field-rule type remains base-scoped
      const badFieldRule: FieldOperationAccess = { basicRead: true };
      // @ts-expect-error contexts are server-owned literal names
      const badMappedKey: OperationAccessContext = 'basicDelete';
      // @ts-expect-error operation members cannot themselves contain rule objects
      const wrongMappedKey: OperationAccessVariants = { advanced: { list: true } };
      // @ts-expect-error known nested sub-rule leaves must remain Validation
      const badSubRule: SubOperationAccess = { read: { basic: 401 } };
      // @ts-expect-error removed keys are not aliases, even with a valid Validation
      const removedRule: OperationAccess = { basicRead: true };
      // @ts-expect-error the flat-name type has been removed from the root
      type RemovedRoot = import('@web-ts-toolkit/access-router').RouteVariantAccess;
      // @ts-expect-error the flat-name type has been removed from advanced
      type RemovedAdvanced = import('@web-ts-toolkit/access-router/advanced').RouteVariantAccess;
      const removedTypes: [RemovedRoot, RemovedAdvanced] = [undefined, undefined];

      // @ts-expect-error router.set rejects misspelled dotted variants
      modelRouter.set('operationAccess.basicReed', true);
      // @ts-expect-error router.setOption rejects wrong variant values
      modelRouter.setOption('operationAccess.read.basic', 401);
      // @ts-expect-error owning-runtime model setters reject misspelled variants
      runtime.setModelOption('Oav01Consumer', 'operationAccess.advancedReed', true);
      // @ts-expect-error named model setters reject wrong variant values
      setModelOption('Oav01Consumer', 'operationAccess.read.advanced', {});
      // @ts-expect-error runtime facade setters reject misspelled variants
      api.setModelOption('Oav01Consumer', 'operationAccess.basicReed', true);
      // @ts-expect-error default setters reject misspelled variants
      setDefaultModelOption('operationAccess.basicReed', true);
      // @ts-expect-error default setter values must remain Validation
      api.setDefaultModelOption('operationAccess.read.basic', 401);
      // @ts-expect-error data router.set rejects misspelled dotted variants
      dataRouter.set('operationAccess.advancedReed', false);
      // @ts-expect-error data router.setOption checks variant values
      dataRouter.setOption('operationAccess.read.basic', {});
      // @ts-expect-error owning-runtime data setters reject misspelled variants
      runtime.setDataOption('Oav01DataConsumer', 'operationAccess.basicReed', true);
      // @ts-expect-error owning-runtime data setters check variant values
      runtime.setDataOption('Oav01DataConsumer', 'operationAccess.read.advanced', 401);

      void [optionalAccess, emptyAccess, umbrellaAccess, fieldSchema, advancedFieldRule,
        advancedAccess, advancedSubs, advancedSubRule, advancedPaired, advancedBase,
        advancedVariant, advancedContext, advancedRule, advancedVariants, advancedCustomGuardAccess,
        listBody, readBody, readFilterBody, createBody, updateBody, upsertBody, populateAccess, badPopulateAccess,
        badTop, badValue, badGuard, badArray, badData, badField, badDataField, badFieldRule,
        badMappedKey, wrongMappedKey, badSubRule, removedRule, removedTypes];
      `,
    );
    writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: extension === 'ts' ? 'ESNext' : 'NodeNext',
          moduleResolution: extension === 'ts' ? 'Bundler' : 'NodeNext',
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noEmit: true,
          skipLibCheck: true,
          types: ['node'],
          lib: ['ES2022', 'DOM'],
        },
        files: [sourceFile],
      }),
    );
    const result = run('node', [path.resolve(consumerDir, ...TSC_PATH), '-p', tsconfigPath], consumerDir);
    expect(result.stdout + result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});
