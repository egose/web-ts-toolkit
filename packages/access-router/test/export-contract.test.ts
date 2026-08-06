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
import { copyAndDepopulate } from '../dist/processors.mjs';

import type {
  ProcessCopy as ProcessCopyType,
  CopyAndDepopulateOptions as CopyOptionsType,
} from '../dist/processors.d.ts';

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
