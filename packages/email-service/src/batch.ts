import { types } from 'node:util';
import { CALL_BUDGETS, MAX_BATCH_ITEMS } from './constants';
import type { CallOptions, EmailClock } from './contracts/message';
import type {
  AdmissionResult,
  EmailBatchAdmission,
  EmailBatchAdmissionOptions,
  EmailBatchResult,
  EmailBatchService,
  EmailBatchServiceOptions,
  EmailService,
} from './contracts/service';
import type { EmailCommand, TemplateMap } from './contracts/template';
import type { EmailWorker } from './contracts/worker';
import { createBudget, readCallOptions, systemEmailClock, type OperationBudget } from './internal/budget';
import { bindMethod, readPortMember } from './internal/callbacks';
import { parseCommandIdentity, type CommandIdentity } from './internal/command-codecs';
import { matchesAdmissionJob, readJobSummary } from './internal/job-summary';
import { assertPortCapacity, readCapacityOption, type CapacityContext } from './internal/smtp-capacity';
import { STORE_PERSISTENCE_ERRORS } from './internal/store-call';
import { allowedErrorCode, identifier, invalid, readArray, readRecord, scopeToken } from './internal/validation';
import { findServiceAdmission } from './service';

const STOP_ERRORS = ['aborted', 'deadline'] as const;
const ADMISSION_ERRORS = [
  ...STOP_ERRORS,
  ...STORE_PERSISTENCE_ERRORS,
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
  'idempotency_conflict',
  'busy',
  'closed',
] as const;

function boundScope(port: unknown): string {
  return scopeToken(readPortMember(port, 'scope'), 'invalid_config');
}

function readBatch(scope: string, input: unknown, capacity?: CapacityContext) {
  const code = 'invalid_command';
  const raw = readRecord(input, ['batchId', 'items'], [], code);
  const batchId = identifier(raw.batchId, code);
  const seen = new Set<string>();
  const items = readArray(raw.items, MAX_BATCH_ITEMS, code, (entry) => {
    const item = readRecord(entry, ['itemId', 'command'], [], code);
    const itemId = identifier(item.itemId, code);
    if (seen.has(itemId)) invalid(code);
    seen.add(itemId);
    const command = readRecord(item.command, ['templateKey', 'input', 'provider', 'intent'], ['scheduleAt'], code);
    return {
      itemId,
      parsed: parseCommandIdentity(scope, { ...command, key: { kind: 'batch', batchId, itemId } }, capacity),
    };
  });
  if (!items.length) invalid(code);
  return { batchId, items };
}

function stopReason(budget: OperationBudget) {
  if (budget.remainingMs() > 0) return;
  return allowedErrorCode(budget.signal.reason, STOP_ERRORS) ?? invalid('invalid_config');
}

function readAdmissionResult(input: unknown, identity: CommandIdentity, capacity?: CapacityContext): AdmissionResult {
  // A bad service reply does not prove a noncommit, even if it claimed to be a replay.
  const code = 'write_unconfirmed';
  const { status, job: raw } = readRecord(input, ['status', 'job'], [], code);
  if (status !== 'enqueued' && status !== 'replayed') invalid(code);
  const job = readJobSummary(identity.scope, raw, capacity);
  if (!matchesAdmissionJob(job, identity, status)) invalid(code);
  return { status, job };
}

/**
 * Enqueue or resume a batch through a bound service without configuring a worker.
 * Replay the same batch/item IDs and intent after `write_unconfirmed`: an item may already have committed.
 */
export function createEmailBatchAdmission<T extends TemplateMap>(
  options: EmailBatchAdmissionOptions<T>,
): EmailBatchAdmission<T> {
  return createEmailBatchAdmissionWithClock(options, systemEmailClock);
}

/** Internal elapsed clock seam for deterministic producer tests. */
export function createEmailBatchAdmissionWithClock<T extends TemplateMap>(
  options: EmailBatchAdmissionOptions<T>,
  clock: EmailClock,
): EmailBatchAdmission<T> {
  const raw = readRecord(options, ['service'], ['smtpCapacity'], 'invalid_config');
  const { service } = raw;
  const capacity = readCapacityOption(raw);
  assertPortCapacity(service, capacity);
  return createBatchAdmission<T>(service, boundScope(service), capacity, clock);
}

/**
 * Compose a same-scope admission service and worker. Wire both to the same underlying store.
 * Enqueue is sequential and resumable by batch/item ID, not atomic. `run` serves the whole scope.
 */
export function createEmailBatchService<T extends TemplateMap>(
  options: EmailBatchServiceOptions<T>,
): EmailBatchService<T> {
  const raw = readRecord(options, ['service', 'worker'], ['smtpCapacity'], 'invalid_config');
  const { service, worker } = raw;
  const capacity = readCapacityOption(raw);
  assertPortCapacity(service, capacity);
  assertPortCapacity(worker, capacity);
  const scope = boundScope(service);
  if (scope !== boundScope(worker)) invalid('invalid_config');
  const run = bindMethod<EmailWorker['run']>(worker, 'run');
  const { enqueueBatch } = createBatchAdmission<T>(service, scope, capacity, systemEmailClock);
  const batch: EmailBatchService<T> = {
    enqueueBatch,
    async run(options) {
      if (boundScope(worker) !== scope) invalid('invalid_config');
      assertPortCapacity(worker, capacity);
      return run(options);
    },
  };
  return Object.freeze(batch);
}

function createBatchAdmission<T extends TemplateMap>(
  service: unknown,
  scope: string,
  capacity: CapacityContext | undefined,
  clock: EmailClock,
): EmailBatchAdmission<T> {
  const enqueue = bindMethod<EmailService<T>['enqueue']>(service, 'enqueue');
  const admit =
    findServiceAdmission(service as object) ??
    (async ({ command, identity }, budget) => {
      if (boundScope(service) !== scope) invalid('invalid_config');
      assertPortCapacity(service, capacity);
      const bounds = CALL_BUDGETS.admissionOrAdmin;
      const timeoutMs = Math.max(bounds.min, Math.min(bounds.max, Math.floor(budget.remainingMs())));
      budget.check();
      let raw: unknown;
      try {
        // The public override has a floor; the original batch signal enforces the shorter remaining window.
        const pending = enqueue(command as EmailCommand<T>, Object.freeze({ signal: budget.signal, timeoutMs }));
        // Do not assimilate arbitrary thenables/getters on service response data.
        raw = types.isPromise(pending) ? await pending : pending;
      } catch (error) {
        // A separate service's public API receives our deadline as an external abort.
        if (allowedErrorCode(error, ['aborted']) && allowedErrorCode(budget.signal.reason, ['deadline'])) {
          invalid('deadline');
        }
        throw error;
      }
      try {
        return readAdmissionResult(raw, identity, capacity);
      } catch {
        return invalid('write_unconfirmed');
      }
    });

  let admitting = false;
  const batch: EmailBatchAdmission<T> = {
    async enqueueBatch(input, call: CallOptions = {}) {
      if (capacity && admitting) invalid('busy');
      const { signal, timeoutMs } = readCallOptions(call, CALL_BUDGETS.batchOrRun);
      const budget = createBudget(clock, timeoutMs, signal);
      admitting = true;
      try {
        // Validate and detach the complete ordered request before any admission or host preparation.
        const { batchId, items: commands } = readBatch(scope, input, capacity);
        const items: EmailBatchResult['items'][number][] = [];
        const counts = { enqueued: 0, replayed: 0, failed: 0, notStarted: 0, persistenceFailures: 0 };
        for (const { itemId, parsed } of commands) {
          if (stopReason(budget)) {
            counts.notStarted++;
            items.push(Object.freeze({ itemId, status: 'not_started' }));
            continue;
          }
          try {
            // Do not race admission against abort: a started item can still have a confirmed or uncertain write.
            const result = await admit(parsed, budget);
            counts[result.status]++;
            items.push(Object.freeze({ itemId, status: result.status, job: result.job }));
          } catch (error) {
            const code = allowedErrorCode(error, ADMISSION_ERRORS) ?? 'write_unconfirmed';
            counts.failed++;
            if (STORE_PERSISTENCE_ERRORS.some((candidate) => candidate === code)) counts.persistenceFailures++;
            items.push(Object.freeze({ itemId, status: 'failed', code }));
          }
        }
        return Object.freeze({ batchId, items: Object.freeze(items), counts: Object.freeze(counts) });
      } finally {
        admitting = false;
        budget.close();
      }
    },
  };
  return Object.freeze(batch);
}
