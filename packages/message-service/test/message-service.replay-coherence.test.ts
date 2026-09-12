import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMongoMessageServiceFixture, type MongoMessageServiceFixture } from './support/mongodb-fixture';
import { ClientRequestInconsistentStateError, MessageService } from '../src/message-service';
import { MESSAGE_ARCHIVE_MODEL_NAME, MESSAGE_MODEL_NAME, MESSAGE_REQUEST_MODEL_NAME } from '../src/schemas/base';
import type { MessageTemplate } from '../src/types/template';

const senderId = new mongoose.Types.ObjectId();
const receiverId = new mongoose.Types.ObjectId();

const baseTemplate: MessageTemplate = {
  templateCd: 'replay-coherence-test',
  type: 'request',
  description: 'MSGF-06 replay coherence',
  senderContent: { title: 'Sender', long: 'Sender long', short: 'Sender short' },
  receiverContent: { title: 'Receiver', long: 'Receiver long', short: 'Receiver short' },
  uiTemplate: 'default-message',
  prepareMessage: async ({ user, payload }) => ({
    fromUser: user._id,
    toUser: (payload.toUser as mongoose.Types.ObjectId | undefined) ?? receiverId,
    payload,
  }),
  actions: [],
};

const batchTemplate: MessageTemplate = {
  ...baseTemplate,
  templateCd: 'replay-coherence-batch-test',
  prepareMessage: async ({ user }) => [
    { fromUser: user._id, toUser: receiverId, payload: { item: 'one' } },
    { fromUser: user._id, toUser: receiverId, payload: { item: 'two' } },
  ],
};

const actionBatchTemplate: MessageTemplate = {
  ...batchTemplate,
  templateCd: 'replay-coherence-action-batch-test',
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

function scopeOf(templateCd: string, clientRequestId: string) {
  return { clientRequestId, clientRequestOwnerId: String(senderId), templateCd };
}

function indexesOf(docs: Array<{ clientRequestItemIndex?: unknown }>) {
  return docs.map((doc) => doc.clientRequestItemIndex).sort();
}

describe('MessageService idempotent replay coherence (MSGF-06)', () => {
  const fixtures: MongoMessageServiceFixture[] = [];

  async function fixture(options: Parameters<typeof createMongoMessageServiceFixture>[0] = {}) {
    const created = await createMongoMessageServiceFixture(options);
    fixtures.push(created);
    return created;
  }

  afterEach(async () => {
    while (fixtures.length > 0) {
      const current = fixtures.pop();
      if (current) await current.close();
    }
  });

  it('replays with some batch items archived without rerunning preparation', async () => {
    const prepareMessage = vi.fn(batchTemplate.prepareMessage);
    const { service, models } = await fixture({
      templates: [{ ...actionBatchTemplate, prepareMessage }],
    });
    const params = {
      templateCd: actionBatchTemplate.templateCd,
      user: { _id: senderId },
      clientRequestId: 'replay-some-archived',
    };

    const first = await service.createMessage(params);
    expect(first).toHaveLength(2);
    expect(prepareMessage).toHaveBeenCalledTimes(1);

    await service.handleAction(actionBatchTemplate.templateCd, 'approve', {
      message: first[0] as never,
      user: { _id: receiverId },
    });

    expect(await models.Message.countDocuments(scopeOf(actionBatchTemplate.templateCd, 'replay-some-archived'))).toBe(
      1,
    );
    expect(
      await models.MessageArchive.countDocuments(scopeOf(actionBatchTemplate.templateCd, 'replay-some-archived')),
    ).toBe(1);

    const replay = await service.createMessage(params);
    expect(prepareMessage).toHaveBeenCalledTimes(1);
    expect(replay).toHaveLength(2);
    expect(indexesOf(replay)).toEqual([0, 1]);
    // Mixed live state: exactly one active record and one archive record, no fabricated methods.
    expect(replay.filter((doc) => 'archivedAt' in doc)).toHaveLength(1);
    expect(replay.filter((doc) => !('archivedAt' in doc))).toHaveLength(1);
    for (const doc of replay) {
      if ('archivedAt' in doc) {
        expect((doc as unknown as Record<string, unknown>).archive).toBeUndefined();
      }
    }
    expect(await models.Message.countDocuments(scopeOf(actionBatchTemplate.templateCd, 'replay-some-archived'))).toBe(
      1,
    );
    expect(
      await models.MessageArchive.countDocuments(scopeOf(actionBatchTemplate.templateCd, 'replay-some-archived')),
    ).toBe(1);
  });

  it('replays with all batch items archived and never creates payment sessions on replay', async () => {
    let sessions = 0;
    const paymentProvider = {
      createSession: vi.fn(async () => `session-${(sessions += 1)}`),
      expireSession: vi.fn(async () => undefined),
      refundPayment: vi.fn(async () => undefined),
    };
    const paidTemplate: MessageTemplate = {
      ...actionBatchTemplate,
      templateCd: 'replay-coherence-paid-batch-test',
      paymentCd: 'paid-test',
    };
    const { service, models } = await fixture({ templates: [paidTemplate], serviceOptions: { paymentProvider } });
    const params = {
      templateCd: paidTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId },
      clientRequestId: 'replay-all-archived-paid',
    };

    const first = await service.createMessage(params);
    expect(first).toHaveLength(2);
    expect(paymentProvider.createSession).toHaveBeenCalledTimes(2);

    for (const message of first) {
      await service.handleAction(paidTemplate.templateCd, 'approve', {
        message: message as never,
        user: { _id: receiverId },
      });
    }
    expect(await models.Message.countDocuments(scopeOf(paidTemplate.templateCd, 'replay-all-archived-paid'))).toBe(0);
    expect(
      await models.MessageArchive.countDocuments(scopeOf(paidTemplate.templateCd, 'replay-all-archived-paid')),
    ).toBe(2);

    const replay = await service.createMessage(params);
    expect(replay).toHaveLength(2);
    expect(indexesOf(replay)).toEqual([0, 1]);
    expect(replay.every((doc) => 'archivedAt' in doc)).toBe(true);
    expect(paymentProvider.createSession).toHaveBeenCalledTimes(2);
    expect(paymentProvider.expireSession).not.toHaveBeenCalled();
  });

  it('does not false-corrupt when a commit lands between the reservation read and the message reads', async () => {
    const { service, models, registry, connection } = await fixture({ templates: [batchTemplate] });
    const templateCd = batchTemplate.templateCd;
    const clientRequestId = 'replay-commit-between-reads';
    const scope = scopeOf(templateCd, clientRequestId);

    // Real completed state, inserted exactly once via the untouched models when
    // the replay's first reservation read observes the pre-commit world.
    const RealMessage = models.Message;
    const RealMessageRequest = models.MessageRequest;
    let injected = false;
    const injectCommit = async () => {
      if (injected) return;
      injected = true;
      await RealMessageRequest.create({
        ...scope,
        state: 'completed',
        itemCount: 2,
        completedAt: new Date(),
      });
      await RealMessage.create([
        {
          ...scope,
          clientRequestItemIndex: 0,
          type: 'notification',
          fromUser: senderId,
          toUser: receiverId,
          senderContent: { title: 'S', long: 'S', short: 'S' },
          receiverContent: { title: 'R', long: 'R', short: 'R' },
        },
        {
          ...scope,
          clientRequestItemIndex: 1,
          type: 'notification',
          fromUser: senderId,
          toUser: receiverId,
          senderContent: { title: 'S', long: 'S', short: 'S' },
          receiverContent: { title: 'R', long: 'R', short: 'R' },
        },
      ]);
    };

    // Patch at the getModel layer: first reservation read returns null
    // (pre-commit), the commit lands, then message reads + re-read succeed.
    let reservationReads = 0;
    const getModel = (name: string) => {
      if (name === MESSAGE_REQUEST_MODEL_NAME) {
        const real = connection.model(MESSAGE_REQUEST_MODEL_NAME);
        return new Proxy(real, {
          get(target, property, receiver) {
            if (property === 'findOne') {
              return async (...args: never[]) => {
                reservationReads += 1;
                if (reservationReads === 1) {
                  await injectCommit();
                  return null;
                }
                return (real.findOne as (...a: never[]) => unknown)(...args);
              };
            }
            return Reflect.get(target, property, receiver);
          },
        }) as unknown as mongoose.Model<unknown>;
      }
      if (name === MESSAGE_MODEL_NAME) return connection.model(MESSAGE_MODEL_NAME);
      if (name === MESSAGE_ARCHIVE_MODEL_NAME) return connection.model(MESSAGE_ARCHIVE_MODEL_NAME);
      throw new Error(`Unknown model: ${name}`);
    };

    const racing = new MessageService({ getModel, registry });
    const replay = await racing.createMessage({
      templateCd,
      user: { _id: senderId },
      clientRequestId,
    });
    expect(reservationReads).toBeGreaterThanOrEqual(2);
    expect(replay).toHaveLength(2);
    expect(indexesOf(replay)).toEqual([0, 1]);
    void service;
  });

  it('deduplicates an item visible in both active and archive snapshots instead of double-counting', async () => {
    const { service, models } = await fixture({ templates: [baseTemplate] });
    const templateCd = baseTemplate.templateCd;
    const clientRequestId = 'replay-double-count';
    const scope = scopeOf(templateCd, clientRequestId);
    await models.MessageRequest.create({ ...scope, state: 'completed', itemCount: 2, completedAt: new Date() });
    const sharedId = new mongoose.Types.ObjectId();
    const itemBody = {
      ...scope,
      type: 'notification',
      fromUser: senderId,
      toUser: receiverId,
      senderContent: { title: 'S', long: 'S', short: 'S' },
      receiverContent: { title: 'R', long: 'R', short: 'R' },
    };
    // In-transit duplicate: same _id present in both collections (create ran,
    // delete has not), plus the second item. A naive active+archive length
    // check would see 3 docs for itemCount 2.
    await models.Message.create([
      { _id: sharedId, ...itemBody, clientRequestItemIndex: 0 },
      { ...itemBody, clientRequestItemIndex: 1 },
    ]);
    await models.MessageArchive.create({
      _id: sharedId,
      ...itemBody,
      clientRequestItemIndex: 0,
      actionCd: 'approve',
      archivedBy: receiverId,
    });

    const replay = await service.createMessage({
      templateCd,
      user: { _id: senderId },
      clientRequestId,
    });
    expect(replay).toHaveLength(2);
    expect(indexesOf(replay)).toEqual([0, 1]);
  });

  it('succeeds during concurrent archive movement and concurrent retries with one committed batch', async () => {
    const prepareMessage = vi.fn(batchTemplate.prepareMessage);
    const { service, models } = await fixture({
      templates: [{ ...actionBatchTemplate, prepareMessage }],
    });
    const params = {
      templateCd: actionBatchTemplate.templateCd,
      user: { _id: senderId },
      clientRequestId: 'replay-concurrent-movement',
    };
    const first = await service.createMessage(params);
    expect(first).toHaveLength(2);

    const archiveOne = service.handleAction(actionBatchTemplate.templateCd, 'approve', {
      message: first[0] as never,
      user: { _id: receiverId },
    });
    const replays = await Promise.all([
      archiveOne.then(() => service.createMessage(params)),
      service.createMessage(params),
      service.createMessage(params),
    ]);
    for (const replay of replays) {
      expect(replay).toHaveLength(2);
      expect(indexesOf(replay)).toEqual([0, 1]);
    }
    expect(prepareMessage).toHaveBeenCalledTimes(1);
    const total =
      (await models.Message.countDocuments(scopeOf(actionBatchTemplate.templateCd, params.clientRequestId))) +
      (await models.MessageArchive.countDocuments(scopeOf(actionBatchTemplate.templateCd, params.clientRequestId)));
    expect(total).toBe(2);
  });

  it('produces one committed batch under concurrent retries', async () => {
    const prepareMessage = vi.fn(batchTemplate.prepareMessage);
    const { service, models } = await fixture({
      templates: [{ ...batchTemplate, prepareMessage }],
      serviceOptions: { clientRequestWaitMs: 10_000, clientRequestPollMs: 5 },
    });
    const params = {
      templateCd: batchTemplate.templateCd,
      user: { _id: senderId },
      clientRequestId: 'replay-concurrent-retries',
    };
    const results = await Promise.all([
      service.createMessage(params),
      service.createMessage(params),
      service.createMessage(params),
    ]);
    const firstIds = results[0].map((doc) => String((doc as unknown as { _id: unknown })._id));
    for (const replay of results) {
      expect(replay.map((doc) => String((doc as unknown as { _id: unknown })._id))).toEqual(firstIds);
    }
    expect(prepareMessage).toHaveBeenCalledTimes(1);
    expect(await models.Message.countDocuments(scopeOf(batchTemplate.templateCd, params.clientRequestId))).toBe(2);
  });

  it('keeps cross-owner and cross-template scope isolation', async () => {
    const { service } = await fixture({ templates: [batchTemplate] });
    const otherSender = new mongoose.Types.ObjectId();
    const otherTemplate: MessageTemplate = { ...batchTemplate, templateCd: 'replay-coherence-other-template' };
    const { service: multiService } = await fixture({ templates: [batchTemplate, otherTemplate] });
    void service;

    const first = await multiService.createMessage({
      templateCd: batchTemplate.templateCd,
      user: { _id: senderId },
      clientRequestId: 'replay-isolation',
    });
    const otherOwner = await multiService.createMessage({
      templateCd: batchTemplate.templateCd,
      user: { _id: otherSender },
      clientRequestId: 'replay-isolation',
    });
    const otherTemplateReplay = await multiService.createMessage({
      templateCd: otherTemplate.templateCd,
      user: { _id: senderId },
      clientRequestId: 'replay-isolation',
    });
    expect(otherOwner.map((doc) => String((doc as unknown as { _id: unknown })._id))).not.toEqual(
      first.map((doc) => String((doc as unknown as { _id: unknown })._id)),
    );
    expect(otherTemplateReplay.map((doc) => String((doc as unknown as { _id: unknown })._id))).not.toEqual(
      first.map((doc) => String((doc as unknown as { _id: unknown })._id)),
    );
  });

  it('still reports genuinely corrupt states instead of partial replays', async () => {
    const { service, models } = await fixture({ templates: [baseTemplate] });
    const templateCd = baseTemplate.templateCd;

    // Missing index 1 across both collections (stable after reconciliation).
    const missingScope = scopeOf(templateCd, 'replay-corrupt-missing');
    await models.MessageRequest.create({ ...missingScope, state: 'completed', itemCount: 2, completedAt: new Date() });
    await models.Message.create({
      ...missingScope,
      clientRequestItemIndex: 0,
      type: 'notification',
      fromUser: senderId,
      toUser: receiverId,
      senderContent: { title: 'S', long: 'S', short: 'S' },
      receiverContent: { title: 'R', long: 'R', short: 'R' },
    });
    await expect(
      service.createMessage({ templateCd, user: { _id: senderId }, clientRequestId: 'replay-corrupt-missing' }),
    ).rejects.toBeInstanceOf(ClientRequestInconsistentStateError);

    // Duplicate index 0 split across active and archive (merged set invalid).
    const dupScope = scopeOf(templateCd, 'replay-corrupt-duplicate');
    await models.MessageRequest.create({ ...dupScope, state: 'completed', itemCount: 2, completedAt: new Date() });
    await models.Message.create({
      ...dupScope,
      clientRequestItemIndex: 0,
      type: 'notification',
      fromUser: senderId,
      toUser: receiverId,
      senderContent: { title: 'S', long: 'S', short: 'S' },
      receiverContent: { title: 'R', long: 'R', short: 'R' },
    });
    await models.MessageArchive.create({
      ...dupScope,
      clientRequestItemIndex: 0,
      type: 'notification',
      fromUser: senderId,
      toUser: receiverId,
      senderContent: { title: 'S', long: 'S', short: 'S' },
      receiverContent: { title: 'R', long: 'R', short: 'R' },
      actionCd: 'approve',
      archivedBy: receiverId,
    });
    await expect(
      service.createMessage({ templateCd, user: { _id: senderId }, clientRequestId: 'replay-corrupt-duplicate' }),
    ).rejects.toBeInstanceOf(ClientRequestInconsistentStateError);

    // Zero-item reservation with a visible message.
    const zeroScope = scopeOf(templateCd, 'replay-corrupt-zero');
    await models.MessageRequest.create({ ...zeroScope, state: 'completed', itemCount: 0, completedAt: new Date() });
    await models.Message.create({
      ...zeroScope,
      clientRequestItemIndex: 0,
      type: 'notification',
      fromUser: senderId,
      toUser: receiverId,
      senderContent: { title: 'S', long: 'S', short: 'S' },
      receiverContent: { title: 'R', long: 'R', short: 'R' },
    });
    await expect(
      service.createMessage({ templateCd, user: { _id: senderId }, clientRequestId: 'replay-corrupt-zero' }),
    ).rejects.toBeInstanceOf(ClientRequestInconsistentStateError);

    // Messages with no reservation at all (stable double miss).
    await models.Message.create({
      ...scopeOf(templateCd, 'replay-corrupt-orphan'),
      clientRequestItemIndex: 0,
      type: 'notification',
      fromUser: senderId,
      toUser: receiverId,
      senderContent: { title: 'S', long: 'S', short: 'S' },
      receiverContent: { title: 'R', long: 'R', short: 'R' },
    });
    await expect(
      service.createMessage({ templateCd, user: { _id: senderId }, clientRequestId: 'replay-corrupt-orphan' }),
    ).rejects.toBeInstanceOf(ClientRequestInconsistentStateError);
  });

  it('preserves completed zero-item replay across both collections', async () => {
    const emptyTemplate: MessageTemplate = {
      ...baseTemplate,
      templateCd: 'replay-coherence-empty-test',
      prepareMessage: async () => null,
    };
    const { service } = await fixture({ templates: [emptyTemplate] });
    await expect(
      service.createMessage({
        templateCd: emptyTemplate.templateCd,
        user: { _id: senderId },
        clientRequestId: 'replay-empty',
      }),
    ).resolves.toEqual([]);
    await expect(
      service.createMessage({
        templateCd: emptyTemplate.templateCd,
        user: { _id: senderId },
        clientRequestId: 'replay-empty',
      }),
    ).resolves.toEqual([]);
  });

  it('backs scoped archive replay lookups with indexes and enforces scoped uniqueness', async () => {
    const { models } = await fixture({ templates: [baseTemplate] });
    const scope = scopeOf(baseTemplate.templateCd, 'replay-index-probe');

    // The new archive indexes exist on the collection with the same scoped
    // shapes as the active collection.
    const collectionIndexes = await models.MessageArchive.collection.listIndexes().toArray();
    const indexFields = collectionIndexes.map((index: { key: unknown }) => index.key);
    expect(indexFields).toContainEqual({
      clientRequestOwnerId: 1,
      templateCd: 1,
      clientRequestId: 1,
      createdAt: 1,
      _id: 1,
    });
    expect(indexFields).toContainEqual({
      clientRequestOwnerId: 1,
      templateCd: 1,
      clientRequestId: 1,
      clientRequestItemIndex: 1,
    });

    // The scoped unique index serves the replay query shape (forced via hint)
    // without a collection scan. Unforced, this server version plans COLLSCAN
    // for plain-equality queries against `$type`-partial indexes — verified
    // identical on the pre-existing active collection — so this asserts the
    // index can serve the shape, not that the planner auto-selects it on tiny
    // data.
    const explain = await models.MessageArchive.find(scope)
      .sort({ clientRequestItemIndex: 1, _id: 1 })
      .limit(5)
      .hint({ clientRequestOwnerId: 1, templateCd: 1, clientRequestId: 1, clientRequestItemIndex: 1 })
      .explain('executionStats');
    const seen: string[] = [];
    const stages: string[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const current = node as Record<string, unknown>;
      if (typeof current.indexName === 'string') seen.push(current.indexName);
      if (typeof current.stage === 'string') stages.push(current.stage);
      for (const value of Object.values(current)) {
        if (Array.isArray(value)) value.forEach(walk);
        else walk(value);
      }
    };
    walk(explain);
    expect(seen).toContain('clientRequestOwnerId_1_templateCd_1_clientRequestId_1_clientRequestItemIndex_1');
    expect(stages).not.toContain('COLLSCAN');

    // The unique scoped index rejects duplicate archived item indexes.
    const uniqueScope = scopeOf(baseTemplate.templateCd, 'replay-index-unique-probe');
    const body = {
      ...uniqueScope,
      type: 'notification',
      fromUser: senderId,
      toUser: receiverId,
      senderContent: { title: 'S', long: 'S', short: 'S' },
      receiverContent: { title: 'R', long: 'R', short: 'R' },
      actionCd: 'approve',
      archivedBy: receiverId,
    };
    await models.MessageArchive.create({ ...body, clientRequestItemIndex: 0 });
    await expect(models.MessageArchive.create({ ...body, clientRequestItemIndex: 0 })).rejects.toMatchObject({
      code: 11000,
    });
    await expect(models.MessageArchive.create({ ...body, clientRequestItemIndex: 1 })).resolves.toBeDefined();
  });
});
