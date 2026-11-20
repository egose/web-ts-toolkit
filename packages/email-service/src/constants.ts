// Internal V1 constants shared by the validators, stores, providers and worker.
// This file is not a public entrypoint.
import type { RetentionPolicy, RetryPolicy } from './contracts/job';
import type { EmailWorkerLimits } from './contracts/worker';

const KiB = 1_024;
const MiB = 1_024 * KiB;
const DAY_MS = 86_400_000;

function bounded(defaultValue: number, min: number, max: number) {
  return Object.freeze({ default: defaultValue, min, max });
}

export const EMAIL_FORMAT_VERSION = 1;
export const MAX_UNIX_MS = 253_402_300_799_999;
export const CLOCK_MARGIN_MS = 1_000;
export const DEFAULT_EXPIRY_MS = DAY_MS;
export const MAX_EXPIRY_MS = 30 * DAY_MS;
export const MAX_PREPARED_AT_SKEW_MS = 60_000;

export const MESSAGE_LIMITS = Object.freeze({
  scopeBytes: 64,
  identifierBytes: 128,
  jsonDepth: 12,
  jsonValues: 2_048,
  jsonKeyBytes: 128,
  intentBytes: 16 * KiB,
  dataBytes: 64 * KiB,
  snapshotBytes: MiB,
  recipients: 50,
  addressBytes: 254,
  localPartBytes: 64,
  displayNameBytes: 128,
  subjectBytes: 512,
  templateSourceBytes: 256 * KiB,
  htmlBytes: 512 * KiB,
  textBytes: 256 * KiB,
  correlationEntries: 8,
  correlationKeyBytes: 32,
  correlationValueBytes: 96,
  attachments: 5,
  filenameBytes: 128,
  contentTypeBytes: 127,
  attachmentBytes: 2 * MiB,
  totalAttachmentBytes: 5 * MiB,
});

export const PRIORITY = bounded(0, 0, 9);
export const TEMPLATE_CACHE_ENTRIES = bounded(32, 0, 128);
export const TEMPLATE_MAX_PENDING = bounded(8, 1, 32);
export const MAX_BATCH_ITEMS = 100;

export const CALL_BUDGETS = Object.freeze({
  prepare: bounded(5_000, 50, 30_000),
  admissionOrAdmin: bounded(10_000, 50, 60_000),
  batchOrRun: bounded(30_000, 50, 120_000),
  shutdown: bounded(15_000, 50, 60_000),
});

export const DEFAULT_RETRY_POLICY = Object.freeze({
  maxAttempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
} satisfies RetryPolicy);
export const RETRY_POLICY_BOUNDS = Object.freeze({
  maxAttempts: bounded(DEFAULT_RETRY_POLICY.maxAttempts, 1, 10),
  baseDelayMs: bounded(DEFAULT_RETRY_POLICY.baseDelayMs, 100, 60_000),
  // Also require maxDelayMs >= the configured baseDelayMs.
  maxDelayMs: bounded(DEFAULT_RETRY_POLICY.maxDelayMs, 100, 3_600_000),
});
export const MAX_MANUAL_ATTEMPTS = 1;
export const MAX_ATTEMPT_LEDGER = RETRY_POLICY_BOUNDS.maxAttempts.max + MAX_MANUAL_ATTEMPTS;
export const MAX_RATE_DEFERRAL_MS = 30 * DAY_MS;

export const DEFAULT_RETENTION_POLICY = Object.freeze({
  payloadMs: 7 * DAY_MS,
  historyMs: 30 * DAY_MS,
  idempotencyMs: 30 * DAY_MS,
} satisfies RetentionPolicy);
export const RETENTION_POLICY_BOUNDS = Object.freeze({
  payloadMs: bounded(DEFAULT_RETENTION_POLICY.payloadMs, 0, 30 * DAY_MS),
  historyMs: bounded(DEFAULT_RETENTION_POLICY.historyMs, DAY_MS, 90 * DAY_MS),
  idempotencyMs: bounded(DEFAULT_RETENTION_POLICY.idempotencyMs, DAY_MS, 90 * DAY_MS),
});

export const DEFAULT_WORKER_LIMITS = Object.freeze({
  maxConcurrency: 4,
  storeTimeoutMs: 5_000,
  leaseMs: 60_000,
  preHandoffTimeoutMs: 8_000,
  attachmentTimeoutMs: 5_000,
  rateTimeoutMs: 500,
  providerTimeoutMs: 15_000,
  finalizeGraceMs: 10_000,
} satisfies EmailWorkerLimits);
export const WORKER_LIMIT_BOUNDS = Object.freeze({
  maxConcurrency: bounded(DEFAULT_WORKER_LIMITS.maxConcurrency, 1, 16),
  storeTimeoutMs: bounded(DEFAULT_WORKER_LIMITS.storeTimeoutMs, 50, 30_000),
  leaseMs: bounded(DEFAULT_WORKER_LIMITS.leaseMs, 5_000, 300_000),
  preHandoffTimeoutMs: bounded(DEFAULT_WORKER_LIMITS.preHandoffTimeoutMs, 50, 60_000),
  attachmentTimeoutMs: bounded(DEFAULT_WORKER_LIMITS.attachmentTimeoutMs, 50, 30_000),
  rateTimeoutMs: bounded(DEFAULT_WORKER_LIMITS.rateTimeoutMs, 10, 5_000),
  providerTimeoutMs: bounded(DEFAULT_WORKER_LIMITS.providerTimeoutMs, 50, 60_000),
  finalizeGraceMs: bounded(DEFAULT_WORKER_LIMITS.finalizeGraceMs, 100, 30_000),
});
export const RUN_CLAIM_LIMIT = bounded(20, 1, 100);
export const RUN_MAINTENANCE_LIMIT = bounded(10, 0, 100);

export const ACTIVITY_PAGE_LIMIT = bounded(25, 1, 100);
export const MAX_ACTIVITY_CURSOR_BYTES = 512;
export const ADMIN_MAINTENANCE_LIMIT = bounded(20, 1, 100);
export const MAX_OBSERVER_PENDING = 1;
export const PROJECTION_PERMIT_MS = 60_000;
export const ACTIVITY_STUB_TTL_MS = 60_000;
export const PROJECTION_DRAIN_MS = WORKER_LIMIT_BOUNDS.storeTimeoutMs.max + CLOCK_MARGIN_MS;

export const STORE_PRIMITIVE_TIMEOUT_MS = 5_000;
export const MAX_STORE_CANDIDATES = 16;
export const MAX_STORE_CAS_SUBMISSIONS = 3;
export const MEMORY_MAX_JOBS = bounded(256, 1, 4_096);
export const MONGOOSE_DEFAULT_NAMES = Object.freeze({
  jobsCollection: 'email_jobs',
  activitiesCollection: 'email_activities',
  jobsModelName: 'EmailJobV1',
  activitiesModelName: 'EmailActivityV1',
});

export const SMTP_DEFAULT_PORTS = Object.freeze({ implicit: 465, starttls: 587 });
export const SMTP_MIN_TLS_VERSION = 'TLSv1.2';
export const SENDGRID_DEFAULT_MODE = 'live';
export const SENDGRID_REQUEST_MAX_BYTES = 8 * MiB;
export const SENDGRID_RESPONSE_MAX_BYTES = 64 * KiB;
