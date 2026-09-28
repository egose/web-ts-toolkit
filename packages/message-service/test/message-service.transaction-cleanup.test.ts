import mongoose from 'mongoose';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActionNotificationPendingError,
  InvalidMessageServiceOptionError,
  MessageArchivedError,
} from '../src/message-service';
import { createMessageRoutes } from '../src/route-factory';
import type { IMessage } from '../src/types/message';
import type { MessageTemplate } from '../src/types/template';
import {
  createMongoMessageServiceFixture,
  stopMongoReplicaSet,
  type MongoMessageServiceFixture,
} from './support/mongodb-fixture';

const sender = new mongoose.Types.ObjectId();
const receiver = new mongoose.Types.ObjectId();
const cleanupError = new Error('endSession rejected');

const template: MessageTemplate = {
  templateCd: 'transaction-cleanup',
  type: 'request',
  description: 'MSGR-01 transaction cleanup',
  senderContent: { title: 'S', long: 'S', short: 'S' },
  receiverContent: { title: 'R', long: 'R', short: 'R' },
  uiTemplate: 'default-message',
  prepareMessage: async ({ user }) => ({ fromUser: user._id, toUser: receiver, payload: {} }),
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

// Only inject the housekeeping failure: all transaction operations, commit,
// rollback, and the actual session release still execute against MongoDB.
async function rejectCleanup(connection: mongoose.Connection) {
  const session = await connection.startSession();
  const end = session.endSession.bind(session);
  vi.spyOn(session, 'endSession').mockImplementation(async () => {
    await end();
    throw cleanupError;
  });
  vi.spyOn(connection, 'startSession').mockResolvedValueOnce(session);
  return session;
}

describe('MSGR-01 transaction cleanup outcomes (real MongoDB)', () => {
  const fixtures: MongoMessageServiceFixture[] = [];
  async function fixture(options: Parameters<typeof createMongoMessageServiceFixture>[0] = {}) {
    const created = await createMongoMessageServiceFixture({ templates: [template], ...options });
    fixtures.push(created);
    return created;
  }
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const created of fixtures.splice(0)) await created.close();
  });
  afterAll(stopMongoReplicaSet);

  it.each(['absent', 'throws', 'rejects'] as const)('retains paid commit/replay when observer %s', async (mode) => {
    const observer = vi.fn(() => {
      if (mode === 'throws') throw new Error('sync observer failure');
      return Promise.reject(new Error('async observer failure'));
    });
    const paymentProvider = {
      createSession: vi.fn(async () => 'paid-committed-session'),
      expireSession: vi.fn(async () => undefined),
      refundPayment: vi.fn(async () => undefined),
    };
    const created = await fixture({
      templates: [{ ...template, paymentCd: 'pay' }],
      serviceOptions: { paymentProvider, onTransactionCleanupFailure: mode === 'absent' ? undefined : observer },
    });
    await rejectCleanup(created.connection);
    const input = { templateCd: template.templateCd, user: { _id: sender }, clientRequestId: 'paid-commit' };
    const first = await created.service.createMessage(input);
    const replay = await created.service.createMessage(input);
    expect(replay.map((doc) => String(doc._id))).toEqual(first.map((doc) => String(doc._id)));
    expect(await created.models.Message.countDocuments({ paymentSession: 'paid-committed-session' })).toBe(1);
    expect(
      await created.models.MessageRequest.findOne({ clientRequestId: input.clientRequestId }).lean(),
    ).toMatchObject({ state: 'completed', itemCount: 1 });
    expect(paymentProvider.createSession).toHaveBeenCalledTimes(1);
    expect(paymentProvider.expireSession).not.toHaveBeenCalled();
    expect(observer).toHaveBeenCalledTimes(mode === 'absent' ? 0 : 1);
    if (mode !== 'absent') {
      expect(observer).toHaveBeenCalledWith({
        operation: 'createBatch',
        stage: 'endSession',
        outcome: 'committed',
        error: cleanupError,
      });
    }
  });

  it.each(['sent', 'failed'] as const)('reaches notification %s despite cleanup rejection', async (state) => {
    const notificationError = new Error('notification failed');
    const notify = vi.fn(async () => {
      if (state === 'failed') throw notificationError;
      return { title: 'Approved', long: 'Approved notification', short: 'Approved' };
    });
    const runHandler = vi.fn(async () => 'approved');
    const observer = vi.fn(async () => {
      throw new Error('action observer rejected');
    });
    const created = await fixture({
      templates: [{ ...template, actions: [{ ...template.actions[0], runHandler, senderNotification: notify }] }],
      serviceOptions: { onTransactionCleanupFailure: observer },
    });
    const [message] = await created.service.createMessage({ templateCd: template.templateCd, user: { _id: sender } });
    await rejectCleanup(created.connection);
    const outcome = created.service.handleAction(template.templateCd, 'approve', { message, user: { _id: receiver } });
    if (state === 'sent') await expect(outcome).resolves.toBe('approved');
    else
      await expect(outcome).rejects.toMatchObject({ name: 'ActionNotificationPendingError', cause: notificationError });
    expect(runHandler).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(observer).toHaveBeenCalledWith({
      operation: 'actionArchive',
      stage: 'endSession',
      outcome: 'committed',
      error: cleanupError,
    });
    expect(await created.models.Message.countDocuments({ _id: message._id })).toBe(0);
    expect(await created.models.MessageArchive.findById(message._id).lean()).toMatchObject({
      actionCd: 'approve',
      actionNotificationState: state,
    });
    expect(await created.models.Message.countDocuments({ templateCd: '__generic-notification__' })).toBe(
      state === 'sent' ? 1 : 0,
    );
    const archived = await created.service.findMessageOrThrow(String(message._id));
    await expect(
      created.service.handleAction(template.templateCd, 'approve', {
        message: archived,
        user: { _id: receiver },
      }),
    ).rejects.toBeInstanceOf(state === 'failed' ? ActionNotificationPendingError : MessageArchivedError);
    expect(runHandler).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('reports direct archive committed success despite cleanup rejection', async () => {
    const observer = vi.fn(() => {
      throw new Error('direct observer threw');
    });
    const serviceObserver = vi.fn();
    const created = await fixture({
      schemaOptions: { onTransactionCleanupFailure: observer },
      serviceOptions: { onTransactionCleanupFailure: serviceObserver },
    });
    const [message] = await created.service.createMessage({ templateCd: template.templateCd, user: { _id: sender } });
    await rejectCleanup(created.connection);
    await expect((message as IMessage).archive('approve', receiver, created.registry)).resolves.toBeUndefined();
    expect(await created.models.Message.countDocuments({ _id: message._id })).toBe(0);
    expect(await created.models.MessageArchive.findById(message._id).lean()).toMatchObject({
      actionNotificationState: 'none',
    });
    expect(observer).toHaveBeenCalledWith({
      operation: 'directArchive',
      stage: 'endSession',
      outcome: 'committed',
      error: cleanupError,
    });
    expect(serviceObserver).not.toHaveBeenCalled();
  });

  it('preserves a real rollback error and compensates all uncommitted payment sessions', async () => {
    const observer = vi.fn(async () => {
      throw new Error('rollback observer rejected');
    });
    let sequence = 0;
    const paymentProvider = {
      createSession: vi.fn(async () => `rollback-${++sequence}`),
      expireSession: vi.fn(async () => undefined),
      refundPayment: vi.fn(async () => undefined),
    };
    const created = await fixture({
      templates: [
        {
          ...template,
          paymentCd: 'pay',
          prepareMessage: async () => [
            { fromUser: sender, toUser: receiver, payload: { uniqueKey: 'duplicate' } },
            { fromUser: sender, toUser: receiver, payload: { uniqueKey: 'duplicate' } },
          ],
        },
      ],
      serviceOptions: { paymentProvider, onTransactionCleanupFailure: observer },
    });
    await created.models.Message.collection.createIndex({ 'payload.uniqueKey': 1 }, { unique: true });
    await rejectCleanup(created.connection);
    await expect(
      created.service.createMessage({
        templateCd: template.templateCd,
        user: { _id: sender },
        clientRequestId: 'rollback',
      }),
    ).rejects.toMatchObject({ code: 11000 });
    expect(await created.models.Message.countDocuments({})).toBe(0);
    expect(await created.models.MessageRequest.findOne({ clientRequestId: 'rollback' }).lean()).toMatchObject({
      state: 'failed',
      failureMessage: expect.stringContaining('E11000'),
    });
    expect(paymentProvider.expireSession.mock.calls).toEqual([['rollback-1'], ['rollback-2']]);
    expect(observer).toHaveBeenCalledWith({
      operation: 'createBatch',
      stage: 'endSession',
      outcome: 'failed',
      error: cleanupError,
      originalError: expect.objectContaining({ code: 11000 }),
    });
  });

  it.each(['action', 'direct'] as const)('preserves %s failure when abort and cleanup both reject', async (path) => {
    const primary = new Error('active delete failed after archive insertion');
    const observer = vi.fn(() => {
      throw new Error('rollback observer threw');
    });
    const created = await fixture({
      schemaOptions: { onTransactionCleanupFailure: observer },
      serviceOptions: { onTransactionCleanupFailure: observer },
    });
    const [message] = await created.service.createMessage({ templateCd: template.templateCd, user: { _id: sender } });
    const session = await rejectCleanup(created.connection);
    const abort = session.abortTransaction.bind(session);
    vi.spyOn(session, 'abortTransaction').mockImplementation(async () => {
      await abort();
      throw new Error('abort response failed');
    });
    // The archive insert is real; failing the following delete forces rollback.
    vi.spyOn(created.models.Message, 'deleteOne').mockRejectedValueOnce(primary);
    const outcome =
      path === 'direct'
        ? (message as IMessage).archive('approve', receiver, created.registry)
        : created.service.handleAction(template.templateCd, 'approve', { message, user: { _id: receiver } });
    await expect(outcome).rejects.toBe(primary);
    expect(await created.models.MessageArchive.countDocuments({ _id: message._id })).toBe(0);
    expect(await created.models.Message.findById(message._id).lean()).toMatchObject({
      actionState: path === 'action' ? 'retryable' : 'active',
    });
    expect(observer).toHaveBeenCalledWith({
      operation: path === 'action' ? 'actionArchive' : 'directArchive',
      stage: 'endSession',
      outcome: 'failed',
      error: cleanupError,
      originalError: primary,
    });
  });

  it.each(['committed', 'failed'] as const)('preserves the final %s outcome after a driver retry', async (outcome) => {
    const observer = vi.fn();
    const runHandler = vi.fn(async () => 'approved');
    const created = await fixture({
      templates: [{ ...template, actions: [{ ...template.actions[0], runHandler }] }],
      serviceOptions: { onTransactionCleanupFailure: observer },
    });
    const [message] = await created.service.createMessage({ templateCd: template.templateCd, user: { _id: sender } });
    const session = await rejectCleanup(created.connection);
    const transient = new mongoose.mongo.MongoServerError({ message: 'retry this transaction' });
    transient.addErrorLabel('TransientTransactionError');
    // First attempt inserts an archive then aborts; the real driver retries.
    const deletion = vi.spyOn(created.models.Message, 'deleteOne').mockRejectedValueOnce(transient);
    const commitError = new mongoose.mongo.MongoServerError({ message: 'final commit rejected' });
    if (outcome === 'failed') vi.spyOn(session, 'commitTransaction').mockRejectedValueOnce(commitError);
    const action = created.service.handleAction(template.templateCd, 'approve', { message, user: { _id: receiver } });
    if (outcome === 'committed') await expect(action).resolves.toBe('approved');
    else await expect(action).rejects.toBe(commitError);
    expect(deletion).toHaveBeenCalledTimes(2);
    expect(runHandler).toHaveBeenCalledTimes(1);
    expect(await created.models.MessageArchive.countDocuments({ _id: message._id })).toBe(
      outcome === 'committed' ? 1 : 0,
    );
    expect(await created.models.Message.countDocuments({ _id: message._id })).toBe(outcome === 'committed' ? 0 : 1);
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer).toHaveBeenCalledWith({
      operation: 'actionArchive',
      stage: 'endSession',
      outcome,
      error: cleanupError,
      ...(outcome === 'failed' ? { originalError: commitError } : {}),
    });
  });

  it('keeps a borrowed direct-archive session and its connection caller-owned', async () => {
    const observer = vi.fn();
    const created = await fixture({ schemaOptions: { onTransactionCleanupFailure: observer } });
    const other = await fixture();
    const [message] = await created.service.createMessage({ templateCd: template.templateCd, user: { _id: sender } });
    const session = await created.connection.startSession();
    const end = vi.spyOn(session, 'endSession');
    const start = vi.spyOn(created.connection, 'startSession');
    const otherStart = vi.spyOn(other.connection, 'startSession');
    (message as IMessage).$session(session);
    try {
      await (message as IMessage).archive('approve', receiver, created.registry);
      expect(start).not.toHaveBeenCalled();
      expect(otherStart).not.toHaveBeenCalled();
      expect(end).not.toHaveBeenCalled();
      expect(observer).not.toHaveBeenCalled();
      expect(await created.models.MessageArchive.countDocuments({ _id: message._id })).toBe(1);
      expect(await other.models.MessageArchive.countDocuments({})).toBe(0);
      // The borrowed session remains usable for a subsequent real transaction.
      await session.withTransaction(async () => {
        await created.models.MessageArchive.updateOne(
          { _id: message._id },
          { $set: { 'payload.borrowed': true } },
          { session },
        );
      });
      expect(await created.models.MessageArchive.findById(message._id).lean()).toMatchObject({
        payload: { borrowed: true },
      });
    } finally {
      await session.endSession();
    }
  });

  it('forwards cleanup diagnostics through route construction and rejects injection conflicts', async () => {
    const observer = vi.fn(async () => {
      throw new Error('HTTP observer rejected');
    });
    const created = await fixture();
    const { router } = createMessageRoutes({
      getModel: (name) => created.connection.model(name),
      registry: created.registry,
      onTransactionCleanupFailure: observer,
      getUser: () => ({ _id: sender }),
    });
    expect(() =>
      createMessageRoutes({ service: created.service, onTransactionCleanupFailure: observer } as never),
    ).toThrow(InvalidMessageServiceOptionError);
    const app = express();
    app.use(express.json());
    app.use(router.original);
    const server = app.listen(0);
    try {
      await rejectCleanup(created.connection);
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/new/${template.templateCd}`;
      const post = () =>
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ clientRequestId: 'http-cleanup' }),
        });
      const first = await post();
      expect(first.status).toBe(200);
      const firstBody = await first.json();
      const replay = await post();
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual(firstBody);
      expect(observer).toHaveBeenCalledTimes(1);
      expect(observer).toHaveBeenCalledWith({
        operation: 'createBatch',
        stage: 'endSession',
        outcome: 'committed',
        error: cleanupError,
      });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
