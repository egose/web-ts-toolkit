import { MESSAGE_LIMITS } from '../constants';
import type { ProviderRef, SmtpCapacity } from '../contracts/message';
import type { EmailErrorCode } from '../errors';
import { readPortMember } from './callbacks';
import { integer, invalid, readRecord, uuidV4 } from './validation';

const MIN_RECIPIENTS = MESSAGE_LIMITS.recipients + 1;
const MAX_RECIPIENTS = 1_000;
const KIB = 1_024;

const limits = Object.freeze({
  snapshotBytes: 2 * KIB * KIB,
  snapshotTree: Object.freeze({ depth: 4, values: 4_096 }),
  evidenceBytes: 64 * KIB,
  evidenceTree: Object.freeze({ depth: 5, values: 4_096 }),
  jobBsonBytes: 4 * KIB * KIB,
  activityBsonBytes: 128 * KIB,
  registryCache: Object.freeze({ min: 0, default: 8, max: 16 }),
  registryPending: Object.freeze({ min: 1, default: 2, max: 4 }),
  servicePending: 4,
  workerProfiles: 16,
  workerConcurrency: Object.freeze({ min: 1, default: 1, max: 2 }),
  runClaims: Object.freeze({ min: 1, default: 4, max: 16 }),
  runMaintenance: Object.freeze({ min: 0, default: 4, max: 16 }),
  adminMaintenance: Object.freeze({ min: 1, default: 4, max: 16 }),
  page: Object.freeze({ min: 1, default: 8, max: 16 }),
  memoryJobs: Object.freeze({ min: 1, default: 8, max: 16 }),
  mongoInFlight: 4,
  dueCandidates: 4,
});

/** Only factory configuration creates a context. Decoding a DTO or call never chooses its own limits. */
export type CapacityContext = Readonly<{ binding: SmtpCapacity; limits: typeof limits }>;

function readBinding(input: unknown, code: EmailErrorCode): SmtpCapacity {
  const { format, namespace, maxRecipients } = readRecord(input, ['format', 'namespace', 'maxRecipients'], [], code);
  if (format !== 'smtp-v2') invalid(code);
  return Object.freeze({
    format,
    namespace: uuidV4(namespace, code),
    maxRecipients: integer(maxRecipients, MIN_RECIPIENTS, MAX_RECIPIENTS, code),
  });
}

export function readCapacityOption(raw: { smtpCapacity?: unknown }): CapacityContext | undefined {
  if (!Object.hasOwn(raw, 'smtpCapacity')) return;
  return Object.freeze({ binding: readBinding(raw.smtpCapacity, 'invalid_config'), limits });
}

export function capacityTag(capacity?: CapacityContext): { readonly smtpCapacity?: SmtpCapacity } {
  return capacity ? { smtpCapacity: capacity.binding } : {};
}

export function recipientLimit(capacity?: CapacityContext): number {
  return capacity?.binding.maxRecipients ?? MESSAGE_LIMITS.recipients;
}

function matchesBinding(input: unknown, capacity: CapacityContext, code: EmailErrorCode): void {
  // `format` is checked by the exact reader; the returned tuple is discarded, never used as context.
  const binding = readBinding(input, code);
  if (binding.namespace !== capacity.binding.namespace || binding.maxRecipients !== capacity.binding.maxRecipients) {
    invalid(code);
  }
}

export function assertCapacityTag(
  raw: { smtpCapacity?: unknown },
  capacity: CapacityContext | undefined,
  code: EmailErrorCode,
): void {
  const tagged = Object.hasOwn(raw, 'smtpCapacity');
  if (capacity) {
    if (!tagged) invalid(code);
    matchesBinding(raw.smtpCapacity, capacity, code);
  } else if (tagged) {
    invalid(code);
  }
}

export function assertPortCapacity(port: unknown, capacity?: CapacityContext): void {
  const code = 'invalid_config';
  const binding = readPortMember(port, 'smtpCapacity');
  if (capacity) matchesBinding(binding, capacity, code);
  else if (binding !== undefined) invalid(code);
}

export function assertCapacityProvider(
  provider: ProviderRef,
  capacity: CapacityContext | undefined,
  code: EmailErrorCode,
): void {
  if (capacity && provider.kind !== 'smtp') invalid(code);
}
