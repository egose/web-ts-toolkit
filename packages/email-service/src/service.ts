import { randomUUID } from 'node:crypto';
import { types } from 'node:util';
import {
  CALL_BUDGETS,
  DEFAULT_RETENTION_POLICY,
  DEFAULT_RETRY_POLICY,
  MAX_PREPARED_AT_SKEW_MS,
  STORE_PRIMITIVE_TIMEOUT_MS,
  TEMPLATE_MAX_PENDING,
} from './constants';
import type { EmailJobSummary } from './contracts/job';
import type { CallOptions, EmailClock, PreparedEmailCommand } from './contracts/message';
import type { AdmissionResult, EmailService, EmailServiceOptions } from './contracts/service';
import type { EmailStore, StoreAdmission } from './contracts/store';
import type { EmailCommand, EmailTemplateRegistry, TemplateMap } from './contracts/template';
import {
  createBudget,
  createChildBudget,
  readCallOptions,
  systemEmailClock,
  type OperationBudget,
} from './internal/budget';
import { bindMethod, CallbackSlot, runHostCallback } from './internal/callbacks';
import {
  encodeAdmissionKey,
  parseCommandIdentity,
  sameCommandMetadata,
  validatePreparedCommand,
  type CommandIdentity,
  type ParsedEmailCommand,
} from './internal/command-codecs';
import { matchesAdmissionJob, readJobSummary } from './internal/job-summary';
import { runStoreCall } from './internal/store-call';
import { readRetentionPolicy, readRetryPolicy } from './internal/store-codecs';
import { allowedErrorCode, hashToken, invalid, readRecord, scopeToken } from './internal/validation';
import { findRegistryPreparation } from './templates/registry';

const PREPARATION_ERRORS = [
  'invalid_config',
  'invalid_command',
  'invalid_input',
  'invalid_data',
  'invalid_snapshot',
  'preparation_failed',
  'template_not_found',
  'template_source',
  'template_render',
  'provider_mismatch',
  'expired',
  'aborted',
  'deadline',
  'busy',
] as const;
const UNCONFIRMED = ['write_unconfirmed'] as const;
const CONFLICT = ['idempotency_conflict'] as const;
const INSERT_REJECTIONS = ['invalid_command', 'invalid_snapshot', 'provider_mismatch', 'expired'] as const;
const CONFIG = 'invalid_config';
const STORED = 'store_incompatible';

// Shared across services that use the same injected registry object. Built-in registries use their own limit instead.
const injectedRegistrySlots = new WeakMap<object, { pending: number }>();

type ServiceAdmission = (parsed: ParsedEmailCommand, parent: OperationBudget) => Promise<AdmissionResult>;
const serviceAdmissions = new WeakMap<object, ServiceAdmission>();

/** For batch: use the same admission path with a prevalidated item and a shared elapsed budget. */
export function findServiceAdmission(service: object): ServiceAdmission | undefined {
  return serviceAdmissions.get(service);
}

/**
 * Scope-bound admission only. Call `store.ready()` yourself; neither method contacts a mail provider.
 * After `write_unconfirmed`, retry the same scoped key and intent: the original insert may have committed.
 */
export function createEmailService<T extends TemplateMap>(options: EmailServiceOptions<T>): EmailService<T> {
  return createEmailServiceWithClock(options, systemEmailClock);
}

/** Internal elapsed clock seam. The store clock, not this clock, decides freshness. */
export function createEmailServiceWithClock<T extends TemplateMap>(
  options: EmailServiceOptions<T>,
  clock: EmailClock,
): EmailService<T> {
  const raw = readRecord(options, ['scope', 'store', 'registry'], ['retry', 'retention'], CONFIG);
  const scope = scopeToken(raw.scope, CONFIG);
  const retry = readRetryPolicy(readPolicy(raw.retry, DEFAULT_RETRY_POLICY), CONFIG);
  const retention = readRetentionPolicy(readPolicy(raw.retention, DEFAULT_RETENTION_POLICY), CONFIG);
  const find = bindMethod<EmailStore['findAdmission']>(raw.store, 'findAdmission');
  const insert = bindMethod<EmailStore['insert']>(raw.store, 'insert');
  if (typeof raw.registry !== 'object' || raw.registry === null || types.isProxy(raw.registry)) invalid(CONFIG);
  const registry = raw.registry;
  const prepare = bindMethod<EmailTemplateRegistry<T>['prepare']>(registry, 'prepare');
  const internalPrepare = findRegistryPreparation(registry);

  async function prepareMiss(parsed: ParsedEmailCommand, parent: OperationBudget): Promise<PreparedEmailCommand> {
    const { identity, command } = parsed;
    const accept = (value: unknown) => {
      const staged = validatePreparedCommand(scope, value);
      if (
        !sameCommandMetadata(
          staged.key,
          staged.snapshot.template.key,
          staged.snapshot.provider,
          staged.scheduleAt,
          identity,
        ) ||
        staged.intentHash !== identity.intentHash ||
        staged.fingerprint !== identity.fingerprint
      ) {
        invalid('invalid_snapshot');
      }
      return staged;
    };
    if (internalPrepare) {
      let value: PreparedEmailCommand;
      try {
        value = await internalPrepare(parsed, parent);
      } catch (error) {
        parent.check();
        return invalid(allowedErrorCode(error, PREPARATION_ERRORS) ?? 'preparation_failed');
      }
      parent.check();
      return accept(value);
    }

    parent.check();
    let slots = injectedRegistrySlots.get(registry);
    if (!slots) {
      slots = { pending: 0 };
      injectedRegistrySlots.set(registry, slots);
    }
    if (slots.pending >= TEMPLATE_MAX_PENDING.default) invalid('busy');
    const budget = createChildBudget(clock, parent, CALL_BUDGETS.prepare.default);
    const occupied = slots;
    slots.pending++;
    const slot = new CallbackSlot(() => occupied.pending--);
    try {
      return await runHostCallback(
        budget,
        slot,
        'preparation_failed',
        () => {
          const timeoutMs = Math.max(CALL_BUDGETS.prepare.min, Math.ceil(budget.remainingMs()));
          budget.check();
          return prepare(scope, command as EmailCommand<T>, {
            signal: budget.signal,
            // The backing signal still has the exact narrower deadline below the public override floor.
            timeoutMs,
          });
        },
        accept,
        PREPARATION_ERRORS,
      );
    } finally {
      budget.close();
      slot.close();
    }
  }

  function findWinner(key: CommandIdentity['key'], budget: OperationBudget) {
    return runStoreCall(clock, budget, {
      maxMs: STORE_PRIMITIVE_TIMEOUT_MS,
      effect: 'read',
      invoke: (call) => find(scope, key, call),
      accept(value) {
        if (value === null) return null;
        const raw = readRecord(value, ['job', 'fingerprint'], [], STORED);
        const job = readJobSummary(scope, raw.job);
        if (encodeAdmissionKey(job.key) !== encodeAdmissionKey(key)) invalid(STORED);
        return { job, fingerprint: hashToken(raw.fingerprint, STORED) };
      },
    });
  }

  type Winner = NonNullable<Awaited<ReturnType<typeof findWinner>>>;

  function replay(winner: Winner, identity: CommandIdentity): AdmissionResult {
    if (winner.fingerprint !== identity.fingerprint) invalid('idempotency_conflict');
    const { job } = winner;
    if (!matchesAdmissionJob(job, identity, 'replayed')) invalid(STORED);
    return Object.freeze({ status: 'replayed', job });
  }

  async function insertOrConfirm(
    command: PreparedEmailCommand,
    identity: CommandIdentity,
    budget: OperationBudget,
  ): Promise<AdmissionResult> {
    budget.check();
    const admission: StoreAdmission = Object.freeze({ command, jobId: randomUUID(), retry, retention });
    try {
      const job = await runStoreCall(clock, budget, {
        maxMs: STORE_PRIMITIVE_TIMEOUT_MS,
        effect: 'mutation',
        definite: INSERT_REJECTIONS,
        invoke: (call) => insert(scope, admission, call),
        accept(value) {
          const raw = readRecord(value, ['status'], ['job'], STORED);
          if (raw.status === 'duplicate' && !Object.hasOwn(raw, 'job')) return null;
          if (raw.status !== 'inserted') invalid(STORED);
          const job = readJobSummary(scope, raw.job);
          const { snapshot } = command;
          if (
            job.jobId !== admission.jobId ||
            !matchesAdmissionJob(job, identity, 'enqueued') ||
            job.template.revision !== snapshot.template.revision ||
            snapshot.preparedAt - job.createdAt > MAX_PREPARED_AT_SKEW_MS ||
            job.expiresAt !== snapshot.expiresAt ||
            job.priority !== snapshot.priority ||
            !sameCorrelation(job.correlation, snapshot.correlation)
          ) {
            invalid(STORED);
          }
          return job;
        },
      });
      if (job) return Object.freeze({ status: 'enqueued', job });
    } catch (error) {
      if (!allowedErrorCode(error, UNCONFIRMED)) throw error;
    }

    // Duplicate or maybe dispatched: only a current exact-key read can prove an outcome. No second insert.
    try {
      const winner = await findWinner(identity.key, budget);
      if (winner) return replay(winner, identity);
    } catch (error) {
      if (allowedErrorCode(error, CONFLICT)) throw error;
    }
    return invalid('write_unconfirmed');
  }

  async function enqueueParsed(parsed: ParsedEmailCommand, budget: OperationBudget): Promise<AdmissionResult> {
    if (parsed.identity.scope !== scope) invalid('invalid_command');
    const winner = await findWinner(parsed.identity.key, budget);
    if (winner) return replay(winner, parsed.identity);
    return insertOrConfirm(await prepareMiss(parsed, budget), parsed.identity, budget);
  }

  async function inOperation(call: CallOptions, run: (budget: OperationBudget) => Promise<AdmissionResult>) {
    const { timeoutMs, signal } = readCallOptions(call, CALL_BUDGETS.admissionOrAdmin);
    const budget = createBudget(clock, timeoutMs, signal);
    try {
      budget.check();
      return await run(budget);
    } finally {
      budget.close();
    }
  }

  const service: EmailService<T> = Object.freeze({
    scope,
    enqueue(command: EmailCommand<T>, call: CallOptions = {}) {
      return inOperation(call, (budget) => enqueueParsed(parseCommandIdentity(scope, command), budget));
    },
    enqueuePrepared(input: PreparedEmailCommand, call: CallOptions = {}) {
      return inOperation(call, async (budget) => {
        const command = validatePreparedCommand(scope, input);
        const identity = {
          scope,
          key: command.key,
          templateKey: command.snapshot.template.key,
          provider: command.snapshot.provider,
          scheduleAt: command.scheduleAt,
          intentHash: command.intentHash,
          fingerprint: command.fingerprint,
        };
        const winner = await findWinner(identity.key, budget);
        return winner ? replay(winner, identity) : insertOrConfirm(command, identity, budget);
      });
    },
  });
  serviceAdmissions.set(service, enqueueParsed);
  return service;
}

function readPolicy(input: unknown, defaults: Readonly<Record<string, number>>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults };
  const keys = Object.keys(defaults);
  const raw = readRecord(input === undefined ? {} : input, [], keys, CONFIG);
  for (const key of keys) {
    if (raw[key] !== undefined) result[key] = raw[key];
  }
  return result;
}

function sameCorrelation(left: EmailJobSummary['correlation'], right: EmailJobSummary['correlation']): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}
