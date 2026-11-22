import type { Connection, mongo } from 'mongoose';
import { MONGOOSE_DEFAULT_NAMES } from '../constants';
import type { CallOptions } from '../contracts/message';
import { readCallOptions } from '../internal/budget';
import { invalid, readRecord } from '../internal/validation';
import { batch, checkConnectionType } from '../stores/mongoose/connection';
import type { ManagedAttachmentBacking } from './backing';
import type { ManagedAttachmentBindingOptions, ManagedAttachmentStore } from './contracts';
import { attachmentFind, prepareAttachmentCollection } from './mongoose/collection';
import { MongoAttachmentCommands, type MongoAttachmentConnection } from './mongoose/connection';
import { attachmentBson, attachmentValidator, readAttachmentBson } from './mongoose/records';
import { createManagedAttachmentOperations, MANAGED_ATTACHMENT_CALL_BOUNDS } from './operations';
import { managedAttachmentBoundary, MANAGED_ATTACHMENT_CLOCK_GUARD_MS, readManagedAttachmentBinding } from './records';
import { createManagedAttachmentStore } from './store';

export type MongooseAttachmentStoreOptions = Readonly<
  ManagedAttachmentBindingOptions & {
    /** Dedicated collection; defaults to `email_attachments`. Never use a queue collection. */
    collection?: string;
  }
>;

export type MongooseAttachmentStore = Readonly<
  ManagedAttachmentStore & {
    /** Validate the existing attachment backing. A provisioner can opt in to installing missing definitions. */
    ready(options?: CallOptions & { install?: boolean }): Promise<void>;
  }
>;

// Definite access, policy, protocol and validator failures. Neither duplicate
// nor write-concern failure proves that no exact attachment is present.
const REJECTED_INSERT = new Set([2, 9, 13, 18, 20, 26, 59, 72, 73, 115, 121, 323, 361, 371, 40415]);
type ReadyBinding = Readonly<{
  connection: MongoAttachmentConnection;
  replicaSetId: string;
  uuid: mongo.UUID;
}>;

/**
 * Managed BSON attachments on an explicit caller-owned Mongoose 9.12.2+ connection.
 * Open it yourself and await `store.ready()` on a journaled MongoDB 8.x WiredTiger
 * replica set. Call `ready()` again after a reconnect to the same backing. This
 * factory never connects, closes, registers a model or operates on the queue.
 */
export function createMongooseAttachmentStore(
  connection: Connection,
  options: MongooseAttachmentStoreOptions,
): MongooseAttachmentStore {
  checkConnectionType(connection);
  const raw = readRecord(options, ['resolverKey', 'namespace'], ['collection'], 'invalid_config');
  const binding = readManagedAttachmentBinding({ resolverKey: raw.resolverKey, namespace: raw.namespace });
  const name = raw.collection === undefined ? 'email_attachments' : raw.collection;
  if (
    typeof name !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) ||
    name === MONGOOSE_DEFAULT_NAMES.jobsCollection ||
    name === MONGOOSE_DEFAULT_NAMES.activitiesCollection
  )
    invalid('invalid_config');

  const io = new MongoAttachmentCommands(connection);
  const operations = createManagedAttachmentOperations();
  const validator = attachmentValidator(binding);
  let prepared: ReadyBinding | undefined;
  let pinned: { db: string; replicaSetId: string; uuid: string } | undefined;
  let preparing = false;

  const backing: ManagedAttachmentBacking = {
    async create(write, request) {
      const ready = prepared;
      if (!ready) return { status: 'unavailable' };
      const doc = attachmentBson(write, io.driver.Binary);
      const result = await io.run(
        ready.connection,
        request,
        { insert: name, collectionUUID: ready.uuid, documents: [doc], ordered: true },
        'write',
      );
      if (!request.dispatched) return { status: 'unavailable' };
      if (ready !== prepared) return { status: 'confirm' };
      if (result.kind === 'ack') {
        const { n, writeErrors } = result.value;
        if (n === 1 && !Object.hasOwn(result.value, 'writeErrors')) {
          return { status: 'confirmed', retainedThrough: doc.purgeAt.getTime() - MANAGED_ATTACHMENT_CLOCK_GUARD_MS };
        }
        if (
          n === 0 &&
          Array.isArray(writeErrors) &&
          writeErrors.length === 1 &&
          writeErrors[0]?.index === 0 &&
          REJECTED_INSERT.has(writeErrors[0].code)
        )
          return { status: 'incompatible' };
        // Duplicate, unrecognized or malformed ACK: require independent strong proof.
      } else if (result.code !== undefined && REJECTED_INSERT.has(result.code)) {
        return { status: 'incompatible' };
      }
      return { status: 'confirm' };
    },
    async read(key, request) {
      const ready = prepared;
      if (!ready) return { status: 'unavailable' };
      const { connection: bound, uuid } = ready;
      const result = await io.run(bound, request, attachmentFind(name, uuid, key));
      if (ready !== prepared) return { status: 'unavailable' };
      if (result.kind === 'failure') return { status: result.transient ? 'unavailable' : 'incompatible' };
      const [row] = batch(result.value, 1, `${bound.db.databaseName}.${name}`);
      if (!row) return { status: 'missing' };
      try {
        return readAttachmentBson(row, io.driver.Binary);
      } catch {
        return { status: 'invalid' };
      }
    },
  };

  return Object.freeze<MongooseAttachmentStore>({
    ...createManagedAttachmentStore(binding, backing, operations),
    async ready(options = {}) {
      const { install, ...callOptions } = readRecord(options, [], ['install', 'signal', 'timeoutMs'], 'invalid_config');
      if (install !== undefined && typeof install !== 'boolean') invalid('invalid_config');
      const call = readCallOptions(callOptions, MANAGED_ATTACHMENT_CALL_BOUNDS);
      // Never rebind while data RPCs are still settling, including a late ACK
      // from a previous connection generation after the caller stopped waiting.
      if (preparing || io.busy) invalid('busy');
      preparing = true;
      try {
        await operations.run(
          call,
          async (op): Promise<ReadyBinding> => {
            prepared = undefined;
            const bound = io.bind(name);
            const replicaSetId = await io.verifyTopology(op, bound);
            if (pinned && (pinned.db !== bound.db.databaseName || pinned.replicaSetId !== replicaSetId))
              invalid('store_incompatible');
            const uuid = await prepareAttachmentCollection(
              io,
              op,
              bound,
              name,
              validator,
              `${managedAttachmentBoundary(binding.namespace)}!readiness`,
              install === true,
              pinned?.uuid,
            );
            return { connection: bound, replicaSetId, uuid };
          },
          (ready) => {
            const { connection: bound, replicaSetId, uuid } = ready;
            if (!io.current(bound)) invalid('store_unavailable');
            pinned ??= { db: bound.db.databaseName, replicaSetId, uuid: uuid.toHexString() };
            prepared = ready;
          },
        );
      } finally {
        preparing = false;
      }
    },
  });
}
