/** One definition owns both its hook and private fetch inputs. No hook execution or I/O. */
import { types } from 'node:util';
import type {
  ModelDocPermissionsAccessRecord,
  ModelDocPermissionsDefinition,
  ModelDocPermissionsHook,
} from '../interfaces/router-hooks';
import { capturePersistedDependencies } from './persisted-dependencies';

export interface ResolvedDocumentPermissionsDefinition {
  readonly get: ModelDocPermissionsHook;
  readonly dependsOn: readonly string[];
}

interface DependencyScope {
  storedFields?: ReadonlySet<string>;
  virtualNames?: ReadonlySet<string>;
}

function dataRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || types.isProxy(value))
    throw new TypeError(`${label}: expected a function, { get, dependsOn? }, or per-access record`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${label}: definition must be a plain object`);
  const result: Record<string, unknown> = Object.create(null);
  const keys = Reflect.ownKeys(value);
  if (keys.length > 20000) throw new TypeError(`${label}: too many definition entries`);
  for (const key of keys) {
    if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key))
      throw new TypeError(`${label}: unsafe definition key`);
    const slot = Object.getOwnPropertyDescriptor(value, key)!;
    if (!slot.enumerable || !('value' in slot))
      throw new TypeError(`${label}: definition entries must be enumerable data properties`);
    Object.defineProperty(result, key, { value: slot.value, enumerable: true });
  }
  return result;
}

function captureLeaf(value: unknown, label: string, scope: DependencyScope): ModelDocPermissionsDefinition {
  if (typeof value === 'function') return value as ModelDocPermissionsHook;
  const record = dataRecord(value, label);
  if (typeof record.get !== 'function') throw new TypeError(`${label}: descriptor.get must be callable`);
  if (Object.keys(record).some((key) => key !== 'get' && key !== 'dependsOn'))
    throw new TypeError(`${label}: descriptor accepts only get/dependsOn; cannot mix per-access keys`);
  return Object.freeze({
    get: record.get as ModelDocPermissionsHook,
    dependsOn: capturePersistedDependencies(record.dependsOn, label, scope.storedFields, scope.virtualNames),
  });
}

/** Validate before option publication AND when capturing an independently mutable schema. */
export function captureDocumentPermissionsDefinition(
  value: unknown,
  scope: DependencyScope = {},
): ModelDocPermissionsDefinition | ModelDocPermissionsAccessRecord | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'function') return value as ModelDocPermissionsHook;
  const record = dataRecord(value, 'docPermissions');
  // Reserved descriptor members disambiguate leaves from arbitrary custom accesses.
  if (Object.hasOwn(record, 'get') || Object.hasOwn(record, 'dependsOn'))
    return captureLeaf(record, 'docPermissions', scope);
  const entries = Object.entries(record).map(([access, leaf]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(access))
      throw new TypeError(`docPermissions: unsafe or dotted access "${access}"`);
    return [access, leaf === undefined ? undefined : captureLeaf(leaf, `docPermissions.${access}`, scope)];
  });
  return Object.freeze(Object.fromEntries(entries)) as ModelDocPermissionsAccessRecord;
}

/** Exact → default, or a direct callable/descriptor. Never resolve a hook and inputs separately. */
export function resolveDocumentPermissionsDefinition(
  value: unknown,
  access: string,
): ResolvedDocumentPermissionsDefinition | undefined {
  const captured = captureDocumentPermissionsDefinition(value);
  const leaf =
    typeof captured === 'function' || (captured && Object.hasOwn(captured, 'get'))
      ? (captured as ModelDocPermissionsDefinition)
      : (Object.getOwnPropertyDescriptor(captured ?? {}, access)?.value ??
        Object.getOwnPropertyDescriptor(captured ?? {}, 'default')?.value);
  if (leaf === undefined) return undefined;
  return typeof leaf === 'function'
    ? Object.freeze({ get: leaf, dependsOn: Object.freeze([]) })
    : Object.freeze({ get: leaf.get, dependsOn: leaf.dependsOn ?? Object.freeze([]) });
}
