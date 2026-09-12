import mongoose from 'mongoose';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  InvalidMessageUserError,
  MessageService,
  isValidMessageUserId,
  requireMessageUserId,
} from '../src/message-service';
import { createMessageRoutes } from '../src/route-factory';
import type { MessageTemplate } from '../src/types/template';

const INVALID_IDS: Array<{ label: string; id: unknown }> = [
  { label: 'missing', id: undefined },
  { label: 'null', id: null },
  { label: 'empty', id: '' },
  { label: 'whitespace', id: '   ' },
  { label: 'numeric', id: 123 as unknown },
  { label: 'array', id: ['u1'] as unknown },
  { label: 'plain-object', id: { toString: () => 'u1' } as unknown },
];

function buildServiceMocks() {
  const prepareMessage = vi.fn(async ({ user, payload }: any) => ({
    fromUser: user._id,
    toUser: (payload as any)?.toUser ?? null,
    payload,
  }));
  const createSession = vi.fn(async () => 'session-1');
  const expireSession = vi.fn(async () => undefined);
  const refundPayment = vi.fn(async () => undefined);
  const template: MessageTemplate = {
    templateCd: 'principal-test',
    type: 'request',
    description: 'principal validation',
    senderContent: { title: 'S', long: 'Sl', short: 'Ss' },
    receiverContent: { title: 'R', long: 'Rl', short: 'Rs' },
    uiTemplate: 'default-message',
    prepareMessage,
    actions: [],
  };
  const messageCreate = vi.fn(async (data: any) => ({ ...data, _id: 'msg-1' }));
  const requestCreate = vi.fn(async (data: any) => ({ ...data }));
  const getModel = vi.fn((name: string) => {
    if (name === 'Message') return { create: messageCreate, findById: vi.fn(async () => null) } as never;
    if (name === 'MessageRequest')
      return {
        create: requestCreate,
        findOne: vi.fn(async () => null),
        findOneAndUpdate: vi.fn(async () => null),
        updateOne: vi.fn(async () => ({ matchedCount: 1 })),
      } as never;
    if (name === 'MessageArchive') return { findById: vi.fn(async () => null) } as never;
    throw new Error(`Unknown model: ${name}`);
  });
  return {
    prepareMessage,
    createSession,
    expireSession,
    refundPayment,
    template,
    messageCreate,
    requestCreate,
    getModel,
  };
}

describe('MSGF-03 principal validation', () => {
  it('shares one contract between service and routes', () => {
    for (const { id } of INVALID_IDS) {
      expect(isValidMessageUserId(id)).toBe(false);
      expect(() => requireMessageUserId({ _id: id } as never)).toThrow(InvalidMessageUserError);
      expect(() => requireMessageUserId(undefined)).toThrow(InvalidMessageUserError);
    }
    expect(isValidMessageUserId('u1')).toBe(true);
    expect(isValidMessageUserId('  u1  ')).toBe(true);
    const oid = new mongoose.Types.ObjectId();
    expect(isValidMessageUserId(oid)).toBe(true);
    expect(requireMessageUserId({ _id: '  u1  ' })).toBe('u1');
    expect(requireMessageUserId({ _id: oid })).toBe(String(oid));
  });

  it.each(INVALID_IDS)('rejects $label user before effects without clientRequestId', async ({ id }) => {
    const mocks = buildServiceMocks();
    const { defaultRegistry } = await import('../src/template-registry');
    defaultRegistry.register(mocks.template);
    try {
      const service = new MessageService({
        getModel: mocks.getModel,
        paymentProvider: {
          createSession: mocks.createSession,
          expireSession: mocks.expireSession,
          refundPayment: mocks.refundPayment,
        },
        registry: defaultRegistry,
      });
      await expect(
        service.createMessage({
          templateCd: mocks.template.templateCd,
          user: { _id: id } as never,
          payload: {},
        }),
      ).rejects.toBeInstanceOf(InvalidMessageUserError);
      expect(mocks.prepareMessage).not.toHaveBeenCalled();
      expect(mocks.createSession).not.toHaveBeenCalled();
      expect(mocks.messageCreate).not.toHaveBeenCalled();
    } finally {
      const { defaultRegistry: reg } = await import('../src/template-registry');
      reg.unregister(mocks.template.templateCd);
    }
  });

  it.each(INVALID_IDS)('rejects $label user before effects with clientRequestId', async ({ id }) => {
    const mocks = buildServiceMocks();
    const { defaultRegistry } = await import('../src/template-registry');
    defaultRegistry.register(mocks.template);
    try {
      const service = new MessageService({
        getModel: mocks.getModel,
        paymentProvider: {
          createSession: mocks.createSession,
          expireSession: mocks.expireSession,
          refundPayment: mocks.refundPayment,
        },
        registry: defaultRegistry,
      });
      await expect(
        service.createMessage({
          templateCd: mocks.template.templateCd,
          user: { _id: id } as never,
          payload: {},
          clientRequestId: 'req-1',
        }),
      ).rejects.toBeInstanceOf(InvalidMessageUserError);
      expect(mocks.prepareMessage).not.toHaveBeenCalled();
      expect(mocks.createSession).not.toHaveBeenCalled();
      expect(mocks.messageCreate).not.toHaveBeenCalled();
      expect(mocks.requestCreate).not.toHaveBeenCalled();
      expect(mocks.getModel).not.toHaveBeenCalled();
    } finally {
      const { defaultRegistry: reg } = await import('../src/template-registry');
      reg.unregister(mocks.template.templateCd);
    }
  });

  it.each(INVALID_IDS)('rejects $label payerUser before effects', async ({ id }) => {
    const mocks = buildServiceMocks();
    const { defaultRegistry } = await import('../src/template-registry');
    defaultRegistry.register(mocks.template);
    try {
      const service = new MessageService({ getModel: mocks.getModel, registry: defaultRegistry });
      await expect(
        service.createMessage({
          templateCd: mocks.template.templateCd,
          user: { _id: 'u1' },
          payerUser: { _id: id } as never,
          payload: {},
        }),
      ).rejects.toBeInstanceOf(InvalidMessageUserError);
      expect(mocks.prepareMessage).not.toHaveBeenCalled();
      expect(mocks.messageCreate).not.toHaveBeenCalled();
    } finally {
      const { defaultRegistry: reg } = await import('../src/template-registry');
      reg.unregister(mocks.template.templateCd);
    }
  });

  it('preserves valid string and ObjectId principals', async () => {
    const mocks = buildServiceMocks();
    const { defaultRegistry } = await import('../src/template-registry');
    defaultRegistry.register(mocks.template);
    try {
      const service = new MessageService({ getModel: mocks.getModel, registry: defaultRegistry });
      const stringResult = await service.createMessage({
        templateCd: mocks.template.templateCd,
        user: { _id: 'u1' },
        payload: {},
      });
      expect(stringResult).toHaveLength(1);

      const oid = new mongoose.Types.ObjectId();
      const oidResult = await service.createMessage({
        templateCd: mocks.template.templateCd,
        user: { _id: oid },
        payload: {},
      });
      expect(oidResult).toHaveLength(1);
      // Original ObjectId type preserved for storage (not stringified by create path).
      expect(mocks.messageCreate.mock.calls[1][0].fromUser).toBe(oid);
    } finally {
      const { defaultRegistry: reg } = await import('../src/template-registry');
      reg.unregister(mocks.template.templateCd);
    }
  });

  it.each(INVALID_IDS)('getActions rejects $label user before model lookup', async ({ id }) => {
    const getModel = vi.fn(() => {
      throw new Error('model lookup must not run');
    });
    const service = new MessageService({ getModel });
    await expect(
      service.getActions('507f1f77bcf86cd799439011', 'receiver', { user: { _id: id } as never }), // pragma: allowlist secret
    ).rejects.toBeInstanceOf(InvalidMessageUserError);
    expect(getModel).not.toHaveBeenCalled();
  });

  it('getActions rejects missing user before lookup even with a supplied message', async () => {
    const getModel = vi.fn(() => {
      throw new Error('model lookup must not run');
    });
    const service = new MessageService({ getModel });
    await expect(
      service.getActions(
        '507f1f77bcf86cd799439011', // pragma: allowlist secret
        'receiver',
        { message: { templateCd: 'x' } as never },
      ),
    ).rejects.toBeInstanceOf(InvalidMessageUserError);
    expect(getModel).not.toHaveBeenCalled();
  });
});

describe('MSGF-03 route principal validation', () => {
  const servers: Array<{ close: (cb?: (e?: Error) => void) => void }> = [];
  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (s) =>
          new Promise<void>((resolve, reject) => {
            s.close((e) => (e ? reject(e) : resolve()));
          }),
      ),
    );
  });

  async function createClient(getUser: () => unknown) {
    const getModel = vi.fn(() => ({}) as never);
    const { router, service } = createMessageRoutes({ getModel, getUser: getUser as never });
    service.createMessage = vi.fn(async () => []);
    service.getActions = vi.fn(async () => ({ uiTemplate: 'request', actions: [] }));
    const app = express();
    app.use(express.json());
    app.use(router.original);
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const started = app.listen(0, () => resolve(started));
    });
    servers.push(server);
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    return {
      service,
      getModel,
      async request(path: string, init?: RequestInit) {
        const response = await fetch(`${baseUrl}${path}`, init);
        const text = await response.text();
        return {
          status: response.status,
          body:
            text && response.headers.get('content-type')?.includes('application/json')
              ? (JSON.parse(text) as unknown)
              : text,
        };
      },
    };
  }

  it.each(INVALID_IDS)(
    'create route rejects $label id from custom extractor before service effects',
    async ({ id }) => {
      const client = await createClient(() => ({ _id: id }) as never);
      const response = await client.request('/new/svc-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ message: 'authentication required' });
      expect(client.service.createMessage).not.toHaveBeenCalled();
      expect(client.getModel).not.toHaveBeenCalled();
    },
  );

  it.each(INVALID_IDS)('getActions route rejects $label id before service lookup', async ({ id }) => {
    const client = await createClient(() => ({ _id: id }) as never);
    const response = await client.request('/507f1f77bcf86cd799439011/actions/receiver');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: 'authentication required' });
    expect(client.service.getActions).not.toHaveBeenCalled();
    expect(client.getModel).not.toHaveBeenCalled();
  });

  it('create route preserves valid ObjectId principals', async () => {
    const oid = new mongoose.Types.ObjectId();
    const client = await createClient(() => ({ _id: oid }) as never);
    const response = await client.request('/new/svc-test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Service is stubbed; reaching it proves the principal passed route validation.
    expect(client.service.createMessage).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
  });
});
