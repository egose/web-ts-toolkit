import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MessageService } from '../../src/message-service';
import { buildMessageArchiveSchema } from '../../src/schemas/message-archive';
import { buildMessageRequestSchema } from '../../src/schemas/message-request';
import { buildMessageSchema } from '../../src/schemas/message';
import { MESSAGE_ARCHIVE_MODEL_NAME, MESSAGE_MODEL_NAME, MESSAGE_REQUEST_MODEL_NAME } from '../../src/schemas/base';
import { TemplateRegistry } from '../../src/template-registry';
import type { MessageTemplate } from '../../src/types/template';
import type { DeferredBarrier, MessageServiceBarriers } from './deferred';

type MessageModels = {
  Message: mongoose.Model<unknown>;
  MessageArchive: mongoose.Model<unknown>;
  MessageRequest: mongoose.Model<unknown>;
};

export type MongoMessageServiceFixture = {
  connection: mongoose.Connection;
  databaseName: string;
  registry: TemplateRegistry;
  service: MessageService;
  models: MessageModels;
  close: () => Promise<void>;
};

let replSet: MongoMemoryReplSet | undefined;

export async function getMongoReplicaSetUri(): Promise<string> {
  if (!replSet) {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  }

  return replSet.getUri();
}

export async function stopMongoReplicaSet(): Promise<void> {
  if (replSet) {
    await replSet.stop();
    replSet = undefined;
  }
}

export async function createMongoMessageServiceFixture(
  options: {
    templates?: MessageTemplate[];
    barriers?: MessageServiceBarriers;
    serviceOptions?: Pick<
      ConstructorParameters<typeof MessageService>[0],
      | 'clientRequestLeaseMs'
      | 'clientRequestWaitMs'
      | 'clientRequestPollMs'
      | 'clientRequestDelay'
      | 'paymentProvider'
      | 'onPaymentCompensationFailure'
    >;
  } = {},
): Promise<MongoMessageServiceFixture> {
  const databaseName = `message_service_${randomUUID().replace(/-/g, '')}`;
  const connection = await mongoose
    .createConnection(await getMongoReplicaSetUri(), {
      dbName: databaseName,
      autoIndex: true,
    })
    .asPromise();

  const models: MessageModels = {
    Message: connection.model(MESSAGE_MODEL_NAME, buildMessageSchema()),
    MessageArchive: connection.model(MESSAGE_ARCHIVE_MODEL_NAME, buildMessageArchiveSchema()),
    MessageRequest: connection.model(MESSAGE_REQUEST_MODEL_NAME, buildMessageRequestSchema()),
  };
  await Promise.all(Object.values(models).map((model) => model.init()));

  const registry = new TemplateRegistry();
  registry.registerAll(options.templates ?? []);

  const getModel = buildModelGetter(models, options.barriers);
  const service = new MessageService({ getModel, registry, ...options.serviceOptions });

  return {
    connection,
    databaseName,
    registry,
    service,
    models,
    close: async () => {
      await connection.dropDatabase();
      await connection.close();
    },
  };
}

function buildModelGetter(
  models: MessageModels,
  barriers?: MessageServiceBarriers,
): (name: string) => mongoose.Model<unknown> {
  if (!barriers) {
    return (name) => getFixtureModel(models, name);
  }

  const wrappedMessage = wrapMessageModel(models.Message, {
    afterCreate: async (doc) => {
      if (doc?.clientRequestId && doc.clientRequestItemIndex === 0) {
        await barriers.firstBatchItemCommitted.arrive();
      }
    },
    afterFindOneAndUpdate: async (doc) => {
      if (doc?.actionState === 'processing' && doc.actionAttemptId) {
        await barriers.actionClaimed.arrive();
      }
    },
  });
  const wrappedRequest = wrapCreate(models.MessageRequest, async (doc) => {
    if (doc?.clientRequestId) {
      await barriers.reservationAcquired.arrive();
    }
  });
  const wrappedArchive = wrapCreate(models.MessageArchive, async (doc) => {
    if (doc?.actionAttemptId) {
      await barriers.archiveCommitted.arrive();
    }
  });

  return (name) => {
    if (name === MESSAGE_MODEL_NAME) return wrappedMessage;
    if (name === MESSAGE_ARCHIVE_MODEL_NAME) return wrappedArchive;
    if (name === MESSAGE_REQUEST_MODEL_NAME) return wrappedRequest;
    return getFixtureModel(models, name);
  };
}

function getFixtureModel(models: MessageModels, name: string): mongoose.Model<unknown> {
  if (name === MESSAGE_MODEL_NAME) return models.Message;
  if (name === MESSAGE_ARCHIVE_MODEL_NAME) return models.MessageArchive;
  if (name === MESSAGE_REQUEST_MODEL_NAME) return models.MessageRequest;
  throw new Error(`Unknown message-service fixture model: ${name}`);
}

function wrapCreate(model: mongoose.Model<unknown>, afterCreate: (doc: Record<string, unknown>) => Promise<void>) {
  return wrapMessageModel(model, { afterCreate });
}

function wrapMessageModel(
  model: mongoose.Model<unknown>,
  hooks: {
    afterCreate?: (doc: Record<string, unknown>) => Promise<void>;
    afterFindOneAndUpdate?: (doc: Record<string, unknown>) => Promise<void>;
  },
) {
  return new Proxy(model, {
    get(target, property, receiver) {
      if (property === 'create' && hooks.afterCreate) {
        return async (...args: Parameters<typeof model.create>) => {
          const result = await model.create(...args);
          const docs = Array.isArray(result) ? result : [result];
          for (const doc of docs) {
            await hooks.afterCreate?.(doc as unknown as Record<string, unknown>);
          }
          return result;
        };
      }

      if (property === 'findOneAndUpdate' && hooks.afterFindOneAndUpdate) {
        return async (...args: Parameters<typeof model.findOneAndUpdate>) => {
          const result = await model.findOneAndUpdate(...args);
          if (result) {
            await hooks.afterFindOneAndUpdate?.(result as unknown as Record<string, unknown>);
          }
          return result;
        };
      }
      return Reflect.get(target, property, receiver);
    },
  }) as mongoose.Model<unknown>;
}

export function releaseBarriers(...barriers: DeferredBarrier[]): void {
  for (const barrier of barriers) {
    barrier.release();
  }
}
