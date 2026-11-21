import { randomUUID } from 'node:crypto';
import { expect, vi } from 'vitest';
import {
  createEmailAdmin,
  createEmailBatchService,
  createEmailService,
  createEmailTemplateRegistry,
  createEmailWorker,
  createSmtpAcceptanceResult,
  defineLocalTemplate,
  type AttachmentRef,
  type AttemptCommit,
  type EmailClock,
  type EmailProvider,
  type EmailStore,
  type PreparedEmailCommand,
  type ProviderResult,
  type SmtpCapacity,
  type SmtpSnapshot,
  type StoreCall,
} from '../../src';
import { MESSAGE_LIMITS } from '../../src/constants';
import { recipientGroups, smtpMessageId } from '../../src/internal/attempt-codecs';
import { systemEmailClock } from '../../src/internal/budget';
import { sha256 } from '../../src/internal/canonical-json';
import { A, AMBIGUOUS, CALL, SMTP, TRANSIENT } from './store-fixtures';

export const SNAPSHOT_BYTES = 2 * 1_024 * 1_024;
export const COUNTS = { to: 334, cc: 333, bcc: 333 } as const;
export const PRIVATE_BODY = 'private-capacity-body';
const PRIVATE_NAME = 'private-capacity-mailbox';
const PRIVATE_REF = 'private-capacity-ref';

export function capacity(maxRecipients = 1_000, namespace: string = randomUUID()): SmtpCapacity {
  return { format: 'smtp-v2', namespace, maxRecipients };
}

export function laneCall(smtpCapacity: SmtpCapacity): StoreCall {
  return { ...CALL, smtpCapacity: { ...smtpCapacity } };
}

function mailbox(id: string, wide: boolean) {
  const domain = wide ? `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(53)}.invalid` : 'example.invalid';
  return {
    address: `${wide ? id.padEnd(64, 'x') : id}@${domain}`,
    name: wide ? `${PRIVATE_NAME}-${id}`.padEnd(128, '\\') : PRIVATE_NAME,
  };
}

function envelope(count: number, wide: boolean) {
  const group = (key: string, length: number) =>
    Array.from({ length }, (_, index) => mailbox(`${key}${index.toString().padStart(4, '0')}`, wide));
  const to = Math.ceil(count / 3);
  const cc = Math.ceil((count - to) / 2);
  return {
    from: mailbox('from', wide),
    to: group('to', to),
    cc: group('cc', cc),
    bcc: group('bcc', count - to - cc),
    replyTo: mailbox('reply', wide),
  };
}

export function capacityTemplate(
  smtpCapacity?: SmtpCapacity,
  {
    clock,
    wide = false,
    attachmentSizes = wide ? [1, 1, 1, 1, 1] : [],
    expiresAt,
  }: { clock?: EmailClock; wide?: boolean; attachmentSizes?: readonly number[]; expiresAt?: number } = {},
) {
  let html = PRIVATE_BODY.padEnd(wide ? MESSAGE_LIMITS.htmlBytes : PRIVATE_BODY.length, 'h');
  const text = PRIVATE_BODY.padEnd(wide ? MESSAGE_LIMITS.textBytes : PRIVATE_BODY.length, 't');
  const resolved = attachmentSizes.map((size, index) => {
    const bytes = new Uint8Array(size).fill(0xfa + index);
    return {
      bytes,
      ref: {
        resolverKey: 'fixture',
        id: `${PRIVATE_REF}-${index}`,
        version: 'fixture-v1',
        filename: `${PRIVATE_REF}-${index}.bin`,
        contentType: 'application/octet-stream',
        byteLength: bytes.byteLength,
        sha256: sha256(bytes),
      },
    };
  });
  const prepare = vi.fn((count: number) => ({
    ...envelope(count, wide),
    values: {},
    ...(expiresAt === undefined ? {} : { expiresAt }),
    attachments: resolved.map(({ ref }) => ref),
    correlation: { trace: 'synthetic-capacity' },
  }));
  const registry = createEmailTemplateRegistry(
    {
      local: defineLocalTemplate<number, Record<string, never>>({
        kind: 'handlebars',
        revision: 'fixture-v1',
        parseInput(input) {
          if (typeof input !== 'number') throw new Error('Expected a synthetic recipient count');
          return input;
        },
        parseData: () => ({}),
        prepare,
        subject: { kind: 'inline', content: 'Synthetic subject'.padEnd(wide ? MESSAGE_LIMITS.subjectBytes : 17, 's') },
        html: { kind: 'inline', content: '{{{fixtureHtml}}}' },
        text: { kind: 'inline', content: '{{fixtureText}}' },
      }),
    },
    {
      ...(smtpCapacity ? { smtpCapacity } : {}),
      ...(clock ? { clock } : {}),
      helpers: { fixtureHtml: () => html, fixtureText: () => text },
    },
  );
  return {
    registry,
    prepare,
    html: () => html,
    setHtml: (value: string) => (html = value),
    resolved,
    attachmentResolvers: {
      fixture(ref: AttachmentRef) {
        const attachment = resolved.find(({ ref: asset }) => asset.id === ref.id);
        return attachment
          ? { status: 'found' as const, bytes: Uint8Array.from(attachment.bytes) }
          : { status: 'unavailable' as const };
      },
    },
  };
}

export function capacityItem(input = 1_000) {
  return { templateKey: 'local', input, provider: SMTP, intent: { input } } as const;
}

export function capacityCommand(idempotencyKey = 'synthetic-capacity', input = 1_000) {
  return { key: { kind: 'single', idempotencyKey }, ...capacityItem(input) } as const;
}

export async function stageMaximum(
  smtpCapacity: SmtpCapacity,
  preparedAt: number,
  attachmentSizes?: readonly number[],
) {
  const fixture = capacityTemplate(smtpCapacity, {
    clock: { ...systemEmailClock, now: () => preparedAt },
    wide: true,
    ...(attachmentSizes ? { attachmentSizes } : {}),
  });
  const command = capacityCommand();
  const first = await fixture.registry.prepare(A, command);
  const extra = SNAPSHOT_BYTES - Buffer.byteLength(JSON.stringify(first.snapshot));
  const zeros = Math.floor(extra / 5); // Every NUL replaces 1 raw byte with 6 canonical bytes.
  const adjustment = '\0'.repeat(zeros) + '\\'.repeat(extra % 5);
  const html = fixture.html();
  fixture.setHtml(html.slice(0, -adjustment.length) + adjustment);
  const staged = await fixture.registry.prepare(A, command);
  if (staged.snapshot.kind !== 'smtp' || !staged.snapshot.html || !staged.snapshot.text) {
    throw new Error('Expected both rendered body parts');
  }
  expect(Buffer.byteLength(JSON.stringify(staged.snapshot))).toBe(SNAPSHOT_BYTES);
  expect(Buffer.byteLength(staged.snapshot.html)).toBe(MESSAGE_LIMITS.htmlBytes);
  expect(Buffer.byteLength(staged.snapshot.text)).toBe(MESSAGE_LIMITS.textBytes);
  for (const group of recipientGroups) {
    expect(staged.snapshot.envelope[group]).toHaveLength(COUNTS[group]);
    expect(
      staged.snapshot.envelope[group].every(({ address, name }) => address.length === 254 && name?.length === 128),
    ).toBe(true);
  }
  expect(staged.snapshot.attachments).toHaveLength(5);
  expect(staged.smtpCapacity).toEqual(smtpCapacity);
  expect(staged.snapshot.smtpCapacity).toEqual(smtpCapacity);
  return { ...fixture, command, staged: { ...staged, snapshot: staged.snapshot } };
}

export function partialEvidence(attemptId: string) {
  return createSmtpAcceptanceResult(
    recipientGroups.flatMap((group) =>
      Array.from({ length: COUNTS[group] }, (_, index) => ({
        group,
        index,
        status: index % 2 === 0 ? ('accepted' as const) : ('rejected' as const),
      })),
    ),
    smtpMessageId(attemptId),
  );
}

export function refusalEvidence() {
  return {
    ...TRANSIENT,
    stage: 'envelope',
    recipients: recipientGroups.flatMap((group) =>
      Array.from({ length: COUNTS[group] }, (_, index) => ({ group, index, status: 'rejected' as const })),
    ),
  } satisfies ProviderResult;
}

export function expectRedacted(input: unknown) {
  const encoded = JSON.stringify(input);
  for (const privateValue of [
    PRIVATE_BODY,
    PRIVATE_NAME,
    PRIVATE_REF,
    '@example.invalid',
    `@${'a'.repeat(63)}.`,
    'snapshotHash',
    'intentHash',
    'ownerDigest',
    'rawReply',
  ]) {
    expect(encoded).not.toContain(privateValue);
  }
}

/** All JS/Mongo entrypoints must reject a legacy or wrong-lane call before reading their arguments or backing. */
export async function expectOperationFence(store: EmailStore, call: StoreCall) {
  const absent = undefined as never;
  const scope = 'bad scope!';
  for (const invoke of [
    () => store.findAdmission(scope, absent, call),
    () => store.insert(scope, absent, call),
    () => store.findJob(scope, absent, call),
    () => store.findAttempt(scope, absent, absent, call),
    () => store.claimNext(scope, absent, call),
    () => store.renew(scope, absent, absent, call),
    () => store.markHandoff(scope, absent, absent, call),
    () => store.finish(scope, absent, call),
    () => store.recoverNext(scope, call),
    () => store.expireNext(scope, call),
    () => store.cancel(scope, absent, call),
    () => store.resolveUnknown(scope, absent, call),
    () => store.reserveProjection(scope, call),
    () => store.putActivity(scope, absent, call),
    () => store.ackProjection(scope, absent, call),
    () => store.listActivities(scope, absent, call),
    () => store.cleanupNext(scope, call),
  ]) {
    await expect(invoke()).rejects.toMatchObject({ code: 'store_incompatible' });
  }
}

function required<T>(value: T | null | undefined, label: string): T {
  if (value == null) throw new Error(`Missing ${label}`);
  return value;
}

/** Same worker/provider-evidence/finish path for both adapters. The synthetic provider never opens a socket. */
export async function driveCapacityLedger(
  primary: EmailStore,
  peer: EmailStore,
  smtpCapacity: SmtpCapacity,
  maximum: Awaited<ReturnType<typeof stageMaximum>>,
  waitFor: (timestamp: number) => void | Promise<void>,
) {
  const call = laneCall(smtpCapacity);
  const { staged, attachmentResolvers } = maximum;
  const registry = createEmailTemplateRegistry({}, { smtpCapacity }); // Outbox relay; no templates needed for retries.
  const service = createEmailService({
    scope: A,
    smtpCapacity,
    registry,
    store: primary,
    retry: { maxAttempts: 10, baseDelayMs: 100, maxDelayMs: 100 },
    retention: { payloadMs: 0 },
  });
  const roundTripped = JSON.parse(JSON.stringify(staged)) as PreparedEmailCommand;
  const created = await service.enqueuePrepared(roundTripped);
  expect(created).toMatchObject({ status: 'enqueued', job: { state: 'queued', smtpCapacity } });
  expect(await service.enqueuePrepared(roundTripped)).toEqual({ status: 'replayed', job: created.job });
  expect(maximum.prepare).toHaveBeenCalledTimes(2);
  const { jobId } = created.job;
  const admin = createEmailAdmin({ scope: A, smtpCapacity, store: peer });
  const finishes: Parameters<EmailStore['finish']>[1][] = [];
  let hiddenProof = 0;
  let providerCalls = 0;
  const commits: AttemptCommit[] = [];
  const provider: EmailProvider<SmtpSnapshot> = {
    ref: SMTP,
    smtpCapacity,
    prepare(input) {
      expect(input.jobId).toBe(jobId);
      expect(Object.isFrozen(input.snapshot.envelope.bcc)).toBe(true);
      expect(input.snapshot).toEqual(staged.snapshot);
      expect(input.attachments).toEqual(maximum.resolved);
      return {
        async submit() {
          providerCalls++;
          return providerCalls === 10
            ? AMBIGUOUS
            : providerCalls === 11
              ? partialEvidence(input.attemptId)
              : refusalEvidence();
        },
      };
    },
  };
  const store: EmailStore = {
    ...primary,
    async finish(scope, request, bound) {
      const result = await primary.finish(scope, request, bound);
      if (providerCalls !== 11 || !result?.result.recipients) return result;
      finishes.push(request);
      if (finishes.length !== 1) return result;
      // Only a differing tail status: still well-formed and the same operation ID. It isn't an exact ACK.
      const recipients = [...result.result.recipients];
      recipients[999] = { ...recipients[999]!, status: 'rejected' };
      return { ...result, result: { ...result.result, recipients } };
    },
    async findAttempt(...args) {
      if (finishes.length === 1 && hiddenProof++ === 0) return null;
      return primary.findAttempt(...args);
    },
  };
  const worker = createEmailWorker({ scope: A, smtpCapacity, store, providers: [provider], attachmentResolvers });
  async function run(expectedStatus: AttemptCommit['disposition']) {
    const report = await worker.run({ limit: 1, maintenanceLimit: 0 });
    expect(report.items).toHaveLength(1);
    expect(report.items[0]).toMatchObject({ jobId, status: expectedStatus, providerInvoked: true });
    const attemptId = required(report.items[0]?.attemptId, 'run attempt ID');
    const commit = required(await peer.findAttempt(A, jobId, attemptId, call), 'authoritative attempt');
    expect(commit.ordinal).toBe(commits.length + 1);
    expect(commit.result).toEqual(
      expectedStatus === 'unknown' ? AMBIGUOUS : commits.length === 10 ? partialEvidence(attemptId) : refusalEvidence(),
    );
    commits.push(commit);
    return report;
  }
  try {
    for (let index = 0; index < 9; index++) {
      await run('retry_scheduled');
      await waitFor(required(commits.at(-1)?.retryAt, 'retry time'));
    }
    await run('unknown');
    expect(await worker.run({ limit: 1 })).toMatchObject({ stop: 'idle', counts: { providerCalls: 0 } });
    expect(await admin.cleanup()).toMatchObject({ stop: 'idle', payloadsPruned: 0 });
    const resolution = { jobId, attemptId: commits[9]!.attemptId, action: 'redrive' } as const;
    await expect(admin.resolveUnknown(resolution as never)).rejects.toMatchObject({ code: 'invalid_command' });
    expect(await admin.resolveUnknown({ ...resolution, acknowledgeDuplicateRisk: true })).toMatchObject({
      status: 'resolved',
      job: { state: 'queued', attemptCount: 10 },
    });
    expect(await run('partially_accepted')).toMatchObject({ stop: 'store_error', counts: { persistenceFailures: 1 } });
    expect(providerCalls).toBe(11);
    expect(finishes).toHaveLength(2);
    expect(finishes[0]).toBe(finishes[1]); // Same operation, owner and full evidence replayed; no second submit.
    expect(await worker.run({ limit: 1 })).toMatchObject({ stop: 'idle', counts: { providerCalls: 0 } });
  } finally {
    await worker.shutdown();
  }

  const last = required(commits.at(-1), 'last attempt');
  const exact = required(finishes[0], 'original finish');
  expect(await peer.finish(A, exact, call)).toEqual(last);
  const changedRecipients = [...required(last.result.recipients, 'mixed outcome')];
  changedRecipients[999] = { ...changedRecipients[999]!, status: 'rejected' };
  await expect(
    peer.finish(A, { ...exact, result: { ...last.result, recipients: changedRecipients } }, call),
  ).rejects.toMatchObject({ code: 'invalid_command' });
  expect(await admin.getJob(jobId)).toMatchObject({
    disposition: 'partially_accepted',
    attemptCount: 11,
    smtpCapacity,
  });
  expect(await admin.listActivities()).toEqual({ items: [] });
  expect(await admin.cleanup()).toMatchObject({ stop: 'idle', payloadsPruned: 0 });
  expect(await admin.reconcile({ limit: 16, timeoutMs: 60_000 })).toMatchObject({ stop: 'idle', acknowledged: 11 });
  return {
    admin,
    jobId,
    last,
    commits,
    async prune() {
      expect(await admin.cleanup()).toMatchObject({ stop: 'idle', payloadsPruned: 1, jobsPurged: 0 });
      expect(await service.enqueuePrepared(roundTripped)).toMatchObject({
        status: 'replayed',
        job: { jobId, attemptCount: 11 },
      });
      await expect(service.enqueuePrepared({ ...roundTripped, fingerprint: '0'.repeat(64) })).rejects.toMatchObject({
        code: 'invalid_snapshot',
      });
    },
  };
}

/** Bring the scope to 18 complete attempts so the maximum page has to prove a continuation. */
export async function fillCapacityPage(store: EmailStore, smtpCapacity: SmtpCapacity) {
  const { registry, prepare } = capacityTemplate(smtpCapacity);
  const service = createEmailService({ scope: A, smtpCapacity, store, registry });
  const provider: EmailProvider<SmtpSnapshot> = {
    ref: SMTP,
    smtpCapacity,
    prepare({ attemptId }) {
      return {
        async submit() {
          return partialEvidence(attemptId);
        },
      };
    },
  };
  const worker = createEmailWorker({ scope: A, smtpCapacity, store, providers: [provider] });
  const batch = createEmailBatchService({ smtpCapacity, service, worker });
  const command = capacityItem();
  const items = Array.from({ length: 7 }, (_, index) => ({ itemId: `item-${index}`, command }));
  try {
    expect(await batch.enqueueBatch({ batchId: 'page-batch', items })).toMatchObject({ counts: { enqueued: 7 } });
    expect(await batch.enqueueBatch({ batchId: 'page-batch', items })).toMatchObject({ counts: { replayed: 7 } });
    expect(prepare).toHaveBeenCalledTimes(7);
    expect(await batch.run({ limit: 7 })).toMatchObject({
      counts: { claimed: 7, partiallyAccepted: 7, providerCalls: 7 },
    });
  } finally {
    await worker.shutdown();
  }
  const admin = createEmailAdmin({ scope: A, smtpCapacity, store });
  expect(await admin.reconcile({ limit: 16 })).toMatchObject({ acknowledged: 7 });
}
