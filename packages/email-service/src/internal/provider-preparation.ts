import { MESSAGE_LIMITS, WORKER_LIMIT_BOUNDS } from '../constants';
import type { AttachmentRef, EmailSnapshot, ProviderRef } from '../contracts/message';
import type { ProviderCall, ProviderSubmission } from '../contracts/provider';
import { readCallOptions } from './budget';
import { copyAttachmentBytes, validateAttachmentRef, validateSnapshot } from './message-codecs';
import { readStoreId } from './store-codecs';
import { denseArrayLength, integer, invalid, ownData, readRecord } from './validation';

function sameRef(a: AttachmentRef, b: AttachmentRef): boolean {
  return (
    a.resolverKey === b.resolverKey &&
    a.id === b.id &&
    a.version === b.version &&
    a.filename === b.filename &&
    a.contentType === b.contentType &&
    a.byteLength === b.byteLength &&
    a.sha256 === b.sha256
  );
}

/** Validate and detach a provider input before handoff. Resolved bytes are private to the adapter. */
export function readProviderSubmission<K extends ProviderRef['kind']>(
  input: unknown,
  ref: ProviderRef & { kind: K },
): ProviderSubmission<Extract<EmailSnapshot, { kind: K }>> {
  const code = 'invalid_snapshot';
  const raw = readRecord(input, ['jobId', 'attemptId', 'snapshot', 'attachments'], [], code);
  const jobId = readStoreId(raw.jobId, code);
  const attemptId = readStoreId(raw.attemptId, code);
  const { snapshot } = validateSnapshot(raw.snapshot);
  if (ref.kind !== snapshot.kind || ref.key !== snapshot.provider.key || ref.mode !== snapshot.provider.mode) {
    invalid('provider_mismatch');
  }
  const length = denseArrayLength(raw.attachments, MESSAGE_LIMITS.attachments, code);
  if (length !== snapshot.attachments.length) invalid(code);
  const attachments = snapshot.attachments.map((expected, index) => {
    const resolved = readRecord(ownData(raw.attachments as object, String(index), code), ['ref', 'bytes'], [], code);
    if (!sameRef(expected, validateAttachmentRef(resolved.ref, code))) invalid(code);
    return Object.freeze({ ref: expected, bytes: copyAttachmentBytes(expected, resolved.bytes, code) });
  });
  return Object.freeze({
    jobId,
    attemptId,
    snapshot: snapshot as Extract<EmailSnapshot, { kind: K }>,
    attachments: Object.freeze(attachments),
  });
}

/** The worker may give a child submission a shorter budget than the public worker option floor. */
export function readProviderCall(input: unknown): ProviderCall {
  const code = 'invalid_config';
  const raw = readRecord(input, ['signal', 'timeoutMs'], [], code);
  const bounds = { ...WORKER_LIMIT_BOUNDS.providerTimeoutMs, min: 1 };
  const timeoutMs = integer(raw.timeoutMs, bounds.min, bounds.max, code);
  const { signal } = readCallOptions(raw, bounds);
  if (!signal) invalid(code);
  return { timeoutMs, signal };
}
