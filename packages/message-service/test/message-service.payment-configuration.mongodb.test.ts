import express from 'express';
import mongoose from 'mongoose';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as messaging from '../src/index';
import type { IMessage, MessageServiceOptions, MessageTemplate, PaymentProvider, PrepareResult } from '../src/index';
import {
  createMongoMessageServiceFixture,
  stopMongoReplicaSet,
  type MongoMessageServiceFixture,
} from './support/mongodb-fixture';

const senderId = new mongoose.Types.ObjectId();
const preparedSenderId = new mongoose.Types.ObjectId();
const receiverId = new mongoose.Types.ObjectId();
const payerId = new mongoose.Types.ObjectId();
const requiredMessage = 'paymentProvider is required for messages with a non-empty paymentCd';

function template(overrides: Partial<MessageTemplate> = {}): MessageTemplate {
  return {
    templateCd: 'payment-configuration',
    type: 'request',
    description: 'MSGA-14 payment configuration',
    senderContent: { title: 'S {{name}}', long: 'S', short: 'S' },
    receiverContent: { title: 'R', long: 'R', short: 'R' },
    uiTemplate: 'default-message',
    prepareMessage: async () => ({}),
    actions: [
      {
        actionCd: 'close',
        name: 'Close',
        variant: 'primary',
        sender: true,
        receiver: false,
        runHandler: async () => 'closed',
      },
    ],
    ...overrides,
  };
}

function provider() {
  let sequence = 0;
  return {
    createSession: vi.fn(async () => `configuration-session-${++sequence}`),
    expireSession: vi.fn(async (_id: string) => undefined),
    refundPayment: vi.fn(async () => undefined),
  };
}

function missingProvider(mode: 'omitted' | 'null'): MessageServiceOptions {
  return mode === 'null' ? { paymentProvider: null } : {};
}

function paidCode(source: 'template' | 'item' | 'empty override', item: PrepareResult = {}): MessageTemplate {
  return template({
    paymentCd: source === 'item' ? undefined : 'template-code',
    prepareMessage: async () => ({
      ...item,
      ...(source === 'item' ? { paymentCd: 'item-code' } : source === 'empty override' ? { paymentCd: '' } : {}),
    }),
  });
}

describe('MSGA-14 required payment sessions (real MongoDB)', () => {
  const fixtures: MongoMessageServiceFixture[] = [];
  const servers: ReturnType<ReturnType<typeof express>['listen']>[] = [];

  async function fixture(templates: MessageTemplate[], options: MessageServiceOptions = {}) {
    const created = await createMongoMessageServiceFixture({ templates });
    fixtures.push(created);
    return {
      ...created,
      service: new messaging.MessageService({ connection: created.connection, registry: created.registry, ...options }),
    };
  }

  async function routes(service: messaging.MessageService) {
    const app = express();
    app.use(express.json());
    app.use(messaging.createMessageRoutes({ service, getUser: () => ({ _id: senderId }) }).router.original);
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    servers.push(server);
    return async (body: Record<string, unknown> = {}) => {
      const response = await fetch(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}/new/payment-configuration`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      return { status: response.status, body: await response.json() };
    };
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const server of servers.splice(0)) {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
    for (const created of fixtures.splice(0)) await created.close();
  });
  afterAll(stopMongoReplicaSet);

  describe.each(['direct', 'idempotent'] as const)('%s creation', (mode) => {
    const request = () => ({
      templateCd: 'payment-configuration',
      user: { _id: senderId },
      ...(mode === 'idempotent' ? { clientRequestId: 'configuration-request' } : {}),
    });

    describe.each(['omitted', 'null'] as const)('%s provider', (configuration) => {
      it.each(
        (['template', 'item', 'empty override'] as const).flatMap((source) =>
          [false, true].map((addressed) => ({ source, addressed })),
        ),
      )('rejects $source code (addressed=$addressed) before writing the paid item', async ({ source, addressed }) => {
        const created = await fixture(
          [paidCode(source, addressed ? { toUser: receiverId } : {})],
          missingProvider(configuration),
        );
        const error = await created.service.createMessage(request()).catch((error: unknown) => error);
        expect(error).toMatchObject({ name: 'PaymentProviderRequiredError', message: requiredMessage });
        expect(error).toBeInstanceOf(messaging.PaymentProviderRequiredError);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toHaveProperty('statusCode');
        expect(error).not.toHaveProperty('paymentCd');
        expect(await created.models.Message.countDocuments({})).toBe(0);
        expect(await created.models.MessageArchive.countDocuments({})).toBe(0);
        if (mode === 'idempotent') {
          expect(await created.models.MessageRequest.findOne({}).lean()).toMatchObject({
            state: 'failed',
            failureMessage: requiredMessage,
          });
          const repairedProvider = provider();
          const repaired = new messaging.MessageService({
            connection: created.connection,
            registry: created.registry,
            paymentProvider: repairedProvider,
          });
          await expect(repaired.createMessage(request())).rejects.toBeInstanceOf(messaging.ClientRequestFailedError);
          expect(repairedProvider.createSession).not.toHaveBeenCalled();
        } else {
          expect(await created.models.MessageRequest.countDocuments({})).toBe(0);
        }
      });

      it('retains only a direct free prefix when a later paid item requires a provider', async () => {
        const created = await fixture(
          [
            template({
              prepareMessage: async () => [
                { payload: { slot: 'free-prefix' } },
                { paymentCd: 'item-code', payload: { slot: 'paid' } },
                { payload: { slot: 'unreached' } },
              ],
            }),
          ],
          missingProvider(configuration),
        );
        await expect(created.service.createMessage(request())).rejects.toMatchObject({
          name: 'PaymentProviderRequiredError',
        });
        const stored = await created.models.Message.find({}).lean();
        expect(stored).toHaveLength(mode === 'direct' ? 1 : 0);
        if (mode === 'direct') expect(stored[0]).toMatchObject({ paymentCd: '', payload: { slot: 'free-prefix' } });
        else expect(await created.models.MessageRequest.findOne({}).lean()).toMatchObject({ state: 'failed' });
      });
    });

    it.each([
      { templateCode: 'template-code', itemCode: undefined, expected: 'template-code', separatePayer: false },
      { templateCode: 'template-code', itemCode: '', expected: 'template-code', separatePayer: true },
      { templateCode: 'template-code', itemCode: 'item-code', expected: 'item-code', separatePayer: true },
      { templateCode: undefined, itemCode: 'item-code', expected: 'item-code', separatePayer: false },
      { templateCode: 'template-code', itemCode: '   ', expected: '   ', separatePayer: true },
    ])('creates a session without recipients for effective code "$expected"', async (row) => {
      const paymentProvider = provider();
      const priceArgs = { currency: 'TEST', quantity: 2 };
      const created = await fixture(
        [
          template({
            paymentCd: row.templateCode,
            prepareMessage: async () => ({
              fromUser: preparedSenderId,
              toRoles: [],
              paymentCd: row.itemCode,
              priceArgs,
            }),
          }),
        ],
        { paymentProvider },
      );
      const [message] = await created.service.createMessage({
        ...request(),
        ...(row.separatePayer ? { payerUser: { _id: payerId } } : {}),
      });
      expect(paymentProvider.createSession).toHaveBeenCalledExactlyOnceWith(
        row.separatePayer ? payerId : senderId,
        row.expected,
        priceArgs,
      );
      expect(await created.models.Message.findById(message._id).lean()).toMatchObject({
        fromUser: preparedSenderId,
        toUser: null,
        toRoles: [],
        paymentCd: row.expected,
        paymentSession: 'configuration-session-1',
      });
      expect(paymentProvider.expireSession).not.toHaveBeenCalled();
    });

    it.each(['omitted', 'null', 'noop', 'throws'] as const)(
      'allows code-free items with %s provider',
      async (configuration) => {
        const unused = provider();
        unused.createSession.mockRejectedValue(new Error('code-free provider must not run'));
        const paymentProvider = configuration === 'noop' ? new messaging.NoopPaymentProvider() : unused;
        const createSession = vi.spyOn(paymentProvider, 'createSession');
        const created = await fixture(
          [template({ paymentCd: '', prepareMessage: async () => [{}, { paymentCd: '' }] })],
          configuration === 'omitted' || configuration === 'null'
            ? missingProvider(configuration)
            : { paymentProvider },
        );
        const messages = await created.service.createMessage({
          ...request(),
          payload: { paymentCd: 'untrusted-code' },
        });
        expect(messages).toHaveLength(2);
        expect(messages.map(({ paymentCd, paymentSession }) => ({ paymentCd, paymentSession }))).toEqual([
          { paymentCd: '', paymentSession: null },
          { paymentCd: '', paymentSession: null },
        ]);
        expect(createSession).not.toHaveBeenCalled();
      },
    );

    it.each([null, []])('allows a paid template to prepare no items (%j) without a provider', async (items) => {
      const prepareMessage = vi.fn(async () => items);
      const created = await fixture([template({ paymentCd: 'template-code', prepareMessage })]);
      await expect(created.service.createMessage(request())).resolves.toEqual([]);
      if (mode === 'idempotent') {
        await expect(created.service.createMessage(request())).resolves.toEqual([]);
        expect(prepareMessage).toHaveBeenCalledTimes(1);
        expect(await created.models.MessageRequest.findOne({}).lean()).toMatchObject({
          state: 'completed',
          itemCount: 0,
        });
      }
      expect(await created.models.Message.countDocuments({})).toBe(0);
    });

    it.each(['null', 'empty', 'noop', 'rejects'] as const)(
      'preserves %s provider failure without recipients',
      async (failure) => {
        const original = new Error('original provider rejection');
        const createSession = vi.fn(async () => {
          if (failure === 'rejects') throw original;
          return failure === 'empty' ? '' : null;
        });
        const paymentProvider =
          failure === 'noop' ? new messaging.NoopPaymentProvider() : { ...provider(), createSession };
        const invoked = vi.spyOn(paymentProvider, 'createSession');
        const created = await fixture([paidCode('item')], { paymentProvider });
        const error = await created.service.createMessage(request()).catch((error: unknown) => error);
        if (failure === 'rejects') expect(error).toBe(original);
        else expect(error).toMatchObject({ name: 'Error', message: 'payment session creation failed' });
        expect(invoked).toHaveBeenCalledExactlyOnceWith(senderId, 'item-code', undefined);
        expect(await created.models.Message.countDocuments({})).toBe(0);
        if (mode === 'idempotent') {
          expect(await created.models.MessageRequest.findOne({}).lean()).toMatchObject({ state: 'failed' });
        }
      },
    );

    it('compensates unaddressed mixed-batch sessions while retaining committed direct items', async () => {
      const original = new Error('render failure on later paid item');
      const paymentProvider = provider();
      const created = await fixture(
        [
          template({
            prepareMessage: async () => [
              { paymentCd: 'paid-first', payload: { slot: 0 } },
              { payload: { slot: 1 } },
              {
                paymentCd: 'paid-failing',
                templateData: {
                  get name(): string {
                    throw original;
                  },
                },
                payload: { slot: 2 },
              },
              { paymentCd: 'unreached', payload: { slot: 3 } },
            ],
          }),
        ],
        { paymentProvider },
      );
      await expect(created.service.createMessage(request())).rejects.toBe(original);
      expect(paymentProvider.createSession).toHaveBeenCalledTimes(2);
      expect(paymentProvider.expireSession.mock.calls).toEqual(
        mode === 'direct' ? [['configuration-session-2']] : [['configuration-session-2'], ['configuration-session-1']],
      );
      const stored = await created.models.Message.find({}).sort({ 'payload.slot': 1 }).lean();
      expect(stored).toHaveLength(mode === 'direct' ? 2 : 0);
      if (mode === 'direct') {
        expect(stored).toMatchObject([
          { paymentCd: 'paid-first', paymentSession: 'configuration-session-1', payload: { slot: 0 } },
          { paymentCd: '', paymentSession: null, payload: { slot: 1 } },
        ]);
      } else expect(await created.models.MessageRequest.findOne({}).lean()).toMatchObject({ state: 'failed' });
    });

    describe.each(['omitted', 'null'] as const)('HTTP with %s provider', (configuration) => {
      it.each(['template', 'item'] as const)('sanitizes missing-provider failure for %s code', async (source) => {
        const created = await fixture([paidCode(source)], missingProvider(configuration));
        const post = await routes(created.service);
        const body = mode === 'idempotent' ? { clientRequestId: 'http-configuration' } : {};
        const response = await post(body);
        expect(response).toEqual({ status: 500, body: { message: 'Internal Server Error' } });
        expect(await created.models.Message.countDocuments({})).toBe(0);
        if (mode === 'idempotent') {
          const repairedProvider = provider();
          const repairedPost = await routes(
            new messaging.MessageService({
              connection: created.connection,
              registry: created.registry,
              paymentProvider: repairedProvider,
            }),
          );
          expect(await repairedPost(body)).toEqual({
            status: 409,
            body: {
              message: 'clientRequestId "http-configuration" previously failed; retry with a new clientRequestId',
            },
          });
          expect(repairedProvider.createSession).not.toHaveBeenCalled();
        }
      });
    });

    it.each(['template', 'item'] as const)(
      'HTTP creates an unaddressed %s-code item with the authenticated payer',
      async (source) => {
        const paymentProvider = provider();
        const created = await fixture([paidCode(source, { fromUser: preparedSenderId })], { paymentProvider });
        const post = await routes(created.service);
        const response = await post(mode === 'idempotent' ? { clientRequestId: 'http-success' } : {});
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject([{ paymentSession: 'configuration-session-1', toUser: null, toRoles: [] }]);
        expect(paymentProvider.createSession).toHaveBeenCalledExactlyOnceWith(senderId, `${source}-code`, undefined);
      },
    );
  });

  it('attempts every known unaddressed session when expiration and its observer fail', async () => {
    const original = new Error('later provider rejection');
    const expiration = new Error('expiration rejected');
    const observer = new Error('observer rejected');
    const paymentProvider = provider();
    paymentProvider.createSession
      .mockResolvedValueOnce('known-1')
      .mockResolvedValueOnce('known-2')
      .mockRejectedValueOnce(original);
    paymentProvider.expireSession.mockRejectedValue(expiration);
    const onPaymentCompensationFailure = vi.fn(async () => {
      throw observer;
    });
    const created = await fixture(
      [
        template({
          prepareMessage: async () => [{ paymentCd: 'one' }, {}, { paymentCd: 'two' }, { paymentCd: 'three' }],
        }),
      ],
      { paymentProvider, onPaymentCompensationFailure },
    );
    const error = await created.service
      .createMessage({
        templateCd: 'payment-configuration',
        user: { _id: senderId },
        clientRequestId: 'aggregate',
      })
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(messaging.PaymentSessionCompensationAggregateError);
    expect(error).toBeInstanceOf(messaging.PaymentSessionCompensationError);
    expect(error).toMatchObject({
      originalError: original,
      failures: [
        { sessionId: 'known-1', compensationError: expiration, hookError: observer },
        { sessionId: 'known-2', compensationError: expiration, hookError: observer },
      ],
    });
    expect(paymentProvider.expireSession.mock.calls).toEqual([['known-1'], ['known-2']]);
    expect(onPaymentCompensationFailure).toHaveBeenCalledTimes(2);
    expect(await created.models.Message.countDocuments({})).toBe(0);
    expect(await created.models.MessageRequest.findOne({}).lean()).toMatchObject({ state: 'failed' });
  });

  describe.each(['active', 'mixed', 'archived'] as const)('completed legacy %s replay', (state) => {
    it.each(['omitted', 'null', 'noop', 'throws'] as const)(
      'works with %s provider after template reconfiguration',
      async (configuration) => {
        const prepareMessage = vi.fn(async () => {
          throw new Error('replay must not prepare');
        });
        const created = await fixture([template({ paymentCd: 'new-template-code', prepareMessage })]);
        const scope = {
          templateCd: 'payment-configuration',
          clientRequestId: 'legacy-completed',
          clientRequestOwnerId: String(senderId),
        };
        // Seed the legacy persisted contract directly: fresh service creation must
        // no longer produce the nonempty-code/null-session row.
        const legacy = await created.models.Message.create(
          [
            { paymentCd: 'legacy-sessionless', paymentSession: null },
            { paymentCd: 'legacy-paid', paymentSession: 'legacy-session' },
            { paymentCd: '', paymentSession: null },
          ].map((payment, index) => ({
            ...scope,
            ...payment,
            clientRequestItemIndex: index,
            fromUser: senderId,
            senderContent: { title: 'Legacy', long: 'Legacy', short: 'Legacy' },
            receiverContent: { title: 'Legacy', long: 'Legacy', short: 'Legacy' },
          })),
        );
        await created.models.MessageRequest.create({ ...scope, state: 'completed', itemCount: 3 });
        const archiveCount = state === 'active' ? 0 : state === 'mixed' ? 1 : 3;
        for (const message of legacy.slice(0, archiveCount)) {
          await (message as unknown as IMessage).archive('close', senderId, created.registry);
        }
        const unused = provider();
        unused.createSession.mockRejectedValue(new Error('replay must not create a session'));
        const paymentProvider: PaymentProvider =
          configuration === 'noop' ? new messaging.NoopPaymentProvider() : unused;
        const invoked = vi.spyOn(paymentProvider, 'createSession');
        if (configuration === 'omitted') created.registry.unregister(scope.templateCd);
        const service = new messaging.MessageService({
          connection: created.connection,
          registry: created.registry,
          ...(configuration === 'omitted' || configuration === 'null'
            ? missingProvider(configuration)
            : { paymentProvider }),
        });
        const replay = await service.createMessage({
          templateCd: scope.templateCd,
          user: { _id: senderId },
          clientRequestId: scope.clientRequestId,
          payerUser: { _id: payerId },
          payload: { paymentCd: 'changed-payload' },
        });
        expect(replay.map((message) => String(message._id))).toEqual(legacy.map((message) => String(message._id)));
        expect(replay.map((message) => [message.paymentCd, message.paymentSession])).toEqual([
          ['legacy-sessionless', null],
          ['legacy-paid', 'legacy-session'],
          ['', null],
        ]);
        expect(replay.filter((message) => 'archivedAt' in message)).toHaveLength(archiveCount);
        expect(prepareMessage).not.toHaveBeenCalled();
        expect(invoked).not.toHaveBeenCalled();
        expect(unused.expireSession).not.toHaveBeenCalled();
        if (state === 'mixed' && configuration === 'null') {
          const post = await routes(service);
          const response = await post({ clientRequestId: scope.clientRequestId });
          expect(response.status).toBe(200);
          expect(response.body).toMatchObject([
            { paymentCd: 'legacy-sessionless', paymentSession: null },
            { paymentCd: 'legacy-paid', paymentSession: 'legacy-session' },
            { paymentCd: '', paymentSession: null },
          ]);
        }
        expect(await created.models.Message.countDocuments({})).toBe(3 - archiveCount);
        expect(await created.models.MessageArchive.countDocuments({})).toBe(archiveCount);
      },
    );
  });
});
