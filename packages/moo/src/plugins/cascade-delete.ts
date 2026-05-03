import mongoose, { type Schema } from 'mongoose';

const deleteOneSupported = Number.parseInt(mongoose.version.split('.')[0] ?? '0', 10) >= 7;

type QueryOptions = {
  lean?: boolean;
  populate?: unknown;
  select?: unknown;
  sort?: unknown;
};

type QueryBuilder<TResult = unknown[]> = PromiseLike<TResult> & {
  lean(): QueryBuilder<TResult>;
  populate(value: unknown): QueryBuilder<TResult>;
  select(value: unknown): QueryBuilder<TResult>;
  sort(value: unknown): QueryBuilder<TResult>;
};

export type QueryFilter<TDocument extends Record<string, unknown> = Record<string, unknown>> = Partial<TDocument> &
  Record<string, unknown>;

export type CascadeDeleteDependencyMap<TModelName extends string, TDependentDocument = unknown> = Record<
  TModelName,
  TDependentDocument[]
>;

export type CascadeDeleteDocumentMethods<TModelName extends string, TDependentDocument = unknown> = {
  findDependents(): Promise<CascadeDeleteDependencyMap<TModelName, TDependentDocument> & Record<string, unknown[]>>;
  findDependents(modelName: TModelName): Promise<TDependentDocument[]>;
  findDependents(modelName: string): Promise<unknown[] | null>;
};

export type CascadeDeleteModelStatics<TModelName extends string, TDependentDocument = unknown> = {
  findOrphans(): Promise<CascadeDeleteDependencyMap<TModelName, TDependentDocument> & Record<string, unknown[]>>;
  findOrphans(modelName: TModelName): Promise<TDependentDocument[] | null>;
  findOrphans(modelName: string): Promise<unknown[] | null>;
};

type PluginDocumentContext = {
  get(path: string): unknown;
  toObject(options: { virtuals: false }): Record<string, unknown>;
};

type PluginModelContext = {
  distinct(path: string): Promise<unknown[]>;
  modelName: string;
};

type DeleteCapableDocument = {
  deleteOne?: () => Promise<unknown>;
  remove?: () => Promise<unknown>;
};

export type FilterResolver<TDependentDocument extends Record<string, unknown> = Record<string, unknown>> =
  | QueryFilter<TDependentDocument>
  | ((document: unknown) => QueryFilter<TDependentDocument> | null | undefined);

export interface CascadeDeletePluginOptions<
  TModelName extends string = string,
  TDependentDocument extends Record<string, unknown> = Record<string, unknown>,
> {
  model: TModelName;
  localField?: string;
  foreignField?: string;
  foreignFilter?: FilterResolver<TDependentDocument>;
  extraForeignFilter?: FilterResolver<TDependentDocument>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isFunction = (value: unknown): value is (...args: unknown[]) => unknown => typeof value === 'function';

const getReferenceModel = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    return getReferenceModel(value[0]);
  }

  if (!isPlainObject(value) || typeof value.ref !== 'string') {
    return null;
  }

  return value.ref;
};

const isReference = (value: unknown, modelName: string) => getReferenceModel(value) === modelName;

const resolveFilter = <TDependentDocument extends Record<string, unknown>>(
  value: FilterResolver<TDependentDocument> | undefined,
  document?: unknown,
): QueryFilter<TDependentDocument> | null => {
  const result = isFunction(value) ? value(document) : value;

  if (!isPlainObject(result)) {
    return null;
  }

  return result;
};

const applyQueryOptions = <TResult>(query: QueryBuilder<TResult>, options: QueryOptions): QueryBuilder<TResult> => {
  let builder = query;

  if (options.select) {
    builder = builder.select(options.select as never);
  }

  if (options.sort) {
    builder = builder.sort(options.sort as never);
  }

  if (options.populate) {
    builder = builder.populate(options.populate as never);
  }

  if (options.lean) {
    builder = builder.lean();
  }

  return builder;
};

const supportsDeleteOne = (value: unknown): value is Required<Pick<DeleteCapableDocument, 'deleteOne'>> =>
  isPlainObject(value) && typeof value.deleteOne === 'function';

const supportsRemove = (value: unknown): value is Required<Pick<DeleteCapableDocument, 'remove'>> =>
  isPlainObject(value) && typeof value.remove === 'function';

export function cascadeDeletePlugin<
  TModelName extends string = string,
  TDependentDocument extends Record<string, unknown> = Record<string, unknown>,
>(schema: Schema, options: CascadeDeletePluginOptions<TModelName, TDependentDocument>) {
  const { model, localField, foreignField, foreignFilter, extraForeignFilter } = options ?? {};

  const findDependents = async function (this: PluginDocumentContext, queryOptions: QueryOptions) {
    const Target = mongoose.model(model);
    let query: QueryFilter<TDependentDocument> | null = null;
    const document = this.toObject({ virtuals: false });

    if (foreignFilter) {
      query = resolveFilter(foreignFilter, document);
    } else if (localField && foreignField) {
      const localValue = this.get(localField);
      const extraFilter = resolveFilter(extraForeignFilter, document) ?? {};

      query = {
        [foreignField]: Array.isArray(localValue) ? { $in: localValue } : localValue,
        ...extraFilter,
      } as QueryFilter<TDependentDocument>;
    }

    if (!query || !isPlainObject(query)) {
      return [];
    }

    return await applyQueryOptions(Target.find(query) as QueryBuilder<unknown[]>, queryOptions);
  };

  const findOrphans = async function (this: PluginModelContext, queryOptions: QueryOptions) {
    if (!localField || !foreignField) return null;

    const Target = mongoose.model(model);

    const schemaValue = (Target.schema.obj as Record<string, unknown>)[foreignField];
    if (!schemaValue) return null;

    const isMyRef = isReference(schemaValue, this.modelName);
    if (!isMyRef) return null;

    const ids = await this.distinct('_id');
    const extraFilter = resolveFilter(extraForeignFilter) ?? {};
    const query = {
      [foreignField]: { $not: { $in: ids } },
      ...extraFilter,
    } as QueryFilter<TDependentDocument>;

    return await applyQueryOptions(Target.find(query) as QueryBuilder<unknown[]>, queryOptions);
  };

  const deleteDependents = async function (this: PluginDocumentContext) {
    const documents = await findDependents.call(this, { select: '_id' });

    await Promise.all(
      documents.map((document) => {
        if (supportsDeleteOne(document)) {
          return document.deleteOne();
        }

        if (supportsRemove(document)) {
          return document.remove();
        }

        return Promise.resolve();
      }),
    );
  };

  if (deleteOneSupported) {
    schema.post('deleteOne', { document: true, query: false }, async function () {
      try {
        await deleteDependents.call(this);
      } catch (err) {
        console.error(err);
      }
    });
  } else {
    // @ts-expect-error Mongoose still exposes `remove` middleware for older versions.
    schema.post('remove', async function () {
      try {
        await deleteDependents.call(this);
      } catch (err) {
        console.error(err);
      }
    });
  }

  const methodFnName = 'findDependents';
  const prevMethodFn = schema.methods[methodFnName] as
    | ((this: PluginDocumentContext, modelName?: string) => Promise<unknown>)
    | undefined;

  schema.method(methodFnName, async function methodFn(this: PluginDocumentContext, modelName?: string) {
    if (modelName) {
      if (modelName === model) {
        return findDependents.call(this, {});
      }

      return prevMethodFn ? prevMethodFn.call(this, modelName) : null;
    }

    const previousResults = prevMethodFn ? await prevMethodFn.call(this) : {};

    return {
      ...(isPlainObject(previousResults) ? previousResults : {}),
      [model]: await findDependents.call(this, {}),
    };
  });

  const staticFnName = 'findOrphans';
  const prevStaticFn = schema.statics[staticFnName] as
    | ((this: PluginModelContext, modelName?: string) => Promise<unknown>)
    | undefined;

  schema.static(staticFnName, async function methodFn(this: PluginModelContext, modelName?: string) {
    if (modelName) {
      if (modelName === model) {
        return findOrphans.call(this, {});
      }

      return prevStaticFn ? prevStaticFn.call(this, modelName) : null;
    }

    const previousResults = prevStaticFn ? await prevStaticFn.call(this) : {};
    const currentResults = await findOrphans.call(this, {});

    if (!currentResults) {
      return isPlainObject(previousResults) ? previousResults : {};
    }

    return {
      ...(isPlainObject(previousResults) ? previousResults : {}),
      [model]: currentResults,
    };
  });
}
