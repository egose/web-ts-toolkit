import type {
  AttachmentRef,
  AttachmentResolver,
  CallOptions,
  EmailScope,
  SmtpCapacity,
  UnixMs,
} from '../contracts/message';

/** Upload outside template preparation. Keep the same revision and deadline when retrying an uncertain write. */
export type PutManagedAttachmentInput = Readonly<{
  scope: EmailScope;
  id: string;
  revision: string;
  deliverBy: UnixMs;
  filename: string;
  contentType: string;
  /** A genuine Uint8Array or Buffer view, from 1 byte to 2 MiB. Copied before asynchronous I/O. */
  bytes: Uint8Array;
}>;

/** Local proof from one writer. Use only `ref` in the message; do not persist or transfer the receipt. */
export type ManagedAttachmentReceipt = Readonly<{ ref: AttachmentRef; deliverBy: UnixMs }>;

export type ManagedAttachmentStore = Readonly<{
  resolverKey: string;
  /** Create once or verify an identical winner. `write_unconfirmed` can mean the upload committed. */
  put: (input: PutManagedAttachmentInput, options?: CallOptions) => Promise<ManagedAttachmentReceipt>;
  /** Detached resolver. A worker may configure the same backing with a read-only client. */
  resolve: AttachmentResolver;
  /** Certify the actual frozen expiry plus the 24-hour grace, using proof issued by this writer. */
  assertReceipt: (receipt: ManagedAttachmentReceipt, scope: EmailScope, expiresAt: UnixMs) => void;
}>;

/** Trusted host configuration. Do not repoint an existing resolver key or namespace. */
export type ManagedAttachmentBindingOptions = Readonly<{ resolverKey: string; namespace: string }>;

export type ManagedAttachmentPreparationOptions = Readonly<{
  scope: EmailScope;
  /** Exhaustive trusted bindings for this scope, not just the stores with supplied receipts. */
  stores: readonly ManagedAttachmentStore[];
  receipts: readonly ManagedAttachmentReceipt[];
  /** The same trusted binding as the registry and queue, only for the opt-in SMTP lane. */
  smtpCapacity?: SmtpCapacity;
}>;
