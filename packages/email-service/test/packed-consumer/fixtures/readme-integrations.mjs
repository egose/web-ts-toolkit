import assert from 'node:assert/strict';
import { verifyCapacityBindings } from './readme-build/capacity-mixed.mjs';
import { prepared } from './readme-build/readme-local.mjs';
import { smtp } from './readme-build/readme-smtp-profile.mjs';
import { admission, resumed, batch, worker } from './readme-build/readme-batch.mjs';
import { openStore } from './readme-build/readme-mongoose.mjs';
import { configureCapacityLane } from './readme-build/readme-smtp-capacity.mjs';
import './readme-build/readme-entry-types.mjs';
import { inspectResults } from './readme-build/readme-results.mjs';

assert.deepEqual(smtp.ref, prepared.snapshot.provider);
try {
  assert.equal(admission.counts.enqueued, 1);
  assert.equal(resumed.counts.replayed, 1);
  assert.equal(resumed.items[0].job.jobId, admission.items[0].job.jobId);
  const stopped = await batch.run({ limit: 10, concurrency: 2, signal: AbortSignal.abort() });
  assert.equal(stopped.stop, 'aborted');
  assert.equal(stopped.counts.providerCalls, 0);
} finally {
  assert.equal((await worker.shutdown()).status, 'stopped');
}

const uri = process.env.EMAIL_SERVICE_README_MONGO_URI;
assert(uri, 'the Mongoose example needs the isolated replica-set fixture');
const durable = await openStore(uri);
try {
  const { job, page } = await inspectResults(durable.store, admission.items[0].job.jobId);
  assert.equal(job, null);
  assert.deepEqual(page, { items: [] });
  const opted = await configureCapacityLane(durable.connection, {
    key: 'large-smtp',
    host: 'smtp.example.invalid',
    tls: 'starttls',
  });
  try {
    assert.equal(opted.admission.status, 'enqueued');
    assert.equal(opted.admission.job.state, 'queued');
    assert.equal(opted.admission.job.smtpCapacity.maxRecipients, 51);
    assert.deepEqual(await opted.admin.getJob(opted.admission.job.jobId), opted.admission.job);
    const request = {
      batchId: 'capacity-readme',
      items: [
        {
          itemId: 'notice-1',
          command: {
            templateKey: 'notice',
            input: null,
            intent: 'synthetic-notice',
            provider: opted.admission.job.provider,
          },
        },
      ],
    };
    const admitted = await opted.batchAdmission.enqueueBatch(request);
    assert.equal(admitted.items[0].status, 'enqueued');
    assert.deepEqual(admitted.items[0].job.smtpCapacity, opted.admission.job.smtpCapacity);
    assert.deepEqual(await opted.admin.getJob(admitted.items[0].job.jobId), admitted.items[0].job);
    assert.equal((await opted.batch.enqueueBatch(request)).items[0].job.jobId, admitted.items[0].job.jobId);
    const stopped = await opted.batch.run({ limit: 1, signal: AbortSignal.abort() });
    assert.equal(stopped.stop, 'aborted');
    assert.equal(stopped.counts.providerCalls, 0);
  } finally {
    assert.equal((await opted.worker.shutdown()).status, 'stopped');
  }
  await verifyCapacityBindings(durable.connection, durable.store);
} finally {
  await durable.close();
}
