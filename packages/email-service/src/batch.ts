import { types } from 'node:util';
import { CALL_BUDGETS, MAX_BATCH_ITEMS } from './constants';
import type { CallOptions, EmailClock } from './contracts/message';
import type {
  AdmissionResult,
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

function readBatch(scope: string, input: unknown) {
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
    return { itemId, parsed: parseCommandIdentity(scope, { ...command, key: { kind: 'batch', batchId, itemId } }) };
  });
  if (!items.length) invalid(code);
  return { batchId, items };
}

function stopReason(budget: OperationBudget) {
  if (budget.remainingMs() > 0) return;
  return allowedErrorCode(budget.signal.reason, STOP_ERRORS) ?? invalid('invalid_config');
}

function readAdmissionResult(input: unknown, identity: CommandIdentity): AdmissionResult {
  // A bad service reply does not prove a noncommit, even if it claimed to be a replay.
  const code = 'write_unconfirmed';
  const { status, job: raw } = readRecord(input, ['status', 'job'], [], code);
  if (status !== 'enqueued' && status !== 'replayed') invalid(code);
  const job = readJobSummary(identity.scope, raw);
  if (!matchesAdmissionJob(job, identity, status)) invalid(code);
  return { status, job };
}

/**
 * Compose a same-scope admission service and worker. Wire both to the same underlying store.
 * Enqueue is sequential and resumable by batch/item ID, not atomic. `run` serves the whole scope.
 */
export function createEmailBatchService<T extends TemplateMap>(
  options: EmailBatchServiceOptions<T>,
): EmailBatchService<T> {
  return createEmailBatchServiceWithClock(options, systemEmailClock);
}

/** Internal elapsed clock seam for batch admission; worker runs keep the worker's own clock and limits. */
export function createEmailBatchServiceWithClock<T extends TemplateMap>(
  options: EmailBatchServiceOptions<T>,
  clock: EmailClock,
): EmailBatchService<T> {
  const { service, worker } = readRecord(options, ['service', 'worker'], [], 'invalid_config');
  const scope = boundScope(service);
  if (scope !== boundScope(worker)) invalid('invalid_config');
  const run = bindMethod<EmailWorker['run']>(worker, 'run');
  const enqueue = bindMethod<EmailService<T>['enqueue']>(service, 'enqueue');
  const admit =
    findServiceAdmission(service as object) ??
    (async ({ command, identity }, budget) => {
      if (boundScope(service) !== scope) invalid('invalid_config');
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
        return readAdmissionResult(raw, identity);
      } catch {
        return invalid('write_unconfirmed');
      }
    });

  const batch: EmailBatchService<T> = {
    async enqueueBatch(input, call: CallOptions = {}) {
      const { signal, timeoutMs } = readCallOptions(call, CALL_BUDGETS.batchOrRun);
      const budget = createBudget(clock, timeoutMs, signal);
      try {
        // Validate and detach the complete ordered request before any admission or host preparation.
        const { batchId, items: commands } = readBatch(scope, input);
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
        budget.close();
      }
    },
    async run(options) {
      if (boundScope(worker) !== scope) invalid('invalid_config');
      return run(options);
    },
  };
  return Object.freeze(batch);
}
