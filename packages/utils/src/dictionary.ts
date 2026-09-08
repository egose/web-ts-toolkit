/**
 * UTILS-01 owned helper: consistent dictionary-result construction policy.
 *
 * Contract: dictionary builders (`groupBy`, `arrayToRecord`, `mapKeys`,
 * `mapValues`, `pickBy`, `omitBy`, `toStringRecord`) preserve arbitrary string
 * keys — including `__proto__`, `constructor`, `prototype`, and `toString` —
 * as own enumerable data properties. Results keep the default
 * `Object.prototype` prototype (no null-prototype objects); `__proto__` keys
 * never replace the result prototype. All writes use `defineOwnDataProperty`
 * and all group-bucket reads are guarded by `hasOwnDataProperty` so inherited
 * members are never mistaken for accumulated state. This file is intentionally
 * not re-exported from `index.ts` and does not touch `_internal.ts`
 * (owned by UTILS-02..05,08).
 */
export function defineOwnDataProperty(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

export function hasOwnDataProperty(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}
