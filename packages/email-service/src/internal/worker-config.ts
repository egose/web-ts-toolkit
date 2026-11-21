import {
  CALL_BUDGETS,
  CLOCK_MARGIN_MS,
  RUN_CLAIM_LIMIT,
  RUN_MAINTENANCE_LIMIT,
  WORKER_LIMIT_BOUNDS,
} from '../constants';
import type { AttachmentResolver, EmailClock, EmailSnapshot, ProviderRef } from '../contracts/message';
import type { ProviderSubmission } from '../contracts/provider';
import type { EmailStore } from '../contracts/store';
import type { EmailRateLimiter, EmailWorkerLimits } from '../contracts/worker';
import { monotonicNow, readCallOptions, readClock } from './budget';
import { bindMethod, readPortMember, requireCallback } from './callbacks';
import { validateProviderRef } from './message-codecs';
import { assertCapacityProvider, assertPortCapacity, readCapacityOption, type CapacityContext } from './smtp-capacity';
import {
  boundedOption,
  identifier,
  invalid,
  ownData,
  plainKeys,
  readArray,
  readRecord,
  scopeToken,
} from './validation';

const CONFIG = 'invalid_config';

function readLimits(input: unknown, capacity?: CapacityContext): Readonly<EmailWorkerLimits> {
  const keys = Object.keys(WORKER_LIMIT_BOUNDS) as (keyof EmailWorkerLimits)[];
  const raw = readRecord(input === undefined ? {} : input, [], keys, CONFIG);
  const limits = {} as EmailWorkerLimits;
  for (const key of keys) {
    const bounds = key === 'maxConcurrency' ? capacity?.limits.workerConcurrency : undefined;
    limits[key] = boundedOption(raw[key], bounds ?? WORKER_LIMIT_BOUNDS[key]);
  }
  const { leaseMs, storeTimeoutMs, providerTimeoutMs, finalizeGraceMs } = limits;
  if (
    leaseMs <
    Math.max(
      3 * storeTimeoutMs + CLOCK_MARGIN_MS,
      storeTimeoutMs + providerTimeoutMs + finalizeGraceMs + CLOCK_MARGIN_MS,
    )
  ) {
    invalid(CONFIG);
  }
  return Object.freeze(limits);
}

export function sameProvider(a: ProviderRef, b: ProviderRef): boolean {
  return a.kind === b.kind && a.key === b.key && a.mode === b.mode;
}

type Profile = Readonly<{
  ref: ProviderRef;
  prepare(input: ProviderSubmission<EmailSnapshot>): unknown;
}>;

function readProfiles(input: unknown, capacity?: CapacityContext): ReadonlyMap<string, Profile> {
  // Configuration is supplied by the host, not per job. Only one exact profile participates in an attempt.
  const profiles = new Map<string, Profile>();
  readArray(input, capacity?.limits.workerProfiles ?? Number.MAX_SAFE_INTEGER, CONFIG, (provider) => {
    const ref = validateProviderRef(readPortMember(provider, 'ref'), CONFIG);
    assertPortCapacity(provider, capacity);
    assertCapacityProvider(ref, capacity, CONFIG);
    if (profiles.has(ref.key)) invalid(CONFIG);
    profiles.set(ref.key, Object.freeze({ ref, prepare: bindMethod<Profile['prepare']>(provider, 'prepare') }));
  });
  if (profiles.size === 0) invalid(CONFIG);
  return profiles;
}

function readResolvers(input: unknown): ReadonlyMap<string, AttachmentResolver> {
  const resolvers = new Map<string, AttachmentResolver>();
  if (input !== undefined) {
    for (const key of plainKeys(input, Number.MAX_SAFE_INTEGER, CONFIG)) {
      resolvers.set(
        identifier(key, CONFIG),
        requireCallback(ownData(input as object, key, CONFIG)) as AttachmentResolver,
      );
    }
  }
  return resolvers;
}

function readLimiter(input: unknown): Readonly<EmailRateLimiter> | undefined {
  if (input === undefined) return;
  const scope = readPortMember(input, 'scope');
  if (scope !== 'worker' && scope !== 'shared') invalid(CONFIG);
  return Object.freeze({ scope, tryAcquire: bindMethod<EmailRateLimiter['tryAcquire']>(input, 'tryAcquire') });
}

function readWorkerClock(input: unknown): EmailClock {
  const clock = readClock(input);
  let last = -Infinity;
  return Object.freeze({
    ...clock,
    monotonicNow() {
      const now = monotonicNow(clock);
      if (now < last) invalid(CONFIG);
      last = now;
      return now;
    },
  });
}

export function readWorkerConfig(input: unknown) {
  const raw = readRecord(
    input,
    ['scope', 'store', 'providers'],
    ['attachmentResolvers', 'rateLimiter', 'clock', 'limits', 'smtpCapacity'],
    CONFIG,
  );
  const { store } = raw;
  const capacity = readCapacityOption(raw);
  assertPortCapacity(store, capacity);
  return Object.freeze({
    capacity,
    scope: scopeToken(raw.scope, CONFIG),
    limits: readLimits(raw.limits, capacity),
    clock: readWorkerClock(raw.clock),
    profiles: readProfiles(raw.providers, capacity),
    resolvers: readResolvers(raw.attachmentResolvers),
    limiter: readLimiter(raw.rateLimiter),
    store: Object.freeze({
      claimNext: bindMethod<EmailStore['claimNext']>(store, 'claimNext'),
      recoverNext: bindMethod<EmailStore['recoverNext']>(store, 'recoverNext'),
      expireNext: bindMethod<EmailStore['expireNext']>(store, 'expireNext'),
      renew: bindMethod<EmailStore['renew']>(store, 'renew'),
      markHandoff: bindMethod<EmailStore['markHandoff']>(store, 'markHandoff'),
      finish: bindMethod<EmailStore['finish']>(store, 'finish'),
      findAttempt: bindMethod<EmailStore['findAttempt']>(store, 'findAttempt'),
    }),
  });
}

export type WorkerConfig = ReturnType<typeof readWorkerConfig>;

export function readRunOptions(input: unknown, limits: Readonly<EmailWorkerLimits>, capacity?: CapacityContext) {
  const { limit, concurrency, maintenanceLimit, ...call } = readRecord(
    input,
    [],
    ['limit', 'concurrency', 'maintenanceLimit', 'signal', 'timeoutMs'],
    CONFIG,
  );
  return Object.freeze({
    ...readCallOptions(call, CALL_BUDGETS.batchOrRun),
    limit: boundedOption(limit, capacity?.limits.runClaims ?? RUN_CLAIM_LIMIT),
    concurrency: boundedOption(concurrency, { min: 1, max: limits.maxConcurrency, default: limits.maxConcurrency }),
    maintenanceLimit: boundedOption(maintenanceLimit, capacity?.limits.runMaintenance ?? RUN_MAINTENANCE_LIMIT),
  });
}

export type RunOptions = ReturnType<typeof readRunOptions>;

export function readShutdownOptions(input: unknown) {
  return readCallOptions(readRecord(input, [], ['timeoutMs'], CONFIG), CALL_BUDGETS.shutdown);
}
