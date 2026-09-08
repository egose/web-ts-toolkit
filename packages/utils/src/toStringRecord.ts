import { defineOwnDataProperty } from './dictionary';
import isPlainObject from './isPlainObject';

/**
 * Stringifies own values of a plain object.
 *
 * UTILS-01 contract: keys are preserved as own data properties (including
 * `__proto__`, which plain assignment would drop for string values). The
 * result keeps the default `Object.prototype` prototype; the input is never
 * mutated.
 */

export default function toStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const result: Record<string, string> = {};
  const entries = Object.entries(value);

  for (let index = 0; index < entries.length; index++) {
    const [key, entryValue] = entries[index];
    defineOwnDataProperty(result as Record<string, unknown>, key, String(entryValue));
  }

  return entries.length > 0 ? result : undefined;
}
