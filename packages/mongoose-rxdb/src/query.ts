import type { FilterQuery, QueryOptions, UpdateQuery } from './types';
import type { RxLikeCollection, RxLikeDoc } from './rx-adapter';
import { applyUpdate, compileQuery } from './query-compiler';
import { Document, validateDoc } from './document';
import { Schema } from './schema';
import { MiddlewareEngine } from './middleware';

export type QueryOp =
  | 'find'
  | 'findOne'
  | 'count'
  | 'updateOne'
  | 'updateMany'
  | 'deleteOne'
  | 'deleteMany'
  | 'findOneAndUpdate'
  | 'findOneAndDelete';

export class Query<ResultType = any, DocType = any, TSchema extends Schema = Schema> {
  private filter: FilterQuery<DocType> = {};
  private options: QueryOptions = {};
  private op: QueryOp = 'find';
  private updateDoc: any;
  private currentField?: string;
  private mw: MiddlewareEngine;

  constructor(
    public model: any,
    public schema: TSchema,
    public collection: RxLikeCollection,
  ) {
    this.mw = new MiddlewareEngine(schema);
  }

  where(field: string | FilterQuery<DocType>): this {
    if (typeof field === 'object') Object.assign(this.filter, field);
    else this.currentField = field;
    return this;
  }

  equals(value: any): this {
    if (this.currentField) this.filter[this.currentField as keyof FilterQuery<DocType>] = value;
    return this;
  }

  gt(value: any): this {
    if (this.currentField) (this.filter as any)[this.currentField] = { $gt: value };
    return this;
  }

  gte(value: any): this {
    if (this.currentField) (this.filter as any)[this.currentField] = { $gte: value };
    return this;
  }

  lt(value: any): this {
    if (this.currentField) (this.filter as any)[this.currentField] = { $lt: value };
    return this;
  }

  lte(value: any): this {
    if (this.currentField) (this.filter as any)[this.currentField] = { $lte: value };
    return this;
  }

  ne(value: any): this {
    if (this.currentField) (this.filter as any)[this.currentField] = { $ne: value };
    return this;
  }

  in(values: any[]): this {
    if (this.currentField) (this.filter as any)[this.currentField] = { $in: values };
    return this;
  }

  nin(values: any[]): this {
    if (this.currentField) (this.filter as any)[this.currentField] = { $nin: values };
    return this;
  }

  exists(flag = true): this {
    if (this.currentField) (this.filter as any)[this.currentField] = { $exists: flag };
    return this;
  }

  regex(pattern: RegExp): this {
    if (this.currentField)
      (this.filter as any)[this.currentField] = { $regex: pattern.source, $options: pattern.flags };
    return this;
  }

  or(conditions: FilterQuery<DocType>[]): this {
    (this.filter as any).$or = conditions;
    return this;
  }

  and(conditions: FilterQuery<DocType>[]): this {
    (this.filter as any).$and = conditions;
    return this;
  }

  nor(conditions: FilterQuery<DocType>[]): this {
    (this.filter as any).$nor = conditions;
    return this;
  }

  limit(n: number): this {
    this.options.limit = n;
    return this;
  }

  skip(n: number): this {
    this.options.skip = n;
    return this;
  }

  sort(spec: Record<string, 1 | -1 | 'asc' | 'desc'>): this {
    this.options.sort = spec;
    return this;
  }

  select(projection: Record<string, 0 | 1> | string): this {
    this.options.projection = projection;
    return this;
  }

  lean(flag = true): this {
    this.options.lean = flag;
    return this;
  }

  setOp(op: QueryOp): this {
    this.op = op;
    return this;
  }

  setUpdate(update: UpdateQuery<DocType>): this {
    this.updateDoc = update;
    return this;
  }

  clone(): Query<ResultType, DocType, TSchema> {
    const c = new Query<ResultType, DocType, TSchema>(this.model, this.schema, this.collection);
    c.filter = { ...this.filter } as FilterQuery<DocType>;
    c.options = { ...this.options };
    c.op = this.op;
    c.updateDoc = this.updateDoc;
    c.currentField = this.currentField;
    return c;
  }

  async exec(): Promise<ResultType> {
    const target: any = {
      model: this.model,
      schema: this.schema,
      collection: this.collection,
      query: this,
      filter: this.filter,
      options: this.options,
      update: this.updateDoc,
    };
    return this.mw.exec(this.op as string, target, () => this.execute());
  }

  private async resolveCollection(): Promise<RxLikeCollection> {
    if (this.collection) return this.collection;
    const ready = (this.model as any).collectionReady as Promise<RxLikeCollection> | undefined;
    this.collection = ready ? await ready : this.collection;
    return this.collection;
  }

  private async execute(): Promise<any> {
    this.collection = await this.resolveCollection();
    const compiled = compileQuery(this.filter, this.options);
    switch (this.op) {
      case 'find':
        return await this.runFind(compiled);
      case 'findOne':
        return await this.runFindOne(compiled);
      case 'count':
        return await this.runCount(compiled);
      case 'updateOne':
        return await this.runUpdate(compiled, false);
      case 'updateMany':
        return await this.runUpdate(compiled, true);
      case 'deleteOne':
        return await this.runDelete(compiled, false);
      case 'deleteMany':
        return await this.runDelete(compiled, true);
      case 'findOneAndUpdate':
        return await this.runFindOneAndUpdate(compiled);
      case 'findOneAndDelete':
        return await this.runFindOneAndDelete(compiled);
      default:
        throw new Error(`Unsupported query op: ${this.op}`);
    }
  }

  private async runFind(compiled: ReturnType<typeof compileQuery>): Promise<any[]> {
    const docs = (await this.collection.find(compiled)).map((d) => this.hydrate(d));
    if (this.options.lean) return docs.map((d) => d.toObject());
    return docs;
  }

  private async runFindOne(compiled: ReturnType<typeof compileQuery>): Promise<any | null> {
    const doc = await this.collection.findOne({ ...compiled, limit: 1 });
    if (!doc) return null;
    return this.options.lean ? this.hydrate(doc).toObject() : this.hydrate(doc);
  }

  private async runCount(compiled: ReturnType<typeof compileQuery>): Promise<number> {
    const docs = await this.collection.find(compiled);
    return docs.length;
  }

  private async runUpdate(
    compiled: ReturnType<typeof compileQuery>,
    many: boolean,
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    const docs = await this.collection.find(compiled);
    const target = many ? docs : docs.slice(0, 1);
    let modified = 0;
    for (const doc of target) {
      const next = applyUpdate(doc, this.updateDoc);
      if (this.options.runValidators) await validateDoc(this.hydrate(next));
      await this.collection.modify(doc._id, next);
      modified++;
    }
    return { matchedCount: docs.length, modifiedCount: modified };
  }

  private async runDelete(compiled: ReturnType<typeof compileQuery>, many: boolean): Promise<{ deletedCount: number }> {
    const docs = await this.collection.find(compiled);
    const target = many ? docs : docs.slice(0, 1);
    for (const doc of target) await this.collection.remove(doc._id);
    return { deletedCount: target.length };
  }

  private async runFindOneAndUpdate(compiled: ReturnType<typeof compileQuery>): Promise<any | null> {
    const doc = await this.collection.findOne({ ...compiled, limit: 1 });
    if (!doc) {
      if (this.options.upsert && this.updateDoc) {
        const merged = applyUpdate({}, this.updateDoc);
        const inserted = await this.collection.insert(merged);
        return this.options.new || this.options.returnDocument === 'after' ? this.hydrate(inserted) : null;
      }
      return null;
    }
    const next = applyUpdate(doc, this.updateDoc);
    await this.collection.modify(doc._id, next);
    const fresh = await this.collection.findOne({ selector: { _id: { $eq: doc._id } }, limit: 1 });
    return this.options.new || this.options.returnDocument === 'after'
      ? fresh
        ? this.hydrate(fresh)
        : null
      : this.hydrate(doc);
  }

  private async runFindOneAndDelete(compiled: ReturnType<typeof compileQuery>): Promise<any | null> {
    const doc = await this.collection.findOne({ ...compiled, limit: 1 });
    if (!doc) return null;
    await this.collection.remove(doc._id);
    return this.hydrate(doc);
  }

  private hydrate(raw: RxLikeDoc): Document<DocType> {
    return new Document<DocType>(raw as unknown as Partial<DocType>, this.schema, this.model, {
      isNew: false,
      id: raw._id,
    });
  }

  then(onFulfilled?: any, onRejected?: any): Promise<any> {
    return this.exec().then(onFulfilled, onRejected);
  }

  catch(onRejected: any): Promise<any> {
    return this.exec().catch(onRejected);
  }

  finally(onFinally: any): Promise<any> {
    return this.exec().finally(onFinally);
  }

  get [Symbol.toStringTag]() {
    return 'MongooseLikeQuery';
  }
}

export default Query;
