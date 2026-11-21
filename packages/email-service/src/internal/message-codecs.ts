import { isIP } from 'node:net';
import { types } from 'node:util';
import { EMAIL_FORMAT_VERSION, MAX_EXPIRY_MS, MESSAGE_LIMITS, PRIORITY } from '../constants';
import type {
  AttachmentRef,
  Correlation,
  EmailEnvelope,
  EmailSnapshot,
  Mailbox,
  ProviderRef,
  TemplateIdentity,
  UnixMs,
} from '../contracts/message';
import type { EmailErrorCode } from '../errors';
import { canonicalJson, copyJsonObject, sha256 } from './canonical-json';
import {
  assertCapacityProvider,
  assertCapacityTag,
  capacityTag,
  recipientLimit,
  type CapacityContext,
} from './smtp-capacity';
import {
  hashToken,
  headerString,
  identifier,
  integer,
  invalid,
  jsonKey,
  opaqueToken,
  ownData,
  plainKeys,
  readArray,
  readRecord,
  unixMs,
  utf8String,
} from './validation';

const L = MESSAGE_LIMITS;
const SNAPSHOT = 'invalid_snapshot';
const DOT_ATOM = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DNS_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const MIME_TYPE = /^[-a-z0-9!#$%&'*+.^_`{|}~]+\/[-a-z0-9!#$%&'*+.^_`{|}~]+$/;

export function validateProviderRef(input: unknown, code: EmailErrorCode = SNAPSHOT): ProviderRef {
  const { kind, key, mode } = readRecord(input, ['kind', 'key', 'mode'], [], code);
  const profile = identifier(key, code);
  if (kind === 'smtp' && mode === 'live') return Object.freeze({ kind, key: profile, mode });
  if (kind === 'sendgrid' && (mode === 'live' || mode === 'sandbox')) {
    return Object.freeze({ kind, key: profile, mode });
  }
  return invalid(code);
}

export function validateTemplateIdentity(input: unknown, code: EmailErrorCode = SNAPSHOT): TemplateIdentity {
  const { key, revision } = readRecord(input, ['key', 'revision'], [], code);
  return Object.freeze({ key: identifier(key, code), revision: identifier(revision, code) });
}

export function sendGridTemplateId(input: unknown, code: EmailErrorCode = SNAPSHOT): string {
  if (typeof input !== 'string' || input.length !== 34 || !/^d-[0-9a-fA-F]{32}$/.test(input)) invalid(code);
  return input;
}

export function validateMailbox(input: unknown, code: EmailErrorCode = SNAPSHOT): Mailbox {
  const mailbox = readRecord(input, ['address'], ['name'], code);
  const address = headerString(mailbox.address, L.addressBytes, code);
  const at = address.indexOf('@');
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  if (
    at < 1 ||
    at > L.localPartBytes ||
    !DOT_ATOM.test(local) ||
    !domain.split('.').every((label) => DNS_LABEL.test(label)) ||
    isIP(domain) !== 0
  ) {
    invalid(code);
  }
  return Object.freeze({
    address,
    ...(Object.hasOwn(mailbox, 'name') ? { name: headerString(mailbox.name, L.displayNameBytes, code) } : {}),
  });
}

export function validateEnvelope(
  input: unknown,
  kind: ProviderRef['kind'],
  code: EmailErrorCode = SNAPSHOT,
  capacity?: CapacityContext,
): EmailEnvelope {
  const limit = recipientLimit(capacity);
  const envelope = readRecord(input, ['from', 'to', 'cc', 'bcc'], ['replyTo'], code);
  const seen = new Set<string>();
  const recipient = (raw: unknown) => {
    const mailbox = validateMailbox(raw, code);
    const address = mailbox.address.toLowerCase();
    if (seen.has(address)) invalid(code);
    seen.add(address);
    return mailbox;
  };
  const from = validateMailbox(envelope.from, code);
  const to = readArray(envelope.to, limit, code, recipient);
  const cc = readArray(envelope.cc, limit - to.length, code, recipient);
  const bcc = readArray(envelope.bcc, limit - to.length - cc.length, code, recipient);
  if (seen.size === 0 || (kind === 'sendgrid' && to.length === 0)) invalid(code);
  return Object.freeze({
    from,
    to,
    cc,
    bcc,
    ...(Object.hasOwn(envelope, 'replyTo') ? { replyTo: validateMailbox(envelope.replyTo, code) } : {}),
  });
}

export function validateCorrelation(input: unknown, code: EmailErrorCode = SNAPSHOT): Correlation {
  const keys = plainKeys(input, L.correlationEntries, code);
  const copy = Object.create(null) as Record<string, string>;
  for (const key of keys) {
    jsonKey(key, code);
    opaqueToken(key, L.correlationKeyBytes, code);
    copy[key] = opaqueToken(ownData(input as object, key, code), L.correlationValueBytes, code);
  }
  return Object.freeze(copy);
}

export function validateAttachmentRef(input: unknown, code: EmailErrorCode = SNAPSHOT): AttachmentRef {
  const ref = readRecord(
    input,
    ['resolverKey', 'id', 'version', 'filename', 'contentType', 'byteLength', 'sha256'],
    [],
    code,
  );
  const filename = headerString(ref.filename, L.filenameBytes, code);
  if (!filename || filename === '.' || filename === '..' || /[/\\:]/.test(filename)) invalid(code);
  const contentType = headerString(ref.contentType, L.contentTypeBytes, code);
  if (!MIME_TYPE.test(contentType)) invalid(code);
  return Object.freeze({
    resolverKey: identifier(ref.resolverKey, code),
    id: identifier(ref.id, code),
    version: identifier(ref.version, code),
    filename,
    contentType,
    byteLength: integer(ref.byteLength, 1, L.attachmentBytes, code),
    sha256: hashToken(ref.sha256, code),
  });
}

export function validateAttachmentRefs(input: unknown, code: EmailErrorCode = SNAPSHOT): readonly AttachmentRef[] {
  let total = 0;
  return readArray(input, L.attachments, code, (raw) => {
    const ref = validateAttachmentRef(raw, code);
    total += ref.byteLength;
    if (total > L.totalAttachmentBytes) invalid(code);
    return ref;
  });
}

/** For a validated ref. Check the actual view, not user-overridable byteLength/buffer properties. */
export function copyAttachmentBytes(ref: AttachmentRef, input: unknown, code: EmailErrorCode = SNAPSHOT): Uint8Array {
  if (!types.isUint8Array(input)) invalid(code);
  const typedArrayPrototype: object = Object.getPrototypeOf(Uint8Array.prototype);
  const buffer: ArrayBufferLike = Reflect.get(typedArrayPrototype, 'buffer', input);
  const offset: number = Reflect.get(typedArrayPrototype, 'byteOffset', input);
  const length: number = Reflect.get(typedArrayPrototype, 'byteLength', input);
  if (types.isSharedArrayBuffer(buffer) || length !== ref.byteLength || length < 1 || length > L.attachmentBytes) {
    invalid(code);
  }
  const bytes = new Uint8Array(new Uint8Array(buffer, offset, length));
  if (sha256(bytes) !== ref.sha256) invalid(code);
  return bytes;
}

export function validateSubject(input: unknown, code: EmailErrorCode = SNAPSHOT): string {
  const subject = headerString(input, L.subjectBytes, code);
  if (!subject.trim()) invalid(code);
  return subject;
}

export function smtpParts(
  subject: string,
  html: string | undefined,
  text: string | undefined,
  code: EmailErrorCode,
): Readonly<{ subject: string; html?: string; text?: string }> {
  if (!html && !text) invalid(code);
  return Object.freeze({ subject, ...(html === undefined ? {} : { html }), ...(text === undefined ? {} : { text }) });
}

export function validateSmtpContent(input: unknown, code: EmailErrorCode = SNAPSHOT): ReturnType<typeof smtpParts> {
  const content = readRecord(input, ['subject'], ['html', 'text'], code);
  return smtpParts(
    validateSubject(content.subject, code),
    Object.hasOwn(content, 'html') ? utf8String(content.html, L.htmlBytes, code) : undefined,
    Object.hasOwn(content, 'text') ? utf8String(content.text, L.textBytes, code) : undefined,
    code,
  );
}

export function validateExpiry(
  input: unknown,
  preparedAt: UnixMs,
  scheduleAt: UnixMs | null,
  code: EmailErrorCode = SNAPSHOT,
): UnixMs {
  const expiresAt = unixMs(input, code);
  if (
    expiresAt <= preparedAt ||
    expiresAt - preparedAt > MAX_EXPIRY_MS ||
    (scheduleAt !== null && scheduleAt >= expiresAt)
  ) {
    invalid(code);
  }
  return expiresAt;
}

// 256 non-data values cover the fixed V1 envelope, refs and metadata even at their maximum widths.
// Data is still checked at its own depth/value/byte limits relative to its own root.
export function hashSnapshot(snapshot: EmailSnapshot, capacity?: CapacityContext): string {
  return sha256(
    canonicalJson(
      snapshot,
      capacity?.limits.snapshotBytes ?? L.snapshotBytes,
      SNAPSHOT,
      capacity?.limits.snapshotTree ?? { depth: L.jsonDepth + 1, values: L.jsonValues + 256 },
    ).encoded,
  );
}

function readSnapshot(input: unknown, capacity?: CapacityContext): EmailSnapshot {
  const dto = readRecord(
    input,
    [
      'version',
      'kind',
      'provider',
      'template',
      'envelope',
      'preparedAt',
      'expiresAt',
      'priority',
      'attachments',
      'correlation',
    ],
    ['subject', 'html', 'text', 'templateId', 'data', 'smtpCapacity'],
    SNAPSHOT,
  );
  if (dto.version !== EMAIL_FORMAT_VERSION || (dto.kind !== 'smtp' && dto.kind !== 'sendgrid')) invalid(SNAPSHOT);
  assertCapacityTag(dto, capacity, SNAPSHOT);
  const provider = validateProviderRef(dto.provider);
  if (provider.kind !== dto.kind) invalid('provider_mismatch');
  assertCapacityProvider(provider, capacity, 'provider_mismatch');
  const preparedAt = unixMs(dto.preparedAt, SNAPSHOT);
  const common = {
    version: EMAIL_FORMAT_VERSION,
    template: validateTemplateIdentity(dto.template),
    envelope: validateEnvelope(dto.envelope, provider.kind, SNAPSHOT, capacity),
    preparedAt,
    expiresAt: validateExpiry(dto.expiresAt, preparedAt, null),
    priority: integer(dto.priority, PRIORITY.min, PRIORITY.max, SNAPSHOT),
    attachments: validateAttachmentRefs(dto.attachments),
    correlation: validateCorrelation(dto.correlation),
  } as const;
  if (provider.kind === 'smtp') {
    if (Object.hasOwn(dto, 'templateId') || Object.hasOwn(dto, 'data')) invalid(SNAPSHOT);
    const content = validateSmtpContent({
      subject: dto.subject,
      ...(Object.hasOwn(dto, 'html') ? { html: dto.html } : {}),
      ...(Object.hasOwn(dto, 'text') ? { text: dto.text } : {}),
    });
    return Object.freeze({ ...common, kind: provider.kind, provider, ...capacityTag(capacity), ...content });
  }
  if (Object.hasOwn(dto, 'subject') || Object.hasOwn(dto, 'html') || Object.hasOwn(dto, 'text')) invalid(SNAPSHOT);
  return Object.freeze({
    ...common,
    kind: provider.kind,
    provider,
    templateId: sendGridTemplateId(dto.templateId),
    data: copyJsonObject(dto.data, L.dataBytes, SNAPSHOT),
  });
}

/** Validate wire/stored structure, including the aggregate canonical byte bound. No registry or time-of-use checks. */
export function validateSnapshot(
  input: unknown,
  capacity?: CapacityContext,
): { readonly snapshot: EmailSnapshot; readonly snapshotHash: string } {
  const snapshot = readSnapshot(input, capacity);
  return { snapshot, snapshotHash: hashSnapshot(snapshot, capacity) };
}
