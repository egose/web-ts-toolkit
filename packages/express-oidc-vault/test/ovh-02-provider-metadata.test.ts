import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveOidcVaultConfig } from '../src/config';
import { OidcVaultHttpError } from '../src/errors';
import {
  __getProviderClientCacheSizesForTests,
  __resetProviderClientCachesForTests,
  resolveProviderMetadata,
} from '../src/provider-client';

const issuer = 'https://issuer.example.com';
const config = resolveOidcVaultConfig({ issuer, clientId: 'client_1' });
const discoveryDocument = {
  issuer,
  authorization_endpoint: `${issuer}/authorize`,
  token_endpoint: `${issuer}/token`,
  jwks_uri: `${issuer}/jwks`,
};
const optionalEndpoints = {
  userinfo_endpoint: `${issuer}/userinfo`,
  end_session_endpoint: `${issuer}/logout`,
};

afterEach(() => {
  __resetProviderClientCachesForTests();
  vi.unstubAllGlobals();
});

describe.each([
  { field: 'userinfo_endpoint', resolvedField: 'userInfoEndpoint' },
  { field: 'end_session_endpoint', resolvedField: 'endSessionEndpoint' },
] as const)('OVH-02 discovered optional endpoint: $field', ({ field, resolvedField }) => {
  it.each([
    { name: 'null', value: null },
    { name: 'array', value: [optionalEndpoints[field]] },
    { name: 'object', value: { url: optionalEndpoints[field] } },
    { name: 'number', value: 42 },
    { name: 'boolean', value: false },
    { name: 'empty string', value: '' },
    { name: 'whitespace', value: ' \t\n ' },
    { name: 'invalid URL', value: 'private-invalid-url' },
    { name: 'relative URL', value: '/optional' },
    { name: 'protocol-relative URL', value: '//issuer.example.com/optional' },
    { name: 'non-HTTP URL', value: 'ftp://issuer.example.com/optional' },
  ])('rejects $name and evicts failure so corrected metadata recovers', async ({ value }) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ ...discoveryDocument, ...optionalEndpoints, [field]: value }))
      .mockResolvedValueOnce(Response.json({ ...discoveryDocument, ...optionalEndpoints }));
    vi.stubGlobal('fetch', fetchMock);

    // Concurrent callers share the policy's failure, but must not retain it or
    // publish a success with a silently disabled optional capability.
    const attempts = await Promise.allSettled([resolveProviderMetadata(config), resolveProviderMetadata(config)]);
    for (const attempt of attempts) {
      expect(attempt.status).toBe('rejected');
      if (attempt.status === 'rejected') {
        expect(attempt.reason).toBeInstanceOf(OidcVaultHttpError);
        expect(attempt.reason).toMatchObject({ status: 502, code: 'OIDC_VAULT_DISCOVERY_INVALID' });
        expect(attempt.reason.clientMessage).toContain(field);
        expect(attempt.reason.clientMessage).not.toContain('private-invalid-url');
      }
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(__getProviderClientCacheSizesForTests().discovery).toBe(0);

    const recovered = await resolveProviderMetadata(config);
    expect(recovered).toMatchObject({
      userInfoEndpoint: optionalEndpoints.userinfo_endpoint,
      endSessionEndpoint: optionalEndpoints.end_session_endpoint,
    });
    // A corrected success is reusable across timeout policies as before.
    await expect(resolveProviderMetadata(config, { providerRequestTimeoutMs: 1000 })).resolves.toEqual(recovered);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('allows omission while retaining the other optional capability', async () => {
    const document: Record<string, unknown> = { ...discoveryDocument, ...optionalEndpoints };
    delete document[field];
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(document)));

    const metadata = await resolveProviderMetadata(config);
    expect(metadata[resolvedField]).toBeUndefined();
    const otherField = resolvedField === 'userInfoEndpoint' ? 'endSessionEndpoint' : 'userInfoEndpoint';
    expect(metadata[otherField]).toBe(
      resolvedField === 'userInfoEndpoint'
        ? optionalEndpoints.end_session_endpoint
        : optionalEndpoints.userinfo_endpoint,
    );
  });

  it.each(['http', 'https'])('accepts and normalizes a valid %s endpoint', async (protocol) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ ...discoveryDocument, [field]: `${protocol}://OPTIONAL.example.com` })),
    );
    await expect(resolveProviderMetadata(config)).resolves.toMatchObject({
      [resolvedField]: `${protocol}://optional.example.com/`,
    });
  });
});

it('OVH-02 issuer-only discovery succeeds when both optional capabilities are omitted', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(discoveryDocument));
  vi.stubGlobal('fetch', fetchMock);
  const metadata = await resolveProviderMetadata(config);
  expect(metadata).toMatchObject({ issuer, authorizationEndpoint: discoveryDocument.authorization_endpoint });
  expect(metadata.userInfoEndpoint).toBeUndefined();
  expect(metadata.endSessionEndpoint).toBeUndefined();
  await expect(resolveProviderMetadata(config)).resolves.toEqual(metadata);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('OVH-02 complete manual configuration uses both optional endpoints without discovery', async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  const manual = resolveOidcVaultConfig({
    issuer,
    clientId: 'client_1',
    authorizationEndpoint: discoveryDocument.authorization_endpoint,
    tokenEndpoint: discoveryDocument.token_endpoint,
    jwksUri: discoveryDocument.jwks_uri,
    userInfoEndpoint: optionalEndpoints.userinfo_endpoint,
    endSessionEndpoint: optionalEndpoints.end_session_endpoint,
  });
  await expect(resolveProviderMetadata(manual)).resolves.toMatchObject({
    userInfoEndpoint: optionalEndpoints.userinfo_endpoint,
    endSessionEndpoint: optionalEndpoints.end_session_endpoint,
  });
  expect(fetchMock).not.toHaveBeenCalled();
});
