import { vi } from 'vitest';
import {
  createEmailWorker,
  createMemoryEmailStore,
  createSmtpAcceptanceResult,
  type AttachmentRef,
  type EmailProvider,
  type EmailWorkerOptions,
  type ProviderCall,
  type ProviderResult,
  type ProviderSubmission,
  type SmtpSnapshot,
} from '../../src';
import { hashSnapshot } from '../../src/internal/message-codecs';
import { A, admission, CALL, insert, SMTP } from '../conformance/store-fixtures';
import { ManualClock } from './template-fixtures';

export const WORKER_LIMITS = Object.freeze({
  leaseMs: 5_000,
  storeTimeoutMs: 500,
  preHandoffTimeoutMs: 3_000,
  attachmentTimeoutMs: 2_500,
  rateTimeoutMs: 400,
  finalizeGraceMs: 200,
  providerTimeoutMs: 1_000,
  maxConcurrency: 1,
});

export function smtpEvidence({ attemptId, snapshot: { envelope } }: ProviderSubmission<SmtpSnapshot>) {
  const result = createSmtpAcceptanceResult(
    (['to', 'cc', 'bcc'] as const).flatMap((group) =>
      envelope[group].map((_, index) => ({ group, index, status: 'accepted' as const })),
    ),
    `<${attemptId}@email.invalid>`,
  );
  if (result.reason !== 'smtp_accepted') throw new Error('Expected full synthetic SMTP acceptance');
  return result;
}

export function smtpFixture(
  submit: (input: ProviderSubmission<SmtpSnapshot>, ctx: ProviderCall) => Promise<ProviderResult> = async (input) =>
    smtpEvidence(input),
) {
  const transmit = vi.fn(submit);
  const prepare = vi.fn<EmailProvider<SmtpSnapshot>['prepare']>((input) => ({
    submit(ctx) {
      return transmit(input, ctx);
    },
  }));
  return { provider: { ref: { ...SMTP }, prepare }, transmit, prepare };
}

export async function workerFixture() {
  const clock = new ManualClock();
  const store = createMemoryEmailStore({ clock });
  await store.ready();
  const smtp = smtpFixture();
  function worker(options: Partial<EmailWorkerOptions> = {}) {
    return createEmailWorker({
      scope: A,
      store,
      providers: [smtp.provider],
      clock,
      ...options,
      limits: { ...WORKER_LIMITS, ...options.limits },
    });
  }
  async function add(
    options?: Parameters<typeof admission>[2] & { attachments?: readonly AttachmentRef[] },
    scope = A,
  ) {
    const value = admission(scope, clock.now(), options);
    if (options?.attachments) {
      const snapshot = { ...value.command.snapshot, attachments: options.attachments };
      value.command = { ...value.command, snapshot, snapshotHash: hashSnapshot(snapshot) };
    }
    return insert(store, value);
  }
  return {
    clock,
    store,
    smtp,
    worker,
    add,
    elapse(ms: number) {
      clock.wall += ms;
      clock.advance(ms);
    },
    job: (id: string) => store.findJob(A, id, CALL),
    commit: (id: string, attempt: string) => store.findAttempt(A, id, attempt, CALL),
  };
}
