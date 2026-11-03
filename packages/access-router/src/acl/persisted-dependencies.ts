/** Local persisted-input convention shared by virtuals and document permissions. */
import { types } from 'node:util';
import type { Schema } from 'mongoose';
import { isSafeOutputPath } from './field-catalog';

export function collectPersistedTopLevel(schema: Schema | null | undefined): Set<string> {
  return new Set([
    ...Object.keys(schema?.paths ?? {}).map((path) => path.split('.')[0]),
    ...Object.keys(schema?.obj ?? {}),
  ]);
}

/** Own dense string arrays only: never execute a dependency accessor/iterator. */
export function capturePersistedDependencies(
  value: unknown,
  label: string,
  storedFields?: ReadonlySet<string>,
  virtualNames: ReadonlySet<string> = new Set(),
): readonly string[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype)
    throw new TypeError(`${label}: dependsOn must be an array of top-level persisted field names`);
  const length = Object.getOwnPropertyDescriptor(value, 'length')!.value as number;
  if (length > 20000 || Reflect.ownKeys(value).length !== length + 1)
    throw new TypeError(`${label}: dependsOn must be a dense array of persisted field names`);
  const result: string[] = [];
  for (let index = 0; index < length; index++) {
    const slot = Object.getOwnPropertyDescriptor(value, String(index));
    if (!slot || !('value' in slot) || typeof slot.value !== 'string' || !slot.value)
      throw new TypeError(`${label}: dependsOn entries must be non-empty strings`);
    const dep = slot.value;
    if (dep.includes('.'))
      throw new TypeError(`${label}: dependsOn "${dep}" must be a top-level persisted name (dotted paths rejected)`);
    if (!isSafeOutputPath(dep)) throw new TypeError(`${label}: unsafe dependsOn field "${dep}"`);
    if (virtualNames.has(dep)) throw new TypeError(`${label}: dependsOn "${dep}" must not reference another virtual`);
    if (storedFields && !storedFields.has(dep))
      throw new TypeError(`${label}: dependsOn "${dep}" is not a persisted field in its scope`);
    result.push(dep);
  }
  return Object.freeze([...new Set(result)]);
}
