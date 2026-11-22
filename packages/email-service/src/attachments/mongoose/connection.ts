import type { Connection, mongo } from 'mongoose';
import { invalid } from '../../internal/validation';
import { doc, type BsonDocument } from '../../stores/mongoose/connection';
import type { ManagedAttachmentOperation, ManagedAttachmentRequest } from '../backing';

type Driver = typeof mongo;
type ConnectionEpoch = { controller: AbortController };
const epochs = new WeakMap<Connection, ConnectionEpoch>();

function observe(connection: Connection): ConnectionEpoch {
  let epoch = epochs.get(connection);
  if (!epoch) {
    const tracked = { controller: new AbortController() };
    const changed = () => {
      const before = tracked.controller;
      tracked.controller = new AbortController();
      before.abort();
    };
    // Once per caller connection, not once per store. SDAM can reconnect using the
    // same Db and MongoClient objects, so object identity alone is insufficient.
    connection.prependListener('disconnected', changed).prependListener('connected', changed);
    epochs.set(connection, (epoch = tracked));
  }
  return epoch;
}

export type MongoAttachmentConnection = Readonly<{
  db: mongo.Db;
  client: mongo.MongoClient;
  signal: AbortSignal;
}>;

type CommandReply = { kind: 'ack'; value: BsonDocument } | { kind: 'failure'; transient: boolean; code?: number };

const FENCED = { kind: 'failure', transient: true } as const;
const INVALID_REPLY = { kind: 'failure', transient: false } as const;
// Includes failure of the linearizable read's own majority barrier (187),
// replication transitions, server/transport timeouts and admission throttles.
const TEMPORARY_SERVER = new Set([
  6, 7, 24, 50, 89, 91, 112, 133, 134, 187, 189, 202, 262, 279, 365, 402, 433, 449, 450, 462, 9001, 10058, 10107, 11600,
  11601, 11602, 13435, 13436,
]);
const TEMPORARY_DRIVER = new Set([
  'MongoClientClosedError',
  'MongoNotConnectedError',
  'MongoOperationTimeoutError',
  'MongoServerClosedError',
  'MongoServerSelectionError',
  'MongoStalePrimaryError',
  'MongoTopologyClosedError',
  'PoolClosedError',
  'WaitQueueTimeoutError',
]);

function driverFailure(driver: Driver, error: unknown): CommandReply {
  // A write concern failure is not a definitive server rejection, even if the
  // supplied code happens to match one that would normally be definitive.
  if (error instanceof driver.MongoServerError && !(error instanceof driver.MongoWriteConcernError)) {
    const code = typeof error.code === 'number' ? error.code : undefined;
    const transient =
      (code !== undefined && TEMPORARY_SERVER.has(code)) || error.hasErrorLabel('SystemOverloadedError');
    return { kind: 'failure', transient, ...(code === undefined ? {} : { code }) };
  }
  return {
    kind: 'failure',
    transient:
      error instanceof driver.MongoNetworkError ||
      (error instanceof driver.MongoError && TEMPORARY_DRIVER.has(error.name)),
  };
}

export class MongoAttachmentCommands {
  readonly driver: Driver;
  private pending = 0;

  constructor(private readonly connection: Connection) {
    this.driver = connection.base.mongo;
  }

  get busy(): boolean {
    return this.pending !== 0;
  }

  bind(collection: string): MongoAttachmentConnection {
    const { connection } = this;
    const { db } = connection;
    if (connection.readyState !== 1 || !db) invalid('store_unavailable');
    const client = connection.getClient();
    const options = client.options;
    if (
      Object.values(connection.models).some((model) => model.collection.name === collection) ||
      // Direct connections don't honor primary on the wire. Compression can
      // defer a socket write; raw commands can still retry overload by default.
      options.directConnection ||
      options.loadBalanced ||
      options.autoEncryption ||
      options.compressors.some((name) => name !== 'none') ||
      !!options.proxyHost ||
      (options.retryReads && options.retryWrites && options.maxAdaptiveRetries !== 0) ||
      // OIDC token expiry can make the driver silently resend a raw command after reauthentication.
      options.credentials?.mechanism === 'MONGODB-OIDC' ||
      !Number.isFinite(options.connectTimeoutMS) ||
      options.connectTimeoutMS <= 0
    )
      invalid('store_incompatible');
    return { db, client, signal: observe(connection).controller.signal };
  }

  current(binding: MongoAttachmentConnection): boolean {
    const { connection } = this;
    return (
      !binding.signal.aborted &&
      connection.readyState === 1 &&
      connection.db === binding.db &&
      connection.getClient() === binding.client
    );
  }

  async run(
    binding: MongoAttachmentConnection,
    request: ManagedAttachmentRequest,
    command: BsonDocument,
    target: 'read' | 'write' | 'admin' = 'read',
  ): Promise<CommandReply> {
    if (!this.current(binding)) return FENCED;
    const db = target === 'admin' ? binding.client.db('admin') : binding.db;
    const signal = AbortSignal.any([request.signal, binding.signal]);
    const maxTimeMS = request.begin();
    let response: unknown;
    this.pending++;
    try {
      response = await db.command(
        {
          ...command,
          maxTimeMS,
          ...(target === 'write' && { writeConcern: { w: 'majority', j: true, wtimeout: maxTimeMS } }),
        },
        {
          signal,
          readPreference: 'primary',
          promoteValues: true,
          promoteLongs: true,
          useBigInt64: false,
          raw: false,
          promoteBuffers: false,
        },
      );
    } catch (error) {
      request.check();
      return this.current(binding) ? driverFailure(this.driver, error) : FENCED;
    } finally {
      this.pending--;
    }
    request.check();
    if (!this.current(binding)) return FENCED;
    if (typeof response !== 'object' || response === null || Object.getPrototypeOf(response) !== Object.prototype)
      return INVALID_REPLY;
    const value = response as BsonDocument;
    return value.ok === 1 && !Object.hasOwn(value, 'writeConcernError') && !Object.hasOwn(value, 'writeConcernErrors')
      ? { kind: 'ack', value }
      : INVALID_REPLY;
  }

  async catalog(
    op: ManagedAttachmentOperation,
    binding: MongoAttachmentConnection,
    command: BsonDocument,
    target: 'read' | 'admin' = 'read',
  ): Promise<BsonDocument> {
    const result = await op.request((request) => this.run(binding, request, command, target));
    if (result.kind === 'ack') return result.value;
    return invalid(result.transient ? 'store_unavailable' : 'store_incompatible');
  }

  /** Identify the physical replica set, not just a seed address or user-chosen set name. */
  async verifyTopology(op: ManagedAttachmentOperation, binding: MongoAttachmentConnection): Promise<string> {
    const hello = await this.catalog(op, binding, { hello: 1 }, 'admin');
    const { setName } = hello;
    if (
      typeof setName !== 'string' ||
      !setName ||
      hello.msg === 'isdbgrid' ||
      hello.serviceId !== undefined ||
      hello.readOnly !== false ||
      !Number.isInteger(hello.logicalSessionTimeoutMinutes)
    )
      invalid('store_incompatible');
    if (
      hello.isWritablePrimary !== true ||
      hello.secondary !== false ||
      typeof hello.me !== 'string' ||
      hello.me !== hello.primary
    )
      invalid('store_unavailable');

    const status = await this.catalog(op, binding, { serverStatus: 1, none: 1, storageEngine: 1, repl: 1 }, 'admin');
    const engine = doc(status.storageEngine, 'store_incompatible');
    const repl = doc(status.repl, 'store_incompatible');
    if (
      typeof status.version !== 'string' ||
      !/^8\.\d+\.\d+$/.test(status.version) ||
      engine.name !== 'wiredTiger' ||
      engine.persistent !== true ||
      engine.supportsCommittedReads !== true ||
      engine.readOnly !== false ||
      repl.setName !== setName ||
      (repl.userWriteBlockMode !== undefined && repl.userWriteBlockMode !== 1)
    )
      invalid('store_incompatible');
    if (repl.isWritablePrimary !== true) invalid('store_unavailable');

    const { config } = await this.catalog(op, binding, { replSetGetConfig: 1 }, 'admin');
    const policy = doc(config, 'store_incompatible');
    const { replicaSetId } = doc(policy.settings, 'store_incompatible');
    if (
      policy._id !== setName ||
      policy.configsvr === true ||
      policy.writeConcernMajorityJournalDefault !== true ||
      !(replicaSetId instanceof this.driver.ObjectId)
    )
      invalid('store_incompatible');
    // Shard replica-set URIs are not supported either, even if contacted without mongos.
    const { parsed } = await this.catalog(op, binding, { getCmdLineOpts: 1 }, 'admin');
    if (doc(parsed, 'store_incompatible').sharding !== undefined) invalid('store_incompatible');
    return replicaSetId.toHexString();
  }
}
