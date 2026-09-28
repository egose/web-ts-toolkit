import express from 'express';
import mongoose from 'mongoose';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createMessageRoutes } from '../src/route-factory';
import { serializePublicMessage } from '../src/public-message';
import type { MessageTemplate } from '../src/types/template';
import {
  createMongoMessageServiceFixture,
  stopMongoReplicaSet,
  type MongoMessageServiceFixture,
} from './support/mongodb-fixture';

const sender = new mongoose.Types.ObjectId();
const receiver = new mongoose.Types.ObjectId();
const attachment = new mongoose.Types.ObjectId();
const diagnostic = 'PRIVATE_DIAGNOSTIC_MARKER';
const ownerToken = 'PRIVATE_WORKER_TOKEN_MARKER';
const forbidden = [
  'actionFailureMessage',
  'actionNotificationError',
  'actionOwnerToken',
  'actionClaimedBy',
  'actionClaimedAt',
  'actionLeaseExpiresAt',
  'actionNotificationAttemptedAt',
  'clientRequestId',
  'clientRequestOwnerId',
  'clientRequestItemIndex',
  '__v',
];
const template: MessageTemplate = {
  templateCd: 'public-message',
  type: 'request',
  description: 'Public message contract',
  senderContent: { title: 'Sent', long: 'Sender body', short: 'S' },
  receiverContent: { title: 'Received', long: 'Receiver body', short: 'R' },
  uiTemplate: 'default-message',
  paymentCd: 'business-payment',
  prepareMessage: async ({ user, payload }) => ({
    fromUser: user._id,
    toUser: receiver,
    payload,
    display: { priority: 'high' },
  }),
  actions: [
    {
      actionCd: 'approve',
      name: 'Approve',
      variant: 'primary',
      sender: false,
      receiver: true,
      runHandler: async () => 'approved',
    },
  ],
};

describe('MSGR-03 public message HTTP boundary (real MongoDB)', () => {
  const fixtures: MongoMessageServiceFixture[] = [];
  const servers: ReturnType<typeof express.application.listen>[] = [];
  afterEach(async () => {
    for (const server of servers.splice(0)) {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
    vi.restoreAllMocks();
    for (const fixture of fixtures.splice(0)) await fixture.close();
  });
  afterAll(stopMongoReplicaSet);

  async function setup(actions = template.actions) {
    const fixture = await createMongoMessageServiceFixture({
      templates: [{ ...template, actions }],
      schemaOptions: { userModelName: 'PublicUser' },
      serviceOptions: {
        paymentProvider: {
          createSession: async () => 'business-session',
          expireSession: async () => {},
          refundPayment: async () => {},
        },
      },
    });
    fixtures.push(fixture);
    const { router } = createMessageRoutes({ service: fixture.service });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as express.Request & { user: unknown }).user = { _id: req.headers['x-receiver'] ? receiver : sender };
      next();
    });
    app.use(router.original);
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const server = app.listen(0, () => resolve(server));
    });
    servers.push(server);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    async function post(path = '/new/public-message', asReceiver = false) {
      const response = await fetch(base + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(asReceiver ? { 'x-receiver': '1' } : {}) },
        body: JSON.stringify({ clientRequestId: 'private-request-key', order: 'business-order' }),
      });
      return { status: response.status, body: await response.json() };
    }
    return { ...fixture, post };
  }

  function assertPublic(message: Record<string, unknown>) {
    for (const field of forbidden) expect(message).not.toHaveProperty(field);
    expect(JSON.stringify(message)).not.toContain(diagnostic);
    expect(JSON.stringify(message)).not.toContain(ownerToken);
    expect(message).toMatchObject({
      _id: expect.any(String),
      templateCd: template.templateCd,
      type: 'request',
      senderContent: template.senderContent,
      receiverContent: template.receiverContent,
      paymentCd: 'business-payment',
      paymentSession: 'business-session',
      payload: { order: 'business-order' },
      display: { priority: 'high' },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  }

  it('serializes fresh creation and replay while retaining hydrated direct results and business fields', async () => {
    const fixture = await setup();
    const fresh = await fixture.post();
    expect(fresh.status).toBe(200);
    assertPublic(fresh.body[0]);
    expect(fresh.body[0]).toMatchObject({ fromUser: String(sender), toUser: String(receiver), actionAttemptId: null });
    expect(fresh.body[0]).not.toHaveProperty('archivedAt');
    const replay = await fixture.post();
    expect(replay.body).toEqual(fresh.body);
    const [direct] = await fixture.service.createMessage({
      templateCd: template.templateCd,
      user: { _id: sender },
      clientRequestId: 'private-request-key',
    });
    expect(direct).toBeInstanceOf(mongoose.Document);
    expect(direct).toHaveProperty('archive', expect.any(Function));
    expect(direct.clientRequestId).toBe('private-request-key');
    expect(direct.createdAt).toBeInstanceOf(Date);
  });

  it('redacts active retryable replay diagnostics and tokens but preserves the intentional attempt ID', async () => {
    const handler = vi.fn(async () => {
      throw new Error(diagnostic);
    });
    const fixture = await setup([{ ...template.actions[0], runHandler: handler }]);
    const fresh = await fixture.post();
    const id = fresh.body[0]._id;
    const failure = await fixture.post(`/${id}/action/approve`, true);
    expect(failure.status).toBe(409);
    expect(JSON.stringify(failure.body)).not.toContain(diagnostic);
    await fixture.models.Message.updateOne(
      { _id: id },
      { $set: { actionOwnerToken: ownerToken, documents: [attachment] } },
    );
    const replay = await fixture.post();
    expect(replay.status).toBe(200);
    assertPublic(replay.body[0]);
    const [internal] = await fixture.service.createMessage({
      templateCd: template.templateCd,
      user: { _id: sender },
      clientRequestId: 'private-request-key',
    });
    expect(internal).toBeInstanceOf(mongoose.Document);
    expect(internal.actionFailureMessage).toContain(diagnostic);
    expect(internal.actionOwnerToken).toBe(ownerToken);
    expect(replay.body[0]).toMatchObject({
      actionState: 'retryable',
      actionCd: 'approve',
      actionAttemptId: internal.actionAttemptId,
      documents: [String(attachment)],
    });
    expect(JSON.stringify(failure.body)).toContain(internal.actionAttemptId);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('redacts archived notification failure replay and retains internal notification diagnostics', async () => {
    const notify = vi.fn(async () => {
      throw new Error(diagnostic);
    });
    const fixture = await setup([{ ...template.actions[0], senderNotification: notify }]);
    const fresh = await fixture.post();
    const id = fresh.body[0]._id;
    const outcome = await fixture.post(`/${id}/action/approve`, true);
    expect(outcome.status).toBe(202);
    expect(JSON.stringify(outcome.body)).not.toContain(diagnostic);
    await fixture.models.MessageArchive.updateOne({ _id: id }, { $set: { actionOwnerToken: ownerToken } });
    const replay = await fixture.post();
    expect(replay.status).toBe(200);
    assertPublic(replay.body[0]);
    expect(replay.body[0]).toMatchObject({
      archivedBy: String(receiver),
      archivedAt: expect.any(String),
      actionNotificationState: 'failed',
      actionCd: 'approve',
      actionAttemptId: outcome.body.actionAttemptId,
    });
    const [internal] = await fixture.service.createMessage({
      templateCd: template.templateCd,
      user: { _id: sender },
      clientRequestId: 'private-request-key',
    });
    expect(internal).toBeInstanceOf(mongoose.Document);
    expect(internal).toMatchObject({ actionNotificationError: diagnostic, actionOwnerToken: ownerToken });
    expect(internal).not.toHaveProperty('archive');
    expect(await fixture.models.Message.countDocuments({ _id: id })).toBe(0);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('allowlists populated parties, content and attachments without mutating operational records', async () => {
    const fixture = await setup();
    const User = fixture.connection.model(
      'PublicUser',
      new mongoose.Schema({
        displayName: String,
        email: String,
        password: String,
        nested: mongoose.Schema.Types.Mixed,
      }),
    );
    await User.create([
      {
        _id: sender,
        displayName: 'Sender',
        email: 'sender@example.test',
        password: diagnostic,
        nested: { token: ownerToken },
      },
      { _id: receiver, displayName: 'Receiver', email: 'receiver@example.test', password: diagnostic },
    ]);
    await fixture.post();
    const [populated] = await fixture.service.listMessages({
      user: { _id: sender },
      populate: [
        { path: 'fromUser', model: User },
        { path: 'toUser', model: User },
      ],
    });
    const dto = serializePublicMessage(populated);
    expect(dto.fromUser).toEqual({ _id: String(sender), displayName: 'Sender', email: 'sender@example.test' });
    expect(dto.toUser).toEqual({ _id: String(receiver), displayName: 'Receiver', email: 'receiver@example.test' });
    expect(JSON.stringify(dto)).not.toContain(diagnostic);
    expect(JSON.stringify(dto)).not.toContain(ownerToken);
    expect(populated.get('fromUser.password')).toBe(diagnostic);
    // Plain/lean/custom-schema inputs cannot forward arbitrary extension fields,
    // nested party objects, content extensions, or populated attachment contents.
    const plain = {
      ...populated.toObject(),
      _id: populated._id,
      senderContent: { ...template.senderContent, secret: diagnostic },
      fromUser: { _id: sender, displayName: { secret: diagnostic }, email: { secret: diagnostic } },
      toUser: null,
      documents: [{ _id: attachment, secret: diagnostic }],
      secret: diagnostic,
    };
    const plainDto = serializePublicMessage(plain);
    expect(plainDto.fromUser).toEqual({ _id: String(sender) });
    expect(plainDto.toUser).toBeNull();
    expect(plainDto.documents).toEqual([String(attachment)]);
    expect(JSON.stringify(plainDto)).not.toContain(diagnostic);
    expect(serializePublicMessage({ ...plain, fromUser: { secret: diagnostic } }).fromUser).toBeNull();
  });
});
