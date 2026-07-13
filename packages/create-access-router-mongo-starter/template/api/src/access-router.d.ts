import '@web-ts-toolkit/access-router';

declare module '@web-ts-toolkit/access-router' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AccessRouterPermissionMap {
    // Add app-specific permission keys here, e.g. `admin?: boolean;`
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AccessRouterRequestExtensions {
    // Add app-specific request fields attached by middleware, e.g. `currentUserId?: string;`
  }
}
