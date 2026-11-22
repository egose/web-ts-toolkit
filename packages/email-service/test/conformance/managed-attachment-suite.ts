import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AttachmentRef } from '../../src';
import type { ManagedAttachmentStore } from '../../src/attachments';
import { managedInput, resolveContext } from './managed-attachment-fixture';

export type ManagedAttachmentFixture = {
  /** Separate stores configured against the same namespace/backing. */
  writer: ManagedAttachmentStore;
  peer: ManagedAttachmentStore;
  now(): number;
  /** Time to retire the original version; either advance an injected clock or wait. */
  waitUntil(deadline: number): void | Promise<void>;
  /** Privileged fixture-only simulation of due retention cleanup, never via a store method. */
  purgeAsOrphan(scope: string, ref: AttachmentRef): void | Promise<void>;
  /** Drop the next successful create reply; optionally make its one confirmation read unavailable. */
  loseAck(result: 'visible' | 'unavailable'): void | Promise<void>;
  /** Preserve the stored user metadata but return corrupt actual bytes for this exact identity. */
  corrupt(scope: string, ref: AttachmentRef, damage: 'hash' | 'length'): void | Promise<void>;
  close?(): void | Promise<void>;
};

/** Register against a disposable backing and isolated test fault hooks; no access to a vendor SDK here. */
export function registerManagedAttachmentConformance(
  name: string,
  setup: () => ManagedAttachmentFixture | Promise<ManagedAttachmentFixture>,
): void {
  describe(`${name}: managed attachment conformance`, () => {
    let f: ManagedAttachmentFixture;
    beforeEach(async () => {
      f = await setup();
    });
    afterEach(async () => f?.close?.());

    it('returns a frozen ordinary ref, issuing proof only for the exact writer and scope', async () => {
      const input = managedInput(f.now());
      const first = await f.writer.put(input);
      expect(Object.isFrozen(first) && Object.isFrozen(first.ref)).toBe(true);
      expect(Object.keys(first).sort()).toEqual(['deliverBy', 'ref']);
      expect(Object.keys(first.ref).sort()).toEqual([
        'byteLength',
        'contentType',
        'filename',
        'id',
        'resolverKey',
        'sha256',
        'version',
      ]);
      expect(first).toMatchObject({
        deliverBy: input.deliverBy,
        ref: {
          filename: input.filename,
          contentType: input.contentType,
          byteLength: input.bytes.length,
          id: input.id,
          resolverKey: f.writer.resolverKey,
          version: expect.stringMatching(/^ma1\.[0-9a-f]{64}$/),
        },
      });
      const read = f.peer.resolve;
      const found = await read(first.ref, resolveContext(input.scope));
      expect(found).toEqual({ status: 'found', bytes: input.bytes });
      if (found.status === 'found') found.bytes.fill(1);
      expect(await read(first.ref, resolveContext(input.scope))).toEqual({ status: 'found', bytes: input.bytes });
      expect(() => f.writer.assertReceipt(first, input.scope, first.deliverBy)).not.toThrow();
      expect(() => f.writer.assertReceipt(first, 'Tenant-B', first.deliverBy)).toThrowError(
        expect.objectContaining({ code: 'attachment_retention' }),
      );
      expect(() => f.peer.assertReceipt(first, input.scope, first.deliverBy)).toThrowError(
        expect.objectContaining({ code: 'attachment_retention' }),
      );
      expect(() => f.writer.assertReceipt(structuredClone(first), input.scope, first.deliverBy)).toThrowError(
        expect.objectContaining({ code: 'attachment_retention' }),
      );
      const second = await f.writer.put(input);
      expect(second).toEqual(first);
      expect(second).not.toBe(first);
    });

    it('converges concurrent identical writes from independent writers', async () => {
      const input = managedInput(f.now());
      const [first, second] = await Promise.all([f.writer.put(input), f.peer.put(input)]);
      expect(first).toEqual(second);
      expect(() => f.writer.assertReceipt(first, input.scope, input.deliverBy)).not.toThrow();
      expect(() => f.peer.assertReceipt(second, input.scope, input.deliverBy)).not.toThrow();
    });

    it('conflicts on a concurrent unequal write without replacing the winner', async () => {
      const input = managedInput(f.now());
      const other = { ...input, bytes: Uint8Array.of(4, 5, 6, 7) };
      const results = await Promise.allSettled([f.writer.put(input), f.peer.put(other)]);
      const winner = results.find((result) => result.status === 'fulfilled');
      expect(winner?.status).toBe('fulfilled');
      expect(results.find((result) => result.status === 'rejected')).toMatchObject({
        reason: { code: 'attachment_conflict' },
      });
      if (!winner) throw new Error('No attachment winner');
      expect(await f.peer.resolve(winner.value.ref, resolveContext(input.scope))).toEqual({
        status: 'found',
        bytes: results[0]?.status === 'fulfilled' ? input.bytes : other.bytes,
      });
    });

    it('treats size, filename and MIME as immutable', async () => {
      const input = managedInput(f.now());
      const { ref } = await f.writer.put(input);
      for (const conflict of [
        { bytes: Uint8Array.of(1) },
        { filename: 'different.pdf' },
        { contentType: 'text/plain' },
      ]) {
        await expect(f.peer.put({ ...input, ...conflict })).rejects.toMatchObject({ code: 'attachment_conflict' });
      }
      expect((await f.peer.put(input)).ref).toEqual(ref);
    });

    it('uses case-sensitive scope and never looks up the same identity in another scope', async () => {
      const input = managedInput(f.now());
      const foreign = { ...input, scope: input.scope.toLowerCase(), bytes: Uint8Array.of(3) };
      const { ref } = await f.writer.put(input);
      expect(await f.peer.resolve(ref, resolveContext(foreign.scope))).toEqual({ status: 'unavailable' });
      const { ref: otherRef } = await f.peer.put(foreign);
      expect(await f.peer.resolve(otherRef, resolveContext(foreign.scope))).toEqual({
        status: 'found',
        bytes: foreign.bytes,
      });
      expect(await f.peer.resolve(ref, resolveContext(input.scope))).toEqual({ status: 'found', bytes: input.bytes });
    });

    it('binds a changed deadline to a new version, not extended proof for the old one', async () => {
      const input = managedInput(f.now());
      const old = await f.writer.put(input);
      const next = await f.writer.put({ ...input, deliverBy: input.deliverBy + 1000, bytes: Uint8Array.of(3) });
      expect(next.ref.version).not.toBe(old.ref.version);
      expect(() => f.writer.assertReceipt(old, input.scope, next.deliverBy)).toThrowError(
        expect.objectContaining({ code: 'attachment_retention' }),
      );
      expect(await f.peer.resolve(old.ref, resolveContext(input.scope))).toEqual({
        status: 'found',
        bytes: input.bytes,
      });
    });

    it('keeps an unadmitted orphan readable during grace but cannot re-put its retired identity after purge', async () => {
      const input = managedInput(f.now(), { deliverBy: f.now() + 2_000 });
      const { ref } = await f.writer.put(input);
      await f.waitUntil(input.deliverBy);
      await expect(f.writer.put(input)).rejects.toMatchObject({ code: 'expired' });
      expect(await f.peer.resolve(ref, resolveContext(input.scope))).toEqual({ status: 'found', bytes: input.bytes });
      await f.purgeAsOrphan(input.scope, ref);
      expect(await f.peer.resolve(ref, resolveContext(input.scope))).toEqual({ status: 'unavailable' });
      await expect(f.peer.put(input)).rejects.toMatchObject({ code: 'expired' });
      expect(await f.peer.resolve(ref, resolveContext(input.scope))).toEqual({ status: 'unavailable' });
    });

    it.each(['hash', 'length'] as const)(
      'fails closed on wrong actual %s even when metadata matches',
      async (damage) => {
        const input = managedInput(f.now());
        const { ref } = await f.writer.put(input);
        await f.corrupt(input.scope, ref, damage);
        await expect(f.peer.resolve(ref, resolveContext(input.scope))).rejects.toMatchObject({
          code: 'invalid_snapshot',
        });
        await expect(f.peer.put(input)).rejects.toMatchObject({ code: 'store_incompatible' });
      },
    );

    it('does not write on an already-aborted put', async () => {
      const input = managedInput(f.now());
      await expect(f.writer.put(input, { signal: AbortSignal.abort(new Error('fixture')) })).rejects.toMatchObject({
        code: 'aborted',
      });
      await expect(f.peer.put({ ...input, bytes: Uint8Array.of(1) })).resolves.toHaveProperty('ref.byteLength', 1);
    });

    it('confirms a dropped create ACK with a strong read when the commit is visible', async () => {
      const input = managedInput(f.now());
      await f.loseAck('visible');
      const confirmed = await f.writer.put(input);
      expect((await f.peer.put(input)).ref).toEqual(confirmed.ref);
      expect(await f.peer.resolve(confirmed.ref, resolveContext(input.scope))).toEqual({
        status: 'found',
        bytes: input.bytes,
      });
    });

    it('replays the original upload after a dropped ACK with unavailable confirmation', async () => {
      const input = managedInput(f.now());
      await f.loseAck('unavailable');
      await expect(f.writer.put(input)).rejects.toMatchObject({ code: 'write_unconfirmed' });
      const recovered = await f.peer.put(input);
      expect(await f.writer.resolve(recovered.ref, resolveContext(input.scope))).toEqual({
        status: 'found',
        bytes: input.bytes,
      });
    });
  });
}
