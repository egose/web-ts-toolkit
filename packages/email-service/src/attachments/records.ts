import { MAX_UNIX_MS } from '../constants';
import type { AttachmentRef, EmailScope, UnixMs } from '../contracts/message';
import type { EmailErrorCode } from '../errors';
import { sha256 } from '../internal/canonical-json';
import { validateAttachmentRef } from '../internal/message-codecs';
import { identifier, integer, invalid, readRecord, uuidV4 } from '../internal/validation';
import type { ManagedAttachmentBindingOptions } from './contracts';

export const MANAGED_ATTACHMENT_GRACE_MS = 86_400_000;
/** Worst cross-clock difference (2 x 60 seconds), plus a one-second boundary margin. */
export const MANAGED_ATTACHMENT_CLOCK_GUARD_MS = 121_000;

export function readManagedAttachmentBinding(input: unknown): ManagedAttachmentBindingOptions {
  const code = 'invalid_config';
  const raw = readRecord(input, ['resolverKey', 'namespace'], [], code);
  return Object.freeze({ resolverKey: identifier(raw.resolverKey, code), namespace: uuidV4(raw.namespace, code) });
}

export function managedVersion(revision: string, deliverBy: UnixMs): string {
  return `ma1.${sha256(JSON.stringify(['email-managed-attachment', 1, revision, deliverBy]))}`;
}

export function isManagedVersion(value: string): boolean {
  return /^ma1\.[0-9a-f]{64}$/.test(value);
}

export function managedAttachmentBoundary(namespace: string): string {
  return `ma1/${namespace}/`;
}

export function managedAttachmentKey(namespace: string, scope: EmailScope, ref: AttachmentRef): string {
  return `${managedAttachmentBoundary(namespace)}${scope}/${ref.id}/${ref.version}`;
}

export function managedDeadline(input: unknown, code: EmailErrorCode): UnixMs {
  return integer(input, 0, MAX_UNIX_MS - MANAGED_ATTACHMENT_GRACE_MS - MANAGED_ATTACHMENT_CLOCK_GUARD_MS, code);
}

export function sameAttachmentRef(a: AttachmentRef, b: AttachmentRef): boolean {
  return (
    a.resolverKey === b.resolverKey &&
    a.id === b.id &&
    a.version === b.version &&
    a.sha256 === b.sha256 &&
    a.byteLength === b.byteLength &&
    a.filename === b.filename &&
    a.contentType === b.contentType
  );
}

/** Backends translate native bytes/headers to this envelope; the common reader still checks all fields. */
export function readManagedAttachmentMetadata(
  raw: unknown,
  key: string,
  expected: AttachmentRef,
  code: EmailErrorCode,
): AttachmentRef {
  const {
    format,
    key: storedKey,
    revision,
    deliverBy,
    ...ref
  } = readRecord(
    raw,
    ['key', 'format', 'resolverKey', 'revision', 'deliverBy', 'filename', 'contentType', 'byteLength', 'sha256'],
    [],
    code,
  );
  if (
    format !== 1 ||
    storedKey !== key ||
    ref.resolverKey !== expected.resolverKey ||
    managedVersion(identifier(revision, code), managedDeadline(deliverBy, code)) !== expected.version
  ) {
    invalid(code);
  }
  return validateAttachmentRef({ ...ref, id: expected.id, version: expected.version }, code);
}
