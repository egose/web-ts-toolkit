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

export class PublicService<TModel = unknown, TVirtuals extends object = Record<never, never>> extends Service<
  TModel,
  TVirtuals
> {
  async _list<
    TSelect extends Projection | undefined = undefined,
    TPopulate extends Populate[] | string | undefined = undefined,
  >(
    filter: Filter<TModel>,
    args?: Omit<PublicListArgs, 'select' | 'populate'> & { select?: TSelect; populate?: TPopulate },
    options?: PublicListOptions,
  ): Promise<ListResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals>> | ErrorResult> {
    const { select, populate, include, sort, skip, limit, page, pageSize, tasks } = this.resolvePublicListArgs(args);
    const { skim, includePermissions, includeFieldPermissions, includeCount, populateAccess, lean } =
      this.resolvePublicListOptions(options);

    const result = await this.find(
      filter,
      { select, populate, include, sort, skip, limit, page, pageSize },
      { skim, includePermissions, includeFieldPermissions, includeCount, populateAccess, lean },
      async (doc, context: ModelHookContext) => {
        doc = toObject(doc);
        return this.decorate(doc, 'list', context);
      },
    );

    if (!result.success) {
      return result as ErrorResult;
    }

    const docs = await this.decorateAll(result.data, 'list', {
      mongooseModel: this.model.mongooseModel,
      modelName: this.modelName,
      operation: 'list',
      resolvedQuery: result.query,
    });
    const transformedDocs = docs.map((row) =>
      this.runTasks(row as Record<string, unknown>, tasks),
    ) as SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals>[];

    return { ...result, data: transformedDocs };
  }

  async _create<
    TSelect extends Projection | undefined = undefined,
    TPopulate extends Populate[] | string | undefined = undefined,
  >(
    data: unknown,
    args?: Omit<PublicCreateArgs, 'select' | 'populate'> & { select?: TSelect; populate?: TPopulate },
    options?: PublicCreateOptions,
  ): Promise<ListResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals>> | ErrorResult> {
    const { select, populate, tasks } = this.resolvePublicCreateArgs(args);
    const { skim, includePermissions, includeFieldPermissions, populateAccess } =
      this.resolvePublicCreateOptions(options);

    // VIRT-04 D6: effective mutation selection carried into internal
    // finalization before evaluation (explicit `select` or all). Public
    // presentation pick after decorate/tasks is preserved below.
    const effectiveSelect = select as Projection | undefined;
    const result = await this.create(
      data as Record<string, unknown> | Record<string, unknown>[],
      { populate, overrides: { effectiveSelect } },
      { skim, includePermissions, includeFieldPermissions, populateAccess },
      async (doc, context: ModelHookContext): Promise<unknown> => {
        let d: Record<string, unknown> = toObject(doc) as Record<string, unknown>;
        d = (await this.decorate(d, 'create', context)) as Record<string, unknown>;
        d = this.runTasks(d, tasks);

        if (select) d = pick(d, [...normalizeSelect(select), ...this.baseFieldsExt]);
        return d;
      },
    );

    if (!result.success) {
      return result as ErrorResult;
    }

    return result as ListResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals>>;
  }

  async _new(
    args?: { select?: string[] },
    options?: { skim?: boolean; includePermissions?: boolean; includeFieldPermissions?: boolean },
  ): Promise<SingleResult<PublicOutput<TModel, TVirtuals>>> {
    return this.new(args, options) as Promise<SingleResult<PublicOutput<TModel, TVirtuals>>>;
  }

  async _read<
    TSelect extends Projection | undefined = undefined,
    TPopulate extends Populate[] | string | undefined = undefined,
  >(
    id: string,
    args?: Omit<PublicReadArgs, 'select' | 'populate'> & { select?: TSelect; populate?: TPopulate },
    options?: PublicReadOptions,
  ): Promise<SingleResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals>> | ErrorResult> {
    const { select, populate, include, tasks } = this.resolvePublicReadArgs(args);
    const { skim, includePermissions, includeFieldPermissions, tryList, populateAccess, lean } =
      this.resolvePublicReadOptions(options);

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
      { skim, includePermissions, includeFieldPermissions, access, populateAccess, lean },
    );

    // Invalid descriptors and terminal policy denial cannot be repaired by list access.
    if (!result.success && (result.code === Codes.BadRequest || result.code === Codes.Forbidden)) return result;

    // if not found, try to get the doc with 'list' access
    if (tryList && (!result.success || !result.data)) {
      const listAllowed = await this.req.macl.isAllowed(this.modelName, 'list');
      if (!listAllowed) {
        return { success: false, kind: 'error', code: Codes.Unauthorized, errors: ['Unauthorized'] };
      }

      access = 'list';

      result = await this.findById(
        id,
        {
          select,
          populate,
          include,
          overrides: { idFilter },
        },
        { skim, includePermissions, includeFieldPermissions, access, populateAccess, lean },
      );
    }

    if (!result.success) {
      return result as ErrorResult;
    }

    let doc = toObject(result.data);
    doc = await this.decorate(doc, access, result.context);
    doc = this.runTasks(doc as Record<string, unknown>, tasks);

    return { ...result, data: doc as SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals> };
  }

  async _readFilter<
    TSelect extends Projection | undefined = undefined,
    TPopulate extends Populate[] | string | undefined = undefined,
  >(
    filter: Filter<TModel>,
    args?: Omit<PublicReadArgs, 'select' | 'populate'> & { select?: TSelect; populate?: TPopulate; sort?: Sort },
    options?: PublicReadOptions,
  ): Promise<SingleResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals>> | ErrorResult> {
    const { select, sort, populate, include, tasks } = this.resolvePublicReadFilterArgs(args);
    const { skim, includePermissions, includeFieldPermissions, tryList, populateAccess, lean } =
      this.resolvePublicReadOptions(options);

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
      { skim, includePermissions, includeFieldPermissions, access, populateAccess, lean },
    );

    // Invalid descriptors and terminal policy denial cannot be repaired by list access.
    if (!result.success && (result.code === Codes.BadRequest || result.code === Codes.Forbidden)) return result;

    // if not found, try to get the doc with 'list' access
    if (tryList && (!result.success || !result.data)) {
      const listAllowed = await this.req.macl.isAllowed(this.modelName, 'list');
      if (!listAllowed) {
        return { success: false, kind: 'error', code: Codes.Unauthorized, errors: ['Unauthorized'] };
      }

      access = 'list';

      result = await this.findOne(
        filter,
        {
          select,
          sort,
          populate,
          include,
          overrides: {},
        },
        { skim, includePermissions, includeFieldPermissions, access, populateAccess, lean },
      );
    }

    if (!result.success) {
      return result as ErrorResult;
    }

    let doc = toObject(result.data);
    doc = await this.decorate(doc, access, result.context);
    doc = this.runTasks(doc as Record<string, unknown>, tasks);

    return { ...result, data: doc as SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals> };
  }

  async _update<
    TSelect extends Projection | undefined = undefined,
    TPopulate extends Populate[] | string | undefined = undefined,
  >(
    id: string,
    data: Record<string, unknown>,
    args?: Omit<PublicUpdateArgs, 'select' | 'populate'> & { select?: TSelect; populate?: TPopulate },
    options?: PublicUpdateOptions,
  ): Promise<SingleResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals>> | ErrorResult> {
    const { select: requestedSelect, populate, tasks } = this.resolvePublicUpdateArgs(args);
    const select = this.resolveEffectiveSelect(requestedSelect);
    const { skim, returningAll, includePermissions, includeFieldPermissions, populateAccess } =
      this.resolvePublicUpdateOptions(options);

    // VIRT-04 D6: effective selection before evaluation — explicit `select`,
    // else `returningAll: false` implicit `Object.keys(data)+_id`, else all.
    // Internal transport via `overrides.effectiveSelect`; presentation pick
    // after decorate/tasks preserved below.
    let effectiveSelect: Projection | undefined;
    if (select) effectiveSelect = select;
    else if (!returningAll) effectiveSelect = [...Object.keys(data), '_id'];
    else effectiveSelect = undefined;
    const result = await this.updateById(
      id,
      data,
      { populate, overrides: { effectiveSelect } },
      { skim, includePermissions, includeFieldPermissions, populateAccess },
      async (doc, context: ModelHookContext): Promise<unknown> => {
        let d: Record<string, unknown> = toObject(doc) as Record<string, unknown>;
        d = (await this.decorate(d, 'update', context)) as Record<string, unknown>;
        d = this.runTasks(d, tasks);

        if (select) d = pick(d, [...normalizeSelect(select), ...this.baseFieldsExt]);
        else if (!returningAll) d = pick(d, [...Object.keys(data), '_id']);

        return d;
      },
    );

    if (!result.success) {
      return result as ErrorResult;
    }

    return result as SingleResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals>>;
  }

  /**
   * With an _id, check update-policy existence then update: terminal denial returns
   * Forbidden, an allowed miss remains Unauthorized, and neither creates a row.
   * Without an _id, use the create path.
   *
   * VIRT-04 D1/D6: both branches keep `operation: 'upsert'` while accesses
   * follow the taken branch (update/read/update vs create/read/create).
   * Effective selection is carried via internal `overrides.effectiveSelect`
   * before evaluation; presentation picks after decorate/tasks are preserved.
   * Internal `updateById`/`create` are called directly (not via `_update`/
   * `_create`) so the initiating operation is not overwritten with the
   * branch name.
   */
  async _upsert<
    TSelect extends Projection | undefined = undefined,
    TPopulate extends Populate[] | string | undefined = undefined,
  >(
    data: Record<string, unknown>,
    args?: Omit<PublicUpsertArgs, 'select' | 'populate'> & { select?: TSelect; populate?: TPopulate },
    options?: PublicUpsertOptions,
  ): Promise<ServiceResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals>> | ErrorResult> {
    const idKey = this.getIdentifier();
    if (idKey !== '_id') {
      return { success: false, kind: 'error', code: Codes.BadRequest, errors: ['not supported custom id field'] };
    }

    const { [idKey]: idVal, ...otherData } = data;
    const upsertId = typeof idVal === 'string' ? idVal : undefined;

    if (upsertId) {
      const existing = await this.exists({ [idKey]: upsertId } as Filter<TModel>, { access: 'update' });
      if (!existing.success) {
        return existing as ErrorResult;
      }

      if (!existing.data) {
        return { success: false, kind: 'error', code: Codes.Unauthorized, errors: ['Unauthorized'] };
      }

      const { select: requestedSelect, populate, tasks } = this.resolvePublicUpdateArgs(args as never);
      const select = this.resolveEffectiveSelect(requestedSelect);
      const { skim, returningAll, includePermissions, includeFieldPermissions, populateAccess } =
        this.resolvePublicUpdateOptions(options as never);
      let effectiveSelect: Projection | undefined;
      if (select) effectiveSelect = select;
      else if (!returningAll) effectiveSelect = [...Object.keys(otherData), '_id'];
      else effectiveSelect = undefined;
      const result = await this.updateById(
        upsertId,
        otherData,
        { populate, overrides: { effectiveSelect, operation: 'upsert' } },
        { skim, includePermissions, includeFieldPermissions, populateAccess },
        async (doc, context: ModelHookContext): Promise<unknown> => {
          let d: Record<string, unknown> = toObject(doc) as Record<string, unknown>;
          d = (await this.decorate(d, 'update', context)) as Record<string, unknown>;
          d = this.runTasks(d, tasks);
          if (select) d = pick(d, [...normalizeSelect(select), ...this.baseFieldsExt]);
          else if (!returningAll) d = pick(d, [...Object.keys(otherData), '_id']);
          return d;
        },
      );
      return result as
        | ServiceResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals>>
        | ErrorResult;
    }

    const { select, populate, tasks } = this.resolvePublicCreateArgs(args as never);
    const { skim, includePermissions, includeFieldPermissions, populateAccess } = this.resolvePublicCreateOptions({
      skim: options?.skim,
      includePermissions: options?.includePermissions,
      includeFieldPermissions: options?.includeFieldPermissions,
      populateAccess: options?.populateAccess,
    });
    const createResult = await this.create(
      otherData as Record<string, unknown>,
      { populate, overrides: { effectiveSelect: select as Projection | undefined, operation: 'upsert' } },
      { skim, includePermissions, includeFieldPermissions, populateAccess },
      async (doc, context: ModelHookContext): Promise<unknown> => {
        let d: Record<string, unknown> = toObject(doc) as Record<string, unknown>;
        d = (await this.decorate(d, 'create', context)) as Record<string, unknown>;
        d = this.runTasks(d, tasks);
        if (select) d = pick(d, [...normalizeSelect(select), ...this.baseFieldsExt]);
        return d;
      },
    );
    return createResult as unknown as
      | ServiceResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals>>
      | ErrorResult;
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
    const includePermissions =
      options.includePermissions ?? this.defaults.publicListOptions?.includePermissions ?? false;
    return {
      skim: options.skim ?? this.defaults.publicListOptions?.skim ?? true,
      includePermissions,
      includeFieldPermissions:
        options.includeFieldPermissions ??
        this.defaults.publicListOptions?.includeFieldPermissions ??
        includePermissions,
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
    const includePermissions =
      options.includePermissions ?? this.defaults.publicCreateOptions?.includePermissions ?? true;
    return {
      skim: options.skim ?? this.defaults.publicCreateOptions?.skim ?? false,
      includePermissions,
      includeFieldPermissions:
        options.includeFieldPermissions ??
        this.defaults.publicCreateOptions?.includeFieldPermissions ??
        includePermissions,
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
    const includePermissions =
      options.includePermissions ?? this.defaults.publicReadOptions?.includePermissions ?? true;
    return {
      skim: options.skim ?? this.defaults.publicReadOptions?.skim ?? false,
      includePermissions,
      includeFieldPermissions:
        options.includeFieldPermissions ??
        this.defaults.publicReadOptions?.includeFieldPermissions ??
        includePermissions,
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
    const includePermissions =
      options.includePermissions ?? this.defaults.publicUpdateOptions?.includePermissions ?? true;
    return {
      skim: options.skim ?? this.defaults.publicUpdateOptions?.skim ?? false,
      returningAll: options.returningAll ?? this.defaults.publicUpdateOptions?.returningAll ?? true,
      includePermissions,
      includeFieldPermissions:
        options.includeFieldPermissions ??
        this.defaults.publicUpdateOptions?.includeFieldPermissions ??
        includePermissions,
      populateAccess: options.populateAccess ?? this.defaults.publicUpdateOptions?.populateAccess ?? 'read',
    };
  }
}
