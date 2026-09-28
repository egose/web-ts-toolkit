import mongoose from 'mongoose';
import { cloneDeep } from '@web-ts-toolkit/utils';
import { Sort, Filter, Projection, Populate } from './interfaces';
import { getActiveRuntime } from './runtime-context';
import { defaultRuntime, type AccessRuntime } from './runtime';
import type { RequestConcurrencyScheduler } from './helpers/concurrency';

export interface FindProps {
  filter: Filter;
  select?: Projection;
  sort?: Sort;
  populate?: Populate[] | string;
  limit?: string | number;
  hardLimit?: number;
  skip?: string | number;
  lean?: boolean;
}

export interface FindOneProps {
  filter: Filter;
  select?: Projection;
  sort?: Sort;
  populate?: Populate[] | string;
  lean?: boolean;
}

export interface ModelAdapter {
  readonly modelName: string;
  readonly mongooseModel: mongoose.Model<any>;
  'new'(): unknown;
  create(data: unknown): any;
  find(props: FindProps): any;
  findOne(props: FindOneProps): any;
  exists(filter: Filter): any;
  countDocuments(filter?: Filter): any;
  distinct(field: string, conditions?: Filter): any;
  aggregate(pipeline: unknown[]): any;
  // Synchronous query casting only; custom adapters may retain identity semantics.
  castFilter?(filter: Record<string, unknown>): Record<string, unknown>;
}

// Wrap the service's adapter, including overrides used by custom/test services.
// Awaiting the lazy query here covers execution, not just builder construction.
// Keep adapter receivers and document/model identities intact.
export function admitModelPersistence(adapter: ModelAdapter, scheduler: RequestConcurrencyScheduler): ModelAdapter {
  return {
    modelName: adapter.modelName,
    mongooseModel: adapter.mongooseModel,
    new: () => adapter.new(),
    // Mongoose create(array) otherwise starts all document saves at once. Keep
    // the adapter's array input/output contract, with one permit per item; all
    // items are submitted even if one rejects, as with unordered create(array).
    create: (data) =>
      Array.isArray(data)
        ? Promise.all(data.map((item) => scheduler.work(async () => (await adapter.create([item]))[0])))
        : scheduler.work(() => adapter.create(data)),
    find: (props) => scheduler.work(() => adapter.find(props)),
    findOne: (props) => scheduler.work(() => adapter.findOne(props)),
    exists: (filter) => scheduler.work(() => adapter.exists(filter)),
    countDocuments: (filter) => scheduler.work(() => adapter.countDocuments(filter)),
    distinct: (field, conditions) => scheduler.work(() => adapter.distinct(field, conditions)),
    aggregate: (pipeline) => scheduler.work(() => adapter.aggregate(pipeline)),
    // Casting builds no persistence work and must not acquire a recursive permit.
    ...(adapter.castFilter ? { castFilter: (filter: Record<string, unknown>) => adapter.castFilter!(filter) } : {}),
  };
}

class Model {
  modelName: string;
  mongooseModel: mongoose.Model<any>;
  runtime: AccessRuntime | null;

  constructor(modelName: string, runtime?: AccessRuntime) {
    this.modelName = modelName;
    this.runtime = runtime ?? null;
    const resolvedRuntime = runtime ?? getActiveRuntime() ?? defaultRuntime;
    const registered = resolvedRuntime.getModelInstance(modelName);
    if (!registered) {
      throw new Error(
        `Runtime model registry missing model "${modelName}". Pass a mongoose.Model instance to createRouter() or register it with registerModelInstance() before using this runtime.`,
      );
    }
    this.mongooseModel = registered as mongoose.Model<any>;
    if (!this.mongooseModel) return;
  }

  new() {
    const doc = new this.mongooseModel();
    return doc;
  }

  create(data: unknown) {
    return this.mongooseModel.create(data);
  }

  find({ filter, select, sort, populate, limit, hardLimit, skip, lean }: FindProps): mongoose.Query<any[], any> {
    const builder = this.mongooseModel.find(filter as Record<string, unknown>);
    if (select) builder.select(select);
    if (skip) builder.skip(Number(skip));
    const normalizedLimit = Number(limit);
    if (Number.isSafeInteger(normalizedLimit) && normalizedLimit > 0) {
      builder.limit(normalizedLimit);
    } else if (Number.isSafeInteger(hardLimit) && Number(hardLimit) > 0) {
      builder.limit(Number(hardLimit));
    }
    if (sort) builder.sort(sort);
    if (populate) builder.populate(populate as mongoose.PopulateOptions | Array<string | mongoose.PopulateOptions>);
    if (lean) builder.lean();

    return builder;
  }

  findOne({ filter, select, sort, populate, lean }: FindOneProps): mongoose.Query<any, any> {
    const builder = this.mongooseModel.findOne(filter as Record<string, unknown>);
    if (select) builder.select(select);
    if (sort) builder.sort(sort);
    if (populate) builder.populate(populate as mongoose.PopulateOptions | Array<string | mongoose.PopulateOptions>);
    if (lean) builder.lean();

    return builder;
  }

  exists(filter: Filter): ReturnType<typeof Model.prototype.findOne> | null {
    if (!filter) return null;
    return this.findOne({ filter }).select('_id').lean();
  }

  // see https://mongoosejs.com/docs/api.html#query_Query-countDocuments
  countDocuments(filter = {}): mongoose.Query<number, any> {
    return this.mongooseModel.countDocuments(filter);
  }

  /** Cast a copy using this model's query schema/setters, without executing query middleware or persistence. */
  castFilter(filter: Record<string, unknown>): Record<string, unknown> {
    const query = this.mongooseModel.countDocuments(cloneDeep(filter));
    return query.cast(this.mongooseModel);
  }

  // see https://mongoosejs.com/docs/api.html#model_Model.distinct
  distinct(field: string, conditions = {}): mongoose.Query<any[], any> {
    return this.mongooseModel.distinct(field, conditions);
  }

  aggregate(pipeline: unknown[]) {
    return this.mongooseModel.aggregate(pipeline as mongoose.PipelineStage[]);
  }
}

export default Model;
