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
    options?: FindOneAndUpdateOptions,
  ): Query<HydratedDocument<T, TMethods, TVirtuals> | null, T, Schema<T, TMethods, TStatics, TVirtuals>>;
  findOneAndDelete(
    filter: FilterQuery<T>,
    options?: FindOneAndDeleteOptions,
  ): Query<HydratedDocument<T, TMethods, TVirtuals> | null, T, Schema<T, TMethods, TStatics, TVirtuals>>;
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
}

export type InternalModelRuntime<T extends object = Record<string, unknown>> = Model<T> & {
  collectionKey?: string;
  schemaFingerprint?: string;
  resolveCollection?: () => Promise<RxLikeCollection>;
};

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
    if (this.state === 'connected') {
      throw new Error('Connection is already connected. Call disconnect() before connecting again.');
    }
    if (this.state === 'connecting' && this.connectPromise) return this.connectPromise;
    if (this.state === 'closing' && this.disconnectPromise) await this.disconnectPromise;

    const factory = factoryOrUrl ?? this.storageFactory;
    const generation = ++this.generation;
    this.state = 'connecting';
    this.connectPromise = (async () => {
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
        this.connectPromise = null;
      }
    })();
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
    this.state = 'closing';
    this.generation += 1;
    this.invalidateCollections(error);
    this.invalidateModels(error);
    this.models.clear();

    this.disconnectPromise = (async () => {
      await this.connectPromise?.catch(() => undefined);
      const db = previousDb ?? this.db;
      this.db = null;
      if (db) await closeDatabase(db);
      this.state = 'disconnected';
      this.disconnectPromise = null;
    })();
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
    return entry.adapter ? Promise.resolve(entry.adapter) : entry.promise;
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

    let reject!: (reason?: unknown) => void;
    const aborted = new Promise<never>((_, rej) => {
      reject = rej;
    });
    const generation = this.generation;
    const entry: CollectionRegistryEntry = {
      normalizedName,
      fingerprint,
      generation,
      adapter: null,
      promise: Promise.resolve(null as never),
      reject,
    };

    const initialize = (async () => {
      if (!(normalizedName in db.collections)) {
        await db.addCollections({ [normalizedName]: { schema: rxSchema, options: {} } });
      }
      const rxCollection = db.collections[normalizedName];
      if (!rxCollection) throw new Error(`RxDB did not create collection "${normalizedName}".`);
      return new RxCollectionAdapter(rxCollection);
    })();
    initialize.catch(() => undefined);

    entry.promise = Promise.race([initialize, aborted]).then(
      (adapter) => {
        if (this.generation !== generation || this.state !== 'connected' || this.db !== db) {
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
      { isNew: false, id: doc._id },
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

  const readiness = collectionEntry.promise.then(
    (adapter: RxLikeCollection) => {
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
}

async function closeDatabase(db: RxDatabase): Promise<void> {
  if (typeof db.close === 'function') await db.close();
  else await db.destroy();
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortStable(value));
}

function sortStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortStable);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) out[key] = sortStable((value as Record<string, unknown>)[key]);
  return out;
}
