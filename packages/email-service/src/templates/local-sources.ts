import { Buffer } from 'node:buffer';
import { addAbortListener } from 'node:events';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { TextDecoder } from 'node:util';
import { MESSAGE_LIMITS } from '../constants';
import type { LocalSource } from '../contracts/template';
import { syncStage, type OperationBudget } from '../internal/budget';
import { requireCallback, runHostCallback, type CallbackSlot } from '../internal/callbacks';
import { invalid, readRecord, utf8String } from '../internal/validation';

const LIMIT = MESSAGE_LIMITS.templateSourceBytes;
const SOURCE_ERROR = 'template_source';

export function readSourceConfig(input: unknown): LocalSource {
  const code = 'invalid_config';
  const source = readRecord(input, ['kind'], ['content', 'path', 'load'], code);
  if (Object.keys(source).length !== 2) invalid(code);
  if (source.kind === 'inline' && typeof source.content === 'string') {
    return Object.freeze({ kind: source.kind, content: source.content });
  }
  if (source.kind === 'file' && typeof source.path === 'string' && source.path && !source.path.includes('\0')) {
    return Object.freeze({ kind: source.kind, path: source.path });
  }
  if (source.kind === 'async') {
    const load = requireCallback(source.load) as Extract<LocalSource, { kind: 'async' }>['load'];
    return Object.freeze({ kind: source.kind, load });
  }
  return invalid(code);
}

async function readFileSource(path: string, budget: OperationBudget): Promise<string> {
  // Nonblocking open lets us reject non-regular files such as FIFOs without waiting for a writer.
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOCTTY);
  let closing: Promise<void> | undefined;
  const close = () => {
    if (!closing) {
      closing = Promise.resolve().then(() => file.close());
      // When abort initiates close, it may reject before the pending read has finished.
      void closing.catch(() => undefined);
    }
    return closing;
  };
  const abort = addAbortListener(budget.signal, () => {
    void close();
  });
  try {
    budget.check();
    const info = await file.stat();
    budget.check();
    if (!info.isFile() || info.size > LIMIT) invalid(SOURCE_ERROR);

    // The stat is only an early rejection. Bound the actual read even if the file grows after stat.
    const buffer = Buffer.allocUnsafe(LIMIT + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      budget.check();
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > LIMIT) invalid(SOURCE_ERROR);
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, length));
  } finally {
    // Do not race package-owned I/O with a waiting-only timeout. Even a late open is closed before returning.
    abort[Symbol.dispose]();
    await close();
  }
}

export async function loadLocalSource(
  source: LocalSource,
  budget: OperationBudget,
  slot: CallbackSlot,
): Promise<string> {
  budget.check();
  if (source.kind === 'inline')
    return syncStage(budget, SOURCE_ERROR, () => utf8String(source.content, LIMIT, SOURCE_ERROR));
  if (source.kind === 'async') {
    const { load } = source;
    return runHostCallback(
      budget,
      slot,
      SOURCE_ERROR,
      () => load({ signal: budget.signal }),
      (result) => utf8String(result, LIMIT, SOURCE_ERROR),
    );
  }
  try {
    const content = await readFileSource(source.path, budget);
    budget.check();
    return content;
  } catch {
    budget.check();
    return invalid(SOURCE_ERROR);
  }
}
