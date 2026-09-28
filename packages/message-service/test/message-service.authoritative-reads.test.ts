import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActionNotAllowedError,
  ActionNotificationPendingError,
  InvalidMessageUserError,
  MessageArchivedError,
  MessageModelResolutionError,
  MessageNotFoundError,
  MessageService,
} from '../src/message-service';
import type { IMessage, IMessageArchive } from '../src/types/message';
import type { MessageTemplate } from '../src/types/template';
import { createMongoMessageServiceFixture, type MongoMessageServiceFixture } from './support/mongodb-fixture';

const sender = new mongoose.Types.ObjectId();
const receiver = new mongoose.Types.ObjectId();
const replacement = new mongoose.Types.ObjectId();

function template(overrides: Partial<MessageTemplate> = {}): MessageTemplate {
  return {
    templateCd: 'authoritative-read',
    type: 'request',
    description: 'Authoritative reads',
    senderContent: { title: 'S', long: 'S' },
    receiverContent: { title: 'R', long: 'R' },
    uiTemplate: { sender: 'sender-view', receiver: 'receiver-view' },
    prepareMessage: async ({ payload }) => ({ fromUser: sender, toUser: receiver, payload }),
    actions: [
      {
        actionCd: 'approve',
        name: 'Approve {{label}}',
        variant: 'primary',
        sender: true,
        receiver: true,
        condition: (message) => (message.payload as { ready?: boolean })?.ready === true,
        runHandler: async () => 'approved',
      },
    ],
    ...overrides,
  };
}

describe('MSGR-04 authoritative action reads and archived outcomes', () => {
  const fixtures: MongoMessageServiceFixture[] = [];
  async function fixture(templates = [template()]) {
    const value = await createMongoMessageServiceFixture({ templates });
    fixtures.push(value);
    return value;
  }
  async function create(f: MongoMessageServiceFixture): Promise<IMessage> {
    const [message] = await f.service.createMessage({
      templateCd: 'authoritative-read',
      user: { _id: sender },
      payload: { ready: true, label: 'Old' },
    });
    return message as IMessage;
  }
  async function archive(f: MongoMessageServiceFixture): Promise<IMessageArchive> {
    const message = await create(f);
    await f.service.handleAction(message.templateCd, 'approve', { message, user: { _id: receiver } });
    await f.models.MessageArchive.updateOne(
      { _id: message._id },
      {
        $set: { actionNotificationState: 'failed', actionAttemptId: 'persisted-attempt' },
      },
    );
    return (await f.service.findMessageOrThrow(String(message._id))) as IMessageArchive;
  }
  afterEach(async () => {
    vi.restoreAllMocks();
    while (fixtures.length) await fixtures.pop()!.close();
  });

  it.each(['recipient', 'sender', 'roles', 'template', 'condition'] as const)(
    'ignores a same-ID supplied copy after stored %s changes',
    async (field) => {
      const f = await fixture();
      const stale = await create(f);
      const user = field === 'sender' ? { _id: sender } : { _id: receiver, roles: ['reviewer'] };
      if (field === 'roles') {
        await f.models.Message.updateOne({ _id: stale._id }, { $set: { toUser: null, toRoles: ['reviewer'] } });
        stale.toUser = null;
        stale.toRoles = ['reviewer'];
      }
      const update = {
        recipient: { toUser: replacement },
        sender: { fromUser: replacement },
        roles: { toRoles: ['other'] },
        template: { templateCd: 'unregistered' },
        condition: { payload: { ready: false, label: 'Current' } },
      }[field];
      await f.models.Message.updateOne({ _id: stale._id }, { $set: update });
      const result = await f.service.getActions(String(stale._id), field === 'sender' ? 'sender' : 'receiver', {
        user,
        message: stale,
      });
      expect(result).toEqual(field === 'condition' ? { uiTemplate: 'receiver-view', actions: [] } : null);
    },
  );

  it('binds listing to the requested ID, current template and payload, ignoring even a foreign-connection copy', async () => {
    const f = await fixture([
      template(),
      template({
        templateCd: 'replacement-template',
        uiTemplate: 'replacement-view',
        actions: [{ ...template().actions[0], actionCd: 'replacement-action' }],
      }),
    ]);
    const foreign = await fixture();
    const stale = await create(foreign);
    const current = await create(f);
    expect(
      await f.service.getActions(String(stale._id), 'receiver', {
        user: { _id: receiver },
        message: stale,
      }),
    ).toBeNull();
    await f.models.Message.updateOne(
      { _id: current._id },
      {
        $set: { templateCd: 'replacement-template', payload: { ready: true, label: 'Current' } },
      },
    );
    const result = await f.service.getActions(String(current._id), 'receiver', {
      user: { _id: receiver },
      message: stale,
    });
    expect(result?.uiTemplate).toBe('replacement-view');
    expect(result?.actions).toMatchObject([{ actionCd: 'replacement-action', name: 'Approve Current' }]);
    await f.models.Message.deleteOne({ _id: current._id });
    expect(
      await f.service.getActions(String(current._id), 'receiver', {
        user: { _id: receiver },
        message: current,
      }),
    ).toBeNull();
  });

  it('uses stored archive state and skips predicates for archives and admins, including stale active copies', async () => {
    const condition = vi.fn(() => true);
    const f = await fixture([template({ actions: [{ ...template().actions[0], condition }] })]);
    const active = await create(f);
    await f.service.handleAction(active.templateCd, 'approve', { message: active, user: { _id: receiver } });
    condition.mockClear();
    const query = { user: { _id: receiver }, message: active };
    expect(await f.service.getActions(String(active._id), 'receiver', query)).toEqual({
      uiTemplate: 'receiver-view',
      actions: [],
    });
    await f.models.MessageArchive.updateOne({ _id: active._id }, { $set: { toUser: replacement } });
    expect(await f.service.getActions(String(active._id), 'receiver', query)).toBeNull();
    const next = await create(f);
    expect(
      await f.service.getActions(String(next._id), 'receiver', {
        user: { _id: replacement },
        isAdmin: true,
      }),
    ).toEqual({ uiTemplate: 'receiver-view', actions: [] });
    expect(condition).not.toHaveBeenCalled();
  });

  it.each(['sender', 'recipient', 'roles'] as const)(
    'denies stale archived %s without disclosing outcome details',
    async (field) => {
      const f = await fixture();
      let stale = await archive(f);
      if (field === 'roles') {
        await f.models.MessageArchive.updateOne({ _id: stale._id }, { $set: { toUser: null, toRoles: ['reviewer'] } });
        stale = (await f.service.findMessageOrThrow(String(stale._id))) as IMessageArchive;
      }
      const update = {
        sender: { fromUser: replacement },
        recipient: { toUser: replacement },
        roles: { toRoles: ['other'] },
      }[field];
      await f.models.MessageArchive.updateOne({ _id: stale._id }, { $set: update });
      const error = await f.service
        .handleAction(stale.templateCd, 'approve', {
          message: stale,
          user: { _id: field === 'sender' ? sender : receiver, roles: ['reviewer'] },
        })
        .catch((value: unknown) => value);
      expect(error).toBeInstanceOf(ActionNotAllowedError);
      expect(error).not.toHaveProperty('actionAttemptId');
      expect(String(error)).not.toContain('persisted-attempt');
      expect(
        await f.service.getActions(String(stale._id), field === 'sender' ? 'sender' : 'receiver', {
          user: { _id: field === 'sender' ? sender : receiver, roles: ['reviewer'] },
          message: stale,
        }),
      ).toBeNull();
    },
  );

  it('reports current archived notification state/attempt without a template and rejects a deleted archive', async () => {
    const f = await fixture();
    const stale = await archive(f);
    f.registry.unregister(stale.templateCd);
    await f.models.MessageArchive.updateOne(
      { _id: stale._id },
      {
        $set: { actionAttemptId: 'new-attempt', actionNotificationState: 'pending' },
      },
    );
    await expect(
      f.service.handleAction('removed', 'removed', { message: stale, user: { _id: sender } }),
    ).rejects.toMatchObject({ name: 'ActionNotificationPendingError', actionAttemptId: 'new-attempt' });
    await f.models.MessageArchive.updateOne({ _id: stale._id }, { $set: { actionNotificationState: 'sent' } });
    await expect(
      f.service.handleAction('removed', 'removed', { message: stale, user: { _id: receiver } }),
    ).rejects.toBeInstanceOf(MessageArchivedError);
    await f.models.MessageArchive.deleteOne({ _id: stale._id });
    await expect(
      f.service.handleAction('removed', 'removed', { message: stale, user: { _id: receiver } }),
    ).rejects.toBeInstanceOf(MessageNotFoundError);
  });

  it('normalizes populated sender/receiver identities, and authorizes before condition presentation population', async () => {
    const condition = vi.fn((message: Record<string, unknown>) => {
      const party = message.toUser as { displayName?: string };
      return party.displayName === 'Receiver';
    });
    const handler = vi.fn(async () => 'approved');
    const f = await fixture([template({ actions: [{ ...template().actions[0], condition, runHandler: handler }] })]);
    const User = f.connection.model('ReadUser', new mongoose.Schema({ displayName: String }));
    await User.create([
      { _id: sender, displayName: 'Sender' },
      { _id: receiver, displayName: 'Receiver' },
    ]);
    const active = await create(f);
    const populate = [
      { path: 'fromUser', model: User },
      { path: 'toUser', model: User },
    ];
    const populated = await f.service.findMessageOrThrow(String(active._id), { populate });
    expect(populated.isSender({ _id: sender })).toBe(true);
    expect(populated.isReceiver({ _id: receiver })).toBe(true);
    const projected = await f.service.findMessageOrThrow(String(active._id), {
      populate: populate.map((item) => ({ ...item, select: 'displayName -_id' })),
    });
    expect(projected.isSender({ _id: sender })).toBe(false);
    expect(projected.isReceiver({ _id: receiver })).toBe(false);
    expect(projected.isReceiver({ _id: '[object Object]' })).toBe(false);
    expect(await f.service.getActions(String(active._id), 'sender', { user: { _id: sender }, populate })).toMatchObject(
      { actions: [{ actionCd: 'approve' }] },
    );
    expect(
      await f.service.getActions(String(active._id), 'receiver', { user: { _id: receiver }, populate }),
    ).toMatchObject({ actions: [{ actionCd: 'approve' }] });
    condition.mockClear();
    const populateSpy = vi.spyOn(User, 'find');
    expect(
      await f.service.getActions(String(active._id), 'receiver', { user: { _id: replacement }, populate }),
    ).toBeNull();
    expect(populateSpy).not.toHaveBeenCalled();
    expect(condition).not.toHaveBeenCalled();
    // A populated pre-check can pass, but mutation must still check the unpopulated atomic claim.
    await expect(
      f.service.handleAction(active.templateCd, 'approve', { message: populated, user: { _id: receiver } }),
    ).rejects.toBeInstanceOf(ActionNotAllowedError);
    expect(handler).not.toHaveBeenCalled();
    expect(await f.models.Message.findById(active._id).lean()).toMatchObject({
      actionState: 'active',
      actionAttemptId: null,
    });
    // Conditions shared with mutations must support unpopulated identities.
    f.registry.register(template());
    await expect(
      f.service.handleAction(active.templateCd, 'approve', { message: populated, user: { _id: receiver } }),
    ).resolves.toBe('approved');
    const archived = await f.service.findMessageOrThrow(String(active._id), { populate });
    expect(archived.isSender({ _id: sender })).toBe(true);
    expect(archived.isReceiver({ _id: receiver })).toBe(true);
    await expect(
      f.service.handleAction(active.templateCd, 'approve', { message: archived, user: { _id: sender } }),
    ).rejects.toBeInstanceOf(MessageArchivedError);
  });

  it('never grants missing populated identities, while canonical IDs and explicit recipient roles retain their meaning', async () => {
    const f = await fixture();
    const User = f.connection.model('DeletedReadUser', new mongoose.Schema({ displayName: String }));
    await User.create([{ _id: sender }, { _id: receiver }]);
    const active = await create(f);
    await User.deleteMany({});
    const populate = [
      { path: 'fromUser', model: User },
      { path: 'toUser', model: User },
    ];
    const missing = await f.service.findMessageOrThrow(String(active._id), { populate });
    expect(missing.fromUser).toBeNull();
    expect(missing.toUser).toBeNull();
    for (const id of [sender, receiver, 'null', 'undefined', '[object Object]']) {
      expect(missing.isSender({ _id: id })).toBe(false);
      expect(missing.isReceiver({ _id: id })).toBe(false);
    }
    // Message relationships do not perform host account-liveness checks: the stored ID is authoritative.
    expect(
      await f.service.getActions(String(active._id), 'receiver', { user: { _id: receiver }, populate }),
    ).toMatchObject({ actions: [{ actionCd: 'approve' }] });
    await f.models.Message.updateOne(
      { _id: active._id },
      { $set: { fromUser: null, toUser: null, toRoles: ['reviewer'] } },
    );
    for (const id of [sender, receiver, 'null', 'undefined']) {
      expect(await f.service.getActions(String(active._id), 'receiver', { user: { _id: id }, populate })).toBeNull();
    }
    expect(
      await f.service.getActions(String(active._id), 'receiver', {
        user: { _id: replacement, roles: ['reviewer'] },
        populate,
      }),
    ).toMatchObject({ actions: [{ actionCd: 'approve' }] });
  });

  it('keeps archive connection ownership and validates principals before lookup, population or template effects', async () => {
    const f = await fixture();
    const other = await fixture();
    const archived = await archive(f);
    await other.models.MessageArchive.create({ ...archived.toObject(), toUser: replacement, fromUser: replacement });
    const local = new MessageService({ connection: f.connection, registry: f.registry });
    await expect(
      local.handleAction(archived.templateCd, 'approve', { message: archived, user: { _id: receiver } }),
    ).rejects.toBeInstanceOf(ActionNotificationPendingError);
    await expect(
      other.service.handleAction(archived.templateCd, 'approve', { message: archived, user: { _id: receiver } }),
    ).rejects.toBeInstanceOf(MessageModelResolutionError);
    expect(
      await other.service.getActions(String(archived._id), 'receiver', {
        user: { _id: receiver },
        message: archived,
      }),
    ).toBeNull();
    const lookup = vi.spyOn(f.models.MessageArchive, 'findById');
    const activeLookup = vi.spyOn(f.models.Message, 'findById');
    const registryLookup = vi.spyOn(f.registry, 'find');
    await expect(
      f.service.handleAction(archived.templateCd, 'approve', { message: archived, user: { _id: '' } }),
    ).rejects.toBeInstanceOf(InvalidMessageUserError);
    await expect(
      f.service.getActions(String(archived._id), 'receiver', { user: { _id: '' }, message: archived, isAdmin: true }),
    ).rejects.toBeInstanceOf(InvalidMessageUserError);
    expect(lookup).not.toHaveBeenCalled();
    expect(activeLookup).not.toHaveBeenCalled();
    expect(registryLookup).not.toHaveBeenCalled();
  });
});
