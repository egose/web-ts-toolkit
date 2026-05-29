import '@web-ts-toolkit/access-router';

declare module '@web-ts-toolkit/access-router' {
  interface AccessRouterPermissionMap {
    authenticated?: boolean;
  }

  interface AccessRouterRequestExtensions {
    currentOrganizationIds?: string[];
    currentUserEmail?: string;
    currentUserId?: string;
    sessionToken?: string;
  }
}
