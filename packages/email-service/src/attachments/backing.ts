import type { Readable } from 'node:stream';
import type { UnixMs } from '../contracts/message';

/** Internal port only. No client, credentials, storage location or retention fields go in an AttachmentRef. */
export type ManagedAttachmentMetadata = Readonly<{
  key: string;
  format: 1;
  resolverKey: string;
  revision: string;
  deliverBy: UnixMs;
  filename: string;
  contentType: string;
  byteLength: number;
  sha256: string;
}>;

export type ManagedAttachmentWrite = Readonly<{
  metadata: ManagedAttachmentMetadata;
  /** Store-owned copy; the backing must not mutate it. */
  bytes: Uint8Array;
}>;

export type ManagedAttachmentCreate =
  | Readonly<{ status: 'confirmed'; retainedThrough?: UnixMs }>
  | Readonly<{ status: 'confirm' | 'unavailable' | 'incompatible' }>;

export type ManagedAttachmentRead =
  | Readonly<{
      status: 'found';
      metadata: unknown;
      body: Readable | Uint8Array;
      transportLength?: number;
      /**
       * Conservative minimum hold, already reduced for the clock guard. With verifyRetentionPolicy
       * this bound is usable only if that producer policy check succeeds. Not needed by workers.
       */
      retainedThrough?: UnixMs;
    }>
  | Readonly<{ status: 'missing' | 'unavailable' | 'invalid' | 'incompatible' }>;

export type ManagedAttachmentRequest = Readonly<{
  /** Ephemeral signal: used for this SDK request/body, never for the caller-owned client. */
  signal: AbortSignal;
  dispatched: boolean;
  check(): void;
  /** Call once immediately before SDK submission. Returns the remaining elapsed budget in ms for the SDK. */
  begin(): number;
  /** Register a response stream as soon as available (even on a stopped call), before inspecting headers. */
  ownStream(stream: Readable): Readable;
  /** Register other real transport teardown before the invoked SDK promise settles. */
  hold(task: Promise<unknown>): void;
}>;

export type DispatchHooks = Readonly<{ beforeDispatch?: () => void; onDispatch?: () => void }>;

export type ManagedAttachmentOperation = Readonly<{
  check(): void;
  request<T>(invoke: (request: ManagedAttachmentRequest) => Promise<T>, hooks?: DispatchHooks): Promise<T>;
}>;

export type ManagedAttachmentBacking = Readonly<{
  /**
   * One immutable conditional create. 'confirmed' is a durable ACK of these exact bytes/metadata, usable
   * without a read. Return 'confirm' for a collision, possible commit or ACK requiring independent proof.
   * 'unavailable' requires known pre-dispatch unavailability; 'incompatible' is a definitive rejection.
   * Both port methods await the actual SDK work; do not substitute a race against cancellation for it.
   */
  create(write: ManagedAttachmentWrite, request: ManagedAttachmentRequest): Promise<ManagedAttachmentCreate>;
  /**
   * One strong point read at this key. 'missing' is not a missing/misconfigured backing.
   * 'invalid' denotes a corrupt stored object (e.g. a projected-out oversize BSON Binary).
   */
  read(key: string, request: ManagedAttachmentRequest): Promise<ManagedAttachmentRead>;
  /**
   * Optional producer-only control-plane verification after an exact, verified body read. Use only
   * op.request() under this budget for policy RPCs, not further object I/O. Only true proves the policy.
   */
  verifyRetentionPolicy?(
    op: Readonly<{
      check(): void;
      request<T>(invoke: (request: ManagedAttachmentRequest) => Promise<T>): Promise<T>;
    }>,
  ): Promise<boolean>;
}>;
