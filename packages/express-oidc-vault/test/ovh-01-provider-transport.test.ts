import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { OidcVaultHttpError, toErrorPayload } from '../src/errors';
import { createOidcVaultMiddleware } from '../src/index';
import {
  __resetProviderClientCachesForTests,
  fetchUserInfo,
  requestToken,
  resolveJwks,
  resolveProviderMetadata,
} from '../src/provider-client';

const issuer = 'https://issuer.example.com';
const config = { mode: 'discovery', issuer, clientId: 'client_1', scopes: 'openid' } as const;
const metadata = {
  issuer,
  authorizationEndpoint: `${issuer}/authorize`,
  tokenEndpoint: `${issuer}/token`,
  userInfoEndpoint: `${issuer}/userinfo`,
  jwksUri: `${issuer}/jwks`,
  clientId: 'client_1',
  scopes: 'openid',
};
const discoveryDocument = {
  issuer,
  authorization_endpoint: metadata.authorizationEndpoint,
  token_endpoint: metadata.tokenEndpoint,
  jwks_uri: metadata.jwksUri,
};
const options = { providerRequestTimeoutMs: 30 };
const endpoints = [
  {
    name: 'discovery',
    code: 'OIDC_VAULT_DISCOVERY_FAILED',
    bodyCode: 'OIDC_VAULT_DISCOVERY_INVALID',
    invoke: () => resolveProviderMetadata(config, options),
    success: discoveryDocument,
  },
  {
    name: 'token',
    code: 'OIDC_VAULT_TOKEN_REQUEST_FAILED',
    bodyCode: 'OIDC_VAULT_TOKEN_REQUEST_FAILED',
    invoke: () => requestToken(metadata, { grant_type: 'refresh_token', refresh_token: 'refresh_1' }, options),
    success: { token_type: 'Bearer', access_token: 'access_1' },
  },
  {
    name: 'UserInfo',
    code: 'OIDC_VAULT_USERINFO_FAILED',
    bodyCode: 'OIDC_VAULT_USERINFO_FAILED',
    invoke: () => fetchUserInfo(metadata, 'access_1', options),
    success: { sub: 'user_1' },
  },
  {
    name: 'JWKS',
    code: 'OIDC_VAULT_JWKS_FAILED',
    bodyCode: 'OIDC_VAULT_JWKS_FAILED',
    invoke: () => resolveJwks(metadata.jwksUri, options).reload(),
    success: { keys: [] },
  },
];

const unhandledRejections: unknown[] = [];
const onUnhandledRejection = (reason: unknown): void => {
  unhandledRejections.push(reason);
};

beforeAll(() => process.on('unhandledRejection', onUnhandledRejection));
afterAll(() => process.off('unhandledRejection', onUnhandledRejection));
afterEach(async () => {
  // Let late cleanup rejections reach the event loop before checking them.
  await new Promise((resolve) => setImmediate(resolve));
  expect(unhandledRejections).toEqual([]);
  __resetProviderClientCachesForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A separate watchdog makes hanging-cleanup regressions fail promptly. */
const withinBound = async <T>(operation: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Provider completion exceeded test bound.')), 750);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const cancellationModes = ['pending', 'rejecting', 'throwing'] as const;
const cancelImplementation = (mode: (typeof cancellationModes)[number]) => (): Promise<void> => {
  if (mode === 'pending') {
    return new Promise(() => {});
  }
  if (mode === 'throwing') {
    throw new Error('private synchronous cancellation failure');
  }
  // Reject on a later turn as well as exercising synchronous throws above.
  return new Promise((_resolve, reject) => {
    setImmediate(() => reject(new Error('private asynchronous cancellation failure')));
  });
};

// These deliberately uncooperative custom streams establish a completion
// contract, not a demonstrated native-undici remote cancellation exploit.
describe.each(cancellationModes)('OVH-01 %s cancellation', (mode) => {
  describe.each(endpoints)('$name body cleanup', (endpoint) => {
    it('does not wait for cancellation when the deadline has already elapsed at headers', async () => {
      const cancel = vi.fn(cancelImplementation(mode));
      const response = new Response(new ReadableStream<Uint8Array>({ cancel }));
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          // Simulate a custom fetch delivering headers after its signal aborted.
          await new Promise((resolve) => setTimeout(resolve, options.providerRequestTimeoutMs * 2));
          return response;
        }),
      );

      await expect(withinBound(endpoint.invoke())).rejects.toMatchObject(
        endpoint.name === 'JWKS'
          ? { code: 'ERR_JWKS_TIMEOUT' }
          : { status: 502, code: endpoint.bodyCode, message: 'OIDC provider request timed out.' },
      );
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(response.body?.locked).toBe(false);
    });

    it.each(['timeout', 'overflow'] as const)(
      'does not gate %s delivery and releases the read lock',
      async (failure) => {
        const cancel = vi.fn(cancelImplementation(mode));
        const response = new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              if (failure === 'overflow') {
                controller.enqueue(new Uint8Array(1024 * 1024 + 1));
              }
            },
            cancel,
          }),
        );
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => response),
        );

        const expected =
          endpoint.name === 'JWKS' && failure === 'timeout'
            ? { code: 'ERR_JWKS_TIMEOUT' }
            : {
                status: 502,
                code: endpoint.bodyCode,
                message:
                  failure === 'timeout' ? 'OIDC provider request timed out.' : 'OIDC provider response is too large.',
              };
        await expect(withinBound(endpoint.invoke())).rejects.toMatchObject(expected);
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(response.body?.locked).toBe(false);
      },
    );

    it('does not gate non-success response delivery', async () => {
      const cancel = vi.fn(cancelImplementation(mode));
      const response = new Response(new ReadableStream<Uint8Array>({ cancel }), { status: 503 });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response),
      );

      await expect(withinBound(endpoint.invoke())).rejects.toMatchObject(
        endpoint.name === 'JWKS'
          ? { code: 'ERR_JOSE_GENERIC', message: 'Expected 200 OK from the JSON Web Key Set HTTP response' }
          : { status: 502, code: endpoint.code, message: 'OIDC provider request timed out.' },
      );
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(response.body?.locked).toBe(false);
    });
  });

  it('does not gate truncated discovery error delivery', async () => {
    const cancel = vi.fn(cancelImplementation(mode));
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(1025));
        },
        cancel,
      }),
      { status: 503 },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );

    await expect(withinBound(resolveProviderMetadata(config, options))).rejects.toMatchObject({
      status: 502,
      code: 'OIDC_VAULT_DISCOVERY_FAILED',
      clientMessage: 'OIDC discovery failed.',
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(response.body?.locked).toBe(false);
  });

  it.each(endpoints.filter((endpoint) => endpoint.name !== 'JWKS'))(
    'does not gate $name success on response finalization',
    async (endpoint) => {
      const response = Response.json(endpoint.success);
      const cancel = vi.spyOn(response.body!, 'cancel').mockImplementation(cancelImplementation(mode));
      let signal: AbortSignal | null | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_input: unknown, init?: RequestInit) => {
          signal = init?.signal;
          return response;
        }),
      );

      await withinBound(endpoint.invoke());
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(response.body?.locked).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, options.providerRequestTimeoutMs * 2));
      expect(signal?.aborted).toBe(false);
    },
  );
});

describe.each(endpoints)('OVH-01 $name transport diagnostics', (endpoint) => {
  // JOSE rejects non-200 headers directly and never reads their body.
  const phases =
    endpoint.name === 'JWKS' ? ['before headers', 'success body'] : ['before headers', 'success body', 'error body'];
  it.each(phases)('sanitizes failures in %s and retains the exact private cause', async (phase) => {
    const diagnostic = Object.assign(new Error('private upstream credential in transport diagnostic'), {
      detail: 'private socket detail',
    });
    let response: Response | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (phase === 'before headers') throw diagnostic;
        response = new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"partial":'));
            },
            pull(controller) {
              controller.error(diagnostic);
            },
          }),
          { status: phase === 'error body' ? 503 : 200 },
        );
        return response;
      }),
    );

    const error: unknown = await withinBound(endpoint.invoke()).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(OidcVaultHttpError);
    expect(Object.getOwnPropertyDescriptor(error, 'cause')?.value).toBe(diagnostic);
    expect(Object.getOwnPropertyDescriptor(error, 'cause')?.enumerable).toBe(false);
    expect(toErrorPayload(error)).toEqual({
      status: 502,
      code: endpoint.code,
      message: 'OIDC provider request failed.',
    });
    expect(JSON.stringify(error)).not.toContain('private');
    if (response) expect(response.body?.locked).toBe(false);
  });
});

it('OVH-01 evicts failed discovery transport entries so corrected metadata can recover', async () => {
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new Error('connection reset'))
    .mockResolvedValueOnce(Response.json(discoveryDocument));
  vi.stubGlobal('fetch', fetchMock);

  await expect(resolveProviderMetadata(config, options)).rejects.toMatchObject({ code: 'OIDC_VAULT_DISCOVERY_FAILED' });
  await expect(resolveProviderMetadata(config, options)).resolves.toMatchObject({ issuer });
  await resolveProviderMetadata(config, options);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('OVH-01 exposes transport causes to onError while returning only sanitized HTTP fields', async () => {
  const diagnostic = new Error('private upstream transport detail');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(diagnostic));
  const onError = vi.fn();
  const app = express();
  app.use(
    createOidcVaultMiddleware({
      backendOrigin: 'https://api.example.com',
      config: { issuer, clientId: 'client_1' },
      storeProvider: createMemoryOidcVaultStore(),
      hooks: { onError },
    }),
  );

  const response = await request(app).get('/auth/oidc/login');
  expect(response.status).toBe(502);
  expect(response.body).toEqual({ code: 'OIDC_VAULT_DISCOVERY_FAILED', message: 'OIDC provider request failed.' });
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError.mock.calls[0]?.[0].error.cause).toBe(diagnostic);
  expect(response.text).not.toContain('private');
});
