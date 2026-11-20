import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest';
import { createMemoryEmailStore } from '../../src';
import { createSmtpTlsFixture } from '../smtp/tls-fixture';
import { lifecycleBatches } from './batches';
import { createLifecycle, readyQueue, SENDGRID_HOST, type Lifecycle } from './fixture';
import { lifecycleFences } from './fences';
import { lifecycleOutcomes } from './outcomes';
import { lifecycleScopes } from './scopes';

let tls: ReturnType<typeof createSmtpTlsFixture>;
let current: Lifecycle | undefined;

beforeAll(() => {
  tls = createSmtpTlsFixture(SENDGRID_HOST);
});
beforeEach(async () => {
  const store = createMemoryEmailStore();
  const queue = await readyQueue({
    primary: store,
    peer: store, // Separate workers and services, sharing one single-process queue.
    now: Date.now,
    async waitFor(target: number) {
      await expect.poll(Date.now, { timeout: 7_000, interval: 20 }).toBeGreaterThanOrEqual(target);
    },
  });
  current = createLifecycle(queue, tls);
});
afterEach(async () => {
  const f = current;
  current = undefined;
  await f?.close();
});
afterAll(() => tls?.close());

function fixture(): Lifecycle {
  if (!current) throw new Error('Lifecycle fixture is not ready');
  return current;
}

lifecycleOutcomes(fixture);
lifecycleFences(fixture);
lifecycleBatches(fixture);
lifecycleScopes(fixture);
