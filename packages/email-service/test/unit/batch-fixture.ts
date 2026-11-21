import { vi } from 'vitest';
import { createEmailTemplateRegistry, createMemoryEmailStore, type EmailStore } from '../../src';
import { createEmailBatchAdmissionWithClock } from '../../src/batch';
import { createEmailServiceWithClock } from '../../src/service';
import { command, local, ManualClock, SCOPE, SMTP } from './template-fixtures';

export const BATCH = 'fixture-batch';

export function batchKey(itemId: string, batchId = BATCH) {
  return { kind: 'batch', batchId, itemId } as const;
}

export function batchItem(itemId: string) {
  return {
    itemId,
    command: {
      templateKey: command.templateKey,
      provider: { ...SMTP, key: String(SMTP.key) },
      input: String(command.input),
      intent: { event: 'fixture', id: itemId },
    },
  };
}

export function request(...ids: string[]) {
  return { batchId: BATCH, items: ids.map(batchItem) };
}

export async function batchFixture(options: { maxJobs?: number; maxPending?: number } = {}) {
  const clock = new ManualClock();
  const store = createMemoryEmailStore({ clock, ...(options.maxJobs ? { maxJobs: options.maxJobs } : {}) });
  await store.ready();
  const parseInput = vi.fn(local.parseInput);
  const prepare = vi.fn(local.prepare);
  const parseData = vi.fn(local.parseData);
  const load = vi.fn(() => '<p>{{title}}</p>');
  const registry = createEmailTemplateRegistry(
    { local: { ...local, html: { kind: 'async', load }, parseInput, prepare, parseData } },
    { cacheEntries: 0, clock, ...(options.maxPending ? { maxPending: options.maxPending } : {}) },
  );
  const findAdmission = vi.fn(store.findAdmission);
  const insert = vi.fn(store.insert);
  const port: EmailStore = { ...store, findAdmission, insert };
  const service = createEmailServiceWithClock({ scope: SCOPE, store: port, registry }, clock);
  const batch = createEmailBatchAdmissionWithClock({ service }, clock);
  return { clock, store, service, batch, parseInput, prepare, parseData, load, findAdmission, insert };
}
