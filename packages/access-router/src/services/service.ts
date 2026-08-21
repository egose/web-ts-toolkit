import { Document } from 'mongoose';
import {
  castArray,
  compact,
  forEach,
  get,
  isArray,
  isBoolean,
  isFunction,
  isNil,
  isPlainObject,
  omit,
  pick,
  set,
  uniq,
  uniqBy,
} from '@web-ts-toolkit/utils';
import { diff } from 'just-diff';
import Model from '../model';
import { getModelOption, getModelOptions } from '../options';
import {
  getDocPermissions,
  genPagination,
  isFieldAllowed,
  isValidFieldPath,
  mapWithConcurrencyLimit,
  normalizeSelect,
  populateDoc,
  toObject,
  validateSortFields,
} from '../helpers';
import { RequestConcurrencyScheduler } from '../helpers/concurrency';
import {
  Filter,
  Include,
  ModelDocument,
  ModelRouterOptions,
  ModelHookContext,
  SubPopulate,
  DistinctArgs,
  Defaults,
  Populate,
  ModelRequest,
  FindArgs,
  FindOptions,
  FindOneArgs,
  FindOneOptions,
  FindByIdArgs,
  FindByIdOptions,
  CreateArgs,
  CreateOptions,
  ErrorResult,
  UpdateOneArgs,
  UpdateOneOptions,
  UpdateByIdArgs,
  UpsertArgs,
  UpdateByIdOptions,
  UpsertOptions,
  BaseFilterAccess,
  ExistsOptions,
  ListResult,
  ServiceResult,
  SingleResult,
  SubQueryEntry,
  FindAccess,
  SubdocumentBulkUpdateInput,
  SubdocumentCreateInput,
  SubdocumentCreateOptions,
  SubdocumentId,
  SubdocumentListOptions,
  SubdocumentName,
  SubdocumentParentArgs,
  SubdocumentParentOptions,
  SubdocumentReadOptions,
} from '../interfaces';
import { Codes, StatusCodes } from '../enums';
import { Base } from './base';
import type { OpLogContext } from '../logger-helpers';
import { debug as debugLog, summarizeFilter } from '../logger-helpers';
import { isDocument } from '../lib';
import {
  bulkUpdateSub as bulkUpdateSubImpl,
  createSub as createSubImpl,
  deleteSub as deleteSubImpl,
  getParentDoc as getParentDocImpl,
  listSub as listSubImpl,
  readSub as readSubImpl,
  updateSub as updateSubImpl,
} from './model-subdocument-service';
import {
  resolveCreateArgs,
  resolveCreateOptions,
  resolveExistsOptions,
  resolveFindArgs,
  resolveFindByIdArgs,
  resolveFindByIdOptions,
  resolveFindOneArgs,
  resolveFindOneOptions,
  resolveFindOptions,
  resolveUpdateByIdArgs,
  resolveUpdateByIdOptions,
  resolveUpdateOneArgs,
  resolveUpdateOneOptions,
  resolveUpsertArgs,
  resolveUpsertOptions,
} from './model-service-defaults';

type ServiceHookContext = ModelHookContext & {
  diff?(doc: Document): void;
  fieldPermissionAccess?: {
    readIds?: Set<string>;
    updateIds?: Set<string>;
  };
};

const assertModelDocument = <TModel>(
  value: unknown,
  modelName: string,
  hookName: 'transform' | 'afterPersist',
): ModelDocument<TModel> => {
  if (isDocument(value)) {
    return value as unknown as ModelDocument<TModel>;
  }

  throw new Error(`${hookName} hook for model=${modelName} must return a Mongoose document instance`);
};

export class Service<TModel = unknown> extends Base<TModel> {
  protected model: Model;
  protected options: ModelRouterOptions<TModel>;
  public defaults: Defaults<TModel>;
  protected baseFields: string[];
  protected baseFieldsExt: string[];

  public findRawParentDoc(args: {
    filter: Filter<TModel>;
    select: string;
    populate: unknown;
    lean: boolean;
  }): ReturnType<Model['findOne']> {
    return this.model.findOne({
      ...args,
      filter: args.filter as unknown as Filter,
      populate: args.populate as string | Populate[],
    });
  }

  private asServiceHookContext(context: ModelHookContext): ServiceHookContext {
    return context as ServiceHookContext;
  }

  private beginOp(
    op: string,
    filter: unknown,
    extra?: Omit<OpLogContext, 'op' | 'startedAt' | 'filterKeyValueCount'>,
  ): number {
    const startedAt = Date.now();
    debugLog({
      op,
      modelName: this.modelName,
      filterKeyValueCount: summarizeFilter(filter).filterKeyValueCount,
      startedAt,
      ...(extra ?? {}),
    } as OpLogContext);
    return startedAt;
  }

  private completeOp(
    op: string,
    startedAt: number,
    resultCode: string | number,
    filter: unknown,
    extra?: Omit<OpLogContext, 'op' | 'startedAt' | 'durationMs' | 'resultCode' | 'filterKeyValueCount'>,
  ): void {
    debugLog({
      op,
      modelName: this.modelName,
      filterKeyValueCount: summarizeFilter(filter).filterKeyValueCount,
      durationMs: Date.now() - startedAt,
      resultCode,
      ...(extra ?? {}),
    } as OpLogContext);
  }

  constructor(req: ModelRequest, modelName: string) {
    super(req, modelName);

    this.model = new Model(modelName);
    this.options = getModelOptions<TModel>(modelName);
    this.defaults = this.options.defaults || {};
    this.baseFields = ['_id'];
    this.baseFieldsExt = this.baseFields.concat(this.options.documentPermissionField);
  }

  public async findOne(
    filter: Filter<TModel>,
    args?: FindOneArgs<TModel>,
    options?: FindOneOptions,
  ): Promise<SingleResult<TModel> | ErrorResult> {
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

    const { select, sort, populate, include, overrides } = this.resolveFindOneArgs(args);
    const { skim, includePermissions, access, populateAccess, lean } = this.resolveFindOneOptions(options);

    const { filter: overrideFilter, select: overrideSelect, populate: overridePopulate } = overrides ?? {};

    let parsedFilter: Filter<TModel>;
    try {
      parsedFilter = await this.parseClientData(filter);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }

    let [_filter, _select, _populate, allowedSortFields] = await Promise.all([
      overrideFilter || this.genFilter(access, parsedFilter),
      overrideSelect || this.genQuerySelect(access, select),
      overridePopulate || this.genPopulate(populateAccess || access, populate),
      this.genAllowedFields({}, access, this.baseFieldsExt),
    ]);

    const { includes, includeLocalFields, includePaths } = this.processInclude(include);
    const finalSelect = normalizeSelect(_select).concat(includeLocalFields);

    const query = {
      filter: _filter,
      select: finalSelect,
      sort,
      populate: _populate,
    };

    const startedAt = this.beginOp('findOne', _filter, {
      sort,
      selectCount: finalSelect.length,
      populateCount: Array.isArray(_populate) ? _populate.length : _populate ? 1 : 0,
    });

    if (_filter === false) {
      this.completeOp('findOne', startedAt, Codes.Forbidden, _filter);
      return { success: false, kind: 'error', code: Codes.Forbidden, query };
    }

    const sortErrors = validateSortFields(sort, allowedSortFields);
    if (sortErrors.length > 0) {
      this.completeOp('findOne', startedAt, Codes.BadRequest, _filter);
      return { success: false, kind: 'error', code: Codes.BadRequest, errors: sortErrors, query };
    }

    let doc = await this.model.findOne({ ...query, lean });
    if (!doc) {
      this.completeOp('findOne', startedAt, Codes.NotFound, _filter);
      return { success: false, kind: 'error', code: Codes.NotFound, query };
    }

    const context: ModelHookContext = {
      mongooseModel: this.model.model,
      modelName: this.modelName,
      operation: access,
      originalDocumentSnapshot: toObject(doc),
      resolvedQuery: query,
    };

    try {
      doc = await this.includeDocs(doc, includes);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) {
        this.completeOp('findOne', startedAt, result.code, _filter);
        return { ...result, query };
      }
      throw error;
    }

    let includeDocPermissions = includePermissions;
    if (!includeDocPermissions && !skim) {
      includeDocPermissions = this.checkIfModelPermissionExists([access, 'read', 'update']);
    }
    if (includeDocPermissions) doc = await this.addDocPermissions(doc, access, context);
    if (includePermissions) doc = await this.addFieldPermissions(doc, access, context);
    doc = await this.trimOutputFields(
      doc,
      access,
      this.baseFieldsExt.concat(includePaths, normalizeSelect(overrideSelect)),
    );
    if (!includePermissions) doc = this.addEmptyPermissions(doc);

    this.completeOp('findOne', startedAt, Codes.Success, _filter);
    return { success: true, kind: 'single', code: Codes.Success, data: doc as TModel, query, context };
  }

  public async findById(
    id: string,
    args?: FindByIdArgs<TModel>,
    options?: FindByIdOptions,
  ): Promise<SingleResult<TModel> | ErrorResult> {
    const { select, populate, include, overrides } = this.resolveFindByIdArgs(args);
    const { skim, includePermissions, access, populateAccess, lean } = this.resolveFindByIdOptions(options);

    const { select: overrideSelect, populate: overridePopulate, idFilter: overrideIdFilter } = overrides ?? {};
    const filter = overrideIdFilter || (await this.genIDFilter(id));

    return this.findOne(
      filter,
      {
        select,
        populate,
        include,
        overrides: {
          select: overrideSelect,
          populate: overridePopulate,
        },
      },
      { skim, includePermissions, access, populateAccess, lean },
    );
  }

  public async find(
    filter: Filter<TModel>,
    args?: FindArgs<TModel>,
    options?: FindOptions,
    decorate?: (doc: unknown, context?: ModelHookContext) => unknown,
  ): Promise<ListResult<TModel> | ErrorResult> {
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

    const { select, populate, include, sort, skip, limit, page, pageSize, overrides } = this.resolveFindArgs(args);
    const { skim, includePermissions, includeCount, populateAccess, lean } = this.resolveFindOptions(options);

    const { filter: overrideFilter, select: overrideSelect, populate: overridePopulate } = overrides ?? {};

    let parsedFilter: Filter<TModel>;
    try {
      parsedFilter = await this.parseClientData(filter);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }

    const [_filter, _select, _populate, pagination, allowedSortFields] = await Promise.all([
      overrideFilter || this.genFilter('list', parsedFilter),
      overrideSelect || this.genQuerySelect('list', select),
      overridePopulate || this.genPopulate(populateAccess, populate),
      genPagination({ skip, limit, page, pageSize }, this.options.listHardLimit),
      this.genAllowedFields({}, 'list', this.baseFieldsExt),
    ]);

    const finalSelect = normalizeSelect(_select);

    // filter populated fields based on select fields
    const filteredPopulate =
      isArray(finalSelect) && isArray(_populate)
        ? _populate.filter((p) => finalSelect.includes(p.path.split('.')[0]))
        : _populate;

    const { includes, includeLocalFields, includePaths } = this.processInclude(include);

    const query = {
      filter: _filter,
      select: finalSelect.concat(includeLocalFields),
      populate: filteredPopulate,
      sort,
      ...pagination,
    };

    const startedAt = this.beginOp('find', _filter, {
      sort,
      skip: pagination.skip,
      limit: pagination.limit,
      selectCount: finalSelect.concat(includeLocalFields).length,
      populateCount: Array.isArray(filteredPopulate) ? filteredPopulate.length : filteredPopulate ? 1 : 0,
    });

    if (_filter === false) {
      this.completeOp('find', startedAt, Codes.Forbidden, _filter);
      return { success: false, kind: 'error', code: Codes.Forbidden, query };
    }

    const sortErrors = validateSortFields(sort, allowedSortFields);
    if (sortErrors.length > 0) {
      this.completeOp('find', startedAt, Codes.BadRequest, _filter);
      return { success: false, kind: 'error', code: Codes.BadRequest, errors: sortErrors, query };
    }

    let docs = await this.model.find({
      ...query,
      hardLimit: this.options.listHardLimit,
      lean,
    });

    const contexts: ModelHookContext[] = docs.map((doc) => ({
      mongooseModel: this.model.model,
      modelName: this.modelName,
      operation: 'list',
      originalDocumentSnapshot: toObject(doc),
      resolvedQuery: query,
    }));

    const _decorate: (...args: unknown[]) => unknown = isFunction(decorate) ? decorate : (v) => v;

    try {
      docs = await this.includeDocs(docs, includes);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) {
        this.completeOp('find', startedAt, result.code, _filter);
        return { ...result, query };
      }
      throw error;
    }

    const fieldPermissionAccess = includePermissions
      ? await this.getFieldPermissionAccess(docs.map((doc) => doc._id))
      : undefined;

    docs = await Promise.all(
      docs.map(async (doc, i) => {
        this.asServiceHookContext(contexts[i]).fieldPermissionAccess = fieldPermissionAccess;

        let includeDocPermissions = includePermissions;
        if (!includeDocPermissions && !skim) {
          includeDocPermissions = this.checkIfModelPermissionExists(['list', 'read', 'update']);
        }
        if (includeDocPermissions) doc = await this.addDocPermissions(doc, 'list', contexts[i]);
        if (includePermissions) doc = await this.addFieldPermissions(doc, 'list', contexts[i]);
        doc = await this.trimOutputFields(
          doc,
          'list',
          this.baseFieldsExt.concat(includePaths, normalizeSelect(overrideSelect)),
        );
        doc = await _decorate(doc, contexts[i]);
        if (!includePermissions) doc = this.addEmptyPermissions(doc);

        return doc;
      }),
    );

    this.completeOp('find', startedAt, Codes.Success, _filter);
    return {
      success: true,
      kind: 'list',
      code: Codes.Success,
      data: docs as TModel[],
      count: docs.length,
      totalCount: includeCount ? await this.model.countDocuments(_filter) : null,
      query,
      contexts,
    };
  }

  public async create(
    data: Record<string, unknown> | Record<string, unknown>[],
    args?: CreateArgs,
    options?: CreateOptions,
    decorate?: (doc: unknown, context?: ModelHookContext) => unknown,
  ): Promise<ListResult<TModel> | ErrorResult> {
    const { populate } = this.resolveCreateArgs(args);
    const { skim, includePermissions, populateAccess } = this.resolveCreateOptions(options);

    const isArr = Array.isArray(data);
    let dataArr = isArr ? data : [data];
    const { maxBulkItems, maxBulkConcurrency } = this.getRequestComplexity();
    if (dataArr.length > maxBulkItems) {
      return {
        success: false,
        kind: 'error',
        code: Codes.BadRequest,
        errors: [{ detail: `Bulk create exceeds maximum item count of ${maxBulkItems}` }],
      };
    }

    const parseErrors: Array<{ index: number; code: ErrorResult['code']; errors: unknown[] }> = [];
    const parseScheduler = new RequestConcurrencyScheduler(maxBulkConcurrency);
    try {
      const parsedData = await parseScheduler.map(dataArr, async (d, index) => {
        try {
          return await this.parseClientData(d, parseScheduler, true);
        } catch (error) {
          const result = this.getClientRequestErrorResult(error);
          if (!result) throw error;
          parseErrors.push({
            index,
            code: result.code,
            errors: (result.errors ?? []).map((issue) => this.formatBulkValidationIssue(issue, isArr ? index : null)),
          });
          return undefined;
        }
      });

      if (parseErrors.length > 0) {
        const sortedErrors = parseErrors.slice().sort((a, b) => a.index - b.index);
        return {
          success: false,
          kind: 'error',
          code: sortedErrors[0]?.code ?? Codes.BadRequest,
          errors: sortedErrors.flatMap((entry) => entry.errors),
        };
      }

      dataArr = parsedData as Record<string, unknown>[];
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }

    const resolvedPopulate = populate ? await this.genPopulate(populateAccess, populate) : [];

    const contexts: ModelHookContext[] = [];

    // ARF-05: validate every admitted item with bounded concurrency and
    // collect per-item errors in stable input-index order. The previous
    // implementation used a single shared `validationError` and skipped
    // remaining items once any worker failed, which made the winning item
    // nondeterministic under concurrency > 1 and dropped errors from other
    // invalid items.
    const validationErrors: Array<{ index: number; errors: unknown[] }> = [];
    const validationItems = await mapWithConcurrencyLimit(dataArr, maxBulkConcurrency, async (item, index) => {
      const context: ModelHookContext = {
        mongooseModel: this.model.model,
        modelName: this.modelName,
        operation: 'create',
        originalData: item,
        resolvedQuery: resolvedPopulate.length > 0 ? { populate: resolvedPopulate } : {},
      };

      const allowedFields = await this.genAllowedFields(item, 'create');
      const allowedData = pick(item, allowedFields);
      context.allowedFields = allowedFields;
      context.allowedData = allowedData;

      const validated = await this.validate(allowedData, 'create', context);
      if (isBoolean(validated)) {
        if (!validated) {
          validationErrors.push({ index, errors: [] });
          return undefined;
        }
      } else if (isArray(validated)) {
        if (validated.length > 0) {
          validationErrors.push({
            index,
            errors: isArr ? validated.map((issue) => this.formatBulkValidationIssue(issue, index)) : validated,
          });
          return undefined;
        }
      }

      contexts[index] = context;
      return allowedData;
    });

    if (validationErrors.length > 0) {
      const aggregate = validationErrors
        .slice()
        .sort((a, b) => a.index - b.index)
        .flatMap((entry) => entry.errors);

      if (isArr) {
        return { success: false, kind: 'error', code: Codes.BadRequest, errors: aggregate };
      }
      const single = validationErrors[0];
      return {
        success: false,
        kind: 'error',
        code: Codes.BadRequest,
        errors: single?.errors ?? [],
      };
    }

    const items = await mapWithConcurrencyLimit(validationItems, maxBulkConcurrency, async (allowedData, index) => {
      const preparedData = await this.prepare(allowedData, 'create', contexts[index]);
      contexts[index].preparedData = preparedData;
      return preparedData;
    });

    const _decorate: (...args: unknown[]) => unknown = isFunction(decorate) ? decorate : (v) => v;

    const createdDocs = (await this.model.create(items)) as Array<ModelDocument<TModel>>;
    const docs = await mapWithConcurrencyLimit(createdDocs, maxBulkConcurrency, async (doc, index) => {
      contexts[index].currentDocument = doc;
      doc = assertModelDocument<TModel>(
        await this.afterPersist(doc, 'create', contexts[index]),
        this.modelName,
        'afterPersist',
      );
      contexts[index].currentDocument = doc;
      contexts[index].finalDocumentSnapshot = doc.toObject({ virtuals: false }) as Record<string, unknown>;
      let includeDocPermissions = includePermissions;
      if (!includeDocPermissions && !skim) {
        includeDocPermissions = this.checkIfModelPermissionExists(['create', 'read', 'update']);
      }
      if (includeDocPermissions) doc = await this.addDocPermissions(doc, 'create', contexts[index]);
      if (includePermissions) doc = await this.addFieldPermissions(doc, 'read', contexts[index]);
      if (resolvedPopulate.length > 0) await populateDoc(doc as Document, resolvedPopulate);
      doc = await this.trimOutputFields(doc, 'read', this.baseFieldsExt);
      let outputDoc = await _decorate(doc, contexts[index]);
      if (!includePermissions) outputDoc = this.addEmptyPermissions(outputDoc);

      return outputDoc;
    });

    return {
      success: true,
      kind: 'list',
      code: Codes.Created,
      data: docs as TModel[],
      input: items,
      count: docs.length,
    };
  }

  private formatBulkValidationIssue(issue: unknown, index: number | null) {
    if (!issue || typeof issue !== 'object') {
      return {
        detail: typeof issue === 'string' && issue.length > 0 ? issue : 'Bad Request',
        ...(index === null ? {} : { pointer: `#/${index}` }),
      };
    }

    const typedIssue = issue as { detail?: string; message?: string; pointer?: string; path?: Array<string | number> };
    const detail = typedIssue.detail ?? typedIssue.message ?? 'Bad Request';

    if (index === null) {
      return typedIssue.pointer || typedIssue.path
        ? {
            detail,
            ...(typedIssue.pointer ? { pointer: typedIssue.pointer } : {}),
          }
        : { detail };
    }

    if (typedIssue.pointer?.startsWith('#/')) {
      return { ...typedIssue, detail, pointer: `#/${index}${typedIssue.pointer.slice(1)}` };
    }

    if (typedIssue.path) {
      return { ...typedIssue, detail, pointer: `#/${[index, ...typedIssue.path].join('/')}` };
    }

    return { ...typedIssue, detail, pointer: `#/${index}` };
  }

  public async new(
    args?: { select?: string[] },
    options?: { skim?: boolean; includePermissions?: boolean },
  ): Promise<SingleResult<TModel>> {
    const { skim, includePermissions } = options ?? {};
    const data = await this.model.new();

    let doc: unknown = data;
    doc = await this.trimOutputFields(doc, 'create', this.baseFieldsExt);

    let includeDocPermissions = includePermissions;
    if (!includeDocPermissions && !skim) {
      includeDocPermissions = this.checkIfModelPermissionExists(['create', 'read', 'update']);
    }
    if (includeDocPermissions) doc = await this.addDocPermissions(doc, 'create', {} as ModelHookContext);
    if (!includePermissions) doc = this.addEmptyPermissions(doc);

    return {
      success: true,
      kind: 'single',
      code: Codes.Success,
      data: doc as TModel,
    };
  }

  public async updateOne(
    filter: Filter<TModel>,
    data: Record<string, unknown>,
    args?: UpdateOneArgs<TModel>,
    options?: UpdateOneOptions,
    decorate?: (doc: unknown, context?: ModelHookContext) => unknown,
  ): Promise<SingleResult<TModel> | ErrorResult> {
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

    const { populate, overrides } = this.resolveUpdateOneArgs(args);
    const { skim, includePermissions, populateAccess } = this.resolveUpdateOneOptions(options);
    const { filter: overrideFilter, populate: overridePopulate } = overrides ?? {};

    const [_filter, _populate] = await Promise.all([
      overrideFilter || this.genFilter('update', filter),
      overridePopulate || this.genPopulate(populateAccess, populate),
    ]);

    const query = { filter: _filter, populate: _populate };

    const startedAt = this.beginOp('updateOne', _filter, {
      populateCount: Array.isArray(_populate) ? _populate.length : _populate ? 1 : 0,
    });

    if (_filter === false) {
      this.completeOp('updateOne', startedAt, Codes.Forbidden, _filter);
      return { success: false, kind: 'error', code: Codes.Forbidden, query };
    }

    let doc = (await this.model.findOne({ filter: _filter })) as ModelDocument<TModel> | null;
    if (!doc) {
      this.completeOp('updateOne', startedAt, Codes.NotFound, _filter);
      return { success: false, kind: 'error', code: Codes.NotFound, query };
    }

    const context: ModelHookContext = {
      mongooseModel: this.model.model,
      modelName: this.modelName,
      operation: 'update',
      resolvedQuery: query,
    };

    try {
      data = await this.parseClientData(data);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) {
        this.completeOp('updateOne', startedAt, result.code, _filter);
        return result;
      }
      throw error;
    }

    // see https://mongoosejs.com/docs/api/document.html#Document.prototype.toObject()
    context.originalDocumentSnapshot = doc.toObject({ virtuals: false }) as Record<string, unknown>;
    context.originalData = data;

    doc = await this.addDocPermissions(doc, 'update', context);

    context.docPermissions = this.getDocPermissions(doc) as Record<string, unknown>;
    context.currentDocument = doc;

    const allowedFields = await this.genAllowedFields(doc, 'update');
    const allowedData = pick(data, allowedFields);
    context.allowedFields = allowedFields;
    context.allowedData = allowedData;

    const validated = await this.validate(allowedData, 'update', context);
    if (isBoolean(validated)) {
      if (!validated) {
        this.completeOp('updateOne', startedAt, Codes.BadRequest, _filter);
        return { success: false, kind: 'error', code: Codes.BadRequest };
      }
    } else if (isArray(validated)) {
      if (validated.length > 0) {
        this.completeOp('updateOne', startedAt, Codes.BadRequest, _filter);
        return { success: false, kind: 'error', code: Codes.BadRequest, errors: validated };
      }
    }

    const prepared = await this.prepare(allowedData, 'update', context);

    context.preparedData = prepared;
    Object.assign(doc, prepared);

    context.modifiedPaths = doc.modifiedPaths();
    doc = assertModelDocument<TModel>(await this.transform(doc, 'update', context), this.modelName, 'transform');
    context.currentDocument = doc;
    doc = await doc.save();

    const diffExcludeFields = [this.options.documentPermissionField, '__v'];
    this.asServiceHookContext(context).diff = (d) => {
      context.changes =
        diff(
          omit(context.originalDocumentSnapshot, diffExcludeFields),
          omit(d.toObject({ virtuals: false }), diffExcludeFields),
        ) || [];

      context.modifiedPaths = uniq(context.changes.map((di) => (di.path.length > 0 ? String(di.path[0]) : '')));
    };

    doc = assertModelDocument<TModel>(await this.afterPersist(doc, 'update', context), this.modelName, 'afterPersist');
    context.currentDocument = doc;
    context.finalDocumentSnapshot = doc.toObject({ virtuals: false }) as Record<string, unknown>;
    this.asServiceHookContext(context).diff(doc);

    await this.changes(doc.toObject({ virtuals: false }) as Record<string, unknown>, context);

    let includeDocPermissions = includePermissions;
    if (!includeDocPermissions && !skim) {
      includeDocPermissions = this.checkIfModelPermissionExists(['read', 'update']);
    }
    if (includeDocPermissions) doc = await this.addDocPermissions(doc, 'update', context);
    if (includePermissions) doc = await this.addFieldPermissions(doc, 'update', context);
    if (_populate) await populateDoc(doc as Document, _populate);
    doc = await this.trimOutputFields(doc, 'read', this.baseFieldsExt);

    let outputDoc: unknown = doc;
    if (isFunction(decorate)) outputDoc = await decorate(outputDoc, context);
    if (!includePermissions) outputDoc = this.addEmptyPermissions(outputDoc);

    this.completeOp('updateOne', startedAt, Codes.Success, _filter);
    return { success: true, kind: 'single', code: Codes.Success, data: outputDoc as TModel, input: prepared };
  }

  public async updateById(
    id: string,
    data: Record<string, unknown>,
    args: UpdateByIdArgs<TModel> = {},
    options: UpdateByIdOptions = {},
    decorate?: (doc: unknown, context?: ModelHookContext) => unknown,
  ): Promise<SingleResult<TModel> | ErrorResult> {
    const { populate, overrides } = this.resolveUpdateByIdArgs(args);
    const { skim, includePermissions, populateAccess } = this.resolveUpdateByIdOptions(options);
    const { populate: overridePopulate, idFilter: overrideIdFilter } = overrides;
    const filter = overrideIdFilter || (await this.genIDFilter(id));

    return this.updateOne(
      filter,
      data,
      {
        populate,
        overrides: {
          populate: overridePopulate,
        },
      },
      { skim, includePermissions, populateAccess },
      decorate,
    );
  }

  public async upsert(
    filter: Filter<TModel>,
    data: Record<string, unknown>,
    args?: UpsertArgs<TModel>,
    options?: UpsertOptions,
    decorate?: (doc: unknown, context?: ModelHookContext) => unknown,
  ): Promise<ServiceResult<TModel>> {
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

    const { populate, overrides } = this.resolveUpsertArgs(args);
    const { skim, includePermissions, populateAccess } = this.resolveUpsertOptions(options);
    const { filter: overrideFilter, populate: overridePopulate } = overrides ?? {};
    const _filter = await (overrideFilter || this.genFilter('update', filter));
    const query = { filter: _filter };

    const startedAt = this.beginOp('upsert', _filter);
    if (_filter === false) {
      this.completeOp('upsert', startedAt, Codes.Forbidden, _filter);
      return { success: false, kind: 'error', code: Codes.Forbidden, query };
    }

    const theone = await this.model.findOne({ filter: _filter });
    let result: ServiceResult<TModel>;
    if (theone) {
      result = await this.updateOne(
        null,
        data,
        {
          populate,
          overrides: {
            filter: _filter,
            populate: overridePopulate,
          },
        },
        { skim, includePermissions, populateAccess },
        decorate,
      );
    } else {
      result = await this.create(
        data,
        { populate },
        {
          skim,
          includePermissions,
          populateAccess,
        },
        decorate,
      );
    }

    this.completeOp('upsert', startedAt, result.code, _filter);
    return result;
  }

  public async delete(id: string): Promise<SingleResult<unknown> | ErrorResult> {
    const filter = await this.genFilter('delete', await this.genIDFilter(id));

    const query = { filter };

    const startedAt = this.beginOp('delete', filter);

    if (filter === false) {
      this.completeOp('delete', startedAt, Codes.Forbidden, filter);
      return { success: false, kind: 'error', code: Codes.Forbidden, query };
    }
    let doc = (await this.model.findOne({ filter })) as ModelDocument<TModel> | null;
    if (!doc) {
      this.completeOp('delete', startedAt, Codes.NotFound, filter);
      return { success: false, kind: 'error', code: Codes.NotFound, query };
    }

    const context: ModelHookContext = {
      mongooseModel: this.model.model,
      modelName: this.modelName,
      operation: 'delete',
      originalDocumentSnapshot: toObject(doc) as Record<string, unknown>,
      currentDocument: doc,
      resolvedQuery: query,
    };

    await this.beforeDelete(doc, context);

    // this function utilizes the 'deleteOne' method to delete the document,
    // triggering 'deleteOne' hooks, as opposed to using 'findOneAndDelete'.
    // see https://mongoosejs.com/docs/api/model.html#Model.prototype.deleteOne()
    await ('deleteOne' in doc ? doc.deleteOne() : (doc as Document & { remove: () => Promise<unknown> }).remove());

    context.finalDocumentSnapshot = toObject(doc) as Record<string, unknown>;
    await this.afterDelete(doc, context);

    this.completeOp('delete', startedAt, Codes.Success, filter);
    return { success: true, kind: 'single', code: Codes.Success, data: doc._id, query };
  }

  public async exists(
    filter: Filter<TModel>,
    options: ExistsOptions & { includeId: true },
  ): Promise<SingleResult<unknown> | ErrorResult>;
  public async exists(filter: Filter<TModel>, options?: ExistsOptions): Promise<SingleResult<boolean> | ErrorResult>;
  public async exists(filter: Filter<TModel>, options?: ExistsOptions): Promise<SingleResult<unknown> | ErrorResult> {
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

    const { access, includeId } = this.resolveExistsOptions(options);

    filter = await this.genFilter(access, filter);
    const result = await this.model.exists(filter);
    return {
      success: true,
      kind: 'single',
      code: Codes.Success,
      data: includeId ? result : !!result,
      query: { filter },
    };
  }

  protected isValidDistinctFieldName(field: unknown): boolean {
    return isValidFieldPath(field);
  }

  protected async authorizeDistinctField(field: string): Promise<ErrorResult | null> {
    const allowedFields = await this.genAllowedFields(null, 'read');

    if (!isFieldAllowed(field, allowedFields)) {
      return {
        success: false,
        kind: 'error',
        code: Codes.Forbidden,
        errors: [{ detail: `Distinct field not allowed: ${field}` }],
      };
    }

    return null;
  }

  public async distinct(field: string, args?: DistinctArgs<TModel>): Promise<ListResult<unknown> | ErrorResult> {
    if (!this.isValidDistinctFieldName(field)) {
      return {
        success: false,
        kind: 'error',
        code: Codes.BadRequest,
        errors: [{ detail: `Invalid distinct field: ${field}` }],
      };
    }

    const fieldError = await this.authorizeDistinctField(field);
    if (fieldError) return fieldError;

    let { filter } = args ?? {};
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

    filter = await this.genFilter('read', filter);

    const query = { filter };

    if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query };

    const result = await this.model.distinct(field, filter);

    return { success: true, kind: 'list', code: Codes.Success, data: result, count: result.length, query };
  }

  public async count(
    filter: Filter<TModel>,
    access: BaseFilterAccess = 'list',
  ): Promise<SingleResult<number> | ErrorResult> {
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

    filter = await this.genFilter(access, filter);

    const query = { filter };

    if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query };

    return { success: true, kind: 'single', code: Codes.Success, data: await this.model.countDocuments(filter), query };
  }

  public async countByFieldValues(
    foreignField: string,
    values: unknown[],
    filter: Filter<TModel> = {},
    access: BaseFilterAccess = 'list',
  ): Promise<SingleResult<Map<string, Set<string>>> | ErrorResult> {
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

    const uniqueValues = uniqBy(values, (value) => String(value));
    filter = await this.genFilter(access, {
      ...(filter as object),
      [foreignField]: { $in: uniqueValues },
    } as Filter<TModel>);

    const query = { filter };

    if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query };
    const matchFilter = filter as Record<string, unknown>;

    const rows = (await this.model.model.aggregate([
      { $match: matchFilter },
      {
        $project: {
          foreignValues: {
            $cond: [{ $isArray: `$${foreignField}` }, `$${foreignField}`, [`$${foreignField}`]],
          },
        },
      },
      { $unwind: '$foreignValues' },
      { $match: { foreignValues: { $in: uniqueValues } } },
      { $group: { _id: '$foreignValues', documentIds: { $addToSet: '$_id' } } },
    ])) as Array<{ _id: unknown; documentIds: unknown[] }>;

    const counts = new Map<string, Set<string>>();
    for (const row of rows) {
      counts.set(String(row._id), new Set(row.documentIds.map((id) => String(id))));
    }

    return { success: true, kind: 'single', code: Codes.Success, data: counts, query };
  }

  public getDocPermissions(doc: unknown): Record<string, unknown> {
    return getDocPermissions(this.modelName, doc);
  }

  private resolveFindOneArgs(args: FindOneArgs<TModel> = {}) {
    return resolveFindOneArgs(this, args);
  }

  private resolveFindOneOptions(options: FindOneOptions = {}) {
    return resolveFindOneOptions(this, options);
  }

  private resolveFindByIdArgs(args: FindByIdArgs<TModel> = {}) {
    return resolveFindByIdArgs(this, args);
  }

  private resolveFindByIdOptions(options: FindByIdOptions = {}) {
    return resolveFindByIdOptions(this, options);
  }

  private resolveFindArgs(args: FindArgs<TModel> = {}) {
    return resolveFindArgs(this, args);
  }

  private resolveFindOptions(options: FindOptions = {}) {
    return resolveFindOptions(this, options);
  }

  private resolveCreateArgs(args: CreateArgs = {}) {
    return resolveCreateArgs(this, args);
  }

  private resolveCreateOptions(options: CreateOptions = {}) {
    return resolveCreateOptions(this, options);
  }

  private resolveUpdateOneArgs(args: UpdateOneArgs<TModel> = {}) {
    return resolveUpdateOneArgs(this, args);
  }

  private resolveUpdateOneOptions(options: UpdateOneOptions = {}) {
    return resolveUpdateOneOptions(this, options);
  }

  private resolveUpdateByIdArgs(args: UpdateByIdArgs<TModel> = {}) {
    return resolveUpdateByIdArgs(this, args);
  }

  private resolveUpdateByIdOptions(options: UpdateByIdOptions = {}) {
    return resolveUpdateByIdOptions(this, options);
  }

  private resolveUpsertArgs(args: UpsertArgs<TModel> = {}) {
    return resolveUpsertArgs(this, args);
  }

  private resolveUpsertOptions(options: UpsertOptions = {}) {
    return resolveUpsertOptions(this, options);
  }

  private resolveExistsOptions(options: ExistsOptions = {}) {
    return resolveExistsOptions(this, options);
  }

  private async getFieldPermissionAccess(ids: unknown[]) {
    const uniqueIds = compact(uniqBy(ids, (id) => String(id)).map((id) => String(id)));
    if (uniqueIds.length === 0) {
      return {
        readIds: new Set<string>(),
        updateIds: new Set<string>(),
      };
    }

    const [readIds, updateIds] = await Promise.all([
      this.getAccessibleIdSet(uniqueIds, 'read'),
      this.getAccessibleIdSet(uniqueIds, 'update'),
    ]);

    return { readIds, updateIds };
  }

  private async getAccessibleIdSet(ids: string[], access: BaseFilterAccess) {
    const idFilter = { _id: { $in: ids } } as Filter<TModel>;
    const filter = await this.genFilter(access, idFilter);
    if (filter === false) return new Set<string>();

    const docs = await this.model.find({ filter, select: '_id', lean: true });
    return new Set(docs.map((doc) => String(doc._id)));
  }

  async listSub(
    id: SubdocumentId,
    sub: SubdocumentName,
    options?: SubdocumentListOptions<TModel>,
  ): Promise<ListResult | ErrorResult> {
    return listSubImpl(this, id, sub, options);
  }

  public async readSub(
    id: SubdocumentId,
    sub: SubdocumentName,
    subId: SubdocumentId,
    options?: SubdocumentReadOptions,
  ): Promise<SingleResult | ErrorResult> {
    return readSubImpl(this, id, sub, subId, options);
  }

  public async updateSub(
    id: SubdocumentId,
    sub: SubdocumentName,
    subId: SubdocumentId,
    data: Record<string, unknown>,
  ): Promise<SingleResult | ErrorResult> {
    return updateSubImpl(this, id, sub, subId, data);
  }

  public async bulkUpdateSub(
    id: SubdocumentId,
    sub: SubdocumentName,
    data: SubdocumentBulkUpdateInput | Record<string, unknown>,
  ): Promise<ListResult | ErrorResult> {
    return bulkUpdateSubImpl(this, id, sub, castArray(data));
  }

  public async createSub(
    id: SubdocumentId,
    sub: SubdocumentName,
    data: SubdocumentCreateInput,
    options?: SubdocumentCreateOptions,
  ): Promise<ListResult | ErrorResult> {
    return createSubImpl(this, id, sub, data, options);
  }

  public async deleteSub(
    id: SubdocumentId,
    sub: SubdocumentName,
    subId: SubdocumentId,
  ): Promise<SingleResult | ErrorResult> {
    return deleteSubImpl(this, id, sub, subId);
  }

  public async getParentDoc(
    id: SubdocumentId,
    sub: SubdocumentName,
    args?: SubdocumentParentArgs,
    options?: SubdocumentParentOptions,
  ) {
    return getParentDocImpl(this, id, sub, args, options);
  }
}
