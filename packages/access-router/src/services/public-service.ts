import { pick } from '@web-ts-toolkit/utils';
import { normalizeSelect, toObject } from '../helpers';
import { Service } from './service';
import {
  Filter,
  Sort,
  Projection,
  Populate,
  ModelHookContext,
  FindAccess,
  PublicOutput,
  SelectedPublicOutput,
  SelectedPopulatedPublicOutput,
  PublicListArgs,
  PublicListOptions,
  PublicReadArgs,
  PublicReadOptions,
  PublicCreateArgs,
  PublicCreateOptions,
  PublicUpdateArgs,
  PublicUpdateOptions,
  PublicUpsertArgs,
  PublicUpsertOptions,
  DistinctArgs,
  ErrorResult,
  ListResult,
  BaseFilterAccess,
  SingleResult,
  ServiceResult,
} from '../interfaces';
import { Codes } from '../enums';

export class PublicService<TModel = unknown> extends Service<TModel> {
  async _list<
    TSelect extends Projection | undefined = undefined,
    TPopulate extends Populate[] | string | undefined = undefined,
  >(
    filter: Filter<TModel>,
    args?: Omit<PublicListArgs, 'select' | 'populate'> & { select?: TSelect; populate?: TPopulate },
    options?: PublicListOptions,
  ): Promise<ListResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate>> | ErrorResult> {
    const { select, populate, include, sort, skip, limit, page, pageSize, tasks } = this.resolvePublicListArgs(args);
    const { skim, includePermissions, includeCount, populateAccess, lean } = this.resolvePublicListOptions(options);

    const result = await this.find(
      filter,
      { select, populate, include, sort, skip, limit, page, pageSize },
      { skim, includePermissions, includeCount, populateAccess, lean },
      async (doc, context: ModelHookContext) => {
        doc = toObject(doc);
        return this.decorate(doc, 'list', context);
      },
    );

    if (!result.success) {
      return result as ErrorResult;
    }

    const docs = await this.decorateAll(result.data, 'list', {
      mongooseModel: this.model.model,
      modelName: this.modelName,
      operation: 'list',
      resolvedQuery: result.query,
    });
    const transformedDocs = docs.map((row) =>
      this.runTasks(row as Record<string, unknown>, tasks),
    ) as SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate>[];

    return { ...result, data: transformedDocs };
  }

  async _create<
    TSelect extends Projection | undefined = undefined,
    TPopulate extends Populate[] | string | undefined = undefined,
  >(
    data,
    args?: Omit<PublicCreateArgs, 'select' | 'populate'> & { select?: TSelect; populate?: TPopulate },
    options?: PublicCreateOptions,
  ): Promise<ListResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate>> | ErrorResult> {
    const { select, populate, tasks } = this.resolvePublicCreateArgs(args);
    const { skim, includePermissions, populateAccess } = this.resolvePublicCreateOptions(options);

    const result = await this.create(
      data,
      { populate },
      { skim, includePermissions, populateAccess },
      async (doc, context: ModelHookContext) => {
        doc = toObject(doc);
        doc = await this.decorate(doc, 'create', context);
        doc = this.runTasks(doc as Record<string, unknown>, tasks);

        if (select) doc = pick(doc, [...normalizeSelect(select), ...this.baseFieldsExt]);
        return doc;
      },
    );

    if (!result.success) {
      return result as ErrorResult;
    }

    return result as ListResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate>>;
  }

  async _new(): Promise<SingleResult<PublicOutput<TModel>>> {
    return this.new() as Promise<SingleResult<PublicOutput<TModel>>>;
  }

  async _read<
    TSelect extends Projection | undefined = undefined,
    TPopulate extends Populate[] | string | undefined = undefined,
  >(
    id: string,
    args?: Omit<PublicReadArgs, 'select' | 'populate'> & { select?: TSelect; populate?: TPopulate },
    options?: PublicReadOptions,
  ): Promise<SingleResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate>> | ErrorResult> {
    const { select, populate, include, tasks } = this.resolvePublicReadArgs(args);
    const { skim, includePermissions, tryList, populateAccess, lean } = this.resolvePublicReadOptions(options);

    let access: FindAccess = 'read';
    const idFilter = await this.genIDFilter(id);

    let result = await this.findById(
      id,
      {
        select,
        populate,
        include,
        overrides: { idFilter },
      },
      { skim, includePermissions, access, populateAccess, lean },
    );

    // if not found, try to get the doc with 'list' access
    if (tryList && (!result.success || !result.data)) {
      access = 'list';

      result = await this.findById(
        id,
        {
          select,
          populate,
          overrides: { idFilter },
        },
        { skim, includePermissions, access, populateAccess, lean },
      );
    }

    if (!result.success) {
      return result as ErrorResult;
    }

    let doc = toObject(result.data);
    doc = await this.decorate(doc, access, result.context);
    doc = this.runTasks(doc as Record<string, unknown>, tasks);

    return { ...result, data: doc as SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate> };
  }

  async _readFilter<
    TSelect extends Projection | undefined = undefined,
    TPopulate extends Populate[] | string | undefined = undefined,
  >(
    filter: Filter<TModel>,
    args?: Omit<PublicReadArgs, 'select' | 'populate'> & { select?: TSelect; populate?: TPopulate; sort?: Sort },
    options?: PublicReadOptions,
  ): Promise<SingleResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate>> | ErrorResult> {
    const { select, sort, populate, include, tasks } = this.resolvePublicReadFilterArgs(args);
    const { skim, includePermissions, tryList, populateAccess, lean } = this.resolvePublicReadOptions(options);

    let access: FindAccess = 'read';

    let result = await this.findOne(
      filter,
      {
        select,
        sort,
        populate,
        include,
        overrides: {},
      },
      { skim, includePermissions, access, populateAccess, lean },
    );

    // if not found, try to get the doc with 'list' access
    if (tryList && (!result.success || !result.data)) {
      access = 'list';

      result = await this.findOne(
        filter,
        {
          select,
          sort,
          populate,
          overrides: {},
        },
        { skim, includePermissions, access, populateAccess, lean },
      );
    }

    if (!result.success) {
      return result as ErrorResult;
    }

    let doc = toObject(result.data);
    doc = await this.decorate(doc, access, result.context);
    doc = this.runTasks(doc as Record<string, unknown>, tasks);

    return { ...result, data: doc as SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate> };
  }

  async _update<
    TSelect extends Projection | undefined = undefined,
    TPopulate extends Populate[] | string | undefined = undefined,
  >(
    id: string,
    data,
    args?: Omit<PublicUpdateArgs, 'select' | 'populate'> & { select?: TSelect; populate?: TPopulate },
    options?: PublicUpdateOptions,
  ): Promise<SingleResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate>> | ErrorResult> {
    const { select, populate, tasks } = this.resolvePublicUpdateArgs(args);
    const { skim, returningAll, includePermissions, populateAccess } = this.resolvePublicUpdateOptions(options);

    const result = await this.updateById(
      id,
      data,
      { populate },
      { skim, includePermissions, populateAccess },
      async (doc, context: ModelHookContext) => {
        doc = toObject(doc);
        doc = await this.decorate(doc, 'update', context);
        doc = this.runTasks(doc, tasks);

        if (select) doc = pick(doc, [...normalizeSelect(select), ...this.baseFieldsExt]);
        else if (!returningAll) doc = pick(doc, [...Object.keys(data), '_id']);

        return doc;
      },
    );

    if (!result.success) {
      return result as ErrorResult;
    }

    return result as SingleResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate>>;
  }

  async _upsert<
    TSelect extends Projection | undefined = undefined,
    TPopulate extends Populate[] | string | undefined = undefined,
  >(
    data: Record<string, unknown>,
    args?: Omit<PublicUpsertArgs, 'select' | 'populate'> & { select?: TSelect; populate?: TPopulate },
    options?: PublicUpsertOptions,
  ): Promise<ServiceResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate>> | ErrorResult> {
    const idKey = this.getIdentifier();
    if (idKey !== '_id') {
      return { success: false, code: Codes.BadRequest, errors: ['not supported custom id field'] };
    }

    const { [idKey]: idVal, ...otherData } = data;
    const upsertId = typeof idVal === 'string' ? idVal : undefined;

    if (upsertId) {
      const existing = await this.exists({ [idKey]: upsertId } as Filter<TModel>, { access: 'update' });
      if (!existing.success) {
        return existing as ErrorResult;
      }

      if (!existing.data) {
        return { success: false, code: Codes.Unauthorized, errors: ['Unauthorized'] };
      }

      return this._update(upsertId, otherData, args, options);
    }

    return this._create(otherData, args, {
      skim: options?.skim,
      includePermissions: options?.includePermissions,
      populateAccess: options?.populateAccess,
    });
  }

  async _delete(id: string): Promise<SingleResult<unknown> | ErrorResult> {
    const result = await this.delete(id);
    return result;
  }

  async _distinct(field: string, options: DistinctArgs<TModel> = {}): Promise<ListResult<unknown> | ErrorResult> {
    const result = await this.distinct(field, options);
    return result;
  }

  async _count(filter: Filter<TModel>, access: BaseFilterAccess = 'list'): Promise<SingleResult<number> | ErrorResult> {
    const result = await this.count(filter, access);
    return result;
  }

  private resolvePublicListArgs(args: PublicListArgs = {}) {
    return {
      select: args.select ?? this.defaults.publicListArgs?.select,
      populate: args.populate ?? this.defaults.publicListArgs?.populate,
      include: args.include ?? this.defaults.publicListArgs?.include,
      sort: args.sort ?? this.defaults.publicListArgs?.sort,
      skip: args.skip ?? this.defaults.publicListArgs?.skip,
      limit: args.limit ?? this.defaults.publicListArgs?.limit,
      page: args.page ?? this.defaults.publicListArgs?.page,
      pageSize: args.pageSize ?? this.defaults.publicListArgs?.pageSize,
      tasks: args.tasks ?? this.defaults.publicListArgs?.tasks ?? [],
    };
  }

  private resolvePublicListOptions(options: PublicListOptions = {}) {
    return {
      skim: options.skim ?? this.defaults.publicListOptions?.skim ?? true,
      includePermissions: options.includePermissions ?? this.defaults.publicListOptions?.includePermissions ?? false,
      includeCount: options.includeCount ?? this.defaults.publicListOptions?.includeCount ?? false,
      populateAccess: options.populateAccess ?? this.defaults.publicListOptions?.populateAccess ?? 'read',
      lean: options.lean ?? this.defaults.publicListOptions?.lean ?? true,
    };
  }

  private resolvePublicCreateArgs(args: PublicCreateArgs = {}) {
    return {
      select: args.select ?? this.defaults.publicCreateArgs?.select,
      populate: args.populate ?? this.defaults.publicCreateArgs?.populate,
      tasks: args.tasks ?? this.defaults.publicCreateArgs?.tasks ?? [],
    };
  }

  private resolvePublicCreateOptions(options: PublicCreateOptions = {}) {
    return {
      skim: options.skim ?? this.defaults.publicCreateOptions?.skim ?? false,
      includePermissions: options.includePermissions ?? this.defaults.publicCreateOptions?.includePermissions ?? true,
      populateAccess: options.populateAccess ?? this.defaults.publicCreateOptions?.populateAccess ?? 'read',
    };
  }

  private resolvePublicReadArgs(args: PublicReadArgs = {}) {
    return {
      select: args.select ?? this.defaults.publicReadArgs?.select,
      populate: args.populate ?? this.defaults.publicReadArgs?.populate,
      include: args.include ?? this.defaults.publicReadArgs?.include,
      tasks: args.tasks ?? this.defaults.publicReadArgs?.tasks ?? [],
    };
  }

  private resolvePublicReadFilterArgs(args: PublicReadArgs & { sort?: Sort } = {}) {
    const resolvedArgs = this.resolvePublicReadArgs(args);

    return {
      ...resolvedArgs,
      sort: args.sort ?? this.defaults.publicListArgs?.sort,
    };
  }

  private resolvePublicReadOptions(options: PublicReadOptions = {}) {
    return {
      skim: options.skim ?? this.defaults.publicReadOptions?.skim ?? false,
      includePermissions: options.includePermissions ?? this.defaults.publicReadOptions?.includePermissions ?? true,
      tryList: options.tryList ?? this.defaults.publicReadOptions?.tryList ?? true,
      populateAccess: options.populateAccess ?? this.defaults.publicReadOptions?.populateAccess,
      lean: options.lean ?? this.defaults.publicReadOptions?.lean ?? false,
    };
  }

  private resolvePublicUpdateArgs(args: PublicUpdateArgs = {}) {
    return {
      select: args.select ?? this.defaults.publicUpdateArgs?.select,
      populate: args.populate ?? this.defaults.publicUpdateArgs?.populate,
      tasks: args.tasks ?? this.defaults.publicUpdateArgs?.tasks ?? [],
    };
  }

  private resolvePublicUpdateOptions(options: PublicUpdateOptions = {}) {
    return {
      skim: options.skim ?? this.defaults.publicUpdateOptions?.skim ?? false,
      returningAll: options.returningAll ?? this.defaults.publicUpdateOptions?.returningAll ?? true,
      includePermissions: options.includePermissions ?? this.defaults.publicUpdateOptions?.includePermissions ?? true,
      populateAccess: options.populateAccess ?? this.defaults.publicUpdateOptions?.populateAccess ?? 'read',
    };
  }
}
