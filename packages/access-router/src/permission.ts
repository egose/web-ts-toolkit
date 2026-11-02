import { hasOwn } from '@web-ts-toolkit/utils';
import { markOwnedPermission } from './acl/owned-permissions';

interface BooleanObject {
  [key: string]: boolean;
}

export interface AccessRouterPermissionMap {}

type AccessRouterPermissionKey = Extract<keyof AccessRouterPermissionMap, string>;
type PermissionName = AccessRouterPermissionKey | (string & {});

class Permission {
  readonly #permissions: Readonly<BooleanObject>;
  readonly #permissionKeys: readonly string[];

  constructor(permissions: BooleanObject) {
    const owned = Object.create(null) as BooleanObject;
    for (const key of Object.keys(permissions)) {
      Object.defineProperty(owned, key, { value: permissions[key] === true, enumerable: true });
    }
    this.#permissions = Object.freeze(owned);
    this.#permissionKeys = Object.freeze(Object.keys(owned));
    Object.freeze(this);
    // instanceof/freeze would also admit subclasses with live overridden reads.
    // Only exact instances own exclusively private boolean data and frozen keys.
    if (new.target === Permission) markOwnedPermission(this);
  }

  get keys(): readonly string[] {
    return this.#permissionKeys;
  }

  private normalizePermissionArgs(
    permissionOrPermissions: PermissionName | readonly PermissionName[],
    permissions: readonly PermissionName[],
  ) {
    if (Array.isArray(permissionOrPermissions)) {
      return permissionOrPermissions;
    }

    return [permissionOrPermissions].concat(permissions);
  }

  hasKey(permission: PermissionName) {
    return hasOwn(this.#permissions, permission);
  }

  has(permission: PermissionName) {
    return this.#permissions[permission] === true;
  }

  hasAny(permissionOrPermissions: PermissionName | readonly PermissionName[], ...permissions: PermissionName[]) {
    return this.normalizePermissionArgs(permissionOrPermissions, permissions).some((permission) => {
      return this.has(permission);
    });
  }

  hasAll(permissionOrPermissions: PermissionName | readonly PermissionName[], ...permissions: PermissionName[]) {
    return this.normalizePermissionArgs(permissionOrPermissions, permissions).every((permission) => {
      return this.has(permission);
    });
  }
}

export default Permission;
export type Permissions = Permission;
export type AccessRouterPermissions = Permission;
