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
