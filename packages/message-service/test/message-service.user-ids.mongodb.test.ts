import mongoose from 'mongoose';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActionNotAllowedError,
  MessageArchivedError,
  MessageService,
  TemplateRegistry,
  buildMessageArchiveSchema,
  buildMessageRequestSchema,
  buildMessageSchema,
  serializePublicMessage,
  type ActionContext,
  type IMessage,
  type MessageTemplate,
  type PrepareContext,
  type UserId,
} from '../src';
import { getMongoReplicaSetUri, stopMongoReplicaSet } from './support/mongodb-fixture';

const senderObjectId = new mongoose.Types.ObjectId('abcdef0123456789abcdef01');
const receiverObjectId = new mongoose.Types.ObjectId('abcdef0123456789abcdef02');
const auditorObjectId = new mongoose.Types.ObjectId('abcdef0123456789abcdef03');

const configurations = [
  { name: 'default ObjectId', strings: false, sender: senderObjectId, receiver: receiverObjectId },
  { name: 'opaque strings', strings: true, sender: 'oidc|Acme:Alice-9', receiver: 'oidc|Acme:Reviewer-9' },
  {
    name: 'hex-looking opaque strings',
    strings: true,
    sender: senderObjectId.toHexString().toUpperCase(),
    receiver: receiverObjectId.toHexString().toUpperCase(),
  },
];

function representations(id: UserId): UserId[] {
  if (typeof id === 'string') return [id, ` \t${id}\n `];
  return [id, id.toHexString(), id.toHexString().toUpperCase(), ` ${id.toHexString().toUpperCase()} `];
}

function templateFor(receiver: UserId) {
  const prepare = vi.fn(async ({ user, payload }: PrepareContext) =>
    Array.from({ length: Number(payload.items ?? 1) }, (_, index) => ({
      fromUser: user._id,
      toUser: receiver,
      payload: { index },
    })),
  );
  const run = vi.fn(async ({ user }: ActionContext) => ({ actor: user._id }));
  const template: MessageTemplate = {
    templateCd: 'identity.review',
    type: 'request',
    description: 'MSGA-03 identity lifecycle',
    senderContent: { title: 'Sent', long: 'Sent body', short: 'Sent' },
    receiverContent: { title: 'Review', long: 'Review body', short: 'Review' },
    uiTemplate: 'default-message',
    prepareMessage: prepare,
    actions: [
      { actionCd: 'cancel', name: 'Cancel', variant: 'danger', sender: true, receiver: false, runHandler: run },
      {
        actionCd: 'approve',
        name: 'Approve',
        variant: 'success',
        sender: false,
        receiver: true,
        runHandler: run,
        senderNotification: 'Approved',
      },
    ],
  };
  return { template, prepare, run };
}

describe('MSGA-03 real-MongoDB user identities', () => {
  const connections: mongoose.Connection[] = [];

  async function fixture(strings: boolean, template: MessageTemplate, trimStrings = true) {
    const connection = await mongoose
      .createConnection(await getMongoReplicaSetUri(), { dbName: `identity_${new mongoose.Types.ObjectId()}` })
      .asPromise();
    connections.push(connection);
    const activeSchema = buildMessageSchema({ connection });
    const archiveSchema = buildMessageArchiveSchema();
    if (strings) {
      // The shipped recipe: override BOTH parties on BOTH schemas AND archivedBy.
      for (const schema of [activeSchema, archiveSchema]) {
        schema.add({
          fromUser: { type: String, default: null, trim: trimStrings, minlength: 1 },
          toUser: { type: String, default: null, trim: trimStrings, minlength: 1 },
        });
      }
      archiveSchema.add({ archivedBy: { type: String, default: null, trim: trimStrings, minlength: 1, index: true } });
    }
    const Message = connection.model('Message', activeSchema);
    const Archive = connection.model('MessageArchive', archiveSchema);
    const Request = connection.model('MessageRequest', buildMessageRequestSchema());
    await Promise.all([Message.init(), Archive.init(), Request.init()]);
    const registry = new TemplateRegistry();
    registry.register(template);
    const service = new MessageService({ connection, registry });
    return { connection, Message, Archive, Request, registry, service };
  }

  afterEach(async () => {
    for (const connection of connections.splice(0)) {
      await connection.dropDatabase();
      await connection.close();
    }
  });

  afterAll(stopMongoReplicaSet);

  it.each(configurations)('$name: complete identity lifecycle', async (config) => {
    const { template, prepare, run } = templateFor(config.receiver);
    const { connection, Message, Archive, Request, registry, service } = await fixture(config.strings, template);
    const input = {
      templateCd: template.templateCd,
      user: { _id: config.sender },
      clientRequestId: 'identity-key',
      payload: { items: 2 },
    };
    const created = await service.createMessage(input);
    expect(created).toHaveLength(2);
    const [first, second] = created as IMessage[];
    const ids = created.map((doc) => String(doc._id)).sort();
    const senderId = String(config.sender);
    const receiverId = String(config.receiver);
    const raw = await Message.collection.findOne({ _id: first._id });
    expect(raw?._id).toBeInstanceOf(mongoose.Types.ObjectId);
    if (config.strings) {
      expect(raw?.fromUser).toBe(senderId);
      expect(raw?.toUser).toBe(receiverId);
    } else {
      expect(raw?.fromUser).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(raw?.toUser).toBeInstanceOf(mongoose.Types.ObjectId);
    }

    for (const [party, id, actionCd] of [
      ['sender', config.sender, 'cancel'],
      ['receiver', config.receiver, 'approve'],
    ] as const) {
      for (const _id of representations(id)) {
        const user = { _id };
        expect((await service.listMessages({ user })).map((doc) => String(doc._id)).sort()).toEqual(ids);
        expect(await service.countMessages(user)).toBe(2);
        const actions = await service.getActions(String(first._id), party, { user });
        expect(actions?.actions.map((action) => action.actionCd)).toEqual([actionCd]);
        expect(party === 'sender' ? first.isSender(user) : first.isReceiver(user)).toBe(true);
      }
    }

    if (config.strings) {
      for (const _id of [receiverId.toLowerCase(), ...(receiverId.length === 24 ? [receiverObjectId] : [])]) {
        const user = { _id };
        expect(await service.listMessages({ user })).toEqual([]);
        expect(await service.countMessages(user)).toBe(0);
        expect(await service.getActions(String(first._id), 'receiver', { user })).toBeNull();
        await expect(
          service.handleAction(template.templateCd, 'approve', { message: first, user }),
        ).rejects.toBeInstanceOf(ActionNotAllowedError);
      }
      expect(run).not.toHaveBeenCalled();
    }

    const actor = representations(config.receiver).at(-1)!;
    const normalizedActor = String(actor).trim();
    await expect(
      service.handleAction(template.templateCd, 'approve', { message: first, user: { _id: actor } }),
    ).resolves.toEqual({ actor: normalizedActor });
    expect(run).toHaveBeenCalledTimes(1);
    const archived = await service.findMessageOrThrow(String(first._id));
    expect('archivedAt' in archived).toBe(true);
    const rawArchive = await Archive.collection.findOne({ _id: first._id });
    expect(rawArchive?._id).toBeInstanceOf(mongoose.Types.ObjectId);
    if (config.strings) {
      expect(rawArchive?.archivedBy).toBe(receiverId);
      expect(rawArchive?.fromUser).toBe(senderId);
      expect(rawArchive?.toUser).toBe(receiverId);
    } else {
      for (const field of ['fromUser', 'toUser', 'archivedBy']) {
        expect(rawArchive?.[field]).toBeInstanceOf(mongoose.Types.ObjectId);
      }
    }
    expect(serializePublicMessage(archived)).toMatchObject({
      _id: String(first._id),
      fromUser: senderId,
      toUser: receiverId,
      archivedBy: receiverId,
      actionNotificationState: 'sent',
    });
    for (const _id of representations(config.receiver)) {
      expect(archived.isReceiver({ _id })).toBe(true);
      await expect(
        service.handleAction(template.templateCd, 'approve', { message: archived, user: { _id } }),
      ).rejects.toBeInstanceOf(MessageArchivedError);
    }
    if (config.strings) {
      await expect(
        service.handleAction(template.templateCd, 'approve', {
          message: archived,
          user: { _id: receiverId.toLowerCase() },
        }),
      ).rejects.toBeInstanceOf(ActionNotAllowedError);
    }

    // Completed replay merges archived and still-active records without preparation.
    const replayInput = { ...input, user: { _id: ` ${senderId} ` }, payload: { items: 99 } };
    const mixedReplay = await service.createMessage(replayInput);
    expect(mixedReplay.map((doc) => String(doc._id))).toEqual(created.map((doc) => String(doc._id)));
    expect(mixedReplay.map((doc) => 'archivedAt' in doc)).toEqual([true, false]);

    // Direct archival is a trusted host primitive: an unrelated auditor is allowed,
    // and it does not execute the action handler or sender notification.
    const auditor = config.strings ? 'Audit|External:Actor' : auditorObjectId.toHexString().toUpperCase();
    await second.archive('approve', ` \t${auditor}\n `, registry);
    const rawDirect = await Archive.collection.findOne({ _id: second._id });
    if (config.strings) expect(rawDirect?.archivedBy).toBe(auditor);
    else expect(rawDirect?.archivedBy).toBeInstanceOf(mongoose.Types.ObjectId);
    const direct = await service.findMessageOrThrow(String(second._id));
    expect(serializePublicMessage(direct)).toMatchObject({
      fromUser: senderId,
      toUser: receiverId,
      archivedBy: config.strings ? auditor : auditor.toLowerCase(),
      actionNotificationState: 'none',
    });
    const terminalReplay = await service.createMessage(replayInput);
    expect(terminalReplay.map((doc) => 'archivedAt' in doc)).toEqual([true, true]);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(await Request.countDocuments({})).toBe(1);
    expect(await Archive.countDocuments({})).toBe(2);
    expect(await Message.countDocuments({ _id: { $in: created.map((doc) => doc._id) } })).toBe(0);
    const notifications = await service.listMessages({ user: { _id: config.sender } });
    expect(notifications).toHaveLength(1);
    expect(serializePublicMessage(notifications[0])).toMatchObject({
      toUser: senderId,
      templateCd: '__generic-notification__',
    });

    // Populated String/ObjectId parties retain their stored identity semantics and
    // the serializer allowlists presentation fields on hydrated user documents.
    const User = connection.model(
      'IdentityUser',
      new mongoose.Schema({
        _id: { type: config.strings ? String : mongoose.Schema.Types.ObjectId },
        displayName: String,
        privateValue: String,
      }),
    );
    await User.create([
      { _id: config.sender, displayName: 'Sender', privateValue: 'PRIVATE_USER' },
      { _id: config.receiver, displayName: 'Receiver', privateValue: 'PRIVATE_USER' },
    ]);
    const populated = await service.findMessageOrThrow(String(first._id), {
      populate: [
        { path: 'fromUser', model: User },
        { path: 'toUser', model: User },
      ],
    });
    expect(populated.isSender({ _id: representations(config.sender).at(-1)! })).toBe(true);
    expect(populated.isReceiver({ _id: actor })).toBe(true);
    const dto = serializePublicMessage(populated);
    expect(dto.fromUser).toEqual({ _id: senderId, displayName: 'Sender' });
    expect(dto.toUser).toEqual({ _id: receiverId, displayName: 'Receiver' });
    expect(JSON.stringify(dto)).not.toContain('PRIVATE_USER');
    for (const privateField of ['clientRequestOwnerId', 'clientRequestId', 'actionOwnerToken', 'actionClaimedBy']) {
      expect(dto).not.toHaveProperty(privateField);
    }
  });

  describe.each(['direct', 'idempotent'])('%s padding normalization without schema setters', (creation) => {
    it.each(['default sender', 'prepared sender'])('trims %s and recipient', async (source) => {
      const { template } = templateFor('unused');
      const user = { _id: ' \tOidc|Acme:Alice\n ' };
      const prepare = vi.fn(async (ctx: PrepareContext) => {
        expect(ctx.user === user).toBe(true);
        expect(ctx.user._id).toBe(user._id);
        return {
          ...(source === 'prepared sender' ? { fromUser: '  Oidc|Acme:Alice  ' } : {}),
          toUser: ' \tOidc|Acme:Reviewer\n ',
          // Unsupported preparation fields still cannot override lifecycle/identity.
          _id: auditorObjectId,
          archivedBy: 'injected',
          actionState: 'processing',
          clientRequestOwnerId: 'injected',
        };
      });
      template.prepareMessage = prepare;
      const { Message, service } = await fixture(true, template, false);
      const [message] = await service.createMessage({
        templateCd: template.templateCd,
        user,
        ...(creation === 'idempotent' ? { clientRequestId: 'padding-key' } : {}),
      });
      const raw = await Message.collection.findOne({ _id: message._id });
      expect(raw?.fromUser).toBe('Oidc|Acme:Alice');
      expect(raw?.toUser).toBe('Oidc|Acme:Reviewer');
      expect(String(message._id)).not.toBe(String(auditorObjectId));
      expect(raw?.archivedBy).toBeUndefined();
      expect(raw?.actionState).toBe('active');
      expect(raw?.clientRequestOwnerId).toBe(creation === 'idempotent' ? 'Oidc|Acme:Alice' : null);
      for (const _id of [user._id, user._id.trim(), ' Oidc|Acme:Reviewer ']) {
        expect((await service.listMessages({ user: { _id } })).map((doc) => String(doc._id))).toEqual([
          String(message._id),
        ]);
        expect(await service.countMessages({ _id })).toBe(1);
      }
      expect(user._id).toBe(' \tOidc|Acme:Alice\n ');
    });
  });

  it.each(['direct', 'idempotent'])('%s creation trims before ObjectId casting', async (creation) => {
    const { template } = templateFor(` ${receiverObjectId.toHexString().toUpperCase()} `);
    const { Message, service } = await fixture(false, template);
    const [message] = await service.createMessage({
      templateCd: template.templateCd,
      user: { _id: ` ${senderObjectId.toHexString().toUpperCase()} ` },
      ...(creation === 'idempotent' ? { clientRequestId: 'padded-hex-key' } : {}),
    });
    const raw = await Message.collection.findOne({ _id: message._id });
    expect(raw?.fromUser).toEqual(senderObjectId);
    expect(raw?.toUser).toEqual(receiverObjectId);
    expect(raw?.clientRequestOwnerId).toBe(
      creation === 'idempotent' ? senderObjectId.toHexString().toUpperCase() : null,
    );
    for (const _id of representations(receiverObjectId)) {
      expect(await service.countMessages({ _id })).toBe(1);
      expect((await service.getActions(String(message._id), 'receiver', { user: { _id } }))?.actions).toHaveLength(1);
    }
  });

  it('normalizes direct archivedBy without schema setters while notification input remains host-owned', async () => {
    const { template, run } = templateFor('Reviewer|Case');
    const { Archive, Message, registry, service } = await fixture(true, template, false);
    const [message] = await service.createMessage({ templateCd: template.templateCd, user: { _id: 'Sender|Case' } });
    if ('archivedAt' in message) throw new Error('Expected a fresh active message');
    await message.archive('approve', ' \tAudit|Case\n ', registry);
    const archived = await Archive.collection.findOne({ _id: message._id });
    expect(archived?.archivedBy).toBe('Audit|Case');
    expect(run).not.toHaveBeenCalled();
    const notification = await service.createNotification({
      fromUser: ' Raw|Sender ',
      toUser: ' Raw|Recipient ',
      receiverContent: { title: 'Host', long: 'Host' },
    });
    const raw = await Message.collection.findOne({ _id: notification._id });
    expect(raw?.fromUser).toBe(' Raw|Sender ');
    expect(raw?.toUser).toBe(' Raw|Recipient ');
  });

  it('converts ObjectId inputs to lowercase hex in String schemas without equating uppercase opaque IDs', async () => {
    const { template } = templateFor(receiverObjectId);
    const { service, registry } = await fixture(true, template);
    const [message] = await service.createMessage({ templateCd: template.templateCd, user: { _id: senderObjectId } });
    if ('archivedAt' in message) throw new Error('Expected a fresh active message');
    expect(message.fromUser).toBe(senderObjectId.toHexString());
    expect(message.toUser).toBe(receiverObjectId.toHexString());
    expect(await service.countMessages({ _id: receiverObjectId })).toBe(1);
    expect(await service.countMessages({ _id: receiverObjectId.toHexString().toUpperCase() })).toBe(0);
    expect(message.isReceiver({ _id: receiverObjectId })).toBe(true);
    expect(message.isReceiver({ _id: receiverObjectId.toHexString().toUpperCase() })).toBe(false);
    await message.archive('approve', receiverObjectId, registry);
    expect(serializePublicMessage(await service.findMessageOrThrow(String(message._id))).archivedBy).toBe(
      receiverObjectId.toHexString(),
    );
  });

  const opaqueRequesters = ['Oidc|Acme:Alice', senderObjectId.toHexString().toUpperCase()];
  it.each(opaqueRequesters)('case-distinct batches: %s', async (identity) => {
    const { template, prepare } = templateFor(identity);
    template.prepareMessage = vi.fn(async ({ user }: PrepareContext) => ({ fromUser: user._id, toUser: user._id }));
    const { service } = await fixture(true, template);
    const lower = identity.toLowerCase();
    const batches: IMessage[] = [];
    for (const _id of [identity, lower]) {
      const [message] = await service.createMessage({
        templateCd: template.templateCd,
        user: { _id },
        clientRequestId: 'same-key',
      });
      if ('archivedAt' in message) throw new Error('Expected a fresh active message');
      batches.push(message);
    }
    expect(String(batches[0]._id)).not.toBe(String(batches[1]._id));
    for (const [index, _id] of [identity, lower].entries()) {
      expect((await service.listMessages({ user: { _id } })).map((doc) => String(doc._id))).toEqual([
        String(batches[index]._id),
      ]);
      await expect(
        service.handleAction(template.templateCd, 'approve', { message: batches[1 - index], user: { _id } }),
      ).rejects.toBeInstanceOf(ActionNotAllowedError);
      await service.handleAction(template.templateCd, 'approve', { message: batches[index], user: { _id } });
      const [replay] = await service.createMessage({
        templateCd: template.templateCd,
        user: { _id },
        clientRequestId: 'same-key',
      });
      expect(String(replay._id)).toBe(String(batches[index]._id));
      expect(serializePublicMessage(replay).archivedBy).toBe(_id);
    }
    expect(template.prepareMessage).toHaveBeenCalledTimes(2);
    expect(prepare).not.toHaveBeenCalled();
  });

  it.each([false, true])('separate legacy hex scopes (String storage: %s)', async (strings) => {
    const { template, prepare } = templateFor(receiverObjectId);
    const { Message, Archive, Request, service } = await fixture(strings, template);
    const lower = senderObjectId.toHexString();
    const upper = lower.toUpperCase();
    const expected: string[] = [];
    for (const [index, owner] of [lower, upper].entries()) {
      const scope = { templateCd: template.templateCd, clientRequestId: 'legacy-key', clientRequestOwnerId: owner };
      await Request.create({ ...scope, state: 'completed', itemCount: 1, completedAt: new Date() });
      const fields = { ...scope, fromUser: owner, toUser: null, clientRequestItemIndex: 0 };
      const doc = index === 0 ? await Message.create(fields) : await Archive.create({ ...fields, archivedBy: owner });
      expected.push(String(doc._id));
    }
    for (const [index, _id] of [senderObjectId, ` ${upper} `, ` ${lower} `].entries()) {
      const replay = await service.createMessage({
        templateCd: template.templateCd,
        user: { _id },
        clientRequestId: 'legacy-key',
      });
      expect(replay.map((doc) => String(doc._id))).toEqual([expected[index === 1 ? 1 : 0]]);
    }
    expect(prepare).not.toHaveBeenCalled();
    expect(await Request.countDocuments({})).toBe(2);
    expect(await Message.countDocuments({})).toBe(1);
    expect(await Archive.countDocuments({})).toBe(1);
  });
});
