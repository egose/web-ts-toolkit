/** Server-only source admission controls. Retired names exist ONLY for migration rejection. */
import { types } from 'node:util';
import type { AuthorizationMode } from '../interfaces/root';

export const retiredAuthorizationOptions = [
  'unsafeSkipListDocumentSnapshotChecks',
  'unsafeSkipReadDocumentSnapshotChecks',
  'unsafeSkipListOutputSnapshotChecks',
  'unsafeSkipReadOutputSnapshotChecks',
  'unsafeSkipListNestedDocumentSnapshotChecks',
  'unsafeSkipReadNestedDocumentSnapshotChecks',
  'unsafeSkipListInitialOutputSnapshotCopy',
  'unsafeSkipReadInitialOutputSnapshotCopy',
  'unsafeUseListAuthorizationFastPath',
  'unsafeUseReadAuthorizationFastPath',
] as const;
export const authorizationModeKeys = ['readAuthorizationMode', 'listAuthorizationMode'] as const;
export const serverAuthorizationControls = [...retiredAuthorizationOptions, ...authorizationModeKeys] as const;

export function authorizationControlError(key: string): string {
  return (retiredAuthorizationOptions as readonly string[]).includes(key)
    ? `${key} was removed; migrate to readAuthorizationMode/listAuthorizationMode on server model/default-model options`
    : `${key} is server model/default-model configuration only`;
}

export function normalizeAuthorizationMode(value: unknown): AuthorizationMode | undefined {
  if (value === undefined) return undefined;
  if (value === 'isolated' || value === 'trusted') return value;
  throw new TypeError(
    'Authorization mode must be the literal isolated or trusted, or undefined to restore inheritance',
  );
}

export function assertAuthorizationModeKey(key: unknown, model: boolean): asserts key is string {
  if (typeof key !== 'string') throw new TypeError('Configuration option key must be a string');
  const root = key.split('.')[0];
  if ((retiredAuthorizationOptions as readonly string[]).includes(root))
    throw new TypeError(authorizationControlError(root));
  if ((authorizationModeKeys as readonly string[]).includes(root) && (!model || key !== root))
    throw new TypeError(
      !model ? authorizationControlError(root) : `${root} is a scalar mode; dotted setters are unsupported`,
    );
}

/** Inspect ordinary prototype chains without invoking proxy traps or application getters. */
export function admitControlPrototypes(value: object, reject: (detail: string) => never): readonly object[] {
  const owners: object[] = [];
  for (let owner: object | null = value; owner; owner = Object.getPrototypeOf(owner)) {
    if (types.isProxy(owner)) reject('Proxy control/configuration prototype is unsupported');
    if (owners.length > 100) reject('Control/configuration prototype depth exceeded');
    owners.push(owner);
  }
  return owners;
}

/** Keys only: inherited, non-enumerable and dotted control presence cannot disappear in a clone. */
export function controlPropertyKeys(owners: readonly object[], reject: (detail: string) => never): string[] {
  const keys = new Set<string>();
  for (const owner of owners) {
    for (const key of Reflect.ownKeys(owner)) {
      if (typeof key === 'string') keys.add(key);
      if (keys.size > 20000) reject('Control/configuration keys exceed structural limits');
    }
  }
  return [...keys];
}

/** Presence admission precedes option cloning, including inherited/non-enumerable legacy slots. */
export function assertAuthorizationModeOptions(value: unknown, model: boolean): void {
  const reject = (detail: string): never => {
    throw new TypeError(detail);
  };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Authorization configuration must be an options object');
  const owners = admitControlPrototypes(value, reject);
  for (const key of controlPropertyKeys(owners, reject)) {
    assertAuthorizationModeKey(key, model);
    if (!(authorizationModeKeys as readonly string[]).includes(key)) continue;
    const slot = Object.getOwnPropertyDescriptor(value, key);
    if (!slot || !('value' in slot) || !slot.enumerable)
      throw new TypeError(`${key} must be an own enumerable data option`);
    normalizeAuthorizationMode(slot.value);
  }
}
