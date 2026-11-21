import { describe, expect, it, vi } from 'vitest';
import {
  createEmailRelay,
  createEmailService,
  createEmailTemplateRegistry,
  createMemoryEmailStore,
  type PreparedEmailCommand,
} from '../../src';
import { COMPOSITE_TYPES, stagedWithContentType } from '../conformance/smtp-attachment-fixture';
import { capacity, laneCall } from '../conformance/smtp-capacity-fixture';
import { admission, CALL } from '../conformance/store-fixtures';
import { ATTACHMENT, command, local, ManualClock, remote, remoteCommand, SCOPE, TO } from './template-fixtures';

const INVALID = { code: 'invalid_snapshot' };

describe.each(['V1', 'smtp-v2'] as const)('%s SMTP attachment admission', (lane) => {
  async function fixture(contentType = 'text/plain') {
    const smtpCapacity = lane === 'smtp-v2' ? capacity(51) : undefined;
    const binding = smtpCapacity ? { smtpCapacity } : {};
    const call = smtpCapacity ? laneCall(smtpCapacity) : CALL;
    const clock = new ManualClock();
    const store = createMemoryEmailStore({ clock, ...binding });
    await store.ready();
    const findAdmission = vi.fn(store.findAdmission);
    const insert = vi.fn(store.insert);
    const port = { ...store, findAdmission, insert };
    const load = vi.fn(() => 'Hello {{title}}');
    const prepare = vi.fn((title: string) => ({
      to: [TO],
      values: { title },
      attachments: [ATTACHMENT, { ...ATTACHMENT, id: 'opaque.2', filename: 'attachment.bin', contentType }],
    }));
    const registry = createEmailTemplateRegistry(
      { local: { ...local, prepare, text: { kind: 'async', load } } },
      { clock, ...binding },
    );
    const options = { scope: SCOPE, store: port, ...binding };
    return {
      call,
      clock,
      store,
      findAdmission,
      insert,
      load,
      prepare,
      registry,
      options,
      service: createEmailService({ ...options, registry }),
    };
  }

  it.each(COMPOSITE_TYPES)('rejects %s in direct registry preparation before rendering', async (contentType) => {
    const { registry, prepare, load } = await fixture(contentType);
    await expect(registry.prepare(SCOPE, command)).rejects.toMatchObject(INVALID);
    expect(prepare).toHaveBeenCalledOnce();
    expect(load).not.toHaveBeenCalled();
  });

  it.each(COMPOSITE_TYPES)('rejects %s in standard enqueue before calling insert', async (contentType) => {
    const { service, store, call, findAdmission, insert, load } = await fixture(contentType);
    await expect(service.enqueue(command)).rejects.toMatchObject(INVALID);
    expect(findAdmission.mock.calls.map(([scope, key]) => [scope, key])).toEqual([[SCOPE, command.key]]);
    expect(insert).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(await store.findAdmission(SCOPE, command.key, call)).toBeNull();
  });

  it.each(
    COMPOSITE_TYPES.flatMap((contentType) =>
      (['service relay', 'registry-free relay', 'injected registry'] as const).map((route) => ({ contentType, route })),
    ),
  )('rejects older $contentType from $route on a scoped miss before calling insert', async ({ contentType, route }) => {
    const { registry, options, service, store, call, findAdmission, insert, prepare } = await fixture();
    const leaf = await registry.prepare(SCOPE, command);
    const staged: PreparedEmailCommand = JSON.parse(JSON.stringify(stagedWithContentType(leaf, contentType)));
    prepare.mockClear();
    const external = vi.fn(async () => staged);
    const pending =
      route === 'service relay'
        ? service.enqueuePrepared(staged)
        : route === 'registry-free relay'
          ? createEmailRelay(options).enqueuePrepared(staged)
          : createEmailService({ ...options, registry: { ...registry, prepare: external } }).enqueue(command);
    await expect(pending).rejects.toMatchObject(INVALID);
    expect(findAdmission.mock.calls.map(([scope, key]) => [scope, key])).toEqual([[SCOPE, command.key]]);
    expect(external).toHaveBeenCalledTimes(route === 'injected registry' ? 1 : 0);
    expect(prepare).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(await store.findAdmission(SCOPE, command.key, call)).toBeNull();
  });

  it.each(COMPOSITE_TYPES)('rejects a new %s job through the raw store primitive', async (contentType) => {
    const { registry, store, clock, call } = await fixture();
    const leaf = await registry.prepare(SCOPE, command);
    const older = stagedWithContentType(leaf, contentType);
    const input = admission(SCOPE, clock.wall);
    await expect(store.insert(SCOPE, { ...input, command: older }, call)).rejects.toMatchObject(INVALID);
    expect(await store.findAdmission(SCOPE, command.key, call)).toBeNull();
    expect(await store.findJob(SCOPE, input.jobId, call)).toBeNull();
    await expect(store.insert(SCOPE, { ...input, command: leaf }, call)).resolves.toMatchObject({
      status: 'inserted',
      job: { jobId: input.jobId, key: command.key },
    });
    await expect(store.insert(SCOPE, { ...input, command: older }, call)).resolves.toEqual({ status: 'duplicate' });
  });

  it('admits leaf refs and replays a different, historically valid snapshot with the same identity', async () => {
    const { clock, registry, service, options, prepare, insert } = await fixture();
    const leaf = await registry.prepare(SCOPE, command);
    const older = stagedWithContentType(leaf, 'message/rfc822');
    expect(older.snapshotHash).not.toBe(leaf.snapshotHash);
    const added = await service.enqueue(command);
    expect(added.status).toBe('enqueued');
    const replay = { status: 'replayed', job: added.job };
    clock.wall = leaf.snapshot.expiresAt;
    await expect(service.enqueuePrepared(older)).resolves.toEqual(replay);
    await expect(createEmailRelay(options).enqueuePrepared(older)).resolves.toEqual(replay);
    await expect(service.enqueue(command)).resolves.toEqual(replay);
    expect(prepare).toHaveBeenCalledTimes(2); // Direct stage and initial enqueue only.
    expect(insert).toHaveBeenCalledOnce();
  });
});

it('keeps SendGrid preparation and admission unchanged for the same reference types', async () => {
  const store = createMemoryEmailStore();
  await store.ready();
  const registry = createEmailTemplateRegistry({
    remote: {
      ...remote,
      prepare: (title: string) => ({
        to: [TO],
        values: { title },
        attachments: COMPOSITE_TYPES.map((contentType, index) => ({
          ...ATTACHMENT,
          id: `synthetic-${index}`,
          contentType,
        })),
      }),
    },
  });
  const options = { scope: SCOPE, store };
  const service = createEmailService({ ...options, registry });
  const staged = await registry.prepare(SCOPE, remoteCommand);
  expect(staged.snapshot.attachments.map(({ contentType }) => contentType)).toEqual(COMPOSITE_TYPES);
  await expect(createEmailRelay(options).enqueuePrepared(staged)).resolves.toMatchObject({ status: 'enqueued' });
  await expect(
    service.enqueue({ ...remoteCommand, key: { kind: 'single', idempotencyKey: 'other' } }),
  ).resolves.toMatchObject({ status: 'enqueued' });
});
