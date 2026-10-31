import { get } from '@web-ts-toolkit/utils';

// Only package-generated aliases are transferable. Never inspect raw document virtuals.
const aliases = new WeakMap<object, string>();

/** Root admission can ignore ONLY a known package alias, without evaluating a path/getter. */
export function isGeneratedPermissionsAliasSlot(output: object, key: string, slot: PropertyDescriptor): boolean {
  return key === 'permissions' && aliases.has(output) && 'value' in slot && !slot.enumerable;
}

export function attachPermissionsAlias(output: Record<string, unknown>, field: string): void {
  if ('permissions' in output) return;
  const metadata = get(output, field);
  if (metadata === undefined) return;
  Object.defineProperty(output, 'permissions', {
    value: metadata,
    enumerable: false,
    writable: true,
    configurable: true,
  });
  aliases.set(output, field);
}

export function removeGeneratedPermissionsAlias(output: Record<string, unknown>): void {
  const field = aliases.get(output);
  if (field && Object.getOwnPropertyDescriptor(output, 'permissions')?.value === get(output, field)) {
    delete output.permissions;
  }
  aliases.delete(output);
}

/** Recreate from the copy's serialized metadata, never from the source's grant value. */
export function copyPermissionsAlias<T>(source: unknown, target: T): T {
  if (source && typeof source === 'object' && target && typeof target === 'object') {
    const field = aliases.get(source);
    if (field && Object.getOwnPropertyDescriptor(source, 'permissions')?.value === get(source, field))
      attachPermissionsAlias(target as Record<string, unknown>, field);
  }
  return target;
}

/** Package-owned presentation copies can also contain already-finalized related rows. */
export function copyPermissionsAliasGraph(source: unknown, target: unknown, seen = new WeakSet<object>()): void {
  if (!source || !target || typeof source !== 'object' || typeof target !== 'object' || seen.has(target)) return;
  seen.add(target);
  copyPermissionsAlias(source, target);
  for (const key of Object.keys(target)) {
    copyPermissionsAliasGraph((source as Record<string, unknown>)[key], (target as Record<string, unknown>)[key], seen);
  }
}
