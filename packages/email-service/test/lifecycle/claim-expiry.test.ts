import { it } from 'vitest';
import { createMemoryEmailStore, type SmtpCapacity } from '../../src';
import { systemEmailClock } from '../../src/internal/budget';
import { driveClaimExpiry, V1_EXPIRY_PLAN } from '../conformance/claim-expiry';
import { capacity } from '../conformance/smtp-capacity-fixture';

async function memoryQueue(smtpCapacity?: SmtpCapacity) {
  let now = Date.now();
  const clock = { ...systemEmailClock, now: () => now };
  const store = createMemoryEmailStore({ clock, ...(smtpCapacity ? { smtpCapacity } : {}) });
  await store.ready();
  return {
    primary: store,
    peer: store,
    now: clock.now,
    waitFor(target: number) {
      now = target;
    },
  };
}

it('signals a full expired memory claim window and reaches live mail once with bounded maintenance', async () => {
  await driveClaimExpiry(await memoryQueue(), V1_EXPIRY_PLAN);
});

it('keeps opt-in memory progress within its eight resident jobs and four default expiry steps', async () => {
  const smtpCapacity = capacity(51);
  await driveClaimExpiry(
    await memoryQueue(smtpCapacity),
    {
      backlog: 5,
      // The memory claim cap is 16, so the live job is already within its window.
      withoutMaintenance: [
        ['limit', 0, 1],
        ['idle', 0, 0],
      ],
      withDefaultMaintenance: [
        ['idle', 4, 0],
        ['idle', 1, 0],
      ],
    },
    smtpCapacity,
  );
});
