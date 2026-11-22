import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { channel } from 'node:diagnostics_channel';
import { once } from 'node:events';
import {
  Agent as HttpAgent,
  createServer,
  type ClientRequest,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { Agent as HttpsAgent, createServer as createTlsServer } from 'node:https';
import { createRequire } from 'node:module';
import type { Socket } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createS3AttachmentClient,
  createS3AttachmentStore,
  type S3AttachmentStoreOptions,
} from '../../src/attachments/s3';
import { MANAGED_BINDING, managedInput, resolveContext } from '../conformance/managed-attachment-fixture';
import { atBarrier, latch } from '../smtp/loopback';
import { createSmtpTlsFixture } from '../smtp/tls-fixture';
import { BOUNDARY, objectKey, PREFIX, RULE_ID } from './keys';

const DAY = 86_400_000;
const OPTIONS = { ...MANAGED_BINDING, bucket: 'private-deliveries', prefix: PREFIX } as const;
const REGION = 'eu-west-2';
const AWS_HOST = `${OPTIONS.bucket}.s3.${REGION}.amazonaws.com`;
const LOCAL = '127.0.0.1';
const CREDENTIALS = { accessKeyId: 'synthetic-fixture', secretAccessKey: 'synthetic-fixture' };
const NAMESPACE = 'xmlns="http://s3.amazonaws.com/doc/2006-03-01/"';
const POLICY = `<LifecycleConfiguration ${NAMESPACE}><Rule>
  <ID>${RULE_ID}</ID><Filter><Prefix>${BOUNDARY}</Prefix></Filter><Status>Enabled</Status>
  <Expiration><Days>32</Days></Expiration>
</Rule></LifecycleConfiguration>`;
const UNVERSIONED = `<VersioningConfiguration ${NAMESPACE}/>`;
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  try {
    for (const close of cleanup.splice(0).reverse()) await close();
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
});

type Wire = {
  statusCode: number;
  headers: Record<string, string>;
  body: Buffer;
  tail?: string[];
  stall?: 'before-headers' | 'after-headers';
};
type Call = {
  method: string;
  host: string;
  protocol: string;
  path: string;
  target: string;
  subresource: 'versioning' | 'lifecycle' | 'object';
  headers: Record<string, string>;
};

function reply(statusCode: number, data: string | Uint8Array = '', headers: Wire['headers'] = {}): Wire {
  const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
  return { statusCode, headers, body: bytes };
}

function serviceError(status: number, name: string, headers: Wire['headers'] = {}): Wire {
  return reply(status, `<Error><Code>${name}</Code><Message>redaction-fixture</Message></Error>`, headers);
}

async function awsFixture(
  retention?: S3AttachmentStoreOptions['retention'],
  addressing: 'loopback' | 'regional' | 'prefixed' = 'loopback',
) {
  const calls: Call[] = [];
  const errors: unknown[] = [];
  const objects = new Map<string, { headers: Wire['headers']; bytes: Buffer }>();
  const regional = addressing === 'regional';
  const tls = regional ? createSmtpTlsFixture(AWS_HOST) : undefined;
  if (tls) cleanup.push(tls.close);
  const endpointPath = addressing === 'prefixed' ? '/s3%20gateway/v1' : '';
  const bucketPath = regional ? '' : `${endpointPath}/${OPTIONS.bucket}`;
  const protocol = tls ? 'https:' : 'http:';
  const server = tls ? createTlsServer(tls.server) : createServer();
  server.listen(0, LOCAL);
  cleanup.push(
    () =>
      new Promise<void>((done) => {
        server.close(() => done());
        server.closeAllConnections();
      }),
  );
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a loopback port');
  const { port } = address;
  const host = regional ? AWS_HOST : `${LOCAL}:${port}`;
  const expectedSignature = new RegExp(
    `^AWS4-HMAC-SHA256 Credential=${CREDENTIALS.accessKeyId}/\\d{8}/${REGION}/s3/aws4_request, ` +
      'SignedHeaders=(?:[a-z0-9-]+;)*host(?:;[a-z0-9-]+)*, Signature=[a-f0-9]{64}$',
  );
  const fixture = {
    calls,
    host,
    bucketPath,
    anchor: Math.floor(Date.now() / 1_000) * 1_000,
    policy: POLICY,
    versioning: UNVERSIONED,
    rewrite: (call: Call, normal: () => Wire): Wire | Promise<Wire> => {
      void call;
      return normal();
    },
  };
  const receive = async (request: IncomingMessage, response: ServerResponse) => {
    const target = request.url ?? '';
    const url = new URL(target, `${protocol}//${host}`);
    const method = request.method ?? '';
    const subresource = url.searchParams.has('lifecycle')
      ? 'lifecycle'
      : url.searchParams.has('versioning')
        ? 'versioning'
        : 'object';
    expect(request.headers.host).toBe(host);
    expect(expectedSignature.test(request.headers.authorization ?? '')).toBe(true);
    if (subresource === 'object') {
      expect(target.startsWith(`${bucketPath}/${BOUNDARY}`)).toBe(true);
      expect(method === 'PUT' || method === 'GET').toBe(true);
    } else {
      expect(url.pathname).toBe(`${bucketPath}/`);
      expect(method).toBe('GET');
    }
    const bytes: Buffer[] = [];
    for await (const chunk of request) bytes.push(Buffer.from(chunk as Buffer));
    const headers = Object.fromEntries(
      Object.entries(request.headers).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' &&
          /^(?:x-amz-meta-.*|x-amz-checksum-.*|content-.*|if-none-match)$/.test(entry[0]),
      ),
    );
    const call = { method, host, protocol, path: url.pathname, target, subresource, headers } satisfies Call;
    calls.push(call);
    const normal = () => {
      if (call.subresource === 'lifecycle') return reply(200, fixture.policy);
      if (call.subresource === 'versioning') return reply(200, fixture.versioning);
      if (call.method === 'PUT') {
        if (objects.has(call.path)) return serviceError(412, 'PreconditionFailed');
        objects.set(call.path, { headers, bytes: Buffer.concat(bytes) });
        return reply(200);
      }
      const stored = objects.get(call.path);
      if (!stored) return serviceError(404, 'NoSuchKey');
      const { anchor } = fixture;
      return reply(200, stored.bytes, {
        ...stored.headers,
        'last-modified': new Date(anchor).toUTCString(),
        'x-amz-expiration': `expiry-date="${new Date(anchor + 32 * DAY).toUTCString()}", rule-id="${RULE_ID}"`,
      });
    };
    const result = await fixture.rewrite(call, normal);
    if (result.stall === 'before-headers') return;
    response.writeHead(result.statusCode, [...Object.entries(result.headers).flat(), ...(result.tail ?? [])]);
    if (result.stall === 'after-headers') response.flushHeaders();
    else response.end(result.body);
  };
  server.on('request', (request, response) => {
    void receive(request, response).catch((error: unknown) => {
      errors.push(error);
      response.destroy();
    });
  });
  // Change only the physical dial, below the SDK's signed Host and path. For the regional case the
  // real TLS handshake still checks the original AWS server name against a disposable local CA.
  const httpConnect = HttpAgent.prototype.createConnection;
  const tlsConnect = HttpsAgent.prototype.createConnection;
  vi.spyOn(HttpAgent.prototype, 'createConnection').mockImplementation(function (this: HttpAgent, options, done) {
    if (regional || options.host !== LOCAL || Number(options.port) !== port) {
      errors.push(new Error('Attempt to dial outside the local HTTP fixture'));
      throw new Error('Fixture connection blocked');
    }
    return httpConnect.call(this, options, done);
  });
  vi.spyOn(HttpsAgent.prototype, 'createConnection').mockImplementation(function (this: HttpsAgent, options, done) {
    if (!regional || options.host !== AWS_HOST || options.servername !== AWS_HOST || Number(options.port) !== 443) {
      errors.push(new Error('Attempt to dial outside the local TLS fixture'));
      throw new Error('Fixture connection blocked');
    }
    return tlsConnect.call(this, { ...options, host: LOCAL, port }, done);
  });
  const client = createS3AttachmentClient({
    region: REGION,
    credentials: CREDENTIALS,
    useFipsEndpoint: false,
    useDualstackEndpoint: false,
    ...(tls ? { ca: tls.ca } : { endpoint: `${protocol}//${host}${endpointPath}`, forcePathStyle: true }),
  });
  cleanup.push(() => {
    client.destroy();
    expect(errors).toEqual([]);
  });
  const options = retention ? { ...OPTIONS, retention } : OPTIONS;
  return { fixture, client, store: createS3AttachmentStore(client, options) };
}

function rewriteObjectHeader(
  fixture: Awaited<ReturnType<typeof awsFixture>>['fixture'],
  handler: (headers: Wire['headers']) => void,
) {
  fixture.rewrite = (call, normal) => {
    const result = normal();
    if (call.method === 'GET' && call.subresource === 'object') handler(result.headers);
    return result;
  };
}

function observeNativeRequests(host: string, onStart?: (request: ClientRequest) => void) {
  const started: ClientRequest[] = [];
  const closed: ClientRequest[] = [];
  const requests = channel('http.client.request.start');
  const observe = (message: unknown) => {
    const { request } = message as { request: ClientRequest };
    if (request.getHeader('host') !== host) return;
    started.push(request);
    request.once('close', () => closed.push(request));
    onStart?.(request);
  };
  requests.subscribe(observe);
  cleanup.push(() => {
    requests.unsubscribe(observe);
  });
  return { started, closed };
}

function closeGate() {
  const delayed: Array<() => void> = [];
  let released = false;
  const release = () => {
    released = true;
    for (const done of delayed.splice(0)) done();
  };
  cleanup.push(release);
  return {
    delayed,
    release,
    hold(close: () => void) {
      if (released) close();
      else delayed.push(close);
    },
  };
}

// More than the default 1,000 header pairs, but comfortably below the 16 KiB byte cap.
function lateHeaders(name: string, value: string): string[] {
  return [...Array.from({ length: 1_050 }, () => ['z', 'x']).flat(), name, value];
}

describe('AWS S3 path (real SDK and native loopback HTTP, no live AWS)', () => {
  it('uses the pinned dev SDK and defaults to regional HTTPS virtual-host addressing and header proof', async () => {
    const sdk = createRequire(import.meta.url)('@aws-sdk/client-s3/package.json') as { version: string };
    expect(sdk.version).toBe('3.1167.0');
    vi.stubEnv('AWS_ENDPOINT_URL_S3', 'https://configured-endpoint.invalid');
    const { fixture, store, client } = await awsFixture(undefined, 'regional');
    const stack = client.middlewareStack.identify();
    const input = managedInput(Date.now());
    expect(fixture.calls).toHaveLength(0);
    const receipt = await store.put(input);
    const path = `/${objectKey(input.scope, receipt.ref)}`;
    expect(
      fixture.calls.map(({ method, path, protocol, host, subresource }) => [method, path, protocol, host, subresource]),
    ).toEqual([
      ['PUT', path, 'https:', AWS_HOST, 'object'],
      ['GET', path, 'https:', AWS_HOST, 'object'],
    ]);
    expect(fixture.calls.map(({ target }) => target)).toEqual([`${path}?x-id=PutObject`, `${path}?x-id=GetObject`]);
    expect(await client.config.maxAttempts()).toBe(1);
    const { retryMode } = client.config;
    expect(typeof retryMode === 'function' ? await retryMode() : retryMode).toBe('standard');
    expect(client.config.followRegionRedirects).toBe(false);
    expect(client.config.expectContinueHeader).toBe(false);
    expect(fixture.calls[0]?.headers['if-none-match']).toBe('*');
    expect(fixture.calls[0]?.headers['x-amz-checksum-sha256']).toBe(
      createHash('sha256').update(input.bytes).digest('base64'),
    );
    expect(client.middlewareStack.identify()).toEqual(stack);
    expect(() => store.assertReceipt(receipt, input.scope, input.deliverBy)).not.toThrow();
    expect(await store.resolve(receipt.ref, resolveContext(input.scope))).toEqual({
      status: 'found',
      bytes: input.bytes,
    });
  });

  it('rejects untracked clients, untracked SDK commands and a swapped handler', async () => {
    const { fixture, client, store } = await awsFixture();
    const ordinary = new S3Client({
      region: REGION,
      credentials: CREDENTIALS,
      endpoint: `http://${fixture.host}`,
      forcePathStyle: true,
    });
    cleanup.push(() => ordinary.destroy());
    expect(() =>
      // @ts-expect-error An ordinary S3Client lacks the dedicated client brand.
      createS3AttachmentStore(ordinary, OPTIONS),
    ).toThrowError(expect.objectContaining({ code: 'invalid_config' }));
    await expect(client.send(new GetObjectCommand({ Bucket: OPTIONS.bucket, Key: 'untracked' }))).rejects.toThrow(
      'Untracked S3 attachment request',
    );
    const original = client.config.requestHandler;
    const bypass = { ...original, handle: vi.fn(original.handle) };
    client.config.requestHandler = bypass;
    try {
      expect(() => createS3AttachmentStore(client, OPTIONS)).toThrowError(
        expect.objectContaining({ code: 'invalid_config' }),
      );
      await expect(store.put(managedInput(Date.now()))).rejects.toMatchObject({ code: 'store_incompatible' });
      expect(bypass.handle).not.toHaveBeenCalled();
      expect(fixture.calls).toHaveLength(0);
    } finally {
      client.config.requestHandler = original;
    }
  });

  it.each([
    { endpoint: 'file:///invalid' },
    { endpoint: 'http://user:secret@localhost' },
    { endpoint: 'https://example.invalid/?versionId=unexpected' },
    { endpoint: 'https://example.invalid/#fragment' },
    { requestHandler: {} },
    { retryStrategy: {} },
    { maxAttempts: 2 },
    { followRegionRedirects: true },
    { ca: { untrusted: 'not a PEM certificate' } },
  ])('rejects incompatible client settings without side effects (case %#)', (fields) => {
    const attempt = () =>
      createS3AttachmentClient({ region: REGION, credentials: CREDENTIALS, ...fields } as Parameters<
        typeof createS3AttachmentClient
      >[0]);
    expect(attempt).toThrowError(expect.objectContaining({ code: 'invalid_config' }));
  });

  it.each([
    { bucket: 'https://s3.invalid/path' },
    { bucket: 'dotted.bucket' },
    { bucket: 'foo--usw2-az1--x-s3' },
    { prefix: 'invalid' },
    { prefix: 'invalid//nested/' },
    { prefix: '../escape/' },
    { retention: 'automatic' },
    { endpoint: 'https://s3.invalid/' },
  ])('rejects an invalid binding without SDK work (%j)', async (fields) => {
    const { fixture, client } = await awsFixture();
    expect(() => createS3AttachmentStore(client, { ...OPTIONS, ...fields } as S3AttachmentStoreOptions)).toThrowError(
      expect.objectContaining({ code: 'invalid_config' }),
    );
    expect(fixture.calls).toHaveLength(0);
  });

  it.each(['missing', 'wrong rule', 'too early', 'malformed', 'duplicate', 'bad age anchor'] as const)(
    'fails closed in default mode on %s retention evidence but does not prevent draining',
    async (fault) => {
      const { fixture, store } = await awsFixture();
      const input = managedInput(Date.now());
      const receipt = await store.put(input);
      const header = (expiry: number, rule = RULE_ID) =>
        `expiry-date="${new Date(expiry).toUTCString()}", rule-id="${rule}"`;
      rewriteObjectHeader(fixture, (headers) => {
        switch (fault) {
          case 'missing':
            delete headers['x-amz-expiration'];
            break;
          case 'wrong rule':
            headers['x-amz-expiration'] = header(fixture.anchor + 32 * DAY, 'other-rule');
            break;
          case 'too early':
            headers['x-amz-expiration'] = header(fixture.anchor + 32 * DAY - 1_000);
            break;
          case 'malformed':
            headers['x-amz-expiration'] = 'expiry-date="not-a-date"';
            break;
          case 'duplicate':
            headers['X-Amz-Expiration'] = header(fixture.anchor + 32 * DAY);
            break;
          case 'bad age anchor':
            headers['last-modified'] = 'not-a-date';
            break;
        }
      });
      fixture.calls.length = 0;
      await expect(store.put(input)).rejects.toMatchObject({ code: 'attachment_retention' });
      expect(fixture.calls.map(({ subresource, method }) => [subresource, method])).toEqual([
        ['object', 'PUT'],
        ['object', 'GET'],
      ]);
      expect(await store.resolve(receipt.ref, resolveContext(input.scope))).toMatchObject({ status: 'found' });
    },
  );

  it.each(['expiration-header', 'bucket-policy'] as const)(
    'applies the same 24 h hold and 121 s guard in %s mode without spending date rounding',
    async (mode) => {
      const { fixture, store } = await awsFixture(mode);
      fixture.anchor -= 7 * DAY;
      rewriteObjectHeader(fixture, (headers) => {
        if (mode === 'bucket-policy') delete headers['x-amz-expiration'];
        else
          headers['x-amz-expiration'] =
            `expiry-date="${new Date(fixture.anchor + 33 * DAY).toUTCString()}", rule-id="${RULE_ID}"`;
      });
      const input = managedInput(Date.now(), { deliverBy: fixture.anchor + 31 * DAY - 121_000 });
      await expect(store.put(input)).resolves.toHaveProperty('deliverBy', input.deliverBy);
      await expect(store.put({ ...input, deliverBy: input.deliverBy + 1 })).rejects.toMatchObject({
        code: 'attachment_retention',
      });
    },
  );

  it.each([
    POLICY.replace('<Days>32</Days>', '<Days>1</Days><Days>32</Days>'),
    POLICY.replace('</Rule>', '<UnknownAction/><Transition><Days>1</Days></Transition></Rule>'),
    POLICY.replace('</Filter>', '<Tag><Key>scope</Key><Value>all</Value></Tag></Filter>'),
    POLICY.replace('<Filter>', '<Filter xmlns="https://example.invalid/">'),
    POLICY.replace('</Expiration>', '<ExpiredObjectDeleteMarker>false</ExpiredObjectDeleteMarker></Expiration>'),
    POLICY.replace('<Filter>', `<Prefix>${BOUNDARY}</Prefix><Filter>`),
  ])('does not certify ambiguous or extra policy fields (fixture %#: %s)', async (policy) => {
    const { fixture, store } = await awsFixture('bucket-policy');
    fixture.policy = policy;
    await expect(store.put(managedInput(Date.now()))).rejects.toMatchObject({ code: 'attachment_retention' });
    expect(fixture.calls.map(({ subresource }) => subresource)).toEqual(['object', 'object', 'lifecycle']);
  });

  it.each([
    '',
    '<VersioningConfiguration><Unknown/></VersioningConfiguration>',
    '<VersioningConfiguration><MfaDelete>Disabled</MfaDelete></VersioningConfiguration>',
  ])('requires an unambiguous never-versioned response document (fixture %#)', async (versioning) => {
    const { fixture, store } = await awsFixture('bucket-policy');
    fixture.versioning = versioning;
    await expect(store.put(managedInput(Date.now()))).rejects.toMatchObject({ code: 'attachment_retention' });
    expect(fixture.calls.map(({ subresource }) => subresource)).toEqual([
      'object',
      'object',
      'lifecycle',
      'versioning',
    ]);
  });

  it('uses one decreasing elapsed budget for the create, body proof, and both policy RPCs', async () => {
    const { fixture, store } = await awsFixture('bucket-policy', 'prefixed');
    const { started } = observeNativeRequests(fixture.host);
    fixture.rewrite = async (_call, normal) => {
      await sleep(20);
      return normal();
    };
    await store.put(managedInput(Date.now()), { timeoutMs: 2_000 });
    const times = started.map((request) => (request as ClientRequest & { timeout?: number }).timeout ?? 0);
    expect(times).toHaveLength(4);
    expect(times[0]).toBeLessThanOrEqual(2_000);
    expect(times[3]).toBeGreaterThan(0);
    for (let i = 1; i < times.length; i++) expect(Number(times[i - 1]) - Number(times[i])).toBeGreaterThanOrEqual(15);
    expect(fixture.calls.map(({ target }) => target).slice(2)).toEqual([
      `${fixture.bucketPath}/?lifecycle=`,
      `${fixture.bucketPath}/?versioning=`,
    ]);
  });

  it('confirms a 409 only by one exact GET; an absent winner never triggers another PUT', async () => {
    const { fixture, store } = await awsFixture();
    fixture.rewrite = (call, normal) =>
      call.method === 'PUT' ? serviceError(409, 'ConditionalRequestConflict') : normal();
    await expect(store.put(managedInput(Date.now()))).rejects.toMatchObject({ code: 'write_unconfirmed' });
    expect(fixture.calls.map(({ method }) => method)).toEqual(['PUT', 'GET']);
    expect(fixture.calls[0]?.path).toBe(fixture.calls[1]?.path);
  });

  it('does not let a retryable S3 response transmit the same write again', async () => {
    const { fixture, store } = await awsFixture();
    fixture.rewrite = (call, normal) => {
      const result = normal();
      return call.method === 'PUT' ? serviceError(503, 'InternalError') : result;
    };
    await expect(store.put(managedInput(Date.now()))).resolves.toHaveProperty('ref.version');
    expect(fixture.calls.map(({ method }) => method)).toEqual(['PUT', 'GET']);
  });

  it.each([
    [301, 'PermanentRedirect', { 'x-amz-bucket-region': 'us-east-1' }],
    [403, 'AccessDenied', {}],
    [501, 'NotImplemented', {}],
  ] as const)(
    'classifies definitive write rejection %s and sends no redirect or extra request',
    async (status, name, headers) => {
      const { fixture, store } = await awsFixture();
      fixture.rewrite = () => serviceError(status, name, headers);
      const error = await store.put(managedInput(Date.now())).catch((cause: unknown) => cause);
      expect(error).toMatchObject({ code: 'store_incompatible' });
      expect(String(error)).not.toContain('redaction-fixture');
      expect(error).not.toHaveProperty('cause');
      expect(fixture.calls.map(({ method, host }) => [method, host])).toEqual([['PUT', fixture.host]]);
    },
  );

  it('treats exact GET AccessDenied as ambiguous absence, but a missing bucket as definitive', async () => {
    const { fixture, store } = await awsFixture();
    const input = managedInput(Date.now());
    const { ref } = await store.put(input);
    fixture.rewrite = () => serviceError(403, 'AccessDenied');
    expect(await store.resolve(ref, resolveContext(input.scope))).toEqual({ status: 'unavailable' });
    fixture.rewrite = () => serviceError(404, 'NoSuchBucket');
    await expect(store.resolve(ref, resolveContext(input.scope))).rejects.toMatchObject({ code: 'store_incompatible' });
  });

  it.each(['x-amz-version-id', 'x-amz-delete-marker'])('never resolves an object with a %s token', async (field) => {
    const { fixture, store } = await awsFixture();
    const input = managedInput(Date.now());
    const { ref } = await store.put(input);
    rewriteObjectHeader(fixture, (headers) => {
      headers[field] = 'null';
    });
    fixture.calls.length = 0;
    await expect(store.resolve(ref, resolveContext(input.scope))).rejects.toMatchObject({ code: 'store_incompatible' });
    expect(fixture.calls.map(({ method }) => method)).toEqual(['GET']);
  });

  it('retains a legitimate expiry header beyond the default Node header count', async () => {
    const { fixture, store } = await awsFixture();
    fixture.rewrite = (call, normal) => {
      const response = normal();
      if (call.method === 'GET') {
        response.tail = lateHeaders('x-amz-expiration', response.headers['x-amz-expiration'] ?? '');
        delete response.headers['x-amz-expiration'];
      }
      return response;
    };
    await expect(store.put(managedInput(Date.now()))).resolves.toHaveProperty('ref.version');
    expect(fixture.calls.map(({ method }) => method)).toEqual(['PUT', 'GET']);
  });

  it.each([
    ['x-amz-version-id', 'null'],
    ['x-amz-delete-marker', 'true'],
  ] as const)('does not miss a late %s on PUT acknowledgements or exact GET responses', async (name, value) => {
    const { fixture, store } = await awsFixture();
    const input = managedInput(Date.now());
    const { ref } = await store.put(input);
    fixture.calls.length = 0;
    fixture.rewrite = (call, normal) => {
      const response = normal();
      if (call.method === 'PUT') response.tail = lateHeaders(name, value);
      return response;
    };
    await expect(store.put({ ...input, id: 'versioned-ack' })).rejects.toMatchObject({ code: 'store_incompatible' });
    expect(fixture.calls.map(({ method }) => method)).toEqual(['PUT']);

    fixture.calls.length = 0;
    fixture.rewrite = (call, normal) => {
      const response = normal();
      if (call.method === 'GET') response.tail = lateHeaders(name, value);
      return response;
    };
    await expect(store.resolve(ref, resolveContext(input.scope))).rejects.toMatchObject({ code: 'store_incompatible' });
    await expect(store.put(input)).rejects.toMatchObject({ code: 'store_incompatible' });
    expect(fixture.calls.map(({ method }) => method)).toEqual(['GET', 'PUT', 'GET']);
  });

  it.each(['expiration-header', 'bucket-policy'] as const)(
    'does not certify a late duplicate expiration in %s mode',
    async (mode) => {
      const { fixture, store } = await awsFixture(mode);
      const input = managedInput(Date.now());
      const { ref } = await store.put(input);
      fixture.calls.length = 0;
      fixture.rewrite = (call, normal) => {
        const response = normal();
        if (call.method === 'GET' && call.subresource === 'object') {
          response.tail = lateHeaders('X-Amz-Expiration', 'expiry-date="conflicting evidence"');
        }
        return response;
      };
      await expect(store.put(input)).rejects.toMatchObject({ code: 'attachment_retention' });
      await expect(store.resolve(ref, resolveContext(input.scope))).resolves.toMatchObject({ status: 'found' });
      expect(fixture.calls.map(({ method, subresource }) => [method, subresource])).toEqual([
        ['PUT', 'object'],
        ['GET', 'object'],
        ['GET', 'object'],
      ]);
    },
  );

  it.each(['X-Amz-Meta-Eamsha256', 'x-amz-meta-unexpected'])(
    'rejects late conflicting or extra immutable metadata (%s)',
    async (name) => {
      const { fixture, store } = await awsFixture();
      const input = managedInput(Date.now());
      const { ref } = await store.put(input);
      fixture.calls.length = 0;
      fixture.rewrite = (call, normal) => {
        const response = normal();
        if (call.method === 'GET') response.tail = lateHeaders(name, 'not managed metadata');
        return response;
      };
      await expect(store.resolve(ref, resolveContext(input.scope))).rejects.toMatchObject({ code: 'invalid_snapshot' });
      await expect(store.put(input)).rejects.toMatchObject({ code: 'store_incompatible' });
      expect(fixture.calls.map(({ method }) => method)).toEqual(['GET', 'PUT', 'GET']);
    },
  );

  it('fails closed on explicit response header byte overflow, including an otherwise successful PUT', async () => {
    const { fixture, store } = await awsFixture();
    const input = managedInput(Date.now());
    const { ref } = await store.put(input);
    fixture.calls.length = 0;
    const nativeErrors: unknown[] = [];
    const { started } = observeNativeRequests(fixture.host, (request) => {
      request.once('error', (error) => nativeErrors.push(error));
    });
    fixture.rewrite = (_call, normal) => {
      const response = normal();
      response.tail = ['x-pad', 'x'.repeat(17_000), 'x-amz-version-id', 'null'];
      return response;
    };
    await expect(store.put({ ...input, id: 'overflow-ack' })).rejects.toMatchObject({ code: 'store_incompatible' });
    await expect(store.resolve(ref, resolveContext(input.scope))).rejects.toMatchObject({ code: 'store_incompatible' });
    expect(fixture.calls.map(({ method }) => method)).toEqual(['PUT', 'GET']);
    expect(started).toHaveLength(2);
    for (const request of started) {
      expect(request).toHaveProperty('maxHeaderSize', 16_384);
      expect(request.maxHeadersCount).toBe(0);
    }
    expect(nativeErrors).toMatchObject([{ code: 'HPE_HEADER_OVERFLOW' }, { code: 'HPE_HEADER_OVERFLOW' }]);
  });

  it.each(['cancellation', 'deadline'] as const)(
    'holds all eight slots until native request close after pre-header %s',
    async (stop) => {
      const { fixture, client, store } = await awsFixture();
      const input = managedInput(Date.now());
      const { ref } = await store.put(input);
      fixture.calls.length = 0;
      const controller = new AbortController();
      let sdkRejected = 0;
      client.middlewareStack.add(
        (next) => async (args) => {
          try {
            return await next(args);
          } catch (error) {
            sdkRejected++;
            throw error;
          }
        },
        { step: 'initialize', name: 'observeFixtureSdkRejection' },
      );
      const gate = closeGate();
      const sockets = new Set<Socket>();
      const { started, closed } = observeNativeRequests(fixture.host, ({ socket }) => {
        if (!socket || sockets.has(socket)) return;
        sockets.add(socket);
        // Let the native socket send its real error to the ClientRequest. Delay only delivery
        // of its close event, which drives the ClientRequest's own native close notification.
        const emit = socket.emit;
        vi.spyOn(socket, 'emit').mockImplementation(function (this: Socket, event, ...args: unknown[]) {
          if (event !== 'close') return emit.call(this, event, ...args);
          gate.hold(() => emit.call(this, event, ...args));
          return true;
        });
      });
      fixture.rewrite = (_call, normal) => ({ ...normal(), stall: 'before-headers' });
      const pending = Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          expect(
            store.put(
              { ...input, id: `stalled-${i}` },
              stop === 'deadline' ? { timeoutMs: 1_000 } : { signal: controller.signal },
            ),
          ).rejects.toMatchObject({ code: 'write_unconfirmed' }),
        ),
      );
      try {
        await vi.waitFor(() => expect(fixture.calls).toHaveLength(8));
        expect(started).toHaveLength(8);
        expect(sockets.size).toBe(8);
        if (stop === 'cancellation') controller.abort();
        await pending;
        await vi.waitFor(() => {
          expect(sdkRejected).toBe(8);
          expect(gate.delayed).toHaveLength(8);
        });
        expect(closed).toHaveLength(0);
        await expect(store.put(input, { timeoutMs: 500 })).rejects.toMatchObject({ code: 'busy' });
        await expect(store.resolve(ref, resolveContext(input.scope, AbortSignal.timeout(500)))).resolves.toEqual({
          status: 'unavailable',
        });
        expect(fixture.calls.map(({ method }) => method)).toEqual(Array<string>(8).fill('PUT'));
        expect(started).toHaveLength(8);
      } finally {
        controller.abort();
        await pending;
        fixture.rewrite = (_call, normal) => normal();
        gate.release();
      }
      expect(closed).toHaveLength(8);
      await vi.waitFor(async () => {
        expect(await store.resolve(ref, resolveContext(input.scope))).toEqual({ status: 'found', bytes: input.bytes });
      });
      expect(fixture.calls.map(({ method }) => method)).toEqual([...Array<string>(8).fill('PUT'), 'GET']);
    },
  );

  it('does not dispatch a write when SDK credentials arrive after its operation was aborted', async () => {
    const { fixture } = await awsFixture();
    const credentials = latch<typeof CREDENTIALS>();
    const started = latch<void>();
    const settled = latch<void>();
    const client = createS3AttachmentClient({
      region: REGION,
      forcePathStyle: true,
      endpoint: `http://${fixture.host}`,
      credentials: () => {
        started.release();
        return credentials.reached;
      },
    });
    cleanup.push(() => client.destroy());
    client.middlewareStack.add(
      (next) => async (args) => {
        try {
          return await next(args);
        } finally {
          settled.release();
        }
      },
      { step: 'initialize', name: 'observeLateCredentials' },
    );
    const store = createS3AttachmentStore(client, OPTIONS);
    const controller = new AbortController();
    const pending = expect(store.put(managedInput(Date.now()), { signal: controller.signal })).rejects.toMatchObject({
      code: 'aborted', // Not write_unconfirmed: transport had not yet been reached.
    });
    try {
      await atBarrier(started.reached, 'SDK credential lookup');
      controller.abort();
      await pending;
    } finally {
      credentials.release(CREDENTIALS);
    }
    await atBarrier(settled.reached, 'SDK settlement after abort');
    expect(fixture.calls).toHaveLength(0);
  });

  it('tracks all eight raw closes when the SDK rejects a response before exposing its body', async () => {
    const { fixture, client, store } = await awsFixture();
    const input = managedInput(Date.now());
    const { ref } = await store.put(input);
    let failedDeserialization = 0;
    client.middlewareStack.add(
      (next) => async (args) => {
        try {
          return await next(args);
        } catch (error) {
          if (error && Object.hasOwn(error, '$response')) failedDeserialization++;
          throw error;
        }
      },
      { step: 'initialize', name: 'observeFixtureDeserializerFailure' },
    );
    const gate = closeGate();
    const { closed } = observeNativeRequests(fixture.host);
    const responses = channel('http.client.response.finish');
    const observe = (message: unknown) => {
      const { request, response } = message as { request: ClientRequest; response: IncomingMessage };
      if (request.getHeader('host') !== fixture.host) return;
      const destroy = response._destroy;
      response._destroy = function (error, callback) {
        // Allow the native socket and ClientRequest to close. The raw IncomingMessage must remain
        // independently accounted for until its own destruction completes.
        destroy.call(this, error, (failure) => gate.hold(() => callback(failure)));
      };
    };
    responses.subscribe(observe);
    fixture.rewrite = (call, normal) => {
      const response = normal();
      if (call.method !== 'GET') return response;
      response.headers['x-amz-object-lock-retain-until-date'] = 'not-a-date';
      response.stall = 'after-headers';
      return response;
    };
    fixture.calls.length = 0;
    try {
      await Promise.all(
        Array.from({ length: 8 }, async () => {
          await expect(store.resolve(ref, resolveContext(input.scope))).rejects.toMatchObject({
            code: 'invalid_snapshot',
          });
        }),
      );
      expect(failedDeserialization).toBe(8);
      await vi.waitFor(() => {
        expect(gate.delayed).toHaveLength(8);
        expect(closed).toHaveLength(8);
      });
      expect(await store.resolve(ref, resolveContext(input.scope))).toEqual({ status: 'unavailable' });
      await expect(store.put(input)).rejects.toMatchObject({ code: 'busy' });
      expect(fixture.calls).toHaveLength(8);
    } finally {
      responses.unsubscribe(observe);
      fixture.rewrite = (_call, normal) => normal();
      gate.release();
    }
    await vi.waitFor(async () => {
      expect(await store.resolve(ref, resolveContext(input.scope))).toMatchObject({ status: 'found' });
    });
  });
});
