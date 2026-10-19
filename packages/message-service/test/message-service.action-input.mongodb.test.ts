import mongoose from 'mongoose';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActionConflictError,
  ActionInputValidationError,
  ActionNotAllowedError,
  ActionRetryableError,
  ActionTemplateMismatchError,
  MessageService,
  createMessageRoutes,
  type ActionContext,
  type MessageAction,
  type MessageTemplate,
} from '../src';
import { createDeferredBarrier, createMessageServiceBarriers } from './support/deferred';
import { createMongoMessageServiceFixture, type MongoMessageServiceFixture } from './support/mongodb-fixture';

const sender = new mongoose.Types.ObjectId();
const reviewer = new mongoose.Types.ObjectId();
const stranger = new mongoose.Types.ObjectId();

function parseNotes(raw: unknown): { notes: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ActionInputValidationError('PRIVATE_INPUT');
  const notes = (raw as { notes?: unknown }).notes;
  if (
    Object.keys(raw).some((key) => key !== 'notes') ||
    typeof notes !== 'string' ||
    notes.length > 2000 ||
    !notes.trim()
  ) {
    throw new ActionInputValidationError('PRIVATE_INPUT');
  }
  return { notes: notes.trim() };
}

function template(action: Partial<MessageAction> = {}): MessageTemplate {
  return {
    templateCd: 'action-input-v1',
    type: 'request',
    description: 'Submitted commands are separate from stored and presentation payloads',
    senderContent: { title: 'S', long: 'S', short: 'S' },
    receiverContent: { title: 'R', long: 'R', short: 'R' },
    uiTemplate: 'card',
    prepareMessage: async () => ({ fromUser: sender, toUser: reviewer, payload: { target: 'stored', ready: true } }),
    actions: [
      {
        actionCd: 'reject',
        name: 'Reject',
        variant: 'danger',
        sender: false,
        receiver: true,
        payload: { notes: 'presentation-only' },
        confirmation: { title: 'Reject', message: 'Reject?', requireNotes: true },
        parseInput: parseNotes,
        runHandler: async ({ input }) => input,
        ...action,
      },
      {
        actionCd: 'other',
        name: 'Other',
        variant: 'primary',
        sender: false,
        receiver: true,
        runHandler: async () => 'other',
      },
    ],
  };
}

describe('MSGA-15 authorized action input', () => {
  const fixtures: MongoMessageServiceFixture[] = [];
  const servers: Server[] = [];

  async function fixture(t = template(), barriers?: ReturnType<typeof createMessageServiceBarriers>) {
    const f = await createMongoMessageServiceFixture({ templates: [t], barriers });
    fixtures.push(f);
    return f;
  }

  async function create(f: MongoMessageServiceFixture) {
    return (await f.service.createMessage({ templateCd: 'action-input-v1', user: { _id: sender } }))[0];
  }

  async function http(service: MessageService, user = { _id: reviewer }) {
    const requests: express.Request[] = [];
    const extracted: express.Request[] = [];
    const app = express();
    app.use(express.json({ strict: false, limit: '16kb' }));
    app.use((req, _res, next) => {
      requests.push(req);
      next();
    });
    const { router } = createMessageRoutes({
      service,
      getUser: (req) => {
        extracted.push(req);
        return user;
      },
    });
    app.use(router.original);
    const server = await new Promise<Server>((resolve) => {
      const started = app.listen(0, '127.0.0.1', () => resolve(started));
    });
    servers.push(server);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return {
      requests,
      extracted,
      async call(id: unknown, input: unknown, actionCd = 'reject') {
        const response = await fetch(`${base}/${id}/action/${actionCd}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        });
        return { status: response.status, body: await response.json() };
      },
      async list(id: unknown) {
        return fetch(`${base}/${id}/actions/receiver`);
      },
    };
  }

  async function stored(f: MongoMessageServiceFixture, id: unknown) {
    return (await f.models.Message.findById(id).lean()) as unknown as Record<string, unknown>;
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    while (servers.length) {
      const server = servers.pop()!;
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
    while (fixtures.length) await fixtures.pop()!.close();
  });

  it.each(['direct', 'http'] as const)('delivers normalized %s input with original req', async (via) => {
    const seen: ActionContext[] = [];
    const parse = vi.fn(parseNotes);
    const t = template({
      parseInput: parse,
      runHandler: async (ctx) => {
        seen.push(ctx);
        return ctx.input;
      },
      senderNotification: async (ctx) => {
        seen.push(ctx);
        return 'Rejected';
      },
    });
    const f = await fixture(t);
    const message = await create(f);
    const input = Object.freeze({ notes: '  original  ' });
    const req = { body: { notes: 'decoy' }, host: 'original request' };
    if (via === 'direct') {
      await expect(
        f.service.handleAction(t.templateCd, 'reject', { message, user: { _id: reviewer }, input, req }),
      ).resolves.toEqual({ notes: 'original' });
      expect(seen[0].req === req).toBe(true);
      expect(parse.mock.calls[0][0] === input).toBe(true);
    } else {
      const route = await http(f.service);
      expect(await route.call(message._id, input)).toEqual({ status: 200, body: { notes: 'original' } });
      expect(seen[0].req === route.requests[0]).toBe(true);
      expect(route.extracted[0] === route.requests[0]).toBe(true);
      expect(parse.mock.calls[0][0] === route.requests[0].body).toBe(true);
      expect(route.requests[0].body).toEqual(input);
    }
    expect(parse).toHaveBeenCalledTimes(1);
    expect(seen[0] === seen[1]).toBe(true);
    expect(seen[0].input).toEqual({ notes: 'original' });
    expect(seen[0].input === input).toBe(false);
    expect(input).toEqual({ notes: '  original  ' });
    expect(req.body).toEqual({ notes: 'decoy' });
    const archived = await f.models.MessageArchive.findById(message._id).lean();
    expect(archived).toMatchObject({ payload: { target: 'stored', ready: true }, actionNotificationState: 'sent' });
    expect(archived).not.toHaveProperty('input');
    expect(t.actions[0].payload).toEqual({ notes: 'presentation-only' });
  });

  it.each([undefined, null, 42, ['raw'], { notes: ' raw ', extra: true }])(
    'passes unparsed input through both adapters without imposing an object schema: %j',
    async (input) => {
      const contexts: ActionContext[] = [];
      const f = await fixture(
        template({
          parseInput: undefined,
          runHandler: async (ctx) => {
            contexts.push(ctx);
            return 'ok';
          },
        }),
      );
      const route = await http(f.service);
      const direct = await create(f);
      const req = { body: { mustNotInfer: true } };
      await expect(
        f.service.handleAction(direct.templateCd, 'reject', { message: direct, user: { _id: reviewer }, input, req }),
      ).resolves.toBe('ok');
      expect(contexts[0].input === input).toBe(true);
      expect(contexts[0].req === req).toBe(true);
      const remote = await create(f);
      expect((await route.call(remote._id, input)).status).toBe(200);
      // Body-parser middleware may supply {} for an absent wire body. The
      // adapter's contract is the exact req.body it receives, without inference.
      expect(contexts[1].input === route.requests[0].body).toBe(true);
      if (input !== undefined) expect(contexts[1].input).toEqual(input);
      expect(contexts[1].req === route.requests[0]).toBe(true);
    },
  );

  it.each([
    undefined,
    null,
    [],
    42,
    {},
    { notes: 7 },
    { notes: '   ' },
    { notes: 'ok', target: 'caller-controlled' },
    { notes: 'x'.repeat(2001) },
  ])('rejects invalid direct/HTTP input before effects and clears the fresh reservation: %j', async (input) => {
    const handler = vi.fn(async () => 'must not run');
    const f = await fixture(template({ runHandler: handler }));
    const route = await http(f.service);
    for (const via of ['direct', 'http']) {
      const message = await create(f);
      if (via === 'direct') {
        await expect(
          f.service.handleAction(message.templateCd, 'reject', { message, user: { _id: reviewer }, input }),
        ).rejects.toBeInstanceOf(ActionInputValidationError);
      } else {
        const result = await route.call(message._id, input);
        expect(result.status).toBe(400);
        expect(result.body.message).toBe('invalid action input');
        expect(JSON.stringify(result.body)).not.toMatch(/PRIVATE|actionAttemptId|cause/);
      }
      expect(await stored(f, message._id)).toMatchObject({
        actionState: 'active',
        actionCd: null,
        actionAttemptId: null,
        actionOwnerToken: null,
        actionClaimedBy: null,
        actionClaimedAt: null,
        actionLeaseExpiresAt: null,
        actionFailureMessage: null,
        payload: { target: 'stored', ready: true },
      });
      expect(await f.models.MessageArchive.countDocuments({ _id: message._id })).toBe(0);
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(['reject', 'other'])('recovers from fresh validation with %s', async (actionCd) => {
    const f = await fixture();
    const message = await create(f);
    await expect(
      f.service.handleAction(message.templateCd, 'reject', { message, user: { _id: reviewer }, input: null }),
    ).rejects.toBeInstanceOf(ActionInputValidationError);
    await expect(
      f.service.handleAction(message.templateCd, actionCd, {
        message,
        user: { _id: reviewer },
        input: { notes: 'fixed' },
      }),
    ).resolves.toEqual(actionCd === 'reject' ? { notes: 'fixed' } : 'other');
  });

  const parserBugs: Array<[string, () => unknown]> = [
    [
      'unexpected error',
      () => {
        throw new Error('PRIVATE_PARSER');
      },
    ],
    [
      'CastError-shaped bug',
      () => {
        throw Object.assign(new Error('PRIVATE_CAST'), { name: 'CastError' });
      },
    ],
    [
      'service-error bug',
      () => {
        throw new ActionNotAllowedError();
      },
    ],
    ['resolved async parser', async () => ({ notes: 'must not run' })],
    [
      'rejected async parser',
      async () => {
        throw new Error('PRIVATE_ASYNC');
      },
    ],
    [
      'rejecting thenable',
      () => ({ then: (_resolve: unknown, reject: (error: unknown) => void) => reject(new Error('PRIVATE_THENABLE')) }),
    ],
    [
      'function thenable',
      () =>
        Object.assign(() => undefined, {
          then: (_resolve: unknown, reject: (error: unknown) => void) => reject(new Error('PRIVATE_FUNCTION')),
        }),
    ],
    [
      'async then method',
      () => ({
        then: async () => {
          throw new Error('PRIVATE_ASYNC_THEN');
        },
      }),
    ],
    ['then method returning a rejection', () => ({ then: () => Promise.reject(new Error('PRIVATE_RETURNED')) })],
    [
      'throwing then getter',
      () =>
        Object.defineProperty({}, 'then', {
          get: () => {
            throw new Error('PRIVATE_GETTER');
          },
        }),
    ],
  ];

  it.each(parserBugs)('rejects %s before handler entry', async (_name, parseInput) => {
    const handler = vi.fn(async () => 'must not run');
    const f = await fixture(template({ parseInput, runHandler: handler }));
    const route = await http(f.service);
    const direct = await create(f);
    await expect(
      f.service.handleAction(direct.templateCd, 'reject', { message: direct, user: { _id: reviewer }, input: {} }),
    ).rejects.toMatchObject({ message: 'action.parseInput failed', cause: expect.any(Error) });
    const remote = await create(f);
    const response = await route.call(remote._id, {});
    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Internal Server Error');
    expect(JSON.stringify(response.body)).not.toMatch(/PRIVATE|cause|actionAttemptId|parseInput/);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(handler).not.toHaveBeenCalled();
    for (const message of [direct, remote])
      expect(await stored(f, message._id)).toMatchObject({ actionState: 'active', actionAttemptId: null });
  });

  it.each(['retry', 'takeover'] as const)('retains a %s attempt on validation failure', async (mode) => {
    const gate = createDeferredBarrier('earlier effect');
    const attempts: Array<string | undefined> = [];
    const handler = vi.fn(async ({ actionAttemptId }: ActionContext) => {
      attempts.push(actionAttemptId);
      if (attempts.length === 1) {
        if (mode === 'takeover') await gate.arrive();
        throw new Error('earlier effect may have happened');
      }
      return 'fixed';
    });
    const f = await fixture(template({ runHandler: handler }));
    const message = await create(f);
    const first = f.service
      .handleAction(message.templateCd, 'reject', { message, user: { _id: reviewer }, input: { notes: 'original' } })
      .catch((error: unknown) => error);
    try {
      if (mode === 'takeover') await gate.reached;
      else expect(await first).toBeInstanceOf(ActionRetryableError);
      const original = await stored(f, message._id);
      await f.models.Message.updateOne({ _id: message._id }, { $set: { actionLeaseExpiresAt: new Date(0) } });
      await expect(
        f.service.handleAction(message.templateCd, 'reject', { message, user: { _id: reviewer }, input: null }),
      ).rejects.toBeInstanceOf(ActionInputValidationError);
      const released = await stored(f, message._id);
      expect(released).toMatchObject({
        actionState: 'retryable',
        actionCd: 'reject',
        actionAttemptId: original.actionAttemptId,
        actionLeaseExpiresAt: null,
      });
      expect(released.actionOwnerToken).not.toBe(original.actionOwnerToken);
      expect(handler).toHaveBeenCalledTimes(1);
      if (mode === 'takeover') {
        gate.release();
        expect(await first).toBeInstanceOf(ActionConflictError);
        expect(await stored(f, message._id)).toEqual(released);
      }
      await expect(
        f.service.handleAction(message.templateCd, 'other', { message, user: { _id: reviewer } }),
      ).rejects.toBeInstanceOf(ActionConflictError);
      await expect(
        f.service.handleAction(message.templateCd, 'reject', {
          message,
          user: { _id: reviewer },
          input: { notes: 'original' },
        }),
      ).resolves.toBe('fixed');
      expect(attempts).toEqual([original.actionAttemptId, original.actionAttemptId]);
    } finally {
      gate.release();
      await first;
    }
  });

  it('keeps an unexpected retry parser failure retryable and keeps handler-thrown validation conservative', async () => {
    const handler = vi.fn(async () => {
      throw new ActionInputValidationError();
    });
    const f = await fixture(template({ runHandler: handler }));
    const message = await create(f);
    await expect(
      f.service.handleAction(message.templateCd, 'reject', {
        message,
        user: { _id: reviewer },
        input: { notes: 'ok' },
      }),
    ).rejects.toMatchObject({ cause: expect.any(ActionInputValidationError), actionAttemptId: expect.any(String) });
    const original = await stored(f, message._id);
    f.registry.register(
      template({
        parseInput: () => {
          throw new Error('parser bug');
        },
        runHandler: handler,
      }),
    );
    const route = await http(f.service);
    expect((await route.call(message._id, { notes: 'ok' })).status).toBe(500);
    expect(await stored(f, message._id)).toMatchObject({
      actionState: 'retryable',
      actionCd: 'reject',
      actionAttemptId: original.actionAttemptId,
      actionLeaseExpiresAt: null,
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it.each(['recipient', 'roles', 'condition', 'template'] as const)('denies stale %s', async (field) => {
    const parse = vi.fn(parseNotes);
    const handler = vi.fn(async () => 'must not run');
    const f = await fixture(
      template({ parseInput: parse, runHandler: handler, condition: (message) => message.payload.ready === true }),
    );
    const message = await create(f);
    if (field === 'roles') {
      message.toUser = null;
      message.toRoles = ['reviewer'];
      await f.models.Message.updateOne({ _id: message._id }, { $set: { toUser: null, toRoles: ['reviewer'] } });
    }
    const change = {
      recipient: { toUser: stranger },
      roles: { toRoles: ['other'] },
      condition: { payload: { ready: false } },
      template: { templateCd: 'changed' },
    }[field];
    await f.models.Message.updateOne({ _id: message._id }, { $set: change });
    await expect(
      f.service.handleAction(message.templateCd, 'reject', {
        message,
        user: { _id: reviewer, roles: ['reviewer'] },
        input: null,
      }),
    ).rejects.toBeInstanceOf(field === 'template' ? ActionTemplateMismatchError : ActionNotAllowedError);
    expect(parse).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(await stored(f, message._id)).toMatchObject({ actionState: 'active', actionAttemptId: null });
  });

  it('selects the current registered parser/handler only after claim and never parses during listings or preliminary denial', async () => {
    const barriers = createMessageServiceBarriers();
    const oldParser = vi.fn(parseNotes);
    const oldHandler = vi.fn(async () => 'old');
    const currentParser = vi.fn(() => ({ version: 'current' }));
    const currentHandler = vi.fn(async ({ input }: ActionContext) => input);
    const f = await fixture(template({ parseInput: oldParser, runHandler: oldHandler }), barriers);
    const message = await create(f);
    await f.service.getActions(String(message._id), 'receiver', { user: { _id: reviewer } });
    await f.service.getActions(String(message._id), 'receiver', { user: { _id: stranger }, isAdmin: true });
    await expect(
      f.service.handleAction(message.templateCd, 'reject', { message, user: { _id: stranger }, input: null }),
    ).rejects.toBeInstanceOf(ActionNotAllowedError);
    const action = f.service.handleAction(message.templateCd, 'reject', {
      message,
      user: { _id: reviewer },
      input: {},
    });
    try {
      await barriers.actionClaimed.reached;
      expect(oldParser).not.toHaveBeenCalled();
      f.registry.register(template({ parseInput: currentParser, runHandler: currentHandler }));
      barriers.actionClaimed.release();
      barriers.archiveCreated.release();
      await expect(action).resolves.toEqual({ version: 'current' });
      expect(currentParser).toHaveBeenCalledExactlyOnceWith({});
      expect(currentHandler).toHaveBeenCalledTimes(1);
      expect(oldParser).not.toHaveBeenCalled();
      expect(oldHandler).not.toHaveBeenCalled();
    } finally {
      barriers.actionClaimed.release();
      barriers.archiveCreated.release();
      await Promise.allSettled([action]);
    }
  });

  it.each(['none', 'pending', 'failed'] as const)('skips parsers for archived %s', async (state) => {
    const parse = vi.fn(parseNotes);
    const handler = vi.fn(async () => 'ok');
    const f = await fixture(template({ parseInput: parse, runHandler: handler }));
    const message = await create(f);
    await f.service.handleAction(message.templateCd, 'reject', {
      message,
      user: { _id: reviewer },
      input: { notes: 'ok' },
    });
    await f.models.MessageArchive.updateOne({ _id: message._id }, { $set: { actionNotificationState: state } });
    parse.mockClear();
    const authorized = await http(f.service);
    const unauthorized = await http(f.service, { _id: stranger });
    expect((await authorized.call(message._id, null)).status).toBe(state === 'none' ? 410 : 202);
    const denied = await unauthorized.call(message._id, null);
    expect(denied.status).toBe(403);
    expect(JSON.stringify(denied.body)).not.toContain('actionAttemptId');
    for (const copy of [message, await f.service.findMessageOrThrow(String(message._id))]) {
      await expect(
        f.service.handleAction(message.templateCd, 'reject', { message: copy, user: { _id: reviewer }, input: null }),
      ).rejects.toMatchObject({ name: state === 'none' ? 'MessageArchivedError' : 'ActionNotificationPendingError' });
    }
    expect((await authorized.list(message._id)).status).toBe(200);
    expect(parse).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it.each(['fresh', 'retry'] as const)('fences %s parser release against takeover', async (mode) => {
    const release = createDeferredBarrier('pre-handler release');
    const replacementGate = createDeferredBarrier('replacement handler');
    const handler = vi.fn(async () => {
      await replacementGate.arrive();
      return 'replacement';
    });
    const f = await fixture(template({ runHandler: handler }));
    const message = await create(f);
    if (mode === 'retry')
      await f.models.Message.updateOne(
        { _id: message._id },
        { $set: { actionState: 'retryable', actionCd: 'reject', actionAttemptId: 'possibly-effectful' } },
      );
    const update = f.models.Message.updateOne.bind(f.models.Message);
    vi.spyOn(f.models.Message, 'updateOne').mockImplementationOnce(
      (...args) => release.arrive().then(() => update(...args)) as never,
    );
    const denied = f.service
      .handleAction(message.templateCd, 'reject', { message, user: { _id: reviewer }, input: null })
      .catch((error: unknown) => error);
    let replacement: Promise<unknown> | undefined;
    try {
      await release.reached;
      const original = await stored(f, message._id);
      await update({ _id: message._id }, { $set: { actionLeaseExpiresAt: new Date(0) } });
      replacement = f.service.handleAction(message.templateCd, 'reject', {
        message,
        user: { _id: reviewer },
        input: { notes: 'valid' },
      });
      await replacementGate.reached;
      const owned = await stored(f, message._id);
      expect(owned.actionAttemptId).toBe(original.actionAttemptId);
      expect(owned.actionOwnerToken).not.toBe(original.actionOwnerToken);
      release.release();
      expect(await denied).toBeInstanceOf(ActionInputValidationError);
      expect(await stored(f, message._id)).toEqual(owned);
      expect(handler).toHaveBeenCalledTimes(1);
      replacementGate.release();
      await expect(replacement).resolves.toBe('replacement');
      expect(await f.models.MessageArchive.findById(message._id).lean()).toMatchObject({
        actionOwnerToken: owned.actionOwnerToken,
        actionAttemptId: owned.actionAttemptId,
      });
    } finally {
      release.release();
      replacementGate.release();
      await Promise.allSettled([denied, replacement]);
    }
  });

  it('preserves an operational release failure instead of reporting validation success/400', async () => {
    const handler = vi.fn(async () => 'must not run');
    const f = await fixture(template({ runHandler: handler }));
    const message = await create(f);
    const error = new Error('database unavailable during release');
    vi.spyOn(f.models.Message, 'updateOne').mockRejectedValueOnce(error);
    await expect(
      f.service.handleAction(message.templateCd, 'reject', { message, user: { _id: reviewer }, input: null }),
    ).rejects.toBe(error);
    expect(handler).not.toHaveBeenCalled();
    expect(await stored(f, message._id)).toMatchObject({ actionState: 'processing' });
  });
});
