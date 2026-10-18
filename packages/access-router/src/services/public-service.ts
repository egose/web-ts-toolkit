import { pick } from '@web-ts-toolkit/utils';
import { normalizeSelect, toObject } from '../helpers';
import { copyPermissionsAlias } from '../output/permissions-alias';
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
  PublicSubdocumentListOptions,
  PublicSubdocumentReadOptions,
  PublicSubdocumentCreateOptions,
  PublicSubdocumentMutationOptions,
  SubdocumentModel,
  SubdocumentCreateInput,
  SubdocumentBulkUpdateInput,
} from '../interfaces';
import { Codes } from '../enums';
import { createServiceExecution, deriveServiceExecution, withExecutionHydration } from '../acl/service-execution';
import { assertModelInputComplexity } from '../acl/model-input-admission';
import {
  executeCreate,
  executePreparedExists,
  executePreparedFind,
  executePreparedFindOne,
  executePreparedUpdateOne,
  prepareModelQuery,
  readModelIdentifier,
  resolveModelIdentifier,
} from '../acl/prepared-query';
import {
  assertPublicAdmission,
  assertPublicDefaults,
  pickPublicKeys,
  PublicAdmissionError,
  requestOnlyServiceOptions,
} from '../validation/public-admission';

export class PublicService<TModel = unknown, TVirtuals extends object = Record<never, never>> extends Service<
  TModel,
  TVirtuals
> {
  /** Public dispatch stays request-only even for JS callers and transformed envelopes. */
  override async listSub<S extends string>(
    id: string,
    sub: S,
    options?: PublicSubdocumentListOptions<SubdocumentModel<TModel, S>>,
  ) {
    const admission = this.admitPublicCall({ options });
    if (admission) return admission;
    return super.listSub(id, sub, pickPublicKeys(options, ['filter', 'select']));
  }

  override async readSub<S extends string>(id: string, sub: S, subId: string, options?: PublicSubdocumentReadOptions) {
    const admission = this.admitPublicCall({ options });
    if (admission) return admission;
    return super.readSub(id, sub, subId, pickPublicKeys(options, ['select', 'populate']));
  }

  override async createSub<S extends string>(
    id: string,
    sub: S,
    data: SubdocumentCreateInput,
    options?: PublicSubdocumentCreateOptions,
  ) {
    const admission = this.admitPublicCall({ options, data });
    if (admission) return admission;
    return super.createSub(id, sub, data, pickPublicKeys(options, ['addFirst']));
  }

  override async updateSub<S extends string>(
    id: string,
    sub: S,
    subId: string,
    data: Record<string, unknown>,
    options?: PublicSubdocumentMutationOptions,
  ) {
    const admission = this.admitPublicCall({ options, data });
    if (admission) return admission;
    return super.updateSub(id, sub, subId, data);
  }

  override async bulkUpdateSub<S extends string>(
    id: string,
    sub: S,
    data: SubdocumentBulkUpdateInput | Record<string, unknown>,
    options?: PublicSubdocumentMutationOptions,
  ) {
    const admission = this.admitPublicCall({ options, data });
    if (admission) return admission;
    return super.bulkUpdateSub(id, sub, data);
  }

  override async deleteSub<S extends string>(
    id: string,
    sub: S,
    subId: string,
    options?: PublicSubdocumentMutationOptions,
  ) {
    const admission = this.admitPublicCall({ options });
    if (admission) return admission;
    return super.deleteSub(id, sub, subId);
  }

  async _list<
    TSelect extends Projection | undefined = undefined,
    TPopulate extends Populate[] | string | undefined = undefined,
  >(
    filter: Filter<TModel>,
    args?: Omit<PublicListArgs, 'select' | 'populate'> & { select?: TSelect; populate?: TPopulate },
    options?: PublicListOptions,
  ): Promise<ListResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals>> | ErrorResult> {
    const admission = this.admitPublicCall({ args, options, filter });
    if (admission) return admission;
    const { select, populate, include, sort, skip, limit, page, pageSize, tasks } = this.resolvePublicListArgs(args);
    const { skim, includePermissions, includeFieldPermissions, includeCount, populateAccess } =
      this.resolvePublicListOptions(options);

    try {
      const execution = withExecutionHydration(
        this,
        createServiceExecution(
          this,
          {
            operation: 'list',
            rowAccess: 'list',
            virtualAccess: 'list',
            outputAccess: 'list',
            docPermissionsAccess: 'list',
          },
          requestOnlyServiceOptions({}).authorization,
          'service',
          this.captureRelated({ populate, include }, this.defaults.findArgs),
        ),
        'publicList',
      );
      const query = await prepareModelQuery(this, execution, { kind: 'client-read', filter });
      const result = await executePreparedFind(
        this,
        execution,
        query,
        { select, populate, include, sort, skip, limit, page, pageSize },
        requestOnlyServiceOptions({
          skim,
          includePermissions,
          includeFieldPermissions,
          includeCount,
          populateAccess,
        }),
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
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }
  }

  async _create<
    TSelect extends Projection | undefined = undefined,
    TPopulate extends Populate[] | string | undefined = undefined,
  >(
    data: unknown,
    args?: Omit<PublicCreateArgs, 'select' | 'populate'> & { select?: TSelect; populate?: TPopulate },
    options?: PublicCreateOptions,
  ): Promise<ListResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals>> | ErrorResult> {
    const admission = this.admitPublicCall({ args, options, data });
    if (admission) return admission;
    const { select, populate, tasks } = this.resolvePublicCreateArgs(args);
    const { skim, includePermissions, includeFieldPermissions, populateAccess } =
      this.resolvePublicCreateOptions(options);

    // VIRT-04 D6: effective mutation selection carried into internal
    // finalization before evaluation (explicit `select` or all). Public
    // presentation pick after decorate/tasks is preserved below.
    const effectiveSelect = select as Projection | undefined;
    const result = await this.create(
      data as Record<string, unknown> | Record<string, unknown>[],
      { populate, select: effectiveSelect },
      requestOnlyServiceOptions({ skim, includePermissions, includeFieldPermissions, populateAccess }),
      async (doc, context: ModelHookContext): Promise<unknown> => {
        let d: Record<string, unknown> = toObject(doc) as Record<string, unknown>;
        d = (await this.decorate(d, 'create', context)) as Record<string, unknown>;
        d = this.runTasks(d, tasks);

        if (select) d = copyPermissionsAlias(d, pick(d, [...normalizeSelect(select), ...this.baseFieldsExt]));
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
    options?: {
      /** @deprecated Compatibility no-op. Authorization, document grants, virtuals and decoration always run. */
      skim?: boolean;
      includePermissions?: boolean;
      includeFieldPermissions?: boolean;
    },
  ): Promise<SingleResult<PublicOutput<TModel, TVirtuals>> | ErrorResult> {
    const admission = this.admitPublicCall({ args, options });
    if (admission) return admission;
    return this.new(
      pickPublicKeys(args, ['select']),
      requestOnlyServiceOptions(pickPublicKeys(options, ['skim', 'includePermissions', 'includeFieldPermissions'])),
    ) as Promise<SingleResult<PublicOutput<TModel, TVirtuals>> | ErrorResult>;
  }

  async _read<
    TSelect extends Projection | undefined = undefined,
    TPopulate extends Populate[] | string | undefined = undefined,
  >(
    id: string,
    args?: Omit<PublicReadArgs, 'select' | 'populate'> & { select?: TSelect; populate?: TPopulate },
    options?: PublicReadOptions,
  ): Promise<SingleResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals>> | ErrorResult> {
    const admission = this.admitPublicCall({ args, options });
    if (admission) return admission;
    const { select, populate, include, tasks } = this.resolvePublicReadArgs(args);
    const { skim, includePermissions, includeFieldPermissions, tryList, populateAccess } =
      this.resolvePublicReadOptions(options);

    try {
      let access: FindAccess = 'read';
      let execution = withExecutionHydration(
        this,
        createServiceExecution(
          this,
          {
            operation: 'read',
            rowAccess: access,
            virtualAccess: access,
            outputAccess: access,
            docPermissionsAccess: access,
          },
          requestOnlyServiceOptions({}).authorization,
          'service',
          this.captureRelated({ populate, include }, this.defaults.findOneArgs),
        ),
        'publicRead',
      );
      const identifier = await resolveModelIdentifier(this, execution, id);
      const query = await prepareModelQuery(this, execution, {
        kind: 'client-read',
        filter: readModelIdentifier(this, execution, identifier),
      });
      let result = await executePreparedFindOne(
        this,
        execution,
        query,
        { select, populate, include },
        requestOnlyServiceOptions({ skim, includePermissions, includeFieldPermissions, access, populateAccess }),
      );

      // Invalid descriptors and terminal policy denial cannot be repaired by list access.
      if (!result.success && (result.code === Codes.BadRequest || result.code === Codes.Forbidden)) return result;

      // if not found, try to get the doc with 'list' access
      if (tryList && (!result.success || !result.data)) {
        const listAllowed = await this.requestCore.isAllowed(this.modelName, 'list');
        if (!listAllowed) {
          return { success: false, kind: 'error', code: Codes.Unauthorized, errors: ['Unauthorized'] };
        }

        access = 'list';

        execution = deriveServiceExecution(this, execution, {
          operation: 'read',
          rowAccess: access,
          virtualAccess: access,
          outputAccess: access,
          docPermissionsAccess: access,
        });
        const fallback = await prepareModelQuery(this, execution, {
          kind: 'client-read',
          filter: readModelIdentifier(this, execution, identifier),
        });
        result = await executePreparedFindOne(
          this,
          execution,
          fallback,
          { select, populate, include },
          requestOnlyServiceOptions({
            skim,
            includePermissions,
            includeFieldPermissions,
            access,
            populateAccess,
          }),
        );
      }

      if (!result.success) {
        return result as ErrorResult;
      }

      let doc = toObject(result.data);
      doc = await this.decorate(doc, access, result.context);
      doc = this.runTasks(doc as Record<string, unknown>, tasks);

      return { ...result, data: doc as SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals> };
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }
  }

  async _readFilter<
    TSelect extends Projection | undefined = undefined,
    TPopulate extends Populate[] | string | undefined = undefined,
  >(
    filter: Filter<TModel>,
    args?: Omit<PublicReadArgs, 'select' | 'populate'> & { select?: TSelect; populate?: TPopulate; sort?: Sort },
    options?: PublicReadOptions,
  ): Promise<SingleResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals>> | ErrorResult> {
    const admission = this.admitPublicCall({ args, options, filter });
    if (admission) return admission;
    const { select, sort, populate, include, tasks } = this.resolvePublicReadFilterArgs(args);
    const { skim, includePermissions, includeFieldPermissions, tryList, populateAccess } =
      this.resolvePublicReadOptions(options);

    let access: FindAccess = 'read';

    try {
      let execution = withExecutionHydration(
        this,
        createServiceExecution(
          this,
          {
            operation: 'read',
            rowAccess: access,
            virtualAccess: access,
            outputAccess: access,
            docPermissionsAccess: access,
          },
          requestOnlyServiceOptions({}).authorization,
          'service',
          this.captureRelated({ populate, include }, this.defaults.findOneArgs),
        ),
        'publicRead',
      );
      const query = await prepareModelQuery(this, execution, { kind: 'client-read', filter });
      let result = await executePreparedFindOne(
        this,
        execution,
        query,
        {
          select,
          sort,
          populate,
          include,
        },
        requestOnlyServiceOptions({ skim, includePermissions, includeFieldPermissions, access, populateAccess }),
      );

      // Invalid descriptors and terminal policy denial cannot be repaired by list access.
      if (!result.success && (result.code === Codes.BadRequest || result.code === Codes.Forbidden)) return result;

      // if not found, try to get the doc with 'list' access
      if (tryList && (!result.success || !result.data)) {
        const listAllowed = await this.requestCore.isAllowed(this.modelName, 'list');
        if (!listAllowed) {
          return { success: false, kind: 'error', code: Codes.Unauthorized, errors: ['Unauthorized'] };
        }

        access = 'list';

        execution = deriveServiceExecution(this, execution, {
          operation: 'read',
          rowAccess: access,
          virtualAccess: access,
          outputAccess: access,
          docPermissionsAccess: access,
        });
        const fallback = await prepareModelQuery(this, execution, { kind: 'client-read', filter });
        result = await executePreparedFindOne(
          this,
          execution,
          fallback,
          {
            select,
            sort,
            populate,
            include,
          },
          requestOnlyServiceOptions({ skim, includePermissions, includeFieldPermissions, access, populateAccess }),
        );
      }

      if (!result.success) {
        return result as ErrorResult;
      }

      let doc = toObject(result.data);
      doc = await this.decorate(doc, access, result.context);
      doc = this.runTasks(doc as Record<string, unknown>, tasks);

      return { ...result, data: doc as SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals> };
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }
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
    const admission = this.admitPublicCall({ args, options, data });
    if (admission) return admission;
    const { select: requestedSelect, populate, tasks } = this.resolvePublicUpdateArgs(args);
    const select = this.resolveEffectiveSelect(requestedSelect);
    const { skim, returningAll, includePermissions, includeFieldPermissions, populateAccess } =
      this.resolvePublicUpdateOptions(options);

    // VIRT-04 D6: effective selection before evaluation — explicit `select`,
    // else `returningAll: false` implicit `Object.keys(data)+_id`, else all.
    // Ordinary internal selection; presentation pick
    // after decorate/tasks preserved below.
    let effectiveSelect: Projection | undefined;
    if (select) effectiveSelect = select;
    else if (!returningAll) effectiveSelect = [...Object.keys(data), '_id'];
    else effectiveSelect = undefined;
    const result = await this.updateById(
      id,
      data,
      { populate, select: effectiveSelect },
      requestOnlyServiceOptions({ skim, includePermissions, includeFieldPermissions, populateAccess }),
      async (doc, context: ModelHookContext): Promise<unknown> => {
        let d: Record<string, unknown> = toObject(doc) as Record<string, unknown>;
        d = (await this.decorate(d, 'update', context)) as Record<string, unknown>;
        d = this.runTasks(d, tasks);

        if (select) d = copyPermissionsAlias(d, pick(d, [...normalizeSelect(select), ...this.baseFieldsExt]));
        else if (!returningAll) d = copyPermissionsAlias(d, pick(d, [...Object.keys(data), '_id']));

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
   * Effective selection is carried via ordinary internal `select`
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
    const admission = this.admitPublicCall({ args, options, data });
    if (admission) return admission;
    const idKey = this.getIdentifier();
    if (idKey !== '_id') {
      return { success: false, kind: 'error', code: Codes.BadRequest, errors: ['not supported custom id field'] };
    }

    const { [idKey]: idVal, ...otherData } = data;
    const upsertId = typeof idVal === 'string' ? idVal : undefined;

    try {
      const publicDefaults = upsertId ? this.defaults.publicUpdateArgs : this.defaults.publicCreateArgs;
      const execution = createServiceExecution(
        this,
        {
          operation: 'upsert',
          rowAccess: 'update',
          virtualAccess: 'update',
          outputAccess: 'read',
          docPermissionsAccess: 'update',
        },
        requestOnlyServiceOptions({}).authorization,
        'service',
        this.captureRelated(
          { populate: args?.populate ?? publicDefaults?.populate },
          upsertId ? this.defaults.updateOneArgs : this.defaults.createArgs,
        ),
      );
      if (upsertId) {
        const identifier = await resolveModelIdentifier(this, execution, upsertId);
        const query = await prepareModelQuery(this, execution, {
          kind: 'mutation-lookup',
          filter: readModelIdentifier(this, execution, identifier),
        });
        const existing = await executePreparedExists(this, execution, query);
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
        const result = await executePreparedUpdateOne(
          this,
          execution,
          query,
          otherData,
          { populate, select: effectiveSelect },
          requestOnlyServiceOptions({ skim, includePermissions, includeFieldPermissions, populateAccess }),
          async (doc, context: ModelHookContext): Promise<unknown> => {
            let d: Record<string, unknown> = toObject(doc) as Record<string, unknown>;
            d = (await this.decorate(d, 'update', context)) as Record<string, unknown>;
            d = this.runTasks(d, tasks);
            if (select) d = copyPermissionsAlias(d, pick(d, [...normalizeSelect(select), ...this.baseFieldsExt]));
            else if (!returningAll) d = copyPermissionsAlias(d, pick(d, [...Object.keys(otherData), '_id']));
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
      const createExecution = deriveServiceExecution(
        this,
        execution,
        { operation: 'upsert', virtualAccess: 'create', outputAccess: 'read', docPermissionsAccess: 'create' },
        'create',
      );
      const createResult = await executeCreate(
        this,
        createExecution,
        otherData as Record<string, unknown>,
        { populate, select: select as Projection | undefined },
        requestOnlyServiceOptions({ skim, includePermissions, includeFieldPermissions, populateAccess }),
        async (doc, context: ModelHookContext): Promise<unknown> => {
          let d: Record<string, unknown> = toObject(doc) as Record<string, unknown>;
          d = (await this.decorate(d, 'create', context)) as Record<string, unknown>;
          d = this.runTasks(d, tasks);
          if (select) d = copyPermissionsAlias(d, pick(d, [...normalizeSelect(select), ...this.baseFieldsExt]));
          return d;
        },
      );
      return createResult as unknown as
        | ServiceResult<SelectedPopulatedPublicOutput<TModel, TSelect, TPopulate, TVirtuals>>
        | ErrorResult;
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }
  }

  async _delete(id: string): Promise<SingleResult<unknown> | ErrorResult> {
    const result = await this.delete(id);
    return result;
  }

  async _distinct(field: string, options: DistinctArgs<TModel> = {}): Promise<ListResult<unknown> | ErrorResult> {
    const admission = this.admitPublicCall({ args: options });
    if (admission) return admission;
    const result = await this.distinct(field, pickPublicKeys(options, ['filter']));
    return result;
  }

  async _count(filter: Filter<TModel>, access: BaseFilterAccess = 'list'): Promise<SingleResult<number> | ErrorResult> {
    const admission = this.admitPublicCall({ filter, options: access });
    if (admission) return admission;
    const result = await this.count(filter, access);
    return result;
  }

  private admitPublicCall(envelope: unknown): ErrorResult | null {
    try {
      if (envelope && typeof envelope === 'object' && 'data' in envelope)
        assertModelInputComplexity(envelope.data, this.getRequestComplexity());
      assertPublicAdmission(envelope);
      assertPublicDefaults(this.defaults);
      return null;
    } catch (error) {
      if (error instanceof PublicAdmissionError) return error.result;
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }
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
