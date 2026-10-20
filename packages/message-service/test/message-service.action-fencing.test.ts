import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeferredBarrier, createMessageServiceBarriers } from './support/deferred';
import { createMongoMessageServiceFixture, type MongoMessageServiceFixture } from './support/mongodb-fixture';
import { ActionConflictError, ActionRetryableError, MAX_MESSAGE_SERVICE_TIMEOUT_MS } from '../src/message-service';
import type { ActionContext, MessageTemplate } from '../src/types/template';

const senderId = new mongoose.Types.ObjectId();
const receiverId = new mongoose.Types.ObjectId();

const roleTemplate: MessageTemplate = {
  templateCd: 'fencing-role-test',
  type: 'request',
  description: 'Action fencing test',
  senderContent: { title: 'Sender', long: 'Sender long', short: 'Sender short' },
  receiverContent: { title: 'Receiver', long: 'Receiver long', short: 'Receiver short' },
  uiTemplate: 'default-message',
  prepareMessage: async ({ user, payload }) => ({
    fromUser: user._id,
    toUser: (payload.toUser as mongoose.Types.ObjectId | undefined) ?? null,
    toRoles: (payload.toRoles as string[] | undefined) ?? [],
    payload,
  }),
  actions: [],
};

async function readActiveDoc(models: MongoMessageServiceFixture['models'], id: unknown) {
  return (await models.Message.findById(id).lean()) as unknown as Record<string, unknown> | null;
}

async function readArchiveDoc(models: MongoMessageServiceFixture['models'], id: unknown) {
  return (await models.MessageArchive.findById(id).lean()) as unknown as Record<string, unknown> | null;
}

async function expireActionLease(models: MongoMessageServiceFixture['models'], id: unknown) {
  await models.Message.updateOne({ _id: id }, { $set: { actionLeaseExpiresAt: new Date(Date.now() - 1_000) } });
}

describe('MessageService action lease fencing (MSGF-01)', () => {
  const fixtures: MongoMessageServiceFixture[] = [];

  async function fixture(options: Parameters<typeof createMongoMessageServiceFixture>[0] = {}) {
    const created = await createMongoMessageServiceFixture(options);
    fixtures.push(created);
    return created;
  }

  afterEach(async () => {
    vi.useRealTimers();
    while (fixtures.length > 0) {
      const current = fixtures.pop();
      if (current) await current.close();
    }
  });

  it('rejects a stale-worker archive after takeover and commits the replacement exactly once', async () => {
    const barriers = createMessageServiceBarriers();
    const staleGate = createDeferredBarrier('stale handler gate');
    const staleHandler = vi.fn(async () => {
      await staleGate.arrive();
      return 'stale-result';
    });
    const replacementHandler = vi.fn(async () => 'replacement-result');
    let calls = 0;
    const actionTemplate: MessageTemplate = {
      ...roleTemplate,
      templateCd: 'fencing-stale-success-test',
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'success',
          sender: false,
          receiver: true,
          senderNotification: async () => 'approved notification',
          runHandler: async (ctx) => {
            calls += 1;
            if (calls === 1) return staleHandler(ctx);
            return replacementHandler(ctx);
          },
        },
      ],
    };
    const { service, models } = await fixture({
      templates: [actionTemplate],
      barriers,
      serviceOptions: { actionLeaseMs: 75_000 },
    });
    const startedAt = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(startedAt);
    const [message] = await service.createMessage({
      templateCd: actionTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId },
    });

    const stale = service
      .handleAction(actionTemplate.templateCd, 'approve', { message, user: { _id: receiverId } })
      .then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (error) => ({ status: 'rejected' as const, error }),
      );
    await barriers.actionClaimed.reached;
    barriers.actionClaimed.release();
    await staleGate.reached;

    const staleStored = await readActiveDoc(models, message._id);
    expect(staleStored?.actionAttemptId).toEqual(expect.any(String));
    expect(staleStored?.actionOwnerToken).toEqual(expect.any(String));
    const stableAttemptId = staleStored?.actionAttemptId as string;
    const staleToken = staleStored?.actionOwnerToken as string;
    expect(staleStored?.actionClaimedAt).toEqual(new Date(startedAt));
    expect(staleStored?.actionLeaseExpiresAt).toEqual(new Date(startedAt + 75_000));

    vi.setSystemTime(startedAt + 74_999);
    await expect(
      service.handleAction(actionTemplate.templateCd, 'approve', { message, user: { _id: receiverId } }),
    ).rejects.toBeInstanceOf(ActionConflictError);
    vi.setSystemTime(startedAt + 75_000);

    const replacement = service.handleAction(actionTemplate.templateCd, 'approve', {
      message,
      user: { _id: receiverId },
    });
    // Archive create-return inside the uncommitted transaction (MSGF-12), not
    // the commit: the replacement commit is observed through committed state
    // after its promise resolves below.
    await barriers.archiveCreated.reached;
    const replacementStored = await readActiveDoc(models, message._id);
    expect(replacementStored).toMatchObject({
      actionState: 'processing',
      actionAttemptId: stableAttemptId,
      actionClaimedAt: new Date(startedAt + 75_000),
      actionLeaseExpiresAt: new Date(startedAt + 150_000),
      actionFailureMessage: null,
    });
    expect(replacementStored?.actionOwnerToken).not.toBe(staleToken);

    // The replacement is blocked inside its archive commit while the stale
    // worker resumes and attempts to commit with obsolete ownership.
    staleGate.release();
    const staleOutcome = await stale;
    expect(staleOutcome.status).toBe('rejected');
    if (staleOutcome.status === 'rejected') {
      expect(staleOutcome.error).toBeInstanceOf(ActionConflictError);
    }
    expect(await readActiveDoc(models, message._id)).toEqual(replacementStored);
    expect(await models.MessageArchive.countDocuments({ _id: message._id })).toBe(0);

    barriers.archiveCreated.release();
    await expect(replacement).resolves.toBe('replacement-result');

    expect(await models.Message.countDocuments({ _id: message._id })).toBe(0);
    expect(await models.MessageArchive.countDocuments({ _id: message._id })).toBe(1);
    const archived = await readArchiveDoc(models, message._id);
    expect(archived).toMatchObject({
      actionCd: 'approve',
      actionAttemptId: stableAttemptId,
      actionNotificationState: 'sent',
    });
    expect(archived?.actionOwnerToken).toEqual(expect.any(String));
    expect(archived?.actionOwnerToken).not.toBe(staleToken);
    expect(replacementHandler).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale-worker failure after takeover without stranding the replacement claim', async () => {
    const barriers = createMessageServiceBarriers();
    const staleGate = createDeferredBarrier('stale handler gate');
    const staleHandler = vi.fn(async () => {
      await staleGate.arrive();
      throw new Error('stale handler failed');
    });
    const replacementHandler = vi.fn(async () => 'replacement-result');
    let calls = 0;
    const actionTemplate: MessageTemplate = {
      ...roleTemplate,
      templateCd: 'fencing-stale-failure-test',
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'success',
          sender: false,
          receiver: true,
          runHandler: async (ctx) => {
            calls += 1;
            if (calls === 1) return staleHandler(ctx);
            return replacementHandler(ctx);
          },
        },
      ],
    };
    const { service, models } = await fixture({
      templates: [actionTemplate],
      barriers,
      serviceOptions: { actionLeaseMs: 75_000 },
    });
    const startedAt = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(startedAt);
    const [message] = await service.createMessage({
      templateCd: actionTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId },
    });

    const stale = service
      .handleAction(actionTemplate.templateCd, 'approve', { message, user: { _id: receiverId } })
      .then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (error) => ({ status: 'rejected' as const, error }),
      );
    await barriers.actionClaimed.reached;
    barriers.actionClaimed.release();
    await staleGate.reached;

    const staleStored = await readActiveDoc(models, message._id);
    const stableAttemptId = staleStored?.actionAttemptId as string;
    const staleToken = staleStored?.actionOwnerToken as string;
    expect(stableAttemptId).toEqual(expect.any(String));
    expect(staleToken).toEqual(expect.any(String));

    expect(staleStored?.actionLeaseExpiresAt).toEqual(new Date(startedAt + 75_000));
    vi.setSystemTime(startedAt + 75_000);

    const replacement = service.handleAction(actionTemplate.templateCd, 'approve', {
      message,
      user: { _id: receiverId },
    });
    // Archive create-return inside the uncommitted transaction (MSGF-12), not
    // the commit; committed state is asserted after the promise resolves.
    await barriers.archiveCreated.reached;
    const replacementStored = await readActiveDoc(models, message._id);
    expect(replacementStored).toMatchObject({
      actionState: 'processing',
      actionAttemptId: stableAttemptId,
      actionClaimedAt: new Date(startedAt + 75_000),
      actionLeaseExpiresAt: new Date(startedAt + 150_000),
      actionFailureMessage: null,
    });
    expect(replacementStored?.actionOwnerToken).not.toBe(staleToken);

    staleGate.release();
    const staleOutcome = await stale;
    expect(staleOutcome.status).toBe('rejected');
    if (staleOutcome.status === 'rejected') {
      // Controlled conflict: the stale failure must not mark the replacement
      // claim retryable, so it surfaces conflict instead of a retryable error.
      expect(staleOutcome.error).toBeInstanceOf(ActionConflictError);
    }
    expect(await readActiveDoc(models, message._id)).toEqual(replacementStored);
    expect(await models.MessageArchive.countDocuments({ _id: message._id })).toBe(0);

    barriers.archiveCreated.release();
    await expect(replacement).resolves.toBe('replacement-result');

    expect(await models.Message.countDocuments({ _id: message._id })).toBe(0);
    expect(await models.MessageArchive.countDocuments({ _id: message._id })).toBe(1);
    const archived = await readArchiveDoc(models, message._id);
    expect(archived).toMatchObject({ actionCd: 'approve', actionAttemptId: stableAttemptId });
    expect(archived?.actionOwnerToken).toEqual(expect.any(String));
    expect(archived?.actionOwnerToken).not.toBe(staleToken);
  });

  it('takes over legacy active claims without a fencing field and keeps the stable attempt id', async () => {
    const seenAttemptIds: Array<string | undefined> = [];
    const actionTemplate: MessageTemplate = {
      ...roleTemplate,
      templateCd: 'fencing-legacy-takeover-test',
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'success',
          sender: false,
          receiver: true,
          runHandler: async (ctx) => {
            seenAttemptIds.push(ctx.actionAttemptId);
            return 'legacy-replacement-result';
          },
        },
      ],
    };
    const { service, models } = await fixture({ templates: [actionTemplate] });
    const [message] = await service.createMessage({
      templateCd: actionTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId },
    });

    // Simulate a record written before fencing existed: a live attempt with an
    // expired lease and no actionOwnerToken field at all.
    await models.Message.updateOne(
      { _id: message._id },
      {
        $set: {
          actionState: 'processing',
          actionCd: 'approve',
          actionAttemptId: 'legacy-attempt-1',
          actionClaimedBy: String(receiverId),
          actionClaimedAt: new Date(Date.now() - 60_000),
          actionLeaseExpiresAt: new Date(Date.now() - 1_000),
          actionFailureMessage: null,
        },
        $unset: { actionOwnerToken: 1 },
      },
    );
    const legacyStored = await readActiveDoc(models, message._id);
    expect(legacyStored?.actionAttemptId).toBe('legacy-attempt-1');
    expect(legacyStored).not.toHaveProperty('actionOwnerToken');

    await expect(
      service.handleAction(actionTemplate.templateCd, 'approve', {
        message,
        user: { _id: receiverId },
      }),
    ).resolves.toBe('legacy-replacement-result');

    expect(seenAttemptIds).toEqual(['legacy-attempt-1']);
    expect(await models.Message.countDocuments({ _id: message._id })).toBe(0);
    expect(await models.MessageArchive.countDocuments({ _id: message._id })).toBe(1);
    const archived = await readArchiveDoc(models, message._id);
    expect(archived).toMatchObject({ actionCd: 'approve', actionAttemptId: 'legacy-attempt-1' });
    expect(archived?.actionOwnerToken).toEqual(expect.any(String));
  });

  it('still prevents competing different actions from winning, including after lease expiry', async () => {
    const releaseGate = createDeferredBarrier('approve handler gate');
    const approveHandler = vi.fn(async () => {
      await releaseGate.arrive();
      return 'approved';
    });
    const rejectHandler = vi.fn(async () => 'rejected');
    const actionTemplate: MessageTemplate = {
      ...roleTemplate,
      templateCd: 'fencing-different-actions-test',
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'success',
          sender: false,
          receiver: true,
          runHandler: approveHandler,
        },
        {
          actionCd: 'reject',
          name: 'Reject',
          variant: 'danger',
          sender: false,
          receiver: true,
          runHandler: rejectHandler,
        },
      ],
    };
    const { service, models } = await fixture({ templates: [actionTemplate] });
    const [message] = await service.createMessage({
      templateCd: actionTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId },
    });

    const approve = service.handleAction(actionTemplate.templateCd, 'approve', {
      message,
      user: { _id: receiverId },
    });
    await vi.waitFor(() => expect(approveHandler).toHaveBeenCalledTimes(1));

    await expect(
      service.handleAction(actionTemplate.templateCd, 'reject', {
        message,
        user: { _id: receiverId },
      }),
    ).rejects.toBeInstanceOf(ActionConflictError);

    // A different action cannot take over the outstanding attempt even after
    // the original lease expires; only the same action may reclaim it.
    await expireActionLease(models, message._id);
    await expect(
      service.handleAction(actionTemplate.templateCd, 'reject', {
        message,
        user: { _id: receiverId },
      }),
    ).rejects.toBeInstanceOf(ActionConflictError);

    releaseGate.release();
    await expect(approve).resolves.toBe('approved');

    expect(rejectHandler).not.toHaveBeenCalled();
    expect(await models.Message.countDocuments({ _id: message._id })).toBe(0);
    expect(await models.MessageArchive.countDocuments({ _id: message._id, actionCd: 'approve' })).toBe(1);
  });

  it('scopes compound _id/$or claims to the targeted message (MSGF-12)', async () => {
    // `claimAction` filters `{ _id, $or: [...] }`: the sibling `_id` must
    // narrow the `$or` branches, so claiming one message leaves a sibling
    // actionable. Proven against real MongoDB — the pre-MSFG-12 unit matcher
    // returned early on `$or` and silently ignored such siblings.
    const actionTemplate: MessageTemplate = {
      ...roleTemplate,
      templateCd: 'fencing-compound-claim-test',
      prepareMessage: async ({ user }) => [
        { fromUser: user._id, toUser: receiverId, payload: { item: 'one' } },
        { fromUser: user._id, toUser: receiverId, payload: { item: 'two' } },
      ],
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'success',
          sender: false,
          receiver: true,
          runHandler: async () => 'approved',
        },
      ],
    };
    const { service, models } = await fixture({ templates: [actionTemplate] });
    const [first, second] = await service.createMessage({
      templateCd: actionTemplate.templateCd,
      user: { _id: senderId },
      payload: {},
    });
    expect(second._id).not.toBe(first._id);

    await expect(
      service.handleAction(actionTemplate.templateCd, 'approve', { message: first, user: { _id: receiverId } }),
    ).resolves.toBe('approved');

    // Committed-state observation: the first message moved, the sibling is
    // untouched and still claimable.
    expect(await models.Message.countDocuments({ _id: first._id })).toBe(0);
    expect(await models.MessageArchive.countDocuments({ _id: first._id })).toBe(1);
    expect(await readActiveDoc(models, second._id)).toMatchObject({ actionState: 'active' });
    await expect(
      service.handleAction(actionTemplate.templateCd, 'approve', { message: second, user: { _id: receiverId } }),
    ).resolves.toBe('approved');
    expect(await models.MessageArchive.countDocuments({})).toBe(2);
  });

  it.each([
    ['MSGA-16 omitted', {}, 30_000],
    ['default undefined', { actionLeaseMs: undefined }, 30_000],
    ['configured', { actionLeaseMs: 75_000 }, 75_000],
    ['minimum', { actionLeaseMs: 1 }, 1],
    ['maximum', { actionLeaseMs: MAX_MESSAGE_SERVICE_TIMEOUT_MS }, MAX_MESSAGE_SERVICE_TIMEOUT_MS],
  ] as const)('MSGA-08 %s duration without takeover', async (_label, lease, duration) => {
    const gate = createDeferredBarrier('configured lease handler');
    const handler = vi.fn(async () => {
      await gate.arrive();
      return 'approved';
    });
    const template: MessageTemplate = {
      ...roleTemplate,
      templateCd: 'msga08-lease-boundaries',
      actions: [{ actionCd: 'approve', name: 'Approve', variant: 'success', receiver: true, runHandler: handler }],
    };
    const { service, models } = await fixture({ templates: [template], serviceOptions: lease });
    const [message] = await service.createMessage({
      templateCd: template.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId },
    });
    const startedAt = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(startedAt);
    const pending = service.handleAction(template.templateCd, 'approve', { message, user: { _id: receiverId } }).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    try {
      await gate.reached;
      const claimed = await readActiveDoc(models, message._id);
      expect(claimed).toMatchObject({
        actionState: 'processing',
        actionClaimedAt: new Date(startedAt),
        actionLeaseExpiresAt: new Date(startedAt + duration),
        actionAttemptId: expect.any(String),
        actionOwnerToken: expect.any(String),
      });
      vi.setSystemTime(startedAt + duration - 1);
      await expect(
        service.handleAction(template.templateCd, 'approve', { message, user: { _id: receiverId } }),
      ).rejects.toBeInstanceOf(ActionConflictError);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(await readActiveDoc(models, message._id)).toEqual(claimed);

      // Expiry alone does not mutate/reject/cancel a claim or renew its deadline.
      vi.setSystemTime(startedAt + duration + 1);
      expect(await readActiveDoc(models, message._id)).toEqual(claimed);
      gate.release();
      await expect(pending).resolves.toEqual({ value: 'approved' });
      expect(await readActiveDoc(models, message._id)).toBeNull();
      expect(await readArchiveDoc(models, message._id)).toMatchObject({
        actionAttemptId: claimed?.actionAttemptId,
        actionOwnerToken: claimed?.actionOwnerToken,
      });
      expect(await models.MessageArchive.countDocuments({ _id: message._id })).toBe(1);
    } finally {
      gate.release();
      await pending;
    }
  });

  it('MSGA-08 preserves normal expired-owner failure and same-action retry fencing without takeover', async () => {
    const gate = createDeferredBarrier('expired failing handler');
    const retryGate = createDeferredBarrier('same-action retry handler');
    const failure = new Error('handler failed after expiry');
    const attempts: Array<string | undefined> = [];
    const handler = vi.fn(async (ctx: ActionContext) => {
      attempts.push(ctx.actionAttemptId);
      if (attempts.length === 1) {
        await gate.arrive();
        throw failure;
      }
      await retryGate.arrive();
      return 'retried';
    });
    const otherHandler = vi.fn(async () => 'rejected');
    const template: MessageTemplate = {
      ...roleTemplate,
      templateCd: 'msga08-expired-failure',
      actions: [
        { actionCd: 'approve', name: 'Approve', variant: 'success', receiver: true, runHandler: handler },
        { actionCd: 'reject', name: 'Reject', variant: 'danger', receiver: true, runHandler: otherHandler },
      ],
    };
    const { service, models } = await fixture({ templates: [template], serviceOptions: { actionLeaseMs: 80_000 } });
    const [message] = await service.createMessage({
      templateCd: template.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId },
    });
    const startedAt = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(startedAt);
    const failed = service
      .handleAction(template.templateCd, 'approve', { message, user: { _id: receiverId } })
      .catch((error: unknown) => error);
    await gate.reached;
    const claimed = await readActiveDoc(models, message._id);
    vi.setSystemTime(startedAt + 80_000);
    await expect(
      service.handleAction(template.templateCd, 'reject', { message, user: { _id: receiverId } }),
    ).rejects.toBeInstanceOf(ActionConflictError);
    gate.release();
    expect(await failed).toBeInstanceOf(ActionRetryableError);
    expect(await failed).toMatchObject({ cause: failure });
    expect(await readActiveDoc(models, message._id)).toMatchObject({
      actionState: 'retryable',
      actionCd: 'approve',
      actionAttemptId: claimed?.actionAttemptId,
      actionOwnerToken: claimed?.actionOwnerToken,
      actionLeaseExpiresAt: null,
      actionFailureMessage: failure.message,
    });
    await expect(
      service.handleAction(template.templateCd, 'reject', { message, user: { _id: receiverId } }),
    ).rejects.toBeInstanceOf(ActionConflictError);
    const retry = service.handleAction(template.templateCd, 'approve', { message, user: { _id: receiverId } });
    await retryGate.reached;
    const retryClaim = await readActiveDoc(models, message._id);
    expect(retryClaim).toMatchObject({
      actionState: 'processing',
      actionAttemptId: claimed?.actionAttemptId,
      actionClaimedAt: new Date(startedAt + 80_000),
      actionLeaseExpiresAt: new Date(startedAt + 160_000),
      actionFailureMessage: null,
    });
    expect(retryClaim?.actionOwnerToken).not.toBe(claimed?.actionOwnerToken);
    retryGate.release();
    await expect(retry).resolves.toBe('retried');
    expect(attempts).toEqual([claimed?.actionAttemptId, claimed?.actionAttemptId]);
    expect(otherHandler).not.toHaveBeenCalled();
    expect(await readActiveDoc(models, message._id)).toBeNull();
    expect(await readArchiveDoc(models, message._id)).toMatchObject({
      actionAttemptId: claimed?.actionAttemptId,
      actionOwnerToken: retryClaim?.actionOwnerToken,
    });
  });
});
