/** Private operation lifetime and selected-row resources. Never keyed by a returned DTO. */
import { authorizationError, ServiceAuthorizationError } from './authorization-snapshot';
import { createTrustedOutputBudget, type TrustedOutputBudget } from './trusted-output-materialization';
import type { ResolvedServiceAuthorization } from './service-authorization';
import type { OutputWorkLedger } from './output-work-ledger';

declare const publicationBrand: unique symbol;
export interface OutputPublication {
  readonly [publicationBrand]: true;
}
interface PublicationRecord {
  closed: boolean;
  failure?: unknown;
  pending: Set<Promise<unknown>>;
  stages: Set<(error?: unknown, clear?: boolean) => void>;
  resources: Set<() => void>;
  ledger?: OutputWorkLedger;
}
const publications = new WeakMap<OutputPublication, PublicationRecord>();
const calls = new WeakMap<ResolvedServiceAuthorization, OutputPublication>();

export function createOutputPublication(): OutputPublication {
  const owner = Object.freeze(Object.create(null)) as OutputPublication;
  publications.set(owner, {
    closed: false,
    failure: undefined,
    pending: new Set(),
    stages: new Set(),
    resources: new Set(),
    ledger: undefined,
  });
  return owner;
}

/** Installed before initial catalog/configuration capture; shared by ALL row owners. */
export function createCollectionOutputLedger(owner: OutputPublication): OutputWorkLedger {
  assertOutputPublication(owner);
  const record = recordFor(owner);
  if (record.ledger) authorizationError('collection ledger already installed');
  const ledger: OutputWorkLedger = {
    work: 0,
    payload: 0,
    failure: undefined,
    check: () => assertOutputPublication(owner),
    fail: (error) => failOutputPublication(owner, error),
  };
  record.ledger = ledger;
  return ledger;
}

export function publicationOutputLedger(owner: OutputPublication): OutputWorkLedger | undefined {
  assertOutputPublication(owner);
  return recordFor(owner).ledger;
}

function recordFor(owner: OutputPublication): PublicationRecord {
  const record = publications.get(owner);
  if (!record) authorizationError('invalid output publication owner');
  return record;
}

export function bindOutputPublication(call: ResolvedServiceAuthorization, owner: OutputPublication): void {
  assertOutputPublication(owner);
  if (calls.has(call) && calls.get(call) !== owner) authorizationError('output call owner mismatch');
  calls.set(call, owner);
}

export function outputPublicationFor(call: ResolvedServiceAuthorization): OutputPublication {
  const existing = calls.get(call);
  if (existing) return existing;
  const owner = createOutputPublication();
  bindOutputPublication(call, owner);
  return owner;
}

export function assertOutputPublication(owner: OutputPublication): void {
  const record = recordFor(owner);
  if (record.failure !== undefined) throw record.failure;
  if (record.closed) authorizationError('closed output publication');
}

/** Close/poison FIRST. A caught inner controlled error cannot permit later publication. */
export function failOutputPublication(owner: OutputPublication, error: unknown): void {
  const record = recordFor(owner);
  if (record.closed && !record.pending.size && !record.stages.size && !record.resources.size) return;
  record.failure ??= error ?? new ServiceAuthorizationError('output publication failed');
  record.closed = true;
  for (const close of record.stages) close(record.failure);
}

export function retainPublicationStage(
  owner: OutputPublication,
  close: (error?: unknown, clear?: boolean) => void,
): void {
  assertOutputPublication(owner);
  recordFor(owner).stages.add(close);
}

export function retainPublicationResource(owner: OutputPublication, clear: () => void): void {
  assertOutputPublication(owner);
  recordFor(owner).resources.add(clear);
}

/** Track only admitted library work, never detached application closure activity. */
export function trackPublicationWork<T>(owner: OutputPublication, work: Promise<T>): Promise<T> {
  assertOutputPublication(owner);
  return trackAdmittedWork(owner, recordFor(owner), work);
}

/** Capture admission BEFORE invoking synchronous application code. Only an actual
 * returned Promise needs tracking; poison during that invocation must still drain
 * the already-admitted callback, without admitting another callback or new stage. */
export function admitPublicationWork(owner: OutputPublication) {
  assertOutputPublication(owner);
  const record = recordFor(owner);
  return <T>(work: Promise<T>): Promise<T> => trackAdmittedWork(owner, record, work);
}

function trackAdmittedWork<T>(owner: OutputPublication, record: PublicationRecord, work: Promise<T>): Promise<T> {
  record.pending.add(work);
  void work.then(
    () => record.pending.delete(work),
    (error) => {
      failOutputPublication(owner, error);
      record.pending.delete(work);
    },
  );
  return work;
}

export function createPublicationRowBudget(owner: OutputPublication): TrustedOutputBudget {
  assertOutputPublication(owner);
  return createTrustedOutputBudget(
    (error) => failOutputPublication(owner, error),
    () => assertOutputPublication(owner),
    recordFor(owner).ledger,
  );
}

/** Stop admission, drain all already-tracked work, then release sources/memo/builders. */
export async function closeOutputPublication(owner: OutputPublication, error?: unknown): Promise<void> {
  const record = recordFor(owner);
  if (error !== undefined) failOutputPublication(owner, error);
  record.closed = true;
  for (const close of record.stages) close(record.failure);
  while (record.pending.size) await Promise.allSettled([...record.pending]);
  for (const close of record.stages) close(record.failure, true);
  for (const clear of record.resources) clear();
  record.stages.clear();
  record.resources.clear();
  record.ledger = undefined;
  if (record.failure !== undefined) throw record.failure;
}

/** For an operation boundary which owns this group, not an internal related child. */
export async function runOutputPublication<T>(owner: OutputPublication, operation: () => Promise<T>): Promise<T> {
  try {
    assertOutputPublication(owner);
    const result = await operation();
    assertOutputPublication(owner);
    await closeOutputPublication(owner);
    return result;
  } catch (error) {
    await closeOutputPublication(owner, error);
    throw error;
  }
}
