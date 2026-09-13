import { cloneDeep, forEach, get, hasOwn, isArray, isPlainObject, map, set } from '@web-ts-toolkit/utils';

/**
 * A depopulate copy operation consumed by {@link copyAndDepopulate}.
 */
export interface ProcessCopy {
  /**
   * Dotted source path on `docObject` whose populated value should be
   * relocated to {@link ProcessCopy.dest}. {@link copyAndDepopulate} walks
   * intermediate segments and, at the leaf, copies the original objects to
   * {@link ProcessCopy.dest} and replaces the leaf with the `idField`
   * value(s) of those objects.
   *
   * Examples:
   *   `src: 'items'`        -> depopulate `docObject.items`
   *   `src: 'pear.items'`   -> depopulate `docObject.pear.items`
   *
   * Empty strings are treated as safe no-ops. Unsafe segments
   * (`__proto__`, `prototype`, `constructor`) throw a descriptive `Error`.
   */
  src: string;
  /**
   * Dotted destination path on `docObject` where the moved objects will be
   * written. Unsafe segments (`__proto__`, `prototype`, `constructor`)
   * throw a descriptive `Error`. Empty and missing destinations are safe
   * no-ops.
   */
  dest: string;
}

/**
 * Options for {@link copyAndDepopulate}.
 */
export interface CopyAndDepopulateOptions {
  /**
   * When `true` (default), `docObject` is mutated in place and returned.
   * When `false`, a deep clone is produced via `cloneDeep` and the input is
   * left untouched. Both modes produce value-identical output; only object
   * identity differs.
   */
  mutable?: boolean;
  /**
   * Identifier field pulled from each relocated record to replace the
   * original populated value. Defaults to `'_id'`.
   *
   * For nested populated arrays, every leaf record must carry this field.
   * Records missing the id field throw a descriptive `Error`.
   * Primitive array members (non-record scalars) cannot be depopulated and
   * are left in place as a safe no-op.
   */
  idField?: string;
}

/**
 * A path copy operation consumed by {@link copyPaths} and the `COPY` task.
 * Reuses the same `{ src, dest }` shape as {@link ProcessCopy}.
 */
export type ProcessPathCopy = ProcessCopy;

/**
 * A path move operation consumed by {@link movePaths} and the `MOVE` task.
 * Reuses the same `{ src, dest }` shape as {@link ProcessCopy}.
 */
export type ProcessPathMove = ProcessCopy;

/**
 * A slice operation consumed by {@link sliceArrays} and the `SLICE` task.
 */
export interface ProcessSlice {
  /**
   * Dotted source path of the array to slice. Intermediate segments fan out
   * across arrays like {@link copyAndDepopulate}. Missing, null, or
   * non-array leaves are safe no-ops.
   */
  src: string;
  /**
   * Dotted destination path (relative to the leaf parent) where the sliced
   * window is written. When omitted, the slice is applied in place at `src`.
   * Empty-string destinations are safe no-ops.
   */
  dest?: string;
  /**
   * Number of leading array members to skip. Defaults to `0`. Must be a
   * non-negative safe integer when present.
   */
  skip?: number;
  /**
   * Maximum number of array members to keep from `skip`. When omitted, the
   * tail from `skip` to the end is kept. When present it is clamped to
   * `maxSlice` (default `1000`). Must be a non-negative safe integer.
   */
  limit?: number;
}

/**
 * A count operation consumed by {@link countPaths} and the `COUNT` task.
 */
export interface ProcessCount {
  /**
   * Dotted source path whose size is measured. Arrays measure length, plain
   * objects measure key count, present scalars count as `1`, and
   * null/undefined leaves count as `0`. Missing leaves are safe no-ops.
   */
  src: string;
  /**
   * Dotted destination path (relative to the leaf parent) where the numeric
   * count is written. Empty destinations are safe no-ops.
   */
  dest: string;
}

/**
 * A mask operation consumed by {@link maskPaths} and the `MASK` task.
 */
export interface ProcessMask {
  /**
   * Dotted source path to redact. Each resolved leaf present on its parent
   * is replaced with `replacement`. Missing leaves are safe no-ops.
   */
  src: string;
  /**
   * Replacement value written at `src`. Defaults to `'***'` when the key is
   * absent. An explicitly provided value (including `null`) is used as-is.
   */
  replacement?: unknown;
}

/**
 * Shared mutable/clone option for path processors.
 */
export interface ProcessorOptions {
  /**
   * When `true` (default), `docObject` is mutated in place and returned.
   * When `false`, a deep clone is produced via `cloneDeep` and the input is
   * left untouched.
   */
  mutable?: boolean;
}

/**
 * Options for {@link sliceArrays}.
 */
export interface SliceProcessorOptions extends ProcessorOptions {
  /**
   * Upper bound applied to a client-requested `limit`. Defaults to `1000`,
   * matching the `listHardLimit` default. Must be a non-negative safe
   * integer when present.
   */
  maxSlice?: number;
}

/**
 * Conservative default output for {@link copyAndDepopulate}.
 *
 * The exact transformed shape depends on runtime path strings, so the default
 * type intentionally does not claim that populated input leaves still have
 * their original object shape. Provide an explicit output type argument when
 * the operation set is known by the caller.
 */
export type CopyAndDepopulateOutput = Record<string, unknown>;

const UNSAFE_PATH_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const DEFAULT_MAX_SLICE = 1000;
const DEFAULT_MASK_REPLACEMENT = '***';

function failUnsafeSegment(path: string, fn = 'copyAndDepopulate'): never {
  throw new Error(
    `${fn}: refusing path '${path}' because it contains an unsafe segment (__proto__, prototype, or constructor).`,
  );
}

function failMissingId(path: string): never {
  throw new Error(`copyAndDepopulate: path '${path}' resolved to a record missing the configured id field.`);
}

function failInvalidSlice(value: unknown, field: string, fn: string): never {
  throw new Error(`${fn}: '${field}' must be a non-negative safe integer, received ${String(value)}.`);
}

function assertSafePath(path: string, fn = 'copyAndDepopulate'): void {
  // Reject the unsafe segments up front for both src and dest. The `set`
  // utility already rejects these on writes, but the source traversal and
  // the `__proto__` open-key assignment also need to be guarded explicitly
  // so no operation can mutate any object's prototype.
  const segs = path.split('.');
  for (const seg of segs) {
    if (seg.length === 0) continue;
    if (UNSAFE_PATH_KEYS.has(seg)) {
      failUnsafeSegment(path, fn);
    }
  }
}

function assertNonNegativeSafeInteger(value: unknown, field: string, fn: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    failInvalidSlice(value, field, fn);
  }
}

function resolveLeafParents(
  obj: Record<string, unknown>,
  src: string,
): Array<{ parent: Record<string, unknown>; leaf: string }> {
  const segs = src.split('.');
  let targets: unknown[] = [obj];
  for (let ind = 0; ind < segs.length - 1; ind += 1) {
    const seg = segs[ind];
    targets = targets.reduce<unknown[]>((ret, target) => {
      if (!isPlainObject(target)) return ret;
      const targetObject = target as Record<string, unknown>;
      const next = targetObject[seg];
      if (isArray(next)) {
        for (const item of next) {
          ret.push(item);
        }
      } else if (next !== null && next !== undefined) ret.push(next);
      return ret;
    }, []);
  }
  const leaf = segs[segs.length - 1];
  const pairs: Array<{ parent: Record<string, unknown>; leaf: string }> = [];
  forEach(targets, (target) => {
    if (!isPlainObject(target)) return;
    pairs.push({ parent: target as Record<string, unknown>, leaf });
  });
  return pairs;
}

/**
 * Hardened processor that relocates populated documents to a destination
 * path and replaces the original location with their proposed
 * "depopulated" form: a single id for plain-object values, or an array of
 * ids for populated arrays.
 *
 * Key semantics:
 * - Operations run sequentially in the order supplied. Each operation
 *   sees the state produced by the previous one. Two operations that
 *   reference the same `src` therefore intentionally chain - the second
 *   operation will find the id value/type left by the first and treat it
 *   as a safe no-op if it can no longer be depopulated (e.g. it is now an
 *   array of primitive ids rather than records).
 * - Missing, null, or scalar intermediate segments in `src` are safe
 *   no-ops: nothing is copied, nothing is replaced, and no error is
 *   thrown. The object identity of intermediates is unchanged.
 * - An array leaf whose members are all plain records is depopulated to
 *   an array of ids. Records missing the id field throw a descriptive
 *   error; primitive/scalar array members prevent depopulation and the
 *   leaf is left in place as a safe no-op.
 * - A plain-object leaf is depopulated to a single id value; a missing id
 *   field throws a descriptive error.
 * - `__proto__`, `prototype`, and `constructor` segments in either `src`
 *   or `dest` throw a descriptive error. No operation can mutate
 *   `Object.prototype` or any object's prototype.
 * - Empty `src` or `dest` strings are safe no-ops.
 *
 * @typeParam Output - Object shape produced by the depopulation. Defaults to a
 * conservative record because `src` and `dest` are runtime paths.
 *
 * @throws Error when an operation path contains `__proto__`, `prototype`, or
 * `constructor`, or when a populated record is missing the configured id field.
 */
export const copyAndDepopulate = <Output extends object = CopyAndDepopulateOutput>(
  docObject: object,
  operations: ProcessCopy[],
  options: CopyAndDepopulateOptions = { mutable: true, idField: '_id' },
): Output => {
  const mutable = options.mutable !== false;
  const idField = options.idField ?? '_id';
  const obj = (mutable ? docObject : cloneDeep(docObject)) as Record<string, unknown>;

  forEach(Array.isArray(operations) ? operations : [], (op: ProcessCopy) => {
    if (!op || typeof op.src !== 'string' || typeof op.dest !== 'string') return;

    const src = op.src;
    const dest = op.dest;
    if (src.length === 0 || dest.length === 0) return;
    assertSafePath(src);
    assertSafePath(dest);

    let targets: unknown[] = [obj];
    const segs = src.split('.');
    forEach(segs, (seg, ind) => {
      if (segs.length === ind + 1) {
        forEach(targets, (target) => {
          if (!isPlainObject(target)) return;
          const targetObject = target as Record<string, unknown>;
          const leaf = targetObject[seg];
          const sourceForDest = leaf;
          let depopulated: unknown;
          if (isArray(leaf)) {
            if (leaf.length === 0) {
              depopulated = [];
            } else if (leaf.every((item) => isPlainObject(item))) {
              depopulated = map(leaf as object[], idField).map((id, i) => {
                if (id === undefined) {
                  failMissingId(`${src}[${i}]`);
                }
                return id;
              });
            } else {
              // Mixed/primitive array members cannot be assigned an id; leave
              // the leaf in place (safe no-op for this target).
              return;
            }
          } else if (isPlainObject(leaf)) {
            const id = get(leaf as object, idField as string);
            if (id === undefined) {
              failMissingId(src);
            }
            depopulated = id;
          } else {
            // Scalar leaf (or null/undefined) - nothing to depopulate.
            return;
          }

          set(targetObject, dest, sourceForDest);
          set(targetObject, seg, depopulated);
        });
      } else {
        targets = targets.reduce<unknown[]>((ret, target) => {
          if (!isPlainObject(target)) return ret;
          const targetObject = target as Record<string, unknown>;
          const next = targetObject[seg];
          if (isArray(next)) {
            for (const item of next) {
              ret.push(item);
            }
          } else if (next !== null && next !== undefined) ret.push(next);
          return ret;
        }, []);
      }
    });
  });

  return obj as Output;
};

/**
 * Conservative default output for path processors.
 */
export type ProcessorOutput = Record<string, unknown>;

/**
 * Copy the value at `src` to `dest` without modifying `src`.
 *
 * Semantics mirror {@link copyAndDepopulate} traversal: intermediate segments
 * fan out across arrays, missing/null/scalar intermediates are safe no-ops,
 * and unsafe (`__proto__`, `prototype`, `constructor`) or empty paths are
 * handled the same way. The copied value is deep-cloned so later tasks in
 * the chain cannot alias `src` through `dest`. Copying a path onto itself
 * is a safe no-op.
 *
 * @throws Error when a path contains an unsafe segment.
 */
export const copyPaths = <Output extends object = ProcessorOutput>(
  docObject: object,
  operations: ProcessCopy[],
  options: ProcessorOptions = { mutable: true },
): Output => {
  const mutable = options.mutable !== false;
  const obj = (mutable ? docObject : cloneDeep(docObject)) as Record<string, unknown>;

  forEach(Array.isArray(operations) ? operations : [], (op: ProcessCopy) => {
    if (!op || typeof op.src !== 'string' || typeof op.dest !== 'string') return;
    const src = op.src;
    const dest = op.dest;
    if (src.length === 0 || dest.length === 0) return;
    assertSafePath(src, 'copyPaths');
    assertSafePath(dest, 'copyPaths');
    if (src === dest) return;

    forEach(resolveLeafParents(obj, src), ({ parent, leaf }) => {
      if (!hasOwn(parent, leaf)) return;
      set(parent, dest, cloneDeep(parent[leaf]));
    });
  });

  return obj as Output;
};

/**
 * Move the value at `src` to `dest` and delete `src`.
 *
 * Traversal and safety semantics match {@link copyPaths}. Moving a path onto
 * itself is a safe no-op. A `dest` nested under the moved leaf (for example
 * `src: 'a'`, `dest: 'a.b'`) copies without deleting `src` so the freshly
 * written destination is not removed.
 *
 * @throws Error when a path contains an unsafe segment.
 */
export const movePaths = <Output extends object = ProcessorOutput>(
  docObject: object,
  operations: ProcessCopy[],
  options: ProcessorOptions = { mutable: true },
): Output => {
  const mutable = options.mutable !== false;
  const obj = (mutable ? docObject : cloneDeep(docObject)) as Record<string, unknown>;

  forEach(Array.isArray(operations) ? operations : [], (op: ProcessCopy) => {
    if (!op || typeof op.src !== 'string' || typeof op.dest !== 'string') return;
    const src = op.src;
    const dest = op.dest;
    if (src.length === 0 || dest.length === 0) return;
    assertSafePath(src, 'movePaths');
    assertSafePath(dest, 'movePaths');
    if (src === dest) return;

    forEach(resolveLeafParents(obj, src), ({ parent, leaf }) => {
      if (!hasOwn(parent, leaf)) return;
      const value = cloneDeep(parent[leaf]);
      set(parent, dest, value);
      // The destination is resolved relative to the leaf parent, so compare
      // against the leaf key (not the full src) to detect self-nesting.
      if (dest === leaf || dest.startsWith(`${leaf}.`)) return;
      delete parent[leaf];
    });
  });

  return obj as Output;
};

/**
 * Slice the array at `src` to `[skip, skip + limit)` and write the window to
 * `dest` (default: in place at `src`).
 *
 * Missing, null, or non-array leaves are safe no-ops. `skip` defaults to `0`;
 * an omitted `limit` keeps the tail from `skip`. A present `limit` is clamped
 * to `maxSlice` (default `1000`) so client-requested windows stay bounded.
 *
 * @throws Error when a path contains an unsafe segment or when
 * `skip`/`limit`/`maxSlice` is not a non-negative safe integer.
 */
export const sliceArrays = <Output extends object = ProcessorOutput>(
  docObject: object,
  operations: ProcessSlice[],
  options: SliceProcessorOptions = { mutable: true, maxSlice: DEFAULT_MAX_SLICE },
): Output => {
  const mutable = options.mutable !== false;
  const maxSlice = options.maxSlice ?? DEFAULT_MAX_SLICE;
  assertNonNegativeSafeInteger(maxSlice, 'maxSlice', 'sliceArrays');
  const obj = (mutable ? docObject : cloneDeep(docObject)) as Record<string, unknown>;

  forEach(Array.isArray(operations) ? operations : [], (op: ProcessSlice) => {
    if (!op || typeof op.src !== 'string') return;
    const src = op.src;
    if (src.length === 0) return;
    assertSafePath(src, 'sliceArrays');

    const rawDest = typeof op.dest === 'undefined' ? undefined : op.dest;
    if (typeof rawDest !== 'undefined') {
      if (typeof rawDest !== 'string' || rawDest.length === 0) return;
      assertSafePath(rawDest, 'sliceArrays');
    }

    const skip = op.skip ?? 0;
    assertNonNegativeSafeInteger(skip, 'skip', 'sliceArrays');
    let limit: number | undefined;
    if (typeof op.limit !== 'undefined') {
      assertNonNegativeSafeInteger(op.limit, 'limit', 'sliceArrays');
      limit = Math.min(op.limit, maxSlice);
    }

    forEach(resolveLeafParents(obj, src), ({ parent, leaf }) => {
      const leafValue = parent[leaf];
      if (!isArray(leafValue)) return;
      const end = typeof limit === 'undefined' ? undefined : skip + limit;
      const window = leafValue.slice(skip, end);
      if (typeof rawDest === 'undefined') {
        set(parent, leaf, window);
      } else {
        set(parent, rawDest, window);
      }
    });
  });

  return obj as Output;
};

/**
 * Write the size of `src` to `dest`: array length, plain-object key count,
 * `0` for null/undefined leaves, and `1` for other present scalars.
 *
 * Missing leaves are safe no-ops (no destination is created).
 *
 * @throws Error when a path contains an unsafe segment.
 */
export const countPaths = <Output extends object = ProcessorOutput>(
  docObject: object,
  operations: ProcessCount[],
  options: ProcessorOptions = { mutable: true },
): Output => {
  const mutable = options.mutable !== false;
  const obj = (mutable ? docObject : cloneDeep(docObject)) as Record<string, unknown>;

  forEach(Array.isArray(operations) ? operations : [], (op: ProcessCount) => {
    if (!op || typeof op.src !== 'string' || typeof op.dest !== 'string') return;
    const src = op.src;
    const dest = op.dest;
    if (src.length === 0 || dest.length === 0) return;
    assertSafePath(src, 'countPaths');
    assertSafePath(dest, 'countPaths');

    forEach(resolveLeafParents(obj, src), ({ parent, leaf }) => {
      if (!hasOwn(parent, leaf)) return;
      const leafValue = parent[leaf];
      let count: number;
      if (isArray(leafValue)) {
        count = leafValue.length;
      } else if (isPlainObject(leafValue)) {
        count = Object.keys(leafValue).length;
      } else if (leafValue === null || typeof leafValue === 'undefined') {
        count = 0;
      } else {
        count = 1;
      }
      set(parent, dest, count);
    });
  });

  return obj as Output;
};

/**
 * Replace the value at `src` with `replacement` (default `'***'`).
 *
 * Only existing leaves are redacted; missing paths are safe no-ops and no
 * new keys are created. Intermediate segments fan out across arrays like
 * {@link copyAndDepopulate}.
 *
 * @throws Error when a path contains an unsafe segment.
 */
export const maskPaths = <Output extends object = ProcessorOutput>(
  docObject: object,
  operations: ProcessMask[],
  options: ProcessorOptions = { mutable: true },
): Output => {
  const mutable = options.mutable !== false;
  const obj = (mutable ? docObject : cloneDeep(docObject)) as Record<string, unknown>;

  forEach(Array.isArray(operations) ? operations : [], (op: ProcessMask) => {
    if (!op || typeof op.src !== 'string') return;
    const src = op.src;
    if (src.length === 0) return;
    assertSafePath(src, 'maskPaths');
    const replacement = Object.prototype.hasOwnProperty.call(op, 'replacement')
      ? (op as ProcessMask).replacement
      : DEFAULT_MASK_REPLACEMENT;

    forEach(resolveLeafParents(obj, src), ({ parent, leaf }) => {
      if (!hasOwn(parent, leaf)) return;
      set(parent, leaf, replacement);
    });
  });

  return obj as Output;
};
