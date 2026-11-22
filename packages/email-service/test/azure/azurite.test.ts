import { AsyncLocalStorage } from 'node:async_hooks';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { channel } from 'node:diagnostics_channel';
import { ClientRequest, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { BlobClient, ContainerClient, newPipeline } from '@azure/storage-blob';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAzureAttachmentContainerClient, createAzureAttachmentStore } from '../../src/attachments/azure';
import { createAzureAttachmentTransport } from '../../src/attachments/azure/transport';
import type { ManagedAttachmentRequest } from '../../src/attachments/backing';
import { createManagedAttachmentOperations } from '../../src/attachments/operations';
import { managedAttachmentKey, managedVersion, MANAGED_ATTACHMENT_CLOCK_GUARD_MS } from '../../src/attachments/records';
import type { AttachmentRef } from '../../src/contracts/message';
import { MANAGED_BINDING, managedInput, resolveContext } from '../conformance/managed-attachment-fixture';
import { registerManagedAttachmentConformance } from '../conformance/managed-attachment-suite';
import { AZURE_REST_VERSION, fixtureCall, fixtureContainerName, startAzurite } from './azurite';
import { drain, startAzureRelay } from './relay';

const prefix = 'private/delivery/';
const options = { ...MANAGED_BINDING, prefix };
const MAX_BYTES = 2 * 1024 * 1024;
const DAY = 86_400_000;
const objectKey = (scope: string, ref: AttachmentRef) =>
  prefix + managedAttachmentKey(MANAGED_BINDING.namespace, scope, ref);

let emulator: Awaited<ReturnType<typeof startAzurite>>;
beforeAll(async () => {
  emulator = await startAzurite();
});
afterAll(async () => emulator?.close());

async function openFixture() {
  const name = fixtureContainerName();
  const control = emulator.control(name);
  await control.create(fixtureCall()); // Private; no public access flag.
  const relay = await startAzureRelay(emulator.endpoint);
  try {
    // Azurite can deny Put Blob to an existing key before evaluating the condition
    // without 'w'. Keep the writer unable to list or delete, and test 'rc' separately.
    const client = emulator.delegated(name, relay.endpoint, 'rw');
    const reader = emulator.delegated(name, relay.endpoint, 'r');
    return {
      name,
      control,
      relay,
      client,
      writer: createAzureAttachmentStore(client, options),
      peer: createAzureAttachmentStore(emulator.delegated(name, relay.endpoint, 'rw'), options),
      worker: createAzureAttachmentStore(reader, options),
      close: relay.close,
    };
  } catch (error) {
    await relay.close();
    throw error;
  }
}

registerManagedAttachmentConformance('Azurite 3.38.0 / Azure Blob SDK', async () => {
  const f = await openFixture();
  return {
    writer: f.writer,
    peer: f.peer,
    now: Date.now,
    waitUntil: (deadline) => sleep(Math.max(0, deadline - Date.now() + 1)),
    async purgeAsOrphan(scope, ref) {
      await f.control.getBlobClient(objectKey(scope, ref)).delete(fixtureCall());
    },
    loseAck(outcome) {
      let drop = true;
      let denyRead = false;
      f.relay.faults.push(async (call, source, reply) => {
        if (drop && call.method === 'PUT' && call.status === 201) {
          drop = false;
          denyRead = outcome === 'unavailable';
          await drain(source);
          reply.destroy();
          return true;
        }
        if (denyRead && call.method === 'GET') {
          denyRead = false;
          await drain(source);
          reply.writeHead(503, { 'x-ms-error-code': 'ServerBusy' }).end();
          return true;
        }
        return false;
      });
    },
    async corrupt(scope, ref, damage) {
      const blob = f.control.getBlockBlobClient(objectKey(scope, ref));
      const original = await blob.getProperties(fixtureCall());
      const bytes = new Uint8Array(ref.byteLength + (damage === 'length' ? 1 : 0)).fill(42);
      await blob.upload(bytes, bytes.byteLength, {
        ...fixtureCall(),
        metadata: original.metadata ?? {},
        blobHTTPHeaders: { blobContentType: ref.contentType },
      });
    },
    close: f.close,
  };
});

function rewrite(source: IncomingMessage, reply: ServerResponse, edit: (headers: IncomingHttpHeaders) => void) {
  const headers = { ...source.headers };
  edit(headers);
  reply.writeHead(source.statusCode ?? 500, headers);
  source.pipe(reply);
  return true;
}

describe('Azure managed attachment data plane', () => {
  let f: Awaited<ReturnType<typeof openFixture>>;
  beforeEach(async () => {
    f = await openFixture();
  });
  afterEach(async () => f?.close());

  it('issues one conditional block PUT with MD5, one confirming GET, and only exact GET on the detached worker', async () => {
    const input = managedInput(Date.now(), { bytes: new Uint8Array(MAX_BYTES).fill(9) });
    const receipt = await f.writer.put(input);
    const name = objectKey(input.scope, receipt.ref);
    const path = new URL(emulator.containerUrl(f.name)).pathname + '/' + name;
    expect(f.relay.calls.map((call) => [call.method, call.path, call.status])).toEqual([
      ['PUT', path, 201],
      ['GET', path, 200],
    ]);
    expect(f.relay.calls[0]?.headers).toMatchObject({
      'x-ms-version': AZURE_REST_VERSION,
      'if-none-match': '*',
      'content-length': String(MAX_BYTES),
      'content-md5': createHash('md5').update(input.bytes).digest('base64'),
      'x-ms-blob-type': 'BlockBlob',
      'x-ms-blob-content-type': input.contentType,
      'x-ms-meta-eamformat': '1',
      'x-ms-meta-eamresolver': MANAGED_BINDING.resolverKey,
      'x-ms-meta-eamrevision': input.revision,
      'x-ms-meta-eamdeliverby': String(input.deliverBy),
      'x-ms-meta-eamlen': String(MAX_BYTES),
      'x-ms-meta-eamfilename': Buffer.from(input.filename).toString('base64url'),
      'x-ms-meta-eamsha256': createHash('sha256').update(input.bytes).digest('hex'),
    });
    expect(f.relay.calls[1]?.headers['x-ms-range']).toBeUndefined();
    for (const field of ['comp', 'snapshot', 'versionid']) {
      expect(f.relay.calls.flatMap((call) => call.queryKeys)).not.toContain(field);
    }
    const props = await f.control.getBlobClient(name).getProperties(fixtureCall());
    expect(props.createdOn).toBeInstanceOf(Date);
    expect(props.versionId).toBeUndefined();
    expect(props.blobType).toBe('BlockBlob');
    f.relay.calls.length = 0;
    const disconnected = f.worker.resolve;
    const found = await disconnected(receipt.ref, resolveContext(input.scope));
    expect(found.status === 'found' && Buffer.compare(Buffer.from(found.bytes), Buffer.from(input.bytes))).toBe(0);
    expect(f.relay.calls.map((call) => [call.method, call.path, call.status])).toEqual([['GET', path, 200]]);
  });

  it('requires no write grant for a detached worker and a denied write issues no receipt or confirmation read', async () => {
    const input = managedInput(Date.now());
    const { ref } = await f.writer.put(input);
    expect(await f.worker.resolve(ref, resolveContext(input.scope))).toMatchObject({ status: 'found' });
    f.relay.calls.length = 0;
    const rejected: unknown = await f.worker.put({ ...input, id: 'no-write-grant' }).catch((error: unknown) => error);
    expect(f.relay.calls.map(({ method, status, code }) => [method, status, code])).toEqual([
      ['PUT', 403, 'AuthorizationPermissionMismatch'],
    ]);
    expect(rejected).toMatchObject({ code: 'store_incompatible' });
  });

  it('requires the opt-in client and a bare container path; rejects locator overrides before any operation', () => {
    expect(() => createAzureAttachmentStore(new ContainerClient(f.client.url, newPipeline()), options)).toThrowError(
      expect.objectContaining({ code: 'invalid_config' }),
    );
    const local = emulator.containerUrl(f.name);
    const hostStyle = `https://account.blob.example.test/${f.name}`;
    for (const url of [
      ...['?versionid=v', '?Snapshot=s', '?comp=block', '?rsct=text%2Fplain', '#', '/nested'].map(
        (tail) => local + tail,
      ),
      `${f.relay.endpoint}/${f.name}`,
      `${hostStyle}/nested`,
      `https://account-secondary.blob.example.test/${f.name}`,
    ]) {
      expect(() => createAzureAttachmentContainerClient(url)).toThrowError(
        expect.objectContaining({ code: 'invalid_config' }),
      );
    }
    for (const base of [local, hostStyle]) {
      expect(createAzureAttachmentContainerClient(`${base}/`).containerName).toBe(f.name);
    }
    expect(() => createAzureAttachmentStore(f.client, { ...options, prefix: 'bad//prefix/' })).toThrowError(
      expect.objectContaining({ code: 'invalid_config' }),
    );
    expect(f.relay.calls).toHaveLength(0);
  });

  it('rejects oversized input before any blob request', async () => {
    await expect(
      f.writer.put(managedInput(Date.now(), { bytes: new Uint8Array(MAX_BYTES + 1) })),
    ).rejects.toMatchObject({
      code: 'invalid_input',
    });
    expect(f.relay.calls).toHaveLength(0);
  });

  it('has the service reject an incorrect transactional MD5 without committing the blob', async () => {
    const blob = f.control.getBlockBlobClient(`${prefix}bad-checksum`);
    const bytes = Uint8Array.of(1, 2, 3);
    await expect(
      blob.upload(bytes, bytes.byteLength, {
        ...fixtureCall(),
        conditions: { ifNoneMatch: '*' },
        transactionalContentMD5: Buffer.alloc(16),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await blob.exists(fixtureCall())).toBe(false);
  });

  it('observes the actual conditional losers and preserves original creation age', async () => {
    const input = managedInput(Date.now());
    const [first, second] = await Promise.all([f.writer.put(input), f.peer.put(input)]);
    expect(first).toEqual(second);
    const puts = f.relay.calls.filter(({ method }) => method === 'PUT');
    expect(puts.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(puts.find(({ status }) => status === 409)?.code).toBe('BlobAlreadyExists');
    const blob = f.control.getBlobClient(objectKey(input.scope, first.ref));
    const before = await blob.getProperties(fixtureCall());
    await sleep(1_100);
    expect((await f.peer.put(input)).ref).toEqual(first.ref);
    const after = await blob.getProperties(fixtureCall());
    expect(after.createdOn).toEqual(before.createdOn);
    expect(after.etag).toEqual(before.etag);
  });

  it('does not confuse a missing container with an absent exact blob', async () => {
    const input = managedInput(Date.now());
    const { ref } = await f.writer.put(input);
    const missing = createAzureAttachmentStore(emulator.writer(fixtureContainerName(), f.relay.endpoint), options);
    await expect(missing.resolve(ref, resolveContext(input.scope))).rejects.toMatchObject({
      code: 'store_incompatible',
    });
    expect(f.relay.calls.at(-1)).toMatchObject({ status: 404, code: 'ContainerNotFound' });
  });

  it('uses optional one-blob SAS isolation but does not confuse it with case-sensitive key construction', async () => {
    const input = managedInput(Date.now());
    const { ref } = await f.writer.put(input);
    const reader = emulator.delegated(f.name, f.relay.endpoint, 'r', objectKey(input.scope, ref));
    const isolated = createAzureAttachmentStore(reader, options);
    expect(await isolated.resolve(ref, resolveContext(input.scope))).toMatchObject({ status: 'found' });
    await expect(isolated.resolve(ref, resolveContext('Tenant-B'))).rejects.toMatchObject({
      code: 'store_incompatible',
    });
    expect(f.relay.calls.at(-1)).toMatchObject({ method: 'GET', status: 403 });
  });

  it('observes Azurite create-only replay limits rather than treating a 403 as a collision proof', async () => {
    const limited = createAzureAttachmentStore(emulator.delegated(f.name, f.relay.endpoint, 'rc'), options);
    const input = managedInput(Date.now());
    await expect(limited.put(input)).resolves.toHaveProperty('ref.sha256');
    await expect(limited.put(input)).rejects.toMatchObject({ code: 'store_incompatible' });
    expect(f.relay.calls.map(({ method, status, code }) => [method, status, code])).toEqual([
      ['PUT', 201, undefined],
      ['GET', 200, undefined],
      ['PUT', 403, 'AuthorizationPermissionMismatch'],
    ]);
  });

  it('confirms a 412 at the same exact key, but does not treat another 409 as a collision', async () => {
    const input = managedInput(Date.now());
    const first = await f.writer.put(input);
    f.relay.calls.length = 0;
    let replyWith: [number, string] = [412, 'ConditionNotMet'];
    f.relay.faults.push(async (call, source, reply) => {
      if (call.method !== 'PUT' || call.status !== 409) return false;
      await drain(source);
      reply.writeHead(replyWith[0], { 'x-ms-error-code': replyWith[1] }).end();
      return true;
    });
    expect((await f.peer.put(input)).ref).toEqual(first.ref);
    expect(f.relay.calls.map(({ method }) => method)).toEqual(['PUT', 'GET']);
    f.relay.calls.length = 0;
    replyWith = [409, 'BlobImmutableDueToPolicy'];
    await expect(f.peer.put(input)).rejects.toMatchObject({ code: 'store_incompatible' });
    expect(f.relay.calls.map(({ method }) => method)).toEqual(['PUT']);
  });

  it('shows that container SAS is not prefix isolation, despite having neither list nor delete grant', async () => {
    const other = 'outside-managed-prefix';
    await f.control.getBlockBlobClient(other).upload('external', 8, fixtureCall());
    // The control path here uses the same fixture writer's SAS without the managed one-shot transport.
    const direct = new ContainerClient(f.client.url, newPipeline(undefined, { retryOptions: { maxTries: 1 } }));
    const blob = direct.getBlobClient(other);
    await expect(blob.getProperties(fixtureCall())).resolves.toHaveProperty('contentLength', 8);
    await expect(blob.delete(fixtureCall())).rejects.toMatchObject({ statusCode: 403 });
    await expect(direct.listBlobsFlat(fixtureCall()).byPage().next()).rejects.toMatchObject({ statusCode: 403 });
  });

  it.each(['x-ms-version-id', 'x-ms-is-current-version', 'x-ms-snapshot'])(
    'rejects surfaced version/snapshot header %s on write and read without fallback',
    async (field) => {
      const input = managedInput(Date.now());
      f.relay.faults.push((call, source, reply) =>
        call.method === 'PUT' ? rewrite(source, reply, (h) => (h[field] = 'synthetic')) : false,
      );
      await expect(f.writer.put(input)).rejects.toMatchObject({ code: 'store_incompatible' });
      expect(f.relay.calls.map(({ method }) => method)).toEqual(['PUT']);
      f.relay.faults.length = 0;
      const { ref } = await f.peer.put(input);
      f.relay.calls.length = 0;
      f.relay.faults.push((_call, source, reply) => rewrite(source, reply, (h) => (h[field] = 'synthetic')));
      await expect(f.worker.resolve(ref, resolveContext(input.scope))).rejects.toMatchObject({
        code: 'store_incompatible',
      });
      expect(f.relay.calls.map(({ method }) => method)).toEqual(['GET']);
      expect(f.relay.calls[0]?.queryKeys).not.toContain('versionid');
    },
  );

  it('detects a surfaced version header even after many additional headers within the byte cap', async () => {
    const input = managedInput(Date.now());
    const { ref } = await f.writer.put(input);
    f.relay.faults.push((call, source, reply) =>
      call.method === 'GET'
        ? rewrite(source, reply, (headers) => {
            headers.q = Array<string>(2_050).fill('');
            headers['x-ms-version-id'] = 'synthetic';
          })
        : false,
    );
    await expect(f.worker.resolve(ref, resolveContext(input.scope))).rejects.toMatchObject({
      code: 'store_incompatible',
    });
  });

  it.each([
    ['extra metadata', { 'x-ms-meta-other': 'extra' }],
    ['incorrect format', { 'x-ms-meta-eamformat': '2' }],
    ['noncanonical decimal', { 'x-ms-meta-eamlen': '04' }],
    ['duplicate identity metadata', { 'x-ms-meta-eamrevision': ['r3', 'r3'] }],
    ['wrong revision', { 'x-ms-meta-eamrevision': 'r2' }],
    ['wrong digest', { 'x-ms-meta-eamsha256': 'a'.repeat(64) }],
    ['wrong filename encoding', { 'x-ms-meta-eamfilename': 'AA=' }],
    ['wrong type', { 'x-ms-blob-type': 'AppendBlob' }],
    ['content range', { 'content-range': 'bytes 0-3/4' }],
    ['encoded body', { 'content-encoding': 'gzip' }],
  ] as const)('rejects malformed immutable data: %s', async (_label, headers) => {
    const input = managedInput(Date.now());
    const { ref } = await f.writer.put(input);
    f.relay.faults.push((call, source, reply) =>
      call.method === 'GET' ? rewrite(source, reply, (h) => Object.assign(h, headers)) : false,
    );
    await expect(f.worker.resolve(ref, resolveContext(input.scope))).rejects.toMatchObject({
      code: 'invalid_snapshot',
    });
    await expect(f.writer.put(input)).rejects.toMatchObject({ code: 'store_incompatible' });
  });

  it.each([
    ['absent creation date', undefined, 'Hot'],
    ['bad creation date', 'not-http-date', 'Hot'],
    ['future creation date', () => new Date(Date.now() + DAY).toUTCString(), 'Hot'],
    ['old creation date', () => new Date(Date.now() - 32 * DAY).toUTCString(), 'Hot'],
    ['contradictory tier', () => new Date().toUTCString(), 'Cool'],
  ] as const)('issues no receipt on %s but can still drain old refs', async (_label, createdOn, tier) => {
    const input = managedInput(Date.now());
    const { ref } = await f.writer.put(input);
    f.relay.faults.push((call, source, reply) =>
      call.method === 'GET'
        ? rewrite(source, reply, (headers) => {
            if (createdOn === undefined) delete headers['x-ms-creation-time'];
            else headers['x-ms-creation-time'] = typeof createdOn === 'function' ? createdOn() : createdOn;
            headers['x-ms-access-tier'] = tier;
            headers['last-modified'] = new Date().toUTCString();
          })
        : false,
    );
    await expect(f.peer.put(input)).rejects.toMatchObject({ code: 'attachment_retention' });
    expect(await f.worker.resolve(ref, resolveContext(input.scope))).toMatchObject({ status: 'found' });
  });

  it('compares the original creation-age floor at the exact hold boundary (32d minus clock guard)', async () => {
    const anchor = Math.floor(Date.now() / 1_000) * 1_000 - 2 * DAY;
    const boundary = anchor + 31 * DAY - MANAGED_ATTACHMENT_CLOCK_GUARD_MS;
    f.relay.faults.push((call, source, reply) =>
      call.method === 'GET'
        ? rewrite(source, reply, (headers) => (headers['x-ms-creation-time'] = new Date(anchor).toUTCString()))
        : false,
    );
    const input = managedInput(Date.now(), { deliverBy: boundary });
    await expect(f.writer.put({ ...input, deliverBy: boundary + 1 })).rejects.toMatchObject({
      code: 'attachment_retention',
    });
    const receipt = await f.writer.put(input);
    expect(() => f.writer.assertReceipt(receipt, input.scope, boundary)).not.toThrow();
    expect(() => f.writer.assertReceipt(receipt, input.scope, boundary + 1)).toThrowError(
      expect.objectContaining({ code: 'attachment_retention' }),
    );
  });

  it.each(['abort', 'deadline'] as const)(
    'stops before response headers after commit (%s) and replays the original key only',
    async (stop) => {
      let committed = false;
      let closed = false;
      const controller = new AbortController();
      f.relay.faults.push(async (call, source, reply) => {
        if (call.method !== 'PUT' || call.status !== 201) return false;
        reply.once('close', () => {
          closed = !reply.writableFinished;
        });
        await drain(source);
        committed = true;
        return true;
      });
      const input = managedInput(Date.now());
      const pending = expect(
        f.writer.put(input, { signal: controller.signal, ...(stop === 'deadline' ? { timeoutMs: 1_500 } : {}) }),
      ).rejects.toMatchObject({ code: 'write_unconfirmed' });
      await vi.waitFor(() => expect(committed).toBe(true));
      if (stop === 'abort') controller.abort();
      await pending;
      await vi.waitFor(() => expect(closed).toBe(true));
      expect(f.relay.calls.map(({ method }) => method)).toEqual(['PUT']);
      f.relay.faults.length = 0;
      const receipt = await f.peer.put(input);
      expect(receipt.ref.version).toBe(managedVersion(input.revision, input.deliverBy));
      expect(new Set(f.relay.calls.map(({ path }) => path)).size).toBe(1);
      expect(f.relay.calls.map(({ method, status }) => [method, status])).toEqual([
        ['PUT', 201],
        ['PUT', 409],
        ['GET', 200],
      ]);
    },
  );

  it('aborts a real partial download, closes relay and origin responses and does not resume a range', async () => {
    const input = managedInput(Date.now(), { bytes: new Uint8Array(MAX_BYTES).fill(90) });
    const { ref } = await f.writer.put(input);
    const controller = new AbortController();
    let partial = false;
    let closed = false;
    let originClosed = false;
    f.relay.faults.push(async (call, source, reply) => {
      if (call.method !== 'GET') return false;
      source.once('close', () => (originClosed = true));
      reply.once('close', () => (closed = !reply.writableFinished));
      reply.writeHead(200, source.headers);
      const first = await source.iterator({ destroyOnReturn: false }).next();
      if (first.done) throw new Error('Expected actual blob bytes');
      reply.write(Buffer.from(first.value).subarray(0, 64));
      partial = true;
      return true;
    });
    const pending = f.worker.resolve(ref, resolveContext(input.scope, controller.signal));
    await vi.waitFor(() => expect(partial).toBe(true));
    controller.abort();
    expect(await pending).toEqual({ status: 'unavailable' });
    await vi.waitFor(() => expect(closed && originClosed).toBe(true));
    expect(f.relay.calls.map(({ method }) => method)).toEqual(['PUT', 'GET', 'GET']);
    f.relay.faults.length = 0;
    expect(await f.worker.resolve(ref, resolveContext(input.scope))).toMatchObject({ status: 'found' });
  });

  it.each(['before headers', 'rejected by SDK'] as const)(
    'retains all eight slots until actual Node transport close (%s)',
    async (phase) => {
      const input = managedInput(Date.now());
      const { ref } = await f.writer.put(input);
      const requestContext = new AsyncLocalStorage<boolean>();
      const httpStart = channel('http.client.request.start');
      const releaseSocket: (() => void)[] = [];
      const restoreMethods: (() => void)[] = [];
      let intercepted = 0;
      let closed = 0;
      const watch = (message: unknown) => {
        if (
          !requestContext.getStore() ||
          typeof message !== 'object' ||
          message === null ||
          !('request' in message) ||
          !(message.request instanceof ClientRequest)
        ) {
          return;
        }
        const socket = message.request.socket;
        if (!socket || message.request.method !== 'GET') return;
        intercepted++;
        const original = socket._destroy;
        const restore = () => {
          socket._destroy = original;
        };
        restoreMethods.push(restore);
        socket.once('close', () => closed++);
        socket._destroy = (error, callback) => {
          restore();
          // Delay the actual TCP Socket teardown, not an SDK wrapper or a substitute response.
          releaseSocket.push(() => original.call(socket, error, callback));
        };
      };
      const controller = new AbortController();
      httpStart.subscribe(watch);
      try {
        let held = 0;
        f.relay.faults.push((call, _source, reply) => {
          if (call.method !== 'GET') return false;
          held++;
          if (phase === 'rejected by SDK') {
            reply.writeHead(200, { 'content-type': input.contentType }).write(Buffer.of(1));
          }
          return true;
        });
        const pending = Promise.allSettled(
          Array.from({ length: 8 }, () =>
            requestContext.run(true, () => f.worker.resolve(ref, resolveContext(input.scope, controller.signal))),
          ),
        );
        await vi.waitFor(() => expect(held).toBe(8), 5_000);
        expect(intercepted).toBe(8);
        if (phase === 'before headers') {
          controller.abort();
          expect(await pending).toEqual(
            Array.from({ length: 8 }, () => ({ status: 'fulfilled', value: { status: 'unavailable' } })),
          );
        } else {
          expect(await pending).toEqual(
            Array.from({ length: 8 }, () => ({
              status: 'rejected',
              reason: expect.objectContaining({ code: 'invalid_snapshot' }),
            })),
          );
        }
        await vi.waitFor(() => expect(releaseSocket).toHaveLength(8), 5_000);
        expect(closed).toBe(0);
        await expect(f.worker.put({ ...input, id: 'capacity-probe' })).rejects.toMatchObject({ code: 'busy' });
        expect(f.relay.calls).toHaveLength(10); // Two from the writer, exactly eight from the blocked worker.
        for (const release of releaseSocket.splice(0)) release();
        await vi.waitFor(() => expect(closed).toBe(8), 5_000);
        f.relay.faults.length = 0;
        expect(await f.worker.resolve(ref, resolveContext(input.scope))).toMatchObject({ status: 'found' });
      } finally {
        httpStart.unsubscribe(watch);
        controller.abort();
        for (const restore of restoreMethods) restore();
        for (const release of releaseSocket) release();
      }
    },
  );

  it('retains all eight slots through SDK wrapper close even after the raw downloads close', async () => {
    const input = managedInput(Date.now(), { bytes: new Uint8Array(MAX_BYTES) });
    const { ref } = await f.writer.put(input);
    const controller = new AbortController();
    const release: (() => void)[] = [];
    let holdClose = true;
    let wrapped = 0;
    let closed = 0;
    let rawClosed = 0;
    const download = BlobClient.prototype.download;
    const spy = vi.spyOn(BlobClient.prototype, 'download').mockImplementation(async function (
      this: BlobClient,
      ...args
    ) {
      const reply = await download.apply(this, args);
      const stream = reply.readableStreamBody;
      if (stream instanceof Readable) {
        wrapped++;
        stream.once('close', () => closed++);
        const destroy = stream._destroy;
        stream._destroy = (error, finish) =>
          destroy.call(stream, error, (cause) => {
            if (holdClose) release.push(() => finish(cause));
            else finish(cause);
          });
      }
      return reply;
    });
    try {
      f.relay.faults.push((call, source, reply) => {
        if (call.method !== 'GET') return false;
        reply.once('close', () => rawClosed++);
        reply.writeHead(200, source.headers).write(Buffer.of(1));
        return true;
      });
      const pending = Promise.allSettled(
        Array.from({ length: 8 }, () => f.worker.resolve(ref, resolveContext(input.scope, controller.signal))),
      );
      await vi.waitFor(() => expect(wrapped).toBe(8), 5_000);
      controller.abort();
      expect(await pending).toEqual(
        Array.from({ length: 8 }, () => ({ status: 'fulfilled', value: { status: 'unavailable' } })),
      );
      await vi.waitFor(() => {
        expect(rawClosed).toBe(8);
        expect(release).toHaveLength(8);
      }, 5_000);
      expect(closed).toBe(0);
      await expect(f.worker.put({ ...input, id: 'capacity-probe' })).rejects.toMatchObject({ code: 'busy' });
      expect(f.relay.calls).toHaveLength(10);
      for (const finish of release.splice(0)) finish();
      await vi.waitFor(() => expect(closed).toBe(8), 5_000);
      spy.mockRestore();
      f.relay.faults.length = 0;
      expect(await f.worker.resolve(ref, resolveContext(input.scope))).toMatchObject({ status: 'found' });
    } finally {
      spy.mockRestore();
      holdClose = false;
      controller.abort();
      for (const finish of release) finish();
    }
  });

  it('maps a severed download to unavailable without retry or same-key range resume', async () => {
    const input = managedInput(Date.now(), { bytes: new Uint8Array(MAX_BYTES) });
    const { ref } = await f.writer.put(input);
    f.relay.faults.push(async (call, source, reply) => {
      if (call.method !== 'GET') return false;
      const first = await source.iterator({ destroyOnReturn: false }).next();
      if (first.done) throw new Error('Expected actual blob bytes');
      reply.writeHead(200, source.headers).write(Buffer.from(first.value).subarray(0, 64), () => reply.destroy());
      return true;
    });
    expect(await f.worker.resolve(ref, resolveContext(input.scope))).toEqual({ status: 'unavailable' });
    expect(f.relay.calls.map(({ method }) => method)).toEqual(['PUT', 'GET', 'GET']);
  });

  it.each(['content-length', 'etag', 'oversized', 'structured body'] as const)(
    'closes a malformed live GET with %s before buffering the stalled body',
    async (fault) => {
      const input = managedInput(Date.now(), { bytes: new Uint8Array(MAX_BYTES) });
      const { ref } = await f.writer.put(input);
      let closed = false;
      f.relay.faults.push(async (call, source, reply) => {
        if (call.method !== 'GET') return false;
        const headers = { ...source.headers };
        if (fault === 'oversized') headers['content-length'] = String(MAX_BYTES + 1);
        else if (fault === 'structured body') headers['x-ms-structured-body'] = 'XSM/1.0; properties=crc64';
        else delete headers[fault];
        reply.once('close', () => (closed = !reply.writableFinished));
        reply.writeHead(200, headers);
        const first = await source.iterator({ destroyOnReturn: false }).next();
        if (first.done) throw new Error('Expected actual blob bytes');
        reply.write(Buffer.from(first.value).subarray(0, 64));
        return true;
      });
      await expect(
        f.worker.resolve(ref, resolveContext(input.scope, AbortSignal.timeout(3_000))),
      ).rejects.toMatchObject({
        code: 'invalid_snapshot',
      });
      await vi.waitFor(() => expect(closed).toBe(true));
      expect(f.relay.calls.map(({ method }) => method)).toEqual(['PUT', 'GET', 'GET']);
    },
  );

  it.each([
    [301, {}],
    [503, {}],
    [206, { 'content-range': 'bytes 0-3/4' }],
  ] as const)('does not replay an anomalous GET (%s) to any location', async (status, headers) => {
    const input = managedInput(Date.now());
    const { ref } = await f.writer.put(input);
    let closed = false;
    f.relay.faults.push((call, _source, reply) => {
      if (call.method !== 'GET') return false;
      reply.once('close', () => (closed = !reply.writableFinished));
      reply
        .writeHead(status, { ...headers, location: '/another-key', 'x-ms-error-code': 'ServerBusy' })
        .write(Buffer.alloc(65_536)); // Never end. The adapter must not let the SDK buffer this.
      return true;
    });
    const pending = f.worker.resolve(ref, resolveContext(input.scope, AbortSignal.timeout(3_000)));
    if (status === 503) expect(await pending).toEqual({ status: 'unavailable' });
    else await expect(pending).rejects.toMatchObject({ code: 'store_incompatible' });
    await vi.waitFor(() => expect(closed).toBe(true));
    expect(f.relay.calls.map(({ method }) => method)).toEqual(['PUT', 'GET', 'GET']);
  });

  it('rejects an oversized header without leaking Azure responses, URLs, credentials or metadata', async () => {
    const input = managedInput(Date.now());
    const { ref } = await f.writer.put(input);
    f.relay.faults.push((call, source, reply) =>
      call.method === 'GET' ? rewrite(source, reply, (headers) => (headers['x-fake'] = 'secret'.repeat(3_000))) : false,
    );
    const error: unknown = await Promise.resolve(f.worker.resolve(ref, resolveContext(input.scope))).catch(
      (error: unknown) => error,
    );
    expect(error).toMatchObject({ code: 'store_incompatible' });
    expect(error).not.toHaveProperty('cause');
    expect(JSON.stringify(error)).not.toMatch(/secret|127\.0\.0\.1|\bsig=|bill-07|Tenant-A/);
    expect(f.relay.calls.map(({ method }) => method)).toEqual(['PUT', 'GET', 'GET']);
  });

  it('discards an unbounded successful ACK body and still verifies the exact committed bytes', async () => {
    const input = managedInput(Date.now());
    let closed = false;
    f.relay.faults.push(async (call, source, reply) => {
      if (call.method !== 'PUT' || call.status !== 201) return false;
      await drain(source);
      reply.once('close', () => (closed = !reply.writableFinished));
      const headers = { ...source.headers };
      delete headers['content-length'];
      reply.writeHead(201, headers).write(Buffer.alloc(65_536));
      return true;
    });
    await expect(f.writer.put(input)).resolves.toHaveProperty('ref.sha256');
    await vi.waitFor(() => expect(closed).toBe(true));
    expect(f.relay.calls.map(({ method }) => method)).toEqual(['PUT', 'GET']);
  });

  it.each(['PUT', 'GET'] as const)(
    'fences a repeated Azure SDK %s below an explicitly re-enabled retry policy',
    async (method) => {
      const input = managedInput(Date.now());
      const { ref } = await f.writer.put(input);
      f.relay.calls.length = 0;
      const transport = createAzureAttachmentTransport();
      const pipeline = newPipeline(undefined, {
        ...transport.pipelineOptions,
        retryOptions: { maxTries: 3, retryDelayInMs: 0 },
      });
      pipeline.factories.push(transport.policy);
      const container = new ContainerClient(f.client.url, pipeline);
      const name = objectKey(input.scope, ref) + (method === 'PUT' ? '-retry' : '');
      const blob = container.getBlockBlobClient(name);
      f.relay.faults.push(async (call, source, reply) => {
        if (call.method !== method) return false;
        await drain(source);
        reply.writeHead(503, { 'x-ms-error-code': 'ServerBusy' }).end();
        return true;
      });
      const call = (request: ManagedAttachmentRequest) => {
        transport.track(request, method, blob.url);
        return method === 'PUT'
          ? blob.upload(input.bytes, input.bytes.byteLength, {
              abortSignal: request.signal,
              conditions: { ifNoneMatch: '*' },
              transactionalContentMD5: createHash('md5').update(input.bytes).digest(),
            })
          : blob.download(0, undefined, { abortSignal: request.signal, maxRetryRequests: 0 });
      };
      await createManagedAttachmentOperations().run(
        { timeoutMs: 3_000 },
        (op) =>
          op.request(async (request) => {
            // Not the first SDK 503: this error proves a second SDK attempt reached the fence.
            await expect(call(request)).rejects.toThrow('Azure attachment dispatch refused');
            expect(request.dispatched).toBe(true);
          }),
        () => undefined,
      );
      expect(f.relay.calls.map((item) => [item.method, item.status])).toEqual([[method, method === 'PUT' ? 201 : 200]]);
    },
  );

  it('refuses dispatch if the raw policy was installed too late', async () => {
    const transport = createAzureAttachmentTransport();
    const pipeline = newPipeline(undefined, transport.pipelineOptions);
    const blob = new ContainerClient(f.client.url, pipeline).getBlobClient(`${prefix}untracked`);
    pipeline.factories.push(transport.policy);
    await createManagedAttachmentOperations().run(
      { timeoutMs: 3_000 },
      (op) =>
        op.request(async (request) => {
          transport.track(request, 'GET', blob.url);
          await expect(blob.download(0, undefined, { abortSignal: request.signal })).rejects.toThrow(
            'Azure attachment dispatch refused',
          );
          expect(request.dispatched).toBe(false);
        }),
      () => undefined,
    );
    expect(f.relay.calls).toHaveLength(0);
  });
});
