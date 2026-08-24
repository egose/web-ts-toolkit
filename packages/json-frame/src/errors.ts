import type { Orient, ResolvedOrient } from './types';

const DIAGNOSTIC_KEY_LIMIT = 5;

type JsonFrameErrorContext = {
  readonly orient?: Orient;
  readonly path?: string;
  readonly row?: number;
  readonly column?: string;
  readonly value?: unknown;
};

/** Bounded value stored on structured errors instead of caller-owned containers. */
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
    const keys = Object.keys(value as object);
    return Object.freeze({
      kind: 'object',
      keyCount: keys.length,
      keys: freezeCopy(keys.slice(0, DIAGNOSTIC_KEY_LIMIT)),
      truncated: keys.length > DIAGNOSTIC_KEY_LIMIT,
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
