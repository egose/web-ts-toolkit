import { Schema } from './schema';
import { Document, validateDoc } from './document';
import { Query } from './query';
import { RxCollectionAdapter, type BulkInsertOptions, type RxLikeCollection } from './rx-adapter';
import type {
  DeleteManyOptions,
  DeleteOneOptions,
  FilterQuery,
  FindOneAndDeleteOptions,
  FindOneAndUpdateOptions,
  HydratedDocument,
  InsertManyOptions,
  LeanResult,
  ModelMethods,
  ModelStatics,
  ModelVirtuals,
  QueryOptions,
  DeleteResult,
  UpdateResult,
  UpdateManyOptions,
  UpdateOneOptions,
  UpdateQuery,
} from './types';
import type { RxDatabase } from './rx-types';
import { convertToRxJsonSchema, documentToStorage, storageToDocument } from './converter';
import { MiddlewareEngine } from './middleware';

/**
 * Constructor and static API returned by `Connection#model()`.
 *
 * `Model<T>` methods return hydrated documents by default and lean records after
 * `.lean(true)`. The public `collection` property is nullable until collection
 * initialization finishes; prefer model/query methods instead of touching it.
 */
export interface ModelBase<
  T extends object = Record<string, unknown>,
  TMethods extends ModelMethods = {},
  TStatics extends ModelStatics = {},
  TVirtuals extends ModelVirtuals = {},
> {
  new (doc?: Partial<T>): HydratedDocument<T, TMethods, TVirtuals>;
  schema: Schema<T, TMethods, TStatics, TVirtuals>;
  collection: RxLikeCollection | null;
  modelName: string;
  collectionName: string;
  connection: Connection;
  mw: MiddlewareEngine;
  find(
    filter?: FilterQuery<T>,
  ): Query<HydratedDocument<T, TMethods, TVirtuals>[], T, Schema<T, TMethods, TStatics, TVirtuals>>;
  findOne(
    filter?: FilterQuery<T>,
  ): Query<HydratedDocument<T, TMethods, TVirtuals> | null, T, Schema<T, TMethods, TStatics, TVirtuals>>;
  countDocuments(filter?: FilterQuery<T>): Query<number, T, Schema<T, TMethods, TStatics, TVirtuals>>;
  findById(id: string): Promise<HydratedDocument<T, TMethods, TVirtuals> | null>;
  create(doc: Partial<T>): Promise<HydratedDocument<T, TMethods, TVirtuals>>;
  create(docs: Partial<T>[]): Promise<HydratedDocument<T, TMethods, TVirtuals>[]>;
  insertMany(docs: Partial<T>[], options?: InsertManyOptions): Promise<HydratedDocument<T, TMethods, TVirtuals>[]>;
  updateOne(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    options?: UpdateOneOptions,
  ): Query<UpdateResult, T, Schema<T, TMethods, TStatics, TVirtuals>>;
  updateMany(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    options?: UpdateManyOptions,
  ): Query<UpdateResult, T, Schema<T, TMethods, TStatics, TVirtuals>>;
  deleteOne(
    filter: FilterQuery<T>,
    options?: DeleteOneOptions,
  ): Query<DeleteResult, T, Schema<T, TMethods, TStatics, TVirtuals>>;
  deleteMany(
    filter: FilterQuery<T>,
    options?: DeleteManyOptions,
  ): Query<DeleteResult, T, Schema<T, TMethods, TStatics, TVirtuals>>;
  findOneAndUpdate(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    options?: FindOneAndUpdateOptions & { lean?: false },
  ): Query<HydratedDocument<T, TMethods, TVirtuals> | null, T, Schema<T, TMethods, TStatics, TVirtuals>>;
  findOneAndUpdate(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    options: FindOneAndUpdateOptions & { lean: true },
  ): Query<LeanResult<T> | null, T, Schema<T, TMethods, TStatics, TVirtuals>>;
  findOneAndDelete(
    filter: FilterQuery<T>,
    options?: FindOneAndDeleteOptions & { lean?: false },
  ): Query<HydratedDocument<T, TMethods, TVirtuals> | null, T, Schema<T, TMethods, TStatics, TVirtuals>>;
  findOneAndDelete(
    filter: FilterQuery<T>,
    options: FindOneAndDeleteOptions & { lean: true },
  ): Query<LeanResult<T> | null, T, Schema<T, TMethods, TStatics, TVirtuals>>;
}

/** Compiled model type, including schema statics declared through `Schema#static()`. */
export type Model<
  T extends object = Record<string, unknown>,
  TMethods extends ModelMethods = {},
  TStatics extends ModelStatics = {},
  TVirtuals extends ModelVirtuals = {},
> = ModelBase<T, TMethods, TStatics, TVirtuals> & TStatics;

type SchemaRaw<TSchema> = TSchema extends Schema<infer T, any, any, any> ? T : never;
type SchemaMethods<TSchema> = TSchema extends Schema<any, infer TMethods, any, any> ? TMethods : never;
type SchemaStatics<TSchema> = TSchema extends Schema<any, any, infer TStatics, any> ? TStatics : never;
type SchemaVirtuals<TSchema> = TSchema extends Schema<any, any, any, infer TVirtuals> ? TVirtuals : never;
type ModelFromSchema<TSchema extends Schema<any, any, any, any>> = Model<
  SchemaRaw<TSchema>,
  SchemaMethods<TSchema>,
  SchemaStatics<TSchema>,
  SchemaVirtuals<TSchema>
>;

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'closing' | 'failed';

interface CollectionRegistryEntry {
  normalizedName: string;
  fingerprint: string;
  generation: number;
  adapter: RxLikeCollection | null;
  promise: Promise<RxLikeCollection>;
  reject: (reason?: unknown) => void;
  db: RxDatabase;
  initialize: Promise<RxLikeCollection>;
  settled: Promise<void>;
}

export type InternalModelRuntime<T extends object = Record<string, unknown>> = Model<T> & {
  collectionKey?: string;
  schemaFingerprint?: string;
  resolveCollection?: () => Promise<RxLikeCollection>;
  __abortPromise?: Promise<never>;
  __abort?: (reason?: unknown) => void;
};

function createModelAbort(): { promise: Promise<never>; abort: (reason?: unknown) => void } {
  let abort!: (reason?: unknown) => void;
  const promise = new Promise<never>((_, reject) => {
    abort = reject;
  });
  promise.catch(() => undefined);
  return { promise, abort };
}

/**
 * Owns one RxDB database connection and the models compiled against it.
 *
 * Pass an async RxDB factory to `connect()`. Connection strings are unsupported,
 * collection initialization is single-flight per normalized collection name, and
 * model objects are invalidated after disconnect, delete, overwrite, or reconnect.
 */
export class Connection {
  public db: RxDatabase | null = null;
  public models: Map<string, Model<any>> = new Map();
  public storageFactory: (() => Promise<any>) | null = null;
  public state: ConnectionState = 'disconnected';

  private connectPromise: Promise<void> | null = null;
  private disconnectPromise: Promise<void> | null = null;
  private generation = 0;
  private collectionRegistry: Map<string, CollectionRegistryEntry> = new Map();

  constructor(storageFactory?: () => Promise<any>) {
    if (storageFactory) this.storageFactory = storageFactory;
  }

  async connect(factoryOrUrl?: () => Promise<any>): Promise<void> {
    if (typeof factoryOrUrl === 'string') {
      throw new Error('Connection strings are not supported. Pass an async RxDB factory to Connection#connect().');
    }
    // Gate queued connects behind an in-progress close and reestablish
    // single-flight ownership after the wait, so concurrent waiters join
    // one factory instead of each invoking it.
    for (;;) {
      if (this.state === 'connected') {
        throw new Error('Connection is already connected. Call disconnect() before connecting again.');
      }
      if (this.state === 'connecting' && this.connectPromise) return this.connectPromise;
      if (this.state === 'closing' && this.disconnectPromise) {
        // Await the close without swallowing its cause: a failed close
        // retains the database (see disconnect()), so queued connects must
        // reject with that cause instead of opening a second database.
        await this.disconnectPromise;
        continue;
      }
      break;
    }

    const factory = factoryOrUrl ?? this.storageFactory;
    const generation = ++this.generation;
    this.state = 'connecting';
    let attempt: Promise<void> | null = null;
    attempt = (async () => {
      try {
        const storageModule = factory ? null : await import('./storage/index');
        const db = factory ? await factory() : await storageModule!.createMemoryDatabase();
        if (this.generation !== generation || this.state !== 'connecting') {
          await closeDatabase(db as RxDatabase).catch(() => undefined);
          throw new Error('Connection was closed while opening.');
        }
        this.db = db as RxDatabase;
        this.storageFactory = factory;
        this.collectionRegistry.clear();
        this.state = 'connected';
      } catch (error) {
        if (this.generation === generation) {
          this.db = null;
          this.collectionRegistry.clear();
          this.state = 'failed';
        }
        throw error;
      } finally {
        // Only the owning attempt clears bookkeeping; a stale (superseded)
        // factory completion must not clear a newer attempt's promise.
        if (attempt !== null && this.connectPromise === attempt) this.connectPromise = null;
      }
    })();
    this.connectPromise = attempt;
    this.connectPromise.catch(() => undefined);
    return this.connectPromise;
  }

  setStorage(storageFactory: () => Promise<any>): this {
    this.storageFactory = storageFactory;
    return this;
  }

  ready(): RxDatabase {
    if (this.state !== 'connected' || !this.db) throw new Error('Connection not established. Call connect() first.');
    return this.db;
  }

  async disconnect(): Promise<void> {
    if (this.state === 'disconnected') return;
    if (this.state === 'closing' && this.disconnectPromise) return this.disconnectPromise;

    const error = new Error('Connection closed before collection initialization completed.');
    const previousDb = this.db;
    const capturedConnect = this.connectPromise;
    // BMRX-18: retain resource ownership until initialization settles.
    // Capture per-entry drain promises before invalidating so disconnect
    // can reject pending callers promptly (via abort) while still waiting
    // for the underlying addCollections to settle and closing any
    // late-created collections before closing the database.
    const pendingDrains = Array.from(this.collectionRegistry.values()).map((entry) => entry.settled);
    this.state = 'closing';
    this.generation += 1;
    this.invalidateCollections(error);
    this.invalidateModels(error);
    this.models.clear();

    // Failed close is recoverable, not successfully disconnected: the
    // database reference is retained and state returns to `connected`
    // (when a database remains) so a retry can close it. Only the owning
    // attempt clears `disconnectPromise`, letting waiters keep their
    // rejection while new calls retry.
    //
    // BMRX-18 resource-completion meaning: the returned promise settles
    // only after every captured initialization has settled (including
    // closing late-created collections) and the database close has
    // settled. Callers are rejected promptly via the registry abort;
    // this drain retains ownership until native resources are closed.
    let attempt: Promise<void> | null = null;
    attempt = (async () => {
      try {
        await capturedConnect?.catch(() => undefined);
        await Promise.allSettled(pendingDrains);
        const db = previousDb ?? this.db;
        if (db) {
          try {
            await closeDatabase(db);
          } catch (closeError) {
            // Retain ownership of the possibly still-open database instead
            // of abandoning it with `db = null`.
            if (this.db == null) this.db = db;
            this.state = 'connected';
            throw closeError;
          }
        }
        this.db = null;
        this.state = 'disconnected';
      } finally {
        if (attempt !== null && this.disconnectPromise === attempt) this.disconnectPromise = null;
      }
    })();
    this.disconnectPromise = attempt;
    this.disconnectPromise.catch(() => undefined);
    return this.disconnectPromise;
  }

  model<TSchema extends Schema<any, any, any, any>>(
    name: string,
    schema: TSchema,
    collectionName?: string,
    options?: { overwrite?: boolean },
  ): ModelFromSchema<TSchema>;
  model<
    T extends object = Record<string, unknown>,
    TMethods extends ModelMethods = {},
    TStatics extends ModelStatics = {},
    TVirtuals extends ModelVirtuals = {},
  >(
    name: string,
    schema?: Schema<T, TMethods, TStatics, TVirtuals>,
    collectionName?: string,
    options: { overwrite?: boolean } = {},
  ): Model<T, TMethods, TStatics, TVirtuals> {
    const existing = this.models.get(name);
    if (existing && !schema) return existing as Model<T, TMethods, TStatics, TVirtuals>;
    if (existing && schema && !options.overwrite) {
      throw new Error(
        `A model with name "${name}" is already compiled. Call connection.deleteModel("${name}") first, ` +
          `or pass { overwrite: true } to Connection#model to recompile.`,
      );
    }
    if (existing && schema && options.overwrite) {
      invalidateModel(existing, new Error(`Model "${name}" was overwritten and must not be used.`));
      this.models.delete(name);
    }
    if (!schema) throw new Error(`Schema is required to compile model "${name}"`);
    const built = buildModel(this, name, schema, collectionName ?? schema.options.collection ?? name);
    this.models.set(name, built as unknown as Model<any>);
    return built;
  }

  modelNames(): string[] {
    return Array.from(this.models.keys());
  }

  deleteModel(name: string): this {
    const existing = this.models.get(name);
    if (existing) invalidateModel(existing, new Error(`Model "${name}" was deleted and must not be used.`));
    this.models.delete(name);
    return this;
  }

  resolveModelCollection(model: Model): Promise<RxLikeCollection> {
    const internal = model as InternalModelRuntime;
    if (this.state !== 'connected' || !this.db) {
      throw new Error(`Model "${model.modelName}" is not attached to an active connection.`);
    }
    if (this.models.get(model.modelName) !== model) {
      throw new Error(`Model "${model.modelName}" is no longer registered. Recompile it after reconnect or overwrite.`);
    }
    const entry = internal.collectionKey ? this.collectionRegistry.get(internal.collectionKey) : undefined;
    if (!entry) throw new Error(`Collection "${model.collectionName}" is no longer registered.`);
    if (entry.fingerprint !== internal.schemaFingerprint) {
      throw new Error(`Model "${model.modelName}" no longer matches collection "${model.collectionName}".`);
    }
    if (entry.adapter) return Promise.resolve(entry.adapter);
    // BMRX-18: guard delivery against late invalidation. A model deleted,
    // overwritten, or disconnected while its collection is still pending
    // must not receive a stale adapter even if the shared entry later
    // succeeds for a valid replacement. The per-model abort rejects
    // promptly; the delivery check keeps a slow winner from publishing.
    const pending = entry.promise.then((adapter) => {
      if (this.models.get(model.modelName) !== model) {
        throw new Error(
          `Model "${model.modelName}" is no longer registered. Recompile it after reconnect or overwrite.`,
        );
      }
      const current =
        internal.collectionKey !== undefined ? this.collectionRegistry.get(internal.collectionKey) : undefined;
      if (current !== entry || entry.fingerprint !== internal.schemaFingerprint) {
        throw new Error(
          `Model "${model.modelName}" is no longer registered. Recompile it after reconnect or overwrite.`,
        );
      }
      return adapter;
    });
    const abort = internal.__abortPromise;
    return abort !== undefined ? Promise.race([pending, abort as Promise<never>]) : pending;
  }

  ensureCollection(name: string, rxSchema: any): CollectionRegistryEntry {
    const db = this.ready();
    const normalizedName = normalizeCollectionName(name);
    const fingerprint = stableStringify(rxSchema);
    const existing = this.collectionRegistry.get(normalizedName);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error(
          `Cannot compile collection "${name}" because normalized collection "${normalizedName}" already uses ` +
            `an incompatible schema. Use a different collection name; model overwrite does not migrate RxDB schemas.`,
        );
      }
      return existing;
    }

    // BMRX-19: verify against a factory-precreated native collection before
    // publishing readiness. The registry fingerprint above only covers models
    // compiled through this connection; a supplied database may already own
    // the normalized name with an incompatible domain shape.
    const precreated = (db as any).collections?.[normalizedName];
    const precreatedJson = readExistingCollectionJsonSchema(precreated);
    if (precreatedJson !== null) {
      assertCompatibleWithExistingCollection(normalizedName, rxSchema, precreatedJson);
    }

    let reject!: (reason?: unknown) => void;
    const aborted = new Promise<never>((_, rej) => {
      reject = rej;
    });
    aborted.catch(() => undefined);
    const generation = this.generation;
    const entry: CollectionRegistryEntry = {
      normalizedName,
      fingerprint,
      generation,
      adapter: null,
      promise: Promise.resolve(null as never),
      reject,
      db,
      initialize: Promise.resolve(null as never),
      settled: Promise.resolve(),
    };

    // BMRX-18: track whether this attempt created the native collection so
    // a late success after connection-level invalidation can close exactly
    // the orphan it created. Shared/existing collections stay owned by the
    // database close; per-model delete/overwrite never closes here.
    let nativeCollection: any = null;
    let didCreate = false;
    const initialize = (async () => {
      const existed = normalizedName in db.collections;
      if (!existed) {
        await db.addCollections({ [normalizedName]: { schema: rxSchema, options: {} } });
        didCreate = true;
      }
      const rxCollection = db.collections[normalizedName];
      if (!rxCollection) throw new Error(`RxDB did not create collection "${normalizedName}".`);
      // BMRX-19: re-verify inside the async boundary in case the native
      // collection appeared concurrently after the synchronous check above.
      // Comparison is against the actual canonical schema, never a cast.
      const actualJson = readExistingCollectionJsonSchema(rxCollection);
      if (actualJson !== null) {
        assertCompatibleWithExistingCollection(normalizedName, rxSchema, actualJson);
      }
      nativeCollection = rxCollection;
      return new RxCollectionAdapter(rxCollection);
    })();
    initialize.catch(() => undefined);
    entry.initialize = initialize;

    // Late-orphan drain: when the underlying initialization settles after
    // the registry entry is no longer current (disconnect/generation bump
    // or entry replacement), close the collection this attempt created.
    // Model-level delete/overwrite keeps the entry current, so shared
    // collections are not closed here; per-model publication is guarded
    // separately in resolveModelCollection/buildModel.
    const lateCleanup = initialize.then(
      async () => {
        const current = this.collectionRegistry.get(normalizedName);
        const valid =
          current === entry && this.generation === generation && this.state === 'connected' && this.db === db;
        if (!valid && didCreate && nativeCollection != null) {
          try {
            await nativeCollection.close?.();
          } catch {
            // Best-effort orphan cleanup; initialization outcome is
            // reported through entry.promise, not this drain.
          }
        }
      },
      () => undefined,
    );
    entry.settled = lateCleanup;

    entry.promise = Promise.race([initialize, aborted]).then(
      (adapter) => {
        if (
          this.generation !== generation ||
          this.state !== 'connected' ||
          this.db !== db ||
          this.collectionRegistry.get(normalizedName) !== entry
        ) {
          throw new Error(`Collection "${name}" initialization was interrupted by connection close.`);
        }
        entry.adapter = adapter;
        return adapter;
      },
      (error) => {
        if (this.collectionRegistry.get(normalizedName) === entry) this.collectionRegistry.delete(normalizedName);
        throw error;
      },
    );
    entry.promise.catch(() => undefined);
    this.collectionRegistry.set(normalizedName, entry);
    return entry;
  }

  private invalidateCollections(error: Error): void {
    for (const entry of this.collectionRegistry.values()) {
      entry.adapter = null;
      entry.reject(error);
    }
    this.collectionRegistry.clear();
  }

  private invalidateModels(error: Error): void {
    for (const model of this.models.values()) invalidateModel(model, error);
  }
}

export const defaultConnection = new Connection();

export function buildModel<
  T extends object = Record<string, unknown>,
  TMethods extends ModelMethods = {},
  TStatics extends ModelStatics = {},
  TVirtuals extends ModelVirtuals = {},
>(
  connection: Connection,
  modelName: string,
  schema: Schema<T, TMethods, TStatics, TVirtuals>,
  collectionName: string,
): Model<T, TMethods, TStatics, TVirtuals> {
  const modelSchema = schema.compileForModel();
  const rxSchema = convertToRxJsonSchema(collectionName, modelSchema);
  const mw = new MiddlewareEngine(modelSchema);
  const collectionEntry = connection.ensureCollection(collectionName, rxSchema);

  const boundModel: any = function ModelCtor(this: any, doc?: Partial<T>) {
    return new Document<T>(doc ?? ({} as Partial<T>), modelSchema, boundModel, { isNew: true });
  };

  boundModel.schema = modelSchema;
  boundModel.collection = null;
  boundModel.collectionName = collectionName;
  boundModel.connection = connection;
  boundModel.modelName = modelName;
  boundModel.mw = mw;
  boundModel.collectionKey = collectionEntry.normalizedName;
  boundModel.schemaFingerprint = collectionEntry.fingerprint;
  boundModel.resolveCollection = () => connection.resolveModelCollection(boundModel);

  boundModel.find = (filter?: FilterQuery<T>) =>
    makeQuery<HydratedDocument<T, TMethods, TVirtuals>[], T, typeof modelSchema>(
      'find',
      boundModel,
      modelSchema,
      boundModel.collection,
      filter,
    );
  boundModel.findOne = (filter?: FilterQuery<T>) =>
    makeQuery<HydratedDocument<T, TMethods, TVirtuals> | null, T, typeof modelSchema>(
      'findOne',
      boundModel,
      modelSchema,
      boundModel.collection,
      filter,
      {},
      'findOne',
    );
  boundModel.countDocuments = (filter?: FilterQuery<T>) =>
    makeQuery<number, T, typeof modelSchema>(
      'count',
      boundModel,
      modelSchema,
      boundModel.collection,
      filter,
      {},
      'count',
    );
  boundModel.findById = async (id: string) => {
    const coll = await boundModel.resolveCollection();
    const doc = await coll.findOne({ selector: { _id: { $eq: id } }, limit: 1 });
    if (!doc) return null;
    const hydrated = new Document<T>(
      storageToDocument(doc, modelSchema) as unknown as Partial<T>,
      modelSchema,
      boundModel,
      { isNew: false, id: doc._id, applyDefaults: false },
    );
    return mw.exec('init', hydrated, async () => hydrated);
  };
  boundModel.create = async (docs: any) => {
    const many = Array.isArray(docs);
    const out = await insertDocuments<T>(modelSchema, boundModel, many ? docs : [docs], {
      runSaveMiddleware: true,
      ordered: true,
    });
    return many ? out : out[0];
  };
  boundModel.insertMany = async (docs: Partial<T>[], options?: InsertManyOptions) =>
    insertDocuments<T>(modelSchema, boundModel, docs, {
      runInsertManyMiddleware: true,
      ordered: options?.ordered !== false,
    });
  boundModel.updateOne = (filter: FilterQuery<T>, update: UpdateQuery<T>, options?: UpdateOneOptions) =>
    makeQuery<UpdateResult, T, typeof modelSchema>(
      'updateOne',
      boundModel,
      modelSchema,
      boundModel.collection,
      filter,
      options,
      'updateOne',
      update,
    );
  boundModel.updateMany = (filter: FilterQuery<T>, update: UpdateQuery<T>, options?: UpdateManyOptions) =>
    makeQuery<UpdateResult, T, typeof modelSchema>(
      'updateMany',
      boundModel,
      modelSchema,
      boundModel.collection,
      filter,
      options,
      'updateMany',
      update,
    );
  boundModel.deleteOne = (filter: FilterQuery<T>, options?: DeleteOneOptions) =>
    makeQuery<DeleteResult, T, typeof modelSchema>(
      'deleteOne',
      boundModel,
      modelSchema,
      boundModel.collection,
      filter,
      options,
      'deleteOne',
    );
  boundModel.deleteMany = (filter: FilterQuery<T>, options?: DeleteManyOptions) =>
    makeQuery<DeleteResult, T, typeof modelSchema>(
      'deleteMany',
      boundModel,
      modelSchema,
      boundModel.collection,
      filter,
      options,
      'deleteMany',
    );
  boundModel.findOneAndUpdate = (filter: FilterQuery<T>, update: UpdateQuery<T>, options?: FindOneAndUpdateOptions) =>
    makeQuery<HydratedDocument<T, TMethods, TVirtuals> | null, T, typeof modelSchema>(
      'findOneAndUpdate',
      boundModel,
      modelSchema,
      boundModel.collection,
      filter,
      options,
      'findOneAndUpdate',
      update,
    );
  boundModel.findOneAndDelete = (filter: FilterQuery<T>, options?: FindOneAndDeleteOptions) =>
    makeQuery<HydratedDocument<T, TMethods, TVirtuals> | null, T, typeof modelSchema>(
      'findOneAndDelete',
      boundModel,
      modelSchema,
      boundModel.collection,
      filter,
      options,
      'findOneAndDelete',
    );

  for (const [sName, sFn] of Object.entries(modelSchema.statics)) {
    boundModel[sName] = sFn;
  }

  // BMRX-18: per-model publication guard. Late entry success must not
  // restore an adapter onto a deleted/overwritten/disconnected model.
  // The abort rejects promptly on invalidation; the registration check
  // keeps a slow shared-entry winner from publishing to a stale model
  // while a valid replacement still initializes from the same entry.
  const modelAbort = createModelAbort();
  boundModel.__abortPromise = modelAbort.promise;
  boundModel.__abort = modelAbort.abort;
  const readiness = Promise.race([collectionEntry.promise, modelAbort.promise]).then(
    (adapter: RxLikeCollection) => {
      if (
        connection.models.get(modelName) !== boundModel ||
        (connection as unknown as { collectionRegistry: Map<string, CollectionRegistryEntry> }).collectionRegistry.get(
          collectionEntry.normalizedName,
        ) !== collectionEntry
      ) {
        boundModel.collection = null;
        throw new Error(`Model "${modelName}" is no longer registered. Recompile it after reconnect or overwrite.`);
      }
      boundModel.collection = adapter;
      return adapter;
    },
    (error: unknown) => {
      boundModel.collection = null;
      if (connection.models.get(modelName) === boundModel) connection.models.delete(modelName);
      throw error;
    },
  );
  readiness.catch(() => undefined);

  return boundModel as unknown as Model<T, TMethods, TStatics, TVirtuals>;
}

function makeQuery<Result, T extends object, TSchema extends Schema<T, any, any, any>>(
  op: string,
  model: any,
  schema: TSchema,
  collection: RxLikeCollection | null,
  filter?: FilterQuery<T>,
  options?: QueryOptions,
  setOp?: string,
  update?: UpdateQuery<T>,
): Query<Result, T, TSchema> {
  const q = new Query<Result, T, TSchema>(model, schema, collection);
  q.setOperationDescriptor({ op: (setOp ?? op) as any, filter, options, update });
  return q;
}

async function insertDocuments<T extends object>(
  schema: Schema<T, any, any, any>,
  model: InternalModelRuntime<T>,
  docs: Partial<T>[],
  options: BulkInsertOptions & { runSaveMiddleware?: boolean; runInsertManyMiddleware?: boolean },
): Promise<Document<T>[]> {
  const run = async () => {
    if (options.runSaveMiddleware) {
      const out: Document<T>[] = [];
      for (const input of docs) {
        const inst = new Document<T>(input, schema, model, { isNew: true });
        await inst.save();
        out.push(inst);
      }
      return out;
    }

    const instances = docs.map((input) => new Document<T>(input, schema, model, { isNew: true }));
    for (const instance of instances) await validateDoc(instance);
    const records = instances.map((instance) =>
      documentToStorage(instance.toObject(), schema, { applyDefaults: true, allowId: true }),
    );
    const collection = await model.resolveCollection!();
    const result = await collection.insertMany(records, { ordered: options.ordered });
    for (let index = 0; index < result.records.length; index++) {
      instances[index].isNew = false;
      (instances[index] as Document<T>).clearModified();
    }
    return result.records.map(
      (record) =>
        new Document<T>(storageToDocument(record, schema) as unknown as Partial<T>, schema, model, {
          isNew: false,
          id: record._id,
          applyDefaults: false,
        }),
    );
  };

  if (!options.runInsertManyMiddleware) return run();
  return model.mw.exec('insertMany', model, run, { preArgs: [docs] });
}

export function model<TSchema extends Schema<any, any, any, any>>(
  name: string,
  schema: TSchema,
  collection?: string,
): ModelFromSchema<TSchema>;
export function model<
  T extends object = Record<string, unknown>,
  TMethods extends ModelMethods = {},
  TStatics extends ModelStatics = {},
  TVirtuals extends ModelVirtuals = {},
>(
  name: string,
  schema?: Schema<T, TMethods, TStatics, TVirtuals>,
  collection?: string,
): Model<T, TMethods, TStatics, TVirtuals> {
  return defaultConnection.model(name, schema as any, collection) as unknown as Model<T, TMethods, TStatics, TVirtuals>;
}

export function connect(factoryOrUrl?: () => Promise<any>): Promise<void> {
  return defaultConnection.connect(factoryOrUrl);
}

export function disconnect(): Promise<void> {
  return defaultConnection.disconnect();
}

function normalizeCollectionName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (!normalized) throw new Error('Collection name must be a non-empty string.');
  return normalized;
}

function invalidateModel(model: Model, error: Error): void {
  const internal = model as InternalModelRuntime;
  internal.collection = null;
  internal.resolveCollection = () => Promise.reject(error);
  // BMRX-18: reject pending per-model readiness/resolve races promptly so
  // a deleted/overwritten/disconnected model never receives a late adapter.
  try {
    internal.__abort?.(error);
  } catch {
    // Abort is best-effort; registration checks still guard delivery.
  }
}

async function closeDatabase(db: RxDatabase): Promise<void> {
  if (typeof db.close === 'function') await db.close();
  else await db.destroy();
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortStable(value));
}

/**
 * BMRX-19 factory-precreated collection verification.
 *
 * Reads the actual canonical schema of an already-existing native collection
 * (`collection.schema.jsonSchema` on real RxDB storage) without asserting
 * compatibility by cast. Returns `null` when no canonical schema is
 * accessible (for example lightweight fake databases used by harness tests),
 * in which case only the registry fingerprint applies.
 */
function readExistingCollectionJsonSchema(collection: unknown): any | null {
  if (collection === null || typeof collection !== 'object') return null;
  const schema = (collection as { schema?: unknown }).schema;
  if (schema === null || typeof schema !== 'object') return null;
  const jsonSchema = (schema as { jsonSchema?: unknown }).jsonSchema ?? schema;
  if (jsonSchema === null || typeof jsonSchema !== 'object' || Array.isArray(jsonSchema)) return null;
  return jsonSchema;
}

const RXDB_INTERNAL_COLLECTION_PROPS = new Set(['_rev', '_meta', '_attachments', '_deleted']);
const RXDB_INTERNAL_REQUIRED = new Set(['_rev', '_meta', '_attachments', '_deleted', '_id']);

/**
 * BMRX-19 domain-shape comparison.
 *
 * Compares the requested RxDB JSON schema against the actual canonical schema
 * of a factory-precreated collection before adapter publication. RxDB-normalized
 * metadata (internal `_rev`/`_meta`/`_attachments`/`_deleted` properties and
 * requirements, indexes, `title`/`version`/compression flags) is ignored;
 * domain incompatibilities in primary key, property set/shapes (including
 * nested fields), and required sets reject. No migration is attempted.
 */
function assertCompatibleWithExistingCollection(normalizedName: string, requested: any, actual: any): void {
  const fail = (detail: string): never => {
    throw new Error(
      `Cannot use existing collection "${normalizedName}" because its schema is incompatible with the requested model ` +
        `(${detail}). Use a different collection name; model overwrite does not migrate RxDB schemas.`,
    );
  };
  if (requested === null || typeof requested !== 'object') fail('requested schema is not an object');
  const requestedPrimary = (requested as { primaryKey?: unknown }).primaryKey;
  const actualPrimary = (actual as { primaryKey?: unknown }).primaryKey;
  if (stableStringify(requestedPrimary) !== stableStringify(actualPrimary)) {
    fail(`primary key ${JSON.stringify(actualPrimary)} does not match requested ${JSON.stringify(requestedPrimary)}`);
  }
  const requestedType = (requested as { type?: unknown }).type;
  const actualType = (actual as { type?: unknown }).type;
  if (requestedType !== undefined && actualType !== undefined && requestedType !== actualType) {
    fail(`type ${JSON.stringify(actualType)} does not match requested ${JSON.stringify(requestedType)}`);
  }
  const requestedProps =
    (requested as { properties?: Record<string, unknown> }).properties ?? ({} as Record<string, unknown>);
  const actualProps =
    (actual as { properties?: Record<string, unknown> }).properties ?? ({} as Record<string, unknown>);
  const requestedKeys = Object.keys(requestedProps).sort();
  const actualDomainKeys = Object.keys(actualProps)
    .filter((key) => !RXDB_INTERNAL_COLLECTION_PROPS.has(key))
    .sort();
  const missing = requestedKeys.filter((key) => !actualDomainKeys.includes(key));
  const extra = actualDomainKeys.filter((key) => !requestedKeys.includes(key));
  if (missing.length > 0 || extra.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`missing properties ${missing.join(', ')}`);
    if (extra.length > 0) parts.push(`unexpected properties ${extra.join(', ')}`);
    fail(parts.join('; '));
  }
  for (const key of requestedKeys) {
    if (stableStringify(requestedProps[key]) !== stableStringify(actualProps[key])) {
      fail(`property "${key}" shape differs from the existing collection schema`);
    }
  }
  const requestedRequired = ((requested as { required?: unknown }).required ?? []) as unknown[];
  const actualRequired = ((actual as { required?: unknown }).required ?? []) as unknown[];
  const requestedDomainRequired = requestedRequired
    .filter((key): key is string => typeof key === 'string' && !RXDB_INTERNAL_REQUIRED.has(key))
    .sort();
  const actualDomainRequired = actualRequired
    .filter((key): key is string => typeof key === 'string' && !RXDB_INTERNAL_REQUIRED.has(key))
    .sort();
  if (stableStringify(requestedDomainRequired) !== stableStringify(actualDomainRequired)) {
    fail(
      `required set [${actualDomainRequired.join(', ')}] does not match requested [${requestedDomainRequired.join(', ')}]`,
    );
  }
}

function sortStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortStable);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) out[key] = sortStable((value as Record<string, unknown>)[key]);
  return out;
}
