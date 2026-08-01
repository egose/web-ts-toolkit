import { Schema } from './schema';
import { Document } from './document';
import { Query } from './query';
import { RxCollectionAdapter, RxLikeCollection } from './rx-adapter';
import type { FilterQuery, QueryOptions, UpdateQuery } from './types';
import type { RxDatabase } from './rx-types';
import { convertToRxJsonSchema } from './converter';
import { MiddlewareEngine } from './middleware';

export interface Model<T = any> {
  new (doc?: Partial<T>): Document<T>;
  schema: Schema<T>;
  collection: RxLikeCollection;
  modelName: string;
  collectionName: string;
  connection: Connection;
  mw: MiddlewareEngine;
  find(filter?: FilterQuery<T>): Query<any[], T, Schema<T>>;
  findOne(filter?: FilterQuery<T>): Query<any | null, T, Schema<T>>;
  countDocuments(filter?: FilterQuery<T>): Query<number, T, Schema<T>>;
  findById(id: string): Promise<Document<T> | null>;
  create(docs: Partial<T> | Partial<T>[]): Promise<any>;
  insertMany(docs: Partial<T>[]): Promise<Document<T>[]>;
  updateOne(filter: FilterQuery<T>, update: UpdateQuery<T>, options?: QueryOptions): Query<any, T, Schema<T>>;
  updateMany(filter: FilterQuery<T>, update: UpdateQuery<T>, options?: QueryOptions): Query<any, T, Schema<T>>;
  deleteOne(filter: FilterQuery<T>, options?: QueryOptions): Query<any, T, Schema<T>>;
  deleteMany(filter: FilterQuery<T>, options?: QueryOptions): Query<any, T, Schema<T>>;
  findOneAndUpdate(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    options?: QueryOptions,
  ): Query<any | null, T, Schema<T>>;
  findOneAndDelete(filter: FilterQuery<T>, options?: QueryOptions): Query<any | null, T, Schema<T>>;
}

export class Connection {
  public db: RxDatabase | null = null;
  public models: Map<string, Model> = new Map();
  public storageFactory: (() => Promise<any>) | null = null;

  constructor(storageFactory?: () => Promise<any>) {
    if (storageFactory) this.storageFactory = storageFactory;
  }

  async connect(factoryOrUrl?: string | (() => Promise<any>)): Promise<void> {
    const factory = typeof factoryOrUrl === 'function' ? factoryOrUrl : this.storageFactory;
    if (!factory) {
      const storageModule = await import('./storage/index');
      this.db = await storageModule.createMemoryDatabase();
    } else {
      this.db = await (factory as () => Promise<any>)();
    }
    this.storageFactory = factory as () => Promise<any>;
  }

  setStorage(storageFactory: () => Promise<any>): this {
    this.storageFactory = storageFactory;
    return this;
  }

  ready(): RxDatabase {
    if (!this.db) throw new Error('Connection not established. Call connect() first.');
    return this.db;
  }

  async disconnect(): Promise<void> {
    if (this.db) await (this.db as any).close();
    this.db = null;
    this.models.clear();
  }

  model<T = any>(
    name: string,
    schema?: Schema<T>,
    collectionName?: string,
    options: { overwrite?: boolean } = {},
  ): Model<T> {
    const existing = this.models.get(name);
    if (existing && !schema) return existing as Model<T>;
    if (existing && schema && !options.overwrite) {
      throw new Error(
        `A model with name "${name}" is already compiled. Call connection.deleteModel("${name}") first, ` +
          `or pass { overwrite: true } to Connection#model to recompile.`,
      );
    }
    if (existing && schema && options.overwrite) {
      this.models.delete(name);
    }
    if (!schema) throw new Error(`Schema is required to compile model "${name}"`);
    const built = buildModel(this, name, schema, collectionName ?? schema.options.collection ?? name);
    this.models.set(name, built as unknown as Model<T>);
    return built;
  }

  modelNames(): string[] {
    return Array.from(this.models.keys());
  }

  deleteModel(name: string): this {
    this.models.delete(name);
    return this;
  }
}

export const defaultConnection = new Connection();

export function buildModel<T = any>(
  connection: Connection,
  modelName: string,
  schema: Schema<T>,
  collectionName: string,
): Model<T> {
  const rxSchema = convertToRxJsonSchema(collectionName, schema);
  const mw = new MiddlewareEngine(schema);
  const promise = ensureCollection(connection, collectionName, rxSchema);

  const boundModel: any = function ModelCtor(this: any, doc?: Partial<T>) {
    return new Document<T>(doc ?? ({} as Partial<T>), schema, boundModel, { isNew: true });
  };

  boundModel.schema = schema;
  boundModel.collection = null;
  boundModel.collectionName = collectionName;
  boundModel.connection = connection;
  boundModel.modelName = modelName;
  boundModel.mw = mw;

  boundModel.find = (filter?: FilterQuery<T>) =>
    makeQuery<T>('find', boundModel, schema, boundModel.collection, filter);
  boundModel.findOne = (filter?: FilterQuery<T>) =>
    makeQuery<T>('findOne', boundModel, schema, boundModel.collection, filter, {}, 'findOne');
  boundModel.countDocuments = (filter?: FilterQuery<T>) =>
    makeQuery<T>('count', boundModel, schema, boundModel.collection, filter, {}, 'count');
  boundModel.findById = async (id: string) => {
    const coll = (await boundModel.collectionReady) as RxLikeCollection;
    const doc = await coll.findOne({ selector: { _id: { $eq: id } }, limit: 1 });
    return doc
      ? new Document<T>(doc as unknown as Partial<T>, schema, boundModel, { isNew: false, id: doc._id })
      : null;
  };
  boundModel.create = async (docs: any) => {
    const arr = Array.isArray(docs) ? docs : [docs];
    const out: Document<T>[] = [];
    for (const d of arr) {
      const inst = new Document<T>(d, schema, boundModel, { isNew: true });
      await inst.save();
      out.push(inst);
    }
    return Array.isArray(docs) ? out : out[0];
  };
  boundModel.insertMany = async (docs: Partial<T>[]) => insertMany<T>(schema, boundModel, docs);
  boundModel.updateOne = (filter: FilterQuery<T>, update: UpdateQuery<T>, options?: QueryOptions) =>
    makeQuery<T>('updateOne', boundModel, schema, boundModel.collection, filter, options, 'updateOne', update);
  boundModel.updateMany = (filter: FilterQuery<T>, update: UpdateQuery<T>, options?: QueryOptions) =>
    makeQuery<T>('updateMany', boundModel, schema, boundModel.collection, filter, options, 'updateMany', update);
  boundModel.deleteOne = (filter: FilterQuery<T>, options?: QueryOptions) =>
    makeQuery<T>('deleteOne', boundModel, schema, boundModel.collection, filter, options, 'deleteOne');
  boundModel.deleteMany = (filter: FilterQuery<T>, options?: QueryOptions) =>
    makeQuery<T>('deleteMany', boundModel, schema, boundModel.collection, filter, options, 'deleteMany');
  boundModel.findOneAndUpdate = (filter: FilterQuery<T>, update: UpdateQuery<T>, options?: QueryOptions) =>
    makeQuery<T>(
      'findOneAndUpdate',
      boundModel,
      schema,
      boundModel.collection,
      filter,
      options,
      'findOneAndUpdate',
      update,
    );
  boundModel.findOneAndDelete = (filter: FilterQuery<T>, options?: QueryOptions) =>
    makeQuery<T>('findOneAndDelete', boundModel, schema, boundModel.collection, filter, options, 'findOneAndDelete');

  for (const [sName, sFn] of Object.entries(schema.statics)) {
    boundModel[sName] = sFn;
  }

  boundModel.collectionReady = promise;
  promise.then((adapter: RxLikeCollection) => {
    boundModel.collection = adapter;
  });

  return boundModel as unknown as Model<T>;
}

function makeQuery<T>(
  op: string,
  model: any,
  schema: Schema<T>,
  collection: RxLikeCollection,
  filter?: FilterQuery<T>,
  options?: QueryOptions,
  setOp?: string,
  update?: UpdateQuery<T>,
): Query<any, T, Schema<T>> {
  const q = new Query<any, T, Schema<T>>(model, schema, collection);
  if (filter) q.where(filter);
  if (setOp) q.setOp(setOp as any);
  else q.setOp(op as any);
  if (options?.sort) q.sort(options.sort as any);
  if (options?.limit !== undefined) q.limit(options.limit);
  if (options?.skip !== undefined) q.skip(options.skip);
  if (options?.projection) q.select(options.projection as any);
  if (options?.lean) q.lean(true);
  if (update) q.setUpdate(update);
  return q;
}

async function insertMany<T>(schema: Schema<T>, model: any, docs: Partial<T>[]): Promise<Document<T>[]> {
  const out: Document<T>[] = [];
  for (const d of docs) {
    const inst = new Document<T>(d, schema, model, { isNew: true });
    await inst.save();
    out.push(inst);
  }
  return out;
}

async function ensureCollection(connection: Connection, name: string, rxSchema: any): Promise<RxLikeCollection> {
  const db = connection.ready();
  const lower = name.toLowerCase();
  if (!(lower in db.collections)) {
    await db.addCollections({ [lower]: { schema: rxSchema, options: {} } });
  }
  const rxCollection = db.collections[lower];
  const adapter = new RxCollectionAdapter(rxCollection);
  return adapter;
}

export function model<T = any>(name: string, schema?: Schema<T>, collection?: string): Model<T> {
  return defaultConnection.model<T>(name, schema, collection);
}

export function connect(factoryOrUrl?: string | (() => Promise<any>)): Promise<void> {
  return defaultConnection.connect(factoryOrUrl);
}

export function disconnect(): Promise<void> {
  return defaultConnection.disconnect();
}
