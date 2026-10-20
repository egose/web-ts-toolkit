// Copied into a fresh installed tarball consumer. No workspace/source imports.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const require = createRequire(import.meta.url);
const esm = await import('@web-ts-toolkit/message-service');
const cjs = require('@web-ts-toolkit/message-service');
const commonjs = process.argv[2] === 'cjs';
const api = commonjs ? cjs : esm;
const other = commonjs ? esm : cjs;
const { createIndependentMessaging } = await import(commonjs ? './independent-apps.cjs' : './independent-apps.mjs');
const checks = [];
const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
const connections = [];
const servers = [];
const globalModel = mongoose.model;
let globalCalls = 0;
const templateCd = 'same.review';
const clientRequestId = 'same-request';
const senderId = new mongoose.Types.ObjectId();
let mongodb;

function providers(tag) {
  return {
    created: [],
    expired: [],
    refunded: [],
    delivered: [],
    async createSession(user, code, priceArgs) {
      assert.equal(String(user), String(senderId));
      assert.equal(code, 'same-payment');
      assert.equal(priceArgs.app, tag);
      const id = tag + '-session-' + this.created.length;
      this.created.push(id);
      return id;
    },
    async expireSession(id) {
      assert(this.created.includes(id));
      this.expired.push(id);
    },
    async refundPayment(id) {
      assert(this.created.includes(id));
      this.refunded.push(id);
    },
    async sendNotification(to, title, body) {
      this.delivered.push({ to, title, body });
    },
  };
}

async function request(app, route, actor = 'receiver', body) {
  const response = await fetch(app.base + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-actor': actor },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

try {
  // Any accidental default-model/registry lookup must fail immediately.
  mongoose.model = () => {
    globalCalls++;
    throw new Error('global model fallback');
  };
  api.defaultRegistry.register({
    templateCd,
    type: 'request',
    description: 'Poison global template',
    uiTemplate: 'global',
    senderContent: { title: 'GLOBAL', long: 'GLOBAL', short: 'GLOBAL' },
    receiverContent: { title: 'GLOBAL', long: 'GLOBAL', short: 'GLOBAL' },
    prepareMessage: async () => assert.fail('global registry fallback'),
    actions: [],
  });
  for (const [tag, partyStorage] of [
    ['Native', 'nativeObjectId'],
    ['Opaque', 'opaqueString'],
  ]) {
    const connection = await mongoose.createConnection(replSet.getUri(), { dbName: tag }).asPromise();
    connections.push(connection);
    const registry = new api.TemplateRegistry();
    const provider = providers(tag);
    const receiver = { _id: tag === 'Native' ? new mongoose.Types.ObjectId() : 'Oidc|Acme:Reviewer' };
    // Identical textual owner/template/request scopes in different databases.
    const sender = { _id: tag === 'Native' ? senderId : String(senderId) };
    const directory = {
      calls: [],
      address: 'opaque@example.test',
      resolve(context) {
        assert.equal(context.connection, connection);
        assert.equal(context.recipientId, receiver._id);
        assert.equal(context.message.templateCd, api.GENERIC_NOTIFICATION_TEMPLATE_CD);
        this.calls.push(String(context.message._id));
        return this.address;
      },
    };
    if (tag === 'Native') {
      const User = connection.model('NativeUser', new mongoose.Schema({ email: String }));
      await User.create({ _id: receiver._id, email: 'native@example.test' });
    }
    const app = {
      ...(await createIndependentMessaging(connection, {
        prefix: tag,
        partyStorage,
        registry,
        paymentProvider: provider,
        emailProvider: provider,
        emailRecipientResolver: tag === 'Opaque' ? directory.resolve.bind(directory) : undefined,
      })),
      tag,
      partyStorage,
      registry,
      provider,
      receiver,
      sender,
      directory,
      prepared: 0,
      handled: [],
    };
    const template = {
      templateCd,
      type: 'request',
      description: tag,
      uiTemplate: tag + '-ui',
      paymentCd: 'same-payment',
      senderContent: { title: tag + ' sent', long: 'Sent', short: 'Sent' },
      receiverContent: { title: tag + ' {{item}}', long: 'Review', short: 'Review' },
      prepareMessage: async ({ user, getModel, req }) => {
        app.prepared++;
        assert.equal(user, sender);
        assert.equal(getModel(app.modelNames.active), app.Message);
        assert.equal(req.appTag, tag);
        return [0, 1].map((item) => ({
          toUser: receiver._id,
          templateData: { item },
          payload: { app: tag, item },
          documents: [],
          priceArgs: { app: tag },
        }));
      },
      actions: [
        {
          actionCd: 'approve',
          name: tag + ' approve',
          variant: 'success',
          sender: false,
          receiver: true,
          parseInput: (input) => {
            if (typeof input?.notes !== 'string' || !input.notes.trim()) {
              throw new other.ActionInputValidationError('PRIVATE_INPUT');
            }
            return { notes: input.notes.trim() };
          },
          runHandler: async (ctx) => {
            assert.equal(ctx.message.constructor.db, connection);
            assert.equal(ctx.getModel(app.modelNames.archive), app.Archive);
            assert.equal(ctx.req.appTag, tag);
            assert.equal(ctx.user._id, String(receiver._id));
            assert.equal(ctx.message.payload.app, tag);
            await ctx.expireSession(ctx.message.paymentSession);
            await ctx.refundPayment(ctx.message.paymentSession);
            const result = { app: tag, notes: ctx.input.notes, actionAttemptId: ctx.actionAttemptId };
            app.handled.push(result);
            return result;
          },
        },
      ],
    };
    registry.register(template);
    const host = express();
    host.use(express.json());
    host.use((req, _res, next) => {
      req.appTag = tag;
      req.user = { _id: 'DECOY_DEFAULT_USER' };
      const principal = req.get('x-actor') === 'sender' ? sender : receiver;
      if (tag === 'Native') req.nativeAuth = { principal };
      else req.sessionIdentity = { account: principal };
      next();
    });
    const routes = api.createMessageRoutes({
      service: app.service,
      getUser: (req) => (tag === 'Native' ? req.nativeAuth.principal : req.sessionIdentity.account),
    });
    assert.equal(routes.service, app.service);
    host.use('/messages', routes.router.original);
    const server = await new Promise((resolve) => {
      const started = host.listen(0, '127.0.0.1', () => resolve(started));
    });
    servers.push(server);
    app.base = 'http://127.0.0.1:' + server.address().port + '/messages';
    connections[connections.length - 1].fixture = app;
  }
  const [a, b] = connections.map((connection) => connection.fixture);
  assert.notEqual(a.registry, b.registry);
  assert.notEqual(a.Message.db, b.Message.db);
  assert.notEqual(a.Message.modelName, b.Message.modelName);
  assert.notEqual(a.Message.collection.name, b.Message.collection.name);
  checks.push('distinct connections/models/registries/auth adapters');

  for (const app of [a, b]) {
    const created = await request(app, '/new/' + templateCd, 'sender', { clientRequestId });
    assert.equal(created.status, 200);
    assert.equal(created.body.length, 2);
    app.ids = created.body.map((dto) => dto._id);
    assert.deepEqual(
      created.body.map((dto) => dto.receiverContent.title),
      [app.tag + ' 0', app.tag + ' 1'],
    );
    assert.equal(await app.service.countMessages(app.receiver), 2);
    assert.deepEqual(
      (await app.service.listMessages({ user: app.sender })).map((m) => String(m._id)).sort(),
      [...app.ids].sort(),
    );
    assert.equal(app.provider.delivered.length, 0); // transactional creates skip email
    const actions = await request(app, '/' + app.ids[0] + '/actions/receiver');
    assert.equal(actions.status, 200);
    assert.equal(actions.body.uiTemplate, app.tag + '-ui');
    assert.equal(actions.body.actions[0].name, app.tag + ' approve');
    assert.deepEqual(actions.body.actions[0].payload, undefined);
    const denied = await request(app, '/' + app.ids[0] + '/action/approve', 'sender', { notes: 'denied' });
    assert.equal(denied.status, 403);
    assert.equal(app.handled.length, 0);
    const invalid = await request(app, '/' + app.ids[0] + '/action/approve', 'receiver', { notes: '' });
    assert.deepEqual(invalid, { status: 400, body: { message: 'invalid action input' } });
    assert.equal((await app.Message.findById(app.ids[0])).actionAttemptId, null);
  }
  assert(!a.ids.some((id) => b.ids.includes(id)));
  checks.push(
    'same codes/keys create isolated batches',
    'list/count/action presentation',
    'authorization and mixed-format parser branding',
  );

  for (const [app, foreign] of [
    [a, b],
    [b, a],
  ]) {
    assert.equal(await app.service.findMessage(foreign.ids[0]), null);
    assert.equal(
      (await request(app, '/' + foreign.ids[0] + '/action/approve', 'receiver', { notes: 'cross' })).status,
      404,
    );
    const foreignDoc = await foreign.Message.findById(foreign.ids[0]);
    await assert.rejects(
      app.service.handleAction(templateCd, 'approve', { message: foreignDoc, user: app.receiver }),
      api.ActionNotAllowedError,
    );
    await assert.rejects(
      app.service.handleAction(templateCd, 'approve', { message: foreignDoc, user: foreign.receiver }),
      api.MessageModelResolutionError,
    );
    const miswired = new api.MessageService({
      registry: app.registry,
      modelNames: app.modelNames,
      getModel: () => foreign.Message,
    });
    await assert.rejects(
      miswired.handleAction(templateCd, 'approve', {
        message: await app.Message.findById(app.ids[0]),
        user: app.receiver,
      }),
      api.MessageModelResolutionError,
    );
  }
  checks.push('cross-app IDs/documents and miswired resolver fail closed');

  for (const app of [a, b]) {
    const action = await request(app, '/' + app.ids[0] + '/action/approve', 'receiver', { notes: '  approved  ' });
    assert.equal(action.status, 200);
    assert.deepEqual(action.body, app.handled[0]);
    assert.equal(action.body.notes, 'approved');
    assert.equal(typeof action.body.actionAttemptId, 'string');
    const mixed = await request(app, '/new/' + templateCd, 'sender', { clientRequestId, changed: true });
    assert.deepEqual(
      mixed.body.map((dto) => !!dto.archivedAt),
      [true, false],
    );
    const direct = await app.Message.findById(app.ids[1]);
    await assert.rejects(direct.archive('approve', app.receiver._id), api.TemplateNotFoundError);
    await direct.archive('approve', app.receiver._id, app.registry);
    const replay = await request(app, '/new/' + templateCd, 'sender', { clientRequestId, changed: true });
    assert.equal(replay.status, 200);
    assert.deepEqual(
      replay.body.map((dto) => dto._id),
      app.ids,
    );
    assert(replay.body.every((dto) => dto.archivedAt && dto.archivedBy === String(app.receiver._id)));
    assert(!/actionOwnerToken|clientRequest|PRIVATE/.test(JSON.stringify(replay.body)));
    const terminal = await request(app, '/' + app.ids[0] + '/action/approve', 'receiver', { notes: 'again' });
    assert.equal(terminal.status, 410);
    assert.equal(app.prepared, 1);
    assert.equal(app.handled.length, 1);
    assert.equal(app.provider.created.length, 2);
    assert.deepEqual(app.provider.expired, [app.provider.created[0]]);
    assert.deepEqual(app.provider.refunded, [app.provider.created[0]]);
    assert.equal(await app.Message.countDocuments(), 0);
    assert.equal(await app.Archive.countDocuments(), 2);
    const reservation = await app.Request.findOne().lean();
    assert.equal(await app.Request.countDocuments(), 1);
    assert.equal(reservation.clientRequestOwnerId, String(senderId));
    assert.equal(reservation.clientRequestId, clientRequestId);
    assert.equal(reservation.state, 'completed');
    const raw = await app.Archive.collection.findOne({ _id: direct._id });
    for (const key of ['fromUser', 'toUser', 'archivedBy']) {
      if (app.partyStorage === 'nativeObjectId') assert(raw[key] instanceof mongoose.Types.ObjectId);
      else assert.equal(typeof raw[key], 'string');
    }
    assert(raw._id instanceof mongoose.Types.ObjectId);
    assert.deepEqual((await request(app, '/' + app.ids[0] + '/actions/receiver')).body.actions, []);
  }
  checks.push(
    'handler/provider adapter isolation',
    'service and explicit-registry direct archive BSON types',
    'mixed/terminal replay without new effects',
    'public DTO exclusions and terminal actions',
  );

  assert.equal(b.Message.db.modelNames().includes('OpaqueUser'), false);
  for (const app of [a, b]) {
    await app.service.createNotification({
      fromUser: app.sender._id,
      toUser: app.receiver._id,
      receiverContent: { title: app.tag + ' email', long: 'Body' },
    });
    assert.deepEqual(app.provider.delivered, [
      {
        to: app === a ? 'native@example.test' : 'opaque@example.test',
        title: app.tag + ' email',
        body: 'Body',
      },
    ]);
  }
  const DecoyUser = b.Message.db.model('OpaqueUser', new mongoose.Schema({ _id: String, email: String }));
  await DecoyUser.create({ _id: b.receiver._id, email: 'WRONG_FALLBACK@example.test' });
  b.directory.address = null;
  await b.service.createNotification({ toUser: b.receiver._id, receiverContent: { title: 'Skipped', long: 'Body' } });
  assert.equal(b.directory.calls.length, 2);
  assert.equal(b.provider.delivered.length, 1);
  assert.equal(a.provider.delivered.length, 1);
  checks.push('connection-local email and optional custom directory without fallback');

  a.registry.unregister(templateCd);
  await assert.rejects(a.service.createMessage({ templateCd, user: a.sender }), api.TemplateNotFoundError);
  assert.equal(b.registry.has(templateCd), true);
  const missingModels = new api.MessageService({ connection: a.Message.db, registry: b.registry });
  await assert.rejects(missingModels.listMessages({ user: a.sender }), api.MessageModelResolutionError);
  assert.equal(globalCalls, 0);
  checks.push('explicit registry/model configuration never falls back globally');
  mongodb = (await connections[0].db.admin().command({ buildInfo: 1 })).version;
} finally {
  mongoose.model = globalModel;
  api.defaultRegistry.unregister(templateCd);
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
  for (const connection of connections) {
    await connection.dropDatabase();
    await connection.close();
  }
  await replSet.stop();
}
console.log(
  JSON.stringify({ format: commonjs ? 'cjs' : 'esm', consumerNode: process.versions.node, mongodb, apps: 2, checks }),
);
