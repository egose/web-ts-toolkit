/**
 * Read the value at `path`, returning `defaultValue` when unreachable.
 *
 * Supported path grammar (see `toPath` in `_internal.ts`): dot segments
 * (`'a.b'`), bare brackets (`'a[0]'`), quoted brackets (`'a["b.c"]'`), and
 * segment arrays (`['a', 'b']`). String segments keep literal identity
 * (`'01'` ≠ `'1'`); only canonical indices address array slots.
 *
 * Reads follow the prototype chain; use `hasOwn` when own-key presence
 * matters. A `null`/`undefined` intermediate or an `undefined` leaf yields
 * `defaultValue`, so an explicit `undefined` value is indistinguishable
 * from a missing path.
 */
import { getPath, PropertyPath } from './_internal';

export default function get<T = unknown>(object: unknown, path: PropertyPath, defaultValue?: T): T;
export default function get(object: unknown, path: PropertyPath, defaultValue?: unknown): unknown {
  return getPath(object, path, defaultValue);
}
