/**
 * Module-private Symbol used by `createAdapter` to stamp the unique adapter
 * identity token onto every `ModelService` and `DataService` it constructs.
 * The token is also captured by the adapter closure for comparison inside
 * `adapter.group(...)`, which rejects requests belonging to a different
 * adapter before any network activity begins.
 *
 * The Symbol is intentionally NOT exported from the package's public surface
 * (`src/index.ts`); it lives only in `src/services` for adapter-internal use.
 * Non-enumerable installation via `Object.defineProperty` keeps consumer
 * iteration and serialization untouched.
 */
export const ADAPTER_ID_KEY = Symbol('adapterId');
