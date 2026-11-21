/** Integer UTC epoch milliseconds, from 0 through 253402300799999 inclusive. */
export type UnixMs = number;
/** Application/tenant namespace. It is not a credential or a substitute for host authorization. */
export type EmailScope = string;
export type EmailJobId = string;
export type EmailAttemptId = string;
export type Awaitable<T> = T | PromiseLike<T>;

/**
 * Trusted live SMTP opt-in. Pass the same tuple at each factory in the queue; omit it for V1 (50 recipients).
 * `namespace` is a canonical lowercase UUIDv4 for one logical backing. Keep its cap fixed; use a new namespace
 * to change it. `maxRecipients` is an integer from 51 to 1,000, counting To, Cc and Bcc together.
 * `format` selects storage, not the DTO's `version: 1`. Never select the binding from request data.
 */
export type SmtpCapacity = Readonly<{ format: 'smtp-v2'; namespace: string; maxRecipients: number }>;

/** Plain JSON at the validation boundary; this type alone does not check serialization or size. */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
export type JsonObject = { readonly [key: string]: JsonValue };
/** Bounded opaque host tokens only: do not include addresses, other personal data, or secrets. */
export type Correlation = Readonly<Record<string, string>>;

export type Mailbox = { readonly address: string; readonly name?: string };
/** Preserve recipient grouping and order; SMTP, unlike SendGrid, can use only Cc/Bcc. */
export type EmailEnvelope = {
  readonly from: Mailbox;
  readonly to: readonly Mailbox[];
  readonly cc: readonly Mailbox[];
  readonly bcc: readonly Mailbox[];
  readonly replyTo?: Mailbox;
};

export type ProviderRef =
  | { readonly kind: 'smtp'; readonly key: string; readonly mode: 'live' }
  | { readonly kind: 'sendgrid'; readonly key: string; readonly mode: 'live' | 'sandbox' };

export type EmailAdmissionKey =
  | { readonly kind: 'single'; readonly idempotencyKey: string }
  | { readonly kind: 'batch'; readonly batchId: string; readonly itemId: string };

export type TemplateIdentity = { readonly key: string; readonly revision: string };

/** A versioned, integrity-checked reference in a trusted host resolver, not a filesystem path or URL. */
export type AttachmentRef = {
  readonly resolverKey: string;
  readonly id: string;
  readonly version: string;
  readonly filename: string;
  readonly contentType: string;
  readonly byteLength: number;
  readonly sha256: string;
};

export type AttachmentResolution =
  | { readonly status: 'found'; readonly bytes: Uint8Array }
  | { readonly status: 'unavailable' };

/** Resolve a queued reference before handoff; a mutable source may no longer have the required version. */
export type AttachmentResolver = (
  ref: Readonly<AttachmentRef>,
  context: { scope: EmailScope; signal: AbortSignal },
) => Awaitable<AttachmentResolution>;

/** Copied bytes for one attempt; only the reference is part of the durable snapshot. */
export type ResolvedAttachment = { readonly ref: Readonly<AttachmentRef>; readonly bytes: Uint8Array };

type SnapshotFields = {
  readonly version: 1;
  readonly template: TemplateIdentity;
  readonly envelope: EmailEnvelope;
  readonly preparedAt: UnixMs;
  readonly expiresAt: UnixMs;
  readonly priority: number;
  readonly attachments: readonly AttachmentRef[];
  readonly correlation: Correlation;
};

/** Frozen sending data for retries. Treat it as sensitive; SendGrid's active remote version is not pinned. */
export type EmailSnapshot = SnapshotFields &
  (
    | {
        readonly kind: 'smtp';
        readonly provider: Extract<ProviderRef, { kind: 'smtp' }>;
        readonly smtpCapacity?: SmtpCapacity;
        readonly subject: string;
        readonly html?: string;
        readonly text?: string;
      }
    | {
        readonly kind: 'sendgrid';
        readonly provider: Extract<ProviderRef, { kind: 'sendgrid' }>;
        readonly smtpCapacity?: never;
        readonly templateId: string;
        readonly data: JsonObject;
      }
  );

/** Versioned, sensitive outbox value. Store it with the host's business write, then relay it unchanged. */
export type PreparedEmailCommand = {
  readonly version: 1;
  /** Present on every staged message from an opted-in SMTP lane, even below 51 recipients. */
  readonly smtpCapacity?: SmtpCapacity;
  readonly scope: EmailScope;
  readonly key: EmailAdmissionKey;
  readonly scheduleAt: UnixMs | null;
  readonly intentHash: string;
  readonly fingerprint: string;
  readonly snapshotHash: string;
  readonly snapshot: EmailSnapshot;
};

/** Timeout values are elapsed integer milliseconds, not wall-clock instants. */
export type CallOptions = { signal?: AbortSignal; timeoutMs?: number };

export interface EmailClock {
  now(): UnixMs;
  monotonicNow(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}
