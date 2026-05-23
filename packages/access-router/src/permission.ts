interface BooleanObject {
  [key: string]: boolean;
}

export interface AccessRouterPermissionMap {}

type AccessRouterPermissionKey = Extract<keyof AccessRouterPermissionMap, string>;
type PermissionName = AccessRouterPermissionKey | (string & {});

class Permission {
  private readonly permissions: BooleanObject;
  private readonly permissionKeys: string[];

  constructor(permissions: BooleanObject) {
    this.permissions = { ...permissions };
    this.permissionKeys = Object.keys(this.permissions);
  }

  get keys(): readonly string[] {
    return this.permissionKeys;
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
    return Object.prototype.hasOwnProperty.call(this.permissions, permission);
  }

  has(permission: PermissionName) {
    return this.permissions[permission] === true;
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
