/** Shared live/snapshot descriptor resolution. No registry access or dependency I/O. */
import { isFunction, isPlainObject } from '@web-ts-toolkit/utils';
import type { ModelVirtualPopulateDependency } from '../interfaces/router-hooks';

export interface ResolvedVirtualDescriptor {
  get: (...args: never[]) => unknown;
  dependsOn: string[];
  dependsOnPopulate?: ModelVirtualPopulateDependency[];
}

export const isVirtualContainerValue = (value: unknown): value is { sub: Record<string, unknown> } =>
  isPlainObject(value) && 'sub' in (value as Record<string, unknown>);

export function getScopeVirtualsObject(
  root: Record<string, unknown> | null | undefined,
  scopePath: readonly string[] = [],
): Record<string, unknown> | null {
  let current = root;
  for (let i = 0; i < scopePath.length; i += 2) {
    if (!current || scopePath[i + 1] !== 'sub') return null;
    const container = current[scopePath[i]];
    if (!isVirtualContainerValue(container)) return null;
    current = container.sub;
  }
  return isPlainObject(current) ? current : null;
}

function toDescriptor(leaf: unknown, shared: Record<string, unknown> = {}): ResolvedVirtualDescriptor | undefined {
  const record = isFunction(leaf) ? { get: leaf } : isPlainObject(leaf) ? (leaf as Record<string, unknown>) : null;
  if (!record || !isFunction(record.get)) return undefined;
  const dependsOn = (record.dependsOn ?? shared.dependsOn ?? []) as string[];
  const populated = (record.dependsOnPopulate === undefined ? shared.dependsOnPopulate : record.dependsOnPopulate) as
    | ModelVirtualPopulateDependency[]
    | undefined;
  return {
    get: record.get as (...args: never[]) => unknown,
    dependsOn: [...dependsOn],
    ...(populated === undefined
      ? {}
      : {
          dependsOnPopulate: populated.map(({ path, select }) => ({
            path,
            ...(select === undefined
              ? {}
              : { select: Array.isArray(select) ? [...select] : typeof select === 'object' ? { ...select } : select }),
          })),
        }),
  };
}

export function resolveSnapshotDescriptor(
  scopeVirtuals: Record<string, unknown> | null,
  virtualName: string,
  access: string,
): ResolvedVirtualDescriptor | undefined {
  const entry = scopeVirtuals?.[virtualName];
  if (entry === undefined || isVirtualContainerValue(entry)) return undefined;
  if (isFunction(entry)) return toDescriptor(entry);
  if (!isPlainObject(entry)) return undefined;
  const record = entry as Record<string, unknown>;
  if ('get' in record) return toDescriptor(record);
  return toDescriptor(record[access], record) ?? toDescriptor(record.default, record);
}
