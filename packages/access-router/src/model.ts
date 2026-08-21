import mongoose from 'mongoose';
import { Sort, Filter, Projection, Populate } from './interfaces';
import { getActiveRuntime } from './runtime-context';
import type { AccessRuntime } from './runtime';

interface FindProps {
  filter: Filter;
  select?: Projection;
  sort?: Sort;
  populate?: Populate[] | string;
  limit?: string | number;
  hardLimit?: number;
  skip?: string | number;
  lean?: boolean;
}

interface FindOneProps {
  filter: Filter;
  select?: Projection;
  sort?: Sort;
  populate?: Populate[] | string;
  lean?: boolean;
}

class Model {
  modelName: string;
  model: mongoose.Model<any>;
  runtime: AccessRuntime | null;

  constructor(modelName: string, runtime?: AccessRuntime) {
    this.modelName = modelName;
    this.runtime = runtime ?? null;
    const resolvedRuntime = runtime ?? getActiveRuntime();
    const registered = resolvedRuntime?.getModelInstance(modelName) ?? null;
    const global = mongoose.models[modelName] as mongoose.Model<unknown> | undefined;
    this.model = (registered ?? global ?? mongoose.model(modelName)) as mongoose.Model<any>;
    if (!this.model) return;
  }

  new() {
    const doc = new this.model();
    return doc;
  }

  create(data: unknown) {
    return this.model.create(data);
  }

  find({ filter, select, sort, populate, limit, hardLimit, skip, lean }: FindProps) {
    const builder = this.model.find(filter as Record<string, unknown>);
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

  findOne({ filter, select, sort, populate, lean }: FindOneProps) {
    const builder = this.model.findOne(filter as Record<string, unknown>);
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
  countDocuments(filter = {}) {
    return this.model.countDocuments(filter);
  }

  // see https://mongoosejs.com/docs/api.html#model_Model.distinct
  distinct(field: string, conditions = {}) {
    return this.model.distinct(field, conditions);
  }
}

export default Model;
