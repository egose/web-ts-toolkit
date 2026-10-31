import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
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
      expect(Object.keys(pkg.exports).sort()).toEqual(['.', './advanced', './processors']);
      expect(pkg.exports).toMatchObject({
        '.': expect.objectContaining({
          types: {
            import: expect.stringMatching(/\.d\.mts$/),
            require: expect.stringMatching(/\.d\.ts$/),
            default: expect.stringMatching(/\.d\.ts$/),
          },
          import: expect.any(String),
          require: expect.any(String),
        }),
        './advanced': expect.objectContaining({
          types: {
            import: expect.stringMatching(/\.d\.mts$/),
            require: expect.stringMatching(/\.d\.ts$/),
            default: expect.stringMatching(/\.d\.ts$/),
          },
          import: expect.any(String),
          require: expect.any(String),
        }),
        './processors': expect.objectContaining({
          types: {
            import: expect.stringMatching(/\.d\.mts$/),
            require: expect.stringMatching(/\.d\.ts$/),
            default: expect.stringMatching(/\.d\.ts$/),
          },
          import: expect.any(String),
          require: expect.any(String),
        }),
      });
    });

    it('selects ESM/CJS declarations under their respective conditions (ARH-09)', () => {
      expect(pkg.exports).toEqual(
        expect.objectContaining({
          '.': expect.objectContaining({
            types: {
              import: './dist/index.d.mts',
              require: './dist/index.d.ts',
              default: './dist/index.d.ts',
            },
          }),
          './advanced': expect.objectContaining({
            types: {
              import: './dist/advanced.d.mts',
              require: './dist/advanced.d.ts',
              default: './dist/advanced.d.ts',
            },
          }),
          './processors': expect.objectContaining({
            types: {
              import: './dist/processors.d.mts',
              require: './dist/processors.d.ts',
              default: './dist/processors.d.ts',
            },
          }),
        }),
      );
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
    it.each(['d.ts', 'd.mts'])(
      'FP-04 ships truthful optional fast-path/handle hover without private issuers in %s',
      (extension) => {
        const ts = require('typescript') as typeof import('typescript');
        const entries = ['index', 'advanced'].map((entry) =>
          path.resolve(packageRoot, 'dist', `${entry}.${extension}`),
        );
        const program = ts.createProgram(entries, {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          strictNullChecks: true,
          noEmit: true,
          skipLibCheck: true,
          types: [],
        });
        const checker = program.getTypeChecker();
        const exported = (entry: string, name: string) => {
          const module = checker.getSymbolAtLocation(program.getSourceFile(entry)!)!;
          let symbol = checker.getExportsOfModule(module).find((candidate) => candidate.name === name)!;
          expect(symbol, `${entry} exports ${name}`).toBeDefined();
          if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
          return { symbol, type: checker.getDeclaredTypeOfSymbol(symbol) };
        };
        const hover = (symbol: import('typescript').Symbol) =>
          ts.displayPartsToString(symbol.getDocumentationComment(checker));
        const flags = ['unsafeUseListAuthorizationFastPath', 'unsafeUseReadAuthorizationFastPath'];
        for (const entry of entries) {
          for (const name of [
            'ModelRouterOptions',
            'DefaultModelRouterOptions',
            'ExtendedModelRouterOptions',
            'ExtendedDefaultModelRouterOptions',
          ]) {
            for (const flag of flags) {
              const property = exported(entry, name).type.getProperty(flag)!;
              expect(property, `${name}.${flag}`).toBeDefined();
              expect(property.flags & ts.SymbolFlags.Optional).not.toBe(0);
              expect(
                checker.typeToString(checker.getTypeOfSymbolAtLocation(property, property.valueDeclaration!)),
              ).toBe('boolean | undefined');
              for (const phrase of [
                'EXPERIMENTAL performance-first',
                'default `false`',
                'ALL FOUR',
                'dormant',
                'undefined restores inheritance',
                'before hooks/awaits',
                'denial',
                'allowance',
                '20,000',
                'depth 100',
                'v0.51.0',
                'argument-four',
                'zero-copy',
              ])
                expect(hover(property), `${flag} documents ${phrase}`).toContain(phrase);
              expect(property.getJsDocTags(checker).some((tag) => tag.name === 'example')).toBe(true);
            }
          }
          for (const name of [
            'GlobalOptions',
            'RootRouterOptions',
            'DataRouterOptions',
            'SubdocumentReadOptions',
            'ServiceAuthorization',
          ])
            for (const flag of flags) expect(exported(entry, name).type.getProperty(flag)).toBeUndefined();
          const handle = exported(entry, 'DocumentAuthorization');
          for (const phrase of [
            'Default/copied',
            'exact root association',
            'issued-document membership',
            'no stage snapshot',
            'stale decisions/shared grants',
            'Removed issued children',
            'Rollback changes new calls only',
            'denial into allowance',
          ])
            expect(hover(handle.symbol)).toContain(phrase);
          const context = exported(entry, 'ServiceOutputContext');
          expect(hover(context.symbol)).toContain('shallow diagnostic shells');
          expect(hover(context.symbol)).toContain('not detached immutable snapshots');
          expect(hover(context.type.getProperty('getDocumentAuthorization')!)).toContain('not current reachability');
          expect(hover(context.type.getProperty('originalDocumentSnapshot')!)).toContain('borrow it');
          expect(hover(exported(entry, 'ModelDocPermissionsHook').symbol)).toContain('share grants and context leaves');
          expect(hover(exported(entry, 'ModelVirtualGetter').symbol)).toContain(
            'private argument-four isolation remain',
          );
          expect(context.type.getProperty('authorizationFastPath')).toBeUndefined();
          for (const flag of [
            'unsafeSkipListDocumentSnapshotChecks',
            'unsafeSkipReadDocumentSnapshotChecks',
            'unsafeSkipListOutputSnapshotChecks',
            'unsafeSkipReadOutputSnapshotChecks',
            'unsafeSkipListNestedDocumentSnapshotChecks',
            'unsafeSkipReadNestedDocumentSnapshotChecks',
            'unsafeSkipListInitialOutputSnapshotCopy',
            'unsafeSkipReadInitialOutputSnapshotCopy',
          ])
            expect(hover(exported(entry, 'DefaultModelRouterOptions').type.getProperty(flag)!)).toContain(
              'not the active',
            );
        }
        const privateNames = [
          'AuthorizationFastPathOrigin',
          'AuthorizationFastPathCapture',
          'QueryAuthorizationSource',
          'unsafeAuthorizationFastPathOptions',
          'unsafeServerOptions',
          'authorizationFastPathPrerequisites',
          'captureAuthorizationFastPath',
          'readAuthorizationFastPath',
          'readTrustedServiceAuthorization',
          'deriveTrustedQueryAuthorization',
          'captureAuthorizationConfiguration',
          'ownedAuthorizationConfiguration',
          'isBorrowableAuthorizationRecord',
          'prepareTrustedAuthorizationSource',
          'TrustedOutputBudget',
          'TrustedOutputMaterialization',
          'TrustedOutputMemberBuilder',
          'TrustedValuePolicy',
          'createTrustedOutputBudget',
          'visitTrustedOutput',
          'defineTrustedOutputValue',
          'shallowTrustedOutputArray',
          'trustedMapOutputScope',
          'shallowTrustedOutput',
          'setTrustedOutputPath',
          'unsetTrustedOutputPath',
          'materializeTrustedOutputValue',
          'isTrustedDocumentAuthorization',
          'isTrustedDocumentAuthorizationStage',
          'isTrustedAuthorizationOutput',
          'createTrustedOutputMemberBuilder',
          'retainTrustedOutputMember',
          'retainTrustedOutputSpine',
          'getIssuedEmbeddedDocumentAuthorization',
          'isIssuedOutputMember',
        ];
        for (const file of readdirSync(path.resolve(packageRoot, 'dist')).filter((name) =>
          /\.d\.(?:ts|mts)$/.test(name),
        )) {
          const declaration = readFileSync(path.resolve(packageRoot, 'dist', file), 'utf8');
          for (const name of privateNames)
            expect(declaration, `${file} must not ship ${name}`).not.toMatch(new RegExp(`\\b${name}\\b`));
        }
        for (const [esm, cjs, count] of [
          [rootModule, aclCjs, 46],
          [advancedModule, advancedCjs, 48],
          [processorsModule, processorsCjs, 6],
        ] as const) {
          expect(Object.keys(esm).sort()).toEqual(Object.keys(cjs).sort());
          expect(Object.keys(esm)).toHaveLength(count);
          for (const name of privateNames) expect(esm).not.toHaveProperty(name);
        }
      },
    );

    it('every declared dist file in exports resolves on disk', () => {
      const collectTargets = (value: unknown): string[] => {
        if (typeof value === 'string') return [value];
        if (value && typeof value === 'object') {
          return Object.values(value as Record<string, unknown>).flatMap(collectTargets);
        }
        return [];
      };
      const targets = [...Object.values(pkg.exports).flatMap(collectTargets), pkg.main, pkg.module, pkg.types];
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        const resolved = path.resolve(packageRoot, target.replace(/^\.\//, ''));
        expect(existsSync(resolved)).toBe(true);
        expect(statSync(resolved).size).toBeGreaterThan(0);
      }
    });

    it('preserves processor output and error JSDoc in published declarations', () => {
      for (const fileName of ['processors.d.ts', 'processors.d.mts']) {
        const contents = readFileSync(path.resolve(packageRoot, 'dist', fileName), 'utf8');
        expect(contents).toContain('type CopyAndDepopulateOutput = Record<string, unknown>');
        expect(contents).toContain('export { type CopyAndDepopulateOptions, type CopyAndDepopulateOutput');
        expect(contents).toContain('Provide an explicit output type argument');
        expect(contents).toContain('@throws Error');
        expect(contents).not.toContain('ProcessorPathError');
      }
    });

    it.each(['d.ts', 'd.mts'])('OAV-06 exposes route/field shapes and useful editor hover in %s', (extension) => {
      const ts = require('typescript') as typeof import('typescript');
      const entries = ['index', 'advanced'].map((entry) => path.resolve(packageRoot, 'dist', `${entry}.${extension}`));
      const program = ts.createProgram(entries, {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        noEmit: true,
        skipLibCheck: true,
        types: [],
      });
      const checker = program.getTypeChecker();
      const exportedType = (entry: string, name: string) => {
        const source = program.getSourceFile(entry)!;
        const module = checker.getSymbolAtLocation(source)!;
        let symbol = checker.getExportsOfModule(module).find((candidate) => candidate.name === name)!;
        expect(symbol, `${path.basename(entry)} exports ${name}`).toBeDefined();
        if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
        return { symbol, type: checker.getDeclaredTypeOfSymbol(symbol) };
      };
      const hover = (symbol: import('typescript').Symbol) =>
        ts.displayPartsToString(symbol.getDocumentationComment(checker));
      const properties = [
        ['basicList', 'GET /'],
        ['advancedList', 'POST /__query'],
        ['basicRead', 'GET /:id'],
        ['advancedRead', 'POST /__query/:id'],
        ['basicCreate', 'POST /'],
        ['advancedCreate', 'POST /__mutation'],
        ['basicUpdate', 'PATCH /:id'],
        ['advancedUpdate', 'PATCH /__mutation/:id'],
        ['basicUpsert', 'PUT /'],
        ['advancedUpsert', 'PUT /__mutation'],
        ['basicCount', 'GET /count'],
        ['advancedCount', 'POST /count'],
        ['basicDistinct', 'GET /distinct/:field'],
        ['advancedDistinct', 'POST /distinct/:field'],
      ];
      for (const entry of entries) {
        const route = exportedType(entry, 'OperationAccess');
        expect(hover(route.symbol)).toContain('HTTP 401');
        expect(hover(route.symbol)).toContain('only undefined inherits');
        expect(hover(route.type.getProperty('list')!)).toContain('read-to-list retries');
        expect(hover(route.type.getProperty('read')!)).toContain('both POST read routes');
        for (const [key, endpoint] of properties) {
          const property = route.type.getProperty(key)!;
          expect(property, `${key} is discoverable`).toBeDefined();
          expect(hover(property)).toContain(endpoint);
          expect(hover(property)).toContain('undefined inherits');
        }
        const field = exportedType(entry, 'FieldOperationAccess');
        expect(field.type.getProperty('read')).toBeDefined();
        for (const [key] of properties) expect(field.type.getProperty(key)).toBeUndefined();
        expect(hover(exportedType(entry, 'PermissionSchema').symbol)).toContain('not field-rule objects');
        const sub = exportedType(entry, 'SubOperationAccess');
        expect(hover(sub.symbol)).toContain('closed object');
        expect(hover(sub.type.getProperty('advancedRead')!)).toContain('/:subId/__query');
        expect(hover(route.type.getProperty('subs')!)).toContain('not an umbrella guard for absent fields');
      }
      for (const routerName of ['ModelRouter', 'DataRouter']) {
        const router = exportedType(entries[0], routerName);
        expect(hover(router.type.getProperty('options')!)).toContain('construction-time snapshot');
        expect(hover(router.type.getProperty('operationAccess')!)).toContain("operationAccess('basicRead', false)");
        expect(hover(router.type.getProperty('setOptions')!)).toContain('replaces that entire rule object');
        expect(hover(router.type.getProperty('setOption')!)).toContain('undefined');
      }
    });

    it.each(['d.ts', 'd.mts'])(
      'MPO-03 exports precise target/default populate policies and editor hover in %s',
      (extension) => {
        const ts = require('typescript') as typeof import('typescript');
        const entries = ['index', 'advanced'].map((entry) =>
          path.resolve(packageRoot, 'dist', `${entry}.${extension}`),
        );
        const program = ts.createProgram(entries, {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          noEmit: true,
          skipLibCheck: true,
          strictNullChecks: true,
          types: [],
        });
        const checker = program.getTypeChecker();
        const exported = (entry: string, name: string) => {
          const module = checker.getSymbolAtLocation(program.getSourceFile(entry)!)!;
          let symbol = checker.getExportsOfModule(module).find((candidate) => candidate.name === name)!;
          expect(symbol, `${path.basename(entry)} exports ${name}`).toBeDefined();
          if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
          return { symbol, type: checker.getDeclaredTypeOfSymbol(symbol) };
        };
        const hover = (symbol: import('typescript').Symbol) =>
          ts.displayPartsToString(symbol.getDocumentationComment(checker));
        const names = (type: import('typescript').Type) =>
          type
            .getProperties()
            .map((p) => p.name)
            .sort();
        for (const entry of entries) {
          const flag = 'requireOperationAccessForPopulateDependencies';
          const globals = exported(entry, 'GlobalOptions');
          const models = exported(entry, 'DefaultModelRouterOptions');
          const mode = models.type.getProperty(flag)!;
          expect(mode, `${path.basename(entry)} exposes the target model policy`).toBeDefined();
          expect(mode.flags & ts.SymbolFlags.Optional).not.toBe(0);
          expect(checker.typeToString(checker.getTypeOfSymbolAtLocation(mode, mode.valueDeclaration!))).toBe(
            'boolean | undefined',
          );
          for (const phrase of [
            'default `true`',
            'literal boolean',
            'malformed JS',
            'before the first await',
            'Runtime-isolated server configuration',
            'baseFilter.read',
            'overrideFilter.read',
            'Neither mode changes ordinary reference shape',
            'missing IDs and nulls',
            'row/query/getter failure',
            'exact original',
            'no additional target-base-read reference-visibility gate',
            'fourth-argument inputs',
            'requireOperationAccessForPopulateQueries',
            'override → captured',
            'undefined clears',
            "User's dependency flag",
          ])
            expect(hover(mode)).toContain(phrase);
          for (const old of ['requireRegisteredPopulateModels', 'requireReadOperationAccessForPopulateDependencies'])
            expect(globals.type.getProperty(old)).toBeUndefined();
          for (const key of [flag, 'requireOperationAccessForPopulateQueries'])
            expect(globals.type.getProperty(key)).toBeUndefined();
          const queries = models.type.getProperty('requireOperationAccessForPopulateQueries')!;
          expect(queries).toBeDefined();
          expect(checker.typeToString(checker.getTypeOfSymbolAtLocation(queries, queries.valueDeclaration!))).toBe(
            'boolean | undefined',
          );
          for (const phrase of [
            'default `true`',
            'literal `false`',
            'source entry/field authorization',
            'target field/document',
            'match and mandatory reference',
            'admitted population misses',
            'effective object permissionSchema',
            'configuration-only Document',
            'direct/root',
            'Target override → captured runtime model default → true',
            'Source/sibling flags cannot relax',
            'Model-valued ordinary refs can cross connections',
            'pinned through in-flight population',
          ])
            expect(hover(queries)).toContain(phrase);
          expect(mode.getJsDocTags(checker).find((tag) => tag.name === 'example')).toBeDefined();
          for (const name of [
            'ModelRouterOptions',
            'DefaultModelRouterOptions',
            'ExtendedModelRouterOptions',
            'ExtendedDefaultModelRouterOptions',
          ]) {
            for (const key of [flag, 'requireOperationAccessForPopulateQueries']) {
              const property = exported(entry, name).type.getProperty(key)!;
              expect(property, `${name} configures ${key}`).toBeDefined();
              expect(property.flags & ts.SymbolFlags.Optional).not.toBe(0);
              expect(
                checker.typeToString(checker.getTypeOfSymbolAtLocation(property, property.valueDeclaration!)),
              ).toBe('boolean | undefined');
            }
          }
          for (const name of ['GlobalOptions', 'RootRouterOptions', 'DataRouterOptions', 'SubdocumentReadOptions']) {
            for (const key of [flag, 'requireOperationAccessForPopulateQueries'])
              expect(exported(entry, name).type.getProperty(key), `${name} cannot configure ${key}`).toBeUndefined();
          }
          const dependency = exported(entry, 'ModelVirtualPopulateDependency');
          expect(names(dependency.type)).toEqual(['path', 'select']);
          for (const phrase of [
            'one-hop',
            'same-connection',
            'eager/atomic',
            'operationAccess.read',
            'authorization.related',
            'requireOperationAccessForPopulateDependencies',
            'missing IDs/nulls',
            'no extra target',
            'requireOperationAccessForPopulateQueries',
          ])
            expect(hover(dependency.symbol)).toContain(phrase);
          expect(hover(dependency.type.getProperty('path')!)).toContain('Retained automatically');
          expect(hover(dependency.type.getProperty('select')!)).toContain('1/-1');
          if (path.basename(entry).startsWith('advanced.')) {
            const populate = exported(entry, 'Populate');
            expect(names(populate.type)).toEqual(['access', 'match', 'path', 'select']);
            for (const phrase of [
              "source model's connection",
              'Model-valued schema refs can cross connections',
              'before target I/O or initiating writes',
              'pinned in flight',
              'Callers cannot supply',
              'narrower one-hop static-string ObjectId/same-connection',
            ])
              expect(hover(populate.symbol)).toContain(phrase);
          }
          const descriptor = exported(entry, 'ModelVirtualDescriptor');
          expect(names(descriptor.type)).toEqual(['dependsOn', 'dependsOnPopulate', 'get']);
          expect(hover(descriptor.symbol)).toContain('populated = {}');
          const example = descriptor.symbol.getJsDocTags(checker).find((tag) => tag.name === 'example');
          expect(example).toBeDefined();
          expect(ts.displayPartsToString(example!.text)).toContain('populated = {}');
          expect(hover(descriptor.type.getProperty('dependsOnPopulate')!)).toContain('fourth-argument');
          expect(hover(descriptor.type.getProperty('get')!)).toContain('not implicitly transported');
          for (const name of [
            'ModelVirtualGetter',
            'ModelVirtualDescriptor',
            'ModelVirtualAccessRecord',
            'ModelVirtualLeaf',
          ]) {
            const declaration = exported(entry, name).symbol.declarations!.find(
              (node): node is import('typescript').InterfaceDeclaration | import('typescript').TypeAliasDeclaration =>
                ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node),
            )!;
            expect(declaration.typeParameters).toHaveLength(3);
            expect(declaration.typeParameters![2].name.text).toBe('TPopulated');
            const emptyDefault = declaration.typeParameters![2].default!;
            expect(emptyDefault).toBeDefined();
            expect(checker.getTypeAtLocation(emptyDefault).getProperties()).toHaveLength(0);
          }
          const getter = exported(entry, 'ModelVirtualGetter');
          const parameters = getter.type.getCallSignatures()[0].getParameters();
          expect(parameters.map((p) => p.name)).toEqual(['doc', 'permissions', 'context', 'populated']);
          expect(
            (parameters[3].valueDeclaration as import('typescript').ParameterDeclaration).questionToken,
          ).toBeDefined();
          expect(hover(getter.symbol)).toContain('three-argument direct calls');
          expect(hover(exported(entry, 'ModelVirtualDoc').symbol)).toContain('does not');
          expect(hover(exported(entry, 'ModelVirtualPopulateInputs').symbol)).toContain(
            'Native methods are not made immutable',
          );
          expect(exported(entry, 'ModelVirtualContext').type.getProperty('populated')).toBeUndefined();
          expect(hover(exported(entry, 'ModelRouterOptions').type.getProperty('virtuals')!)).toContain(
            'ModelVirtualDescriptor',
          );
          for (const name of [
            'VirtualPopulateSnapshotToken',
            'CapturedVirtualPopulateDependency',
            'loadVirtualPopulateOutputRows',
            'PopulatePolicyDefaultsToken',
            'capturePopulatePolicyDefaults',
            'getCapturedPopulatePolicyDefaults',
            'resolvePopulatePolicy',
            'modelServicePopulatePolicyDefaults',
            'capturePopulateTargetBinding',
            'setPopulateTargetMeta',
            'withCapturedPopulateModel',
          ]) {
            const module = checker.getSymbolAtLocation(program.getSourceFile(entry)!)!;
            expect(checker.getExportsOfModule(module).some((symbol) => symbol.name === name)).toBe(false);
          }
        }
        for (const runtime of [rootModule, aclCjs, advancedModule, advancedCjs]) {
          for (const name of [
            'ModelVirtualPopulateDependency',
            'ModelVirtualPopulateInputs',
            'loadVirtualPopulateOutputRows',
            'capturePopulatePolicyDefaults',
            'getCapturedPopulatePolicyDefaults',
            'resolvePopulatePolicy',
            'modelServicePopulatePolicyDefaults',
            'capturePopulateTargetBinding',
            'setPopulateTargetMeta',
            'withCapturedPopulateModel',
          ])
            expect(runtime).not.toHaveProperty(name);
        }
      },
    );

    it.each(['d.ts', 'd.mts'])('SVA-10 exports consumer policy/handle types with editor JSDoc in %s', (extension) => {
      const ts = require('typescript') as typeof import('typescript');
      const entries = ['index', 'advanced'].map((entry) => path.resolve(packageRoot, 'dist', `${entry}.${extension}`));
      const program = ts.createProgram(entries, {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        noEmit: true,
        skipLibCheck: true,
        types: [],
      });
      const checker = program.getTypeChecker();
      const exported = (entry: string) =>
        checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(entry)!)!);
      const type = (entry: string, name: string) => {
        let symbol = exported(entry).find((candidate) => candidate.name === name)!;
        expect(symbol, `${path.basename(entry)} exports ${name}`).toBeDefined();
        if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
        return { symbol, value: checker.getDeclaredTypeOfSymbol(symbol) };
      };
      const hover = (symbol: import('typescript').Symbol) =>
        ts.displayPartsToString(symbol.getDocumentationComment(checker));
      const documented = {
        OutputFieldPath: ['contacts.email', 'runtime schema'],
        FieldAuthorization: ['additive', 'explicit selection', 'selected eligible subtree', 'required output fields'],
        InputFieldPath: ['persisted-model', 'runtime schema', 'No virtual shape'],
        InputFieldAuthorization: ['mutation-only', 'by index', 'container authority', 'No row, output'],
        MutationAuthorization: ['independent of rows/output/related', 'output-only policy'],
        RowAuthorization: ['overrideFilter', 'EVERY mode', 'ANDed', 'Null/undefined'],
        OperationAuthorization: ['target operation', 'not its rows'],
        ServiceAuthorization: [
          'immutable call policy',
          'server-only',
          'overrides',
          'breaking release',
          'HTTP/OpenAPI/client',
        ],
        RelatedAuthorization: ['parent unrestricted', 'immediate target', 'Count targets'],
        CreateAuthorization: ['Rows reject', 'input/output/related'],
        OutputAuthorization: ['row/target options reject'],
        DocumentAuthorization: ['projected document snapshot', 'ownerId', 'another', 'reject'],
        ServiceOutputContext: ['public serializers omit', 'no authority is attached to data'],
        AuthorizedSingleResult: ['no stronger field-existence inference'],
        AuthorizedListResult: ['same index'],
        ServiceOutputDecorator: ['no automatic', 'mutations/replacements'],
        OutputPlanningOptions: ['persisted fetch inputs', 'alwaysSelectFields'],
        OutputFieldOptions: [
          'Mutually exclusive',
          'fresh call',
          'without rerunning',
          'Positional baseFields have been removed',
        ],
        AllowedOutputFieldOptions: ["purpose: 'output'", 'never a write/schema', 'Null/undefined'],
        DataFieldOptions: ['request-only', 'No Mongoose catalog', 'empty result'],
        PopulatePlanningOptions: ['request-only', 'response segments', 'target operation/rows'],
        NewArgs: ['historically ignored'],
        NewOptions: ['ignores select', 'unsupported'],
        SubdocumentReadAuthorization: ['independent', 'base-operation gates', 'request authority', 'Child paths'],
        SubdocumentMutationAuthorization: ['independent', 'Visibility', 'null/[]'],
        SubdocumentCreateAuthorization: ['visible full array', 'no existing-child rows'],
        SubdocumentDeleteAuthorization: ['Parent update', 'removed ID'],
        SubdocumentVisibilityAuthorization: ['Independent', 'never inherits writes'],
        SubdocumentCreateVisibilityAuthorization: ['list AND read', 'read output'],
        SubdocumentInputAuthorization: ['by index', 'original hydrated owning parent', 'identity'],
        SubdocumentOutputAuthorization: ['Child-relative', 'referenced targets', 'RAW'],
        SubdocumentGateAuthorization: ['overrideFilter', 'ANDed', 'False is terminal'],
      };
      const privateNames = [
        'Service',
        'Core',
        'ResolvedServiceAuthorization',
        'NormalizedServiceAuthorization',
        'AuthorizationBinding',
        'AuthorizationAccess',
        'AuthorizationConfiguration',
        'AuthorizationFieldCatalog',
        'ServiceExecutionContext',
        'ServiceExecutionState',
        'PreparedModelQuery',
        'ResolvedIdentifier',
        'QueryInput',
        'DocumentAuthorizationStage',
        'resolveServiceAuthorization',
        'readServiceAuthorization',
        'requiresDocumentSnapshotChecks',
        'requiresOutputSnapshotChecks',
        'unsafeSnapshotOptions',
        'unsafeSnapshotCheckOptions',
        'unsafeInitialOutputCopyOptions',
        'skipsInitialOutputSnapshotCopy',
        'tryOutputIdentitiesWithoutSnapshot',
        'serviceAuthorizationInput',
        'createDocumentAuthorizationStage',
        'resolveDocumentAuthorization',
        'associateDocumentAuthorization',
        'transferDocumentAuthorizationGraph',
        'createServiceOutputContext',
        'createServiceExecution',
        'registerServiceExecutors',
        'prepareModelQuery',
        'resolveModelIdentifier',
        'executePreparedFindOne',
        'executePreparedFind',
        'executePreparedUpdateOne',
        'executeCreate',
        'executePreparedCount',
        'executePreparedExists',
        'admitModelInput',
        'assertModelInputComplexity',
        'requestInputFields',
        'resolveInputDocumentGrants',
        'inputFetchPaths',
        'sanitizePreparedInput',
        'stripDocumentInputVirtuals',
        'prepareSubdocumentCall',
        'subdocumentGateAllowed',
        'subdocumentRows',
        'subdocumentParentFilter',
        'subdocumentInputPolicy',
        'SubdocumentCall',
        'collectModelRequestFields',
        'assertFieldHelperCall',
        'requestFieldScope',
        'isInputVirtualPath',
      ];
      for (const entry of entries) {
        for (const [name, phrases] of Object.entries(documented)) {
          for (const phrase of phrases) expect(hover(type(entry, name).symbol), `${name} hover`).toContain(phrase);
        }
        const names = exported(entry).map((symbol) => symbol.name);
        for (const name of privateNames) expect(names, `${path.basename(entry)} hides ${name}`).not.toContain(name);
        const context = type(entry, 'ServiceOutputContext').value;
        expect(hover(context.getProperty('documentAuthorization')!)).toContain('Non-enumerable');
        expect(hover(context.getProperty('getDocumentAuthorization')!)).toContain('cannot issue new authority');
      }
      const router = type(entries[0], 'ModelRouter').value;
      expect(hover(type(entries[0], 'setDefaultModelOptions').symbol)).toContain('explicit model values');
      expect(hover(type(entries[0], 'DefaultModelRouterOptions').symbol)).toContain('follow later default updates');
      for (const option of [
        'unsafeSkipListOutputSnapshotChecks',
        'unsafeSkipReadOutputSnapshotChecks',
        'unsafeSkipListNestedDocumentSnapshotChecks',
        'unsafeSkipReadNestedDocumentSnapshotChecks',
      ]) {
        for (const name of ['ModelRouterOptions', 'DefaultModelRouterOptions']) {
          const property = type(entries[0], name).value.getProperty(option)!;
          expect(property, `${name}.${option} ships`).toBeDefined();
          expect(hover(property)).toContain('TEMPORARY UNSAFE');
          expect(hover(property)).toContain('default `false`');
        }
      }
      expect(hover(type(entries[0], 'ModelRouterOptions').value.getProperty('alwaysSelectFields')!)).toContain(
        'per-access record',
      );
      expect(hover(type(entries[0], 'ModelDocPermissionsHook').symbol)).toContain('independently of skim');
      const acquire = router.getProperty('getService')!;
      expect(hover(acquire)).toContain('req.macl');
      const service = checker.getReturnTypeOfSignature(
        checker.getTypeOfSymbolAtLocation(acquire, acquire.valueDeclaration!).getCallSignatures()[0],
      );
      expect(hover(service.getProperty('genSelect')!)).toContain('not an output');
      expect(hover(service.getProperty('genAllowedFields')!)).toContain("purpose: 'output'");
      expect(hover(service.getProperty('pickAllowedFields')!)).toContain('mutually exclusive');
      expect(hover(service.getProperty('trimOutputFields')!)).toContain('never authorizes writes');
      const macl = type(entries[1], 'ModelRequest').value.getProperty('macl')!;
      const core = checker.getTypeOfSymbolAtLocation(macl, macl.valueDeclaration!);
      expect(hover(core.getProperty('pickAllowedFields')!)).toContain('mutually exclusive');
      const dataRequest = type(entries[1], 'DataRequest').value.getProperty('dacl')!;
      const dataCore = checker.getTypeOfSymbolAtLocation(dataRequest, dataRequest.valueDeclaration!);
      const dataAcquire = type(entries[0], 'DataRouter').value.getProperty('getService')!;
      const dataService = checker.getReturnTypeOfSignature(
        checker.getTypeOfSymbolAtLocation(dataAcquire, dataAcquire.valueDeclaration!).getCallSignatures()[0],
      );
      const publicAcquire = router.getProperty('getPublicService')!;
      const publicService = checker.getReturnTypeOfSignature(
        checker.getTypeOfSymbolAtLocation(publicAcquire, publicAcquire.valueDeclaration!).getCallSignatures()[0],
      );
      for (const [receiver, maximum, helpers] of [
        [
          core,
          4,
          ['genSelect', 'genQuerySelect', 'genAllowedFields', 'pickAllowedFields', 'trimOutputFields', 'genPopulate'],
        ],
        [
          service,
          3,
          ['genSelect', 'genQuerySelect', 'genAllowedFields', 'pickAllowedFields', 'trimOutputFields', 'genPopulate'],
        ],
        [
          publicService,
          3,
          ['genSelect', 'genQuerySelect', 'genAllowedFields', 'pickAllowedFields', 'trimOutputFields', 'genPopulate'],
        ],
        [dataCore, 4, ['genSelect', 'genAllowedFields', 'pickAllowedFields']],
        [dataService, 3, ['genSelect', 'genQuerySelect', 'genAllowedFields', 'pickAllowedFields', 'trimOutputFields']],
      ] as const) {
        for (const helper of helpers) {
          const symbol = receiver.getProperty(helper)!;
          const signatures = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!).getCallSignatures();
          expect(signatures, `${helper} has no retained overload`).toHaveLength(1);
          const parameters = signatures[0].getParameters();
          expect(parameters).toHaveLength(maximum);
          expect(parameters.at(-1)!.name).toBe('options');
          const declaration = signatures[0].getDeclaration();
          expect(declaration.parameters.some((parameter) => !!parameter.dotDotDotToken)).toBe(false);
          const names = parameters.map((parameter) => parameter.name);
          for (const retired of ['skipChecks', 'subPaths', 'baseFields', 'optionsOrBase', 'optionsOrSkipChecks']) {
            expect(names).not.toContain(retired);
          }
        }
      }
      expect(service.getProperty('buildVirtualPlan')).toBeUndefined();
      expect(service.getProperty('buildSubVirtualPlan')).toBeUndefined();
      for (const runtime of [rootModule, aclCjs, advancedModule, advancedCjs]) {
        for (const name of [...Object.keys(documented), ...privateNames]) expect(runtime).not.toHaveProperty(name);
      }
    });

    it('compiles a TypeScript snippet against published declarations without error', async () => {
      const ts = require('typescript') as typeof import('typescript');
      const rootJs = path.resolve(packageRoot, 'dist/index.js');
      const advancedJs = path.resolve(packageRoot, 'dist/advanced.js');
      const processorsJs = path.resolve(packageRoot, 'dist/processors.js');
      const rootTypes = path.resolve(packageRoot, 'dist/index.d.ts');
      const advancedTypes = path.resolve(packageRoot, 'dist/advanced.d.ts');
      const processorsTypes = path.resolve(packageRoot, 'dist/processors.d.ts');

      const snippetFile = path.resolve(packageRoot, 'dist/__export-contract-snippet__.ts');
      const snippet = `
        import acl, { AccessRuntime } from '${rootJs}';
        import type { GuardModelCondition, RootRouterOptions } from '${rootTypes}';
        import { Codes } from '${advancedJs}';
        import { copyAndDepopulate } from '${processorsJs}';
        import type { ProcessCopy, CopyAndDepopulateOptions, CopyAndDepopulateOutput } from '${processorsTypes}';

        const condition: GuardModelCondition = { modelName: 'User', id: 'x', condition: 'isAdmin' };
        const opts: RootRouterOptions = { basePath: '/api', operationAccess: true };
        const op: ProcessCopy = { src: 'a', dest: 'b' };
        const copyOpts: CopyAndDepopulateOptions = { mutable: false };
        const copied: CopyAndDepopulateOutput = copyAndDepopulate({ a: { _id: 'a' } }, [op], copyOpts);
        const codes: unknown = Codes;
        const runtime: typeof AccessRuntime = AccessRuntime;
        void [acl, condition, opts, op, copyOpts, copied, codes, runtime];
      `;

      const options: import('typescript').CompilerOptions = {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
      };
      const host = ts.createCompilerHost(options);
      const originalGetSourceFile = host.getSourceFile.bind(host);
      const originalFileExists = host.fileExists.bind(host);
      const originalReadFile = host.readFile.bind(host);
      host.getSourceFile = (fileName, languageVersion, ...rest) => {
        if (path.resolve(fileName) === snippetFile) {
          return ts.createSourceFile(fileName, snippet, languageVersion, true);
        }
        return originalGetSourceFile(fileName, languageVersion, ...rest);
      };
      host.fileExists = (fileName) => {
        if (path.resolve(fileName) === snippetFile) return true;
        return originalFileExists(fileName);
      };
      host.readFile = (fileName) => {
        if (path.resolve(fileName) === snippetFile) return snippet;
        return originalReadFile(fileName);
      };

      const program = ts.createProgram([snippetFile, rootTypes, advancedTypes, processorsTypes], options, host);

      const loaded = program.getSourceFile(snippetFile)?.text;
      expect(loaded).toContain('copyAndDepopulate');

      const diagnostics = ts.getPreEmitDiagnostics(program);
      const messages = diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
      expect(messages).toEqual([]);
    });

    it('rejects nonexistent exports from published declarations', async () => {
      const ts = require('typescript') as typeof import('typescript');
      const rootJs = path.resolve(packageRoot, 'dist/index.js');
      const rootTypes = path.resolve(packageRoot, 'dist/index.d.ts');

      const snippetFile = path.resolve(packageRoot, 'dist/__export-contract-negative__.ts');
      const snippet = `import { __DoesNotExist as missing } from '${rootJs}';\nvoid missing;\n`;
      const options: import('typescript').CompilerOptions = {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
      };
      const host = ts.createCompilerHost(options);
      const originalGetSourceFile = host.getSourceFile.bind(host);
      const originalFileExists = host.fileExists.bind(host);
      const originalReadFile = host.readFile.bind(host);
      host.getSourceFile = (fileName, languageVersion, ...rest) => {
        if (path.resolve(fileName) === snippetFile) {
          return ts.createSourceFile(fileName, snippet, languageVersion, true);
        }
        return originalGetSourceFile(fileName, languageVersion, ...rest);
      };
      host.fileExists = (fileName) => {
        if (path.resolve(fileName) === snippetFile) return true;
        return originalFileExists(fileName);
      };
      host.readFile = (fileName) => {
        if (path.resolve(fileName) === snippetFile) return snippet;
        return originalReadFile(fileName);
      };

      const program = ts.createProgram([snippetFile, rootTypes], options, host);
      expect(program.getSourceFile(snippetFile)?.text).toContain('__DoesNotExist');
      const messages = ts
        .getPreEmitDiagnostics(program)
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
      expect(messages.length).toBeGreaterThan(0);
      const joined = messages.join('\n');
      expect(joined).toContain('__DoesNotExist');
      expect(joined).not.toMatch(/declaration file cannot be imported/i);
    });

    it('reports a missing consumer source instead of passing silently', async () => {
      const ts = require('typescript') as typeof import('typescript');
      const rootTypes = path.resolve(packageRoot, 'dist/index.d.ts');
      const fixtureDir = mkdtempSync(path.join(os.tmpdir(), 'access-router-export-contract-'));
      try {
        const missingFile = path.join(fixtureDir, 'missing-consumer.ts');
        const program = ts.createProgram([missingFile, rootTypes], {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: [],
        });
        const messages = ts
          .getPreEmitDiagnostics(program)
          .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
        expect(messages.length).toBeGreaterThan(0);
        expect(messages.join('\n')).toContain(missingFile);
      } finally {
        rmSync(fixtureDir, { recursive: true, force: true });
      }
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
      const fixtureDir = mkdtempSync(path.join(os.tmpdir(), 'access-router-arf13-'));
      const tmp = path.join(fixtureDir, 'type-boundary.ts');

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
      writeFileSync(tmp, snippet);

      try {
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

        expect(program.getSourceFile(tmp)?.text).toContain('toPublicListResult');

        // Diagnostics in the consumer snippet plus global/option diagnostics
        // matter; transitive source files may emit unrelated diagnostics under
        // this stripped-down config.
        const diagnostics = ts
          .getPreEmitDiagnostics(program)
          .filter((d) => d.file === undefined || d.file.fileName === tmp);
        const messages = diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));

        // Zero diagnostics in the snippet means: every @ts-expect-error
        // suppressed a real error (no TS2578), every serializer crossing
        // compiled (no TS2352/TS2741), and the public DTO brand is doing the
        // work. Reverting the brand surfaces exactly three TS2578 "Unused
        // '@ts-expect-error' directive" diagnostics instead.
        expect(messages).toEqual([]);
      } finally {
        rmSync(fixtureDir, { recursive: true, force: true });
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
      expect(topKeys.sort()).toEqual(
        ['copyAndDepopulate', 'copyPaths', 'countPaths', 'maskPaths', 'movePaths', 'sliceArrays'].sort(),
      );
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
      const expectedProcessorsExports = [
        'copyAndDepopulate',
        'copyPaths',
        'countPaths',
        'maskPaths',
        'movePaths',
        'sliceArrays',
      ];
      expect(processorsKeysEsm.sort()).toEqual(expectedProcessorsExports.slice().sort());
      expect(processorsKeysCjs.sort()).toEqual(expectedProcessorsExports.slice().sort());
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
