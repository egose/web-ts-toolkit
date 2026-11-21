import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { createEmailAdmin, createEmailWorker, createMemoryEmailStore, EmailError } from '@web-ts-toolkit/email-service';
import { configureSendGrid, hasEmailCode } from './readme-build/readme-errors.mjs';
import { prepared, welcomeCommand } from './readme-build/readme-local.mjs';
import { stagedReminder } from './readme-build/readme-sendgrid-template.mjs';
import { store, first, again } from './readme-build/readme-admission.mjs';
import { enqueueSevenDayReminder } from './readme-build/readme-scheduled-reminder.mjs';
import { writeReminder, makeReminderRelay } from './readme-build/readme-outbox.mjs';
import { validationProfile } from './readme-build/readme-sendgrid-profile.mjs';
import { memoryStore } from './readme-build/readme-memory.mjs';
import { makeWorker, runDue } from './readme-build/readme-worker.mjs';
import { syntheticSmtp } from './readme-build/readme-custom-provider.mjs';
import { inspectResults } from './readme-build/readme-results.mjs';

assert.equal(configureSendGrid({ key: 'validation', apiKey: '' }), null);
assert.deepEqual(configureSendGrid({ key: 'validation', apiKey: 'synthetic-key', mode: 'sandbox' }).ref, {
  kind: 'sendgrid',
  key: 'validation',
  mode: 'sandbox',
});
assert.equal(hasEmailCode(new EmailError('write_unconfirmed'), 'write_unconfirmed'), true);
assert.equal(hasEmailCode(null, 'invalid_config'), false);
let accessorCalls = 0;
const accessorError = {
  get code() {
    accessorCalls++;
    return 'invalid_config';
  },
};
assert.equal(hasEmailCode(accessorError, 'invalid_config'), false);
assert.equal(accessorCalls, 0);
const revoked = Proxy.revocable({}, {});
revoked.revoke();
assert.equal(hasEmailCode(revoked.proxy, 'invalid_config'), false);

assert.equal(welcomeCommand.input, '  <Example>  ');
assert.equal(prepared.snapshot.kind, 'smtp');
assert.equal(prepared.snapshot.subject, 'Welcome, <Example>');
assert.equal(prepared.snapshot.html, '<p>Welcome, &lt;Example&gt;.</p>');
assert(Object.isFrozen(prepared.snapshot));
assert.equal(first.status, 'enqueued');
assert.equal(first.job.state, 'queued');
assert.equal(again.status, 'replayed');
assert.equal(first.job.jobId, again.job.jobId);

const smtpWorker = makeWorker(store, [syntheticSmtp]);
try {
  const report = await runDue(smtpWorker, new AbortController().signal);
  assert.equal(report.counts.submitted, 1);
  assert.equal(report.counts.providerCalls, 1);
  assert.equal(report.items[0].reason, 'smtp_accepted');
  const { job, page } = await inspectResults(store, first.job.jobId);
  assert.equal(job.latestAttempt.outcome, 'accepted');
  assert.deepEqual(page.items[0].result, {
    outcome: 'accepted',
    retry: 'never',
    stage: 'data',
    reason: 'smtp_accepted',
    recipients: [{ group: 'to', index: 0, status: 'accepted' }],
  });
  assert.equal((await smtpWorker.run()).counts.providerCalls, 0);
} finally {
  assert.equal((await smtpWorker.shutdown()).status, 'stopped');
}

// This follow-on uses the same store. Run the single-job worker example first.
const { admission, resumed } = await import('./readme-build/readme-batch-admission.mjs');
assert.equal(admission.counts.enqueued, 1);
assert.equal(resumed.counts.replayed, 1);
assert.deepEqual(resumed.items[0].job, admission.items[0].job);

assert.equal(stagedReminder.version, 1);
assert.equal(stagedReminder.snapshot.kind, 'sendgrid');
assert.equal(stagedReminder.snapshot.templateId, 'd-0123456789abcdeffedcba9876543210');
assert.equal(stagedReminder.snapshot.data.hours, 2);
assert.equal(stagedReminder.snapshot.envelope.to[0].address, 'recipient@example.invalid');
const dayMs = 86_400_000;
assert.equal(stagedReminder.snapshot.expiresAt - stagedReminder.snapshot.preparedAt, dayMs);

// The host commit callback is a synthetic in-memory serialization boundary,
// not an implementation or test of a database transaction.
let row;
await writeReminder('reminder-1', stagedReminder, async (record) => {
  assert.equal(row, undefined);
  row = JSON.stringify(record);
});
const persisted = JSON.parse(row);
assert.equal(persisted.reminderId, 'reminder-1');
assert.equal(persisted.email.snapshotHash, stagedReminder.snapshotHash);
const relayReminder = makeReminderRelay(memoryStore);
const admitted = await relayReminder(persisted);
assert.equal(admitted.status, 'enqueued');
assert.equal(admitted.job.expiresAt, stagedReminder.snapshot.expiresAt);
assert.equal(admitted.job.state, 'queued');

const profile = validationProfile('synthetic-key');
assert.deepEqual(profile.ref, stagedReminder.snapshot.provider);
const validated = { outcome: 'validated', retry: 'never', stage: 'http', reason: 'sendgrid_validated' };
let submissions = 0;
const worker = makeWorker(memoryStore, [
  {
    ref: profile.ref,
    prepare(input) {
      assert.deepEqual(input.snapshot, stagedReminder.snapshot);
      assert.equal(typeof profile.prepare(input).submit, 'function'); // Real adapter preflight only.
      return {
        async submit() {
          submissions++;
          return validated; // Synthetic outcome, no provider request.
        },
      };
    },
  },
]);
try {
  const run = await runDue(worker, new AbortController().signal);
  assert.equal(run.counts.validated, 1);
  assert.equal(run.counts.submitted, 0);
  assert.equal(submissions, 1);
  const replay = await relayReminder(JSON.parse(row));
  assert.equal(replay.status, 'replayed');
  assert.equal(replay.job.jobId, admitted.job.jobId);

  const { job, projected, page, next, cleaned } = await inspectResults(memoryStore, admitted.job.jobId);
  assert.equal(job.latestAttempt.outcome, 'validated');
  assert.equal(projected.acknowledged, 1);
  assert.equal(page.items.length, 1);
  assert.deepEqual(page.items[0].result, validated);
  assert.equal(next, undefined);
  assert.equal(cleaned.jobsPurged, 0);
  assert.doesNotMatch(JSON.stringify({ job, page }), /recipient@example\.invalid|synthetic-key|templateId|snapshot/);
} finally {
  assert.equal((await worker.shutdown()).status, 'stopped');
}

// Drive only the store's wall time; the scheduled example uses actual preparation time.
const booking = { eventId: 'booking-718', recordedAt: Date.now() };
let storeNow = booking.recordedAt;
const reminderStore = createMemoryEmailStore({
  clock: {
    now: () => storeNow,
    monotonicNow: () => performance.now(),
    sleep: (ms, signal) => sleep(ms, undefined, { signal }),
  },
});
await reminderStore.ready();
const scheduled = await enqueueSevenDayReminder(reminderStore, booking);
const { jobId, scheduleAt, expiresAt } = scheduled.job;
assert.equal(scheduled.status, 'enqueued');
assert.equal(scheduled.job.state, 'queued');
assert.equal(scheduleAt, booking.recordedAt + 7 * dayMs);
assert.equal(scheduled.job.nextAt, scheduleAt);
assert(expiresAt >= booking.recordedAt + 8 * dayMs && expiresAt <= Date.now() + 8 * dayMs);
assert(expiresAt > scheduleAt);
await assert.rejects(enqueueSevenDayReminder(reminderStore, { ...booking, recordedAt: booking.recordedAt + 1 }), {
  code: 'idempotency_conflict',
});

const queue = { scope: 'example-app', store: reminderStore };
const admin = createEmailAdmin(queue);
let deferrals = 0;
const retryAfterMs = 3_000; // Later than both initial backoff caps (1 s and 2 s).
const quotaWorker = createEmailWorker({
  ...queue,
  providers: [
    {
      ref: profile.ref,
      prepare: () => ({
        async submit() {
          assert.fail('quota should prevent submission');
        },
      }),
    },
  ],
  rateLimiter: {
    scope: 'worker',
    tryAcquire() {
      deferrals++;
      return { status: 'deferred', retryAfterMs };
    },
  },
});
try {
  assert.equal((await quotaWorker.run({ limit: 1 })).counts.claimed, 0);
  assert.equal(deferrals, 0);
  storeNow = scheduleAt;
  for (let ordinal = 1; ordinal <= 3; ordinal++) {
    const report = await quotaWorker.run({ limit: 1 });
    assert.equal(report.counts.claimed, 1);
    assert.equal(report.counts.providerCalls, 0);
    assert.equal(report.items[0].providerInvoked, false);
    const job = await admin.getJob(jobId);
    assert.equal(job.attemptCount, ordinal);
    assert.equal(job.expiresAt, expiresAt);
    assert.equal(job.latestAttempt.reason, 'rate_deferred');
    if (ordinal < 3) {
      assert.equal(report.items[0].status, 'retry_scheduled');
      assert.equal(job.state, 'queued');
      assert.equal(job.nextAt, storeNow + retryAfterMs);
      storeNow = job.nextAt;
    } else {
      assert.equal(job.state, 'terminal');
      assert.equal(job.disposition, 'failed');
      assert.equal(job.terminalReason, 'attempts_exhausted');
    }
  }
  assert.equal(deferrals, 3);
  storeNow = expiresAt;
  const replay = await enqueueSevenDayReminder(reminderStore, booking);
  assert.equal(replay.status, 'replayed');
  assert.deepEqual(replay.job, await admin.getJob(jobId));
  assert.equal(replay.job.expiresAt, expiresAt);
  assert.equal((await quotaWorker.run({ limit: 1 })).counts.claimed, 0);
} finally {
  assert.equal((await quotaWorker.shutdown()).status, 'stopped');
}
