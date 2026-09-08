import { defineOwnDataProperty } from './dictionary';

/**
 * Converts an array of strings to a lookup record.
 *
 * UTILS-01 contract: every entry becomes an own data property, including
 * `__proto__` (which plain assignment would drop by attempting a prototype
 * set). The result keeps the default `Object.prototype` prototype.
 */
export default function arrayToRecord(arr: string[]): Record<string, true> {
  const obj: Record<string, true> = {};

  for (let x = 0; x < arr.length; x++) {
    defineOwnDataProperty(obj as Record<string, unknown>, arr[x], true);
  }

  return obj;
}
