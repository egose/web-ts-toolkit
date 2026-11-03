/** Exact immutable diagnostic shell. No mutation-context spread or authority aliases. */
import type { DocumentGrants, ModelOutputContext } from '../interfaces/base';
import { EMPTY_DOCUMENT_GRANTS } from '../acl/document-grants';

function tokens(value: unknown): readonly string[] | undefined {
  const values = typeof value === 'string' ? value.trim().split(/\s+/).filter(Boolean) : value;
  return Array.isArray(values) && values.every((entry) => typeof entry === 'string')
    ? Object.freeze([...values])
    : undefined;
}

function queryDiagnostics(query: unknown): ModelOutputContext['resolvedQuery'] {
  if (!query || typeof query !== 'object') return undefined;
  const read = (key: string): unknown => {
    const slot = Object.getOwnPropertyDescriptor(query, key);
    return slot && 'value' in slot ? slot.value : undefined;
  };
  const select = tokens(read('select'));
  const population = read('populate');
  const populate = Array.isArray(population)
    ? Object.freeze(
        population.flatMap((entry) => {
          if (typeof entry === 'string') return [entry];
          if (!entry || typeof entry !== 'object') return [];
          const slot = Object.getOwnPropertyDescriptor(entry, 'path');
          return slot && 'value' in slot && typeof slot.value === 'string' ? [slot.value] : [];
        }),
      )
    : tokens(population);
  const rawSort = read('sort');
  const sort =
    rawSort && typeof rawSort === 'object' && !Array.isArray(rawSort)
      ? Object.freeze(
          Object.keys(rawSort).flatMap((key) => {
            const slot = Object.getOwnPropertyDescriptor(rawSort, key);
            return slot && 'value' in slot && (slot.value === 1 || slot.value === -1)
              ? [`${slot.value === -1 ? '-' : ''}${key}`]
              : [];
          }),
        )
      : tokens(rawSort);
  const numeric = (key: string) => {
    const value = read(key);
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  };
  return Object.freeze({
    ...(select ? { select } : {}),
    ...(populate ? { populate } : {}),
    ...(sort ? { sort } : {}),
    ...(numeric('skip') !== undefined ? { skip: numeric('skip') } : {}),
    ...(numeric('limit') !== undefined ? { limit: numeric('limit') } : {}),
  });
}

export function createModelOutputContext(input: {
  modelName: string;
  operation: string;
  scopePath?: readonly string[];
  virtualAccess: string;
  outputAccess: string;
  docPermissionsAccess: string;
  docPermissions?: DocumentGrants;
  resolvedQuery?: unknown;
}): ModelOutputContext {
  const resolvedQuery = queryDiagnostics(input.resolvedQuery);
  return Object.freeze({
    modelName: input.modelName,
    operation: input.operation,
    receivingModelName: input.modelName,
    scopePath: Object.freeze([...(input.scopePath ?? [])]),
    virtualAccess: input.virtualAccess,
    outputAccess: input.outputAccess,
    docPermissionsAccess: input.docPermissionsAccess,
    docPermissions: input.docPermissions ?? EMPTY_DOCUMENT_GRANTS,
    ...(resolvedQuery ? { resolvedQuery } : {}),
  });
}
