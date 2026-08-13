import { describe, expect, it } from 'vitest';

import type { ModelService, Document as ARDocument, Model } from '@web-ts-toolkit/access-router-client';
import { createModelHooks } from '../src';
import type {
  UseBaseOptions,
  UseReadQueryOptions,
  UseReadQueryResult,
  UseListQueryOptions,
  UseListQueryResult,
  UseCreateMutateOptions,
  UseCreateMutateResult,
  UseUpdateMutateOptions,
  UseUpdateMutateResult,
  UseUpsertMutateOptions,
  UseUpsertMutateResult,
  UseDeleteMutateOptions,
  UseDeleteMutateResult,
  UseCountQueryOptions,
  UseCountQueryResult,
  UseDistinctQueryOptions,
  UseDistinctQueryResult,
  ProjectedShape,
  ProjectedShapeArray,
  ProjectedModelResponse,
  ProjectedListModelResponse,
} from '../src';

// Import everything, including type-only exports. The object literal is the
// shape of `import * as pkg from '../src'` at runtime — type-only exports are
// erased, so `pkg` only exposes runtime values. We assert the runtime
// surface separately below.
import * as pkg from '../src';

/**
 * ARR-10: Lock the public export surface of
 * `@web-ts-toolkit/access-router-react`. Two complementary contracts:
 *
 * 1. **Runtime allowlist** — the set of *values* reachable from the root
 *    export (functions, classes). Any accidental addition or removal requires
 *    revisiting this allowlist, preventing implementation helpers (the
 *    `fetch.ts` internals `isAbortError` / `composeAbortSignals` /
 *    `mergeRequestConfig` / `useAbortManager` / `stableStringify` /
 *    `useMountRef`) from leaking back out via the package barrel.
 * 2. **Type allowlist** — the set of *types/interfaces* reachable from the
 *    root export. Locks the named hook option, result, and projection
 *    helpers consumers import to compose the documented factory and hook
 *    shapes. ARR-09 added the projection-aware public surface
 *    (`ProjectedShape`, `ProjectedShapeArray`, `ProjectedModelResponse`,
 *    `ProjectedListModelResponse`); ARR-10 locks those types plus all
 *    per-method hook option/result interfaces so they cannot drift without
 *    an explicit contract review.
 *
 * The runtime contract is the source of truth; the type contract is derived
 * by stating every named import the package must satisfy, plus
 * `@ts-expect-error` probes for names that must NOT be re-exported. Together
 * these catch the regression the original review flagged (a thin barrel that
 * surfaced `requestKeyFor` and `createModelHooks` but never locked the type
 * surface, so a refactor could silently drop projection types or surface
 * abort-utility internals).
 */

const EXPECTED_RUNTIME_EXPORTS = [
  // The factory entry point — the only adapter-coupled API the package
  // exposes. Consumers pass a `ModelService<T>` from
  // `@web-ts-toolkit/access-router-client` and receive the per-method query
  // and mutation hooks documented in the README.
  'createModelHooks',
  // Public dependency-key helper and its error class. The query hooks use
  // `requestKeyFor` to build their effect-deps keys (the docs cover the
  // unsupported-value categories); consumers can import the helper to
  // construct keys themselves or to validate a user-supplied filter before
  // passing it to a query hook.
  'requestKeyFor',
  'RequestKeyError',
] as const;

// Sentinel type used by the negative type-export probes below.
type NonExported = 'must-not-be-exported';

describe('access-router-react public export contract (ARR-10)', () => {
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

    it('every runtime export is a function or class (never a primitive or null)', () => {
      for (const name of EXPECTED_RUNTIME_EXPORTS) {
        const v = (pkg as Record<string, unknown>)[name];
        const kind = typeof v;
        expect(['function', 'object'].includes(kind)).toBe(true);
      }
    });

    it('createModelHooks is the canonical entry point and returns a hooks object exposing every documented hook family', () => {
      const petService = {} as unknown as ModelService<ARDocument>;
      const hooks = pkg.createModelHooks({ modelService: petService });

      expect(typeof hooks).toBe('object');
      for (const hookName of [
        'useRead',
        'useList',
        'useCreate',
        'useUpdate',
        'useUpsert',
        'useDelete',
        'useCount',
        'useDistinct',
      ]) {
        expect(typeof (hooks as Record<string, unknown>)[hookName]).toBe('function');
      }
    });

    it('requestKeyFor is stable for equal inputs and produces a string', () => {
      const a = pkg.requestKeyFor({ filter: { status: 'active' } });
      const b = pkg.requestKeyFor({ filter: { status: 'active' } });
      expect(a).toBe(b);
      expect(typeof a).toBe('string');
    });

    it('RequestKeyError extends Error and sets its name', () => {
      expect(pkg.RequestKeyError.prototype instanceof Error).toBe(true);
      expect(new pkg.RequestKeyError('boom').name).toBe('RequestKeyError');
    });
  });

  describe('type export allowlist (positive)', () => {
    // Each `it` block imports one named type. Vitest strips type-only
    // imports at runtime, so these assertions are type-level (an unknown or
    // removed type fails compilation here) and structural (the type must
    // accept a value of the documented shape).

    it('exports RequestConfig and QueryCallOptions as named primitives', () => {
      type _RequestConfig = import('../src').RequestConfig;
      type _QueryCallOptions = import('../src').QueryCallOptions;
      const cfg: _RequestConfig = { headers: { 'x-trace': 'abc' } };
      const opts: _QueryCallOptions = { throwOnError: false };
      expect(typeof cfg).toBe('object');
      expect(opts.throwOnError).toBe(false);
    });

    it('exports UseBaseOptions and every per-method query option and result interface', () => {
      interface Pet extends ARDocument {
        _id?: string;
        name: string;
        status: string;
      }
      const petService = {} as unknown as ModelService<Pet>;
      const hooks = createModelHooks({ modelService: petService });

      // UseBaseOptions is the common shape every options interface extends.
      const base: UseBaseOptions = { enabled: true };
      void base;

      // Each per-method option and result interface is reachable via the
      // public type import (the imports at the top of this file prove the
      // names exist; here we prove structural assignability with concrete
      // samples). Hook call sites are NOT invoked at vitest runtime because
      // `createModelHooks` returns React hooks whose `useState` would
      // throw Invalid-hook-call outside `renderHook` — the existing
      // test-decl-consumer harness already covers the type-level hook call
      // surface under `tsc --noEmit`, and the packed-consumer compile gate
      // covers strict-mode compile against the published declarations. Here
      // we only assert the option and result aliases accept the documented
      // structural shapes without executing any hook.
      const readOpts: UseReadQueryOptions<Pet> = { id: '1', enabled: true };
      void readOpts;
      const _readResultShape: UseReadQueryResult<Pet> = null as unknown as UseReadQueryResult<Pet>;
      void _readResultShape;

      const listOpts: UseListQueryOptions<Pet> = { listParams: { pageSize: 10 } };
      void listOpts;
      const _listResultShape: UseListQueryResult<Pet> = null as unknown as UseListQueryResult<Pet>;
      void _listResultShape;

      const createOpts: UseCreateMutateOptions<Pet> = {};
      void createOpts;
      const _createResultShape: UseCreateMutateResult<Pet> = null as unknown as UseCreateMutateResult<Pet>;
      void _createResultShape;

      const updateOpts: UseUpdateMutateOptions<Pet> = {};
      void updateOpts;
      const _updateResultShape: UseUpdateMutateResult<Pet> = null as unknown as UseUpdateMutateResult<Pet>;
      void _updateResultShape;

      const upsertOpts: UseUpsertMutateOptions<Pet> = {};
      void upsertOpts;
      const _upsertResultShape: UseUpsertMutateResult<Pet> = null as unknown as UseUpsertMutateResult<Pet>;
      void _upsertResultShape;

      const deleteOpts: UseDeleteMutateOptions = {};
      void deleteOpts;
      const _deleteResultShape: UseDeleteMutateResult = null as unknown as UseDeleteMutateResult;
      void _deleteResultShape;

      const countOpts: UseCountQueryOptions<Pet> = {};
      void countOpts;
      const _countResultShape: UseCountQueryResult = null as unknown as UseCountQueryResult;
      void _countResultShape;

      const distinctOpts: UseDistinctQueryOptions<Pet> = { field: 'status' };
      void distinctOpts;
      const _distinctResultShape: UseDistinctQueryResult = null as unknown as UseDistinctQueryResult;
      void _distinctResultShape;

      expect(typeof hooks).toBe('object');
      void petService;
    });

    it('exports the ARR-09 projection-aware public surface (ProjectedShape/ProjectedShapeArray/ProjectedModelResponse/ProjectedListModelResponse)', () => {
      interface Pet extends ARDocument {
        _id?: string;
        name: string;
        status: string;
      }
      // Each projection alias is reachable through the package root import.
      type _ProjectedShape = ProjectedShape<Pet, 'name'>;
      type _ProjectedShapeArray = ProjectedShapeArray<Pet, readonly ['name']>;
      type _ProjectedModelResponse = ProjectedModelResponse<Pet, 'name'>;
      type _ProjectedListModelResponse = ProjectedListModelResponse<Pet, 'name'>;

      // Force the type-only imports to be referenced so they participate in
      // the public-export contract assertion.
      void ({} as _ProjectedShape);
      void ({} as _ProjectedShapeArray);
      void ({} as _ProjectedModelResponse);
      void ({} as _ProjectedListModelResponse);

      // And via `import('../src')` so a refactor that moves the canonical
      // alias out of the barrel without updating callers fails the compile.
      type _Recursed = import('../src').ProjectedShape<Pet, 'name'>;
      void ({} as _Recursed);
    });

    it('`ProjectedModelResponse<T, never>` is the documented full-model response when no projection is supplied', () => {
      interface Pet extends ARDocument {
        _id?: string;
        name: string;
      }
      // `Projection` is the lower bound of the no-projection default; the
      // `SelectedKeys<T, never> extends never` branch keeps
      // `ModelResponse<T>` so the public response surface is the legacy
      // full-model shape. The consumer-facing contract asserts this:
      type _Default = ProjectedModelResponse<Pet, never>;
      const probeResponse = {} as _Default;
      if (probeResponse.success) {
        expectTypeAssignableTo<Model<Pet> & Pet>(probeResponse.data);
      }
    });
  });

  describe('type export allowlist (negative — these must NOT be exported)', () => {
    // Each `@ts-expect-error` below is intentionally paired with a usage that
    // would be the only way to disable the lint, so the directive stays
    // necessary. If a previously-private name is later re-exported from
    // `src/index.ts`, the `@ts-expect-error` becomes unused and lint complains
    // — the test fails and forces a contract review per ARR-10.

    it('does not export the fetch-utility abort/stable-stringify internals', () => {
      // @ts-expect-error — `isAbortError` is a fetch-utility helper, not part
      //   of the public hook surface.
      const _v1: NonExported = null as unknown as import('../src').isAbortError;
      // @ts-expect-error — `composeAbortSignals` is implementation-internal.
      const _v2: NonExported = null as unknown as import('../src').composeAbortSignals;
      // @ts-expect-error — `mergeRequestConfig` is implementation-internal.
      const _v3: NonExported = null as unknown as import('../src').mergeRequestConfig;
      // @ts-expect-error — `useAbortManager` is implementation-internal.
      const _v4: NonExported = null as unknown as import('../src').useAbortManager;
      // @ts-expect-error — `stableStringify` is the request-key serializer
      //   implementation, not part of the public hook surface; consumers
      //   use `requestKeyFor` which wraps it.
      const _v5: NonExported = null as unknown as import('../src').stableStringify;
      // @ts-expect-error — `useMountRef` is an implementation-internal React
      //   ref helper.
      const _v6: NonExported = null as unknown as import('../src').useMountRef;
      // The negatives must not be reachable: assertion ensures the runtime
      // name resolution does not surface them as values either.
      expect((pkg as Record<string, unknown>).isAbortError).toBeUndefined();
      expect((pkg as Record<string, unknown>).composeAbortSignals).toBeUndefined();
      expect((pkg as Record<string, unknown>).mergeRequestConfig).toBeUndefined();
      expect((pkg as Record<string, unknown>).useAbortManager).toBeUndefined();
      expect((pkg as Record<string, unknown>).stableStringify).toBeUndefined();
      expect((pkg as Record<string, unknown>).useMountRef).toBeUndefined();
      void [_v1, _v2, _v3, _v4, _v5, _v6];
    });

    it('does not expose the per-module (non-index) entry points as named root runtime exports either', () => {
      // `createModelHooks` lives in `create-model-hook.ts` and `requestKeyFor`
      // / `RequestKeyError` live in `fetch.ts`, but only the barrel
      // (`src/index.ts`) re-exports are the public surface. Importing a
      // subpath via the package root is implementation-internal and must not
      // be reachable as a value name.
      const secrets: Record<string, unknown> = pkg as Record<string, unknown>;
      expect(secrets.useRead).toBeUndefined();
      expect(secrets.useList).toBeUndefined();
      expect(secrets.useCreate).toBeUndefined();
      expect(secrets.useUpdate).toBeUndefined();
      expect(secrets.useUpsert).toBeUndefined();
      expect(secrets.useDelete).toBeUndefined();
      expect(secrets.useCount).toBeUndefined();
      expect(secrets.useDistinct).toBeUndefined();
    });
  });
});

function expectTypeAssignableTo<TExpected>(_actual: TExpected): void {
  void _actual;
}
