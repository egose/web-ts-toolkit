/**
 * ACI-04: brand and controlled-error primitives for correlated includes.
 *
 * This module is intentionally dependency-free (no imports) so that
 * `helpers.ts` (filter conversion), `adapter.ts` (grouping), `correlated.ts`
 * (reference scanning/conversion), and `services/model-service.ts` can all
 * share one brand without creating import cycles. It is internal: the package
 * root re-exports only `parentField` and `CorrelatedIncludeError`, never the
 * brand symbol or its checker.
 *
 * Browser note: uses only a `Symbol` brand and plain `Error` subclassing —
 * no Node built-ins, no server runtime dependencies.
 */

/** Non-enumerable-by-convention brand stamped on correlated descriptors. */
export const CORRELATED_DESCRIPTOR_BRAND = Symbol('access-router-client.correlated-descriptor');

/**
 * Controlled error for every client-side correlated-include misuse:
 * malformed `parentField()` input, malformed marker shapes from unchecked
 * JavaScript callers, markers in forbidden positions, descriptors embedded in
 * filters or include arrays, descriptors passed to `adapter.group()`, and
 * unsupported per-call args/options supplied to `$include()`.
 * Also thrown synchronously for cycles or query preparation beyond 64 edges
 * (root depth 0) / 10,000 expanded visits, including primitive leaves, array
 * holes and repeated shared references. Capture budgets combine supplied
 * id/filter/args/options; conversion combines id/rewritten filter and effective
 * forwarded args. `$escape` stays literal but structurally checked. Live
 * requests remain opaque until their exposed `$$sq` metadata is checked.
 * Preparation performs zero HTTP; structural limits are not byte/latency or
 * arbitrary getter/proxy/exotic-instance guarantees.
 */
export class CorrelatedIncludeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorrelatedIncludeError';
  }
}

/**
 * Brand check for reference-bearing descriptors. Descriptors never carry
 * `__op`/`__query`/`then`, so they cannot be confused with executable lazy
 * requests or `$$sq` payloads; this single brand is the enforcement point
 * used by filter conversion and grouping.
 */
export const isCorrelatedIncludeDescriptor = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  (value as Record<symbol, unknown>)[CORRELATED_DESCRIPTOR_BRAND] === true;
