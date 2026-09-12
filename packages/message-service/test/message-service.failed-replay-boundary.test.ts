import mongoose from 'mongoose';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createMongoMessageServiceFixture, type MongoMessageServiceFixture } from './support/mongodb-fixture';
import { ClientRequestFailedError } from '../src/message-service';
import { createMessageRoutes } from '../src/route-factory';
import { MESSAGE_ARCHIVE_MODEL_NAME, MESSAGE_MODEL_NAME, MESSAGE_REQUEST_MODEL_NAME } from '../src/schemas/base';
import type { MessageTemplate } from '../src/types/template';

const STABLE_FAILED_MESSAGE = (id: string) =>
  `clientRequestId "${id}" previously failed; retry with a new clientRequestId`;

function baseTemplate(templateCd: string, overrides: Partial<MessageTemplate> = {}): MessageTemplate {
  return {
    templateCd,
    type: 'notification',
    description: 'failed replay boundary test',
    senderContent: { title: 'S', long: 'Sl', short: 'Ss' },
    receiverContent: { title: 'R', long: 'Rl', short: 'Rs' },
    uiTemplate: 'default-message',
    prepareMessage: async ({ user, payload }) => ({
      fromUser: user._id,
      toUser: (payload.toUser as mongoose.Types.ObjectId | undefined) ?? null,
      toRoles: [],
      payload,
    }),
    actions: [],
    ...overrides,
  };
}

describe('MSGF-09 failed replay HTTP boundary', () => {
  const fixtures: MongoMessageServiceFixture[] = [];
  const servers: Array<{ close: (cb?: (e?: Error) => void) => void }> = [];

  async function fixture(options: Parameters<typeof createMongoMessageServiceFixture>[0] = {}) {
    const created = await createMongoMessageServiceFixture(options);
    fixtures.push(created);
    return created;
  }

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (s) =>
          new Promise<void>((resolve, reject) => {
            s.close((e) => (e ? reject(e) : resolve()));
          }),
      ),
    );
    while (fixtures.length > 0) {
      const f = fixtures.pop();
      if (f) await f.close();
    }
  });

  async function liveRoutes(
    created: MongoMessageServiceFixture,
    userId: string,
    getModelOverride?: (name: string) => unknown,
  ) {
    const getModel = ((name: string) => {
      if (getModelOverride) {
        const override = getModelOverride(name);
        if (override) return override;
      }
      if (name === MESSAGE_MODEL_NAME) return created.models.Message;
      if (name === MESSAGE_ARCHIVE_MODEL_NAME) return created.models.MessageArchive;
      if (name === MESSAGE_REQUEST_MODEL_NAME) return created.models.MessageRequest;
      throw new Error(`unknown model ${name}`);
    }) as never;
    let currentUser = userId;
    const { router } = createMessageRoutes({
      getModel,
      registry: created.registry,
      getUser: () => ({ _id: currentUser }),
    });
    const app = express();
    app.use(express.json());
    app.use(router.original);
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    servers.push(server);
    const addr = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${addr.port}`;
    return {
      setUser(id: string) {
        currentUser = id;
      },
      async postCreate(templateCd: string, body: Record<string, unknown>) {
        const res = await fetch(`${base}/new/${templateCd}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        return { status: res.status, text, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
      },
      async postAction(messageId: string, actionCd: string) {
        const res = await fetch(`${base}/${messageId}/action/${actionCd}`, { method: 'POST' });
        const text = await res.text();
        return { status: res.status, text, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
      },
    };
  }

  it('hides a provider diagnostic marker from the HTTP failed-replay body while keeping it in records and the direct error', async () => {
    const marker = `SYNTH-PROVIDER-${Date.now()}-diag`;
    const template = baseTemplate('msgf09-provider', {
      paymentCd: 'pay-code',
      prepareMessage: async ({ user, payload }) => ({
        fromUser: user._id,
        toUser: 'u2',
        toRoles: [],
        payload,
      }),
    });
    const created = await fixture({
      templates: [template],
      serviceOptions: {
        paymentProvider: {
          createSession: async () => {
            throw new Error(marker);
          },
          expireSession: async () => undefined,
          refundPayment: async () => undefined,
        },
      },
    });
    const http = await liveRoutes(created, 'u1');

    // First attempt fails live (original error propagates); retry must be stable.
    // Route service needs the same failing provider: drive the first failure
    // through the fixture service, then retry over HTTP against the shared DB.
    await expect(
      created.service.createMessage({
        templateCd: template.templateCd,
        user: { _id: 'u1' },
        clientRequestId: 'msgf09-prov-1',
      }),
    ).rejects.toThrow(marker);

    const retry = await http.postCreate(template.templateCd, { clientRequestId: 'msgf09-prov-1' });
    expect(retry.status).toBe(409);
    expect(retry.body).toEqual({ message: STABLE_FAILED_MESSAGE('msgf09-prov-1') });
    expect(retry.text).not.toContain(marker);
    expect(JSON.stringify(retry.body)).not.toContain(marker);

    const record = (await created.models.MessageRequest.findOne({
      clientRequestId: 'msgf09-prov-1',
    }).lean()) as unknown as {
      failureMessage?: string;
    };
    expect(record?.failureMessage).toContain(marker);

    const directError = await created.service
      .createMessage({ templateCd: template.templateCd, user: { _id: 'u1' }, clientRequestId: 'msgf09-prov-1' })
      .then(
        () => null,
        (e) => e,
      );
    expect(directError).toBeInstanceOf(ClientRequestFailedError);
    expect((directError as ClientRequestFailedError).message).toBe(STABLE_FAILED_MESSAGE('msgf09-prov-1'));
    expect((directError as ClientRequestFailedError).message).not.toContain(marker);
    expect((directError as ClientRequestFailedError).failureReason).toContain(marker);
    expect((directError as ClientRequestFailedError).clientRequestId).toBe('msgf09-prov-1');
  });

  it('hides template and DB diagnostic markers from HTTP failed-replay bodies', async () => {
    const templateMarker = `SYNTH-TEMPLATE-${Date.now()}-diag`;
    const dbMarker = `SYNTH-DB-${Date.now()}-diag`;
    const templateFail = baseTemplate('msgf09-template', {
      prepareMessage: async () => {
        throw new Error(templateMarker);
      },
    });
    const dbTemplate = baseTemplate('msgf09-db');
    const created = await fixture({ templates: [templateFail, dbTemplate] });

    await expect(
      created.service.createMessage({
        templateCd: 'msgf09-template',
        user: { _id: 'u1' },
        clientRequestId: 'msgf09-tpl-1',
      }),
    ).rejects.toThrow(templateMarker);

    // Force a DB-layer failure once on the next fresh scope, then let the
    // retry hit the recorded failure without touching the model again.
    const rawCreate = created.models.Message.create.bind(created.models.Message);
    let dbThrowOnce = true;
    const throwingMessageModel = new Proxy(created.models.Message, {
      get(target, property, receiver) {
        if (property === 'create') {
          return async (...args: Parameters<typeof rawCreate>) => {
            if (dbThrowOnce) {
              dbThrowOnce = false;
              throw new Error(dbMarker);
            }
            return rawCreate(...args);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const http = await liveRoutes(created, 'u1', (name) =>
      name === MESSAGE_MODEL_NAME ? throwingMessageModel : undefined,
    );
    const firstDb = await http.postCreate('msgf09-db', { clientRequestId: 'msgf09-db-1' });
    expect(firstDb.status).toBe(500);
    // Generic 500s are already sanitized by the response handler; the marker
    // must not appear here either, and is retained on the request record.
    expect(firstDb.text).not.toContain(dbMarker);
    const dbRecord = (await created.models.MessageRequest.findOne({
      clientRequestId: 'msgf09-db-1',
    }).lean()) as unknown as {
      failureMessage?: string;
      state?: string;
    };
    expect(dbRecord?.state).toBe('failed');
    expect(dbRecord?.failureMessage).toContain(dbMarker);

    const http2 = await liveRoutes(created, 'u1');
    const retryTpl = await http2.postCreate('msgf09-template', { clientRequestId: 'msgf09-tpl-1' });
    expect(retryTpl.status).toBe(409);
    expect(retryTpl.body).toEqual({ message: STABLE_FAILED_MESSAGE('msgf09-tpl-1') });
    expect(retryTpl.text).not.toContain(templateMarker);

    const retryDb = await http2.postCreate('msgf09-db', { clientRequestId: 'msgf09-db-1' });
    expect(retryDb.status).toBe(409);
    expect(retryDb.body).toEqual({ message: STABLE_FAILED_MESSAGE('msgf09-db-1') });
    expect(retryDb.text).not.toContain(dbMarker);
    expect(JSON.stringify(retryDb.body)).not.toContain(dbMarker);
  });

  it('keeps authorized pending/conflict/archive HTTP behavior stable', async () => {
    // Pending replay waits the configured bound (default 5 s) before 409.
    const template = baseTemplate('msgf09-lifecycle', {
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'success',
          sender: false,
          receiver: true,
          runHandler: async () => 'ok',
        },
      ],
    });
    const sender = new mongoose.Types.ObjectId();
    const receiver = new mongoose.Types.ObjectId();
    const created = await fixture({ templates: [template] });
    const http = await liveRoutes(created, String(receiver));

    // Pending: live lease owned by another worker → 409 with the scoped id.
    await created.models.MessageRequest.create({
      clientRequestId: 'msgf09-pending',
      clientRequestOwnerId: String(receiver),
      templateCd: 'msgf09-lifecycle',
      state: 'pending',
      itemCount: null,
      leaseOwnerId: 'other-owner',
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    const pending = await http.postCreate('msgf09-lifecycle', { clientRequestId: 'msgf09-pending' });
    expect(pending.status).toBe(409);
    expect(pending.body).toEqual({
      message:
        'clientRequestId "msgf09-pending" is still pending; retry after the current reservation completes or its lease expires',
    });

    // Conflict: claim the message, then a second live claim conflicts → 409.
    const [message] = await created.service.createMessage({
      templateCd: 'msgf09-lifecycle',
      user: { _id: sender },
      payload: { toUser: receiver },
    });
    const messageId = String((message as unknown as { _id: unknown })._id);
    http.setUser(String(receiver));
    await created.models.Message.updateOne(
      { _id: (message as unknown as { _id: unknown })._id },
      {
        $set: {
          actionState: 'processing',
          actionCd: 'approve',
          actionAttemptId: 'live-attempt',
          actionOwnerToken: 'live-token',
          actionLeaseExpiresAt: new Date(Date.now() + 60_000),
        },
      },
    );
    const conflict = await http.postAction(messageId, 'approve');
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({ message: `message "${messageId}" already has an action in progress` });

    // Archive: authorized terminal action → 410; message id preserved after authz.
    await created.models.Message.updateOne(
      { _id: (message as unknown as { _id: unknown })._id },
      { $set: { actionState: 'active', actionAttemptId: null, actionOwnerToken: null } },
    );
    const committed = await http.postAction(messageId, 'approve');
    expect(committed.status).toBe(200);
    const archived = await http.postAction(messageId, 'approve');
    expect(archived.status).toBe(410);
    expect(archived.body).toEqual({ message: `message "${messageId}" is archived` });
  }, 20000);
});
