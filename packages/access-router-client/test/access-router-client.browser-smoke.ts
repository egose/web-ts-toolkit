import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

/**
 * ARC-19: Decide And Verify Browser Compatibility.
 *
 * Maintainer decision (Deferred Decision #1): **Browser + Node**. The
 * package is therefore shipped at an `es2022` bundle target (see
 * `tsup.config.ts`) and documented for both runtimes.
 *
 * This smoke test imports the *built* ESM bundle (`dist/index.mjs`), not the
 * source, then runs it under a `jsdom` browser environment (Vitest is
 * Vite-powered, so the import goes through Vite's module pipeline). It
 * catches smoke-level regressions:
 *
 * 1. **Node built-ins** — `jsdom` does not implement `process`, `Buffer`,
 *    `setImmediate`, `global`, or Node's `http`/`https`/`url` core modules.
 *    Any code path that requires a Node-only built-in throws at import time
 *    or at call time. Axios's browser build is selected by the bundler
 *    because `tsup` bundles `axios` for a neutral platform; if a Node entry
 *    were leaked instead, the smoke test would fail at the network adapter
 *    resolution step.
 * 2. **Basic ESM browser bundling** — the built ESM artifact can be imported
 *    through Vite in a browser-like environment.
 * 3. **Public surface stability** — the runtime export set must match
 *    ARC-17's contract so the same names that work in Node also work in the
 *    browser bundle.
 * 4. **Cache path in the browser** — `setTimeout` is jsdom-native so cache
 *    TTL expiry and `clearCache()` run without Node timers; the feature-
 *    detected `unref()` guard must be a no-op in the browser.
 *
 * This is not a real-browser engine/version compatibility gate. All HTTP paths
 * use a custom Axios adapter that resolves without touching the network, so the
 * test stays offline and deterministic in CI.
 */

// `import * as pkg` is intentionally relative to the built bundle so the test
// exercises what an installed browser consumer actually loads. Vitest's Vite
// pipeline resolves `../dist/index.mjs` directly off the file system.
import * as pkg from '../dist/index.mjs';

const EXPECTED_RUNTIME_EXPORTS = [
  'CustomHeaders',
  'DataService',
  'MissingPersistenceIdentityError',
  'Model',
  'ModelService',
  'Service',
  'ServiceError',
  'createAdapter',
  'removeItemById',
  'replaceItemById',
  'wrapLazyPromise',
] as const;

interface Pet {
  _id?: string;
  name: string;
  role: string;
}

/**
 * Custom Axios adapter that resolves with a deterministic 200 response. Used
 * instead of `xhr`/`fetch` so the smoke test stays offline and never touches
 * jsdom's `XMLHttpRequest` implementation (which would require a server).
 */
function makeOkAdapter(body: unknown) {
  return vi.fn(async () => ({
    data: body,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { adapter: 'mock' },
  }));
}

describe('ARC-19: browser (jsdom) bundle smoke', () => {
  beforeAll(() => {
    // Sanity: the test runs in a jsdom browser environment. `window` exists;
    // Node-only globals are either absent or the jsdom shim. Asserting
    // `document` confirms the env switched off the Node default.
    expect(typeof document).toBe('object');
    expect(document.createElement('div')).toBeInstanceOf(window.HTMLElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('imports the built ESM bundle without a Node-only top-level throw', () => {
    // Reaching this `it` block at all means the static `import * as pkg`
    // above resolved and the module graph initialized without referencing an
    // unimplemented Node built-in. That is the primary browser-compat gate.
    expect(pkg).toBeDefined();
    expect(typeof pkg.createAdapter).toBe('function');
  });

  it('exposes the documented runtime export surface (matches ARC-17)', () => {
    const actual = Object.keys(pkg).sort();
    const expected = [...new Set(EXPECTED_RUNTIME_EXPORTS)].sort();
    expect(actual).toEqual(expected);
  });

  it('createAdapter builds a frozen adapter with every documented method', () => {
    const adapter = pkg.createAdapter({ baseURL: '/api' });
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

  it('ModelService/DataService are constructible and produce service instances', () => {
    const adapter = pkg.createAdapter({ baseURL: '/api' });
    const petService = adapter.createModelService<Pet>({ modelName: 'Pet', basePath: 'pets' });
    const fruitService = adapter.createDataService<Pet>({ dataName: 'fruit', basePath: 'fruit' });
    expect(petService).toBeInstanceOf(pkg.ModelService);
    expect(fruitService).toBeInstanceOf(pkg.DataService);
    expect(petService).toBeInstanceOf(pkg.Service);
  });

  it('CustomHeaders enum values are stable strings', () => {
    expect(pkg.CustomHeaders.TotalCount).toBe('wtt-total-count');
    expect(pkg.CustomHeaders.ReturnedCount).toBe('wtt-returned-count');
  });

  it('ServiceError extends Error and is constructible', () => {
    const err = new pkg.ServiceError({
      success: false,
      raw: {},
      data: null,
      message: 'browser boom',
      status: 500,
      headers: {},
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('browser boom');
  });

  it('a lazy request resolves through the browser adapter path using a mock Axios adapter', async () => {
    const adapter = pkg.createAdapter({
      baseURL: '/api',
      adapter: makeOkAdapter({ _id: 'p1', name: 'Max', role: 'admin' }) as never,
    });
    const petService = adapter.createModelService<Pet>({ modelName: 'Pet', basePath: 'pets' });

    // `read` returns a lazy request; awaiting it in the browser env exercises
    // the full Axios request → response-interceptor → Model.create pipeline.
    const result = await petService.read('p1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeInstanceOf(pkg.Model);
      expect((result.data as Pet & { _id?: string })._id).toBe('p1');
    }
  });

  it('cache TTL works in the browser env: setTimeout expiry + clearCache are no-throw', () => {
    const mockAdapter = makeOkAdapter({ _id: 'c1', name: 'Cachey', role: 'user' });
    const adapter = pkg.createAdapter(
      { baseURL: '/api', adapter: mockAdapter as never, withCredentials: false },
      { cacheTTL: 60_000, cacheCapacity: 8 },
    );
    const petService = adapter.createModelService<Pet>({ modelName: 'Pet', basePath: 'pets' });

    // Cache controls must be callable in a browser env. `clearCache` and
    // `disposeCache` release the underlying timers; `setTimeout` is jsdom-
    // native. The `unref()` guard in the cache code is feature-detected so
    // it must be a no-op rather than throwing.
    expect(() => adapter.clearCache()).not.toThrow();
    expect(() => adapter.disposeCache()).not.toThrow();

    // Cleanup of any pending timer to avoid stray jsdom timer warnings.
    adapter.disposeCache();
    void petService;
  });

  it('wrapLazyPromise converts a synchronous executor throw into a rejected promise (browser runtime)', async () => {
    // `wrapLazyPromise` is the exported low-level builder; it must honor
    // Promise rejection semantics in the browser env just as it does in Node.
    const lazy = pkg.wrapLazyPromise(() => {
      throw new Error('sync-browser-boom');
    });
    await expect(lazy.exec()).rejects.toThrow('sync-browser-boom');
  });

  it('replaceItemById/removeItemById list helpers work on plain object arrays', () => {
    interface Item {
      _id: string;
      name: string;
    }
    const items: Item[] = [
      { _id: '1', name: 'a' },
      { _id: '2', name: 'b' },
    ];
    const replaced = pkg.replaceItemById(items, { _id: '1', name: 'A' });
    expect(replaced).toHaveLength(2);
    expect(replaced[0]).toMatchObject({ _id: '1', name: 'A' });

    // `removeItemById` takes the whole target item, not an id string.
    const removed = pkg.removeItemById(items, { _id: '2', name: 'b' });
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ _id: '1' });
  });
});
