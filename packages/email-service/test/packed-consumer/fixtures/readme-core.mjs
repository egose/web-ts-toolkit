import assert from 'node:assert/strict';
import './readme-build/readme-errors.mjs';
import { prepared } from './readme-build/readme-local.mjs';
import { stagedReminder } from './readme-build/readme-sendgrid-template.mjs';
import { first, again } from './readme-build/readme-admission.mjs';
import { writeReminder, relayReminder } from './readme-build/readme-outbox.mjs';
import { validationProfile } from './readme-build/readme-sendgrid-profile.mjs';
import { memoryStore } from './readme-build/readme-memory.mjs';
import { makeWorker, runDue } from './readme-build/readme-worker.mjs';
import { inspectResults } from './readme-build/readme-results.mjs';

assert.equal(prepared.snapshot.kind, 'smtp');
assert.equal(prepared.snapshot.subject, 'Welcome, <Example>');
assert.equal(prepared.snapshot.html, '<p>Welcome, &lt;Example&gt;.</p>');
assert(Object.isFrozen(prepared.snapshot));
assert.equal(first.status, 'enqueued');
assert.equal(first.job.state, 'queued');
assert.equal(again.status, 'replayed');
assert.equal(first.job.jobId, again.job.jobId);

assert.equal(stagedReminder.version, 1);
assert.equal(stagedReminder.snapshot.kind, 'sendgrid');
assert.equal(stagedReminder.snapshot.templateId, 'd-0123456789abcdeffedcba9876543210');
assert.equal(stagedReminder.snapshot.data.hours, 2);
assert.equal(stagedReminder.snapshot.envelope.to[0].address, 'recipient@example.invalid');

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
const admitted = await relayReminder(memoryStore, persisted.email);
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
  const replay = await relayReminder(memoryStore, JSON.parse(row).email);
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
