import { cloneDeep, forEach, get, isArray, isPlainObject, map, set } from '@web-ts-toolkit/utils';

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
 * Conservative default output for {@link copyAndDepopulate}.
 *
 * The exact transformed shape depends on runtime path strings, so the default
 * type intentionally does not claim that populated input leaves still have
 * their original object shape. Provide an explicit output type argument when
 * the operation set is known by the caller.
 */
export type CopyAndDepopulateOutput = Record<string, unknown>;

const UNSAFE_PATH_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function failUnsafeSegment(path: string): never {
  throw new Error(
    `copyAndDepopulate: refusing path '${path}' because it contains an unsafe segment (__proto__, prototype, or constructor).`,
  );
}

function failMissingId(path: string): never {
  throw new Error(`copyAndDepopulate: path '${path}' resolved to a record missing the configured id field.`);
}

function assertSafePath(path: string): void {
  // Reject the unsafe segments up front for both src and dest. The `set`
  // utility already rejects these on writes, but the source traversal and
  // the `__proto__` open-key assignment also need to be guarded explicitly
  // so no operation can mutate any object's prototype.
  const segs = path.split('.');
  for (const seg of segs) {
    if (seg.length === 0) continue;
    if (UNSAFE_PATH_KEYS.has(seg)) {
      failUnsafeSegment(path);
    }
  }
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
          if (isArray(next)) ret.push(...next);
          else if (next !== null && next !== undefined) ret.push(next);
          return ret;
        }, []);
      }
    });
  });

  return obj as Output;
};
