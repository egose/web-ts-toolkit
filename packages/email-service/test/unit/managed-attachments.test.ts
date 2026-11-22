import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { setImmediate as turn } from 'node:timers/promises';
import { expect, it, vi } from 'vitest';
import type { AttachmentRef } from '../../src';
import type {
  ManagedAttachmentBacking,
  ManagedAttachmentCreate,
  ManagedAttachmentRead,
} from '../../src/attachments/backing';
import { createManagedAttachmentOperations } from '../../src/attachments/operations';
import {
  MANAGED_ATTACHMENT_CLOCK_GUARD_MS as MARGIN,
  MANAGED_ATTACHMENT_GRACE_MS as GRACE,
} from '../../src/attachments/records';
import { createManagedAttachmentStore } from '../../src/attachments/store';
import { MAX_EXPIRY_MS, MAX_UNIX_MS, MESSAGE_LIMITS } from '../../src/constants';
import {
  MANAGED_BINDING,
  managedInput,
  MemoryAttachmentBacking,
  resolveContext,
} from '../conformance/managed-attachment-fixture';
import { registerManagedAttachmentConformance } from '../conformance/managed-attachment-suite';
import { deferred, ManualClock } from './template-fixtures';

function setup(decorate?: (io: MemoryAttachmentBacking) => Partial<ManagedAttachmentBacking>, checkCleanAck = false) {
  const clock = new ManualClock();
  const io = new MemoryAttachmentBacking(MANAGED_BINDING.namespace, checkCleanAck);
  const patch = decorate?.(io);
  const backing = { create: io.create.bind(io), read: io.read.bind(io), ...patch };
  const operations = createManagedAttachmentOperations(clock);
  const writer = createManagedAttachmentStore(MANAGED_BINDING, backing, operations);
  const peer = createManagedAttachmentStore(MANAGED_BINDING, io, createManagedAttachmentOperations(clock));
  const input = managedInput(clock.now());
  return { clock, io, writer, peer, input, operations, context: resolveContext(input.scope) };
}

registerManagedAttachmentConformance('atomic in-memory test backing', () => {
  const f = setup();
  return {
    ...f,
    now: () => f.clock.now(),
    waitUntil: (deadline) => {
      f.clock.wall = deadline;
    },
    purgeAsOrphan: () => f.io.purgeAsOf(f.clock.wall + GRACE + MARGIN),
    loseAck: (outcome) => {
      f.io.loseNextAck = outcome;
    },
    corrupt: f.io.corrupt.bind(f.io),
  };
});

it('copies the genuine view before yielding, then hashes it and uses the specified exact key', async () => {
  const gate = deferred<void>();
  const f = setup((io) => ({
    async create(write, req) {
      await gate.promise;
      return io.create(write, req);
    },
  }));
  const backing = Buffer.from([99, 0, 255, 13, 10, 99]);
  const view = backing.subarray(1, 5);
  const shadow = vi.fn(() => 999);
  Object.defineProperty(view, 'byteLength', { get: shadow });
  Object.defineProperty(view, 'buffer', { get: shadow });
  Object.defineProperty(view, 'byteOffset', { get: shadow });
  const input = { ...f.input, bytes: view };
  const pending = f.writer.put(input);
  backing.fill(0);
  input.filename = 'changed.pdf';
  gate.resolve();
  const { ref } = await pending;
  const expectedVersion = createHash('sha256')
    .update(`["email-managed-attachment",1,"r3",${f.input.deliverBy}]`, 'utf8')
    .digest('hex');
  const key = `ma1/${MANAGED_BINDING.namespace}/${f.input.scope}/${f.input.id}/ma1.${expectedVersion}`;
  expect([...f.io.rows.keys()]).toEqual([key]);
  expect(f.io.rows.get(key)?.metadata).toEqual({
    format: 1,
    key,
    resolverKey: ref.resolverKey,
    deliverBy: f.input.deliverBy,
    revision: 'r3',
    filename: f.input.filename,
    contentType: f.input.contentType,
    byteLength: 4,
    sha256: ref.sha256,
  });
  expect(ref).toMatchObject({
    filename: f.input.filename,
    version: `ma1.${expectedVersion}`,
    byteLength: 4,
    sha256: createHash('sha256').update(f.input.bytes).digest('hex'),
  });
  expect(await f.peer.resolve(ref, f.context)).toEqual({ status: 'found', bytes: f.input.bytes });
  expect(shadow).not.toHaveBeenCalled();
});

it('takes only exact input data, bounded private views, and trusted options without invoking getters', async () => {
  const f = setup();
  const detached = Uint8Array.of(1);
  structuredClone(detached, { transfer: [detached.buffer] });
  const getter = vi.fn();
  const invalid = expect.objectContaining({ code: 'invalid_input' });
  for (const bytes of [
    Uint8Array.of(),
    new Uint8Array(MESSAGE_LIMITS.attachmentBytes + 1),
    new Uint8Array(new SharedArrayBuffer(1)),
    detached,
    new Uint8ClampedArray(1),
    new DataView(new ArrayBuffer(1)),
    Object.create(Uint8Array.prototype),
    new Proxy(f.input.bytes, {}),
    'YWJj',
  ]) {
    await expect(f.writer.put({ ...f.input, bytes } as never)).rejects.toThrowError(invalid);
  }
  for (const input of [
    { ...f.input, namespace: MANAGED_BINDING.namespace },
    { ...f.input, scope: 'x'.repeat(65) },
    { ...f.input, scope: '..' },
    { ...f.input, id: 'folder/file' },
    { ...f.input, revision: 'x'.repeat(129) },
    ...['', '.', '..', 'a/b', 'a\\b', 'a:b', 'foo\r\nbar', 'é'.repeat(65)].map((filename) => ({
      ...f.input,
      filename,
    })),
    ...['APPLICATION/PDF', 'text/plain; charset=utf-8'].map((contentType) => ({ ...f.input, contentType })),
    Object.defineProperty({ ...f.input }, 'bytes', { get: getter }),
  ]) {
    await expect(f.writer.put(input)).rejects.toThrowError(invalid);
  }
  for (const options of [{ timeoutMs: 49 }, { timeoutMs: 30_001 }, { signal: {} }, { scope: f.input.scope }]) {
    await expect(f.writer.put(f.input, options as never)).rejects.toMatchObject({ code: 'invalid_config' });
  }
  for (const binding of [
    { ...MANAGED_BINDING, resolverKey: 'not/allowed' },
    { ...MANAGED_BINDING, namespace: MANAGED_BINDING.namespace.toUpperCase() },
    { ...MANAGED_BINDING, bucket: 'host-only' },
    Object.defineProperty({ ...MANAGED_BINDING }, 'namespace', { get: getter }),
  ]) {
    expect(() => createManagedAttachmentStore(binding, f.io)).toThrowError(
      expect.objectContaining({ code: 'invalid_config' }),
    );
  }
  expect(f.io.creates).toBe(0);
  expect(getter).not.toHaveBeenCalled();
  await expect(
    f.writer.put({ ...f.input, bytes: new Uint8Array(MESSAGE_LIMITS.attachmentBytes) }),
  ).resolves.toHaveProperty('ref.byteLength', MESSAGE_LIMITS.attachmentBytes);
});

it('checks the 30-day budget and guarded Unix bound, including exact end and overflow', async () => {
  const f = setup();
  await expect(f.writer.put({ ...f.input, deliverBy: f.clock.now() })).rejects.toMatchObject({ code: 'expired' });
  for (const deliverBy of [f.clock.now() + 0.5, f.clock.now() + MAX_EXPIRY_MS + 1, Infinity, -1]) {
    await expect(f.writer.put({ ...f.input, deliverBy })).rejects.toMatchObject({ code: 'invalid_input' });
  }
  const bound = MAX_UNIX_MS - GRACE - MARGIN;
  f.clock.wall = bound - 1;
  await expect(f.writer.put({ ...f.input, deliverBy: bound + 1 })).rejects.toMatchObject({ code: 'invalid_input' });
  expect(f.io.creates).toBe(0);
  await expect(f.writer.put({ ...f.input, deliverBy: bound })).resolves.toHaveProperty('deliverBy', bound);
  const f2 = setup();
  const horizon = f2.clock.now() + MAX_EXPIRY_MS;
  await expect(f2.writer.put({ ...f2.input, deliverBy: horizon })).resolves.toHaveProperty('deliverBy', horizon);
});

it('rechecks wall retirement immediately before an asynchronously delayed create and before issuing a receipt', async () => {
  const before = deferred<void>();
  const f = setup((io) => ({
    async create(write, req) {
      await before.promise;
      return io.create(write, req);
    },
  }));
  const delayed = f.writer.put(f.input);
  f.clock.wall = f.input.deliverBy;
  before.resolve();
  await expect(delayed).rejects.toMatchObject({ code: 'expired' });
  expect(f.io.creates).toBe(0);

  const after = deferred<void>();
  const f2 = setup((io) => ({
    async create(write, req) {
      const result = await io.create(write, req);
      await after.promise;
      return result;
    },
  }));
  const ack = f2.writer.put(f2.input);
  expect(f2.io.creates).toBe(1);
  f2.clock.wall = f2.input.deliverBy;
  after.resolve();
  await expect(ack).rejects.toMatchObject({ code: 'expired' });
  expect(f2.io.rows.size).toBe(1);
  await expect(f2.writer.put(f2.input)).rejects.toMatchObject({ code: 'expired' });
  expect(f2.io.creates).toBe(1);
});

it.each([undefined, NaN, Infinity, -1, 0])('cannot issue a receipt without valid hold evidence (%s)', async (proof) => {
  const f = setup((io) => ({
    async create(write, req) {
      await io.create(write, req);
      return proof === undefined ? { status: 'confirmed' } : { status: 'confirmed', retainedThrough: proof };
    },
  }));
  await expect(f.writer.put(f.input)).rejects.toMatchObject({ code: 'attachment_retention' });
  expect(f.io.rows.size).toBe(1);
});

it('requires hold through the exact grace boundary even on a clean ACK requiring verification', async () => {
  let hold = 0;
  const f = setup(
    (io) => ({
      async read(key, req) {
        const found = await io.read(key, req);
        return found.status === 'found' ? { ...found, retainedThrough: hold } : found;
      },
    }),
    true,
  );
  hold = f.input.deliverBy + GRACE - 1;
  await expect(f.writer.put(f.input)).rejects.toMatchObject({ code: 'attachment_retention' });
  expect(f.io.reads).toBe(1);
  const known = await f.peer.put(f.input);
  expect(await f.writer.resolve(known.ref, f.context)).toEqual({ status: 'found', bytes: f.input.bytes });
  hold++;
  const receipt = await f.writer.put(f.input);
  expect(() => f.writer.assertReceipt(receipt, f.input.scope, f.input.deliverBy)).not.toThrow();
  expect(() => f.writer.assertReceipt(receipt, f.input.scope, f.input.deliverBy + 1)).toThrowError(
    expect.objectContaining({ code: 'attachment_retention' }),
  );
});

it('checks optional producer policy only after verifying the exact body under the same budget', async () => {
  let sufficient = false;
  const order: string[] = [];
  const f = setup((io) => ({
    async create(write, req) {
      order.push('create');
      return io.create(write, req);
    },
    async read(key, req) {
      order.push('body');
      const raw = await io.read(key, req);
      f.clock.advance(30);
      return raw;
    },
    async verifyRetentionPolicy(op) {
      return op.request(async (req) => {
        order.push('policy');
        expect(req.begin()).toBe(20);
        if (!sufficient) throw new Error('synthetic private policy error');
        return true;
      });
    },
  }));
  await expect(f.writer.put(f.input, { timeoutMs: 50 })).rejects.toMatchObject({ code: 'attachment_retention' });
  expect(order).toEqual(['create', 'body', 'policy']);
  sufficient = true;
  order.length = 0;
  const { ref } = await f.writer.put(f.input, { timeoutMs: 50 });
  expect(order).toEqual(['create', 'body', 'policy']);
  order.length = 0;
  await expect(f.writer.resolve(ref, f.context)).resolves.toMatchObject({ status: 'found' });
  expect(order).toEqual(['body']);
  order.length = 0;
  f.io.corrupt(f.input.scope, ref, 'hash');
  await expect(f.writer.put(f.input, { timeoutMs: 50 })).rejects.toMatchObject({ code: 'store_incompatible' });
  expect(order).toEqual(['create', 'body']);
});

it.each([
  ['unavailable', false, 'store_unavailable', 0],
  ['throw', false, 'store_incompatible', 0],
  ['incompatible', true, 'store_incompatible', 0],
  ['confirm', true, 'write_unconfirmed', 1],
  ['throw', true, 'write_unconfirmed', 1],
  ['unavailable', true, 'write_unconfirmed', 1],
  ['confirmed', false, 'store_incompatible', 0],
] as const)(
  'normalizes create %s (dispatched: %s) without leaking SDK errors',
  async (status, dispatched, code, reads) => {
    const create = vi.fn<ManagedAttachmentBacking['create']>(async (_write, req) => {
      if (dispatched) req.begin();
      if (status === 'throw') throw { code: 'attachment_conflict', cause: 'fixture-private-sdk-url.invalid' };
      return { status };
    });
    const f = setup(() => ({ create }));
    const error: unknown = await f.writer.put(f.input).catch((error: unknown) => error);
    expect(error).toMatchObject({ code });
    expect(error).not.toHaveProperty('cause');
    expect(String(error)).not.toContain('fixture-private');
    expect(create).toHaveBeenCalledOnce();
    expect(f.io.reads).toBe(reads);
  },
);

it('normalizes absence and recognized transient reads, but rejects definite configuration faults', async () => {
  let outcome: ManagedAttachmentRead['status'] = 'missing';
  const f = setup(() => ({
    async read(_key, req) {
      req.begin();
      if (outcome === 'found') throw new Error('fixture-private');
      return { status: outcome };
    },
  }));
  const { ref } = await f.peer.put(f.input);
  for (outcome of ['missing', 'unavailable'] as const) {
    await expect(f.writer.resolve(ref, f.context)).resolves.toEqual({ status: 'unavailable' });
    await expect(f.writer.put(f.input)).rejects.toMatchObject({ code: 'write_unconfirmed' });
  }
  for (outcome of ['incompatible', 'found'] as const) {
    const promise = f.writer.resolve(ref, f.context);
    await expect(promise).rejects.toMatchObject({ code: 'store_incompatible' });
    await expect(promise).rejects.not.toThrow(/fixture-private/);
  }
  await expect(f.writer.put(f.input)).rejects.toMatchObject({ code: 'write_unconfirmed' });
  outcome = 'invalid';
  await expect(f.writer.resolve(ref, f.context)).rejects.toMatchObject({ code: 'invalid_snapshot' });
  await expect(f.writer.put(f.input)).rejects.toMatchObject({ code: 'store_incompatible' });
});

it('rejects foreign resolver keys and recomputes the version and exact-key envelope on reads', async () => {
  let change = {};
  const f = setup((io) => ({
    async read(key, req) {
      const raw = await io.read(key, req);
      return raw.status === 'found' ? { ...raw, metadata: { ...(raw.metadata as object), ...change } } : raw;
    },
  }));
  const { ref } = await f.writer.put(f.input);
  for (const bad of [
    { ...ref, resolverKey: 'foreign-key' },
    { ...ref, version: 'r3' },
    { ...ref, id: '../bill-07' },
  ]) {
    await expect(f.writer.resolve(bad, f.context)).rejects.toMatchObject({ code: 'invalid_snapshot' });
  }
  expect(f.io.reads).toBe(0);
  for (change of [
    { key: 'another-exact-key' },
    { resolverKey: 'foreign-key' },
    { revision: 'other' },
    { deliverBy: f.input.deliverBy + 1 },
    { format: 2 },
    { unrelated: true },
  ]) {
    await expect(f.writer.resolve(ref, f.context)).rejects.toMatchObject({ code: 'invalid_snapshot' });
    await expect(f.writer.put(f.input)).rejects.toMatchObject({ code: 'store_incompatible' });
  }
  change = {};
  for (const field of [{ filename: 'other.pdf' }, { contentType: 'text/plain' }, { sha256: 'a'.repeat(64) }]) {
    await expect(f.writer.resolve({ ...ref, ...field }, f.context)).rejects.toMatchObject({ code: 'invalid_snapshot' });
  }
});

it('uses only the leftover time for exact confirmation and aborts that request without a second create', async () => {
  const confirmation = deferred<{ signal: AbortSignal; budget: number }>();
  const gate = deferred<void>();
  const signals: AbortSignal[] = [];
  const f = setup((io) => ({
    async create(write, req) {
      signals.push(req.signal);
      expect(await io.create(write, req)).toMatchObject({ status: 'confirmed' });
      f.clock.advance(40);
      return { status: 'confirm' };
    },
    async read(_key, req) {
      confirmation.resolve({ signal: req.signal, budget: req.begin() });
      await gate.promise;
      return { status: 'unavailable' };
    },
  }));
  const controller = new AbortController();
  const pending = f.writer.put(f.input, { timeoutMs: 50, signal: controller.signal });
  const { signal, budget } = await confirmation.promise;
  expect(signal).not.toBe(signals[0]);
  expect(signal).not.toBe(controller.signal);
  expect(budget).toBe(10);
  f.clock.advance(10);
  await expect(pending).rejects.toMatchObject({ code: 'write_unconfirmed' });
  expect(signal.aborted).toBe(true);
  expect(controller.signal.aborted).toBe(false);
  expect(f.io.creates).toBe(1);
  expect(f.clock.timers.size).toBe(0);
  gate.resolve();
});

it.each([false, true])(
  'holds all eight slots after caller stop until actual SDK settlement (dispatched: %s)',
  async (dispatched) => {
    const gates = Array.from({ length: 8 }, () => deferred<ManagedAttachmentCreate>());
    const signals: AbortSignal[] = [];
    let submitted = 0;
    const f = setup((io) => ({
      async create(write, req) {
        const gate = gates[signals.length];
        if (!gate) return io.create(write, req);
        signals.push(req.signal);
        if (dispatched) {
          req.begin();
          submitted++;
        }
        const ack = await gate.promise;
        if (!dispatched) {
          req.begin();
          submitted++;
        }
        return ack;
      },
    }));
    const pending = gates.map((_, i) => f.writer.put({ ...f.input, id: `id-${i}` }, { timeoutMs: 50 }));
    const all = Promise.allSettled(pending);
    expect(signals).toHaveLength(8);
    await expect(f.writer.put(f.input)).rejects.toMatchObject({ code: 'busy' });
    await expect(f.writer.resolve({} as AttachmentRef, f.context)).resolves.toEqual({ status: 'unavailable' });
    // Readiness cannot allocate a separate set of slots.
    await expect(
      f.operations.run(
        { timeoutMs: 50 },
        async () => 1,
        (n) => n,
      ),
    ).rejects.toMatchObject({ code: 'busy' });
    f.clock.advance(50);
    for (const result of await all) {
      expect(result).toMatchObject({
        status: 'rejected',
        reason: { code: dispatched ? 'write_unconfirmed' : 'deadline' },
      });
    }
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    await expect(f.writer.put(f.input)).rejects.toMatchObject({ code: 'busy' });
    gates[0]!.resolve({ status: 'confirm' });
    await turn();
    await expect(f.writer.put(f.input)).resolves.toHaveProperty('ref.id', f.input.id);
    expect(submitted).toBe(dispatched ? 8 : 0);
    expect(f.io.reads).toBe(0);
    for (const gate of gates.slice(1)) gate.resolve({ status: 'confirm' });
    await turn();
    expect(f.clock.timers.size).toBe(0);
  },
);

it('uses the 30-second elapsed ceiling for a direct resolver with no worker timer', async () => {
  const pendingRead = deferred<ManagedAttachmentRead>();
  const f = setup(() => ({
    async read(_key, req) {
      expect(req.begin()).toBe(30_000);
      expect(req.signal.aborted).toBe(false);
      return pendingRead.promise;
    },
  }));
  const { ref } = await f.peer.put(f.input);
  const pending = f.writer.resolve(ref, f.context);
  f.clock.advance(30_000);
  await expect(pending).resolves.toEqual({ status: 'unavailable' });
  pendingRead.resolve({ status: 'missing' });
});

it('counts a stream of unknown transport length to clean EOF and distinguishes mismatches from interruption', async () => {
  let variation: 'valid' | 'short' | 'long' | 'interrupted' | 'hash' = 'valid';
  const f = setup((io) => ({
    async read(key, req) {
      const raw = await io.read(key, req);
      if (raw.status !== 'found') return raw;
      async function* get() {
        yield Uint8Array.of(0, 255);
        if (variation === 'interrupted') throw new Error('fixture-private');
        if (variation === 'short') return;
        yield variation === 'hash' ? Uint8Array.of(13, 11) : Uint8Array.of(13, 10);
        if (variation === 'long') yield Uint8Array.of(44);
      }
      return { ...raw, body: req.ownStream(Readable.from(get())) };
    },
  }));
  const { ref } = await f.peer.put(f.input);
  expect(await f.writer.resolve(ref, f.context)).toEqual({ status: 'found', bytes: f.input.bytes });
  for (variation of ['short', 'long', 'hash'] as const) {
    await expect(f.writer.resolve(ref, f.context)).rejects.toMatchObject({ code: 'invalid_snapshot' });
    await expect(f.writer.put(f.input)).rejects.toMatchObject({ code: 'store_incompatible' });
  }
  variation = 'interrupted';
  await expect(f.writer.resolve(ref, f.context)).resolves.toEqual({ status: 'unavailable' });
  await expect(f.writer.put(f.input)).rejects.toMatchObject({ code: 'write_unconfirmed' });
});

it('rejects contradictory announced lengths without reading and destroys the stream', async () => {
  const pull = vi.fn();
  const stream = new Readable({ read: pull });
  const f = setup((io) => ({
    async read(key, req) {
      const raw = await io.read(key, req);
      return raw.status === 'found' ? { ...raw, body: stream, transportLength: raw.transportLength ?? 17 } : raw;
    },
  }));
  const closed = once(stream, 'close');
  const { ref } = await f.peer.put(f.input);
  await expect(f.writer.resolve(ref, f.context)).rejects.toMatchObject({ code: 'invalid_snapshot' });
  await closed;
  expect(pull).not.toHaveBeenCalled();
  expect(stream.destroyed).toBe(true);
});

it('stops on the first overflowing chunk and waits for delayed body teardown before releasing capacity', async () => {
  const closeBody = deferred<void>();
  const streams: Readable[] = [];
  let pulls = 0;
  const f = setup((io) => ({
    async read(key, req) {
      const raw = await io.read(key, req);
      if (raw.status !== 'found') return raw;
      let pulled = false;
      const body = req.ownStream(
        new Readable({
          // Deliberately stalled after the first (too large) chunk.
          objectMode: true,
          highWaterMark: 0,
          read() {
            pulls++;
            if (pulled) throw new Error('must not pull the rest of an oversized body');
            pulled = true;
            this.push(new Uint8Array(MESSAGE_LIMITS.attachmentBytes + 1));
          },
          destroy(error, done) {
            void closeBody.promise.then(() => done(error));
          },
        }),
      );
      streams.push(body);
      return { ...raw, body };
    },
  }));
  const { ref } = await f.peer.put(f.input);
  const failed = await Promise.allSettled(Array.from({ length: 8 }, () => f.writer.resolve(ref, f.context)));
  expect(failed).toEqual(
    Array(8).fill(
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ code: 'invalid_snapshot' }),
      }),
    ),
  );
  expect(pulls).toBe(8);
  expect(streams.every(({ destroyed, closed }) => destroyed && !closed)).toBe(true);
  await expect(f.writer.put(f.input)).rejects.toMatchObject({ code: 'busy' });
  const closed = Promise.all(streams.map((stream) => once(stream, 'close')));
  closeBody.resolve();
  await closed;
  await expect(f.writer.put({ ...f.input, id: 'new-id' })).resolves.toHaveProperty('ref.id', 'new-id');
});

it('actively aborts an SDK header rejection with no body, holding separately registered teardown', async () => {
  const gate = deferred<void>();
  const signals: AbortSignal[] = [];
  const f = setup(() => ({
    async read(_key, req) {
      req.begin();
      signals.push(req.signal);
      req.hold(gate.promise);
      throw new Error('synthetic missing SDK transport header');
    },
  }));
  const { ref } = await f.peer.put(f.input);
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => f.writer.resolve(ref, f.context)));
  expect(results.every((result) => result.status === 'rejected')).toBe(true);
  expect(signals).toHaveLength(8);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(f.context.signal.aborted).toBe(false);
  await expect(f.writer.put({ ...f.input, id: 'fresh' })).rejects.toMatchObject({ code: 'busy' });
  gate.resolve();
  await turn();
  await expect(f.writer.put({ ...f.input, id: 'fresh' })).resolves.toHaveProperty('ref.id', 'fresh');
});

it('destroys a stream that arrives after abort, without reading it or freeing the slot early', async () => {
  const readReady = deferred<void>();
  const respond = deferred<void>();
  const finish = deferred<void>();
  const pull = vi.fn();
  const destroy = vi.fn();
  const stream = new Readable({
    read: pull,
    destroy(error, done) {
      destroy();
      void finish.promise.then(() => done(error));
    },
  });
  const f = setup((io) => ({
    async read(key, req) {
      const found = await io.read(key, req);
      readReady.resolve();
      await respond.promise;
      return found.status === 'found' ? { ...found, body: stream } : found;
    },
  }));
  const { ref } = await f.peer.put(f.input);
  const abort = new AbortController();
  const pending = f.writer.resolve(ref, resolveContext(f.input.scope, abort.signal));
  await readReady.promise;
  abort.abort(new Error('synthetic private abort'));
  await expect(pending).resolves.toEqual({ status: 'unavailable' });
  respond.resolve();
  await turn();
  expect(destroy).toHaveBeenCalledOnce();
  expect(pull).not.toHaveBeenCalled();
  expect(stream.closed).toBe(false);
  const closed = once(stream, 'close');
  finish.resolve();
  await closed;
});
