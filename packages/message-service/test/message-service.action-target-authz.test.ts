import mongoose from 'mongoose';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMongoMessageServiceFixture, type MongoMessageServiceFixture } from './support/mongodb-fixture';
import { createDeferredBarrier, createMessageServiceBarriers } from './support/deferred';
import {
  ActionConflictError,
  ActionNotAllowedError,
  ActionNotificationPendingError,
  ActionRetryableError,
  ActionTemplateMismatchError,
  MessageArchivedError,
  MessageService,
} from '../src/message-service';
import { createMessageRoutes } from '../src/route-factory';
import { MESSAGE_ARCHIVE_MODEL_NAME, MESSAGE_MODEL_NAME, MESSAGE_REQUEST_MODEL_NAME } from '../src/schemas/base';
import type { MessageTemplate } from '../src/types/template';

const senderId = new mongoose.Types.ObjectId();
const receiverA = new mongoose.Types.ObjectId();
const receiverB = new mongoose.Types.ObjectId();
const unrelatedId = new mongoose.Types.ObjectId();

function baseTemplate(templateCd: string, overrides: Partial<MessageTemplate> = {}): MessageTemplate {
  return {
    templateCd,
    type: 'request',
    description: 'target authz test',
    senderContent: { title: 'S', long: 'Sl', short: 'Ss' },
    receiverContent: { title: 'R', long: 'Rl', short: 'Rs' },
    uiTemplate: 'default-message',
    prepareMessage: async ({ user, payload }) => ({
      fromUser: user._id,
      toUser: (payload.toUser as mongoose.Types.ObjectId | undefined) ?? null,
      toRoles: (payload.toRoles as string[] | undefined) ?? [],
      payload,
    }),
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
    ...overrides,
  };
}

describe('MessageService persisted action target authz (MSGF-02)', () => {
  const fixtures: MongoMessageServiceFixture[] = [];
  const servers: Array<{ close: (cb?: (e?: Error) => void) => void }> = [];

  async function fixture(options: Parameters<typeof createMongoMessageServiceFixture>[0] = {}) {
    const created = await createMongoMessageServiceFixture(options);
    fixtures.push(created);
    return created;
  }

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (s) =>
          new Promise<void>((resolve, reject) => {
            s.close((e) => (e ? reject(e) : resolve()));
          }),
      ),
    );
    while (fixtures.length > 0) {
      const f = fixtures.pop();
      if (f) await f.close();
    }
  });

  it('releases a fresh stale-recipient denial so the new recipient can choose a different action', async () => {
    const handler = vi.fn(async () => 'approved');
    const rejectHandler = vi.fn(async () => 'rejected');
    const template = baseTemplate('msgf02-stale-recipient', {
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'success',
          sender: false,
          receiver: true,
          runHandler: handler,
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
    });
    const { service, models } = await fixture({ templates: [template] });
    const [message] = await service.createMessage({
      templateCd: template.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverA },
    });
    const staleCopy = message;

    await models.Message.updateOne({ _id: message._id }, { $set: { toUser: receiverB } });
    const beforeClaim = await models.Message.findById(message._id).lean();

    await expect(
      service.handleAction(template.templateCd, 'approve', { message: staleCopy, user: { _id: receiverA } }),
    ).rejects.toBeInstanceOf(ActionNotAllowedError);
    expect(handler).not.toHaveBeenCalled();

    const stored = (await models.Message.findById(message._id).lean()) as unknown as Record<string, unknown>;
    // Release resets only the claim fields, preserving all business data.
    expect(stored).toEqual({ ...beforeClaim, updatedAt: expect.any(Date) });
    expect(stored).toMatchObject({
      actionState: 'active',
      actionCd: null,
      actionAttemptId: null,
      actionOwnerToken: null,
      actionClaimedBy: null,
      actionClaimedAt: null,
      actionLeaseExpiresAt: null,
      actionFailureMessage: null,
    });

    const freshForLegit = (await service.findMessage(String(message._id))) as never;
    const result = await service.handleAction(template.templateCd, 'reject', {
      message: freshForLegit,
      user: { _id: receiverB },
    });
    expect(result).toBe('rejected');
    expect(handler).not.toHaveBeenCalled();
    expect(rejectHandler).toHaveBeenCalledTimes(1);
    expect(await models.Message.countDocuments({ _id: message._id })).toBe(0);
    expect(await models.MessageArchive.countDocuments({ _id: message._id })).toBe(1);
  });

  it('releases a fresh template denial so a replacement template with different codes can commit', async () => {
    const handlerA = vi.fn(async () => 'a');
    const handlerB = vi.fn(async () => 'b');
    const templateA = baseTemplate('msgf02-template-a', {
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'success',
          sender: false,
          receiver: true,
          runHandler: handlerA,
        },
      ],
    });
    const templateB = baseTemplate('msgf02-template-b', {
      actions: [
        {
          actionCd: 'accept-replacement',
          name: 'Accept replacement',
          variant: 'success',
          sender: false,
          receiver: true,
          runHandler: handlerB,
        },
      ],
    });
    const { service, models } = await fixture({ templates: [templateA, templateB] });
    const [message] = await service.createMessage({
      templateCd: templateA.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverA },
    });
    const staleCopy = message;

    await models.Message.updateOne({ _id: message._id }, { $set: { templateCd: templateB.templateCd } });

    await expect(
      service.handleAction(templateA.templateCd, 'approve', { message: staleCopy, user: { _id: receiverA } }),
    ).rejects.toBeInstanceOf(ActionTemplateMismatchError);
    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).not.toHaveBeenCalled();

    const stored = (await models.Message.findById(message._id).lean()) as unknown as Record<string, unknown>;
    expect(stored?.actionState).toBe('active');
    expect(stored?.templateCd).toBe(templateB.templateCd);
    const fresh = (await service.findMessage(String(message._id))) as never;
    await expect(
      service.handleAction(templateB.templateCd, 'accept-replacement', { message: fresh, user: { _id: receiverA } }),
    ).resolves.toBe('b');
    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledTimes(1);
    expect(await models.Message.countDocuments({ _id: message._id })).toBe(0);
    expect(await models.MessageArchive.countDocuments({ _id: message._id, actionCd: 'accept-replacement' })).toBe(1);
  });

  it('releases a fresh condition denial so a legitimate different action can commit', async () => {
    const handler = vi.fn(async () => 'approved');
    const rejectHandler = vi.fn(async () => 'rejected');
    const rejectAction = {
      actionCd: 'reject',
      name: 'Reject',
      variant: 'danger' as const,
      sender: false,
      receiver: true,
      runHandler: rejectHandler,
    };
    const template = baseTemplate('msgf02-condition-roles', {
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'success',
          sender: false,
          receiver: true,
          condition: (msg) => (msg.payload as Record<string, unknown>)?.ready === true,
          runHandler: handler,
        },
        rejectAction,
      ],
    });
    const { service, models } = await fixture({ templates: [template] });

    const [condMsg] = await service.createMessage({
      templateCd: template.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverA, ready: true },
    });
    await models.Message.updateOne({ _id: condMsg._id }, { $set: { payload: { toUser: receiverA, ready: false } } });
    await expect(
      service.handleAction(template.templateCd, 'approve', { message: condMsg, user: { _id: receiverA } }),
    ).rejects.toBeInstanceOf(ActionNotAllowedError);
    expect(handler).not.toHaveBeenCalled();
    const freshCondition = (await service.findMessage(String(condMsg._id))) as never;
    await expect(
      service.handleAction(template.templateCd, 'reject', { message: freshCondition, user: { _id: receiverA } }),
    ).resolves.toBe('rejected');
    expect(await models.Message.countDocuments({ _id: condMsg._id })).toBe(0);
    expect(await models.MessageArchive.countDocuments({ _id: condMsg._id, actionCd: 'reject' })).toBe(1);
    expect(rejectHandler).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('releases a fresh role denial so a newly authorized role can choose a different action', async () => {
    const roleHandler = vi.fn(async () => 'role-ok');
    const rejectHandler = vi.fn(async () => 'rejected');
    const roleTemplate = baseTemplate('msgf02-roles', {
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'success',
          sender: false,
          receiver: true,
          runHandler: roleHandler,
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
    });
    const { service, models } = await fixture({ templates: [roleTemplate] });
    const [roleMsg] = await service.createMessage({
      templateCd: roleTemplate.templateCd,
      user: { _id: senderId },
      payload: { toRoles: ['approver'] },
    });
    await models.Message.updateOne({ _id: roleMsg._id }, { $set: { toRoles: ['other-role'] } });
    await expect(
      service.handleAction(roleTemplate.templateCd, 'approve', {
        message: roleMsg,
        user: { _id: receiverA, roles: ['approver'] },
      }),
    ).rejects.toBeInstanceOf(ActionNotAllowedError);
    expect(roleHandler).not.toHaveBeenCalled();
    const freshRoles = (await service.findMessage(String(roleMsg._id))) as never;
    await expect(
      service.handleAction(roleTemplate.templateCd, 'reject', {
        message: freshRoles,
        user: { _id: receiverB, roles: ['other-role'] },
      }),
    ).resolves.toBe('rejected');
    expect(rejectHandler).toHaveBeenCalledTimes(1);
    expect(roleHandler).not.toHaveBeenCalled();
    expect(await models.Message.countDocuments({ _id: roleMsg._id })).toBe(0);
    expect(await models.MessageArchive.countDocuments({ _id: roleMsg._id, actionCd: 'reject' })).toBe(1);
  });

  it.each(['retry', 'takeover'] as const)(
    'retains the attempt and action restriction when a %s is denied after earlier handler execution',
    async (mode) => {
      const firstHandlerGate = createDeferredBarrier('first handler');
      const attempts: Array<string | undefined> = [];
      const handler = vi.fn(async ({ actionAttemptId }) => {
        attempts.push(actionAttemptId);
        if (attempts.length === 1) {
          if (mode === 'takeover') await firstHandlerGate.arrive();
          throw new Error('earlier handler may have effects');
        }
        return 'approved';
      });
      const rejectHandler = vi.fn(async () => 'rejected');
      const template = baseTemplate(`msgr02-denied-${mode}`, {
        actions: [
          {
            actionCd: 'approve',
            name: 'Approve',
            variant: 'success',
            sender: false,
            receiver: true,
            runHandler: handler,
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
      });
      const { service, models } = await fixture({ templates: [template] });
      const [message] = await service.createMessage({
        templateCd: template.templateCd,
        user: { _id: senderId },
        payload: { toUser: receiverA },
      });
      const first = service
        .handleAction(template.templateCd, 'approve', { message, user: { _id: receiverA } })
        .catch((error: unknown) => error);
      try {
        if (mode === 'takeover') await firstHandlerGate.reached;
        else expect(await first).toBeInstanceOf(ActionRetryableError);
        const original = (await models.Message.findById(message._id).lean()) as unknown as Record<string, unknown>;
        await models.Message.updateOne(
          { _id: message._id },
          { $set: { toUser: receiverB, actionLeaseExpiresAt: new Date(0) } },
        );
        await expect(
          service.handleAction(template.templateCd, 'approve', { message, user: { _id: receiverA } }),
        ).rejects.toBeInstanceOf(ActionNotAllowedError);
        expect(handler).toHaveBeenCalledTimes(1);
        const denied = (await models.Message.findById(message._id).lean()) as unknown as Record<string, unknown>;
        expect(denied).toMatchObject({
          actionState: 'retryable',
          actionCd: 'approve',
          actionAttemptId: original.actionAttemptId,
          actionLeaseExpiresAt: null,
          actionFailureMessage: 'not allowed',
        });
        expect(denied.actionOwnerToken).not.toBe(original.actionOwnerToken);
        if (mode === 'takeover') {
          firstHandlerGate.release();
          expect(await first).toBeInstanceOf(ActionConflictError);
          expect(await models.Message.findById(message._id).lean()).toEqual(denied);
        }
        const fresh = (await service.findMessage(String(message._id))) as never;
        await expect(
          service.handleAction(template.templateCd, 'reject', { message: fresh, user: { _id: receiverB } }),
        ).rejects.toBeInstanceOf(ActionConflictError);
        expect(rejectHandler).not.toHaveBeenCalled();
        await expect(
          service.handleAction(template.templateCd, 'approve', { message: fresh, user: { _id: receiverB } }),
        ).resolves.toBe('approved');
        expect(attempts).toEqual([original.actionAttemptId, original.actionAttemptId]);
        expect(await models.Message.countDocuments({ _id: message._id })).toBe(0);
        expect(
          await models.MessageArchive.countDocuments({
            _id: message._id,
            actionCd: 'approve',
            actionAttemptId: original.actionAttemptId,
          }),
        ).toBe(1);
      } finally {
        firstHandlerGate.release();
        await first;
      }
    },
  );

  it('fences fresh-denial release racing a takeover without changing the replacement claim', async () => {
    const barriers = createMessageServiceBarriers();
    const replacementGate = createDeferredBarrier('replacement handler');
    const handler = vi.fn(async () => {
      await replacementGate.arrive();
      return 'approved';
    });
    const template = baseTemplate('msgr02-denied-release-race', {
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'success',
          sender: false,
          receiver: true,
          runHandler: handler,
        },
      ],
    });
    const { service, models, registry, connection } = await fixture({ templates: [template], barriers });
    const replacementService = new MessageService({ registry, getModel: (name) => connection.model(name) });
    const [message] = await service.createMessage({
      templateCd: template.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverA },
    });
    await models.Message.updateOne({ _id: message._id }, { $set: { toUser: receiverB } });
    const denied = service
      .handleAction(template.templateCd, 'approve', { message, user: { _id: receiverA } })
      .catch((error: unknown) => error);
    let replacement: Promise<unknown> | undefined;
    try {
      await barriers.actionClaimed.reached;
      expect(handler).not.toHaveBeenCalled();
      const original = (await models.Message.findById(message._id).lean()) as unknown as Record<string, unknown>;
      await models.Message.updateOne({ _id: message._id }, { $set: { actionLeaseExpiresAt: new Date(0) } });
      const fresh = (await replacementService.findMessage(String(message._id))) as never;
      replacement = replacementService.handleAction(template.templateCd, 'approve', {
        message: fresh,
        user: { _id: receiverB },
      });
      await replacementGate.reached;
      const owned = (await models.Message.findById(message._id).lean()) as unknown as Record<string, unknown>;
      expect(owned).toMatchObject({ actionState: 'processing', actionAttemptId: original.actionAttemptId });
      expect(owned.actionOwnerToken).not.toBe(original.actionOwnerToken);
      barriers.actionClaimed.release();
      expect(await denied).toBeInstanceOf(ActionNotAllowedError);
      expect(await models.Message.findById(message._id).lean()).toEqual(owned);
      expect(handler).toHaveBeenCalledTimes(1);
      replacementGate.release();
      await expect(replacement).resolves.toBe('approved');
      expect(await models.Message.countDocuments({ _id: message._id })).toBe(0);
      expect(
        await models.MessageArchive.countDocuments({
          _id: message._id,
          actionAttemptId: owned.actionAttemptId,
          actionOwnerToken: owned.actionOwnerToken,
        }),
      ).toBe(1);
    } finally {
      barriers.actionClaimed.release();
      replacementGate.release();
      await Promise.allSettled([denied, replacement]);
    }
  });

  it('hides archived outcomes from unrelated users but keeps authorized retries, even without the template', async () => {
    const handler = vi.fn(async ({ actionAttemptId }) => ({ actionAttemptId }));
    const template = baseTemplate('msgf02-archived-policy', {
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'success',
          sender: false,
          receiver: true,
          senderNotification: async () => {
            throw new Error('notify down');
          },
          runHandler: handler,
        },
      ],
    });
    const { service, models, registry } = await fixture({ templates: [template] });
    const [message] = await service.createMessage({
      templateCd: template.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverA },
    });
    await expect(
      service.handleAction(template.templateCd, 'approve', { message, user: { _id: receiverA } }),
    ).rejects.toBeInstanceOf(ActionNotificationPendingError);
    expect(handler).toHaveBeenCalledTimes(1);

    const archived = (await models.MessageArchive.findById(message._id)) as never;
    expect(archived).not.toBeNull();

    const unrelatedError = await service
      .handleAction(template.templateCd, 'approve', { message: archived, user: { _id: unrelatedId } })
      .then(
        () => null,
        (e) => e,
      );
    expect(unrelatedError).toBeInstanceOf(ActionNotAllowedError);
    expect(unrelatedError).not.toHaveProperty('actionAttemptId');
    expect((unrelatedError as Error).message).toBe('not allowed');

    const legitRetry = await service
      .handleAction(template.templateCd, 'approve', { message: archived, user: { _id: receiverA } })
      .then(
        () => null,
        (e) => e,
      );
    expect(legitRetry).toBeInstanceOf(ActionNotificationPendingError);
    expect((legitRetry as ActionNotificationPendingError).actionAttemptId).toEqual(expect.any(String));
    expect(handler).toHaveBeenCalledTimes(1);

    registry.unregister(template.templateCd);
    const afterRemovalLegit = await service
      .handleAction(template.templateCd, 'approve', { message: archived, user: { _id: receiverA } })
      .then(
        () => null,
        (e) => e,
      );
    expect(afterRemovalLegit).toBeInstanceOf(ActionNotificationPendingError);
    const afterRemovalUnrelated = await service
      .handleAction(template.templateCd, 'approve', { message: archived, user: { _id: unrelatedId } })
      .then(
        () => null,
        (e) => e,
      );
    expect(afterRemovalUnrelated).toBeInstanceOf(ActionNotAllowedError);
    expect(afterRemovalUnrelated).not.toHaveProperty('actionAttemptId');
  });

  it('hides terminally archived messages from unrelated users without leaking archive state', async () => {
    const template = baseTemplate('msgf02-archived-terminal');
    const { service, models, registry } = await fixture({ templates: [template] });
    const [message] = await service.createMessage({
      templateCd: template.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverA },
    });
    await service.handleAction(template.templateCd, 'approve', { message, user: { _id: receiverA } });
    const archived = (await models.MessageArchive.findById(message._id)) as never;

    await expect(
      service.handleAction(template.templateCd, 'approve', { message: archived, user: { _id: unrelatedId } }),
    ).rejects.toBeInstanceOf(ActionNotAllowedError);
    await expect(
      service.handleAction(template.templateCd, 'approve', { message: archived, user: { _id: receiverA } }),
    ).rejects.toBeInstanceOf(MessageArchivedError);

    registry.unregister(template.templateCd);
    await expect(
      service.handleAction(template.templateCd, 'approve', { message: archived, user: { _id: receiverA } }),
    ).rejects.toBeInstanceOf(MessageArchivedError);
    await expect(
      service.handleAction(template.templateCd, 'approve', { message: archived, user: { _id: unrelatedId } }),
    ).rejects.toBeInstanceOf(ActionNotAllowedError);
  });

  it('denies unrelated claim-fallback archive disclosure without attempt IDs and keeps the message unstranded', async () => {
    const template = baseTemplate('msgf02-claim-fallback');
    const { service, models } = await fixture({ templates: [template] });
    const [message] = await service.createMessage({
      templateCd: template.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverA },
    });
    await service.handleAction(template.templateCd, 'approve', { message, user: { _id: receiverA } });
    expect(await models.Message.countDocuments({ _id: message._id })).toBe(0);

    // Caller holds a stale active copy that still looks authorized (methods
    // report receiver), but the persisted state is archived with no
    // relationship to the caller. This exercises the claim-fallback gate.
    const activeStub = {
      _id: message._id,
      templateCd: template.templateCd,
      isSender: () => false,
      isReceiver: () => true,
    } as never;
    const err = await service
      .handleAction(template.templateCd, 'approve', { message: activeStub, user: { _id: unrelatedId } })
      .then(
        () => null,
        (e) => e,
      );
    expect(err).toBeInstanceOf(ActionNotAllowedError);
    expect(err).not.toHaveProperty('actionAttemptId');
  });

  it('exposes stable denied/not-found HTTP responses without attempt IDs for unrelated users', async () => {
    const handler = vi.fn(async () => 'http-ok');
    const notifyTemplate: MessageTemplate = baseTemplate('msgf02-http-pending', {
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'success',
          sender: false,
          receiver: true,
          senderNotification: async () => {
            throw new Error('notify down');
          },
          runHandler: handler,
        },
      ],
    });
    const plainTemplate: MessageTemplate = baseTemplate('msgf02-http-plain', {
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'success',
          sender: false,
          receiver: true,
          runHandler: handler,
        },
      ],
    });
    const created = await fixture({ templates: [notifyTemplate, plainTemplate] });
    const { models, registry } = created;

    const getModel = (name: string) => {
      if (name === MESSAGE_MODEL_NAME) return models.Message;
      if (name === MESSAGE_ARCHIVE_MODEL_NAME) return models.MessageArchive;
      if (name === MESSAGE_REQUEST_MODEL_NAME) return models.MessageRequest;
      throw new Error(`unknown model ${name}`);
    };

    let currentUser: { _id: string } = { _id: String(receiverA) };
    const { router } = createMessageRoutes({
      getModel: getModel as never,
      registry,
      getUser: () => ({ _id: currentUser._id }),
    });
    const app = express();
    app.use(express.json());
    app.use(router.original);
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    servers.push(server);
    const addr = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${addr.port}`;
    async function post(path: string) {
      const res = await fetch(`${base}${path}`, { method: 'POST' });
      const text = await res.text();
      return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
    }

    const [pendingMsg] = await created.service.createMessage({
      templateCd: notifyTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverA },
    });
    const pendingId = String(pendingMsg._id);
    currentUser = { _id: String(receiverA) };
    const legitPending = await post(`/${pendingId}/action/approve`);
    expect(legitPending.status).toBe(202);
    expect(legitPending.body).toMatchObject({ actionAttemptId: expect.any(String) });

    currentUser = { _id: String(unrelatedId) };
    const deniedPending = await post(`/${pendingId}/action/approve`);
    expect(deniedPending.status).toBe(403);
    expect(deniedPending.body).toEqual({ message: 'not allowed' });
    expect(deniedPending.body).not.toHaveProperty('actionAttemptId');

    const [plainMsg] = await created.service.createMessage({
      templateCd: plainTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverA },
    });
    const plainId = String(plainMsg._id);
    currentUser = { _id: String(receiverA) };
    const legitTerminal = await post(`/${plainId}/action/approve`);
    expect(legitTerminal.status).toBe(200);

    currentUser = { _id: String(unrelatedId) };
    const deniedTerminal = await post(`/${plainId}/action/approve`);
    expect(deniedTerminal.status).toBe(403);
    expect(deniedTerminal.body).toEqual({ message: 'not allowed' });
  });
});
