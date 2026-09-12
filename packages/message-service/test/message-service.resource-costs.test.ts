import mongoose from 'mongoose';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMongoMessageServiceFixture,
  getMongoReplicaSetUri,
  stopMongoReplicaSet,
  type MongoMessageServiceFixture,
} from './support/mongodb-fixture';
import { ClientRequestFailedError, ClientRequestPendingError, MessageService } from '../src/message-service';
import { buildMessageArchiveSchema } from '../src/schemas/message-archive';
import { buildMessageRequestSchema } from '../src/schemas/message-request';
import { buildMessageSchema } from '../src/schemas/message';
import { MESSAGE_ARCHIVE_MODEL_NAME, MESSAGE_MODEL_NAME, MESSAGE_REQUEST_MODEL_NAME } from '../src/schemas/base';
import { TemplateRegistry } from '../src/template-registry';
import type { MessageTemplate } from '../src/types/template';

// MSGF-14 bounded investigation only: local synthetic fixtures, no external
// providers, no broad benchmark framework. No production code is changed by
// this file; it measures the final MSGF-06 replay protocol and the actual
// 3-branch visibility query, then the task file records recommendations.

const senderId = new mongoose.Types.ObjectId();
const receiverId = new mongoose.Types.ObjectId();

function batchTemplate(templateCd: string, size: number, prepareSpy?: ReturnType<typeof vi.fn>): MessageTemplate {
  return {
    templateCd,
    type: 'request',
    description: `MSGF-14 batch size ${size}`,
    senderContent: { title: 'Send', long: 'Send long', short: 'Send' },
    receiverContent: { title: 'Recv', long: 'Recv long', short: 'Recv' },
    uiTemplate: 'default-message',
    prepareMessage: prepareSpy
      ? ((async (args: never) => (prepareSpy as never as (a: never) => unknown)(args)) as never)
      : ((async ({ user }: { user: { _id: unknown } }) =>
          Array.from({ length: size }, (_, index) => ({
            fromUser: user._id,
            toUser: receiverId,
            payload: { item: `item-${index}`, pad: 'x'.repeat(120) },
          }))) as never),
    actions: [],
  };
}

function toPlain(doc: unknown): Record<string, unknown> {
  const maybe = doc as { toObject?: () => Record<string, unknown> };
  return typeof maybe.toObject === 'function' ? maybe.toObject() : (doc as Record<string, unknown>);
}

function jsonBytes(docs: unknown[]): number {
  return Buffer.byteLength(JSON.stringify(docs.map(toPlain)), 'utf8');
}

function collectStages(plan: unknown, out: string[] = []): string[] {
  if (!plan || typeof plan !== 'object') return out;
  const current = plan as Record<string, unknown>;
  if (typeof current.stage === 'string') out.push(current.stage);
  for (const value of Object.values(current)) {
    if (Array.isArray(value)) value.forEach((entry) => collectStages(entry, out));
    else if (value && typeof value === 'object') collectStages(value, out);
  }
  return out;
}

function collectIndexNames(plan: unknown, out: string[] = []): string[] {
  if (!plan || typeof plan !== 'object') return out;
  const current = plan as Record<string, unknown>;
  if (typeof current.indexName === 'string') out.push(current.indexName);
  for (const value of Object.values(current)) {
    if (Array.isArray(value)) value.forEach((entry) => collectIndexNames(entry, out));
    else if (value && typeof value === 'object') collectIndexNames(value, out);
  }
  return out;
}

type QueryCounters = {
  requestFindOne: number;
  requestCreate: number;
  requestFindOneAndUpdate: number;
  activeFind: number;
  archiveFind: number;
};

function instrumentCounters(models: MongoMessageServiceFixture['models']): {
  counters: QueryCounters;
  restore: () => void;
} {
  const counters: QueryCounters = {
    requestFindOne: 0,
    requestCreate: 0,
    requestFindOneAndUpdate: 0,
    activeFind: 0,
    archiveFind: 0,
  };
  const origRequestFindOne = models.MessageRequest.findOne.bind(models.MessageRequest);
  const origRequestCreate = models.MessageRequest.create.bind(models.MessageRequest);
  const origRequestFindOneAndUpdate = models.MessageRequest.findOneAndUpdate.bind(models.MessageRequest);
  const origActiveFind = models.Message.find.bind(models.Message);
  const origArchiveFind = models.MessageArchive.find.bind(models.MessageArchive);
  const spies = [
    vi.spyOn(models.MessageRequest, 'findOne').mockImplementation(((...args: never[]) => {
      counters.requestFindOne += 1;
      return origRequestFindOne(...args);
    }) as never),
    vi.spyOn(models.MessageRequest, 'create').mockImplementation(((...args: never[]) => {
      counters.requestCreate += 1;
      return origRequestCreate(...args);
    }) as never),
    vi.spyOn(models.MessageRequest, 'findOneAndUpdate').mockImplementation(((...args: never[]) => {
      counters.requestFindOneAndUpdate += 1;
      return origRequestFindOneAndUpdate(...args);
    }) as never),
    vi.spyOn(models.Message, 'find').mockImplementation(((...args: never[]) => {
      counters.activeFind += 1;
      return origActiveFind(...args);
    }) as never),
    vi.spyOn(models.MessageArchive, 'find').mockImplementation(((...args: never[]) => {
      counters.archiveFind += 1;
      return origArchiveFind(...args);
    }) as never),
  ];
  return { counters, restore: () => spies.forEach((spy) => spy.mockRestore()) };
}

describe('MessageService resource costs (MSGF-14 investigation)', () => {
  const fixtures: MongoMessageServiceFixture[] = [];

  async function fixture(options: Parameters<typeof createMongoMessageServiceFixture>[0] = {}) {
    const created = await createMongoMessageServiceFixture(options);
    fixtures.push(created);
    return created;
  }

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map((created) => created.close()));
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await stopMongoReplicaSet();
  });

  it('measures completed-replay cost for batch sizes 1/5/20 with bounded time', async () => {
    const rows: Array<Record<string, unknown>> = [];
    for (const size of [1, 5, 20]) {
      const prepareMessage = vi.fn(async ({ user }: { user: { _id: unknown } }) =>
        Array.from({ length: size }, (_, index) => ({
          fromUser: user._id,
          toUser: receiverId,
          payload: { item: `item-${index}`, pad: 'x'.repeat(120) },
        })),
      );
      const templateCd = `msgf14-batch-${size}`;
      const created = await fixture({
        templates: [{ ...batchTemplate(templateCd, size), prepareMessage: prepareMessage as never }],
      });
      const params = { templateCd, user: { _id: senderId }, clientRequestId: `replay-cost-${size}` };
      const first = await created.service.createMessage(params);
      expect(first).toHaveLength(size);
      expect(prepareMessage).toHaveBeenCalledTimes(1);

      const { counters, restore } = instrumentCounters(created.models);
      const start = performance.now();
      const replay = await created.service.createMessage(params);
      const elapsedMs = performance.now() - start;
      restore();

      expect(replay).toHaveLength(size);
      expect(prepareMessage).toHaveBeenCalledTimes(1);
      const bytes = jsonBytes(replay);
      const totalReads = counters.requestFindOne + counters.activeFind + counters.archiveFind;
      rows.push({
        batchSize: size,
        elapsedMs: Math.round(elapsedMs * 100) / 100,
        requestFindOne: counters.requestFindOne,
        activeFind: counters.activeFind,
        archiveFind: counters.archiveFind,
        totalReads,
        bytes,
        bytesPerDoc: Math.round(bytes / size),
      });
      // Completed active-only replay is reservation-first: 1 reservation read
      // + 1 active find + 1 archive find, no reconciliation re-read.
      expect(counters.requestFindOne).toBe(1);
      expect(counters.activeFind).toBe(1);
      expect(counters.archiveFind).toBe(1);
      expect(elapsedMs).toBeLessThan(10_000);
      expect(bytes).toBeGreaterThan(0);
    }

    console.log(`MSGF14_REPLAY_BATCH_ROWS ${JSON.stringify(rows)}`);
  }, 60_000);

  it('measures duplicate callers, archived, failed, and live-pending replay paths', async () => {
    // Duplicate callers on a completed scope: one batch, bounded per-caller replays.
    {
      const prepareMessage = vi.fn(async ({ user }: { user: { _id: unknown } }) =>
        Array.from({ length: 5 }, (_, index) => ({
          fromUser: user._id,
          toUser: receiverId,
          payload: { item: `dup-${index}` },
        })),
      );
      const templateCd = 'msgf14-dup-callers';
      const created = await fixture({
        templates: [{ ...batchTemplate(templateCd, 5), prepareMessage: prepareMessage as never }],
      });
      const params = { templateCd, user: { _id: senderId }, clientRequestId: 'dup-callers-1' };
      await created.service.createMessage(params);
      const { counters, restore } = instrumentCounters(created.models);
      const start = performance.now();
      const results = await Promise.all([
        created.service.createMessage(params),
        created.service.createMessage(params),
        created.service.createMessage(params),
      ]);
      const elapsedMs = performance.now() - start;
      restore();
      for (const replay of results) expect(replay).toHaveLength(5);
      expect(prepareMessage).toHaveBeenCalledTimes(1);

      console.log(
        `MSGF14_DUP_CALLERS ${JSON.stringify({ callers: 3, elapsedMs: Math.round(elapsedMs * 100) / 100, counters })}`,
      );
      expect(elapsedMs).toBeLessThan(10_000);
      expect(counters.requestFindOne).toBe(3);
      expect(counters.activeFind).toBe(3);
      expect(counters.archiveFind).toBe(3);
    }

    // Archived replay (all items archived via direct trusted archive on the
    // owning connection): same 3-read protocol, no preparation rerun.
    {
      const actionTemplate: MessageTemplate = {
        ...batchTemplate('msgf14-archived-replay', 2),
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
      };
      const prepareMessage = vi.fn(actionTemplate.prepareMessage);
      const created = await fixture({
        templates: [{ ...actionTemplate, prepareMessage: prepareMessage as never }],
      });
      const params = {
        templateCd: actionTemplate.templateCd,
        user: { _id: senderId },
        clientRequestId: 'archived-replay-1',
      };
      const first = await created.service.createMessage(params);
      expect(first).toHaveLength(2);
      for (const doc of first) {
        await created.service.handleAction(actionTemplate.templateCd, 'approve', {
          message: doc as never,
          user: { _id: receiverId },
        });
      }
      const { counters, restore } = instrumentCounters(created.models);
      const start = performance.now();
      const replay = await created.service.createMessage(params);
      const elapsedMs = performance.now() - start;
      restore();
      expect(replay).toHaveLength(2);
      expect(replay.filter((doc) => 'archivedAt' in (doc as object))).toHaveLength(2);
      expect(prepareMessage).toHaveBeenCalledTimes(1);

      console.log(
        `MSGF14_ARCHIVED_REPLAY ${JSON.stringify({
          elapsedMs: Math.round(elapsedMs * 100) / 100,
          bytes: jsonBytes(replay),
          counters,
        })}`,
      );
      expect(counters.requestFindOne).toBe(1);
      expect(counters.activeFind).toBe(1);
      expect(counters.archiveFind).toBe(1);
      expect(elapsedMs).toBeLessThan(10_000);
    }

    // Failed replay: state-first — only the reservation read, no message finds.
    {
      const failing: MessageTemplate = {
        ...batchTemplate('msgf14-failed-replay', 1),
        prepareMessage: (async () => {
          throw new Error('MSGF14 synthetic preparation failure');
        }) as never,
      };
      const created = await fixture({ templates: [failing] });
      const params = { templateCd: failing.templateCd, user: { _id: senderId }, clientRequestId: 'failed-replay-1' };
      await expect(created.service.createMessage(params)).rejects.toThrow('MSGF14 synthetic preparation failure');
      const { counters, restore } = instrumentCounters(created.models);
      await expect(created.service.createMessage(params)).rejects.toBeInstanceOf(ClientRequestFailedError);
      restore();

      console.log(`MSGF14_FAILED_REPLAY ${JSON.stringify(counters)}`);
      expect(counters.requestFindOne).toBe(1);
      expect(counters.activeFind).toBe(0);
      expect(counters.archiveFind).toBe(0);
    }

    // Live-pending duplicate with zero wait: bounded immediate pending error.
    {
      const created = await fixture({
        templates: [batchTemplate('msgf14-live-pending', 1)],
        serviceOptions: { clientRequestWaitMs: 0, clientRequestPollMs: 1 },
      });
      // Occupy the scope with a live lease directly on the request collection.
      await created.models.MessageRequest.create({
        clientRequestId: 'live-pending-1',
        clientRequestOwnerId: String(senderId),
        templateCd: 'msgf14-live-pending',
        state: 'pending',
        itemCount: null,
        leaseOwnerId: 'other-owner',
        leaseExpiresAt: new Date(Date.now() + 60_000),
      });
      const { counters, restore } = instrumentCounters(created.models);
      const start = performance.now();
      await expect(
        created.service.createMessage({
          templateCd: 'msgf14-live-pending',
          user: { _id: senderId },
          clientRequestId: 'live-pending-1',
        }),
      ).rejects.toBeInstanceOf(ClientRequestPendingError);
      const elapsedMs = performance.now() - start;
      restore();

      console.log(
        `MSGF14_LIVE_PENDING ${JSON.stringify({
          elapsedMs: Math.round(elapsedMs * 100) / 100,
          counters,
        })}`,
      );
      expect(elapsedMs).toBeLessThan(5_000);
      // Zero-wait duplicate on a live pending lease: initial state-first
      // reservation check (pending -> null, no message reads) + one wait
      // cycle (failed insert + failed takeover + pending reservation recheck
      // returning null before any message read) then immediate pending error.
      expect(counters.requestCreate).toBe(1);
      expect(counters.requestFindOneAndUpdate).toBe(1);
      expect(counters.requestFindOne).toBe(2);
      expect(counters.activeFind).toBe(0);
      expect(counters.archiveFind).toBe(0);
    }
  }, 60_000);

  it('captures executionStats for the actual 3-branch visibility query across offsets', async () => {
    const databaseName = `message_service_msgf14_${new mongoose.Types.ObjectId().toString()}`;
    const connection = await mongoose
      .createConnection(await getMongoReplicaSetUri(), { dbName: databaseName, autoIndex: true })
      .asPromise();
    fixtures.push({
      connection,
      databaseName,
      registry: new TemplateRegistry(),
      service: undefined as never,
      models: undefined as never,
      close: async () => {
        await connection.dropDatabase();
        await connection.close();
      },
    });
    const Message = connection.model(MESSAGE_MODEL_NAME, buildMessageSchema());
    const MessageArchive = connection.model(MESSAGE_ARCHIVE_MODEL_NAME, buildMessageArchiveSchema());
    const MessageRequest = connection.model(MESSAGE_REQUEST_MODEL_NAME, buildMessageRequestSchema());
    await Promise.all([Message.init(), MessageArchive.init(), MessageRequest.init()]);
    const registry = new TemplateRegistry();
    const service = new MessageService({
      getModel: (name: string) => {
        if (name === MESSAGE_MODEL_NAME) return Message as never;
        if (name === MESSAGE_ARCHIVE_MODEL_NAME) return MessageArchive as never;
        if (name === MESSAGE_REQUEST_MODEL_NAME) return MessageRequest as never;
        throw new Error(`unknown model ${name}`);
      },
      registry,
    });

    const userId = new mongoose.Types.ObjectId();
    const otherId = new mongoose.Types.ObjectId();
    const user = { _id: userId, roles: ['editor', 'reviewer'] };
    const sameCreatedAt = new Date('2026-09-01T00:00:00.000Z');
    const baseContent = (title: string) => ({
      title,
      long: `${title} long`,
      short: title,
    });

    const docs: Record<string, unknown>[] = [];
    const push = (count: number, fields: Record<string, unknown>) => {
      for (let index = 0; index < count; index += 1) {
        docs.push({
          templateCd: `msgf14-vis-${docs.length}`,
          type: 'notification',
          fromUser: otherId,
          toUser: otherId,
          toRoles: ['noise'],
          senderContent: baseContent(`sender ${docs.length}`),
          receiverContent: baseContent(`receiver ${docs.length}`),
          ...fields,
        });
      }
    };
    // Selectivity: 140 visible / 240 total (~58% visible).
    push(40, { fromUser: userId }); // sender branch
    push(40, { fromUser: otherId, toUser: userId }); // receiver branch
    push(40, { fromUser: otherId, toUser: otherId, toRoles: ['editor'] }); // role branch 1
    push(20, { fromUser: otherId, toUser: otherId, toRoles: ['reviewer'] }); // role branch 2
    push(100, { fromUser: otherId, toUser: otherId, toRoles: ['noise'] }); // invisible noise
    const createdIds = (await Message.create(docs)) as unknown as Array<{ _id: mongoose.Types.ObjectId }>;
    // Equal timestamps for the first 60 docs to exercise the _id tie-break.
    await Message.updateMany(
      { _id: { $in: createdIds.slice(0, 60).map((doc) => doc._id) } },
      { $set: { createdAt: sameCreatedAt, updatedAt: sameCreatedAt } },
    );

    const filter = service.buildVisibilityFilter(user);
    const indexes = await Message.collection.listIndexes().toArray();
    let serverVersion: string;
    try {
      const info = (await (
        connection.db as unknown as { admin: () => { serverInfo: () => Promise<{ version: string }> } }
      )
        .admin()
        .serverInfo()) as { version: string };
      serverVersion = info.version;
    } catch {
      serverVersion = `mongoose-${mongoose.version}`;
    }

    const rows: Array<Record<string, unknown>> = [];
    for (const skip of [0, 40, 100]) {
      const limit = 20;
      const explain = (await Message.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .explain('executionStats')) as unknown as {
        executionStats?: {
          executionTimeMillis?: number;
          totalKeysExamined?: number;
          totalDocsExamined?: number;
          nReturned?: number;
        };
      };
      const stats = explain.executionStats ?? {};
      const stages = collectStages(explain);
      const indexNames = [...new Set(collectIndexNames(explain))];
      const page = await service.listMessages({ user, limit, skip });
      rows.push({
        skip,
        limit,
        nReturned: stats.nReturned,
        pageLength: page.length,
        totalKeysExamined: stats.totalKeysExamined,
        totalDocsExamined: stats.totalDocsExamined,
        executionTimeMillis: stats.executionTimeMillis,
        stages: [...new Set(stages)],
        indexNames,
        hasBlockingSort: stages.includes('SORT'),
        hasCollscan: stages.includes('COLLSCAN'),
      });
      expect(page).toHaveLength(skip === 100 ? 20 : 20);
      expect(stats.nReturned).toBe(20);
    }

    console.log(
      `MSGF14_VISIBILITY ${JSON.stringify({
        dataset: { total: 240, visible: 140, noise: 100, equalTimestamps: 60, roles: ['editor', 'reviewer'] },
        serverVersion,
        mongooseVersion: mongoose.version,
        indexes: indexes.map((entry: { key: unknown; name?: unknown }) => ({ name: entry.name, key: entry.key })),
        rows,
      })}`,
    );
    // Reproducibility guardrails only: bounded explain + correct paging. The
    // task file records the actual winning plan; this test must not lock a
    // planner shape that varies by server version.
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.pageLength).toBe(20);
      expect(typeof row.totalDocsExamined).toBe('number');
    }
  }, 60_000);
});
