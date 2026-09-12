import { describe, it, expect, vi, afterEach } from 'vitest';
import mongoose from 'mongoose';
import {
  ClientRequestPendingError,
  InvalidMessageServiceOptionError,
  MAX_MESSAGE_SERVICE_TIMEOUT_MS,
  MessageService,
} from '../src/message-service';
import { defaultRegistry } from '../src/template-registry';
import type { MessageTemplate } from '../src/types/template';
import { createMongoMessageServiceFixture } from './support/mongodb-fixture';

const testTemplate: MessageTemplate = {
  templateCd: 'timing-validation-test',
  type: 'request',
  description: 'Timing validation',
  senderContent: { title: 'Send', long: 'Send long', short: 'Send' },
  receiverContent: { title: 'Recv', long: 'Recv long', short: 'Recv' },
  uiTemplate: 'default-message',
  prepareMessage: async ({ user, payload }) => ({
    fromUser: (user as { _id: unknown })._id as never,
    toUser: 'receiver-1',
    payload,
  }),
  actions: [],
};

function stubGetModel() {
  // Reservation that stays pending with a live lease: duplicate path can
  // neither acquire nor replay, so the wait loop must exit via deadline.
  const livePending = {
    clientRequestId: 'timing-pending',
    clientRequestOwnerId: 'u1',
    templateCd: 'timing-test',
    state: 'pending',
    itemCount: null,
    leaseOwnerId: 'owner-live',
    leaseExpiresAt: new Date(Date.now() + 60_000),
  };
  const duplicate = new Error('E11000 duplicate key error');
  (duplicate as Error & { code: number }).code = 11000;
  const requestModel = {
    create: vi.fn(async () => {
      throw duplicate;
    }),
    findOne: vi.fn(async () => livePending),
    findOneAndUpdate: vi.fn(async () => null),
    updateOne: vi.fn(async () => ({ acknowledged: true, matchedCount: 0 })),
  };
  const emptyQuery = (result: unknown[] = []) => ({
    sort: () => emptyQuery(result),
    limit: async () => result,
  });
  const messageModel = {
    create: vi.fn(),
    find: vi.fn(() => emptyQuery([])),
    findOne: vi.fn(async () => null),
  };
  const archiveModel = {
    find: vi.fn(() => emptyQuery([])),
  };
  const getModel = (name: string) => {
    if (name === 'Message') return messageModel as never;
    if (name === 'MessageArchive') return archiveModel as never;
    if (name === 'MessageRequest') return requestModel as never;
    throw new Error(`Unknown model: ${name}`);
  };
  return { getModel, requestModel };
}

describe('MSGF-10 timing validation', () => {
  afterEach(() => {
    defaultRegistry.unregister('timing-test');
    defaultRegistry.unregister('timing-validation-test');
  });

  it('rejects NaN/infinite/fractional/negative/overflow at construction', () => {
    const getModel = (() => {
      throw new Error('must not resolve models during construction validation');
    }) as never;
    const badValues: Array<{ label: string; value: unknown }> = [
      { label: 'NaN', value: Number.NaN },
      { label: 'Infinity', value: Number.POSITIVE_INFINITY },
      { label: '-Infinity', value: Number.NEGATIVE_INFINITY },
      { label: 'fractional', value: 1.5 },
      { label: 'negative', value: -1 },
      { label: 'overflow', value: MAX_MESSAGE_SERVICE_TIMEOUT_MS + 1 },
      { label: 'unsafe-string', value: '100' as unknown },
      { label: 'undefined-object', value: {} as unknown },
    ];
    for (const name of ['clientRequestLeaseMs', 'clientRequestPollMs'] as const) {
      // Zero is also invalid for the positive lease/poll options.
      for (const entry of [...badValues, { label: 'zero', value: 0 }]) {
        expect(
          () => new MessageService({ getModel, [name]: entry.value as number }),
          `${name} should reject ${entry.label}`,
        ).toThrow(InvalidMessageServiceOptionError);
      }
    }
    for (const entry of badValues) {
      expect(
        () => new MessageService({ getModel, clientRequestWaitMs: entry.value as number }),
        `clientRequestWaitMs should reject ${entry.label}`,
      ).toThrow(InvalidMessageServiceOptionError);
    }
    // Negative wait is invalid; zero wait is the supported immediate check.
    expect(() => new MessageService({ getModel, clientRequestWaitMs: -1 })).toThrow(InvalidMessageServiceOptionError);
  });

  it('accepts documented boundaries including zero wait and max timer', () => {
    const getModel = (() => {
      throw new Error('must not resolve models during construction validation');
    }) as never;
    expect(
      () =>
        new MessageService({
          getModel,
          clientRequestLeaseMs: 1,
          clientRequestWaitMs: 0,
          clientRequestPollMs: 1,
        }),
    ).not.toThrow();
    expect(
      () =>
        new MessageService({
          getModel,
          clientRequestLeaseMs: MAX_MESSAGE_SERVICE_TIMEOUT_MS,
          clientRequestWaitMs: MAX_MESSAGE_SERVICE_TIMEOUT_MS,
          clientRequestPollMs: MAX_MESSAGE_SERVICE_TIMEOUT_MS,
        }),
    ).not.toThrow();
    expect(MAX_MESSAGE_SERVICE_TIMEOUT_MS).toBe(2_147_483_647);
  });

  it('zero wait performs an immediate check without sleeping', async () => {
    defaultRegistry.register({ ...testTemplate, templateCd: 'timing-test' });
    const { getModel, requestModel } = stubGetModel();
    const delay = vi.fn(async (_ms: number) => undefined);
    const now = vi.fn(() => 1_000);
    const service = new MessageService({
      getModel,
      registry: defaultRegistry,
      clientRequestWaitMs: 0,
      clientRequestPollMs: 10,
      clientRequestDelay: delay,
      clientRequestNow: now,
    });

    await expect(
      service.createMessage({ templateCd: 'timing-test', user: { _id: 'u1' }, clientRequestId: 'timing-pending' }),
    ).rejects.toBeInstanceOf(ClientRequestPendingError);
    expect(delay).not.toHaveBeenCalled();
    expect(requestModel.create).toHaveBeenCalledTimes(1);
  });

  it('a pending duplicate exits at the bound with controlled poll cadence', async () => {
    defaultRegistry.register({ ...testTemplate, templateCd: 'timing-test' });
    const { getModel } = stubGetModel();
    let now = 1_000;
    const delays: number[] = [];
    const service = new MessageService({
      getModel,
      registry: defaultRegistry,
      clientRequestWaitMs: 100,
      clientRequestPollMs: 30,
      clientRequestDelay: async (ms: number) => {
        delays.push(ms);
        now += ms;
      },
      clientRequestNow: () => now,
    });

    await expect(
      service.createMessage({ templateCd: 'timing-test', user: { _id: 'u1' }, clientRequestId: 'timing-pending' }),
    ).rejects.toBeInstanceOf(ClientRequestPendingError);
    // Deadline 1100 from 1000 with 30ms polls: 30,30,30,10 then pending.
    expect(delays).toEqual([30, 30, 30, 10]);
    expect(now).toBe(1_100);
  });

  it('a wait deadline does not cancel a hung reservation read; the read is awaited', async () => {
    defaultRegistry.register({ ...testTemplate, templateCd: 'timing-test' });
    const livePending = {
      clientRequestId: 'timing-pending',
      clientRequestOwnerId: 'u1',
      templateCd: 'timing-test',
      state: 'pending',
      itemCount: null,
      leaseOwnerId: 'owner-live',
      leaseExpiresAt: new Date(Date.now() + 60_000),
    };
    const duplicate = new Error('E11000 duplicate key error');
    (duplicate as Error & { code: number }).code = 11000;
    let readResolved = false;
    const requestModel = {
      create: vi.fn(async () => {
        throw duplicate;
      }),
      findOne: vi.fn(async () => {
        // Hung database read: resolves after the 10ms wait bound elapsed.
        await new Promise((resolve) => setTimeout(resolve, 50));
        readResolved = true;
        return livePending;
      }),
      findOneAndUpdate: vi.fn(async () => null),
      updateOne: vi.fn(async () => ({ acknowledged: true, matchedCount: 0 })),
    };
    const emptyQuery = (result: unknown[] = []) => ({
      sort: () => emptyQuery(result),
      limit: async () => result,
    });
    const getModel = ((name: string) => {
      if (name === 'MessageRequest') return requestModel as never;
      if (name === 'Message') return { find: () => emptyQuery([]) } as never;
      return { find: () => emptyQuery([]) } as never;
    }) as never;
    const service = new MessageService({
      getModel,
      registry: defaultRegistry,
      clientRequestWaitMs: 10,
      clientRequestPollMs: 5,
    });

    await expect(
      service.createMessage({ templateCd: 'timing-test', user: { _id: 'u1' }, clientRequestId: 'timing-pending' }),
    ).rejects.toBeInstanceOf(ClientRequestPendingError);
    // The slow read was awaited to completion, not cancelled mid-query.
    expect(readResolved).toBe(true);
    expect(requestModel.findOne).toHaveBeenCalled();
  });

  it('stale takeover succeeds and live leases stay protected on real MongoDB', async () => {
    const senderId = new mongoose.Types.ObjectId();
    const receiverId = new mongoose.Types.ObjectId();
    const base: MessageTemplate = {
      templateCd: 'msgf10-timing-reclaim',
      type: 'request',
      description: 'MSGF-10 reclaim',
      senderContent: { title: 'Send', long: 'Send long', short: 'Send' },
      receiverContent: { title: 'Recv', long: 'Recv long', short: 'Recv' },
      uiTemplate: 'default-message',
      prepareMessage: async ({ user }) => ({
        fromUser: (user as { _id: unknown })._id as never,
        toUser: receiverId,
        payload: {},
      }),
      actions: [],
    };
    const fixture = await createMongoMessageServiceFixture({
      templates: [base],
      serviceOptions: { clientRequestLeaseMs: 60_000, clientRequestWaitMs: 1_000, clientRequestPollMs: 5 },
    });
    try {
      const scope = {
        clientRequestId: 'msgf10-reclaim',
        clientRequestOwnerId: String(senderId),
        templateCd: base.templateCd,
      };
      await fixture.models.MessageRequest.create({
        ...scope,
        state: 'pending',
        itemCount: null,
        leaseOwnerId: 'live-owner',
        leaseExpiresAt: new Date(Date.now() + 60_000),
      });
      // Live lease: duplicate exits pending without running preparation.
      await expect(
        fixture.service.createMessage({
          templateCd: base.templateCd,
          user: { _id: senderId },
          clientRequestId: 'msgf10-reclaim',
        }),
      ).rejects.toBeInstanceOf(ClientRequestPendingError);

      // Expired lease: exactly one of two racers commits, the other replays.
      await fixture.models.MessageRequest.updateOne(scope, {
        $set: { leaseExpiresAt: new Date(Date.now() - 1) },
      });
      const [first, second] = await Promise.all([
        fixture.service.createMessage({
          templateCd: base.templateCd,
          user: { _id: senderId },
          clientRequestId: 'msgf10-reclaim',
        }),
        fixture.service.createMessage({
          templateCd: base.templateCd,
          user: { _id: senderId },
          clientRequestId: 'msgf10-reclaim',
        }),
      ]);
      expect(first.map((doc) => String((doc as { _id: unknown })._id))).toEqual(
        second.map((doc) => String((doc as { _id: unknown })._id)),
      );
      expect(await fixture.models.Message.countDocuments(scope)).toBe(1);
    } finally {
      await fixture.close();
    }
  }, 30_000);
});
