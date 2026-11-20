import { EMAIL_FORMAT_VERSION, MESSAGE_LIMITS } from '../constants';
import type { EmailAdmissionKey, JsonValue, PreparedEmailCommand, ProviderRef, UnixMs } from '../contracts/message';
import type { EmailErrorCode } from '../errors';
import { canonicalJson, hashJson, sha256 } from './canonical-json';
import { validateExpiry, validateProviderRef, validateSnapshot } from './message-codecs';
import { hashToken, identifier, invalid, readRecord, scopeToken, unixMs } from './validation';

export function validateAdmissionKey(input: unknown, code: EmailErrorCode = 'invalid_command'): EmailAdmissionKey {
  const key = readRecord(input, ['kind'], ['idempotencyKey', 'batchId', 'itemId'], code);
  if (key.kind === 'single' && !Object.hasOwn(key, 'batchId') && !Object.hasOwn(key, 'itemId')) {
    return Object.freeze({ kind: key.kind, idempotencyKey: identifier(key.idempotencyKey, code) });
  }
  if (key.kind === 'batch' && !Object.hasOwn(key, 'idempotencyKey')) {
    return Object.freeze({
      kind: key.kind,
      batchId: identifier(key.batchId, code),
      itemId: identifier(key.itemId, code),
    });
  }
  return invalid(code);
}

export function encodeAdmissionKey(key: EmailAdmissionKey): string {
  return key.kind === 'single' ? `s:${key.idempotencyKey}` : `b:${key.batchId}:${key.itemId}`;
}

export type CommandIdentity = Readonly<{
  scope: string;
  key: EmailAdmissionKey;
  templateKey: string;
  provider: ProviderRef;
  scheduleAt: UnixMs | null;
  intentHash: string;
  fingerprint: string;
}>;

type StaticCommand = Readonly<{
  key: EmailAdmissionKey;
  templateKey: string;
  input: unknown;
  provider: ProviderRef;
  intent: JsonValue;
  scheduleAt?: UnixMs;
}>;

export type ParsedEmailCommand = Readonly<{ identity: CommandIdentity; command: StaticCommand }>;

export function sameCommandMetadata(
  key: EmailAdmissionKey,
  templateKey: string,
  provider: ProviderRef,
  scheduleAt: UnixMs | null,
  expected: CommandIdentity,
): boolean {
  return (
    encodeAdmissionKey(key) === encodeAdmissionKey(expected.key) &&
    templateKey === expected.templateKey &&
    provider.kind === expected.provider.kind &&
    provider.key === expected.provider.key &&
    provider.mode === expected.provider.mode &&
    scheduleAt === expected.scheduleAt
  );
}

function fingerprintFor(identity: Omit<CommandIdentity, 'fingerprint'>): string {
  const { scope, key, templateKey, provider, scheduleAt, intentHash } = identity;
  return hashJson(
    [EMAIL_FORMAT_VERSION, scope, key, templateKey, provider, scheduleAt, intentHash],
    MESSAGE_LIMITS.intentBytes,
  );
}

/**
 * Registry-independent shape and identity. The returned command holds validated, detached metadata for later
 * preparation after an async lookup. Its opaque business input alone is the original, uninspected reference.
 */
export function parseCommandIdentity(scope: unknown, command: unknown): ParsedEmailCommand {
  const code = 'invalid_command';
  const parsedScope = scopeToken(scope, code);
  const raw = readRecord(command, ['key', 'templateKey', 'input', 'provider', 'intent'], ['scheduleAt'], code);
  const key = validateAdmissionKey(raw.key, code);
  const templateKey = identifier(raw.templateKey, code);
  const provider = validateProviderRef(raw.provider, code);
  const scheduleAt = raw.scheduleAt === undefined ? null : unixMs(raw.scheduleAt, code);
  const intent = canonicalJson(raw.intent, MESSAGE_LIMITS.intentBytes, code);
  const identity = { scope: parsedScope, key, templateKey, provider, scheduleAt, intentHash: sha256(intent.encoded) };
  return Object.freeze({
    identity: Object.freeze({ ...identity, fingerprint: fingerprintFor(identity) }),
    command: Object.freeze({
      key,
      templateKey,
      provider,
      input: raw.input,
      intent: intent.value,
      ...(scheduleAt === null ? {} : { scheduleAt }),
    }),
  });
}

/** Revalidate and detach a staged V1 command. Store-relative freshness is checked only on a new insertion. */
export function validatePreparedCommand(scope: unknown, input: unknown): PreparedEmailCommand {
  const expectedScope = scopeToken(scope);
  const code = 'invalid_snapshot';
  const dto = readRecord(
    input,
    ['version', 'scope', 'key', 'scheduleAt', 'intentHash', 'fingerprint', 'snapshotHash', 'snapshot'],
    [],
    code,
  );
  if (dto.version !== EMAIL_FORMAT_VERSION || scopeToken(dto.scope, code) !== expectedScope) invalid(code);
  const key = validateAdmissionKey(dto.key, code);
  const scheduleAt = dto.scheduleAt === null ? null : unixMs(dto.scheduleAt, code);
  const intentHash = hashToken(dto.intentHash, code);
  const fingerprint = hashToken(dto.fingerprint, code);
  const storedSnapshotHash = hashToken(dto.snapshotHash, code);
  const { snapshot, snapshotHash } = validateSnapshot(dto.snapshot);
  validateExpiry(snapshot.expiresAt, snapshot.preparedAt, scheduleAt);
  if (
    snapshotHash !== storedSnapshotHash ||
    fingerprint !==
      fingerprintFor({
        scope: expectedScope,
        key,
        templateKey: snapshot.template.key,
        provider: snapshot.provider,
        scheduleAt,
        intentHash,
      })
  ) {
    invalid(code);
  }
  return Object.freeze({
    version: EMAIL_FORMAT_VERSION,
    scope: expectedScope,
    key,
    scheduleAt,
    intentHash,
    fingerprint,
    snapshotHash,
    snapshot,
  });
}
