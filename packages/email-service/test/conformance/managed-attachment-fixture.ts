import type { AttachmentRef } from '../../src';
import type { ManagedAttachmentBindingOptions, PutManagedAttachmentInput } from '../../src/attachments';
import type {
  ManagedAttachmentBacking,
  ManagedAttachmentCreate,
  ManagedAttachmentRead,
  ManagedAttachmentRequest,
  ManagedAttachmentWrite,
} from '../../src/attachments/backing';
import {
  managedAttachmentKey,
  MANAGED_ATTACHMENT_CLOCK_GUARD_MS,
  MANAGED_ATTACHMENT_GRACE_MS,
} from '../../src/attachments/records';

export const MANAGED_BINDING = Object.freeze({
  resolverKey: 'managed-test',
  namespace: '9b2f6522-fbe7-4c21-a950-bc875a79c10e',
} satisfies ManagedAttachmentBindingOptions);

export function managedInput(now: number, fields: Partial<PutManagedAttachmentInput> = {}): PutManagedAttachmentInput {
  return {
    scope: 'Tenant-A',
    id: 'bill-07',
    revision: 'r3',
    deliverBy: now + 60_000,
    filename: 'Résumé.pdf',
    contentType: 'application/pdf',
    bytes: Uint8Array.of(0, 255, 13, 10),
    ...fields,
  };
}

export function resolveContext(
  scope: string,
  signal: AbortSignal = new AbortController().signal,
): { scope: string; signal: AbortSignal } {
  return { scope, signal };
}

/** Small atomic backing; not part of the package or proof of any backend's behavior. */
export class MemoryAttachmentBacking implements ManagedAttachmentBacking {
  readonly rows = new Map<string, ManagedAttachmentWrite>();
  creates = 0;
  reads = 0;
  loseNextAck?: 'visible' | 'unavailable';
  #hideNextRead = false;

  constructor(
    private readonly namespace = MANAGED_BINDING.namespace,
    private readonly checkCleanAck = false,
  ) {}

  async create(write: ManagedAttachmentWrite, request: ManagedAttachmentRequest): Promise<ManagedAttachmentCreate> {
    request.begin();
    this.creates++;
    const { metadata, bytes } = write;
    if (this.rows.has(metadata.key)) return { status: 'confirm' };
    this.rows.set(metadata.key, { metadata, bytes: new Uint8Array(bytes) });
    if (this.loseNextAck) {
      this.#hideNextRead = this.loseNextAck === 'unavailable';
      delete this.loseNextAck;
      throw new Error('Synthetic lost write acknowledgement');
    }
    return this.checkCleanAck
      ? { status: 'confirm' }
      : { status: 'confirmed', retainedThrough: metadata.deliverBy + MANAGED_ATTACHMENT_GRACE_MS };
  }

  async read(key: string, request: ManagedAttachmentRequest): Promise<ManagedAttachmentRead> {
    request.begin();
    this.reads++;
    if (this.#hideNextRead) {
      this.#hideNextRead = false;
      return { status: 'unavailable' };
    }
    const row = this.rows.get(key);
    return row
      ? {
          status: 'found',
          metadata: row.metadata,
          body: row.bytes,
          retainedThrough: row.metadata.deliverBy + MANAGED_ATTACHMENT_GRACE_MS,
        }
      : { status: 'missing' };
  }

  corrupt(scope: string, ref: AttachmentRef, damage: 'hash' | 'length'): void {
    const key = managedAttachmentKey(this.namespace, scope, ref);
    const row = this.rows.get(key);
    if (!row) throw new Error('Missing fixture attachment');
    const bytes = new Uint8Array(damage === 'length' ? row.bytes.length + 1 : row.bytes.length);
    bytes.set(row.bytes);
    bytes[0] = 42;
    this.rows.set(key, { metadata: row.metadata, bytes });
  }

  purgeAsOf(now: number): void {
    for (const [key, { metadata }] of this.rows) {
      if (now >= metadata.deliverBy + MANAGED_ATTACHMENT_GRACE_MS + MANAGED_ATTACHMENT_CLOCK_GUARD_MS) {
        this.rows.delete(key);
      }
    }
  }
}
