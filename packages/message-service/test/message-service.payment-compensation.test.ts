import mongoose from 'mongoose';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMongoMessageServiceFixture,
  stopMongoReplicaSet,
  type MongoMessageServiceFixture,
} from './support/mongodb-fixture';
import {
  ClientRequestFailedError,
  MessageModelResolutionError,
  MessageService,
  MessageTransactionRequiredError,
  PaymentSessionCompensationAggregateError,
  PaymentSessionCompensationError,
} from '../src/message-service';
import { MESSAGE_ARCHIVE_MODEL_NAME, MESSAGE_MODEL_NAME, MESSAGE_REQUEST_MODEL_NAME } from '../src/schemas/base';
import type { MessageTemplate } from '../src/types/template';

const senderId = new mongoose.Types.ObjectId();
const receiverId = new mongoose.Types.ObjectId();

function baseTemplate(overrides: Partial<MessageTemplate> & { templateCd: string }): MessageTemplate {
  return {
    type: 'request',
    description: 'payment compensation test',
    senderContent: { title: 'S', long: 'S', short: 'S' },
    receiverContent: { title: 'R {{name}}', long: 'R', short: 'R' },
    uiTemplate: 'default-message',
    prepareMessage: async ({ user }) => ({ fromUser: user._id, toUser: receiverId, payload: {} }),
    actions: [],
    ...overrides,
  };
}

describe('MessageService payment compensation (MSGF-05)', () => {
  const fixtures: MongoMessageServiceFixture[] = [];

  async function fixture(options: Parameters<typeof createMongoMessageServiceFixture>[0] = {}) {
    const created = await createMongoMessageServiceFixture(options);
    fixtures.push(created);
    return created;
  }

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map((created) => created.close()));
  });

  afterAll(async () => {
    await stopMongoReplicaSet();
  });

  it('compensates the first session when the second item provider call throws', async () => {
    let calls = 0;
    const paymentProvider = {
      createSession: vi.fn(async () => {
        calls += 1;
        if (calls === 1) return 'session-first-throw';
        throw new Error('provider unavailable on item two');
      }),
      expireSession: vi.fn(async () => undefined),
      refundPayment: vi.fn(async () => undefined),
    };
    const template = baseTemplate({
      templateCd: 'pay-second-throws',
      paymentCd: 'pay',
      prepareMessage: async ({ user }) => [
        { fromUser: user._id, toUser: receiverId, payload: { slot: 1 } },
        { fromUser: user._id, toUser: receiverId, payload: { slot: 2 } },
      ],
    });
    const { service, models } = await fixture({ templates: [template], serviceOptions: { paymentProvider } });

    await expect(
      service.createMessage({
        templateCd: template.templateCd,
        user: { _id: senderId },
        clientRequestId: 'second-throws',
      }),
    ).rejects.toThrow('provider unavailable on item two');
    expect(paymentProvider.createSession).toHaveBeenCalledTimes(2);
    expect(paymentProvider.expireSession).toHaveBeenCalledTimes(1);
    expect(paymentProvider.expireSession).toHaveBeenCalledWith('session-first-throw');
    expect(await models.Message.countDocuments({ clientRequestId: 'second-throws' })).toBe(0);
  });

  it('compensates the first session when the second item returns a null session', async () => {
    let calls = 0;
    const paymentProvider = {
      createSession: vi.fn(async () => {
        calls += 1;
        return calls === 1 ? 'session-first-null' : null;
      }),
      expireSession: vi.fn(async () => undefined),
      refundPayment: vi.fn(async () => undefined),
    };
    const template = baseTemplate({
      templateCd: 'pay-second-null',
      paymentCd: 'pay',
      prepareMessage: async ({ user }) => [
        { fromUser: user._id, toUser: receiverId, payload: { slot: 1 } },
        { fromUser: user._id, toUser: receiverId, payload: { slot: 2 } },
      ],
    });
    const { service, models } = await fixture({ templates: [template], serviceOptions: { paymentProvider } });

    await expect(
      service.createMessage({
        templateCd: template.templateCd,
        user: { _id: senderId },
        clientRequestId: 'second-null',
      }),
    ).rejects.toThrow('payment session creation failed');
    expect(paymentProvider.expireSession).toHaveBeenCalledTimes(1);
    expect(paymentProvider.expireSession).toHaveBeenCalledWith('session-first-null');
    expect(await models.Message.countDocuments({ clientRequestId: 'second-null' })).toBe(0);
  });

  it('compensates the first session when the second item render fails', async () => {
    let sessions = 0;
    const paymentProvider = {
      createSession: vi.fn(async () => `render-session-${++sessions}`),
      expireSession: vi.fn(async () => undefined),
      refundPayment: vi.fn(async () => undefined),
    };
    const template = baseTemplate({
      templateCd: 'pay-second-render',
      paymentCd: 'pay',
      senderContent: { title: 'S {{name}}', long: 'S', short: 'S' },
      prepareMessage: async ({ user }) => [
        { fromUser: user._id, toUser: receiverId, templateData: { name: 'ok' }, payload: {} },
        {
          fromUser: user._id,
          toUser: receiverId,
          templateData: {
            get name(): string {
              throw new Error('render boom on item two');
            },
          },
          payload: {},
        },
      ],
    });
    const { service, models } = await fixture({ templates: [template], serviceOptions: { paymentProvider } });

    await expect(
      service.createMessage({
        templateCd: template.templateCd,
        user: { _id: senderId },
        clientRequestId: 'second-render',
      }),
    ).rejects.toThrow('render boom on item two');
    expect(paymentProvider.createSession).toHaveBeenCalledTimes(2);
    // The failing item's own session is compensated inside buildMessageDocument
    // and the prior item's session by the batch catch: both attempted.
    expect(paymentProvider.expireSession).toHaveBeenCalledTimes(2);
    expect(paymentProvider.expireSession).toHaveBeenCalledWith('render-session-1');
    expect(paymentProvider.expireSession).toHaveBeenCalledWith('render-session-2');
    expect(await models.Message.countDocuments({ clientRequestId: 'second-render' })).toBe(0);
  });

  it('compensates sessions when model resolution fails before the transaction', async () => {
    let resolverSessions = 0;
    const paymentProvider = {
      createSession: vi.fn(async () => `session-resolver-${++resolverSessions}`),
      expireSession: vi.fn(async () => undefined),
      refundPayment: vi.fn(async () => undefined),
    };
    // Fail active-model resolution only after preparation ran, so the
    // replay/lease reads succeed, two sessions are created, and the failure
    // under test is the one inside persistPreparedBatchTransaction.
    let preparationDone = false;
    const template = baseTemplate({
      templateCd: 'pay-resolver-fail',
      paymentCd: 'pay',
      prepareMessage: async ({ user }) => {
        preparationDone = true;
        return [
          { fromUser: user._id, toUser: receiverId, payload: { a: 1 } },
          { fromUser: user._id, toUser: receiverId, payload: { a: 2 } },
        ];
      },
    });
    const created = await fixture({ templates: [template] });
    const failingGetModel = (name: string) => {
      if (preparationDone && name === MESSAGE_MODEL_NAME) throw new Error('resolver boom');
      if (name === MESSAGE_MODEL_NAME) return created.models.Message;
      if (name === MESSAGE_ARCHIVE_MODEL_NAME) return created.models.MessageArchive;
      if (name === MESSAGE_REQUEST_MODEL_NAME) return created.models.MessageRequest;
      throw new Error(`unknown model ${name}`);
    };
    const service = new MessageService({ getModel: failingGetModel, registry: created.registry, paymentProvider });

    const error = await service
      .createMessage({ templateCd: template.templateCd, user: { _id: senderId }, clientRequestId: 'resolver-fail' })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(MessageModelResolutionError);
    expect(paymentProvider.createSession).toHaveBeenCalledTimes(2);
    expect(paymentProvider.expireSession).toHaveBeenCalledTimes(2);
    expect(await created.models.Message.countDocuments({ clientRequestId: 'resolver-fail' })).toBe(0);
  });

  it('compensates sessions when startSession() fails before the transaction', async () => {
    const paymentProvider = {
      createSession: vi.fn(async () => 'session-start'),
      expireSession: vi.fn(async () => undefined),
      refundPayment: vi.fn(async () => undefined),
    };
    const template = baseTemplate({
      templateCd: 'pay-startsession-fail',
      paymentCd: 'pay',
    });
    const created = await fixture({ templates: [template], serviceOptions: { paymentProvider } });
    const db = created.models.Message.db;
    if (!db?.startSession) throw new Error('fixture Message model has no startSession');
    vi.spyOn(db, 'startSession').mockRejectedValueOnce(new Error('startSession boom'));

    await expect(
      created.service.createMessage({
        templateCd: template.templateCd,
        user: { _id: senderId },
        clientRequestId: 'startsession-fail',
      }),
    ).rejects.toThrow('startSession boom');
    expect(paymentProvider.expireSession).toHaveBeenCalledTimes(1);
    expect(paymentProvider.expireSession).toHaveBeenCalledWith('session-start');
    expect(await created.models.Message.countDocuments({ clientRequestId: 'startsession-fail' })).toBe(0);
  });

  it('attempts every cleanup when the first expiration fails (aggregate preserves original)', async () => {
    const original = new Error('write failed');
    let sessions = 0;
    const expireError = new Error('expire session-1 boom');
    const paymentProvider = {
      createSession: vi.fn(async () => `agg-session-${++sessions}`),
      expireSession: vi.fn(async (id: string) => {
        if (id === 'agg-session-1') throw expireError;
      }),
      refundPayment: vi.fn(async () => undefined),
    };
    const onPaymentCompensationFailure = vi.fn(async () => undefined);
    const template = baseTemplate({
      templateCd: 'pay-agg-first-fails',
      paymentCd: 'pay',
      prepareMessage: async ({ user }) => [
        { fromUser: user._id, toUser: receiverId, payload: { k: 1 } },
        { fromUser: user._id, toUser: receiverId, payload: { k: 2 } },
      ],
    });
    const created = await fixture({
      templates: [template],
      serviceOptions: { paymentProvider, onPaymentCompensationFailure },
    });
    // Force persistence failure inside the transaction.
    const origCreate = created.models.Message.create.bind(created.models.Message);
    vi.spyOn(created.models.Message, 'create').mockImplementationOnce(async () => {
      throw original;
    });
    void origCreate;

    const error = await created.service
      .createMessage({ templateCd: template.templateCd, user: { _id: senderId }, clientRequestId: 'agg-first-fails' })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(paymentProvider.expireSession).toHaveBeenCalledTimes(2);
    expect(paymentProvider.expireSession).toHaveBeenNthCalledWith(1, 'agg-session-1');
    expect(paymentProvider.expireSession).toHaveBeenNthCalledWith(2, 'agg-session-2');
    expect(error).toBeInstanceOf(PaymentSessionCompensationAggregateError);
    expect(error).toBeInstanceOf(PaymentSessionCompensationError);
    const agg = error as PaymentSessionCompensationAggregateError;
    expect(agg.originalError).toBe(original);
    expect(agg.failures).toHaveLength(1);
    expect(agg.failures[0]).toMatchObject({ sessionId: 'agg-session-1' });
    expect(agg.failures[0].compensationError).toBe(expireError);
    expect(onPaymentCompensationFailure).toHaveBeenCalledTimes(1);
    expect(onPaymentCompensationFailure).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'agg-session-1', error: expireError, originalError: original }),
    );
  });

  it('aggregates all failures when every cleanup fails', async () => {
    const original = new Error('write failed both');
    let sessions = 0;
    const firstErr = new Error('expire one boom');
    const secondErr = new Error('expire two boom');
    const paymentProvider = {
      createSession: vi.fn(async () => `both-session-${++sessions}`),
      expireSession: vi.fn(async (id: string) => {
        if (id === 'both-session-1') throw firstErr;
        throw secondErr;
      }),
      refundPayment: vi.fn(async () => undefined),
    };
    const template = baseTemplate({
      templateCd: 'pay-agg-both-fail',
      paymentCd: 'pay',
      prepareMessage: async ({ user }) => [
        { fromUser: user._id, toUser: receiverId, payload: { k: 1 } },
        { fromUser: user._id, toUser: receiverId, payload: { k: 2 } },
      ],
    });
    const created = await fixture({ templates: [template], serviceOptions: { paymentProvider } });
    vi.spyOn(created.models.Message, 'create').mockImplementationOnce(async () => {
      throw original;
    });

    const error = await created.service
      .createMessage({ templateCd: template.templateCd, user: { _id: senderId }, clientRequestId: 'agg-both-fail' })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(paymentProvider.expireSession).toHaveBeenCalledTimes(2);
    expect(error).toBeInstanceOf(PaymentSessionCompensationAggregateError);
    const agg = error as PaymentSessionCompensationAggregateError;
    expect(agg.originalError).toBe(original);
    expect(agg.failures.map((f) => f.sessionId)).toEqual(['both-session-1', 'both-session-2']);
    expect(agg.failures[0].compensationError).toBe(firstErr);
    expect(agg.failures[1].compensationError).toBe(secondErr);
  });

  it('still attempts remaining cleanups when the observer hook fails', async () => {
    const original = new Error('write failed hook');
    let sessions = 0;
    const expireErr = new Error('expire boom hook');
    const hookErr = new Error('observer boom');
    const paymentProvider = {
      createSession: vi.fn(async () => `hook-session-${++sessions}`),
      expireSession: vi.fn(async () => {
        throw expireErr;
      }),
      refundPayment: vi.fn(async () => undefined),
    };
    const onPaymentCompensationFailure = vi.fn(async () => {
      throw hookErr;
    });
    const template = baseTemplate({
      templateCd: 'pay-hook-fails',
      paymentCd: 'pay',
      prepareMessage: async ({ user }) => [
        { fromUser: user._id, toUser: receiverId, payload: { k: 1 } },
        { fromUser: user._id, toUser: receiverId, payload: { k: 2 } },
      ],
    });
    const created = await fixture({
      templates: [template],
      serviceOptions: { paymentProvider, onPaymentCompensationFailure },
    });
    vi.spyOn(created.models.Message, 'create').mockImplementationOnce(async () => {
      throw original;
    });

    const error = await created.service
      .createMessage({ templateCd: template.templateCd, user: { _id: senderId }, clientRequestId: 'hook-fails' })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(paymentProvider.expireSession).toHaveBeenCalledTimes(2);
    expect(onPaymentCompensationFailure).toHaveBeenCalledTimes(2);
    expect(error).toBeInstanceOf(PaymentSessionCompensationAggregateError);
    const agg = error as PaymentSessionCompensationAggregateError;
    expect(agg.originalError).toBe(original);
    expect(agg.failures).toHaveLength(2);
    for (const failure of agg.failures) {
      expect(failure.compensationError).toBe(expireErr);
      expect(failure.hookError).toBe(hookErr);
    }
  });

  it('rolls back the transaction and expires all sessions on persistence failure', async () => {
    let sessions = 0;
    const paymentProvider = {
      createSession: vi.fn(async () => `rollback-session-${++sessions}`),
      expireSession: vi.fn(async () => undefined),
      refundPayment: vi.fn(async () => undefined),
    };
    const template = baseTemplate({
      templateCd: 'pay-rollback',
      paymentCd: 'pay',
      prepareMessage: async ({ user }) => [
        { fromUser: user._id, toUser: receiverId, payload: { dupRollbackKey: 'same' } },
        { fromUser: user._id, toUser: receiverId, payload: { dupRollbackKey: 'same' } },
      ],
    });
    const { service, models } = await fixture({ templates: [template], serviceOptions: { paymentProvider } });
    await models.Message.collection.createIndex({ 'payload.dupRollbackKey': 1 }, { unique: true, sparse: true });

    await expect(
      service.createMessage({ templateCd: template.templateCd, user: { _id: senderId }, clientRequestId: 'rollback' }),
    ).rejects.toMatchObject({ code: 11000 });
    expect(paymentProvider.createSession).toHaveBeenCalledTimes(2);
    expect(paymentProvider.expireSession).toHaveBeenCalledTimes(2);
    expect(await models.Message.countDocuments({ clientRequestId: 'rollback' })).toBe(0);
    // Recorded failure replays as a stable error without new provider work.
    await expect(
      service.createMessage({ templateCd: template.templateCd, user: { _id: senderId }, clientRequestId: 'rollback' }),
    ).rejects.toBeInstanceOf(ClientRequestFailedError);
    expect(paymentProvider.createSession).toHaveBeenCalledTimes(2);
    expect(paymentProvider.expireSession).toHaveBeenCalledTimes(2);
  });

  it('retains committed sessions and replays without new provider work', async () => {
    let sessions = 0;
    const paymentProvider = {
      createSession: vi.fn(async () => `committed-session-${++sessions}`),
      expireSession: vi.fn(async () => undefined),
      refundPayment: vi.fn(async () => undefined),
    };
    const template = baseTemplate({
      templateCd: 'pay-committed-replay',
      paymentCd: 'pay',
      prepareMessage: async ({ user }) => ({ fromUser: user._id, toUser: receiverId, payload: { ok: 1 } }),
    });
    const { service, models } = await fixture({ templates: [template], serviceOptions: { paymentProvider } });

    const first = await service.createMessage({
      templateCd: template.templateCd,
      user: { _id: senderId },
      clientRequestId: 'committed-replay',
    });
    expect(first).toHaveLength(1);
    expect(paymentProvider.createSession).toHaveBeenCalledTimes(1);
    expect(paymentProvider.expireSession).not.toHaveBeenCalled();
    expect(await models.Message.countDocuments({ clientRequestId: 'committed-replay' })).toBe(1);

    const second = await service.createMessage({
      templateCd: template.templateCd,
      user: { _id: senderId },
      clientRequestId: 'committed-replay',
    });
    expect(second.map((d) => String(d._id))).toEqual(first.map((d) => String(d._id)));
    expect(paymentProvider.createSession).toHaveBeenCalledTimes(1);
    expect(paymentProvider.expireSession).not.toHaveBeenCalled();
  });

  it('keeps non-idempotent sequential semantics: committed items are retained', async () => {
    let sessions = 0;
    const paymentProvider = {
      createSession: vi.fn(async () => `seq-session-${++sessions}`),
      expireSession: vi.fn(async () => undefined),
      refundPayment: vi.fn(async () => undefined),
    };
    const template = baseTemplate({
      templateCd: 'pay-sequential',
      paymentCd: 'pay',
      prepareMessage: async ({ user }) => [
        { fromUser: user._id, toUser: receiverId, payload: { seqKey: 'first' } },
        { fromUser: user._id, toUser: receiverId, payload: { seqKey: 'first' } },
      ],
    });
    const { service, models } = await fixture({ templates: [template], serviceOptions: { paymentProvider } });
    await models.Message.collection.createIndex({ 'payload.seqKey': 1 }, { unique: true, sparse: true });

    // No clientRequestId: sequential per-item persistence, not all-or-nothing.
    await expect(
      service.createMessage({ templateCd: template.templateCd, user: { _id: senderId } }),
    ).rejects.toMatchObject({ code: 11000 });
    expect(paymentProvider.createSession).toHaveBeenCalledTimes(2);
    // Only the failing second item is compensated; the committed first item
    // keeps its live session.
    expect(paymentProvider.expireSession).toHaveBeenCalledTimes(1);
    expect(paymentProvider.expireSession).toHaveBeenCalledWith('seq-session-2');
    expect(await models.Message.countDocuments({ templateCd: template.templateCd })).toBe(1);
  });

  it('keeps provider methods bound to the provider instance', async () => {
    const paymentProvider = {
      prefix: 'bound',
      createSession: vi.fn(async function (this: { prefix: string }) {
        expect(this).toBe(paymentProvider);
        return `${this.prefix}-1`;
      }),
      expireSession: vi.fn(async function (this: { prefix: string }, sessionId: string) {
        expect(this).toBe(paymentProvider);
        expect(sessionId).toBe('bound-1');
      }),
      refundPayment: vi.fn(async () => undefined),
    };
    const template = baseTemplate({ templateCd: 'pay-bound', paymentCd: 'pay' });
    const created = await fixture({ templates: [template], serviceOptions: { paymentProvider } });
    vi.spyOn(created.models.Message, 'create').mockImplementationOnce(async () => {
      throw new Error('bound write failed');
    });

    // Expiration succeeds, so the original persistence error propagates; the
    // inner `this` assertions prove both provider methods stayed bound. Had
    // either method lost its binding, the assertion inside the mock would
    // reject and the outer error would be a compensation error instead.
    await expect(
      created.service.createMessage({
        templateCd: template.templateCd,
        user: { _id: senderId },
        clientRequestId: 'bound-check',
      }),
    ).rejects.toThrow('bound write failed');
    expect(paymentProvider.createSession).toHaveBeenCalledTimes(1);
    expect(paymentProvider.expireSession).toHaveBeenCalledWith('bound-1');
  });

  it('keeps single-session compensation error shape for backwards compatibility', async () => {
    const compensationFailure = new Error('expire failed solo');
    const onPaymentCompensationFailure = vi.fn(async () => undefined);
    const paymentProvider = {
      createSession: vi.fn(async () => 'session-solo'),
      expireSession: vi.fn(async () => {
        throw compensationFailure;
      }),
      refundPayment: vi.fn(async () => undefined),
    };
    const template = baseTemplate({ templateCd: 'pay-solo', paymentCd: 'pay' });
    const created = await fixture({
      templates: [template],
      serviceOptions: { paymentProvider, onPaymentCompensationFailure },
    });
    vi.spyOn(created.models.Message, 'create').mockImplementationOnce(async () => {
      throw new Error('solo write failed');
    });

    const error = await created.service
      .createMessage({ templateCd: template.templateCd, user: { _id: senderId }, clientRequestId: 'solo' })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(PaymentSessionCompensationError);
    expect(error).not.toBeInstanceOf(PaymentSessionCompensationAggregateError);
    expect(error).toMatchObject({ sessionId: 'session-solo' });
    expect(onPaymentCompensationFailure).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-solo', error: compensationFailure }),
    );
  });

  it('wraps transaction-unsupported startSession failures without expiring committed work', async () => {
    const paymentProvider = {
      createSession: vi.fn(async () => 'session-txn-unsupported'),
      expireSession: vi.fn(async () => undefined),
      refundPayment: vi.fn(async () => undefined),
    };
    const template = baseTemplate({ templateCd: 'pay-txn-unsupported', paymentCd: 'pay' });
    const created = await fixture({ templates: [template], serviceOptions: { paymentProvider } });
    const db = created.models.Message.db;
    if (!db?.startSession) throw new Error('fixture Message model has no startSession');
    vi.spyOn(db, 'startSession').mockRejectedValueOnce(
      new Error('Transaction numbers are only allowed on a replica set member or mongos'),
    );

    const error = await created.service
      .createMessage({ templateCd: template.templateCd, user: { _id: senderId }, clientRequestId: 'txn-unsupported' })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(MessageTransactionRequiredError);
    expect(paymentProvider.expireSession).toHaveBeenCalledWith('session-txn-unsupported');
  });
});
