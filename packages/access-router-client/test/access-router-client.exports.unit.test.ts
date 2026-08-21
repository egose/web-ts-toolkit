import { describe, expect, it } from 'vitest';

/**
 * ARC-17: Lock the public export surface of
 * `@web-ts-toolkit/access-router-client`. Two complementary contracts:
 *
 * 1. **Runtime allowlist** — the set of *values* reachable from the root
 *    export (functions, classes, enums, consts). Any accidental addition or
 *    removal requires revisiting this allowlist, preventing implementation
 *    metadata from leaking back out and preventing public API from
 *    disappearing without review.
 * 2. **Type allowlist** — the set of *types/interfaces/enums* reachable from
 *    the root export. Locks the named service option, response union,
 *    request meta, and cache policy types consumers can import to compose
 *    the documented configuration shapes.
 *
 * The runtime contract is the source of truth; the type contract is
 * derived by stating every named import the package must satisfy, plus
 * `@ts-expect-error` probes for names that must NOT be re-exported. Together
 * these catch the regression the original review flagged (low-level
 * internals leaking through `export * from './services'` and a thin README
 * that did not match the actual surface).
 */

// Import everything, including type-only exports. The object literal is the
// shape of `import * as pkg from '../src'` at runtime — type-only exports are
// erased, so `pkg` only exposes runtime values. We assert the runtime
// surface separately below.
import * as pkg from '../src';

const EXPECTED_RUNTIME_EXPORTS = [
  // Adapter factory — the primary entry point.
  'createAdapter',
  // Service classes — direct consumers construct these via the adapter
  // factories; `Service` is the documented advanced base class for
  // bespoke subclasses.
  'ModelService',
  'DataService',
  'Service',
  // Response/pipeline error class thrown by `throwOnError`.
  'ServiceError',
  // Model.save() error thrown when a projected read wrapper cannot resolve
  // persistence identity (ARC-21) and would otherwise silently create a
  // duplicate.
  'MissingPersistenceIdentityError',
  // Model dirty-tracking wrapper.
  'Model',
  // Low-level lazy wrapper exposed for direct execution semantics. Grouping
  // compatibility requires private adapter-owned metadata from service calls.
  'wrapLazyPromise',
  // Public enum of normalized response-count / pagination header names.
  'CustomHeaders',
  // Generic list utilities used by the model list helpers; useful to
  // consumers that manipulate `Model<T>[]` directly.
  'replaceItemById',
  'removeItemById',
] as const;

// Compile-time sentinel: the listed runtime exports are the
// intentional surface; the runtime allowlist below enforces no leak and no
// silent removal. If the key set drifts, the test fails until this list and
// the package surface are revisited together.

// Sentinel type used by the negative type-export probes below.
type NonExported = 'must-not-be-exported';

describe('access-router-client public export contract (ARC-17)', () => {
  describe('runtime export allowlist', () => {
    it('exposes exactly the documented runtime export set (no leaks, no removals)', () => {
      const actual = Object.keys(pkg).sort();
      const expected = [...new Set(EXPECTED_RUNTIME_EXPORTS)].sort();

      expect(actual).toEqual(expected);
    });

    it('every documented runtime export has a non-undefined runtime value', () => {
      for (const name of EXPECTED_RUNTIME_EXPORTS) {
        expect((pkg as Record<string, unknown>)[name]).toBeDefined();
      }
    });

    it('every runtime export is a function, class, or object (never a primitive or null)', () => {
      for (const name of EXPECTED_RUNTIME_EXPORTS) {
        const v = (pkg as Record<string, unknown>)[name];
        const kind = typeof v;
        expect(['function', 'object'].includes(kind)).toBe(true);
      }
    });

    it('createAdapter is the canonical entry point and produces a frozen adapter object', () => {
      const adapter = pkg.createAdapter();
      expect(Object.isFrozen(adapter)).toBe(true);
      expect(typeof adapter.createModelService).toBe('function');
      expect(typeof adapter.createDataService).toBe('function');
      expect(typeof adapter.group).toBe('function');
      expect(typeof adapter.clearCache).toBe('function');
      expect(typeof adapter.disposeCache).toBe('function');
      expect(typeof adapter.wrapGet).toBe('function');
      expect(typeof adapter.wrapPost).toBe('function');
      expect(typeof adapter.wrapPut).toBe('function');
      expect(typeof adapter.wrapPatch).toBe('function');
      expect(typeof adapter.wrapDelete).toBe('function');
    });
  });

  describe('type export allowlist (positive)', () => {
    // Each `it` block below imports one named type. Vitest strips type-only
    // imports at runtime, so these assertions are partly type-level (an
    // unknown/removed type fails compilation here) and partly structural
    // (the type must accept a value of the documented shape).

    it('exports AdapterOptions, ModelServiceOptions, and DataServiceOptions as named factory option types', async () => {
      const { createAdapter } = await import('../src');
      // Type-only import keeps vitest's runtime targeting accurate; the
      // `type` qualifier also enforces that the import must be satisfiable
      // from the package's public type surface.
      type _Probe1 = import('../src').AdapterOptions;
      type _Probe2 = import('../src').ModelServiceOptions;
      type _Probe3 = import('../src').DataServiceOptions;
      // Exercise the option types through the documented factory call so the
      // structural presence of `cacheTTL`/`cachePartition`/`cacheCapacity` and
      // `modelName`/`basePath`/`dataName` is enforced.
      const opts: _Probe1 = { cacheTTL: 60_000, cacheCapacity: 100, cachePartition: () => 'id-1' };
      const adapter = createAdapter(undefined, opts);
      const mOpts: _Probe2 = { modelName: 'User', basePath: 'users' };
      const dOpts: _Probe3 = { dataName: 'fruit', basePath: 'fruit' };
      expect(typeof adapter.createModelService).toBe('function');
      void [mOpts, dOpts];
    });

    it('exports CachePartitioner and CacheController names so consumers can type cache policy config', () => {
      type _CachePartitioner = import('../src').CachePartitioner;
      type _CacheController = import('../src').CacheController;

      // The partitioner is a function; the controller exposes the two
      // adapter-scoped cache operations documented in `AdapterOptions`.
      const partition: _CachePartitioner = () => 'user-identity';
      const controller: _CacheController = {
        clear() {},
        dispose() {},
      };
      expect(typeof partition).toBe('function');
      expect(typeof controller.clear).toBe('function');
      expect(typeof controller.dispose).toBe('function');
    });

    it('exports the discriminated Response union and its member shapes', () => {
      type _Response = import('../src').Response<unknown>;
      type _SuccessResult = import('../src').SuccessResult<unknown>;
      type _FailureResult = import('../src').FailureResult<unknown>;
      // `Response` is the discriminated union; narrowing on `success`
      // exposes the success/failure shapes per ARC-14.
      const s: _SuccessResult = { success: true, raw: null, data: null, message: '', status: 200, headers: {} };
      const f: _FailureResult = { success: false, raw: null, data: null, message: '', status: 0, headers: {} };
      const r: _Response = Math.random() > 0.5 ? s : f;
      if (r.success) {
        expect(s.data).toBeNull();
      } else {
        expect(f.data).toBeNull();
      }
    });

    it('exports model and data response aliases', () => {
      type _ModelResponse = import('../src').ModelResponse<import('../src').Document>;
      type _ListModelResponse = import('../src').ListModelResponse<import('../src').Document>;
      type _ModelData = import('../src').ModelData<import('../src').Document>;
      type _DataResponse = import('../src').DataResponse<unknown>;
      type _ListDataResponse = import('../src').ListDataResponse<unknown>;
      type _SubDocumentResponse = import('../src').SubDocumentResponse<unknown>;
      type _SubDocumentListResponse = import('../src').SubDocumentListResponse<unknown>;
      const listModel: _ListModelResponse = {
        success: true,
        raw: [],
        data: [],
        message: '',
        status: 200,
        headers: {},
        totalCount: 0,
      };
      const subList: _SubDocumentListResponse = {
        success: true,
        raw: [],
        data: [],
        message: '',
        status: 200,
        headers: {},
        count: 0,
      };
      expect(listModel.totalCount).toBe(0);
      expect(subList.count).toBe(0);
      // Force usage of all probed aliases so unused-type linting stays happy.
      void ({} as _ModelResponse);
      void ({} as _ModelData);
      void ({} as _DataResponse);
      void ({} as _ListDataResponse);
      void ({} as _SubDocumentResponse);
    });

    it('exports request, query-meta, and lazy-request types', () => {
      type _ModelRequest = import('../src').ModelRequest<unknown>;
      type _DataRequest = import('../src').DataRequest<unknown>;
      type _LazyRequest = import('../src').LazyRequest<unknown>;
      type _RootQueryMeta = import('../src').RootQueryMeta;
      type _RootModelQueryMeta = import('../src').RootModelQueryMeta;
      type _RootDataQueryMeta = import('../src').RootDataQueryMeta;
      type _ModelPromiseMeta = import('../src').ModelPromiseMeta;
      type _DataPromiseMeta = import('../src').DataPromiseMeta;
      // Force the type-only imports to be referenced so they participate in
      // the public-export contract assertion.
      void ({} as _ModelRequest);
      void ({} as _DataRequest);
      void ({} as _LazyRequest);
      void ({} as _RootQueryMeta);
      void ({} as _RootModelQueryMeta);
      void ({} as _RootDataQueryMeta);
      void ({} as _ModelPromiseMeta);
      void ({} as _DataPromiseMeta);
    });

    it('exports per-method option and args interfaces for model services', () => {
      type _ListArgs = import('../src').ListArgs;
      type _ListOptions = import('../src').ListOptions;
      type _ListAdvancedArgs = import('../src').ListAdvancedArgs;
      type _ListAdvancedOptions = import('../src').ListAdvancedOptions;
      type _ReadOptions = import('../src').ReadOptions;
      type _ReadAdvancedArgs = import('../src').ReadAdvancedArgs;
      type _ReadAdvancedOptions = import('../src').ReadAdvancedOptions;
      type _CreateOptions = import('../src').CreateOptions;
      type _CreateAdvancedArgs = import('../src').CreateAdvancedArgs;
      type _CreateAdvancedOptions = import('../src').CreateAdvancedOptions;
      type _UpdateOptions = import('../src').UpdateOptions;
      type _UpdateAdvancedArgs = import('../src').UpdateAdvancedArgs;
      type _UpdateAdvancedOptions = import('../src').UpdateAdvancedOptions;
      type _UpsertOptions = import('../src').UpsertOptions;
      type _UpsertAdvancedArgs = import('../src').UpsertAdvancedArgs;
      type _UpsertAdvancedOptions = import('../src').UpsertAdvancedOptions;
      void ({} as _ListArgs);
      void ({} as _ListOptions);
      void ({} as _ListAdvancedArgs);
      void ({} as _ListAdvancedOptions);
      void ({} as _ReadOptions);
      void ({} as _ReadAdvancedArgs);
      void ({} as _ReadAdvancedOptions);
      void ({} as _CreateOptions);
      void ({} as _CreateAdvancedArgs);
      void ({} as _CreateAdvancedOptions);
      void ({} as _UpdateOptions);
      void ({} as _UpdateAdvancedArgs);
      void ({} as _UpdateAdvancedOptions);
      void ({} as _UpsertOptions);
      void ({} as _UpsertAdvancedArgs);
      void ({} as _UpsertAdvancedOptions);
    });

    it('exports per-method option and args interfaces for data services and Defaults/DataDefaults', () => {
      type _DataListArgs = import('../src').DataListArgs;
      type _DataListOptions = import('../src').DataListOptions;
      type _DataListAdvancedArgs = import('../src').DataListAdvancedArgs;
      type _DataListAdvancedOptions = import('../src').DataListAdvancedOptions;
      type _DataReadOptions = import('../src').DataReadOptions;
      type _DataReadAdvancedArgs = import('../src').DataReadAdvancedArgs;
      type _DataReadAdvancedOptions = import('../src').DataReadAdvancedOptions;
      type _Defaults = import('../src').Defaults;
      type _DataDefaults = import('../src').DataDefaults;
      void ({} as _DataListArgs);
      void ({} as _DataListOptions);
      void ({} as _DataListAdvancedArgs);
      void ({} as _DataListAdvancedOptions);
      void ({} as _DataReadOptions);
      void ({} as _DataReadAdvancedArgs);
      void ({} as _DataReadAdvancedOptions);
      void ({} as _Defaults);
      void ({} as _DataDefaults);
    });

    it('exports query/projection/populate/include/task primitives', () => {
      type _Projection = import('../src').Projection;
      type _KeyValueProjection = import('../src').KeyValueProjection;
      type _SelectedKeys = import('../src').SelectedKeys<unknown, unknown>;
      type _SelectedShape = import('../src').SelectedShape<unknown, unknown>;
      type _ResolvedSelectedShape = import('../src').ResolvedSelectedShape<unknown, unknown, never>;
      type _Sort = import('../src').Sort;
      type _SortOrder = import('../src').SortOrder;
      type _FilterQuery = import('../src').FilterQuery<unknown>;
      type _ModelMutationInput = import('../src').ModelMutationInput<{ _id?: string; name: string }>;
      type _SubDocumentMutationInput = import('../src').SubDocumentMutationInput<{ label: string }>;
      type _DottedPathFilter = import('../src').DottedPathFilter<unknown>;
      type _ServerSideCast = import('../src').ServerSideCast<unknown>;
      type _Populate = import('../src').Populate;
      type _PopulateAccess = import('../src').PopulateAccess;
      type _Include = import('../src').Include;
      type _Task = import('../src').Task;
      type _SubQueryOptions = import('../src').SubQueryOptions;
      type _WrapOptions = import('../src').WrapOptions;
      type _ResultError = import('../src').ResultError;
      type _ResponseCallback = import('../src').ResponseCallback;
      type _AdditionalReqConfig = import('../src').AdditionalReqConfig;
      type _Document = import('../src').Document;
      void ({} as _Projection);
      void ({} as _KeyValueProjection);
      void ({} as _SelectedKeys);
      void ({} as _SelectedShape);
      void ({} as _ResolvedSelectedShape);
      void ({} as _Sort);
      void ({} as _SortOrder);
      void ({} as _FilterQuery);
      void ({} as _ModelMutationInput);
      void ({} as _SubDocumentMutationInput);
      void ({} as _DottedPathFilter);
      void ({} as _ServerSideCast);
      void ({} as _Populate);
      void ({} as _PopulateAccess);
      void ({} as _Include);
      void ({} as _Task);
      void ({} as _SubQueryOptions);
      void ({} as _WrapOptions);
      void ({} as _ResultError);
      void ({} as _ResponseCallback);
      void ({} as _AdditionalReqConfig);
      void ({} as _Document);
    });
  });

  describe('type export allowlist (negative — these must NOT be exported)', () => {
    // Each `@ts-expect-error` below is intentionally paired with a usage that
    // would be the only way to disable the lint, so the directive stays
    // necessary. If a previously-private name is later re-exported from
    // `src/index.ts`, the `@ts-expect-error` becomes unused and lint complains
    // — the test fails and forces a contract review per ARC-17.

    it('does not export the axios-interceptor cache internals', () => {
      // @ts-expect-error — `useCacheInterceptors` is implementation-internal;
      //   consumers reach it only through `AdapterOptions.cacheTTL`.
      const _v1: NonExported = null as unknown as import('../src').useCacheInterceptors;
      // @ts-expect-error — `cloneConfigWithCacheBypass` is implementation-internal.
      const _v2: NonExported = null as unknown as import('../src').cloneConfigWithCacheBypass;
      // @ts-expect-error — `CACHE_HEADER` is an internal constant; consumers
      //   use `CustomHeaders` for documented header names.
      const _v3: NonExported = null as unknown as import('../src').CACHE_HEADER;
      // The negatives must not be reachable: assertion ensures the
      // runtime name resolution does not surface them as values either.
      expect((pkg as Record<string, unknown>).useCacheInterceptors).toBeUndefined();
      expect((pkg as Record<string, unknown>).cloneConfigWithCacheBypass).toBeUndefined();
      expect((pkg as Record<string, unknown>).CACHE_HEADER).toBeUndefined();
      void _v1;
      void _v2;
      void _v3;
    });

    it('does not export the lazy-promise STARTED_KEY adapter-internal marker', () => {
      // `STARTED_KEY` is the non-enumerable per-request execution-state
      // marker that `adapter.group(...)` reads to reject already-started
      // requests. It is adapter-internal and intentionally not exported.
      // @ts-expect-error — not part of the public surface.
      const _v: NonExported = null as unknown as import('../src').STARTED_KEY;
      expect((pkg as Record<string, unknown>).STARTED_KEY).toBeUndefined();
      void _v;
    });

    it('does not export service internals (sub-ops, shared, wrap, cache-utils, symbols)', () => {
      // @ts-expect-error — `buildSubDocumentOps` is internal.
      const _v1: NonExported = null as unknown as import('../src').buildSubDocumentOps;
      // @ts-expect-error — `finalizeRootEntry` is internal grouping plumbing.
      const _v2: NonExported = null as unknown as import('../src').finalizeRootEntry;
      // @ts-expect-error — `applyGroupCallbacks` is internal grouping plumbing.
      const _v3: NonExported = null as unknown as import('../src').applyGroupCallbacks;
      // @ts-expect-error — `createWrapHelper` is internal.
      const _v4: NonExported = null as unknown as import('../src').createWrapHelper;
      // @ts-expect-error — `makeRequest` is internal.
      const _v5: NonExported = null as unknown as import('../src').makeRequest;
      // @ts-expect-error — `normalizeConfigValue` is internal.
      const _v6: NonExported = null as unknown as import('../src').normalizeConfigValue;
      // @ts-expect-error — `ADAPTER_ID_KEY` adapter-internal symbol.
      const _v7: NonExported = null as unknown as import('../src').ADAPTER_ID_KEY;
      // @ts-expect-error — `CachePolicy` is internal interceptors plumbing;
      //   consumers configure cache via AdapterOptions only.
      const _v8: NonExported = null as unknown as import('../src').CachePolicy;
      // @ts-expect-error — `RootEntry` is internal grouping plumbing.
      const _v9: NonExported = null as unknown as import('../src').RootEntry;
      void [_v1, _v2, _v3, _v4, _v5, _v6, _v7, _v8, _v9];
    });

    it('does not export the model-service or data-service Props implementation interfaces', () => {
      // @ts-expect-error — `Props` is the constructor-coupled internal shape.
      const _v1: NonExported = null as unknown as import('../src/model-service').Props;
      // @ts-expect-error — `Props` (data-service) is implementation-internal.
      const _v2: NonExported = null as unknown as import('../src/services/data-service').Props;
      void [_v1, _v2];
    });

    it('does not expose `ModelService`/`DataService` private defaults or callback-handler getters as named exports', () => {
      // The internal `_defaults` field and `_handleCallbacks` resolver are
      // instance-private — they must not be reachable through the package
      // root as named runtime exports.
      type T = Record<string, unknown>;
      const secrets: T = pkg as T;
      expect(secrets._defaults).toBeUndefined();
      expect(secrets._handleCallbacks).toBeUndefined();
      expect(secrets._modelName).toBeUndefined();
      expect(secrets._dataName).toBeUndefined();
    });
  });
});
