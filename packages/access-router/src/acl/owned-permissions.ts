/** Internal data ownership only; never actor identity, request binding or a decision cache. */
const ownedPermissions = new WeakSet<object>();

export function markOwnedPermission(value: object): void {
  ownedPermissions.add(value);
}

export function isOwnedPermission(value: object): boolean {
  return ownedPermissions.has(value);
}
