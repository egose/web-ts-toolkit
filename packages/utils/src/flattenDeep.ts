/**
 * Recursively flatten nested arrays into a single flat array.
 *
 * Iterative implementation: uses an explicit frame stack instead of call-stack
 * recursion and pushes leaves one at a time instead of spreading whole child
 * results into `push`, so wide (many-leaf) and deeply nested inputs do not
 * throw `RangeError`. Left-to-right ordering is preserved.
 *
 * Leaf behavior: any non-array value (including `undefined`, holes read as
 * `undefined`, objects, and functions) is appended as-is. A non-array input
 * returns `[]`. There are no size limits.
 *
 * Cycle policy: an array that contains itself, directly or transitively
 * through its current ancestor chain, throws a `TypeError`. Legitimate
 * repeated (shared but non-ancestor) subarrays are flattened once per
 * occurrence, so `const sub = [1]; flattenDeep([sub, sub])` is `[1, 1]`.
 *
 * @param array The value to flatten; non-array inputs yield `[]`.
 * @returns A new flat array of the leaf values, in left-to-right order.
 * @throws {TypeError} When a cyclic array reference is detected.
 *
 * UTILS-09 typing note: `T` is an unchecked caller assertion, not an
 * inferred or validated leaf type — the function cannot verify element
 * types at runtime. Specify it explicitly for typed leaves (e.g.
 * `flattenDeep<number>(input)`) or narrow the default `unknown[]`
 * yourself. A fully inferred recursive `FlatArray`-style result type is
 * deliberately deferred: it would need an arbitrary depth cap and could
 * not stay sound for non-array inputs (which yield `[]`).
 */
export default function flattenDeep<T = unknown>(array: unknown): T[] {
  if (!Array.isArray(array)) {
    return [];
  }

  const result: T[] = [];
  // Explicit frame stack; each frame tracks the array being scanned and the
  // next index to visit. `ancestors` holds exactly the arrays on the stack
  // so only genuine cycles (not repeated siblings) are rejected.
  const stack: Array<{ values: unknown[]; index: number }> = [{ values: array, index: 0 }];
  const ancestors = new Set<unknown[]>([array]);

  while (stack.length > 0) {
    const frame = stack[stack.length - 1] as {
      values: unknown[];
      index: number;
    };
    if (frame.index >= frame.values.length) {
      stack.pop();
      ancestors.delete(frame.values);
      continue;
    }
    const value = frame.values[frame.index];
    frame.index += 1;
    if (Array.isArray(value)) {
      if (ancestors.has(value)) {
        throw new TypeError('flattenDeep: cyclic array reference is not supported');
      }
      ancestors.add(value);
      stack.push({ values: value, index: 0 });
    } else {
      result.push(value as T);
    }
  }

  return result;
}
