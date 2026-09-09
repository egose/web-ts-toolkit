import type { Orient, ResolvedOrient } from './types';

/** Maximum number of object keys retained in a diagnostic object summary. */
export const JSON_FRAME_DIAGNOSTIC_KEY_LIMIT = 5;

/**
 * Maximum total characters retained across the `keys` preview of a diagnostic
 * object summary. Longer key text is truncated to this budget and reported via
 * `truncated: true`.
 */
export const JSON_FRAME_DIAGNOSTIC_KEY_TEXT_BUDGET = 200;

type JsonFrameErrorContext = {
  readonly orient?: Orient;
  readonly path?: string;
  readonly row?: number;
  readonly column?: string;
  readonly value?: unknown;
};

/**
 * Bounded value stored on structured errors instead of caller-owned containers.
 *
 * Container summaries are bounded: object summaries retain at most 5 keys and
 * at most 200 characters of key-preview text in total. `truncated` is `true`
 * when either the key count or the key-preview text was shortened. `keyCount`
 * always reports the full key count. Array summaries retain only `length`.
 *
 * Scalar diagnostics are intentionally not bounded by that preview budget:
 * scalar `string`/`number`/`boolean`/`null` values, plus `orient`, `path`,
 * `row`, `column`, `option`, `key`, and `labels` fields, can still be
 * input-sized. Summaries are frozen, never retain caller containers, and never
 * invoke user `toJSON` hooks. Counting keys uses `Object.keys()`, which visits
 * every own key, so construction is not constant-space even though the retained
 * preview is bounded.
 */
export type JsonFrameDiagnosticValue =
  | string
  | number
  | boolean
  | null
  | Readonly<{
      readonly kind: 'array';
      readonly length: number;
    }>
  | Readonly<{
      readonly kind: 'object';
      readonly keyCount: number;
      readonly keys: readonly string[];
      readonly truncated: boolean;
    }>
  | Readonly<{
      readonly kind: 'undefined' | 'symbol' | 'bigint' | 'function';
    }>;

const freezeCopy = <T>(values: readonly T[]): readonly T[] => Object.freeze([...values]);

const summarizeDiagnosticValue = (value: unknown): JsonFrameDiagnosticValue => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return Object.freeze({ kind: 'array', length: value.length });
  }

  if (typeof value === 'object') {
    // Object.keys collects every own key to report an accurate keyCount, so
    // this pass is proportional to the input key count; only the retained
    // preview below is bounded. Object.keys does not invoke toJSON hooks.
    const keys = Object.keys(value as object);
    const head = keys.slice(0, JSON_FRAME_DIAGNOSTIC_KEY_LIMIT);
    const preview: string[] = [];
    let remaining = JSON_FRAME_DIAGNOSTIC_KEY_TEXT_BUDGET;
    let textTruncated = false;
    for (const key of head) {
      if (key.length <= remaining) {
        preview.push(key);
        remaining -= key.length;
      } else {
        if (remaining > 0) {
          preview.push(key.slice(0, remaining));
        }
        textTruncated = true;
        break;
      }
    }
    return Object.freeze({
      kind: 'object',
      keyCount: keys.length,
      keys: freezeCopy(preview),
      truncated: keys.length > JSON_FRAME_DIAGNOSTIC_KEY_LIMIT || textTruncated,
    });
  }

  if (typeof value === 'undefined') {
    return Object.freeze({ kind: 'undefined' });
  }

  if (typeof value === 'symbol') {
    return Object.freeze({ kind: 'symbol' });
  }

  if (typeof value === 'bigint') {
    return Object.freeze({ kind: 'bigint' });
  }

  if (typeof value === 'function') {
    return Object.freeze({ kind: 'function' });
  }

  return Object.freeze({ kind: 'object', keyCount: 0, keys: freezeCopy([]), truncated: false });
};

/** Base class for all structured `@web-ts-toolkit/json-frame` runtime failures. */
export class JsonFrameError extends Error {
  readonly orient?: Orient;
  readonly path?: string;
  readonly row?: number;
  readonly column?: string;
  readonly value?: JsonFrameDiagnosticValue;

  constructor(message: string, context: JsonFrameErrorContext = {}) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'JsonFrameError';
    this.orient = context.orient;
    this.path = context.path;
    this.row = context.row;
    this.column = context.column;
    if ('value' in context) {
      this.value = summarizeDiagnosticValue(context.value);
    }
  }
}

/** Raised when a JSON string cannot be parsed before orient validation begins. */
export class JsonFrameParseError extends JsonFrameError {
  readonly cause: SyntaxError;

  constructor(message: string, cause: SyntaxError) {
    super(message);
    this.name = 'JsonFrameParseError';
    this.cause = cause;
  }
}

/** Raised when caller-supplied options are invalid before payload traversal begins. */
export class JsonFrameOptionError extends JsonFrameError {
  readonly option: string;

  constructor(message: string, option: string, value: unknown) {
    super(message, { value });
    this.name = 'JsonFrameOptionError';
    this.option = option;
  }
}

/** Raised when an orient payload violates the documented JSON Frame contract. */
export class JsonFrameValidationError extends JsonFrameError {
  readonly orient?: ResolvedOrient;

  constructor(message: string, context: JsonFrameErrorContext & { readonly orient?: ResolvedOrient } = {}) {
    super(message, context);
    this.name = 'JsonFrameValidationError';
    this.orient = context.orient;
  }
}

/** Raised when `auto` detection cannot distinguish between multiple valid orients. */
export class AmbiguousOrientError extends JsonFrameError {
  readonly candidates: readonly ResolvedOrient[];

  constructor(message: string, candidates: readonly ResolvedOrient[]) {
    super(message);
    this.name = 'AmbiguousOrientError';
    this.candidates = freezeCopy(candidates);
  }
}

/** Raised when a pandas shape or feature is explicitly outside the initial release scope. */
export class UnsupportedFeatureError extends JsonFrameError {
  readonly feature: string;
  readonly orient?: ResolvedOrient;

  constructor(
    message: string,
    feature: string,
    context: JsonFrameErrorContext & { readonly orient?: ResolvedOrient } = {},
  ) {
    super(message, context);
    this.name = 'UnsupportedFeatureError';
    this.feature = feature;
    this.orient = context.orient;
  }
}

/** Raised when object-key exporters would collapse distinct index labels to the same JSON key. */
export class ExportKeyCollisionError extends JsonFrameError {
  readonly key: string;
  readonly labels: readonly (string | number)[];
  readonly orient: ResolvedOrient;

  constructor(message: string, orient: ResolvedOrient, key: string, labels: readonly (string | number)[]) {
    super(message, { orient });
    this.name = 'ExportKeyCollisionError';
    this.orient = orient;
    this.key = key;
    this.labels = freezeCopy(labels);
  }
}
