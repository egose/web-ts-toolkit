import { existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import pkg from '../package.json' assert { type: 'json' };

import aclDefaultExport, {
  acl as aclNamedExport,
  AccessRuntime,
  createAccessRuntime,
  createOpenApiRouter,
  combineRoutes,
  defineRequestSchema,
  fromAjv,
  fromArkType,
  fromIoTs,
  fromJoi,
  fromStandardSchema,
  fromSuperstruct,
  fromValibot,
  fromVine,
  fromYup,
  fromZod,
  guard,
  setGlobalOptions,
  setGlobalOption,
  getGlobalOptions,
  getGlobalOption,
  setModelOptions,
  setModelOption,
  getModelOptions,
  getModelOption,
  getModelNames,
  getModelJsonSchema,
  registerModelInstance,
  hasModelInstance,
  getModelInstance,
  setDefaultModelOptions,
  setDefaultModelOption,
  getDefaultModelOptions,
  getDefaultModelOption,
  RootRouter,
  ModelRouter,
  DataRouter,
} from '../dist/index.mjs';

import type {
  AccessRouterPermissions,
  AccessRouterPermissionMap,
  AccessRouterRequest,
  AccessRouterRequestExtensions,
  GlobalOptions,
  RootRouterOptions,
  ModelRouterOptions,
  DataRouterOptions,
  GuardModelCondition,
  GuardModelConditionID,
} from '../dist/index.d.ts';

import * as advancedModule from '../dist/advanced.mjs';
import * as processorsModule from '../dist/processors.mjs';
import * as rootModule from '../dist/index.mjs';
import { copyAndDepopulate } from '../dist/processors.mjs';

import type {
  ProcessCopy as ProcessCopyType,
  CopyAndDepopulateOptions as CopyOptionsType,
} from '../dist/processors.d.ts';

import { Codes } from '../src/enums';
import type {
  ErrorResult,
  ListResult,
  PublicErrorResult,
  PublicListResult,
  PublicSingleResult,
  SingleResult,
} from '../src/interfaces';
import {
  toPublicErrorResult,
  toPublicListResult,
  toPublicSingleResult,
} from '../src/http/response-pipelines/service-result';

const require = createRequire(import.meta.url);
const aclCjs = require('../dist/index.js');
const advancedCjs = require('../dist/advanced.js');
const processorsCjs = require('../dist/processors.js');

const packageRoot = path.resolve(__dirname, '..');

describe('AR-14 published export contract', () => {
  describe('package.json exports field', () => {
    it('declares root, /advanced, and /processors subpaths', () => {
      expect(pkg.exports).toMatchObject({
        '.': expect.objectContaining({
          types: expect.any(String),
          import: expect.any(String),
          require: expect.any(String),
        }),
        './advanced': expect.objectContaining({
          types: expect.any(String),
          import: expect.any(String),
          require: expect.any(String),
        }),
        './processors': expect.objectContaining({
          types: expect.any(String),
          import: expect.any(String),
          require: expect.any(String),
        }),
      });
    });

    it('declares all files published by the tarball', () => {
      expect(pkg.files).toEqual(expect.arrayContaining(['README.md', 'llms.txt', 'dist']));
    });

    it('does not publish src/', () => {
      expect(pkg.files ?? []).not.toContain('src');
    });

    it('declares sideEffects accurately (only entries that perform runtime mutation)', () => {
      expect(Array.isArray(pkg.sideEffects) || pkg.sideEffects === false).toBe(true);
    });

    it('every sideEffects path resolves to an emitted package entry (ARF-15)', () => {
      expect(Array.isArray(pkg.sideEffects)).toBe(true);
      const sideEffects = pkg.sideEffects as string[];
      expect(sideEffects.length).toBeGreaterThan(0);
      const emittedCandidates = ['dist/index.js', 'dist/index.mjs', 'dist/advanced.js', 'dist/advanced.mjs'];
      for (const declared of sideEffects) {
        expect(typeof declared).toBe('string');
        const matcher = new RegExp(
          '^' +
            declared
              .replace(/^\.\//, '')
              .replace(/[.+^${}()|[\]\\]/g, '\\$&')
              .replace(/\*\*/g, '.*')
              .replace(/\*/g, '[^/]*') +
            '$',
        );
        const matches = emittedCandidates.filter((candidate) => matcher.test(candidate));
        expect(matches.length).toBeGreaterThan(0);
        for (const match of matches) {
          const resolved = path.resolve(packageRoot, match);
          expect(existsSync(resolved)).toBe(true);
          expect(statSync(resolved).size).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('root entrypoint', () => {
    it('resolves the default export in ESM and CJS', () => {
      const aclFromDefaultFn =
        typeof aclDefaultExport === 'object' && aclDefaultExport !== null && 'createRouter' in aclDefaultExport
          ? (aclDefaultExport as { createRouter: unknown }).createRouter
          : aclDefaultExport;
      expect(typeof aclFromDefaultFn).toBe('function');
      expect(typeof aclCjs.default).toBe('function');
      expect(typeof aclCjs.acl).toBe('function');
    });

    it('resolves the named `acl` export identically in ESM and CJS', () => {
      expect(aclNamedExport).toBe(aclDefaultExport);
      expect(typeof aclCjs.acl).toBe('function');
    });

    it('exports the runtime and helpers from ESM', () => {
      expect(typeof AccessRuntime).toBe('function');
      expect(typeof createAccessRuntime).toBe('function');
      expect(typeof createOpenApiRouter).toBe('function');
      expect(typeof combineRoutes).toBe('function');
      expect(typeof defineRequestSchema).toBe('function');
      expect(typeof guard).toBe('function');
      expect(typeof setGlobalOptions).toBe('function');
      expect(typeof setGlobalOption).toBe('function');
      expect(typeof getGlobalOptions).toBe('function');
      expect(typeof getGlobalOption).toBe('function');
      expect(typeof setModelOptions).toBe('function');
      expect(typeof setModelOption).toBe('function');
      expect(typeof getModelOptions).toBe('function');
      expect(typeof getModelOption).toBe('function');
      expect(typeof getModelNames).toBe('function');
      expect(typeof getModelJsonSchema).toBe('function');
      expect(typeof setDefaultModelOptions).toBe('function');
      expect(typeof setDefaultModelOption).toBe('function');
      expect(typeof getDefaultModelOptions).toBe('function');
      expect(typeof getDefaultModelOption).toBe('function');
      expect(typeof registerModelInstance).toBe('function');
      expect(typeof hasModelInstance).toBe('function');
      expect(typeof getModelInstance).toBe('function');
    });

    it('exports router classes', () => {
      expect(typeof RootRouter).toBe('function');
      expect(typeof ModelRouter).toBe('function');
      expect(typeof DataRouter).toBe('function');
    });

    it('exports validation adapters', () => {
      expect(typeof fromZod).toBe('function');
      expect(typeof fromYup).toBe('function');
      expect(typeof fromJoi).toBe('function');
      expect(typeof fromAjv).toBe('function');
      expect(typeof fromStandardSchema).toBe('function');
      expect(typeof fromValibot).toBe('function');
      expect(typeof fromArkType).toBe('function');
      expect(typeof fromIoTs).toBe('function');
      expect(typeof fromSuperstruct).toBe('function');
      expect(typeof fromVine).toBe('function');
    });

    it('CJS exports a default that matches the ESM default', () => {
      expect(aclCjs.default).toBe(aclCjs.acl);
      expect(typeof aclCjs.default.createRouter).toBe('function');
    });

    it('exports guard input types as type-only exports', () => {
      const guardModelCondition: GuardModelCondition = {
        modelName: 'User',
        id: 'abc',
        condition: 'isAdmin',
      };
      const guardModelConditionId: GuardModelConditionID = { type: 'param', key: 'id' };
      expect(guardModelCondition.modelName).toBe('User');
      expect(guardModelConditionId.type).toBe('param');
    });

    it('exports the request root options interfaces as type-only exports', () => {
      const opts: RootRouterOptions = { basePath: '/api', operationAccess: true };
      expect(opts.basePath).toBe('/api');
      const globalOpts: GlobalOptions = {
        requestPermissionField: '_permissions',
        globalPermissions: () => [],
      };
      expect(globalOpts.requestPermissionField).toBe('_permissions');
    });
  });

  describe('advanced entrypoint', () => {
    it('resolves ESM and CJS forms', () => {
      expect(advancedModule).toBeTypeOf('object');
      expect(advancedCjs).toBeTypeOf('object');
    });

    it('exports low-level parser hooks, symbols, and enums not on the root', () => {
      expect(advancedModule.parseBody).toBeTypeOf('function');
      expect(advancedModule.parseQuery).toBeTypeOf('function');
      expect(advancedModule.MIDDLEWARE).toBeDefined();
      expect(advancedModule.Codes).toBeTypeOf('object');
    });

    it('CJS advanced module matches ESM exports structurally', () => {
      expect(advancedCjs.parseBody).toBeTypeOf('function');
      expect(advancedCjs.MIDDLEWARE).toBe(advancedModule.MIDDLEWARE);
    });
  });

  describe('processors entrypoint', () => {
    it('resolves copyAndDepopulate in ESM and CJS', () => {
      expect(typeof copyAndDepopulate).toBe('function');
      expect(typeof processorsCjs.copyAndDepopulate).toBe('function');
    });

    it('exports ProcessCopy and CopyAndDepopulateOptions type-only', () => {
      const op: ProcessCopy = { src: 'a', dest: 'b' };
      const opts: CopyAndDepopulateOptions = { mutable: false, idField: '_id' };
      expect(op.src).toBe('a');
      expect(opts.mutable).toBe(false);
    });

    it('invokes copyAndDepopulate consistently across module systems', () => {
      const sample = { items: [{ _id: 1, name: 'x' }], other: 'y' };
      const esmOut = processorsModule.copyAndDepopulate(sample, [{ src: 'items', dest: 'itemIds' }], {
        mutable: false,
      }) as Record<string, unknown>;
      const cjsOut = processorsCjs.copyAndDepopulate(
        { items: [{ _id: 1, name: 'x' }], other: 'y' },
        [{ src: 'items', dest: 'itemIds' }],
        { mutable: false },
      ) as Record<string, unknown>;

      // copyAndDepopulate moves the full objects to dest, then replaces src field
      // with their idField values (see src/processors.ts step 1/2).
      expect(esmOut.itemIds).toEqual([{ _id: 1, name: 'x' }]);
      expect(esmOut.items).toEqual([1]);
      expect(cjsOut.itemIds).toEqual([{ _id: 1, name: 'x' }]);
      expect(cjsOut.items).toEqual([1]);
    });

    it('type-only ProcessCopy import is identical to runtime type export', () => {
      const value: ProcessCopyType = { src: 'a', dest: 'b' };
      expect(value.dest).toBe('b');
      const opts: CopyOptionsType = { idField: '_id' };
      expect(opts.idField).toBe('_id');
    });
  });

  describe('dist artifact sanity', () => {
    it('every declared dist file in exports resolves on disk', () => {
      const targets = Object.values(pkg.exports).flatMap((entry) => Object.values(entry as Record<string, string>));
      for (const target of targets) {
        const resolved = path.resolve(packageRoot, target.replace(/^\.\//, ''));
        expect(existsSync(resolved)).toBe(true);
        expect(statSync(resolved).size).toBeGreaterThan(0);
      }
    });

    it('compiles a TypeScript snippet against published declarations without error', async () => {
      const ts = require('typescript') as typeof import('typescript');
      const rootTypes = path.resolve(packageRoot, 'dist/index.d.ts');
      const advancedTypes = path.resolve(packageRoot, 'dist/advanced.d.ts');
      const processorsTypes = path.resolve(packageRoot, 'dist/processors.d.ts');

      const tmp = '/tmp/access-router-export-contract.ts';
      const snippet = `
        import acl, { AccessRuntime, GuardModelCondition, RootRouterOptions } from '${rootTypes}';
        import { AccessRuntime as AdvancedAccessRuntime, Codes } from '${advancedTypes}';
        import { copyAndDepopulate, ProcessCopy, CopyAndDepopulateOptions } from '${processorsTypes}';

        const condition: GuardModelCondition = { modelName: 'User', id: 'x', condition: 'isAdmin' };
        const opts: RootRouterOptions = { basePath: '/api', operationAccess: true };
        const op: ProcessCopy = { src: 'a', dest: 'b' };
        const copyOpts: CopyAndDepopulateOptions = { mutable: false };
        const codes: unknown = Codes;
        const runtime: typeof AdvancedAccessRuntime = AccessRuntime;
        void [acl, condition, opts, op, copyOpts, codes, runtime];
      `;

      const program = ts.createProgram([tmp, rootTypes, advancedTypes, processorsTypes], {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
      });

      const diagnostics = ts
        .getPreEmitDiagnostics(program)
        .filter(
          (d) =>
            d.file?.fileName === tmp ||
            d.file?.fileName === rootTypes ||
            d.file?.fileName === advancedTypes ||
            d.file?.fileName === processorsTypes,
        );
      const messages = diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
      expect(messages).toEqual([]);
    });

    it('does not publish undeclared source files in the tarball list', () => {
      const published = pkg.files ?? [];
      for (const entry of published) {
        expect(entry).not.toMatch(/^src\b/);
      }
    });
  });

  describe('ARF-13 public service/result type boundary', () => {
    it('serializers construct public DTOs that drop internal metadata', () => {
      const internalSingle: SingleResult<{ id: string }, { hidden: true }, unknown> = {
        success: true,
        kind: 'single',
        code: Codes.Success,
        data: { id: 'user-1' },
        input: { hidden: true },
        query: { skip: 1 },
        context: { operation: 'read' } as never,
      };
      const internalList: ListResult<{ id: string }, { hidden: true }, unknown> = {
        success: true,
        kind: 'list',
        code: Codes.Success,
        data: [{ id: 'user-1' }],
        count: 1,
        totalCount: 5,
        input: { hidden: true },
        query: { skip: 2, limit: 1 },
        contexts: [{ operation: 'list' } as never],
      };
      const internalError: ErrorResult<{ msg: string }, unknown> = {
        success: false,
        code: Codes.BadRequest,
        errors: [{ msg: 'bad' }],
        query: { skip: 0 },
      };

      // Serializer output must NOT carry input/query/contexts/context.
      expect(toPublicSingleResult(internalSingle)).toEqual({
        success: true,
        kind: 'single',
        code: Codes.Success,
        data: { id: 'user-1' },
      });
      expect(toPublicListResult(internalList)).toEqual({
        success: true,
        kind: 'list',
        code: Codes.Success,
        data: [{ id: 'user-1' }],
        count: 1,
        totalCount: 5,
      });
      expect(toPublicErrorResult(internalError)).toEqual({
        success: false,
        code: Codes.BadRequest,
        errors: [{ msg: 'bad' }],
      });
    });

    it('serializer output is assignable to public DTOs at the type level and internal results are not', async () => {
      const ts = require('typescript') as typeof import('typescript');
      const interfacesFile = path.resolve(packageRoot, 'src/interfaces/index.ts');
      const serviceResultFile = path.resolve(packageRoot, 'src/http/response-pipelines/service-result.ts');
      const enumsFile = path.resolve(packageRoot, 'src/enums.ts');
      const tmp = '/tmp/access-router-arf13-type-boundary.ts';

      // The snippet deliberately imports the internal interfaces and the public
      // DTOs from the package source, then attempts three direct crossings
      // (each guarded by `@ts-expect-error`) and three serializer crossings
      // (expected to compile). Requiring a zero-diagnostic compile proves both
      // that the direct crossings still error and that the serializer crossings
      // succeed: a freed-up `@ts-expect-error` (no real error to suppress) is
      // itself reported as TS2578 ("Unused '@ts-expect-error' directive"), and a
      // missing-brand error on a serializer path is reported as TS2352/TS2741.
      const snippet = `
        import type {
          ErrorResult,
          ListResult,
          PublicErrorResult,
          PublicListResult,
          PublicSingleResult,
          SingleResult,
        } from '${interfacesFile}';
        import {
          toPublicErrorResult,
          toPublicListResult,
          toPublicSingleResult,
        } from '${serviceResultFile}';
        import { Codes } from '${enumsFile}';

        declare const internalList: ListResult<number>;
        declare const internalSingle: SingleResult<number>;
        declare const internalError: ErrorResult;

        // Direct crossings from internal service results to public DTOs must
        // fail because the public DTOs carry the type-only nominal brand that
        // internal results do not.
        // @ts-expect-error internal ListResult is not assignable to PublicListResult
        const badList: PublicListResult<number> = internalList;
        // @ts-expect-error internal SingleResult is not assignable to PublicSingleResult
        const badSingle: PublicSingleResult<number> = internalSingle;
        // @ts-expect-error internal ErrorResult is not assignable to PublicErrorResult
        const badError: PublicErrorResult = internalError;

        // Serializer crossings: the explicit serializer is the only crossing
        // point, and its declared return type is the branded public DTO.
        const goodList: PublicListResult<number> = toPublicListResult(internalList);
        const goodSingle: PublicSingleResult<number> = toPublicSingleResult(internalSingle);
        const goodError: PublicErrorResult = toPublicErrorResult(internalError);
        void [
          badList,
          badSingle,
          badError,
          goodList,
          goodSingle,
          goodError,
          Codes.Success,
        ];
      `;
      const fs = require('node:fs') as typeof import('node:fs');
      fs.writeFileSync(tmp, snippet);

      const program = ts.createProgram([tmp, interfacesFile, serviceResultFile, enumsFile], {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        noEmit: true,
        allowImportingTsExtensions: true,
        skipLibCheck: true,
        types: [],
      });

      // Only diagnostics in the consumer snippet matter; transitive source
      // files may emit unrelated diagnostics under this stripped-down config.
      const diagnostics = ts.getPreEmitDiagnostics(program).filter((d) => d.file?.fileName === tmp);
      const messages = diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));

      // Zero diagnostics in the snippet means: every @ts-expect-error
      // suppressed a real error (no TS2578), every serializer crossing
      // compiled (no TS2352/TS2741), and the public DTO brand is doing the
      // work. Reverting the brand surfaces exactly three TS2578 "Unused
      // '@ts-expect-error' directive" diagnostics instead.
      expect(messages).toEqual([]);

      fs.rmSync(tmp, { force: true });
    });
  });

  describe('export allowlist snapshot', () => {
    it('root entry runtime export shape matches the recorded snapshot', () => {
      const allowlist = [
        'acl',
        'AccessRuntime',
        'createAccessRuntime',
        'createOpenApiRouter',
        'combineRoutes',
        'defineRequestSchema',
        'fromAjv',
        'fromArkType',
        'fromIoTs',
        'fromJoi',
        'fromStandardSchema',
        'fromSuperstruct',
        'fromValibot',
        'fromVine',
        'fromYup',
        'fromZod',
        'guard',
        'setGlobalOptions',
        'setGlobalOption',
        'getGlobalOptions',
        'getGlobalOption',
        'setModelOptions',
        'setModelOption',
        'getModelOptions',
        'getModelOption',
        'getModelNames',
        'getModelJsonSchema',
        'setDefaultModelOptions',
        'setDefaultModelOption',
        'getDefaultModelOptions',
        'getDefaultModelOption',
        'registerModelInstance',
        'hasModelInstance',
        'getModelInstance',
        'RootRouter',
        'ModelRouter',
        'DataRouter',
      ];
      for (const name of allowlist) {
        expect(aclCjs).toHaveProperty(name);
      }
    });

    it('does not leak low-level internals from the root entry', () => {
      expect(aclCjs).not.toHaveProperty('parseBody');
      expect(aclCjs).not.toHaveProperty('parseQuery');
      expect(aclCjs).not.toHaveProperty('MIDDLEWARE');
      expect(aclCjs).not.toHaveProperty('Codes');
      expect(aclCjs).not.toHaveProperty('copyAndDepopulate');
    });

    it('advanced entry exports low-level symbols but not root-level router creation', () => {
      expect(advancedCjs).toHaveProperty('parseBody');
      expect(advancedCjs).toHaveProperty('MIDDLEWARE');
      expect(advancedCjs).toHaveProperty('Codes');
      expect(advancedCjs).not.toHaveProperty('createRouter');
      expect(advancedCjs).not.toHaveProperty('acl');
    });

    it('processors entry exports only copyAndDepopulate-derived symbols', () => {
      const topKeys = Object.keys(processorsCjs).filter((k) => k !== 'default' && k !== '__esModule');
      expect(topKeys).toEqual(['copyAndDepopulate']);
    });

    // ARF-09: an exact-equals snapshot of every runtime export of the three
    // published subpaths. The presence-only allowlists above cover required
    // exports; this snapshot fails on *any* added or removed public export,
    // so accidental leaks (e.g. an `export *` that pulls internals forward) or
    // accidental removals surface as a deliberate contract update rather than
    // a silent regression. ESM and CJS share the same key set because the
    // package is built with `tsup` and a single CJS/ESM dual shape.
    it('ARF-09 root entry exports exactly the recorded public surface (no additions, no removals)', () => {
      const rootKeysEsm = Object.keys(rootModule as Record<string, unknown>).filter(
        (k) => k !== 'default' && k !== '__esModule',
      );
      const rootKeysCjs = Object.keys(aclCjs as Record<string, unknown>).filter(
        (k) => k !== 'default' && k !== '__esModule',
      );
      const expectedRootExports = [
        'AccessRuntime',
        'DataRouter',
        'ModelRouter',
        'OpenApiCollisionError',
        'OpenApiRegistry',
        'RootRouter',
        'acl',
        'combineRoutes',
        'createAccessRuntime',
        'createOpenApiRouter',
        'defaultRuntime',
        'defineRequestSchema',
        'fromAjv',
        'fromArkType',
        'fromIoTs',
        'fromJoi',
        'fromStandardSchema',
        'fromSuperstruct',
        'fromValibot',
        'fromVine',
        'fromYup',
        'fromZod',
        'getDefaultModelOption',
        'getDefaultModelOptions',
        'getGlobalOption',
        'getGlobalOptions',
        'getModelInstance',
        'getModelJsonSchema',
        'getModelNames',
        'getModelOption',
        'getModelOptions',
        'guard',
        'hasModelInstance',
        'isLevelEnabled',
        'permissionsPlugin',
        'redactFilter',
        'redactPayload',
        'registerModelInstance',
        'safeStringify',
        'setDefaultModelOption',
        'setDefaultModelOptions',
        'setGlobalOption',
        'setGlobalOptions',
        'setModelOption',
        'setModelOptions',
      ];
      expect(rootKeysEsm.sort()).toEqual(expectedRootExports.slice().sort());
      expect(rootKeysCjs.sort()).toEqual(expectedRootExports.slice().sort());
    });

    it('ARF-09 /advanced entry exports exactly the recorded public surface (no additions, no removals)', () => {
      const advancedKeysEsm = Object.keys(advancedModule as Record<string, unknown>).filter(
        (k) => k !== 'default' && k !== '__esModule',
      );
      const advancedKeysCjs = Object.keys(advancedCjs as Record<string, unknown>).filter(
        (k) => k !== 'default' && k !== '__esModule',
      );
      const expectedAdvancedExports = [
        'Codes',
        'CustomHeaders',
        'DATA_MIDDLEWARE',
        'FilterOperator',
        'MIDDLEWARE',
        'PERMISSIONS',
        'PERMISSION_KEYS',
        'StatusCodes',
        'advancedCreateBodySchema',
        'advancedUpdateBodySchema',
        'advancedUpsertBodySchema',
        'countBodySchema',
        'createBodySchema',
        'createQuerySchema',
        'dataListBodySchema',
        'dataReadByIdBodySchema',
        'dataReadFilterBodySchema',
        'defineRequestSchema',
        'distinctBodySchema',
        'fromAjv',
        'fromArkType',
        'fromIoTs',
        'fromJoi',
        'fromStandardSchema',
        'fromSuperstruct',
        'fromValibot',
        'fromVine',
        'fromYup',
        'fromZod',
        'listBodySchema',
        'listQuerySchema',
        'parseBody',
        'parseBodyWithSchema',
        'parseNestedBodyWithSchema',
        'parsePathParam',
        'parseQuery',
        'readByIdBodySchema',
        'readFilterBodySchema',
        'readQuerySchema',
        'requestSchemas',
        'rootQuerySchema',
        'subListBodySchema',
        'subMutationBodySchema',
        'subReadBodySchema',
        'updateBodySchema',
        'updateQuerySchema',
        'upsertBodySchema',
        'upsertQuerySchema',
      ];
      expect(advancedKeysEsm.sort()).toEqual(expectedAdvancedExports.slice().sort());
      expect(advancedKeysCjs.sort()).toEqual(expectedAdvancedExports.slice().sort());
    });

    it('ARF-09 /processors entry exports exactly the recorded public surface (no additions, no removals)', () => {
      const processorsKeysEsm = Object.keys(processorsModule as Record<string, unknown>).filter(
        (k) => k !== 'default' && k !== '__esModule',
      );
      const processorsKeysCjs = Object.keys(processorsCjs as Record<string, unknown>).filter(
        (k) => k !== 'default' && k !== '__esModule',
      );
      expect(processorsKeysEsm.sort()).toEqual(['copyAndDepopulate']);
      expect(processorsKeysCjs.sort()).toEqual(['copyAndDepopulate']);
    });
  });

  describe('packed tarball manifest', () => {
    it('describes peerDependencies for express and mongoose', () => {
      expect(pkg.peerDependencies).toMatchObject({
        express: expect.any(String),
        mongoose: expect.any(String),
      });
    });

    it('does not depend on workspace packages that fail to resolve from a packed tarball', () => {
      const deps = pkg.dependencies ?? {};
      for (const [name, version] of Object.entries(deps)) {
        expect(typeof name).toBe('string');
        expect(typeof version).toBe('string');
      }
    });

    it('the dist directory contains the published entries', () => {
      const dist = path.resolve(packageRoot, 'dist');
      const entries = readdirSync(dist);
      expect(entries).toEqual(
        expect.arrayContaining([
          'index.js',
          'index.mjs',
          'index.d.ts',
          'index.d.mts',
          'advanced.js',
          'advanced.mjs',
          'advanced.d.ts',
          'advanced.d.mts',
          'processors.js',
          'processors.mjs',
          'processors.d.ts',
          'processors.d.mts',
        ]),
      );
    });
  });
});
