import mongoose from 'mongoose';
import { Sort, Filter, Projection, Populate, SortOrder } from './interfaces';
import { logger } from './logger';

interface FindProps {
  filter: Filter;
  select?: Projection;
  sort?: Sort;
  populate?: Populate[] | string;
  limit?: string | number;
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

type SortValue = 1 | -1 | 'asc' | 'ascending' | 'desc' | 'descending';
type SortType =
  | string
  | [string, SortValue][]
  | { [key: string]: SortValue }
  | Map<string, SortValue>
  | null
  | undefined;

class Model {
  modelName: string;
  model: mongoose.Model<any>;

  constructor(modelName: string) {
    this.modelName = modelName;
    this.model = mongoose.model(modelName);
    if (!this.model) return;

    // Enable optimistic concurrency to ensure atomicity when
    // updating the document using find(), findOne(), and save().
    this.model.schema.set('optimisticConcurrency', true);
    // In order to use optimistic concurrency, a version key must be set on the schema.
    const currVersionKey = this.model.schema.get('versionKey');
    if (!currVersionKey) this.model.schema.set('versionKey', '__v');
  }

  new() {
    const doc = new this.model();
    return doc;
  }

  create(data) {
    return this.model.create(data);
  }

  find({ filter, select, sort, populate, limit, skip, lean }: FindProps) {
    if (!this.validateSort(sort as SortType)) {
      sort = null;
    }

    const builder = this.model.find(filter as Record<string, unknown>);
    if (select) builder.select(select);
    if (skip) builder.skip(Number(skip));
    if (limit) builder.limit(Number(limit));
    if (sort) builder.sort(sort);
    if (populate) builder.populate(populate as mongoose.PopulateOptions | Array<string | mongoose.PopulateOptions>);
    if (lean) builder.lean();

    return builder;
  }

  validateSort(sort: SortType, logError: (msg: string, ...args: unknown[]) => void = logger.error): boolean {
    const validSortOrders: SortOrder[] = [1, -1, 'asc', 'ascending', 'desc', 'descending'];
    const fieldPathPattern = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;

    const isValidFieldPath = (field: string) => fieldPathPattern.test(field);

    // Handle null/undefined (valid, no-op)
    if (sort === null || sort === undefined) return true;

    if (typeof sort === 'string') {
      const fields = sort.trim().split(/\s+/).filter(Boolean);
      const isValid = fields.every((field) => isValidFieldPath(field.startsWith('-') ? field.slice(1) : field));

      if (!isValid) {
        logError('Invalid sort string:', sort);
        return false;
      }

      return true;
    }

    // Validate array
    if (Array.isArray(sort)) {
      const isValid = sort.every((pair) => {
        if (!Array.isArray(pair) || pair.length !== 2) {
          logError('Invalid sort array element: must be [key, order]', pair);
          return false;
        }
        const [key, order] = pair as [string, SortOrder];
        if (typeof key !== 'string' || !isValidFieldPath(key)) {
          logError('Invalid sort array key: must be a field path string', key);
          return false;
        }
        if (!validSortOrders.includes(order)) {
          logError('Invalid sort array order: must be 1, -1, "asc", or "desc"', order);
          return false;
        }
        return true;
      });

      return isValid;
    }

    // Validate object
    if (typeof sort === 'object' && !(sort instanceof Map)) {
      const isValid = Object.entries(sort).every(([key, order]) => {
        if (!isValidFieldPath(key)) {
          logError('Invalid sort object key: must be a field path string', key);
          return false;
        }

        if (!validSortOrders.includes(order as SortOrder)) {
          logError('Invalid sort object value: must be 1, -1, "asc", or "desc"', order);
          return false;
        }
        return true;
      });
      return isValid;
    }

    // Validate Map
    if (sort instanceof Map) {
      const isValid = Array.from(sort.entries()).every(([key, order]) => {
        if (!isValidFieldPath(key)) {
          logError('Invalid sort Map key: must be a field path string', key);
          return false;
        }

        if (!validSortOrders.includes(order)) {
          logError('Invalid sort Map value: must be 1, -1, "asc", or "desc"', order);
          return false;
        }
        return true;
      });
      return isValid;
    }

    // Invalid type
    logError('Invalid sort type: must be string, array, object, or Map', sort);
    return false;
  }

  findOne({ filter, select, sort, populate, lean }: FindOneProps) {
    if (!this.validateSort(sort as SortType)) {
      sort = null;
    }

    const builder = this.model.findOne(filter as Record<string, unknown>);
    if (select) builder.select(select);
    if (sort) builder.sort(sort);
    if (populate) builder.populate(populate as mongoose.PopulateOptions | Array<string | mongoose.PopulateOptions>);
    if (lean) builder.lean();

    return builder;
  }

  exists(filter) {
    if (!filter) return null;
    return this.findOne(filter).select('_id').lean();
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
