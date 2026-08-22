import { describe, expect, it, vi } from 'vitest';

import { createManagedKeycloakClient } from '../dist/plugins/keycloak-user-sync.mjs';

describe('createManagedKeycloakClient', () => {
  it('authenticates lazily and reuses a valid token', async () => {
    const client = createManagedKeycloakClient({
      baseUrl: 'https://keycloak.example.com',
      clientId: 'user-sync',
      clientSecret: 'secret', // pragma: allowlist secret
    });
    const auth = vi.spyOn(client, 'simpleAuth').mockImplementation(async () => {
      client.core.accessToken = 'access-token';
    });
    vi.spyOn(client.core, 'isTokenExpired').mockReturnValue(false);

    await expect(client.core.getAccessToken()).resolves.toBe('access-token');
    await expect(client.core.getAccessToken()).resolves.toBe('access-token');

    expect(auth).toHaveBeenCalledOnce();
    expect(auth).toHaveBeenCalledWith({ clientId: 'user-sync', clientSecret: 'secret' }); // pragma: allowlist secret
  });

  it('shares one authentication attempt across concurrent requests', async () => {
    const client = createManagedKeycloakClient({
      baseUrl: 'https://keycloak.example.com',
      authRealm: 'administration',
      clientId: 'user-sync',
      clientSecret: 'secret', // pragma: allowlist secret
    });
    let finishAuthentication!: () => void;
    const blocked = new Promise<void>((resolve) => {
      finishAuthentication = resolve;
    });
    const auth = vi.spyOn(client, 'simpleAuth').mockImplementation(async () => {
      await blocked;
      client.core.accessToken = 'access-token';
    });

    const first = client.core.getAccessToken();
    const second = client.core.getAccessToken();
    await vi.waitFor(() => expect(auth).toHaveBeenCalledOnce());
    finishAuthentication();

    await expect(Promise.all([first, second])).resolves.toEqual(['access-token', 'access-token']);
    expect(client.core.realmName).toBe('administration');
  });

  it('resolves a rotated secret when an expired token requires authentication', async () => {
    const resolveSecret = vi.fn(async () => 'rotated-secret'); // pragma: allowlist secret
    const client = createManagedKeycloakClient({
      baseUrl: 'https://keycloak.example.com',
      clientId: 'user-sync',
      clientSecret: resolveSecret,
    });
    client.core.accessToken = 'expired-token';
    vi.spyOn(client.core, 'isTokenExpired').mockReturnValue(true);
    const auth = vi.spyOn(client, 'simpleAuth').mockImplementation(async () => {
      client.core.accessToken = 'fresh-token';
    });

    await expect(client.core.getAccessToken()).resolves.toBe('fresh-token');

    expect(resolveSecret).toHaveBeenCalledOnce();
    expect(auth).toHaveBeenCalledWith({ clientId: 'user-sync', clientSecret: 'rotated-secret' }); // pragma: allowlist secret
  });

  it('allows the next request to retry after authentication fails', async () => {
    const resolveSecret = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('secret store unavailable'))
      .mockResolvedValueOnce('secret'); // pragma: allowlist secret
    const client = createManagedKeycloakClient({
      baseUrl: 'https://keycloak.example.com',
      clientId: 'user-sync',
      clientSecret: resolveSecret,
    });
    vi.spyOn(client, 'simpleAuth').mockImplementation(async () => {
      client.core.accessToken = 'access-token';
    });

    await expect(client.core.getAccessToken()).rejects.toThrow('secret store unavailable');
    await expect(client.core.getAccessToken()).resolves.toBe('access-token');

    expect(resolveSecret).toHaveBeenCalledTimes(2);
  });

  it('validates service-account configuration when the client is created', () => {
    expect(() =>
      createManagedKeycloakClient({
        baseUrl: '',
        clientId: 'user-sync',
        clientSecret: 'secret', // pragma: allowlist secret
      }),
    ).toThrow('non-empty baseUrl');
    expect(
      () =>
        createManagedKeycloakClient({ baseUrl: 'https://keycloak.example.com', clientId: '', clientSecret: 'secret' }), // pragma: allowlist secret
    ).toThrow('non-empty clientId');
  });
});
