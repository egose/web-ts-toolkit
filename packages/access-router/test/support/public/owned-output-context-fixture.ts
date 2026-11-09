import { expect } from 'vitest';
import type { ModelOutputContext } from '../../../dist/index.mjs';

/** Assert diagnostic DATA, not a raw source alias or a reusable output capability. */
export function expectOutputContext(context: ModelOutputContext, expected: Partial<ModelOutputContext> = {}) {
  expect(context).toMatchObject(expected);
  expect(Object.isFrozen(context)).toBe(true);
  expect(Object.isFrozen(context.scopePath)).toBe(true);
  expect(Object.isFrozen(context.docPermissions)).toBe(true);
  expect(Object.values(context.docPermissions).every((value) => typeof value === 'boolean')).toBe(true);
  const allowed = new Set([
    'modelName',
    'operation',
    'receivingModelName',
    'scopePath',
    'virtualAccess',
    'outputAccess',
    'docPermissionsAccess',
    'docPermissions',
    'resolvedQuery',
  ]);
  expect(Object.keys(context).every((key) => allowed.has(key))).toBe(true);
  expect(Object.getOwnPropertySymbols(context)).toEqual([]);
  for (const key of [
    'mongooseModel',
    'originalDocumentSnapshot',
    'finalDocumentSnapshot',
    'currentDocument',
    'originalData',
    'allowedData',
    'preparedData',
    'allowedFields',
    'modifiedPaths',
    'changes',
    'fieldPermissionAccess',
    'diff',
    'documentAuthorization',
    'getDocumentAuthorization',
  ])
    expect(context).not.toHaveProperty(key);
  if (context.resolvedQuery) {
    expect(Object.isFrozen(context.resolvedQuery)).toBe(true);
    expect(context.resolvedQuery).not.toHaveProperty('filter');
    for (const value of Object.values(context.resolvedQuery))
      if (Array.isArray(value)) expect(Object.isFrozen(value)).toBe(true);
  }
}
