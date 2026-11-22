import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  CreateBucketCommand,
  DeleteBucketLifecycleCommand,
  DeleteObjectCommand,
  GetBucketLifecycleConfigurationCommand,
  GetBucketVersioningCommand,
  HeadObjectCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  type LifecycleRule,
} from '@aws-sdk/client-s3';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createS3AttachmentStore } from '../../src/attachments/s3';
import { MANAGED_BINDING, managedInput, resolveContext } from '../conformance/managed-attachment-fixture';
import { registerManagedAttachmentConformance } from '../conformance/managed-attachment-suite';
import { BOUNDARY, objectKey, PREFIX, RULE } from './keys';
import { startS3Relay, type Call } from './relay';
import { startSeaweedFs, verifySeaweedArchive } from './seaweedfs';

const MAX_BYTES = 2 * 1024 * 1024;
let weed: Awaited<ReturnType<typeof startSeaweedFs>>;
beforeAll(async () => {
  weed = await startSeaweedFs();
});
afterAll(async () => weed?.close());

function isObject(call: Call, method: string): boolean {
  return call.method === method && call.path.includes(`/${BOUNDARY}`);
}

async function drain(source: IncomingMessage) {
  source.resume(); // The original reply was real; this fixture intentionally discards its body.
  await finished(source, { cleanup: true });
}

async function openFixture() {
  const bucket = `mail-${randomBytes(10).toString('hex')}`;
  const control = weed.control;
  const callOptions = () => ({ abortSignal: AbortSignal.timeout(5_000) });
  const lifecycle = (rules: LifecycleRule[]) =>
    control.send(
      new PutBucketLifecycleConfigurationCommand({ Bucket: bucket, LifecycleConfiguration: { Rules: rules } }),
      callOptions(),
    );
  await control.send(new CreateBucketCommand({ Bucket: bucket }), callOptions());
  await lifecycle([RULE]);
  const relay = await startS3Relay(weed.endpoint);
  const first = weed.client(relay.endpoint);
  const second = weed.client(relay.endpoint);
  const worker = weed.client(relay.endpoint, 'worker');
  const options = { ...MANAGED_BINDING, bucket, prefix: PREFIX };
  const attachmentOptions = { ...options, retention: 'bucket-policy' } as const;
  return {
    bucket,
    control,
    callOptions,
    relay,
    first,
    options,
    lifecycle,
    writer: createS3AttachmentStore(first, attachmentOptions),
    peer: createS3AttachmentStore(second, attachmentOptions),
    worker: createS3AttachmentStore(worker, attachmentOptions),
    close: async () => {
      first.destroy();
      second.destroy();
      worker.destroy();
      await relay.close();
      // All per-test buckets are removed when the child/state is torn down; no runtime sweeps.
    },
  };
}

registerManagedAttachmentConformance('SeaweedFS 4.54 / AWS SDK', async () => {
  const f = await openFixture();
  return {
    writer: f.writer,
    peer: f.peer,
    now: Date.now,
    waitUntil: (deadline) => sleep(Math.max(0, deadline - Date.now() + 1)),
    async purgeAsOrphan(scope, ref) {
      await f.control.send(new DeleteObjectCommand({ Bucket: f.bucket, Key: objectKey(scope, ref) }), f.callOptions());
    },
    loseAck(outcome) {
      let drop = true;
      let denyRead = false;
      f.relay.faults.push(async (call, source, reply) => {
        if (drop && isObject(call, 'PUT') && call.status === 200) {
          drop = false;
          denyRead = outcome === 'unavailable';
          await drain(source);
          reply.destroy();
          return true;
        }
        if (denyRead && isObject(call, 'GET')) {
          denyRead = false;
          await drain(source);
          reply.writeHead(503, { 'content-type': 'application/xml' });
          reply.end('<Error><Code>SlowDown</Code></Error>');
          return true;
        }
        return false;
      });
    },
    async corrupt(scope, ref, damage) {
      const at = { Bucket: f.bucket, Key: objectKey(scope, ref) };
      const original = await f.control.send(new HeadObjectCommand(at), f.callOptions());
      await f.control.send(
        new PutObjectCommand({
          ...at,
          Metadata: original.Metadata,
          ContentType: original.ContentType,
          Body: new Uint8Array(ref.byteLength + (damage === 'length' ? 1 : 0)).fill(42),
        }),
        f.callOptions(),
      );
    },
    close: f.close,
  };
});

describe('SeaweedFS attachment protocol', () => {
  let f: Awaited<ReturnType<typeof openFixture>>;
  beforeEach(async () => {
    f = await openFixture();
  });
  afterEach(async () => f?.close());

  it('uses path style, a conditional SHA-256 PUT, exact GET, and only the two producer proof RPCs', async () => {
    const input = managedInput(Date.now(), { bytes: new Uint8Array(MAX_BYTES).fill(9) });
    const stack = f.first.middlewareStack.identify();
    const receipt = await f.writer.put(input);
    const path = `/${f.bucket}/${objectKey(input.scope, receipt.ref)}`;
    const digest = createHash('sha256').update(input.bytes);
    expect(
      f.relay.calls.map(({ method, path, query, status }) => [
        method,
        path,
        query.has('lifecycle'),
        query.has('versioning'),
        status,
      ]),
    ).toEqual([
      ['PUT', path, false, false, 200],
      ['GET', path, false, false, 200],
      ['GET', `/${f.bucket}/`, true, false, 200],
      ['GET', `/${f.bucket}/`, false, true, 200],
    ]);
    expect(f.relay.calls[0]?.headers).toMatchObject({
      'if-none-match': '*',
      'content-length': String(MAX_BYTES),
      'content-type': input.contentType,
      'x-amz-checksum-sha256': digest.copy().digest('base64'),
      'x-amz-meta-eamformat': '1',
      'x-amz-meta-eamresolver': MANAGED_BINDING.resolverKey,
      'x-amz-meta-eamrevision': input.revision,
      'x-amz-meta-eamdeliverby': String(input.deliverBy),
      'x-amz-meta-eamlen': String(input.bytes.byteLength),
      'x-amz-meta-eamfilename': Buffer.from(input.filename).toString('base64url'),
      'x-amz-meta-eamsha256': digest.digest('hex'),
    });
    const ack = await f.control.send(
      new HeadObjectCommand({ Bucket: f.bucket, Key: objectKey(input.scope, receipt.ref) }),
      f.callOptions(),
    );
    expect(ack.LastModified).toBeInstanceOf(Date);
    expect(ack.Expiration).toBeUndefined();
    expect(ack.VersionId).toBeUndefined();
    expect(f.first.middlewareStack.identify()).toEqual(stack);
    f.relay.calls.length = 0;
    const read = f.worker.resolve;
    expect(await read(receipt.ref, resolveContext(input.scope))).toEqual({ status: 'found', bytes: input.bytes });
    expect(f.relay.calls.map(({ method, path, status }) => [method, path, status])).toEqual([['GET', path, 200]]);
  });

  it('rejects oversize input before any S3 request', async () => {
    await expect(
      f.writer.put(managedInput(Date.now(), { bytes: new Uint8Array(MAX_BYTES + 1) })),
    ).rejects.toMatchObject({
      code: 'invalid_input',
    });
    expect(f.relay.calls).toHaveLength(0);
  });

  it('rejects an explicit wrong upload checksum at the gateway', async () => {
    await expect(
      f.control.send(
        new PutObjectCommand({
          Bucket: f.bucket,
          Key: `${BOUNDARY}test-only-bad-checksum`,
          Body: 'bad-digest',
          IfNoneMatch: '*',
          ChecksumSHA256: Buffer.alloc(32).toString('base64'),
        }),
        f.callOptions(),
      ),
    ).rejects.toMatchObject({ $metadata: { httpStatusCode: 400 } });
  });

  it('does not infer policy mode from a compatible custom endpoint', async () => {
    const defaultMode = createS3AttachmentStore(f.first, f.options);
    await expect(defaultMode.put(managedInput(Date.now()))).rejects.toMatchObject({ code: 'attachment_retention' });
    expect(f.relay.calls.map(({ method }) => method)).toEqual(['PUT', 'GET']);
  });

  it.each([
    ['wrong ID', [{ ...RULE, ID: 'other-rule' }]],
    ['too early', [{ ...RULE, Expiration: { Days: 31 } }]],
    ['wrong prefix', [{ ...RULE, Filter: { Prefix: PREFIX } }]],
    ['disabled', [{ ...RULE, Status: 'Disabled' }]],
    ['another rule', [RULE, { ...RULE, ID: 'other-rule', Filter: { Prefix: 'other/' } }]],
  ] as const)('fails closed on observed lifecycle drift: %s', async (_name, rules) => {
    const input = managedInput(Date.now());
    const existing = await f.writer.put(input);
    await f.lifecycle([...rules]);
    const observed = await f.control.send(
      new GetBucketLifecycleConfigurationCommand({ Bucket: f.bucket }),
      f.callOptions(),
    );
    expect(observed.Rules).toMatchObject(rules);
    f.relay.calls.length = 0;
    await expect(f.writer.put(input)).rejects.toMatchObject({ code: 'attachment_retention' });
    expect(f.relay.calls.map(({ status }) => status)).toEqual([412, 200, 200]);
    expect(await f.worker.resolve(existing.ref, resolveContext(input.scope))).toMatchObject({ status: 'found' });
  });

  it('does not issue proof without a lifecycle configuration', async () => {
    await f.control.send(new DeleteBucketLifecycleCommand({ Bucket: f.bucket }), f.callOptions());
    await expect(f.writer.put(managedInput(Date.now()))).rejects.toMatchObject({ code: 'attachment_retention' });
    expect(f.relay.calls.map(({ status }) => status)).toEqual([200, 200, 404]);
  });

  it.each(['Enabled', 'Suspended'] as const)('rejects actual bucket versioning %s at proof time', async (status) => {
    const input = managedInput(Date.now());
    const receipt = await f.writer.put(input);
    await f.control.send(
      new PutBucketVersioningCommand({ Bucket: f.bucket, VersioningConfiguration: { Status: 'Enabled' } }),
      f.callOptions(),
    );
    if (status === 'Suspended') {
      await f.control.send(
        new PutBucketVersioningCommand({ Bucket: f.bucket, VersioningConfiguration: { Status: status } }),
        f.callOptions(),
      );
    }
    const state = await f.control.send(new GetBucketVersioningCommand({ Bucket: f.bucket }), f.callOptions());
    expect(state.Status).toBe(status);
    f.relay.calls.length = 0;
    // Isolate the policy check even if the server surfaces a version token for a pre-existing unversioned object.
    f.relay.faults.push((call, source, reply) => {
      if (!isObject(call, call.method ?? '')) return false;
      const headers = { ...source.headers };
      delete headers['x-amz-version-id'];
      reply.writeHead(call.status ?? 500, headers);
      source.pipe(reply);
      return true;
    });
    await expect(f.writer.put(input)).rejects.toMatchObject({ code: 'attachment_retention' });
    expect(f.relay.calls.map(({ status }) => status)).toEqual([412, 200, 200, 200]);
    expect(await f.worker.resolve(receipt.ref, resolveContext(input.scope))).toMatchObject({ status: 'found' });
  });

  it('rejects a version token on a successful conditional PUT without fetching a fallback version', async () => {
    await f.control.send(
      new PutBucketVersioningCommand({ Bucket: f.bucket, VersioningConfiguration: { Status: 'Enabled' } }),
      f.callOptions(),
    );
    await expect(f.writer.put(managedInput(Date.now()))).rejects.toMatchObject({ code: 'store_incompatible' });
    expect(f.relay.calls.map(({ method, status }) => [method, status])).toEqual([['PUT', 200]]);
  });

  it('does not ignore an earlier expiration header in policy mode', async () => {
    f.relay.faults.push((call, source, reply) => {
      if (!isObject(call, 'GET')) return false;
      const early = new Date(Date.now() + 30 * 86_400_000).toUTCString();
      reply.writeHead(200, { ...source.headers, 'x-amz-expiration': `expiry-date="${early}", rule-id="${RULE.ID}"` });
      source.pipe(reply);
      return true;
    });
    await expect(f.writer.put(managedInput(Date.now()))).rejects.toMatchObject({ code: 'attachment_retention' });
    expect(f.relay.calls.map(({ method }) => method)).toEqual(['PUT', 'GET']);
  });

  it('fails an exact read with malformed immutable metadata', async () => {
    const input = managedInput(Date.now());
    const { ref } = await f.writer.put(input);
    f.relay.faults.push((call, source, reply) => {
      if (!isObject(call, 'GET')) return false;
      reply.writeHead(200, { ...source.headers, 'x-amz-meta-eamdeliverby': `0${input.deliverBy}` });
      source.pipe(reply);
      return true;
    });
    await expect(f.worker.resolve(ref, resolveContext(input.scope))).rejects.toMatchObject({
      code: 'invalid_snapshot',
    });
    await expect(f.writer.put(input)).rejects.toMatchObject({ code: 'store_incompatible' });
  });

  it('cancels a live, partially forwarded SeaweedFS GET and closes the HTTP response', async () => {
    const input = managedInput(Date.now(), { bytes: new Uint8Array(MAX_BYTES).fill(60) });
    const { ref } = await f.writer.put(input);
    let firstChunk = false;
    let closed = false;
    let originClosed = false;
    const abort = new AbortController();
    f.relay.faults.push(async (call, source, reply) => {
      if (!isObject(call, 'GET')) return false;
      reply.once('close', () => {
        closed = !reply.writableFinished;
      });
      source.once('close', () => {
        originClosed = true;
      });
      reply.writeHead(200, source.headers);
      const next = await source.iterator({ destroyOnReturn: false }).next();
      if (next.done) throw new Error('Expected real SeaweedFS bytes');
      reply.write(Buffer.from(next.value).subarray(0, 64));
      firstChunk = true;
      return true;
    });
    const pending = f.worker.resolve(ref, resolveContext(input.scope, abort.signal));
    await vi.waitFor(() => expect(firstChunk).toBe(true), 5_000);
    abort.abort();
    expect(await pending).toEqual({ status: 'unavailable' });
    await vi.waitFor(() => expect(closed && originClosed).toBe(true), 5_000);
    f.relay.faults.length = 0;
    expect(await f.worker.resolve(ref, resolveContext(input.scope))).toMatchObject({ status: 'found' });
  });

  it('accepts a bounded chunked response and destroys a lengthless overflow before EOF', async () => {
    const input = managedInput(Date.now());
    const { ref } = await f.writer.put(input);
    let overflow = false;
    let closed = false;
    f.relay.faults.push((call, source, reply) => {
      if (!isObject(call, 'GET')) return false;
      const headers = { ...source.headers };
      delete headers['content-length'];
      reply.writeHead(200, headers);
      if (overflow) {
        reply.once('close', () => {
          closed = !reply.writableFinished;
        });
        source.on('data', (chunk: Buffer) => reply.write(chunk));
        source.on('end', () => reply.write(Buffer.of(7))); // Deliberately never end the downstream body.
      } else {
        source.pipe(reply);
      }
      return true;
    });
    expect(await f.worker.resolve(ref, resolveContext(input.scope))).toEqual({ status: 'found', bytes: input.bytes });
    overflow = true;
    await expect(f.worker.resolve(ref, resolveContext(input.scope, AbortSignal.timeout(3_000)))).rejects.toMatchObject({
      code: 'invalid_snapshot',
    });
    await vi.waitFor(() => expect(closed).toBe(true), 5_000);
  });

  it('aborts the in-flight proof read, without treating a confirmed object as uncertain', async () => {
    let proofStarted = false;
    let closed = false;
    const controller = new AbortController();
    f.relay.faults.push((call, source, reply: ServerResponse) => {
      if (!call.query.has('versioning')) return false;
      reply.once('close', () => {
        closed = !reply.writableFinished;
      });
      reply.writeHead(200, source.headers).flushHeaders();
      proofStarted = true;
      return true;
    });
    const input = managedInput(Date.now());
    const pending = f.writer.put(input, { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'aborted' });
    await vi.waitFor(() => expect(proofStarted).toBe(true), 5_000);
    controller.abort();
    await rejected;
    await vi.waitFor(() => expect(closed).toBe(true), 5_000);
    f.relay.faults.length = 0;
    await expect(f.writer.put(input)).resolves.toHaveProperty('ref.sha256');
  });

  it('leaves a committed PUT with an interrupted acknowledgement unconfirmed and replays the exact key', async () => {
    let committed = false;
    let closed = false;
    const controller = new AbortController();
    f.relay.faults.push(async (call, source, reply) => {
      if (!isObject(call, 'PUT') || call.status !== 200) return false;
      await drain(source);
      reply.once('close', () => {
        closed = !reply.writableFinished;
      });
      committed = true;
      return true;
    });
    const input = managedInput(Date.now());
    const pending = f.writer.put(input, { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'write_unconfirmed' });
    await vi.waitFor(() => expect(committed).toBe(true), 5_000);
    controller.abort();
    await rejected;
    await vi.waitFor(() => expect(closed).toBe(true), 5_000);
    expect(f.relay.calls.map(({ method }) => method)).toEqual(['PUT']);
    f.relay.faults.length = 0;
    const receipt = await f.peer.put(input);
    expect(f.relay.calls.slice(0, 3).map(({ status, path }) => [status, path])).toEqual(
      [200, 412, 200].map((status) => [status, `/${f.bucket}/${objectKey(input.scope, receipt.ref)}`]),
    );
    expect(await f.worker.resolve(receipt.ref, resolveContext(input.scope))).toMatchObject({ status: 'found' });
  });

  it('rejects a mismatched fixture archive digest before extraction', async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'bad-archive-'));
    try {
      const wrong = join(scratch, 'not-a-seaweed-archive');
      await writeFile(wrong, 'invalid fixture archive', { flag: 'wx', mode: 0o600 });
      await expect(verifySeaweedArchive(wrong)).rejects.toThrow('SHA-256 does not match');
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
});
