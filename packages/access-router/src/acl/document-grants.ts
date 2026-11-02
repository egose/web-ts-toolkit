/** The sole document-fact admission boundary. Never export from a public entrypoint. */
import { types } from 'node:util';
import type { DocumentGrants } from '../interfaces/access';
import type { SharedHookGate } from '../helpers/concurrency';
import { warn } from '../logger-helpers';
import { authorizationError, ServiceAuthorizationError } from './authorization-snapshot';

const protectedKeys = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '_doc',
  '$__',
  '__v',
  '_permissions',
  '_view',
  '_edit',
]);
const owned = new WeakSet<object>();
export const EMPTY_DOCUMENT_GRANTS: DocumentGrants = Object.freeze(Object.create(null));
owned.add(EMPTY_DOCUMENT_GRANTS);

/** Descriptor-only admission: no getters, proxy traps, native methods or coercion. */
export function normalizeDocumentGrants(value: unknown, metadataField = '_permissions'): DocumentGrants {
  if (typeof metadataField !== 'string') authorizationError('invalid document permission field');
  if (value === null || typeof value !== 'object' || types.isProxy(value))
    authorizationError('document grants must be a plain boolean record');
  if (owned.has(value)) {
    if (Object.hasOwn(value, metadataField)) authorizationError('protected document grant key');
    return value as DocumentGrants;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    authorizationError('document grants must be a plain boolean record');
  const keys = Reflect.ownKeys(value);
  if (keys.length + 1 > 20000) authorizationError('document grants exceed structural limits');
  const facts = Object.create(null) as Record<string, boolean>;
  for (const key of keys) {
    if (typeof key !== 'string' || protectedKeys.has(key) || key === metadataField)
      authorizationError('protected or symbol document grant key');
    const slot = Object.getOwnPropertyDescriptor(value, key)!;
    if (!slot.enumerable || !('value' in slot) || typeof slot.value !== 'boolean')
      authorizationError('document grants require enumerable literal boolean data properties');
    Object.defineProperty(facts, key, { value: slot.value, enumerable: true });
  }
  if (!keys.length) return EMPTY_DOCUMENT_GRANTS;
  Object.freeze(facts);
  owned.add(facts);
  return facts;
}

/** Explicit metadata utility only: `_view`/`_edit` are presentation, not facts.
 * The remaining DATA still goes through the single fact admission boundary.
 */
export function documentGrantsFromMetadata(value: unknown, metadataField?: string): DocumentGrants {
  if (value === null || typeof value !== 'object' || types.isProxy(value))
    return normalizeDocumentGrants(value, metadataField);
  const slots = Object.getOwnPropertyDescriptors(value);
  delete slots._view;
  delete slots._edit;
  return normalizeDocumentGrants(Object.create(Object.getPrototypeOf(value), slots), metadataField);
}

/** Box BEFORE the scheduler can assimilate sync maps/proxies or accessor `then`.
 * Only actual Promise results are awaited. Fulfilled-value validation intentionally
 * sits outside the application-error catch, so invalid facts cannot become success.
 */
export async function invokeDocumentPermissions(args: {
  invoke?: () => unknown;
  gate: SharedHookGate;
  metadataField?: string;
  modelName: string;
  access: string;
  operation?: string;
  /** Only for wrapping a library utility which already performs fact admission. */
  preserveControlledErrors?: boolean;
}): Promise<DocumentGrants> {
  if (!args.invoke) return EMPTY_DOCUMENT_GRANTS;
  let box: { value: unknown };
  try {
    box = await args.gate.run(() => {
      const value = args.invoke!();
      return types.isPromise(value)
        ? Promise.prototype.then.call(value, (result: unknown) => ({ value: result }))
        : { value };
    });
  } catch (error) {
    if (args.preserveControlledErrors && error instanceof ServiceAuthorizationError) throw error;
    // A malicious error/logger getter is application work too; it cannot alter
    // the fail-closed result. Do not inspect/stringify the application's exception.
    try {
      warn('docPermissions hook failed; applying empty document permissions', {
        modelName: args.modelName,
        access: args.access,
        operation: args.operation,
      });
    } catch {
      /* logging cannot change authority */
    }
    return EMPTY_DOCUMENT_GRANTS;
  }
  return normalizeDocumentGrants(box.value, args.metadataField);
}
