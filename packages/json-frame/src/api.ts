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
 */
export function fromOrient<TRow extends JsonCompatibleRow<TRow> = JsonRow>(
  input: string,
  options?: FromOrientOptions,
): DataFrame<TRow>;
export function fromOrient<TRow extends JsonCompatibleRow<TRow>>(
  input: readonly TRow[],
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
