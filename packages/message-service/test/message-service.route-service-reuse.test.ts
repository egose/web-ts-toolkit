import mongoose from 'mongoose';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvalidMessageServiceOptionError, MessageService } from '../src/message-service';
import { createMessageRoutes } from '../src/route-factory';
import { getMongoReplicaSetUri } from './support/mongodb-fixture';
import { buildMessageArchiveSchema } from '../src/schemas/message-archive';
import { buildMessageRequestSchema } from '../src/schemas/message-request';
import { buildMessageSchema } from '../src/schemas/message';
import { TemplateRegistry } from '../src/template-registry';
import type { MessageTemplate } from '../src/types/template';

const CUSTOM_NAMES = {
  active: 'Msgf11CustomMessage',
  archive: 'Msgf11CustomArchive',
  request: 'Msgf11CustomRequest',
  user: 'User',
} as const;

function baseTemplate(
  templateCd: string,
  receiver: mongoose.Types.ObjectId,
  overrides: Partial<MessageTemplate> = {},
): MessageTemplate {
  return {
    templateCd,
    type: 'request',
    description: 'route service reuse test',
    senderContent: { title: 'S', long: 'Sl', short: 'Ss' },
    receiverContent: { title: 'R', long: 'Rl', short: 'Rs' },
    uiTemplate: 'default-message',
    prepareMessage: async ({ user, payload }) => ({
      fromUser: user._id,
      toUser: (payload.toUser as mongoose.Types.ObjectId | undefined) ?? receiver,
      toRoles: [],
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

type LiveClient = {
  base: string;
  setUser: (user: unknown) => void;
  post: (path: string, body?: unknown, method?: string) => Promise<{ status: number; body: unknown; text: string }>;
};

const servers: Array<{ close: (cb?: (e?: Error) => void) => void }> = [];
const connections: mongoose.Connection[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((resolve, reject) => {
          s.close((e) => (e ? reject(e) : resolve()));
        }),
    ),
  );
  while (connections.length > 0) {
    const c = connections.pop();
    if (c) {
      await c.dropDatabase().catch(() => undefined);
      await c.close();
    }
  }
});

async function createCustomConnection() {
  const connection = await mongoose
    .createConnection(await getMongoReplicaSetUri(), {
      dbName: `msgf11_${new mongoose.Types.ObjectId().toHexString()}`,
      autoIndex: true,
    })
    .asPromise();
  connections.push(connection);
  const models = {
    Message: connection.model(CUSTOM_NAMES.active, buildMessageSchema()),
    MessageArchive: connection.model(CUSTOM_NAMES.archive, buildMessageArchiveSchema()),
    MessageRequest: connection.model(CUSTOM_NAMES.request, buildMessageRequestSchema()),
  };
  await Promise.all(Object.values(models).map((m) => m.init()));
  return { connection, models };
}

function modelGetterFor(models: {
  Message: mongoose.Model<unknown>;
  MessageArchive: mongoose.Model<unknown>;
  MessageRequest: mongoose.Model<unknown>;
}) {
  return ((name: string) => {
    if (name === CUSTOM_NAMES.active) return models.Message;
    if (name === CUSTOM_NAMES.archive) return models.MessageArchive;
    if (name === CUSTOM_NAMES.request) return models.MessageRequest;
    throw new Error(`unknown model ${name}`);
  }) as (name: string) => mongoose.Model<unknown>;
}

async function liveClient(router: { original: unknown }, initialUser: unknown): Promise<LiveClient> {
  let currentUser = initialUser;
  const app = express();
  app.use(express.json());
  app.use(((req, _res, next) => {
    (req as unknown as { user: unknown }).user = currentUser;
    next();
  }) as express.RequestHandler);
  app.use(router.original as express.RequestHandler);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  const addr = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${addr.port}`;
  return {
    base,
    setUser(user: unknown) {
      currentUser = user;
    },
    async post(path: string, body: unknown = {}, method = 'POST') {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      return {
        status: res.status,
        text,
        body:
          text && res.headers.get('content-type')?.includes('application/json') ? (JSON.parse(text) as unknown) : text,
      };
    },
  };
}

async function liveGet(client: LiveClient, path: string) {
  const res = await fetch(`${client.base}${path}`);
  const text = await res.text();
  return {
    status: res.status,
    body: text && res.headers.get('content-type')?.includes('application/json') ? (JSON.parse(text) as unknown) : text,
  };
}

describe('MSGF-11 route service reuse', () => {
  it('reuses the exact injected service with custom model names and the same registry', async () => {
    const sender = new mongoose.Types.ObjectId();
    const receiver = new mongoose.Types.ObjectId();
    const { models } = await createCustomConnection();
    const registry = new TemplateRegistry();
    const template = baseTemplate('msgf11-custom-models', receiver);
    registry.register(template);
    const getModel = modelGetterFor(models);
    const supplied = new MessageService({ getModel, modelNames: { ...CUSTOM_NAMES }, registry });

    const { router, service } = createMessageRoutes({ service: supplied });
    expect(service).toBe(supplied);

    const client = await liveClient(router, { _id: sender });
    const created = await client.post('/new/msgf11-custom-models', {});
    expect(created.status).toBe(200);
    expect(Array.isArray(created.body)).toBe(true);

    // Observable custom-model behavior: the document landed in the custom
    // active collection resolved through the injected service.
    expect(await models.Message.countDocuments({})).toBe(1);
    expect(await models.MessageRequest.countDocuments({})).toBe(0);

    // Same registry instance: late registration after route creation is visible.
    const late = baseTemplate('msgf11-late-registration', receiver);
    registry.register(late);
    const lateCreated = await client.post('/new/msgf11-late-registration', {});
    expect(lateCreated.status).toBe(200);

    // No hidden global registry: a template registered only on the global
    // defaultRegistry is not resolved by these routes.
    const { defaultRegistry } = await import('../src/template-registry');
    const globalOnlyCd = 'msgf11-global-only';
    expect(defaultRegistry.has(globalOnlyCd)).toBe(false);
    defaultRegistry.register(baseTemplate(globalOnlyCd, receiver));
    try {
      const globalOnly = await client.post(`/new/${globalOnlyCd}`, {});
      expect(globalOnly.status).toBe(404);
    } finally {
      defaultRegistry.unregister(globalOnlyCd);
    }
  });

  it('convenience construction forwards custom modelNames observably (no second hidden mapping)', async () => {
    const sender = new mongoose.Types.ObjectId();
    const receiver = new mongoose.Types.ObjectId();
    const { models } = await createCustomConnection();
    const registry = new TemplateRegistry();
    registry.register(baseTemplate('msgf11-convenience-models', receiver));
    const { router, service } = createMessageRoutes({
      getModel: modelGetterFor(models),
      modelNames: { ...CUSTOM_NAMES },
      registry,
    });

    const client = await liveClient(router, { _id: sender });
    const created = await client.post('/new/msgf11-convenience-models', {});
    expect(created.status).toBe(200);
    expect(await models.Message.countDocuments({})).toBe(1);
    // Direct service created by the factory shares the supplied registry.
    const direct = await service.createMessage({
      templateCd: 'msgf11-convenience-models',
      user: { _id: sender },
    });
    expect(direct.length).toBe(1);
    expect(await models.Message.countDocuments({})).toBe(2);
  });

  it('convenience construction forwards provider + compensation hook observably without private inspection', async () => {
    const sender = new mongoose.Types.ObjectId();
    const receiver = new mongoose.Types.ObjectId();
    const { models } = await createCustomConnection();
    const registry = new TemplateRegistry();
    registry.register(baseTemplate('msgf11-provider-convenience', receiver, { paymentCd: 'pay' }));
    const createSession = vi.fn(async () => 'msgf11-sess-convenience');
    const expireSession = vi.fn(async () => undefined);
    const onPaymentCompensationFailure = vi.fn();

    const { router } = createMessageRoutes({
      getModel: modelGetterFor(models),
      modelNames: { ...CUSTOM_NAMES },
      registry,
      paymentProvider: { createSession, expireSession, refundPayment: async () => undefined },
      onPaymentCompensationFailure,
    });
    const client = await liveClient(router, { _id: sender });
    const created = await client.post('/new/msgf11-provider-convenience', {});
    expect(created.status).toBe(200);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession.mock.calls[0]?.[1]).toBe('pay');
    expect(expireSession).not.toHaveBeenCalled();
    expect(onPaymentCompensationFailure).not.toHaveBeenCalled();

    // Force a persistence failure after the session was created: the factory
    // must have forwarded the hook, observable via the hook call (no private read).
    const failingGetModel = ((name: string) => {
      const real = modelGetterFor(models)(name);
      if (name === CUSTOM_NAMES.active) {
        return new Proxy(real, {
          get(target, property, receiverProp) {
            if (property === 'create') {
              return async () => {
                throw new Error('msgf11-persist-boom');
              };
            }
            return Reflect.get(target, property, receiverProp);
          },
        }) as mongoose.Model<unknown>;
      }
      return real;
    }) as (name: string) => mongoose.Model<unknown>;
    const failingExpire = vi.fn(async () => {
      throw new Error('msgf11-expire-boom');
    });
    const failingHook = vi.fn();
    const failingRegistry = new TemplateRegistry();
    failingRegistry.register(baseTemplate('msgf11-provider-fail', receiver, { paymentCd: 'pay' }));
    const failingRoutes = createMessageRoutes({
      getModel: failingGetModel,
      modelNames: { ...CUSTOM_NAMES },
      registry: failingRegistry,
      paymentProvider: {
        createSession: async () => 'msgf11-sess-fail',
        expireSession: failingExpire,
        refundPayment: async () => undefined,
      },
      onPaymentCompensationFailure: failingHook,
    });
    const failingClient = await liveClient(failingRoutes.router, { _id: sender });
    const failed = await failingClient.post('/new/msgf11-provider-fail', {});
    expect([500, 409]).toContain(failed.status);
    expect(failingExpire).toHaveBeenCalledWith('msgf11-sess-fail');
    expect(failingHook).toHaveBeenCalledTimes(1);
    expect(failingHook).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'msgf11-sess-fail', operation: 'expire' }),
    );
  });

  it('injected service honors custom timing + provider observably through the router', async () => {
    const sender = new mongoose.Types.ObjectId();
    const receiver = new mongoose.Types.ObjectId();
    const timingUser = new mongoose.Types.ObjectId();
    const { models } = await createCustomConnection();
    const registry = new TemplateRegistry();
    registry.register(baseTemplate('msgf11-injected-timing', receiver, { paymentCd: 'pay' }));
    const createSession = vi.fn(async () => 'msgf11-sess-injected');
    const delay = vi.fn(async () => undefined);
    const supplied = new MessageService({
      getModel: modelGetterFor(models),
      modelNames: { ...CUSTOM_NAMES },
      registry,
      paymentProvider: { createSession, expireSession: async () => undefined, refundPayment: async () => undefined },
      clientRequestWaitMs: 0,
      clientRequestDelay: delay,
    });
    const { router, service } = createMessageRoutes({ service: supplied });
    expect(service).toBe(supplied);
    const client = await liveClient(router, { _id: timingUser });

    // Live pending lease: with waitMs 0 the duplicate must 409 immediately
    // without sleeping (observable timing behavior, no private read).
    await models.MessageRequest.create({
      clientRequestId: 'msgf11-timing-pending',
      clientRequestOwnerId: String(timingUser),
      templateCd: 'msgf11-injected-timing',
      state: 'pending',
      itemCount: null,
      leaseOwnerId: 'other-owner',
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    const pending = await client.post('/new/msgf11-injected-timing', { clientRequestId: 'msgf11-timing-pending' });
    expect(pending.status).toBe(409);
    expect(pending.body).toEqual({
      message:
        'clientRequestId "msgf11-timing-pending" is still pending; retry after the current reservation completes or its lease expires',
    });
    expect(delay).not.toHaveBeenCalled();

    // Provider behavior flows through the injected service.
    client.setUser({ _id: sender });
    const created = await client.post('/new/msgf11-injected-timing', { clientRequestId: 'msgf11-timing-ok' });
    expect(created.status).toBe(200);
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('rejects every conflicting service option alongside an injected service', () => {
    const supplied = new MessageService({
      getModel: (() => ({}) as never) as (name: string) => mongoose.Model<unknown>,
    });
    const conflicts: Array<Record<string, unknown>> = [
      { getModel: (() => ({})) as never },
      { connection: {} as never },
      { modelNames: { active: 'X' } as never },
      { paymentProvider: null as never },
      { onPaymentCompensationFailure: (() => undefined) as never },
      { adminRoles: [] as never },
      { registry: new TemplateRegistry() as never },
      { defaultListLimit: 10 as never },
      { maxListLimit: 10 as never },
      { clientRequestLeaseMs: 1000 as never },
      { clientRequestWaitMs: 0 as never },
      { clientRequestPollMs: 50 as never },
      { clientRequestDelay: (async () => undefined) as never },
      { clientRequestNow: (() => 0) as never },
    ];
    for (const conflict of conflicts) {
      expect(() => createMessageRoutes({ service: supplied, ...conflict } as never)).toThrow(
        InvalidMessageServiceOptionError,
      );
    }
    // Route-only options remain allowed alongside an injected service.
    expect(() =>
      createMessageRoutes({
        service: supplied,
        getUser: () => ({ _id: 'u1' }),
        getPermissions: () => ({}),
        getIdentity: () => ({}),
        adminPermissionKey: 'is.admin',
        authMiddleware: [],
      }),
    ).not.toThrow();
  });

  it('applies auth-denial + input validation identically on both composition paths', async () => {
    async function buildBoth() {
      const built: Array<{
        kind: string;
        client: LiveClient;
        models: { Message: mongoose.Model<unknown> };
      }> = [];
      for (const kind of ['convenience', 'injected'] as const) {
        const sender = new mongoose.Types.ObjectId();
        const receiver = new mongoose.Types.ObjectId();
        const { models } = await createCustomConnection();
        const registry = new TemplateRegistry();
        registry.register(baseTemplate(`msgf11-parity-${kind}`, receiver));
        const getModel = modelGetterFor(models);
        let router: { original: unknown };
        if (kind === 'convenience') {
          ({ router } = createMessageRoutes({
            getModel,
            modelNames: { ...CUSTOM_NAMES },
            registry,
          }));
        } else {
          const supplied = new MessageService({ getModel, modelNames: { ...CUSTOM_NAMES }, registry });
          const created = createMessageRoutes({ service: supplied });
          expect(created.service).toBe(supplied);
          router = created.router;
        }
        const client = await liveClient(router, { _id: sender });
        built.push({ kind, client, models });
      }
      return built;
    }
    const both = await buildBoth();
    for (const { kind, client, models } of both) {
      // Auth denial before side effects.
      client.setUser(undefined);
      const unauthenticated = await client.post(`/new/msgf11-parity-${kind}`, {});
      expect(unauthenticated.status).toBe(401);
      expect(unauthenticated.body).toEqual({ message: 'authentication required' });
      client.setUser({ _id: 123 });
      const malformed = await client.post(`/new/msgf11-parity-${kind}`, {});
      expect(malformed.status).toBe(401);
      client.setUser({ _id: new mongoose.Types.ObjectId() });

      // Input validation before service/model lookup.
      const badTemplate = await client.post('/new/bad!', {});
      expect(badTemplate.status).toBe(400);
      const badRequestId = await client.post(`/new/msgf11-parity-${kind}`, { clientRequestId: '   ' });
      expect(badRequestId.status).toBe(400);
      const badId = await liveGet(client, '/not-an-object-id/actions/sender');
      expect(badId.status).toBe(400);
      expect(await models.Message.countDocuments({})).toBe(0);
    }
  });

  it('applies error mapping identically on both composition paths', async () => {
    async function buildBoth() {
      const built: Array<{
        kind: string;
        client: LiveClient;
        sender: mongoose.Types.ObjectId;
        receiver: mongoose.Types.ObjectId;
      }> = [];
      for (const kind of ['convenience', 'injected'] as const) {
        const sender = new mongoose.Types.ObjectId();
        const receiver = new mongoose.Types.ObjectId();
        const { models } = await createCustomConnection();
        const registry = new TemplateRegistry();
        registry.register(baseTemplate(`msgf11-errors-${kind}`, receiver));
        const getModel = modelGetterFor(models);
        let router: { original: unknown };
        if (kind === 'convenience') {
          ({ router } = createMessageRoutes({ getModel, modelNames: { ...CUSTOM_NAMES }, registry }));
        } else {
          const supplied = new MessageService({ getModel, modelNames: { ...CUSTOM_NAMES }, registry });
          ({ router } = createMessageRoutes({ service: supplied }));
        }
        built.push({ kind, client: await liveClient(router, { _id: sender }), sender, receiver });
      }
      return built;
    }
    const both = await buildBoth();
    for (const { kind, client, receiver } of both) {
      // Unknown template → 404 on both paths.
      const missing = await client.post('/new/msgf11-unknown-template', {});
      expect(missing.status).toBe(404);

      // Create then deny the action as an unrelated user → 403 with no attempt id.
      const created = await client.post(`/new/msgf11-errors-${kind}`, {});
      expect(created.status).toBe(200);
      const messageId = String((created.body as Array<{ _id: string }>)[0]._id);
      client.setUser({ _id: new mongoose.Types.ObjectId() });
      const denied = await client.post(`/${messageId}/action/approve`);
      expect(denied.status).toBe(403);
      expect(JSON.stringify(denied.body)).not.toContain('actionAttemptId');

      // Authorized action commits → 200; replay after archival → 410.
      client.setUser({ _id: receiver });
      const committed = await client.post(`/${messageId}/action/approve`);
      expect(committed.status).toBe(200);
      const archived = await client.post(`/${messageId}/action/approve`);
      expect(archived.status).toBe(410);
    }
  });
});
