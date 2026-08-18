import { createDataFrame } from './frame/DataFrame';
import { createFrameState } from './frame/column';
import { normalizeFromOrientOptions } from './options';
import { parseInput } from './parse';
import type { DataFrame, FromOrientOptions, JsonValue } from './types';

/**
 * Parses pandas-compatible JSON into an immutable `DataFrame`.
 *
 * `auto` detection recognizes only structurally unambiguous payloads. Pass an
 * explicit `options.orient` for `index`, `columns`, empty arrays, empty
 * objects, and all `values` payloads. The generic row type is for TypeScript
 * ergonomics and is not runtime-validated beyond the documented JSON-orient
 * contracts.
 */
export function fromOrient<TRow extends Record<string, JsonValue> = Record<string, JsonValue>>(
  input: string,
  options?: FromOrientOptions,
): DataFrame<TRow>;
export function fromOrient<TRow extends Record<string, JsonValue>>(
  input: readonly TRow[],
  options?: FromOrientOptions & { readonly orient?: 'auto' | 'records' },
): DataFrame<TRow>;
export function fromOrient<TRow extends Record<string, JsonValue> = Record<string, JsonValue>>(
  input: JsonValue,
  options?: FromOrientOptions,
): DataFrame<TRow>;
export function fromOrient<TRow extends Record<string, JsonValue> = Record<string, JsonValue>>(
  input: string | JsonValue,
  options?: FromOrientOptions,
): DataFrame<TRow> {
  const normalized = normalizeFromOrientOptions(options);
  const parsed = parseInput(input, normalized);

  return createDataFrame<TRow>(createFrameState(parsed, normalized), normalized.packThreshold);
}
