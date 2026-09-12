import mongoose from 'mongoose';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMongoMessageServiceFixture, type MongoMessageServiceFixture } from './support/mongodb-fixture';
import {
  ActionNotAllowedError,
  ActionNotificationPendingError,
  ActionTemplateMismatchError,
  MessageArchivedError,
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

  it('denies a stale recipient copy without executing the handler and keeps a legitimate retry', async () => {
    const handler = vi.fn(async () => 'approved');
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

    await expect(
      service.handleAction(template.templateCd, 'approve', { message: staleCopy, user: { _id: receiverA } }),
    ).rejects.toBeInstanceOf(ActionNotAllowedError);
    expect(handler).not.toHaveBeenCalled();

    const stored = (await models.Message.findById(message._id).lean()) as unknown as Record<string, unknown>;
    expect(stored?.actionState).toBe('retryable');

    const freshForLegit = (await service.findMessage(String(message._id))) as never;
    const result = await service.handleAction(template.templateCd, 'approve', {
      message: freshForLegit,
      user: { _id: receiverB },
    });
    expect(result).toBe('approved');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(await models.Message.countDocuments({ _id: message._id })).toBe(0);
    expect(await models.MessageArchive.countDocuments({ _id: message._id })).toBe(1);
  });

  it('rejects a stored templateCd change without executing the stale handler', async () => {
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
          actionCd: 'approve',
          name: 'Approve',
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
    expect(stored?.actionState).toBe('retryable');
    expect(stored?.templateCd).toBe(templateB.templateCd);
  });

  it('denies stale condition and role copies without executing', async () => {
    const handler = vi.fn(async () => 'approved');
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

    const roleHandler = vi.fn(async () => 'role-ok');
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
      ],
    });
    const { service: service2, models: models2 } = await fixture({ templates: [roleTemplate] });
    const [roleMsg] = await service2.createMessage({
      templateCd: roleTemplate.templateCd,
      user: { _id: senderId },
      payload: { toRoles: ['approver'] },
    });
    await models2.Message.updateOne({ _id: roleMsg._id }, { $set: { toRoles: ['other-role'] } });
    await expect(
      service2.handleAction(roleTemplate.templateCd, 'approve', {
        message: roleMsg,
        user: { _id: receiverA, roles: ['approver'] },
      }),
    ).rejects.toBeInstanceOf(ActionNotAllowedError);
    expect(roleHandler).not.toHaveBeenCalled();
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
