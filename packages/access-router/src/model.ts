import mongoose from 'mongoose';
import { Sort, Filter, Projection, Populate } from './interfaces';
import { getActiveRuntime } from './runtime-context';
import { defaultRuntime, type AccessRuntime } from './runtime';

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

  // see https://mongoosejs.com/docs/api.html#model_Model.distinct
  distinct(field: string, conditions = {}): mongoose.Query<any[], any> {
    return this.mongooseModel.distinct(field, conditions);
  }

  aggregate(pipeline: unknown[]) {
    return this.mongooseModel.aggregate(pipeline as mongoose.PipelineStage[]);
  }
}

export default Model;
