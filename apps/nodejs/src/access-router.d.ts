import '@web-ts-toolkit/access-router';

declare module '@web-ts-toolkit/access-router' {
  interface AccessRouterPermissionMap {
    isAdmin?: boolean;
  }

  interface AccessRouterRequestExtensions {
    requestId?: string;
  }
}
