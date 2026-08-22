import KeycloakAdminClientFluent from '@egose/keycloak-fluent';

export type ManagedKeycloakClientSecret = string | (() => string | Promise<string>);

export interface ManagedKeycloakClientOptions {
  /** Keycloak server URL. */
  baseUrl: string;
  /** Realm used to obtain the admin access token. Defaults to `master`. */
  authRealm?: string;
  /** Confidential Keycloak client with an enabled service account. */
  clientId: string;
  /** Client secret or a resolver used for secret rotation. */
  clientSecret: ManagedKeycloakClientSecret;
  /** Timeout in milliseconds for Keycloak requests, including authentication. */
  timeout?: number;
}

const requiredString = (value: unknown, name: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`createManagedKeycloakClient requires a non-empty ${name}`);
  }
  return value.trim();
};

/**
 * Creates a Keycloak Fluent client that authenticates lazily with `client_credentials`.
 *
 * Token acquisition is request-driven, so this client does not create timers and is safe
 * to reuse across warm serverless invocations. Concurrent token requests share one
 * authentication attempt. Applications with custom grants can continue to construct and
 * authenticate `KeycloakAdminClientFluent` directly.
 */
export function createManagedKeycloakClient(options: ManagedKeycloakClientOptions): KeycloakAdminClientFluent {
  if (!options) throw new Error('createManagedKeycloakClient requires options');
  const baseUrl = requiredString(options.baseUrl, 'baseUrl');
  const authRealm = options.authRealm === undefined ? 'master' : requiredString(options.authRealm, 'authRealm');
  const clientId = requiredString(options.clientId, 'clientId');
  if (typeof options.clientSecret !== 'string' && typeof options.clientSecret !== 'function') {
    throw new Error('createManagedKeycloakClient requires clientSecret to be a string or function');
  }
  if (typeof options.clientSecret === 'string' && !options.clientSecret) {
    throw new Error('createManagedKeycloakClient requires a non-empty clientSecret');
  }

  const clientSecret = options.clientSecret;
  const client = new KeycloakAdminClientFluent({ baseUrl, realmName: authRealm, timeout: options.timeout });
  let authentication: Promise<void> | undefined;

  const authenticate = () => {
    authentication ??= (async () => {
      const resolvedSecret = typeof clientSecret === 'function' ? await clientSecret() : clientSecret;
      if (typeof resolvedSecret !== 'string' || !resolvedSecret) {
        throw new Error('createManagedKeycloakClient clientSecret resolver returned an empty secret');
      }
      await client.simpleAuth({ clientId, clientSecret: resolvedSecret });
    })().finally(() => {
      authentication = undefined;
    });
    return authentication;
  };

  client.core.registerTokenProvider({
    async getAccessToken() {
      if (!client.core.accessToken || client.core.isTokenExpired()) await authenticate();
      return client.core.accessToken;
    },
  });

  return client;
}
