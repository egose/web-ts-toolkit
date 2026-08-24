import mongoose from 'mongoose';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createMessageServiceBarriers } from './support/deferred';
import {
  createMongoMessageServiceFixture,
  getMongoReplicaSetUri,
  releaseBarriers,
  stopMongoReplicaSet,
  type MongoMessageServiceFixture,
} from './support/mongodb-fixture';
import {
  ActionConflictError,
  ActionNotificationPendingError,
  ClientRequestFailedError,
  ClientRequestInconsistentStateError,
  MessageModelResolutionError,
  ClientRequestPendingError,
  MessageService,
} from '../src/message-service';
import type { MessageTemplate } from '../src/types/template';
import type { IMessage } from '../src/types/message';
import { buildMessageArchiveSchema } from '../src/schemas/message-archive';
import { buildMessageRequestSchema } from '../src/schemas/message-request';
import { buildMessageSchema, type EmailDeliveryFailureEvent } from '../src/schemas/message';
import { TemplateRegistry } from '../src/template-registry';

const senderId = new mongoose.Types.ObjectId();
const receiverId = new mongoose.Types.ObjectId();

const roleTemplate: MessageTemplate = {
  templateCd: 'mongo-role-test',
  type: 'request',
  description: 'MongoDB role visibility test',
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

function collectExplainIndexNames(plan: unknown): string[] {
  if (!plan || typeof plan !== 'object') {
    return [];
  }

  const current = plan as Record<string, unknown>;
  const own = typeof current.indexName === 'string' ? [current.indexName] : [];
  return own.concat(Object.values(current).flatMap((value) => collectExplainIndexNames(value)));
}

function collectExplainStages(plan: unknown): string[] {
  if (!plan || typeof plan !== 'object') {
    return [];
  }

  const current = plan as Record<string, unknown>;
  const own = typeof current.stage === 'string' ? [current.stage] : [];
  return own.concat(Object.values(current).flatMap((value) => collectExplainStages(value)));
}

describe('MessageService MongoDB integration harness', () => {
  const fixtures: MongoMessageServiceFixture[] = [];

  async function fixture(options: Parameters<typeof createMongoMessageServiceFixture>[0] = {}) {
    const created = await createMongoMessageServiceFixture(options);
    fixtures.push(created);
    return created;
  }

  async function emailFixture(
    options: {
      userSchema?: mongoose.Schema;
      emailNotifier?: (email: string, title: string, body: string) => Promise<void> | void;
      emailNotificationExclusions?: string[];
      onEmailDeliveryFailure?: (event: EmailDeliveryFailureEvent) => void | Promise<void>;
    } = {},
  ) {
    const databaseName = `message_service_email_${new mongoose.Types.ObjectId().toString()}`;
    const connection = await mongoose
      .createConnection(await getMongoReplicaSetUri(), {
        dbName: databaseName,
        autoIndex: true,
      })
      .asPromise();
    fixtures.push({
      connection,
      databaseName,
      registry: new TemplateRegistry(),
      service: undefined as never,
      models: undefined as never,
      close: async () => {
        await connection.dropDatabase();
        await connection.close();
      },
    });

    const userModelName = `Msg09User${new mongoose.Types.ObjectId().toString()}`;
    const messageModelName = `Msg09Message${new mongoose.Types.ObjectId().toString()}`;
    const User = connection.model(userModelName, options.userSchema ?? new mongoose.Schema({ email: String }));
    const notifier = options.emailNotifier ?? vi.fn(async () => undefined);
    const Message = connection.model(
      messageModelName,
      buildMessageSchema({
        connection,
        userModelName,
        emailNotifier: notifier,
        emailNotificationExclusions: options.emailNotificationExclusions,
        onEmailDeliveryFailure: options.onEmailDeliveryFailure,
      }),
    );
    await Promise.all([User.init(), Message.init()]);

    return { connection, User, Message, notifier };
  }

  function emailMessageFields(receiver: mongoose.Types.ObjectId, title = 'Email Title') {
    return {
      templateCd: 'email-post-commit-test',
      type: 'notification',
      fromUser: senderId,
      toUser: receiver,
      senderContent: { title: 'Sender', long: 'Sender long', short: 'Sender short' },
      receiverContent: { title, long: 'Email long body', short: 'Short' },
    };
  }

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map((created) => created.close()));
  });

  afterAll(async () => {
    await stopMongoReplicaSet();
  });

  it('uses actual MongoDB $in role-array semantics and hydrated sender/receiver methods', async () => {
    const { service, models } = await fixture({ templates: [roleTemplate] });

    const [message] = await service.createMessage({
      templateCd: roleTemplate.templateCd,
      user: { _id: senderId, roles: ['sender-role'] },
      payload: { toUser: receiverId, toRoles: ['reviewer', 'approver'] },
    });

    const roleVisible = await service.listMessages({
      user: { _id: new mongoose.Types.ObjectId(), roles: ['reviewer'] },
    });
    const roleHidden = await service.listMessages({ user: { _id: new mongoose.Types.ObjectId(), roles: ['auditor'] } });
    const hydrated = (await models.Message.findById(message._id)) as IMessage | null;

    expect(roleVisible.map((doc) => String(doc._id))).toEqual([String(message._id)]);
    expect(roleHidden).toEqual([]);
    expect(hydrated).not.toBeNull();
    expect(hydrated?.isSender({ _id: senderId })).toBe(true);
    expect(hydrated?.isSender({ _id: receiverId })).toBe(false);
    expect(hydrated?.isReceiver({ _id: receiverId })).toBe(true);
    expect(hydrated?.isReceiver({ _id: new mongoose.Types.ObjectId(), roles: ['approver'] })).toBe(true);
    expect(hydrated?.isReceiver({ _id: new mongoose.Types.ObjectId(), roles: ['auditor'] })).toBe(false);
  });

  it('lists and counts visible messages against MongoDB without duplicate or hidden results', async () => {
    const { service, models } = await fixture({ templates: [roleTemplate] });
    const visibleBySender = new mongoose.Types.ObjectId();
    const visibleByDirectReceiver = new mongoose.Types.ObjectId();
    const visibleByRoleOnly = new mongoose.Types.ObjectId();
    const hiddenUser = new mongoose.Types.ObjectId();
    const user = { _id: receiverId, roles: ['reviewer'] };

    await models.Message.create([
      {
        templateCd: 'visibility-sender',
        type: 'notification',
        fromUser: receiverId,
        toRoles: ['reviewer'],
        receiverContent: { title: 'sender and role', long: 'sender and role', short: 'sender and role' },
        _id: visibleBySender,
      },
      {
        templateCd: 'visibility-direct',
        type: 'notification',
        fromUser: senderId,
        toUser: receiverId,
        receiverContent: { title: 'direct', long: 'direct', short: 'direct' },
        _id: visibleByDirectReceiver,
      },
      {
        templateCd: 'visibility-role',
        type: 'notification',
        fromUser: senderId,
        toRoles: ['reviewer'],
        receiverContent: { title: 'role', long: 'role', short: 'role' },
        _id: visibleByRoleOnly,
      },
      {
        templateCd: 'visibility-hidden',
        type: 'notification',
        fromUser: hiddenUser,
        toUser: hiddenUser,
        toRoles: ['auditor'],
        receiverContent: { title: 'hidden', long: 'hidden', short: 'hidden' },
      },
    ]);

    const listed = await service.listMessages({ user, limit: 10 });
    const listedIds = listed.map((message) => String(message._id));

    expect(new Set(listedIds)).toEqual(
      new Set([String(visibleBySender), String(visibleByDirectReceiver), String(visibleByRoleOnly)]),
    );
    expect(listedIds).toHaveLength(new Set(listedIds).size);
    await expect(service.countMessages(user)).resolves.toBe(3);
  });

  it('uses deterministic createdAt and _id ordering for equal-timestamp offset pages', async () => {
    const { service, models } = await fixture();
    const userId = new mongoose.Types.ObjectId();
    const ids = ['000000000000000000000101', '000000000000000000000102', '000000000000000000000103'].map(
      (value) => new mongoose.Types.ObjectId(value),
    );
    const sameCreatedAt = new Date('2026-08-23T00:00:00.000Z');

    await models.Message.create(
      ids.map((_id, index) => ({
        _id,
        templateCd: `determinism-${index}`,
        type: 'notification',
        fromUser: userId,
        receiverContent: { title: `message ${index}`, long: `message ${index}`, short: `message ${index}` },
      })),
    );
    await models.Message.updateMany(
      { _id: { $in: ids } },
      { $set: { createdAt: sameCreatedAt, updatedAt: sameCreatedAt } },
    );

    const firstPage = await service.listMessages({ user: { _id: userId }, limit: 2 });
    const secondPage = await service.listMessages({ user: { _id: userId }, limit: 2, skip: 2 });

    expect(firstPage.map((message) => String(message._id))).toEqual([
      '000000000000000000000103',
      '000000000000000000000102',
    ]);
    expect(secondPage.map((message) => String(message._id))).toEqual(['000000000000000000000101']);
  });

  it('uses branch-aligned compound indexes for representative visibility sort queries', async () => {
    const { models } = await fixture();
    const sender = new mongoose.Types.ObjectId();
    const receiver = new mongoose.Types.ObjectId();
    const role = 'reviewer';

    await models.Message.create(
      Array.from({ length: 30 }, (_, index) => ({
        templateCd: `explain-${index}`,
        type: 'notification',
        fromUser: index % 3 === 0 ? sender : new mongoose.Types.ObjectId(),
        toUser: index % 3 === 1 ? receiver : new mongoose.Types.ObjectId(),
        toRoles: index % 3 === 2 ? [role] : ['other'],
        receiverContent: { title: `message ${index}`, long: `message ${index}`, short: `message ${index}` },
      })),
    );

    const cases = [
      {
        filter: { fromUser: sender },
        expectedIndex: 'fromUser_1_createdAt_-1__id_-1',
      },
      {
        filter: { toUser: receiver },
        expectedIndex: 'toUser_1_createdAt_-1__id_-1',
      },
      {
        filter: { toRoles: { $in: [role] } },
        expectedIndex: 'toRoles_1_createdAt_-1__id_-1',
      },
    ];

    for (const { filter, expectedIndex } of cases) {
      const explain = await models.Message.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(5)
        .explain('executionStats');
      expect(collectExplainIndexNames(explain)).toContain(expectedIndex);
      expect(collectExplainStages(explain)).not.toContain('COLLSCAN');
    }
  });

  it('enforces unique and partial indexes in MongoDB', async () => {
    const { models } = await fixture();
    const base = {
      templateCd: 'mongo-index-test',
      type: 'notification',
      fromUser: senderId,
      toUser: receiverId,
      senderContent: { title: 'S', long: 'S', short: 'S' },
      receiverContent: { title: 'R', long: 'R', short: 'R' },
    };

    await models.Message.create({
      ...base,
      clientRequestId: 'request-a',
      clientRequestOwnerId: 'owner-a',
      clientRequestItemIndex: 0,
    });
    await expect(
      models.Message.create({
        ...base,
        clientRequestId: 'request-a',
        clientRequestOwnerId: 'owner-a',
        clientRequestItemIndex: 0,
      }),
    ).rejects.toMatchObject({ code: 11000 });
    await expect(
      models.Message.create({
        ...base,
        clientRequestId: 'request-a',
        clientRequestOwnerId: 'owner-a',
        clientRequestItemIndex: 1,
      }),
    ).resolves.toBeDefined();
    await expect(
      models.Message.create({
        ...base,
        clientRequestId: 'request-a',
        clientRequestOwnerId: 'owner-b',
        clientRequestItemIndex: 0,
      }),
    ).resolves.toBeDefined();
    await expect(
      models.Message.create({
        ...base,
        templateCd: 'mongo-index-other-template',
        clientRequestId: 'request-a',
        clientRequestOwnerId: 'owner-a',
        clientRequestItemIndex: 0,
      }),
    ).resolves.toBeDefined();
    await expect(models.Message.create({ ...base, clientRequestItemIndex: 0 })).resolves.toBeDefined();
    await expect(models.Message.create({ ...base, clientRequestItemIndex: 0 })).resolves.toBeDefined();

    await models.MessageRequest.create({
      clientRequestId: 'reservation-a',
      clientRequestOwnerId: 'owner-a',
      templateCd: 'mongo-index-test',
      state: 'pending',
    });
    await expect(
      models.MessageRequest.create({
        clientRequestId: 'reservation-a',
        clientRequestOwnerId: 'owner-a',
        templateCd: 'mongo-index-test',
        state: 'pending',
      }),
    ).rejects.toMatchObject({ code: 11000 });
    await expect(
      models.MessageRequest.create({
        clientRequestId: 'reservation-a',
        clientRequestOwnerId: 'owner-b',
        templateCd: 'mongo-index-test',
        state: 'pending',
      }),
    ).resolves.toBeDefined();
    await expect(
      models.MessageRequest.create({
        clientRequestId: 'reservation-a',
        clientRequestOwnerId: 'owner-a',
        templateCd: 'mongo-index-other-template',
        state: 'pending',
      }),
    ).resolves.toBeDefined();
  });

  it('does not replay another requester message when clientRequestId is reused', async () => {
    const { service } = await fixture({ templates: [roleTemplate] });
    const otherSenderId = new mongoose.Types.ObjectId();

    const first = await service.createMessage({
      templateCd: roleTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId, request: 'first' },
      clientRequestId: 'shared-request-id',
    });
    const second = await service.createMessage({
      templateCd: roleTemplate.templateCd,
      user: { _id: otherSenderId },
      payload: { toUser: receiverId, request: 'second' },
      clientRequestId: 'shared-request-id',
    });

    expect(second).toHaveLength(1);
    expect(String(second[0]._id)).not.toBe(String(first[0]._id));
    expect(String(second[0].fromUser)).toBe(String(otherSenderId));
    expect(second[0].payload).toMatchObject({ request: 'second' });
  });

  it('does not replay another template batch when clientRequestId is reused', async () => {
    const otherTemplate: MessageTemplate = { ...roleTemplate, templateCd: 'mongo-role-test-other' };
    const { service } = await fixture({ templates: [roleTemplate, otherTemplate] });

    const first = await service.createMessage({
      templateCd: roleTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId, request: 'first-template' },
      clientRequestId: 'shared-template-request-id',
    });
    const second = await service.createMessage({
      templateCd: otherTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId, request: 'second-template' },
      clientRequestId: 'shared-template-request-id',
    });

    expect(second).toHaveLength(1);
    expect(String(second[0]._id)).not.toBe(String(first[0]._id));
    expect(second[0].templateCd).toBe(otherTemplate.templateCd);
    expect(second[0].payload).toMatchObject({ request: 'second-template' });
  });

  it('preserves same-owner same-template replay with trimmed case-sensitive clientRequestId', async () => {
    const { service } = await fixture({ templates: [roleTemplate] });

    const first = await service.createMessage({
      templateCd: roleTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId, request: 'first' },
      clientRequestId: ' Replay-Key ',
    });
    const replay = await service.createMessage({
      templateCd: roleTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId, request: 'replay' },
      clientRequestId: 'Replay-Key',
    });
    const differentCase = await service.createMessage({
      templateCd: roleTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId, request: 'different-case' },
      clientRequestId: 'replay-key',
    });

    expect(replay.map((doc) => String(doc._id))).toEqual(first.map((doc) => String(doc._id)));
    expect(String(differentCase[0]._id)).not.toBe(String(first[0]._id));
  });

  it('can pause independently after reservation acquisition, first batch item commit, action handler entry, and archive commit', async () => {
    const barriers = createMessageServiceBarriers();
    const batchTemplate: MessageTemplate = {
      ...roleTemplate,
      templateCd: 'mongo-batch-barrier-test',
      prepareMessage: async ({ user }) => [
        { fromUser: user._id, toUser: receiverId, templateData: { item: 'one' }, payload: { item: 'one' } },
        { fromUser: user._id, toUser: receiverId, templateData: { item: 'two' }, payload: { item: 'two' } },
      ],
    };
    const actionTemplate: MessageTemplate = {
      ...roleTemplate,
      templateCd: 'mongo-action-barrier-test',
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'success',
          sender: false,
          receiver: true,
          runHandler: async () => {
            await barriers.actionClaimed.arrive();
            return 'approved';
          },
        },
      ],
    };
    const { service, models } = await fixture({ templates: [batchTemplate, actionTemplate], barriers });

    const createPromise = service.createMessage({
      templateCd: batchTemplate.templateCd,
      user: { _id: senderId },
      payload: {},
      clientRequestId: 'barrier-request',
    });

    await barriers.reservationAcquired.reached;
    expect(
      await models.MessageRequest.countDocuments({
        clientRequestId: 'barrier-request',
        clientRequestOwnerId: String(senderId),
        templateCd: batchTemplate.templateCd,
        state: 'pending',
      }),
    ).toBe(1);
    barriers.reservationAcquired.release();

    await barriers.firstBatchItemCommitted.reached;
    expect(
      await models.Message.countDocuments({
        clientRequestId: 'barrier-request',
        clientRequestOwnerId: String(senderId),
        templateCd: batchTemplate.templateCd,
      }),
    ).toBe(0);
    barriers.firstBatchItemCommitted.release();
    await expect(createPromise).resolves.toHaveLength(2);

    const actionMessage = (await models.Message.create({
      templateCd: actionTemplate.templateCd,
      type: 'request',
      fromUser: senderId,
      toUser: receiverId,
      senderContent: { title: 'S', long: 'S', short: 'S' },
      receiverContent: { title: 'R', long: 'R', short: 'R' },
    })) as IMessage;
    actionMessage.archive = async () => {
      await barriers.archiveCommitted.arrive();
    };

    const actionPromise = service.handleAction(actionTemplate.templateCd, 'approve', {
      message: actionMessage,
      user: { _id: receiverId },
    });

    await barriers.actionClaimed.reached;
    expect(await models.MessageArchive.countDocuments({})).toBe(0);
    barriers.actionClaimed.release();
    await barriers.archiveCommitted.reached;
    barriers.archiveCommitted.release();
    await expect(actionPromise).resolves.toBe('approved');

    releaseBarriers(
      barriers.reservationAcquired,
      barriers.firstBatchItemCommitted,
      barriers.actionClaimed,
      barriers.archiveCommitted,
    );
  });

  it('keeps partial transaction writes invisible and bounds live-reservation waiters', async () => {
    const barriers = createMessageServiceBarriers();
    const batchTemplate: MessageTemplate = {
      ...roleTemplate,
      templateCd: 'mongo-live-pending-batch-test',
      prepareMessage: async ({ user }) => [
        { fromUser: user._id, toUser: receiverId, templateData: { item: 'one' }, payload: { item: 'one' } },
        { fromUser: user._id, toUser: receiverId, templateData: { item: 'two' }, payload: { item: 'two' } },
      ],
    };
    const { service, models } = await fixture({
      templates: [batchTemplate],
      barriers,
      serviceOptions: { clientRequestLeaseMs: 60_000, clientRequestWaitMs: 0 },
    });

    const createPromise = service.createMessage({
      templateCd: batchTemplate.templateCd,
      user: { _id: senderId },
      clientRequestId: 'live-pending-request',
    });

    await barriers.reservationAcquired.reached;
    barriers.reservationAcquired.release();
    await barriers.firstBatchItemCommitted.reached;
    expect(
      await models.Message.countDocuments({
        clientRequestId: 'live-pending-request',
        clientRequestOwnerId: String(senderId),
        templateCd: batchTemplate.templateCd,
      }),
    ).toBe(0);
    await expect(
      service.createMessage({
        templateCd: batchTemplate.templateCd,
        user: { _id: senderId },
        clientRequestId: 'live-pending-request',
      }),
    ).rejects.toBeInstanceOf(ClientRequestPendingError);

    barriers.firstBatchItemCommitted.release();
    await expect(createPromise).resolves.toHaveLength(2);
  });

  it('rolls back the first item and records failure when a later item fails', async () => {
    const failingTemplate: MessageTemplate = {
      ...roleTemplate,
      templateCd: 'mongo-second-item-failure-test',
      prepareMessage: async ({ user }) => [
        { fromUser: user._id, toUser: receiverId, payload: { uniqueFailureKey: 'duplicate' } },
        { fromUser: user._id, toUser: receiverId, payload: { uniqueFailureKey: 'duplicate' } },
      ],
    };
    const { service, models } = await fixture({ templates: [failingTemplate] });
    await models.Message.collection.createIndex({ 'payload.uniqueFailureKey': 1 }, { unique: true, sparse: true });

    await expect(
      service.createMessage({
        templateCd: failingTemplate.templateCd,
        user: { _id: senderId },
        clientRequestId: 'second-item-fails',
      }),
    ).rejects.toMatchObject({ code: 11000 });
    expect(
      await models.Message.countDocuments({
        clientRequestId: 'second-item-fails',
        clientRequestOwnerId: String(senderId),
        templateCd: failingTemplate.templateCd,
      }),
    ).toBe(0);
    await expect(
      service.createMessage({
        templateCd: failingTemplate.templateCd,
        user: { _id: senderId },
        clientRequestId: 'second-item-fails',
      }),
    ).rejects.toBeInstanceOf(ClientRequestFailedError);
  });

  it('expires all payment sessions when a later batch item fails before commit', async () => {
    let sessionNumber = 0;
    const paymentProvider = {
      createSession: vi.fn(async () => `session-${++sessionNumber}`),
      expireSession: vi.fn(async () => undefined),
      refundPayment: vi.fn(async () => undefined),
    };
    const failingTemplate: MessageTemplate = {
      ...roleTemplate,
      templateCd: 'mongo-payment-batch-failure-test',
      paymentCd: 'payment-code',
      prepareMessage: async ({ user }) => [
        { fromUser: user._id, toUser: receiverId, payload: { uniquePaymentFailureKey: 'duplicate' } },
        { fromUser: user._id, toUser: receiverId, payload: { uniquePaymentFailureKey: 'duplicate' } },
      ],
    };
    const { service, models } = await fixture({
      templates: [failingTemplate],
      serviceOptions: { paymentProvider },
    });
    await models.Message.collection.createIndex(
      { 'payload.uniquePaymentFailureKey': 1 },
      { unique: true, sparse: true },
    );

    await expect(
      service.createMessage({
        templateCd: failingTemplate.templateCd,
        user: { _id: senderId },
        clientRequestId: 'payment-batch-fails',
      }),
    ).rejects.toMatchObject({ code: 11000 });
    expect(paymentProvider.createSession).toHaveBeenCalledTimes(2);
    expect(paymentProvider.expireSession).toHaveBeenCalledTimes(2);
    expect(paymentProvider.expireSession).toHaveBeenNthCalledWith(1, 'session-1');
    expect(paymentProvider.expireSession).toHaveBeenNthCalledWith(2, 'session-2');
    expect(await models.Message.countDocuments({ clientRequestId: 'payment-batch-fails' })).toBe(0);

    await expect(
      service.createMessage({
        templateCd: failingTemplate.templateCd,
        user: { _id: senderId },
        clientRequestId: 'payment-batch-fails',
      }),
    ).rejects.toBeInstanceOf(ClientRequestFailedError);
    expect(paymentProvider.createSession).toHaveBeenCalledTimes(2);
  });

  it('allows exactly one caller to reclaim a stale reservation and prevents stealing a live one', async () => {
    const prepareMessage = vi.fn(async ({ user }) => ({
      fromUser: user._id,
      toUser: receiverId,
      payload: { item: 'won' },
    }));
    const reclaimTemplate: MessageTemplate = {
      ...roleTemplate,
      templateCd: 'mongo-stale-reclaim-test',
      prepareMessage,
    };
    const { service, models } = await fixture({
      templates: [reclaimTemplate],
      serviceOptions: { clientRequestLeaseMs: 60_000, clientRequestWaitMs: 1_000, clientRequestPollMs: 1 },
    });
    const scope = {
      clientRequestId: 'stale-reclaim',
      clientRequestOwnerId: String(senderId),
      templateCd: reclaimTemplate.templateCd,
    };

    await models.MessageRequest.create({
      ...scope,
      state: 'pending',
      itemCount: null,
      leaseOwnerId: 'live-owner',
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      service.createMessage({
        templateCd: reclaimTemplate.templateCd,
        user: { _id: senderId },
        clientRequestId: 'stale-reclaim',
      }),
    ).rejects.toBeInstanceOf(ClientRequestPendingError);
    expect(prepareMessage).not.toHaveBeenCalled();

    await models.MessageRequest.updateOne(scope, { $set: { leaseExpiresAt: new Date(Date.now() - 1) } });
    const [first, second] = await Promise.all([
      service.createMessage({
        templateCd: reclaimTemplate.templateCd,
        user: { _id: senderId },
        clientRequestId: 'stale-reclaim',
      }),
      service.createMessage({
        templateCd: reclaimTemplate.templateCd,
        user: { _id: senderId },
        clientRequestId: 'stale-reclaim',
      }),
    ]);

    expect(first.map((doc) => String(doc._id))).toEqual(second.map((doc) => String(doc._id)));
    expect(await models.Message.countDocuments(scope)).toBe(1);
    expect(prepareMessage).toHaveBeenCalledTimes(1);
  });

  it('throws a controlled error for completed reservations missing exact item indexes', async () => {
    const { service, models } = await fixture({ templates: [roleTemplate] });
    const scope = {
      clientRequestId: 'missing-indexes',
      clientRequestOwnerId: String(senderId),
      templateCd: roleTemplate.templateCd,
    };
    await models.MessageRequest.create({ ...scope, state: 'completed', itemCount: 2, completedAt: new Date() });
    await models.Message.create({
      ...scope,
      clientRequestItemIndex: 0,
      type: 'notification',
      fromUser: senderId,
      toUser: receiverId,
      senderContent: { title: 'S', long: 'S', short: 'S' },
      receiverContent: { title: 'R', long: 'R', short: 'R' },
    });

    await expect(
      service.createMessage({
        templateCd: roleTemplate.templateCd,
        user: { _id: senderId },
        clientRequestId: 'missing-indexes',
      }),
    ).rejects.toBeInstanceOf(ClientRequestInconsistentStateError);
  });

  it('preserves completed zero-item replay', async () => {
    const emptyTemplate: MessageTemplate = {
      ...roleTemplate,
      templateCd: 'mongo-empty-replay-test',
      prepareMessage: async () => null,
    };
    const { service, models } = await fixture({ templates: [emptyTemplate] });

    await expect(
      service.createMessage({
        templateCd: emptyTemplate.templateCd,
        user: { _id: senderId },
        clientRequestId: 'empty-replay',
      }),
    ).resolves.toEqual([]);
    await expect(
      service.createMessage({
        templateCd: emptyTemplate.templateCd,
        user: { _id: senderId },
        clientRequestId: 'empty-replay',
      }),
    ).resolves.toEqual([]);
    expect(await models.Message.countDocuments({ clientRequestId: 'empty-replay' })).toBe(0);
    await expect(models.MessageRequest.findOne({ clientRequestId: 'empty-replay' }).lean()).resolves.toMatchObject({
      state: 'completed',
      itemCount: 0,
    });
  });

  it('uses MongoDB transactions for batch persistence and completion', async () => {
    const batchTemplate: MessageTemplate = {
      ...roleTemplate,
      templateCd: 'mongo-transaction-required-doc-test',
      prepareMessage: async ({ user }) => [
        { fromUser: user._id, toUser: receiverId, payload: { item: 'one' } },
        { fromUser: user._id, toUser: receiverId, payload: { item: 'two' } },
      ],
    };
    const { service } = await fixture({ templates: [batchTemplate] });

    const messages = await service.createMessage({
      templateCd: batchTemplate.templateCd,
      user: { _id: senderId },
      clientRequestId: 'transaction-required-success',
    });
    expect(messages).toHaveLength(2);
  });

  it('uses configured connection-local active, archive, and request model names without global registry access', async () => {
    const databaseName = `message_service_custom_${new mongoose.Types.ObjectId().toString()}`;
    const connection = await mongoose
      .createConnection(await getMongoReplicaSetUri(), {
        dbName: databaseName,
        autoIndex: true,
      })
      .asPromise();
    fixtures.push({
      connection,
      databaseName,
      registry: new TemplateRegistry(),
      service: undefined as never,
      models: undefined as never,
      close: async () => {
        await connection.dropDatabase();
        await connection.close();
      },
    });

    const modelNames = {
      active: `Msg07Active${new mongoose.Types.ObjectId().toString()}`,
      archive: `Msg07Archive${new mongoose.Types.ObjectId().toString()}`,
      request: `Msg07Request${new mongoose.Types.ObjectId().toString()}`,
      user: `Msg07User${new mongoose.Types.ObjectId().toString()}`,
    };
    const registry = new TemplateRegistry();
    const handler = vi.fn(async () => 'approved');
    registry.register({
      ...roleTemplate,
      templateCd: 'mongo-custom-model-name-test',
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

    const Message = connection.model(modelNames.active, buildMessageSchema({ archiveModelName: modelNames.archive }));
    const MessageArchive = connection.model(modelNames.archive, buildMessageArchiveSchema());
    const MessageRequest = connection.model(modelNames.request, buildMessageRequestSchema());
    await Promise.all([Message.init(), MessageArchive.init(), MessageRequest.init()]);

    const globalModelSpy = vi.spyOn(mongoose, 'model');
    globalModelSpy.mockImplementation(() => {
      throw new Error('global model registry should not be used');
    });
    try {
      const service = new MessageService({ connection, registry, modelNames });
      const [message] = await service.createMessage({
        templateCd: 'mongo-custom-model-name-test',
        user: { _id: senderId },
        payload: { toUser: receiverId },
        clientRequestId: 'custom-model-request',
      });

      await expect(
        service.handleAction('mongo-custom-model-name-test', 'approve', { message, user: { _id: receiverId } }),
      ).resolves.toBe('approved');
      const found = await service.findMessage(String(message._id));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(await Message.countDocuments({ _id: message._id })).toBe(0);
      expect(await MessageArchive.countDocuments({ _id: message._id, actionCd: 'approve' })).toBe(1);
      expect(await MessageRequest.countDocuments({ clientRequestId: 'custom-model-request' })).toBe(1);
      expect(found?.constructor).toBe(MessageArchive);
      expect(globalModelSpy).not.toHaveBeenCalled();
    } finally {
      globalModelSpy.mockRestore();
    }
  });

  it('uses the hydrated document connection for schema email recipient lookups', async () => {
    const databaseName = `message_service_email_${new mongoose.Types.ObjectId().toString()}`;
    const connection = await mongoose
      .createConnection(await getMongoReplicaSetUri(), {
        dbName: databaseName,
        autoIndex: true,
      })
      .asPromise();
    fixtures.push({
      connection,
      databaseName,
      registry: new TemplateRegistry(),
      service: undefined as never,
      models: undefined as never,
      close: async () => {
        await connection.dropDatabase();
        await connection.close();
      },
    });

    const userModelName = `Msg07User${new mongoose.Types.ObjectId().toString()}`;
    const User = connection.model(userModelName, new mongoose.Schema({ email: String }));
    const notifier = vi.fn(async () => undefined);
    const Message = connection.model(
      `Msg07EmailMessage${new mongoose.Types.ObjectId().toString()}`,
      buildMessageSchema({ connection, userModelName, emailNotifier: notifier }),
    );
    await Promise.all([User.init(), Message.init()]);
    const receiver = await User.create({ email: 'receiver@example.test' });

    const globalModelSpy = vi.spyOn(mongoose, 'model');
    globalModelSpy.mockImplementation(() => {
      throw new Error('global model registry should not be used');
    });
    try {
      await Message.create({
        templateCd: 'email-custom-connection',
        type: 'notification',
        fromUser: senderId,
        toUser: receiver._id,
        senderContent: { title: 'S', long: 'S', short: 'S' },
        receiverContent: { title: 'Email Title', long: 'Email long body', short: 'Short' },
      });

      expect(notifier).toHaveBeenCalledWith('receiver@example.test', 'Email Title', 'Email long body');
      expect(globalModelSpy).not.toHaveBeenCalled();
    } finally {
      globalModelSpy.mockRestore();
    }
  });

  it('does not send email for a rolled-back transaction write', async () => {
    const { connection, User, Message, notifier } = await emailFixture();
    const receiver = await User.create({ email: 'receiver@example.test' });
    const session = await connection.startSession();

    try {
      await expect(
        session.withTransaction(async () => {
          await Message.create([emailMessageFields(receiver._id)], { session });
          throw new Error('rollback message write');
        }),
      ).rejects.toThrow(/rollback message write/);
    } finally {
      await session.endSession();
    }

    expect(notifier).not.toHaveBeenCalled();
    expect(await Message.countDocuments()).toBe(0);
  });

  it('sends best-effort email after a committed non-transactional create', async () => {
    const { User, Message, notifier } = await emailFixture();
    const receiver = await User.create({ email: 'receiver@example.test' });

    await Message.create(emailMessageFields(receiver._id, ' Email Title '));

    expect(notifier).toHaveBeenCalledTimes(1);
    expect(notifier).toHaveBeenCalledWith('receiver@example.test', 'Email Title', 'Email long body');
  });

  it('reports recipient lookup and notifier failures without rejecting committed message creates', async () => {
    const lookupError = new Error('lookup unavailable');
    const lookupFailures: EmailDeliveryFailureEvent[] = [];
    const throwingUserSchema = new mongoose.Schema({ email: String });
    throwingUserSchema.pre('findOne', function failLookup() {
      throw lookupError;
    });
    const lookupFixture = await emailFixture({
      userSchema: throwingUserSchema,
      onEmailDeliveryFailure: (event) => lookupFailures.push(event),
    });

    await expect(
      lookupFixture.Message.create(emailMessageFields(new mongoose.Types.ObjectId())),
    ).resolves.toBeDefined();
    expect(lookupFixture.notifier).not.toHaveBeenCalled();
    expect(lookupFailures).toHaveLength(1);
    expect(lookupFailures[0]).toMatchObject({ stage: 'recipientLookup', error: lookupError, title: 'Email Title' });

    const notifierError = new Error('notifier unavailable');
    const notifierFailures: EmailDeliveryFailureEvent[] = [];
    const notifier = vi.fn(async () => {
      throw notifierError;
    });
    const notifierFixture = await emailFixture({
      emailNotifier: notifier,
      onEmailDeliveryFailure: (event) => notifierFailures.push(event),
    });
    const receiver = await notifierFixture.User.create({ email: 'receiver@example.test' });

    await expect(notifierFixture.Message.create(emailMessageFields(receiver._id))).resolves.toBeDefined();
    expect(notifier).toHaveBeenCalledTimes(1);
    expect(notifierFailures).toHaveLength(1);
    expect(notifierFailures[0]).toMatchObject({ stage: 'notifier', error: notifierError, title: 'Email Title' });
  });

  it('normalizes email exclusions and rendered titles with trim and case-insensitive comparison', async () => {
    const { User, Message, notifier } = await emailFixture({ emailNotificationExclusions: [' email title '] });
    const receiver = await User.create({ email: 'receiver@example.test' });

    await Message.create(emailMessageFields(receiver._id, ' Email Title '));

    expect(notifier).not.toHaveBeenCalled();
  });

  it('does not resend email when an existing message is updated', async () => {
    const { User, Message, notifier } = await emailFixture();
    const receiver = await User.create({ email: 'receiver@example.test' });
    const message = await Message.create(emailMessageFields(receiver._id));

    message.set('receiverContent.title', 'Updated Email Title');
    await message.save();

    expect(notifier).toHaveBeenCalledTimes(1);
    expect(notifier).toHaveBeenCalledWith('receiver@example.test', 'Email Title', 'Email long body');
  });

  it('throws a clear selected-connection error when the configured archive model is missing', async () => {
    const databaseName = `message_service_missing_${new mongoose.Types.ObjectId().toString()}`;
    const connection = await mongoose
      .createConnection(await getMongoReplicaSetUri(), {
        dbName: databaseName,
        autoIndex: true,
      })
      .asPromise();
    fixtures.push({
      connection,
      databaseName,
      registry: new TemplateRegistry(),
      service: undefined as never,
      models: undefined as never,
      close: async () => {
        await connection.dropDatabase();
        await connection.close();
      },
    });

    const modelNames = {
      active: `Msg07MissingActive${new mongoose.Types.ObjectId().toString()}`,
      archive: `Msg07MissingArchive${new mongoose.Types.ObjectId().toString()}`,
      request: `Msg07MissingRequest${new mongoose.Types.ObjectId().toString()}`,
      user: `Msg07MissingUser${new mongoose.Types.ObjectId().toString()}`,
    };
    const Message = connection.model(modelNames.active, buildMessageSchema({ archiveModelName: modelNames.archive }));
    await Message.init();

    const service = new MessageService({ connection, modelNames });
    await expect(service.findMessage(new mongoose.Types.ObjectId().toString())).rejects.toMatchObject({
      name: 'MessageModelResolutionError',
      role: 'archive',
      modelName: modelNames.archive,
      connectionName: `Mongoose connection "${connection.name}"`,
    } satisfies Partial<MessageModelResolutionError>);
  });

  it('allows only one concurrent action claim across competing actions', async () => {
    const barriers = createMessageServiceBarriers();
    const approveHandler = vi.fn(async () => 'approved');
    const rejectHandler = vi.fn(async () => 'rejected');
    const actionTemplate: MessageTemplate = {
      ...roleTemplate,
      templateCd: 'mongo-action-claim-test',
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
    const { service, models } = await fixture({ templates: [actionTemplate], barriers });
    const [message] = await service.createMessage({
      templateCd: actionTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId },
    });

    const approve = service.handleAction(actionTemplate.templateCd, 'approve', {
      message,
      user: { _id: receiverId },
    });
    await barriers.actionClaimed.reached;

    await expect(
      service.handleAction(actionTemplate.templateCd, 'reject', {
        message,
        user: { _id: receiverId },
      }),
    ).rejects.toBeInstanceOf(ActionConflictError);

    barriers.actionClaimed.release();
    barriers.archiveCommitted.release();
    await expect(approve).resolves.toBe('approved');

    expect(approveHandler).toHaveBeenCalledTimes(1);
    expect(rejectHandler).not.toHaveBeenCalled();
    expect(await models.Message.countDocuments({ _id: message._id })).toBe(0);
    expect(await models.MessageArchive.countDocuments({ _id: message._id, actionCd: 'approve' })).toBe(1);
  });

  it('rolls back archive insertion when active deletion cannot commit in the same transaction', async () => {
    const actionTemplate: MessageTemplate = {
      ...roleTemplate,
      templateCd: 'mongo-action-archive-rollback-test',
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'success',
          sender: false,
          receiver: true,
          runHandler: async ({ message, getModel }) => {
            await getModel('Message').updateOne({ _id: message._id }, { $set: { actionState: 'active' } });
            return 'approved';
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

    await expect(
      service.handleAction(actionTemplate.templateCd, 'approve', {
        message,
        user: { _id: receiverId },
      }),
    ).rejects.toBeInstanceOf(ActionConflictError);

    expect(await models.MessageArchive.countDocuments({ _id: message._id })).toBe(0);
    expect(await models.Message.countDocuments({ _id: message._id })).toBe(1);
  });

  it('keeps a committed action archived when sender notification fails and does not rerun on retry', async () => {
    const handler = vi.fn(async ({ actionAttemptId }) => ({ actionAttemptId }));
    const actionTemplate: MessageTemplate = {
      ...roleTemplate,
      templateCd: 'mongo-action-notification-failure-test',
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'success',
          sender: false,
          receiver: true,
          senderNotification: async () => {
            throw new Error('notification unavailable');
          },
          runHandler: handler,
        },
      ],
    };
    const { service, models } = await fixture({ templates: [actionTemplate] });
    const [message] = await service.createMessage({
      templateCd: actionTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId },
    });

    await expect(
      service.handleAction(actionTemplate.templateCd, 'approve', {
        message,
        user: { _id: receiverId },
      }),
    ).rejects.toBeInstanceOf(ActionNotificationPendingError);

    const archived = (await models.MessageArchive.findById(message._id)) as IMessage | null;
    expect(await models.Message.countDocuments({ _id: message._id })).toBe(0);
    expect(archived).toMatchObject({ actionCd: 'approve', actionNotificationState: 'failed' });
    expect(handler).toHaveBeenCalledTimes(1);

    await expect(
      service.handleAction(actionTemplate.templateCd, 'approve', {
        message: archived as never,
        user: { _id: receiverId },
      }),
    ).rejects.toBeInstanceOf(ActionNotificationPendingError);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
