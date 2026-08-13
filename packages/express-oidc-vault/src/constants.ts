import type { OidcVaultRouteName } from './types';

export const DEFAULT_OIDC_VAULT_BASE_PATH = '/auth/oidc';
export const DEFAULT_AUTHORIZATION_TRANSACTION_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_EXCHANGE_CODE_TTL_MS = 30 * 1000;
export const DEFAULT_SESSION_COOKIE_NAME = 'oidc_vault_session';
export const DEFAULT_OIDC_VAULT_REQUEST_BODY_LIMIT = '16kb';
export const OIDC_VAULT_URL_ENCODED_PARAMETER_LIMIT = 16;

export const OIDC_VAULT_ROUTE_PATHS: Record<OidcVaultRouteName, string> = {
  login: '/login',
  callback: '/callback',
  exchange: '/exchange',
  refresh: '/refresh',
  logout: '/logout',
  'backchannel-logout': '/backchannel-logout',
};
