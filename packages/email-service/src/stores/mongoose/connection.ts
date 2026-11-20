import { performance } from 'node:perf_hooks';
import { types } from 'node:util';
import type { Connection, mongo } from 'mongoose';
import { CLOCK_MARGIN_MS, WORKER_LIMIT_BOUNDS } from '../../constants';
import type { OperationBudget } from '../../internal/budget';
import { invalid, unixMs } from '../../internal/validation';

export type BsonDocument = Record<string, unknown>;
export type Names = Readonly<{
  jobsCollection: string;
  activitiesCollection: string;
  jobsModelName: string;
  activitiesModelName: string;
}>;

export const SIMPLE = Object.freeze({ locale: 'simple' });
const MAX_SERVER_MS = WORKER_LIMIT_BOUNDS.storeTimeoutMs.max;
// A journaled write waiting for a majority must also have a bounded replication wait.
function durable(maxTimeMS: number) {
  return { w: 'majority', j: true, wtimeout: maxTimeMS };
}

export function doc(
  value: unknown,
  code: 'store_incompatible' | 'store_unavailable' | 'write_unconfirmed',
): BsonDocument {
  if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Object.prototype) invalid(code);
  return value as BsonDocument;
}

export function batch(reply: BsonDocument, max: number, expectedNamespace?: string): object[] {
  const { cursor } = reply;
  const { firstBatch, id, ns } = doc(cursor, 'store_incompatible');
  // Single-batch data reads never leave a live cursor. Readiness uses bounded metadata batches.
  if (
    id !== 0 ||
    (expectedNamespace !== undefined && ns !== expectedNamespace) ||
    !Array.isArray(firstBatch) ||
    firstBatch.length > max
  )
    invalid('store_incompatible');
  return firstBatch.map((row: unknown) => doc(row, 'store_incompatible'));
}

/** Only command errors with an explicit allowlisted code may bypass the maybe-dispatched path. */
function serverCode(error: unknown): number | undefined {
  if (error instanceof Error && error.name === 'MongoServerError' && 'code' in error && typeof error.code === 'number')
    return error.code;
}

export function checkConnectionType(connection: Connection): void {
  // Use the caller's Mongoose instance; no import/register against a global singleton.
  if (
    !connection ||
    typeof connection !== 'object' ||
    types.isProxy(connection) ||
    typeof connection.base?.Connection !== 'function' ||
    !(connection instanceof connection.base.Connection) ||
    connection === connection.base.connection
  )
    invalid('invalid_config');
  const version = connection.base.version;
  if (typeof version !== 'string' || !/^9\.\d+\.\d+$/.test(version)) invalid('invalid_config');
  const [, minor = 0, patch = 0] = version.split('.').map(Number);
  if (minor < 12 || (minor === 12 && patch < 2)) {
    invalid('invalid_config');
  }
}

export type Binding = { db: mongo.Db; client: mongo.MongoClient };
type CommandOutcome = { kind: 'ack'; reply: BsonDocument } | { kind: 'definite_error'; code: number };

/** Driver 7.8 does not implement CSOT. Use real operation signals and explicit wire limits instead. */
export class MongoConnection {
  private setName?: string;
  private timeFloor = 0;

  constructor(
    private readonly connection: Connection,
    private readonly names: Names,
  ) {}

  bind(): Binding {
    const { connection, names } = this;
    if (connection.readyState !== 1 || !connection.db) invalid('store_unavailable');
    for (const model of Object.values(connection.models)) {
      if (
        model.modelName === names.jobsModelName ||
        model.modelName === names.activitiesModelName ||
        model.collection.name === names.jobsCollection ||
        model.collection.name === names.activitiesCollection
      ) {
        invalid('store_incompatible');
      }
    }
    const client = connection.getClient();
    const options = client.options;
    // Direct connections encode primaryPreferred even for explicit primary commands. Compression can defer a
    // driver socket write behind asynchronous compression. v7.8 can also retry a raw command on server
    // overload using a backoff that does not observe AbortSignal. Do not allow those dispatch paths.
    if (
      options.directConnection ||
      options.loadBalanced ||
      options.autoEncryption ||
      options.compressors.some((name) => name !== 'none') ||
      !!options.proxyHost ||
      (options.retryReads && options.retryWrites && options.maxAdaptiveRetries !== 0) ||
      options.connectTimeoutMS <= 0 ||
      !Number.isFinite(options.connectTimeoutMS)
    )
      invalid('store_incompatible');
    return { db: connection.db, client };
  }

  private ensureBound(binding: Binding, write: boolean): void {
    const c = this.connection;
    if (c.readyState !== 1 || binding.db !== c.db || binding.client !== c.getClient())
      invalid(write ? 'write_unconfirmed' : 'store_unavailable');
  }

  private async exec(
    binding: Binding,
    budget: OperationBudget,
    command: BsonDocument,
    target: 'store' | 'admin' = 'store',
    write = false,
    definite: readonly number[] = [],
  ): Promise<CommandOutcome> {
    this.ensureBound(binding, false);
    budget.check(); // A stopped budget never starts another RPC.
    const timeLeft = budget.remainingMs();
    if (timeLeft <= 0) budget.check();
    const maxTimeMS = Math.min(MAX_SERVER_MS, Math.max(1, Math.floor(timeLeft)));
    const db = target === 'admin' ? binding.client.db('admin') : binding.db;
    const wire = { ...command, maxTimeMS, ...(write ? { writeConcern: durable(maxTimeMS) } : {}) };
    let raw: unknown;
    try {
      raw = await db.command(wire, {
        signal: budget.signal,
        readPreference: 'primary',
        promoteValues: true,
        promoteLongs: true,
        useBigInt64: false,
        raw: false,
      });
    } catch (error) {
      const code = budget.signal.aborted ? undefined : serverCode(error);
      if (code !== undefined && definite.includes(code)) return { kind: 'definite_error', code };
      // Once invoked, driver errors cannot generally establish whether the write was applied.
      if (write) invalid('write_unconfirmed');
      budget.check();
      if (code === 50 || code === 262) invalid('deadline');
      return invalid(code === 72 || code === 115 || code === 148 ? 'store_incompatible' : 'store_unavailable');
    }
    try {
      budget.check();
    } catch (error) {
      if (write) invalid('write_unconfirmed');
      throw error;
    }
    this.ensureBound(binding, write);
    const failure = write ? 'write_unconfirmed' : 'store_unavailable';
    const reply = doc(raw, failure);
    if (reply.ok !== 1 || Object.hasOwn(reply, 'writeConcernError') || Object.hasOwn(reply, 'writeConcernErrors'))
      invalid(failure);
    return { kind: 'ack', reply };
  }

  async read(binding: Binding, budget: OperationBudget, command: BsonDocument, target?: 'store' | 'admin') {
    const result = await this.exec(binding, budget, command, target);
    if (result.kind !== 'ack') return invalid('store_unavailable');
    return result.reply;
  }

  async write(binding: Binding, budget: OperationBudget, command: BsonDocument, definite?: readonly number[]) {
    return this.exec(binding, budget, command, 'store', true, definite);
  }

  async hello(binding: Binding, budget: OperationBudget): Promise<{ now: number; setName: string }> {
    const started = performance.now();
    const hello = await this.read(binding, budget, { hello: 1 }, 'admin');
    if (
      typeof hello.setName !== 'string' ||
      !hello.setName ||
      hello.msg === 'isdbgrid' ||
      hello.serviceId !== undefined ||
      hello.readOnly !== false ||
      !Number.isInteger(hello.logicalSessionTimeoutMinutes) ||
      (this.setName !== undefined && hello.setName !== this.setName)
    )
      invalid('store_incompatible');
    if (hello.isWritablePrimary !== true || hello.secondary !== false || hello.me !== hello.primary)
      invalid('store_unavailable');
    if (!(hello.localTime instanceof Date) || performance.now() - started >= CLOCK_MARGIN_MS)
      invalid('store_unavailable');
    const now = unixMs(hello.localTime.getTime(), 'store_unavailable');
    return { now, setName: hello.setName };
  }

  async now(binding: Binding, budget: OperationBudget): Promise<number> {
    // Compare to samples already known before this RPC; overlapping replies may be reordered.
    const floor = this.timeFloor;
    const { now } = await this.hello(binding, budget);
    if (now < floor) invalid('store_unavailable');
    this.timeFloor = Math.max(now, this.timeFloor);
    return now;
  }

  /** Verify the selected primary, not merely the URI or initial seed. */
  async verifyTopology(binding: Binding, budget: OperationBudget): Promise<void> {
    const { setName } = await this.hello(binding, budget);
    const status = await this.read(binding, budget, { serverStatus: 1, none: 1, storageEngine: 1, repl: 1 }, 'admin');
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
    const { config } = await this.read(binding, budget, { replSetGetConfig: 1 }, 'admin');
    const policy = doc(config, 'store_incompatible');
    if (policy._id !== setName || policy.configsvr === true || policy.writeConcernMajorityJournalDefault !== true)
      invalid('store_incompatible');
    // A client connecting to the shard's replica-set URI is also unsupported, not just mongos.
    const { parsed } = await this.read(binding, budget, { getCmdLineOpts: 1 }, 'admin');
    const settings = doc(parsed, 'store_incompatible');
    if (settings.sharding !== undefined) invalid('store_incompatible');
    this.setName = setName;
  }
}

/** $expr values are fixed selectors or our validated UnixMs, never arbitrary BSON expressions. */
export function serverWindow(atOrAfter: number, before?: number): BsonDocument {
  const since = { $gte: ['$$NOW', new Date(atOrAfter)] };
  return before === undefined ? since : { $and: [since, { $lt: ['$$NOW', new Date(before)] }] };
}
