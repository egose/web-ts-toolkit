interface BooleanObject {
  [key: string]: boolean;
}

export interface AccessRouterPermissionMap {}

type AccessRouterPermissionProperties = {
  [K in keyof AccessRouterPermissionMap]: AccessRouterPermissionMap[K];
};

class Permission {
  $_permissions: BooleanObject;
  $_permissionKeys: string[];

  constructor(permissions: BooleanObject) {
    this.$_permissions = permissions;
    this.$_permissionKeys = Object.keys(permissions);

    for (let x = 0; x < this.$_permissionKeys.length; x++) {
      const key = this.$_permissionKeys[x];
      Object.defineProperty(this, key, {
        enumerable: true,
        get: function () {
          return this.has(key);
        },
      });
    }
  }

  prop(permission: string) {
    return this.$_permissions.hasOwnProperty(permission);
  }

  has(permission: string) {
    return this.$_permissions[permission] || false;
  }

  hasAny(permissions: string[]) {
    return permissions.some((permission) => {
      return this.has(permission);
    });
  }

  hasAll(permissions: string[]) {
    return permissions.every((permission) => {
      return this.has(permission);
    });
  }

  any(permissions: string[]) {
    return this.hasAny(permissions);
  }

  all(permissions: string[]) {
    return this.hasAll(permissions);
  }
}

export default Permission;
export interface Permissions extends Permission, AccessRouterPermissionProperties {
  [key: string]: any;
}

export type AccessRouterPermissions = Permissions;
