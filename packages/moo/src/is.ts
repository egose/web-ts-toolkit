import { Types } from 'mongoose';

const { ObjectId } = Types;

/**
 * Strict canonical-string policy: only 24-character lowercase hex strings
 * (`/^[0-9a-f]{24}$/`) pass. Uppercase hex, 12-byte strings, and any other
 * `ObjectId.isValid` inputs that would not round-trip through
 * `new ObjectId(value).toString()` are rejected.
 *
 * Only `mongoose.Types.ObjectId` instances from this package's `mongoose`
 * copy pass the instance branch. Structural impostors (plain objects with
 * `id`/`toHexString`/`toString`) and foreign BSON copies with a different
 * prototype are rejected via `instanceof` without invoking arbitrary
 * `toString`/`valueOf`/`toJSON` conversion. Any throwing accessor or proxy
 * trap encountered during the check resolves to `false`.
 */
const CANONICAL_OBJECT_ID_STRING = /^[0-9a-f]{24}$/;

/**
 * Type guard that returns `true` when `value` is a canonical MongoDB
 * ObjectId string or ObjectId instance.
 *
 * @example
 * if (isObjectId(req.params.id)) { doSomething(); }
 */
export function isObjectId(value: unknown): value is InstanceType<typeof ObjectId> | string {
  try {
    if (typeof value === 'string') {
      return CANONICAL_OBJECT_ID_STRING.test(value);
    }
    if (value instanceof ObjectId) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
