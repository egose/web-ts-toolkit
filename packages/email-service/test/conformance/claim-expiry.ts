import { expect, vi } from 'vitest';
import {
  createEmailService,
  createEmailWorker,
  createSmtpAcceptanceResult,
  type EmailProvider,
  type EmailRunReport,
  type ProviderSubmission,
  type SmtpCapacity,
  type SmtpSnapshot,
} from '../../src';
import { recipientGroups, smtpMessageId } from '../../src/internal/attempt-codecs';
import { systemEmailClock } from '../../src/internal/budget';
import { capacityCommand, capacityTemplate, laneCall } from './smtp-capacity-fixture';
import { A, B, CALL, SMTP, type StoreFixture } from './store-fixtures';

type Step = readonly [stop: EmailRunReport['stop'], expiredInSweep: number, claimed: number];
type ExpiryPlan = {
  readonly backlog: number;
  readonly withoutMaintenance: readonly Step[];
  readonly withDefaultMaintenance: readonly Step[];
};

const BLOCKED = 'expiry_maintenance_required';
export const V1_EXPIRY_PLAN = {
  backlog: 26,
  withoutMaintenance: [
    [BLOCKED, 0, 0],
    [BLOCKED, 0, 0],
  ],
  withDefaultMaintenance: [
    [BLOCKED, 10, 0],
    ['limit', 10, 1],
    ['idle', 6, 0],
  ],
} as const satisfies ExpiryPlan;

async function inBatches<T, R>(items: readonly T[], width: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += width) {
    results.push(...(await Promise.all(items.slice(i, i + width).map(run))));
  }
  return results;
}

/** Real queue lifecycle, real store time, no SMTP connection. Both foreign jobs must remain untouched. */
export async function driveClaimExpiry(
  queue: StoreFixture & { waitFor(target: number): void | Promise<void> },
  plan: ExpiryPlan,
  smtpCapacity?: SmtpCapacity,
  observeZeroMaintenance = (run: () => Promise<void>) => run(),
) {
  const start = await queue.now();
  // Leave time to admit the entire prefix with journaled majority writes before waiting for expiry.
  const expiresAt = start + (smtpCapacity ? 4_000 : 6_000);
  const binding = smtpCapacity ? { smtpCapacity } : {};
  const call = smtpCapacity ? laneCall(smtpCapacity) : CALL;
  const { primary: store, peer } = queue;
  function enqueuer(scope: string, preparedAt: number, expiry?: number) {
    const { registry } = capacityTemplate(smtpCapacity, {
      clock: { ...systemEmailClock, now: () => preparedAt },
      ...(expiry === undefined ? {} : { expiresAt: expiry }),
    });
    const service = createEmailService({ scope, store, registry, ...binding });
    return async (key: string) => {
      const { status, job } = await service.enqueue(capacityCommand(key, smtpCapacity ? 51 : 1));
      expect(status).toBe('enqueued');
      return job;
    };
  }
  const foreignExpired = await enqueuer(B, start, expiresAt)('foreign-expired');
  const foreignLive = await enqueuer(B, start)('foreign-live');
  const width = smtpCapacity ? 2 : 8; // Below each lane's in-flight limit, including opt-in admission.
  const keys = Array.from({ length: plan.backlog }, (_, n) => `expired-${n}`);
  const expired = await inBatches(keys, width, enqueuer(A, start, expiresAt));
  await queue.waitFor(expiresAt);
  const live = await enqueuer(A, await queue.now())('live');

  const submit = vi.fn(async ({ attemptId, snapshot }: ProviderSubmission<SmtpSnapshot>) =>
    createSmtpAcceptanceResult(
      recipientGroups.flatMap((group) =>
        snapshot.envelope[group].map((_, index) => ({ group, index, status: 'accepted' as const })),
      ),
      smtpMessageId(attemptId),
    ),
  );
  const provider: EmailProvider<SmtpSnapshot> = {
    ref: SMTP,
    ...binding,
    prepare(input) {
      return { submit: () => submit(input) };
    },
  };
  const worker = createEmailWorker({ scope: A, store, providers: [provider], ...binding });
  function checkReport(report: EmailRunReport, [stop, expiredInSweep, claimed]: Step) {
    expect(report).toMatchObject({
      stop,
      counts: { claimed, expiredInSweep, providerCalls: claimed, accepted: claimed, persistenceFailures: 0 },
    });
    expect(report.items).toHaveLength(expiredInSweep + claimed);
    if (claimed) {
      expect(report.items.at(-1)).toMatchObject({
        operation: 'claim',
        jobId: live.jobId,
        status: 'accepted',
        providerInvoked: true,
      });
    }
  }

  try {
    await observeZeroMaintenance(async () => {
      const reports = [];
      for (let i = 0; i < plan.withoutMaintenance.length; i++) {
        reports.push(await worker.run({ limit: 1, maintenanceLimit: 0 }));
      }
      expect(reports.map(({ stop }) => stop)).toEqual(plan.withoutMaintenance.map(([stop]) => stop));
      for (const [i, step] of plan.withoutMaintenance.entries()) checkReport(reports[i]!, step);
    });
    // Even repeated blocked calls do not spend any maintenance budget or change queued jobs.
    await inBatches(expired, width, async (job) => {
      expect(await peer.findJob(A, job.jobId, call)).toEqual(job);
    });
    if (plan.withoutMaintenance.every((step) => step[2] === 0)) {
      expect(await peer.findJob(A, live.jobId, call)).toEqual(live);
      expect(submit).not.toHaveBeenCalled();
    }

    // The documented remedy after a blocked window: run with the default maintenance budget, repeatedly if needed.
    for (const step of plan.withDefaultMaintenance) checkReport(await worker.run({ limit: 1 }), step);
    expect(await worker.run()).toMatchObject({ stop: 'idle', items: [], counts: { claimed: 0, expiredInSweep: 0 } });
    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.calls[0]?.[0].jobId).toBe(live.jobId);
    expect(await peer.findJob(A, live.jobId, call)).toMatchObject({
      state: 'terminal',
      disposition: 'accepted',
      attemptCount: 1,
    });
    await inBatches(expired, width, async (job) => {
      expect(await peer.findJob(A, job.jobId, call)).toMatchObject({
        state: 'terminal',
        disposition: 'expired',
        attemptCount: 0,
      });
    });
    expect(await peer.findJob(B, foreignExpired.jobId, call)).toEqual(foreignExpired);
    expect(await peer.findJob(B, foreignLive.jobId, call)).toEqual(foreignLive);
  } finally {
    await worker.shutdown();
  }
}
