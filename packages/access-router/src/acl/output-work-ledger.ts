/** Private, single-operation router work. Not a normalization/RSS/callback sandbox. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { ServiceAuthorizationError } from './authorization-snapshot';

export interface OutputWorkLedger {
  work: number;
  payload: number;
  failure?: ServiceAuthorizationError;
  check(): void;
  fail(error: ServiceAuthorizationError): void;
}

// Only synchronous router preparation enters this scope. Application/native
// normalization is explicitly taken OUT of it; row budgets retain their owner.
const preparation = new AsyncLocalStorage<OutputWorkLedger | undefined>();

export function currentOutputWorkLedger(): OutputWorkLedger | undefined {
  return preparation.getStore();
}

export function withOutputWorkLedger<T>(ledger: OutputWorkLedger | undefined, run: () => T): T {
  if (preparation.getStore() === ledger) return run();
  return preparation.run(ledger, run);
}

export function outsideOutputWorkLedger<T>(run: () => T): T {
  if (!preparation.getStore()) return run();
  return preparation.run(undefined, run);
}

export function debitOutputWork(ledger = currentOutputWorkLedger(), units = 1): void {
  if (!ledger) return;
  ledger.check();
  if (ledger.failure) throw ledger.failure;
  if (!Number.isSafeInteger(units) || units < 0 || ledger.work + units > 200_000) {
    ledger.failure ??= new ServiceAuthorizationError('collection output exceeds aggregate work limit');
    ledger.fail(ledger.failure);
    throw ledger.failure;
  }
  ledger.work += units;
}

/** Byte length is inspected without encoding/copying the string or native storage. */
export function debitOutputPayload(ledger: OutputWorkLedger | undefined, value: string | number): void {
  if (!ledger) return;
  ledger.check();
  if (ledger.failure) throw ledger.failure;
  const bytes = typeof value === 'string' ? Buffer.byteLength(value, 'utf8') : value;
  if (!Number.isSafeInteger(bytes) || bytes < 0 || ledger.payload + bytes > 16 * 1024 * 1024) {
    ledger.failure ??= new ServiceAuthorizationError('collection output exceeds payload limit');
    ledger.fail(ledger.failure);
    throw ledger.failure;
  }
  ledger.payload += bytes;
}

/** Explicit router string preparation: check bytes BEFORE join/concatenation. */
export function prepareOutputWorkString(
  parts: readonly string[],
  separator = '.',
  ledger = currentOutputWorkLedger(),
): string {
  if (ledger) {
    const bytes =
      parts.reduce((sum, part) => sum + Buffer.byteLength(part, 'utf8'), 0) +
      Math.max(0, parts.length - 1) * Buffer.byteLength(separator, 'utf8');
    debitOutputPayload(ledger, bytes);
  }
  return parts.join(separator);
}
