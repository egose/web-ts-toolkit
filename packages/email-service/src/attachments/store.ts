import { Readable } from 'node:stream';
import { MAX_EXPIRY_MS, MESSAGE_LIMITS } from '../constants';
import type { AttachmentRef, AttachmentResolution, CallOptions, EmailScope, UnixMs } from '../contracts/message';
import { readCallOptions } from '../internal/budget';
import { bindMethod, readPortMember } from '../internal/callbacks';
import { sha256 } from '../internal/canonical-json';
import { attachmentByteView, validateAttachmentRef } from '../internal/message-codecs';
import { allowedErrorCode, identifier, invalid, readRecord, scopeToken, unixMs } from '../internal/validation';
import type {
  ManagedAttachmentBacking,
  ManagedAttachmentOperation,
  ManagedAttachmentRead,
  ManagedAttachmentWrite,
} from './backing';
import type { ManagedAttachmentBindingOptions, ManagedAttachmentReceipt, ManagedAttachmentStore } from './contracts';
import { createManagedAttachmentOperations, MANAGED_ATTACHMENT_CALL_BOUNDS } from './operations';
import { readManagedAttachmentBody } from './read-body';
import {
  isManagedVersion,
  managedAttachmentKey,
  managedDeadline,
  managedVersion,
  MANAGED_ATTACHMENT_GRACE_MS,
  readManagedAttachmentBinding,
  readManagedAttachmentMetadata,
  sameAttachmentRef,
} from './records';

const UNAVAILABLE = Object.freeze({ status: 'unavailable' } as const);
const STOP = ['aborted', 'deadline'] as const;

/** Internal factory; only vendor-specific factories may expose the resulting store. */
export function createManagedAttachmentStore(
  options: ManagedAttachmentBindingOptions,
  backing: ManagedAttachmentBacking,
  operations = createManagedAttachmentOperations(),
): ManagedAttachmentStore {
  const { resolverKey, namespace } = readManagedAttachmentBinding(options);
  const create = bindMethod<ManagedAttachmentBacking['create']>(backing, 'create');
  const read = bindMethod<ManagedAttachmentBacking['read']>(backing, 'read');
  const verifyRetentionPolicy =
    readPortMember(backing, 'verifyRetentionPolicy') === undefined
      ? undefined
      : bindMethod<NonNullable<ManagedAttachmentBacking['verifyRetentionPolicy']>>(backing, 'verifyRetentionPolicy');
  const proofs = new WeakMap<ManagedAttachmentReceipt, { scope: EmailScope; retainedThrough: UnixMs }>();

  function live(deliverBy: UnixMs): void {
    const now = operations.wallNow();
    if (deliverBy <= now) invalid('expired');
    if (deliverBy - now > MAX_EXPIRY_MS) invalid('invalid_input');
  }

  function candidate(input: unknown) {
    const code = 'invalid_input';
    const raw = readRecord(
      input,
      ['scope', 'id', 'revision', 'deliverBy', 'filename', 'contentType', 'bytes'],
      [],
      code,
    );
    const scope = scopeToken(raw.scope, code);
    const revision = identifier(raw.revision, code);
    const deliverBy = managedDeadline(raw.deliverBy, code);
    live(deliverBy);
    const bytes = new Uint8Array(attachmentByteView(raw.bytes, 1, MESSAGE_LIMITS.attachmentBytes, code));
    const ref = validateAttachmentRef(
      {
        resolverKey,
        id: raw.id,
        version: managedVersion(revision, deliverBy),
        filename: raw.filename,
        contentType: raw.contentType,
        byteLength: bytes.byteLength,
        sha256: sha256(bytes),
      },
      code,
    );
    const { filename, contentType, byteLength, sha256: digest } = ref;
    const key = managedAttachmentKey(namespace, scope, ref);
    const write: ManagedAttachmentWrite = Object.freeze({
      metadata: Object.freeze({
        key,
        format: 1,
        resolverKey,
        revision,
        deliverBy,
        filename,
        contentType,
        byteLength,
        sha256: digest,
      }),
      bytes,
    });
    return { scope, ref, key, deliverBy, write };
  }

  // The code for corrupt data differs for worker resolution and writer confirmation. In either case,
  // verify the exact point-read envelope and bounded actual body, not metadata/ETag alone.
  function readVerified(
    op: ManagedAttachmentOperation,
    key: string,
    expected: AttachmentRef,
    forWrite: boolean,
    beforeRead?: () => void,
  ) {
    const code = forWrite ? 'store_incompatible' : 'invalid_snapshot';
    return op.request(
      async (request) => {
        let raw: ManagedAttachmentRead;
        try {
          raw = await read(key, request);
        } catch {
          return invalid(forWrite ? 'write_unconfirmed' : 'store_incompatible');
        }
        if (raw.status === 'found' && raw.body instanceof Readable) request.ownStream(raw.body);
        request.check();
        switch (raw.status) {
          case 'missing':
            if (!request.dispatched) invalid('store_incompatible');
            return null;
          case 'unavailable':
            return invalid('store_unavailable');
          case 'invalid':
            return invalid(code);
          case 'found': {
            if (!request.dispatched) invalid('store_incompatible');
            const ref = readManagedAttachmentMetadata(raw.metadata, key, expected, code);
            if (!forWrite && !sameAttachmentRef(ref, expected)) invalid(code);
            const bytes = await readManagedAttachmentBody(raw.body, ref, raw.transportLength, request, code);
            request.check();
            return { ref, bytes, retainedThrough: raw.retainedThrough };
          }
          default:
            return invalid('store_incompatible');
        }
      },
      beforeRead ? { beforeDispatch: beforeRead } : undefined,
    );
  }

  return Object.freeze<ManagedAttachmentStore>({
    resolverKey,
    async put(input, options: CallOptions = {}) {
      const call = readCallOptions(options, MANAGED_ATTACHMENT_CALL_BOUNDS);
      let uncertain = false;
      try {
        return await operations.run(
          call,
          async (op) => {
            // run() owns a slot and calls this before yielding. No caller-owned view survives.
            const { scope, key, ref, deliverBy, write } = candidate(input);
            const ack = await op.request(
              async (request) => {
                try {
                  return readRecord(
                    await create(write, request),
                    ['status'],
                    ['retainedThrough'],
                    'store_incompatible',
                  );
                } catch {
                  return { status: uncertain ? 'confirm' : 'incompatible' };
                }
              },
              {
                beforeDispatch: () => live(deliverBy),
                onDispatch: () => {
                  uncertain = true;
                },
              },
            );
            op.check();
            if (ack.status === 'incompatible') invalid('store_incompatible');
            if (!uncertain) invalid(ack.status === 'unavailable' ? 'store_unavailable' : 'store_incompatible');
            let retainedThrough = ack.retainedThrough;
            if (ack.status !== 'confirmed' || verifyRetentionPolicy) {
              try {
                const existing = await readVerified(op, key, ref, true, () => live(deliverBy));
                op.check();
                if (!existing) invalid('write_unconfirmed');
                uncertain = false;
                if (!sameAttachmentRef(existing.ref, ref)) invalid('attachment_conflict');
                retainedThrough = existing.retainedThrough;
              } catch (error) {
                if (allowedErrorCode(error, ['store_unavailable'])) invalid('write_unconfirmed');
                throw error;
              }
            }
            uncertain = false;
            live(deliverBy);
            const hold = unixMs(retainedThrough, 'attachment_retention');
            if (hold < deliverBy + MANAGED_ATTACHMENT_GRACE_MS) invalid('attachment_retention');
            if (verifyRetentionPolicy) {
              op.check();
              let verified = false;
              try {
                verified = await verifyRetentionPolicy({
                  check: op.check,
                  request: (invoke) => op.request(invoke, { beforeDispatch: () => live(deliverBy) }),
                });
              } catch {
                // No native policy/authorization errors escape, and only affirmative evidence is accepted.
              }
              op.check();
              live(deliverBy);
              if (verified !== true) invalid('attachment_retention');
            }
            return { ref, scope, deliverBy, hold };
          },
          ({ ref, scope, deliverBy, hold }) => {
            live(deliverBy);
            const receipt = Object.freeze({ ref, deliverBy });
            proofs.set(receipt, { scope, retainedThrough: hold });
            return receipt;
          },
        );
      } catch (error) {
        if (uncertain && allowedErrorCode(error, STOP)) invalid('write_unconfirmed');
        throw error;
      }
    },
    async resolve(input, context): Promise<AttachmentResolution> {
      const code = 'invalid_snapshot';
      const raw = readRecord(context, ['scope', 'signal'], [], code);
      const scope = scopeToken(raw.scope, code);
      const { signal } = readCallOptions({ signal: raw.signal }, MANAGED_ATTACHMENT_CALL_BOUNDS);
      if (!signal) invalid('invalid_config');
      try {
        return await operations.run(
          { timeoutMs: MANAGED_ATTACHMENT_CALL_BOUNDS.max, signal },
          async (op) => {
            const ref = validateAttachmentRef(input, code);
            if (ref.resolverKey !== resolverKey || !isManagedVersion(ref.version)) invalid(code);
            return readVerified(op, managedAttachmentKey(namespace, scope, ref), ref, false);
          },
          (found) => (found ? Object.freeze({ status: 'found', bytes: found.bytes }) : UNAVAILABLE),
        );
      } catch (error) {
        if (allowedErrorCode(error, ['store_unavailable', 'busy', ...STOP])) return UNAVAILABLE;
        throw error;
      }
    },
    assertReceipt(receipt, scope, expiresAt) {
      const code = 'attachment_retention';
      const proof = proofs.get(receipt);
      const expiry = unixMs(expiresAt, code);
      if (
        !proof ||
        proof.scope !== scope ||
        expiry > receipt.deliverBy ||
        expiry + MANAGED_ATTACHMENT_GRACE_MS > proof.retainedThrough
      ) {
        invalid(code);
      }
    },
  });
}
