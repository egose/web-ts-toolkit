import { createDataFrame } from './frame/DataFrame';
import { createFrameState } from './frame/column';
import { normalizeFromOrientOptions } from './options';
import { parseInput } from './parse';
import type {
  DataFrame,
  FromOrientOptions,
  JsonCompatibleRow,
  JsonRow,
  JsonValue,
  SplitPayload,
  TablePayload,
} from './types';

type RecordKeys<T> = T extends unknown ? Extract<keyof T, string | number> : never;
// Distribute over key domains: an index signature accepts an empty object,
// whereas a finite required key does not. `never` prevents inherited Object
// members from satisfying this probe (as they could with `unknown`). This also
// covers template patterns without parsing their prefixes or interpolations.
type IndexRecordKeys<K extends PropertyKey> = K extends unknown
  ? Record<never, never> extends Record<K, never>
    ? K
    : never
  : never;
// Object.keys() exposes numeric labels as strings. Normalize each variant before
// combining cells/requiredness so 1 and '1' describe the same runtime column.
type CanonicalRecord<T> = T extends unknown
  ? { [K in keyof T as K extends string | number ? `${K}` : never]: T[K] }
  : never;
// Structural Record<K, unknown> checks can see inherited Object members on {}.
// Check declared keys per variant, then optionality on the declared property.
type VariantRequiresKey<T, K extends PropertyKey> = T extends unknown
  ? K extends keyof T
    ? Pick<T, K> extends Required<Pick<T, K>>
      ? true
      : false
    : false
  : never;
// A column can be absent entirely unless every variant requires it. Keep those
// fields optional, and add null for rows missing a column that does exist.
type RequiredRecordKeys<T> = {
  [K in RecordKeys<T>]: false extends VariantRequiresKey<T, K> ? never : K;
}[RecordKeys<T>];
type RecordCell<T, K extends PropertyKey> = T extends unknown
  ? K extends keyof T
    ? Exclude<T[K], undefined>
    : never
  : never;
type NormalizedRecord<T> = {
  [K in RequiredRecordKeys<T>]: RecordCell<T, K>;
} & {
  [K in Exclude<RecordKeys<T>, RequiredRecordKeys<T>>]?: RecordCell<T, K> | null;
};
type FlattenedRecord<T> = { [K in keyof NormalizedRecord<T>]: NormalizedRecord<T>[K] };
type InferredRecord<T> =
  Extract<T, readonly unknown[]> extends never
    ? [RecordKeys<T>] extends [never]
      ? JsonRow
      : [IndexRecordKeys<RecordKeys<T>>] extends [never]
        ? FlattenedRecord<CanonicalRecord<T>>
        : JsonRow
    : JsonRow;
type InferredRecordsFrame<T> =
  InferredRecord<T> extends infer TRow extends JsonCompatibleRow<TRow> ? DataFrame<TRow> : DataFrame<JsonRow>;

/**
 * Parses pandas-compatible JSON into an immutable `DataFrame`.
 *
 * `auto` detection recognizes only structurally unambiguous payloads, including
 * non-empty `values` arrays. Every `values` payload still requires
 * `options.columns` because that orient carries no column labels; empty
 * `values` input also requires explicit `options.orient: 'values'`. Pass an
 * explicit `options.orient` for `index`, `columns`, empty arrays, and empty
 * objects. The generic row type is for TypeScript ergonomics and is not
 * runtime-validated beyond the documented JSON-orient contracts. `index` and
 * `columns` object-key payloads follow JavaScript property enumeration order
 * for integer-like keys; use `split` or `table` when exact row order must be
 * preserved for those labels. JSON arrays/objects may nest up to
 * `JSON_FRAME_MAX_DEPTH` levels from the parsed root value. Explicit non-table
 * `columnTypes` are validated against non-null cells and never coerce values.
 *
 * Parsed records infer known required fields precisely. Fields missing from
 * any record variant or declared optional include `null` for normalization;
 * they remain optional because a column absent from every row is not created.
 * This includes Object-member names such as `toString` and `constructor`:
 * inherited members do not supply cells. Numeric literal keys and their string
 * spellings (1 and '1') infer one string-named column with the combined cell
 * types, accessible through either spelling. Open index domains (string,
 * number, or template patterns such as `metric_${string}` and `${number}`)
 * fall back to `JsonRow`, including unions/intersections with known fields.
 * They do not promise every matching column is present; use scalar guards
 * such as `typeof cell === 'number'` before numeric operations. Finite template
 * key unions retain precise fields, including their optionality.
 * Union variants are flattened, so discriminants do not imply cell presence.
 * Normalization is shallow; nested cell types are preserved.
 * Arrays (including readonly tuples) infer object-shaped `JsonRow` values,
 * not array rows. Broad records/options and other layouts may also fall back
 * to `JsonRow`. An explicit domain generic preserves the caller's row model;
 * it is an assertion, not runtime schema validation.
 */
export function fromOrient<TRow extends JsonCompatibleRow<TRow> = JsonRow>(
  input: string,
  options?: FromOrientOptions,
): DataFrame<TRow>;
export function fromOrient<TRecords extends readonly object[]>(
  input: TRecords & readonly JsonCompatibleRow<TRecords[number]>[],
  options?: FromOrientOptions & { readonly orient?: 'auto' | 'records' },
): InferredRecordsFrame<TRecords[number]>;
/** Explicit domain row assertion; does not infer or validate an application schema. */
export function fromOrient<TRow extends JsonCompatibleRow<TRow> = JsonRow>(
  input: readonly NoInfer<TRow>[],
  options?: FromOrientOptions & { readonly orient?: 'auto' | 'records' },
): DataFrame<TRow>;
export function fromOrient<TRow extends JsonCompatibleRow<TRow> = JsonRow>(
  input: SplitPayload,
  options: FromOrientOptions & { readonly orient: 'split' },
): DataFrame<TRow>;
export function fromOrient<TRow extends JsonCompatibleRow<TRow> = JsonRow>(
  input: TablePayload,
  options: FromOrientOptions & { readonly orient: 'table' },
): DataFrame<TRow>;
export function fromOrient<TRow extends JsonCompatibleRow<TRow> = JsonRow>(
  input: JsonValue,
  options?: FromOrientOptions,
): DataFrame<TRow>;
export function fromOrient<TRow extends JsonCompatibleRow<TRow> = JsonRow>(
  input: string | JsonValue,
  options?: FromOrientOptions,
): DataFrame<TRow> {
  const normalized = normalizeFromOrientOptions(options);
  const parsed = parseInput(input, normalized);

  return createDataFrame<TRow>(createFrameState(parsed, normalized), normalized.packThreshold);
}
