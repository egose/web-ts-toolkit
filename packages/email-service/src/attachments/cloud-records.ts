import { Buffer } from 'node:buffer';
import { MAX_UNIX_MS } from '../constants';
import { identifier, invalid, readRecord } from '../internal/validation';
import type { ManagedAttachmentMetadata } from './backing';
import { MANAGED_ATTACHMENT_CLOCK_GUARD_MS } from './records';

export const MANAGED_CLOUD_EXPIRATION_DAYS = 32;
const AGE_MS = MANAGED_CLOUD_EXPIRATION_DAYS * 86_400_000;
const METADATA_FIELDS = [
  'eamformat',
  'eamresolver',
  'eamrevision',
  'eamdeliverby',
  'eamlen',
  'eamsha256',
  'eamfilename',
] as const;

export function managedCloudPrefix(value: unknown): string {
  if (typeof value !== 'string' || value.length > 128 || !value.endsWith('/')) invalid('invalid_config');
  for (const segment of value.slice(0, -1).split('/')) identifier(segment, 'invalid_config');
  return value;
}

export function managedCloudRuleId(namespace: string): string {
  return `emailattachmentsv1${namespace.replaceAll('-', '')}`;
}

export function managedCloudExpiry(anchor: number): number | undefined {
  if (Number.isSafeInteger(anchor) && anchor >= 0 && anchor <= MAX_UNIX_MS - AGE_MS) return anchor + AGE_MS;
}

export function managedCloudHold(anchor: number, expiresAt?: number): number | undefined {
  const expiry = managedCloudExpiry(anchor);
  if (expiry !== undefined && (expiresAt === undefined || (expiresAt >= expiry && expiresAt <= MAX_UNIX_MS))) {
    // Do not spend the service's UTC day rounding; a header promising less than the audited rule is contradictory.
    return expiry - MANAGED_ATTACHMENT_CLOCK_GUARD_MS;
  }
}

export function encodeManagedCloudMetadata(metadata: ManagedAttachmentMetadata): Record<string, string> {
  return {
    eamformat: '1',
    eamresolver: metadata.resolverKey,
    eamrevision: metadata.revision,
    eamdeliverby: String(metadata.deliverBy),
    eamlen: String(metadata.byteLength),
    eamsha256: metadata.sha256,
    eamfilename: Buffer.from(metadata.filename, 'utf8').toString('base64url'),
  };
}

/** Strict wire decoding; the shared store still checks the version and V1 attachment envelope. */
export function decodeManagedCloudMetadata(raw: unknown, key: string, contentType: unknown): unknown {
  const code = 'invalid_snapshot';
  const meta = readRecord(raw, METADATA_FIELDS, [], code);
  const name = meta.eamfilename;
  // 128 UTF-8 bytes fit in at most 171 unpadded Base64url characters.
  if (meta.eamformat !== '1' || typeof name !== 'string' || !/^[A-Za-z0-9_-]{1,171}$/.test(name)) invalid(code);
  const filename = Buffer.from(name, 'base64url').toString('utf8');
  if (Buffer.from(filename, 'utf8').toString('base64url') !== name) invalid(code);
  const decimal = (value: unknown) => {
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,14})$/.test(value)) invalid(code);
    return Number(value);
  };
  return {
    key,
    contentType,
    format: 1,
    resolverKey: meta.eamresolver,
    revision: meta.eamrevision,
    deliverBy: decimal(meta.eamdeliverby),
    byteLength: decimal(meta.eamlen),
    sha256: meta.eamsha256,
    filename,
  };
}
