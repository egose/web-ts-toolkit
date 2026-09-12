import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMongoMessageServiceFixture,
  getMongoReplicaSetUri,
  type MongoMessageServiceFixture,
} from './support/mongodb-fixture';
import {
  ActionConflictError,
  ActionNotFoundError,
  InvalidMessageUserError,
  MessageArchivedError,
  MessageNotFoundError,
  MessageTransactionRequiredError,
  TemplateNotFoundError,
} from '../src/message-service';
import { buildMessageArchiveSchema } from '../src/schemas/message-archive';
import { buildMessageSchema } from '../src/schemas/message';
import { MESSAGE_ARCHIVE_MODEL_NAME, MESSAGE_MODEL_NAME } from '../src/schemas/base';
import { createDeferredBarrier } from './support/deferred';
import type { MessageTemplate } from '../src/types/template';

const senderId = new mongoose.Types.ObjectId();
const receiverId = new mongoose.Types.ObjectId();

const baseTemplate: MessageTemplate = {
  templateCd: 'direct-archive-test',
  type: 'request',
  description: 'MSGF-07 direct archive',
  senderContent: { title: 'Sender', long: 'Sender long', short: 'Sender short' },
  receiverContent: { title: 'Receiver', long: 'Receiver long', short: 'Receiver short' },
  uiTemplate: 'default-message',
  prepareMessage: async ({ user, payload }) => ({
    fromUser: user._id,
    toUser: (payload.toUser as mongoose.Types.ObjectId | undefined) ?? receiverId,
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
};

type ArchiveDoc = {
  archive: (actionCd: string, archivedBy: unknown, registry: unknown) => Promise<void>;
  _id: unknown;
  templateCd: string;
};

async function activeCount(models: MongoMessageServiceFixture['models'], id: unknown) {
  return models.Message.countDocuments({ _id: id });
}

async function archiveCount(models: MongoMessageServiceFixture['models'], id: unknown) {
  return models.MessageArchive.countDocuments({ _id: id });
}

describe('Message document direct archive() (MSGF-07)', () => {
  const fixtures: MongoMessageServiceFixture[] = [];
  const extraConnections: mongoose.Connection[] = [];

  async function fixture(options: Parameters<typeof createMongoMessageServiceFixture>[0] = {}) {
    const created = await createMongoMessageServiceFixture(options);
    fixtures.push(created);
    return created;
  }

  afterEach(async () => {
    while (fixtures.length > 0) {
      const current = fixtures.pop();
      if (current) await current.close();
    }
    while (extraConnections.length > 0) {
      const connection = extraConnections.pop();
      if (connection) {
        await connection.dropDatabase().catch(() => undefined);
        await connection.close();
      }
    }
    vi.restoreAllMocks();
  });

  it('atomically moves the active message to the archive on the owning connection', async () => {
    const { service, registry, models } = await fixture({ templates: [baseTemplate] });
    const [message] = await service.createMessage({
      templateCd: baseTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId },
    });

    await (message as unknown as ArchiveDoc).archive('approve', receiverId, registry);

    expect(await activeCount(models, message._id)).toBe(0);
    expect(await archiveCount(models, message._id)).toBe(1);
    const archived = (await models.MessageArchive.findById(message._id).lean()) as unknown as Record<string, unknown>;
    expect(archived.actionCd).toBe('approve');
    expect(String(archived.archivedBy)).toBe(String(receiverId));
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(archived.actionNotificationState).toBe('none');
    expect(archived.actionNotificationError).toBeNull();
    expect(archived.actionNotificationAttemptedAt).toBeNull();
  });

  it('rejects unknown actions, unknown templates, and empty action codes without state change', async () => {
    const { service, registry, models } = await fixture({ templates: [baseTemplate] });
    const [message] = await service.createMessage({
      templateCd: baseTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId },
    });
    const doc = message as unknown as ArchiveDoc;

    await expect(doc.archive('missing-action', receiverId, registry)).rejects.toBeInstanceOf(ActionNotFoundError);
    await expect(doc.archive('', receiverId, registry)).rejects.toBeInstanceOf(ActionNotFoundError);
    // Unknown template: mutate a detached copy's templateCd via the model, then archive the stale doc.
    const unknownTemplateDoc = (await models.Message.findById(message._id)) as unknown as {
      templateCd: string;
      archive: ArchiveDoc['archive'];
    };
    unknownTemplateDoc.templateCd = 'not-registered';
    await expect(unknownTemplateDoc.archive('approve', receiverId, registry)).rejects.toBeInstanceOf(
      TemplateNotFoundError,
    );

    expect(await activeCount(models, message._id)).toBe(1);
    expect(await archiveCount(models, message._id)).toBe(0);
  });

  it('rejects invalid archivedBy identities without state change', async () => {
    const { service, registry, models } = await fixture({ templates: [baseTemplate] });
    const [message] = await service.createMessage({
      templateCd: baseTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId },
    });
    const doc = message as unknown as ArchiveDoc;

    for (const invalid of [null, undefined, '', '   ', 42, [], {}, ['x']]) {
      await expect(doc.archive('approve', invalid, registry)).rejects.toBeInstanceOf(InvalidMessageUserError);
    }

    expect(await activeCount(models, message._id)).toBe(1);
    expect(await archiveCount(models, message._id)).toBe(0);
  });

  it('rejects repeat calls as archived without duplicating state', async () => {
    const { service, registry, models } = await fixture({ templates: [baseTemplate] });
    const [message] = await service.createMessage({
      templateCd: baseTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId },
    });
    const doc = message as unknown as ArchiveDoc;

    await doc.archive('approve', receiverId, registry);
    await expect(doc.archive('approve', receiverId, registry)).rejects.toBeInstanceOf(MessageArchivedError);

    // A freshly loaded missing doc with an existing archive also reports archived.
    const ghost = (await models.Message.findById(message._id)) as unknown;
    expect(ghost).toBeNull();
    expect(await archiveCount(models, message._id)).toBe(1);
  });

  it('reports not-found when neither active nor archive copies exist', async () => {
    const { service, registry, models } = await fixture({ templates: [baseTemplate] });
    const [message] = await service.createMessage({
      templateCd: baseTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId },
    });
    const doc = (await models.Message.findById(message._id)) as unknown as ArchiveDoc;
    await models.Message.deleteOne({ _id: message._id });

    await expect(doc.archive('approve', receiverId, registry)).rejects.toBeInstanceOf(MessageNotFoundError);
    expect(await archiveCount(models, message._id)).toBe(0);
  });

  it('refuses to steal a live service claim and leaves a single coherent state', async () => {
    const gate = createDeferredBarrier('handler gate');
    const gatedTemplate: MessageTemplate = {
      ...baseTemplate,
      templateCd: 'direct-archive-live-claim',
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'success',
          sender: false,
          receiver: true,
          runHandler: async () => {
            await gate.arrive();
            return 'approved';
          },
        },
      ],
    };
    const { service, registry, models } = await fixture({ templates: [gatedTemplate] });
    const [message] = await service.createMessage({
      templateCd: gatedTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId },
    });

    const serviceCall = service
      .handleAction(gatedTemplate.templateCd, 'approve', {
        message: message as never,
        user: { _id: receiverId },
      })
      .then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (error) => ({ status: 'rejected' as const, error }),
      );
    await vi.waitFor(async () => {
      const stored = (await models.Message.findById(message._id).lean()) as unknown as Record<string, unknown> | null;
      expect(stored?.actionState).toBe('processing');
    });

    const directDoc = (await models.Message.findById(message._id)) as unknown as ArchiveDoc;
    await expect(directDoc.archive('approve', receiverId, registry)).rejects.toBeInstanceOf(ActionConflictError);

    // No orphan archive was left behind by the refused direct attempt.
    expect(await archiveCount(models, message._id)).toBe(0);
    expect(await activeCount(models, message._id)).toBe(1);

    gate.release();
    const outcome = await serviceCall;
    expect(outcome.status).toBe('fulfilled');
    expect(await activeCount(models, message._id)).toBe(0);
    expect(await archiveCount(models, message._id)).toBe(1);
  });

  it('loses to a service commit when the service wins first: no conflicting second commit', async () => {
    const { service, registry, models } = await fixture({ templates: [baseTemplate] });
    const [message] = await service.createMessage({
      templateCd: baseTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId },
    });

    await service.handleAction(baseTemplate.templateCd, 'approve', {
      message: message as never,
      user: { _id: receiverId },
    });

    const staleDoc = message as unknown as ArchiveDoc;
    await expect(staleDoc.archive('approve', receiverId, registry)).rejects.toBeInstanceOf(MessageArchivedError);
    expect(await activeCount(models, message._id)).toBe(0);
    expect(await archiveCount(models, message._id)).toBe(1);
  });

  it('leaves a single coherent state when the archive insert fails', async () => {
    const { service, registry, models } = await fixture({ templates: [baseTemplate] });
    const [message] = await service.createMessage({
      templateCd: baseTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId },
    });

    const createSpy = vi
      .spyOn(models.MessageArchive as unknown as { create: (...args: unknown[]) => Promise<unknown> }, 'create')
      .mockRejectedValueOnce(new Error('archive-insert-boom'));

    const doc = (await models.Message.findById(message._id)) as unknown as ArchiveDoc;
    await expect(doc.archive('approve', receiverId, registry)).rejects.toThrow('archive-insert-boom');
    expect(createSpy).toHaveBeenCalledTimes(1);

    expect(await activeCount(models, message._id)).toBe(1);
    expect(await archiveCount(models, message._id)).toBe(0);
  });

  it('works on a custom owning connection rather than global mongoose', async () => {
    const uri = await getMongoReplicaSetUri();
    const databaseName = `direct_archive_custom_${Date.now()}`;
    const connection = await mongoose.createConnection(uri, { dbName: databaseName, autoIndex: true }).asPromise();
    extraConnections.push(connection);
    connection.model(MESSAGE_MODEL_NAME, buildMessageSchema());
    connection.model(MESSAGE_ARCHIVE_MODEL_NAME, buildMessageArchiveSchema());
    await Promise.all([
      connection.model(MESSAGE_MODEL_NAME).init(),
      connection.model(MESSAGE_ARCHIVE_MODEL_NAME).init(),
    ]);

    const registry = (await fixture({ templates: [baseTemplate] })).registry;
    registry.register(baseTemplate);

    const Active = connection.model(MESSAGE_MODEL_NAME);
    const created = (await Active.create({
      templateCd: baseTemplate.templateCd,
      type: 'request',
      fromUser: senderId,
      toUser: receiverId,
      toRoles: [],
      senderContent: { title: 'S', long: 'S', short: 'S' },
      receiverContent: { title: 'R', long: 'R', short: 'R' },
      payload: {},
      display: {},
    })) as unknown as ArchiveDoc & { _id: unknown };

    await created.archive('approve', senderId, registry);

    expect(await Active.countDocuments({ _id: created._id })).toBe(0);
    expect(await connection.model(MESSAGE_ARCHIVE_MODEL_NAME).countDocuments({ _id: created._id })).toBe(1);
  });

  it('requires transaction support instead of writing partial state', async () => {
    const { service, registry, models, connection } = await fixture({ templates: [baseTemplate] });
    const [message] = await service.createMessage({
      templateCd: baseTemplate.templateCd,
      user: { _id: senderId },
      payload: { toUser: receiverId },
    });

    const startSession = connection.startSession.bind(connection);
    vi.spyOn(connection, 'startSession').mockRejectedValueOnce(
      new Error('Transaction numbers are only allowed on a replica set member or mongos'),
    );

    const doc = (await models.Message.findById(message._id)) as unknown as ArchiveDoc;
    await expect(doc.archive('approve', receiverId, registry)).rejects.toBeInstanceOf(MessageTransactionRequiredError);
    expect(await activeCount(models, message._id)).toBe(1);
    expect(await archiveCount(models, message._id)).toBe(0);

    // The connection itself is healthy: restoring session support archives fine.
    void startSession;
    await doc.archive('approve', receiverId, registry);
    expect(await activeCount(models, message._id)).toBe(0);
    expect(await archiveCount(models, message._id)).toBe(1);
  });
});
