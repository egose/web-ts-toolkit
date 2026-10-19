import mongoose from 'mongoose';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActionNotAllowedError,
  ActionNotificationPendingError,
  InvalidMessageUserError,
  MessageArchivedError,
  MessageModelResolutionError,
  MessageNotFoundError,
  MessageService,
} from '../src/message-service';
import type { IMessage, IMessageArchive, MessageUser } from '../src/types/message';
import type { ActionContext, MessageTemplate } from '../src/types/template';
import { createMessageRoutes } from '../src/route-factory';
import { createMongoMessageServiceFixture, type MongoMessageServiceFixture } from './support/mongodb-fixture';

const sender = new mongoose.Types.ObjectId();
const receiver = new mongoose.Types.ObjectId();
const replacement = new mongoose.Types.ObjectId();
const PRINCIPAL_SHAPES = ['plain', 'getter', 'hydrated'] as const;

async function principalUser(
  f: MongoMessageServiceFixture,
  shape: (typeof PRINCIPAL_SHAPES)[number],
  _id: mongoose.Types.ObjectId,
  roles: unknown,
): Promise<MessageUser> {
  const displayName = 'Principal Reviewer';
  if (shape === 'plain') return { _id, id: String(_id), roles, displayName, passwordHash: 'private' } as MessageUser;
  if (shape === 'getter') {
    return Object.create({
      get _id() {
        return _id;
      },
      get id() {
        return String(_id);
      },
      get roles() {
        return roles;
      },
      get displayName() {
        return displayName;
      },
    }) as MessageUser;
  }
  const User =
    f.connection.models.PrincipalUser ??
    f.connection.model(
      'PrincipalUser',
      // Mixed deliberately preserves malformed adapter values instead of casting strings to arrays.
      new mongoose.Schema({ roles: mongoose.Schema.Types.Mixed, displayName: String, passwordHash: String }),
    );
  await User.replaceOne({ _id }, { _id, roles, displayName, passwordHash: 'private' }, { upsert: true });
  return (await User.findById(_id).orFail()) as unknown as MessageUser;
}

function template(overrides: Partial<MessageTemplate> = {}): MessageTemplate {
  return {
    templateCd: 'authoritative-read',
    type: 'request',
    description: 'Authoritative reads',
    senderContent: { title: 'S', long: 'S' },
    receiverContent: { title: 'R', long: 'R' },
    uiTemplate: { sender: 'sender-view', receiver: 'receiver-view' },
    prepareMessage: async ({ payload }) => ({ fromUser: sender, toUser: receiver, payload }),
    actions: [
      {
        actionCd: 'approve',
        name: 'Approve {{label}}',
        variant: 'primary',
        sender: true,
        receiver: true,
        condition: (message) => (message.payload as { ready?: boolean })?.ready === true,
        runHandler: async () => 'approved',
      },
    ],
    ...overrides,
  };
}

describe('MSGR-04 authoritative action reads and archived outcomes', () => {
  const fixtures: MongoMessageServiceFixture[] = [];
  async function fixture(templates = [template()]) {
    const value = await createMongoMessageServiceFixture({ templates });
    fixtures.push(value);
    return value;
  }
  async function create(f: MongoMessageServiceFixture): Promise<IMessage> {
    const [message] = await f.service.createMessage({
      templateCd: 'authoritative-read',
      user: { _id: sender },
      payload: { ready: true, label: 'Old' },
    });
    return message as IMessage;
  }
  async function archive(f: MongoMessageServiceFixture): Promise<IMessageArchive> {
    const message = await create(f);
    await f.service.handleAction(message.templateCd, 'approve', { message, user: { _id: receiver } });
    await f.models.MessageArchive.updateOne(
      { _id: message._id },
      {
        $set: { actionNotificationState: 'failed', actionAttemptId: 'persisted-attempt' },
      },
    );
    return (await f.service.findMessageOrThrow(String(message._id))) as IMessageArchive;
  }
  afterEach(async () => {
    vi.restoreAllMocks();
    while (fixtures.length) await fixtures.pop()!.close();
  });

  it.each(['recipient', 'sender', 'roles', 'template', 'condition'] as const)(
    'ignores a same-ID supplied copy after stored %s changes',
    async (field) => {
      const f = await fixture();
      const stale = await create(f);
      const user = field === 'sender' ? { _id: sender } : { _id: receiver, roles: ['reviewer'] };
      if (field === 'roles') {
        await f.models.Message.updateOne({ _id: stale._id }, { $set: { toUser: null, toRoles: ['reviewer'] } });
        stale.toUser = null;
        stale.toRoles = ['reviewer'];
      }
      const update = {
        recipient: { toUser: replacement },
        sender: { fromUser: replacement },
        roles: { toRoles: ['other'] },
        template: { templateCd: 'unregistered' },
        condition: { payload: { ready: false, label: 'Current' } },
      }[field];
      await f.models.Message.updateOne({ _id: stale._id }, { $set: update });
      const result = await f.service.getActions(String(stale._id), field === 'sender' ? 'sender' : 'receiver', {
        user,
        message: stale,
      });
      expect(result).toEqual(field === 'condition' ? { uiTemplate: 'receiver-view', actions: [] } : null);
    },
  );

  it('binds listing to the requested ID, current template and payload, ignoring even a foreign-connection copy', async () => {
    const f = await fixture([
      template(),
      template({
        templateCd: 'replacement-template',
        uiTemplate: 'replacement-view',
        actions: [{ ...template().actions[0], actionCd: 'replacement-action' }],
      }),
    ]);
    const foreign = await fixture();
    const stale = await create(foreign);
    const current = await create(f);
    expect(
      await f.service.getActions(String(stale._id), 'receiver', {
        user: { _id: receiver },
        message: stale,
      }),
    ).toBeNull();
    await f.models.Message.updateOne(
      { _id: current._id },
      {
        $set: { templateCd: 'replacement-template', payload: { ready: true, label: 'Current' } },
      },
    );
    const result = await f.service.getActions(String(current._id), 'receiver', {
      user: { _id: receiver },
      message: stale,
    });
    expect(result?.uiTemplate).toBe('replacement-view');
    expect(result?.actions).toMatchObject([{ actionCd: 'replacement-action', name: 'Approve Current' }]);
    await f.models.Message.deleteOne({ _id: current._id });
    expect(
      await f.service.getActions(String(current._id), 'receiver', {
        user: { _id: receiver },
        message: current,
      }),
    ).toBeNull();
  });

  it('uses stored archive state and skips predicates for archives and admins, including stale active copies', async () => {
    const condition = vi.fn(() => true);
    const f = await fixture([template({ actions: [{ ...template().actions[0], condition }] })]);
    const active = await create(f);
    await f.service.handleAction(active.templateCd, 'approve', { message: active, user: { _id: receiver } });
    condition.mockClear();
    const query = { user: { _id: receiver }, message: active };
    expect(await f.service.getActions(String(active._id), 'receiver', query)).toEqual({
      uiTemplate: 'receiver-view',
      actions: [],
    });
    await f.models.MessageArchive.updateOne({ _id: active._id }, { $set: { toUser: replacement } });
    expect(await f.service.getActions(String(active._id), 'receiver', query)).toBeNull();
    const next = await create(f);
    expect(
      await f.service.getActions(String(next._id), 'receiver', {
        user: { _id: replacement },
        isAdmin: true,
      }),
    ).toEqual({ uiTemplate: 'receiver-view', actions: [] });
    expect(condition).not.toHaveBeenCalled();
  });

  it.each(['sender', 'recipient', 'roles'] as const)(
    'denies stale archived %s without disclosing outcome details',
    async (field) => {
      const f = await fixture();
      let stale = await archive(f);
      if (field === 'roles') {
        await f.models.MessageArchive.updateOne({ _id: stale._id }, { $set: { toUser: null, toRoles: ['reviewer'] } });
        stale = (await f.service.findMessageOrThrow(String(stale._id))) as IMessageArchive;
      }
      const update = {
        sender: { fromUser: replacement },
        recipient: { toUser: replacement },
        roles: { toRoles: ['other'] },
      }[field];
      await f.models.MessageArchive.updateOne({ _id: stale._id }, { $set: update });
      const error = await f.service
        .handleAction(stale.templateCd, 'approve', {
          message: stale,
          user: { _id: field === 'sender' ? sender : receiver, roles: ['reviewer'] },
        })
        .catch((value: unknown) => value);
      expect(error).toBeInstanceOf(ActionNotAllowedError);
      expect(error).not.toHaveProperty('actionAttemptId');
      expect(String(error)).not.toContain('persisted-attempt');
      expect(
        await f.service.getActions(String(stale._id), field === 'sender' ? 'sender' : 'receiver', {
          user: { _id: field === 'sender' ? sender : receiver, roles: ['reviewer'] },
          message: stale,
        }),
      ).toBeNull();
    },
  );

  it('reports current archived notification state/attempt without a template and rejects a deleted archive', async () => {
    const f = await fixture();
    const stale = await archive(f);
    f.registry.unregister(stale.templateCd);
    await f.models.MessageArchive.updateOne(
      { _id: stale._id },
      {
        $set: { actionAttemptId: 'new-attempt', actionNotificationState: 'pending' },
      },
    );
    await expect(
      f.service.handleAction('removed', 'removed', { message: stale, user: { _id: sender } }),
    ).rejects.toMatchObject({ name: 'ActionNotificationPendingError', actionAttemptId: 'new-attempt' });
    await f.models.MessageArchive.updateOne({ _id: stale._id }, { $set: { actionNotificationState: 'sent' } });
    await expect(
      f.service.handleAction('removed', 'removed', { message: stale, user: { _id: receiver } }),
    ).rejects.toBeInstanceOf(MessageArchivedError);
    await f.models.MessageArchive.deleteOne({ _id: stale._id });
    await expect(
      f.service.handleAction('removed', 'removed', { message: stale, user: { _id: receiver } }),
    ).rejects.toBeInstanceOf(MessageNotFoundError);
  });

  it('normalizes populated sender/receiver identities, and authorizes before condition presentation population', async () => {
    const condition = vi.fn((message: Record<string, unknown>) => {
      const party = message.toUser as { displayName?: string };
      return party.displayName === 'Receiver';
    });
    const handler = vi.fn(async () => 'approved');
    const f = await fixture([template({ actions: [{ ...template().actions[0], condition, runHandler: handler }] })]);
    const User = f.connection.model('ReadUser', new mongoose.Schema({ displayName: String }));
    await User.create([
      { _id: sender, displayName: 'Sender' },
      { _id: receiver, displayName: 'Receiver' },
    ]);
    const active = await create(f);
    const populate = [
      { path: 'fromUser', model: User },
      { path: 'toUser', model: User },
    ];
    const populated = await f.service.findMessageOrThrow(String(active._id), { populate });
    expect(populated.isSender({ _id: sender })).toBe(true);
    expect(populated.isReceiver({ _id: receiver })).toBe(true);
    const projected = await f.service.findMessageOrThrow(String(active._id), {
      populate: populate.map((item) => ({ ...item, select: 'displayName -_id' })),
    });
    expect(projected.isSender({ _id: sender })).toBe(false);
    expect(projected.isReceiver({ _id: receiver })).toBe(false);
    expect(projected.isReceiver({ _id: '[object Object]' })).toBe(false);
    expect(await f.service.getActions(String(active._id), 'sender', { user: { _id: sender }, populate })).toMatchObject(
      { actions: [{ actionCd: 'approve' }] },
    );
    expect(
      await f.service.getActions(String(active._id), 'receiver', { user: { _id: receiver }, populate }),
    ).toMatchObject({ actions: [{ actionCd: 'approve' }] });
    condition.mockClear();
    const populateSpy = vi.spyOn(User, 'find');
    expect(
      await f.service.getActions(String(active._id), 'receiver', { user: { _id: replacement }, populate }),
    ).toBeNull();
    expect(populateSpy).not.toHaveBeenCalled();
    expect(condition).not.toHaveBeenCalled();
    // A populated pre-check can pass, but mutation must still check the unpopulated atomic claim.
    await expect(
      f.service.handleAction(active.templateCd, 'approve', { message: populated, user: { _id: receiver } }),
    ).rejects.toBeInstanceOf(ActionNotAllowedError);
    expect(handler).not.toHaveBeenCalled();
    expect(await f.models.Message.findById(active._id).lean()).toMatchObject({
      actionState: 'active',
      actionAttemptId: null,
    });
    // Conditions shared with mutations must support unpopulated identities.
    f.registry.register(template());
    await expect(
      f.service.handleAction(active.templateCd, 'approve', { message: populated, user: { _id: receiver } }),
    ).resolves.toBe('approved');
    const archived = await f.service.findMessageOrThrow(String(active._id), { populate });
    expect(archived.isSender({ _id: sender })).toBe(true);
    expect(archived.isReceiver({ _id: receiver })).toBe(true);
    await expect(
      f.service.handleAction(active.templateCd, 'approve', { message: archived, user: { _id: sender } }),
    ).rejects.toBeInstanceOf(MessageArchivedError);
  });

  it('never grants missing populated identities, while canonical IDs and explicit recipient roles retain their meaning', async () => {
    const f = await fixture();
    const User = f.connection.model('DeletedReadUser', new mongoose.Schema({ displayName: String }));
    await User.create([{ _id: sender }, { _id: receiver }]);
    const active = await create(f);
    await User.deleteMany({});
    const populate = [
      { path: 'fromUser', model: User },
      { path: 'toUser', model: User },
    ];
    const missing = await f.service.findMessageOrThrow(String(active._id), { populate });
    expect(missing.fromUser).toBeNull();
    expect(missing.toUser).toBeNull();
    for (const id of [sender, receiver, 'null', 'undefined', '[object Object]']) {
      expect(missing.isSender({ _id: id })).toBe(false);
      expect(missing.isReceiver({ _id: id })).toBe(false);
    }
    // Message relationships do not perform host account-liveness checks: the stored ID is authoritative.
    expect(
      await f.service.getActions(String(active._id), 'receiver', { user: { _id: receiver }, populate }),
    ).toMatchObject({ actions: [{ actionCd: 'approve' }] });
    await f.models.Message.updateOne(
      { _id: active._id },
      { $set: { fromUser: null, toUser: null, toRoles: ['reviewer'] } },
    );
    for (const id of [sender, receiver, 'null', 'undefined']) {
      expect(await f.service.getActions(String(active._id), 'receiver', { user: { _id: id }, populate })).toBeNull();
    }
    expect(
      await f.service.getActions(String(active._id), 'receiver', {
        user: { _id: replacement, roles: ['reviewer'] },
        populate,
      }),
    ).toMatchObject({ actions: [{ actionCd: 'approve' }] });
  });

  describe('MSGA-02 principal shape parity', () => {
    describe.each(PRINCIPAL_SHAPES)('%s caller', (shape) => {
      it.each(['sender', 'direct recipient', 'role recipient'] as const)(
        'keeps inbox, actions, handler fields and stored archived outcomes consistent for a %s',
        async (relationship) => {
          const handler = vi.fn(async (ctx: ActionContext) => ctx.user);
          const f = await fixture([
            template({
              prepareMessage: async ({ payload }) => ({
                fromUser: sender,
                toUser: receiver,
                toRoles: ['reviewer'],
                payload,
              }),
              actions: [{ ...template().actions[0], runHandler: handler }],
            }),
          ]);
          const id = relationship === 'sender' ? sender : relationship === 'direct recipient' ? receiver : replacement;
          const roles = relationship === 'role recipient' ? ['reviewer'] : undefined;
          const user = await principalUser(f, shape, id, roles);
          const privateRead = vi.fn(() => 'private');
          Object.defineProperty(user, 'privateToken', { enumerable: true, get: privateRead });
          const serializers =
            shape === 'hydrated'
              ? [
                  vi.spyOn(user as unknown as mongoose.Document, 'toObject'),
                  vi.spyOn(user as unknown as mongoose.Document, 'toJSON'),
                ]
              : [];
          const ownKeys = Reflect.ownKeys(user);
          const originalRoles = user.roles;
          const roleValues = user.roles?.slice();
          const req = Object.freeze({ body: { notes: 'original request' } });
          const active = await create(f);
          const messageId = String(active._id);
          const usertype = relationship === 'sender' ? 'sender' : 'receiver';

          expect(active.isSender(user)).toBe(relationship === 'sender');
          expect(active.isReceiver(user)).toBe(relationship !== 'sender');
          expect((await f.service.listMessages({ user })).map((message) => String(message._id))).toEqual([messageId]);
          await expect(f.service.countMessages(user)).resolves.toBe(1);
          await expect(f.service.getActions(messageId, usertype, { user })).resolves.toMatchObject({
            actions: [{ actionCd: 'approve' }],
          });
          const result = await f.service.handleAction(active.templateCd, 'approve', { message: active, user, req });
          expect(result).toEqual({
            _id: String(id),
            id: String(id),
            roles: roleValues,
            displayName: 'Principal Reviewer',
          });
          // Compare identity without asking the matcher to inspect the private user object.
          expect(result === user).toBe(false);
          expect(handler.mock.calls[0][0].req).toBe(req);
          expect(handler.mock.calls[0][0].actionAttemptId).toEqual(expect.any(String));
          expect(await f.models.Message.countDocuments({ _id: active._id })).toBe(0);
          const archived = (await f.service.findMessageOrThrow(messageId)) as IMessageArchive;
          expect(String(archived.archivedBy)).toBe(String(id));
          expect(archived.isSender(user)).toBe(relationship === 'sender');
          expect(archived.isReceiver(user)).toBe(relationship !== 'sender');
          await expect(f.service.listMessages({ user })).resolves.toEqual([]);
          await expect(f.service.countMessages(user)).resolves.toBe(0);
          await expect(f.service.getActions(messageId, usertype, { user })).resolves.toMatchObject({ actions: [] });

          // Cover both explicit archive input and the claim fallback from a stale active copy.
          for (const message of [active, archived]) {
            await expect(
              f.service.handleAction(active.templateCd, 'approve', { message, user }),
            ).rejects.toBeInstanceOf(MessageArchivedError);
          }
          await f.models.MessageArchive.updateOne({ _id: active._id }, { $set: { actionNotificationState: 'failed' } });
          for (const message of [active, archived]) {
            await expect(f.service.handleAction(active.templateCd, 'approve', { message, user })).rejects.toMatchObject(
              {
                name: 'ActionNotificationPendingError',
                actionAttemptId: archived.actionAttemptId,
              },
            );
          }

          // Getter preservation must not turn stale caller copies into authorization grants.
          await f.models.MessageArchive.updateOne(
            { _id: active._id },
            { $set: { fromUser: null, toUser: null, toRoles: ['other'] } },
          );
          await expect(f.service.getActions(messageId, usertype, { user, message: archived })).resolves.toBeNull();
          for (const message of [active, archived]) {
            const error = await f.service
              .handleAction(active.templateCd, 'approve', { message, user })
              .catch((value: unknown) => value);
            expect(error).toBeInstanceOf(ActionNotAllowedError);
            expect(error).not.toHaveProperty('actionAttemptId');
          }
          expect(handler).toHaveBeenCalledTimes(1);
          expect(privateRead).not.toHaveBeenCalled();
          for (const serializer of serializers) expect(serializer).not.toHaveBeenCalled();
          expect(Reflect.ownKeys(user)).toEqual(ownKeys);
          expect(user._id).toEqual(id);
          expect(user.displayName).toBe('Principal Reviewer');
          expect(user.roles).toBe(originalRoles);
          // Even handler-local role/presentation edits must not mutate the caller's document.
          (result as MessageUser).roles?.push('handler-local');
          (result as MessageUser).displayName = 'Handler-local name';
          expect(user.roles).toEqual(roleValues);
          expect(user.displayName).toBe('Principal Reviewer');
          if (shape === 'hydrated') expect((user as unknown as mongoose.Document).isModified()).toBe(false);
        },
      );

      it.each([
        { label: 'substring string', roles: 'super-reviewer' },
        { label: 'mixed array', roles: ['reviewer', false] },
      ])('fails closed for $label roles on active and archived records', async ({ roles }) => {
        const handler = vi.fn(async () => 'approved');
        const f = await fixture([
          template({
            prepareMessage: async ({ payload }) => ({
              fromUser: receiver,
              toUser: receiver,
              toRoles: ['reviewer'],
              payload,
            }),
            actions: [{ ...template().actions[0], runHandler: handler }],
          }),
        ]);
        const active = await create(f);
        const user = await principalUser(f, shape, receiver, roles);
        const roleOnlyUser = await principalUser(f, shape, replacement, roles);
        expect(active.isReceiver(roleOnlyUser)).toBe(false);
        for (const message of [active, await f.service.findMessageOrThrow(String(active._id))]) {
          expect(message.isSender(user)).toBe(false);
          expect(message.isReceiver(user)).toBe(false);
        }
        await expect(f.service.listMessages({ user })).rejects.toBeInstanceOf(InvalidMessageUserError);
        await expect(f.service.countMessages(user)).rejects.toBeInstanceOf(InvalidMessageUserError);
        await expect(
          f.service.getActions(String(active._id), 'receiver', { user, isAdmin: true }),
        ).rejects.toBeInstanceOf(InvalidMessageUserError);
        await expect(
          f.service.handleAction(active.templateCd, 'approve', { message: active, user }),
        ).rejects.toBeInstanceOf(InvalidMessageUserError);
        expect(handler).not.toHaveBeenCalled();
        expect(await f.models.Message.findById(active._id).lean()).toMatchObject({
          actionState: 'active',
          actionAttemptId: null,
        });
        await f.service.handleAction(active.templateCd, 'approve', { message: active, user: { _id: receiver } });
        const archived = await f.service.findMessageOrThrow(String(active._id));
        expect(archived.isSender(user)).toBe(false);
        expect(archived.isReceiver(user)).toBe(false);
        await expect(f.service.getActions(String(active._id), 'receiver', { user })).rejects.toBeInstanceOf(
          InvalidMessageUserError,
        );
        for (const message of [active, archived]) {
          const error = await f.service
            .handleAction(active.templateCd, 'approve', { message, user })
            .catch((value: unknown) => value);
          expect(error).toBeInstanceOf(InvalidMessageUserError);
          expect(error).not.toHaveProperty('actionAttemptId');
        }
        expect(handler).toHaveBeenCalledTimes(1);
      });
    });

    it('preserves the original HTTP request and custom extractor values with a hydrated caller', async () => {
      const handler = vi.fn(async (ctx: ActionContext) => ctx.user);
      const prepareMessage = vi.fn(async ({ payload }: Parameters<MessageTemplate['prepareMessage']>[0]) => ({
        fromUser: sender,
        toRoles: ['reviewer'],
        payload,
      }));
      const f = await fixture([
        template({
          prepareMessage,
          actions: [{ ...template().actions[0], permission: 'approve', runHandler: handler }],
        }),
      ]);
      const user = await principalUser(f, 'hydrated', receiver, ['reviewer']);
      const permissions = { approve: true };
      const identity = { organization: 'original' };
      const requests: express.Request[] = [];
      const getUser = vi.fn((_req: express.Request) => user);
      const getPermissions = vi.fn((_req: express.Request) => permissions);
      const getIdentity = vi.fn((_req: express.Request) => identity);
      const actionCall = vi.spyOn(f.service, 'handleAction');
      const { router } = createMessageRoutes({
        service: f.service,
        authMiddleware: [
          (req, _res, next) => {
            requests.push(req);
            (req as express.Request & { user: MessageUser }).user = { _id: 'decoy' };
            next();
          },
        ],
        getUser,
        getPermissions,
        getIdentity,
      });
      const app = express();
      app.use(express.json());
      app.use(router.original);
      const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
        const started = app.listen(0, () => resolve(started));
      });
      try {
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const created = await fetch(`${base}/new/authoritative-read`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ready: true }),
        });
        expect(created.status).toBe(200);
        const [message] = (await created.json()) as Array<{ _id: string }>;
        const prepare = prepareMessage.mock.calls[0][0];
        expect(prepare.user).toBe(user);
        expect(prepare.roles).toBe(user.roles);
        expect(prepare.identity).toBe(identity);
        expect(prepare.permissions).toBe(permissions);
        expect(prepare.req).toBe(requests[0]);
        const actions = await fetch(`${base}/${message._id}/actions/receiver`);
        expect(actions.status).toBe(200);
        expect(await actions.json()).toMatchObject({ actions: [{ actionCd: 'approve' }] });
        const executed = await fetch(`${base}/${message._id}/action/approve`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ notes: 'original body' }),
        });
        expect(executed.status).toBe(200);
        expect(await executed.json()).toEqual({
          _id: String(receiver),
          id: String(receiver),
          roles: ['reviewer'],
          displayName: 'Principal Reviewer',
        });
        expect(handler.mock.calls[0][0].req).toBe(requests[2]);
        expect(requests[2].body).toEqual({ notes: 'original body' });
        expect((requests[2] as express.Request & { user: MessageUser }).user).toEqual({ _id: 'decoy' });
        expect(actionCall.mock.calls[0][2].user).toBe(user);
        expect(actionCall.mock.calls[0][2].permissions).toBe(permissions);
        expect(getUser.mock.calls.map(([req]) => req)).toEqual(requests);
        expect(getPermissions.mock.calls.map(([req]) => req)).toEqual(requests);
        expect(getIdentity).toHaveBeenCalledExactlyOnceWith(requests[0]);
        expect(user.roles).toEqual(['reviewer']);
        expect((user as unknown as mongoose.Document).isModified()).toBe(false);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    });
  });

  it('keeps archive connection ownership and validates principals before lookup, population or template effects', async () => {
    const f = await fixture();
    const other = await fixture();
    const archived = await archive(f);
    await other.models.MessageArchive.create({ ...archived.toObject(), toUser: replacement, fromUser: replacement });
    const local = new MessageService({ connection: f.connection, registry: f.registry });
    await expect(
      local.handleAction(archived.templateCd, 'approve', { message: archived, user: { _id: receiver } }),
    ).rejects.toBeInstanceOf(ActionNotificationPendingError);
    await expect(
      other.service.handleAction(archived.templateCd, 'approve', { message: archived, user: { _id: receiver } }),
    ).rejects.toBeInstanceOf(MessageModelResolutionError);
    expect(
      await other.service.getActions(String(archived._id), 'receiver', {
        user: { _id: receiver },
        message: archived,
      }),
    ).toBeNull();
    const lookup = vi.spyOn(f.models.MessageArchive, 'findById');
    const activeLookup = vi.spyOn(f.models.Message, 'findById');
    const registryLookup = vi.spyOn(f.registry, 'find');
    await expect(
      f.service.handleAction(archived.templateCd, 'approve', { message: archived, user: { _id: '' } }),
    ).rejects.toBeInstanceOf(InvalidMessageUserError);
    await expect(
      f.service.getActions(String(archived._id), 'receiver', { user: { _id: '' }, message: archived, isAdmin: true }),
    ).rejects.toBeInstanceOf(InvalidMessageUserError);
    expect(lookup).not.toHaveBeenCalled();
    expect(activeLookup).not.toHaveBeenCalled();
    expect(registryLookup).not.toHaveBeenCalled();
  });
});
