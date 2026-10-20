import mongoose from 'mongoose';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActionConflictError,
  ActionRetryableError,
  MessageService,
  TemplateRegistry,
  buildMessageArchiveSchema,
  buildMessageRequestSchema,
  buildMessageSchema,
  createMessageRoutes,
  MESSAGE_ARCHIVE_MODEL_NAME,
  MESSAGE_MODEL_NAME,
  MESSAGE_REQUEST_MODEL_NAME,
} from '../src';
import {
  createRejectionWorkflow,
  HostCommandConflictError,
  type RejectCommand,
} from './support/action-command-example';
import { createDeferredBarrier } from './support/deferred';
import {
  createMongoMessageServiceFixture,
  getMongoReplicaSetUri,
  type MongoMessageServiceFixture,
} from './support/mongodb-fixture';

describe('MSGA-15 durable host command/result store (real MongoDB)', () => {
  const fixtures: MongoMessageServiceFixture[] = [];
  const connections: mongoose.Connection[] = [];
  const servers: Server[] = [];
  const reviewer = new mongoose.Types.ObjectId();

  async function fixture() {
    const f = await createMongoMessageServiceFixture();
    fixtures.push(f);
    const business = createRejectionWorkflow(f.connection);
    await Promise.all([business.Approval.init(), business.Command.init()]);
    const approval = await business.Approval.create({ reviewer: String(reviewer) });
    const template = business.template(String(approval._id), reviewer);
    f.registry.register(template);
    return { f, business, approval, template };
  }

  async function http(service: MessageService, id: string) {
    const app = express();
    app.use(express.json());
    app.use(createMessageRoutes({ service, getUser: () => ({ _id: reviewer }) }).router.original);
    const server = await new Promise<Server>((resolve) => {
      const started = app.listen(0, '127.0.0.1', () => resolve(started));
    });
    servers.push(server);
    return async (notes: string) => {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/${id}/action/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      return { status: response.status, body: await response.json(), error: undefined };
    };
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    while (servers.length) {
      const server = servers.pop()!;
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
    while (connections.length) await connections.pop()!.close();
    while (fixtures.length) await fixtures.pop()!.close();
  });

  it.each(['direct', 'http'] as const)('replays %s command/result after archive failure', async (firstVia) => {
    const { f, business, approval, template } = await fixture();
    const attempts: Array<string | undefined> = [];
    const handler = template.actions[0].runHandler;
    template.actions[0].runHandler = async (ctx) => {
      attempts.push(ctx.actionAttemptId);
      return handler(ctx);
    };
    f.registry.register(template);
    const [message] = await f.service.createMessage({
      templateCd: template.templateCd,
      user: { _id: new mongoose.Types.ObjectId() },
    });
    const id = String(message._id);
    const remote = await http(f.service, id);
    async function direct(service: MessageService, notes: string) {
      try {
        const body = await service.handleAction(template.templateCd, 'reject', {
          message: await service.findMessageOrThrow(id),
          user: { _id: reviewer },
          input: { notes },
        }); // No req / Express needed by this business integration.
        return { status: 200, body, error: undefined };
      } catch (error) {
        return { status: error instanceof ActionRetryableError ? 409 : 500, body: undefined, error };
      }
    }
    const archiveFailure = new Error('PRIVATE_ARCHIVE_UNAVAILABLE');
    const archive = vi.spyOn(f.models.MessageArchive, 'create').mockRejectedValueOnce(archiveFailure);
    const first = firstVia === 'direct' ? await direct(f.service, '  original  ') : await remote('  original  ');
    expect(first.status).toBe(500);
    if (firstVia === 'direct') expect(first.error).toBe(archiveFailure);
    else expect(JSON.stringify(first.body)).not.toContain('PRIVATE_ARCHIVE');
    archive.mockRestore();
    const active = (await f.models.Message.findById(id).lean()) as unknown as Record<string, unknown>;
    expect(active).toMatchObject({
      actionState: 'retryable',
      actionCd: 'reject',
      actionAttemptId: expect.any(String),
    });
    const attempt = active.actionAttemptId as string;
    const original = await business.Command.findById(attempt).lean();
    expect(original).toMatchObject({ notes: 'original', result: { rejected: true, notes: 'original' } });
    expect(await business.Approval.findById(approval._id).lean()).toMatchObject({ effectCount: 1 });
    expect(await f.models.MessageArchive.countDocuments({ _id: id })).toBe(0);

    // Switch transport on the changed retry. Host conflicts use the ordinary
    // handler-entered retryable 409, with the domain diagnostic kept as cause.
    const changed = firstVia === 'direct' ? await remote('changed') : await direct(f.service, 'changed');
    expect(changed.status).toBe(409);
    if (firstVia === 'http') expect(changed.error).toMatchObject({ cause: expect.any(HostCommandConflictError) });
    else expect(JSON.stringify(changed.body)).not.toMatch(/canonical|changed|HostCommand/);
    expect(await business.Command.findById(attempt).lean()).toEqual(original);
    expect(await f.models.Message.findById(id).lean()).toMatchObject({
      actionState: 'retryable',
      actionCd: 'reject',
      actionAttemptId: attempt,
    });

    // A fresh connection, registry, service and business closure have no in-memory
    // deduplication state. Only the durable host command/result survives.
    const restarted = await mongoose
      .createConnection(await getMongoReplicaSetUri(), { dbName: f.databaseName })
      .asPromise();
    connections.push(restarted);
    restarted.model(MESSAGE_MODEL_NAME, buildMessageSchema());
    restarted.model(MESSAGE_ARCHIVE_MODEL_NAME, buildMessageArchiveSchema());
    restarted.model(MESSAGE_REQUEST_MODEL_NAME, buildMessageRequestSchema());
    const nextBusiness = createRejectionWorkflow(restarted);
    const registry = new TemplateRegistry();
    const nextTemplate = nextBusiness.template(String(approval._id), reviewer);
    const nextHandler = nextTemplate.actions[0].runHandler;
    nextTemplate.actions[0].runHandler = async (ctx) => {
      attempts.push(ctx.actionAttemptId);
      return nextHandler(ctx);
    };
    registry.register(nextTemplate);
    const service = new MessageService({ connection: restarted, registry });
    const retry =
      firstVia === 'direct' ? await (await http(service, id))('original') : await direct(service, 'original');
    expect(retry).toMatchObject({ status: 200, body: { rejected: true, notes: 'original' } });
    expect(attempts).toEqual([attempt, attempt, attempt]);
    expect(await nextBusiness.Command.findById(attempt).lean()).toEqual(original);
    expect(await nextBusiness.Command.countDocuments({})).toBe(1);
    expect(await nextBusiness.Approval.findById(approval._id).lean()).toMatchObject({
      state: 'rejected',
      notes: 'original',
      effectCount: 1,
    });
    expect(await f.models.Message.countDocuments({ _id: id })).toBe(0);
    expect(await f.models.MessageArchive.findById(id).lean()).toMatchObject({ actionAttemptId: attempt });
  });

  it.each(['equivalent', 'changed'] as const)('reserves concurrent %s host commands', async (mode) => {
    const { business, approval } = await fixture();
    const command: RejectCommand = {
      attemptId: 'concurrent-attempt',
      messageId: String(new mongoose.Types.ObjectId()),
      approvalId: String(approval._id),
      actorId: String(reviewer),
      notes: 'first',
    };
    const outcomes = await Promise.allSettled([
      business.reject(command),
      business.reject({ ...command, notes: mode === 'changed' ? 'second' : 'first' }),
    ]);
    const successes = outcomes.filter((r) => r.status === 'fulfilled');
    expect(successes).toHaveLength(mode === 'changed' ? 1 : 2);
    if (mode === 'changed')
      expect(outcomes.find((r) => r.status === 'rejected')).toMatchObject({
        reason: expect.any(HostCommandConflictError),
      });
    const stored = await business.Command.findById(command.attemptId).lean();
    expect(stored?.result).toEqual(successes[0].status === 'fulfilled' ? successes[0].value : null);
    expect(await business.Command.countDocuments({})).toBe(1);
    expect(await business.Approval.findById(approval._id).lean()).toMatchObject({
      notes: stored?.notes,
      effectCount: 1,
    });
  });

  it.each(['actor', 'target'] as const)('rejects changed %s binding without overwrite', async (binding) => {
    const { business, approval } = await fixture();
    const command: RejectCommand = {
      attemptId: 'bound-attempt',
      messageId: String(new mongoose.Types.ObjectId()),
      approvalId: String(approval._id),
      actorId: String(reviewer),
      notes: 'original',
    };
    await business.reject(command);
    const original = await business.Command.findById(command.attemptId).lean();
    const changed = { ...command };
    if (binding === 'actor') {
      changed.actorId = String(new mongoose.Types.ObjectId());
      await business.Approval.updateOne({ _id: approval._id }, { $set: { reviewer: changed.actorId } });
    } else {
      const other = await business.Approval.create({ reviewer: String(reviewer) });
      changed.approvalId = String(other._id);
    }
    await expect(business.reject(changed)).rejects.toBeInstanceOf(HostCommandConflictError);
    expect(await business.Command.findById(command.attemptId).lean()).toEqual(original);
    expect(await business.Approval.findById(approval._id).lean()).toMatchObject({
      notes: 'original',
      effectCount: 1,
    });
    if (binding === 'target')
      expect(await business.Approval.findById(changed.approvalId).lean()).toMatchObject({
        state: 'pending',
        effectCount: 0,
      });
  });

  it('reauthorizes the domain target before replaying a cached result', async () => {
    const { business, approval } = await fixture();
    const command: RejectCommand = {
      attemptId: 'domain-attempt',
      messageId: String(new mongoose.Types.ObjectId()),
      approvalId: String(approval._id),
      actorId: String(reviewer),
      notes: 'original',
    };
    await business.reject(command);
    const original = await business.Command.findById(command.attemptId).lean();
    await business.Approval.updateOne({ _id: approval._id }, { $set: { reviewer: 'revoked' } });
    await expect(business.reject(command)).rejects.toThrow('domain permission denied');
    expect(await business.Command.findById(command.attemptId).lean()).toEqual(original);
  });

  it('binds at first host reservation even when an earlier package owner claimed different input', async () => {
    const { f, business, approval, template } = await fixture();
    const beforeHost = createDeferredBarrier('before first host reservation');
    const handler = template.actions[0].runHandler;
    template.actions[0].runHandler = async (ctx) => {
      if ((ctx.input as { notes: string }).notes === 'early claimant') await beforeHost.arrive();
      return handler(ctx);
    };
    f.registry.register(template);
    const [message] = await f.service.createMessage({
      templateCd: template.templateCd,
      user: { _id: new mongoose.Types.ObjectId() },
    });
    const first = f.service
      .handleAction(template.templateCd, 'reject', {
        message,
        user: { _id: reviewer },
        input: { notes: 'early claimant' },
      })
      .catch((error: unknown) => error);
    try {
      await beforeHost.reached;
      expect(await business.Command.countDocuments({})).toBe(0);
      const claimed = (await f.models.Message.findById(message._id).lean()) as unknown as { actionAttemptId: string };
      await f.models.Message.updateOne({ _id: message._id }, { $set: { actionLeaseExpiresAt: new Date(0) } });
      await expect(
        f.service.handleAction(template.templateCd, 'reject', {
          message,
          user: { _id: reviewer },
          input: { notes: 'first durable reservation' },
        }),
      ).resolves.toEqual({ rejected: true, notes: 'first durable reservation' });
      const original = await business.Command.findById(claimed.actionAttemptId).lean();
      expect(original).toMatchObject({ notes: 'first durable reservation' });
      beforeHost.release();
      expect(await first).toBeInstanceOf(ActionConflictError);
      expect(await business.Command.findById(claimed.actionAttemptId).lean()).toEqual(original);
      expect(await business.Approval.findById(approval._id).lean()).toMatchObject({
        notes: 'first durable reservation',
        effectCount: 1,
      });
      expect(
        await f.models.MessageArchive.countDocuments({ _id: message._id, actionAttemptId: claimed.actionAttemptId }),
      ).toBe(1);
    } finally {
      beforeHost.release();
      await first;
    }
  });
});
