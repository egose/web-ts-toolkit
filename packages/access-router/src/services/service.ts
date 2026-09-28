import { Document } from 'mongoose';
import {
  castArray,
  cloneDeep,
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
import MongooseModelAdapter, { admitModelPersistence } from '../model';
import { getModelOptions } from '../options';
import {
  getDocPermissions,
  genPagination,
  mapWithConcurrencyLimit,
  normalizeSelect,
  populateDoc,
  toObject,
} from '../helpers';
import { isFieldAllowed, isValidFieldPath, validateSortFields } from '../helpers/sort-policy';
import { RequestConcurrencyScheduler } from '../helpers/concurrency';
import { applyUpdate } from '../helpers/apply-update';
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

const unsetDocPath = (doc: unknown, path: string): void => {
  const segments = path.split('.');
  let current: unknown = doc;
  // Unwrap mongoose documents to their underlying _doc for plain mutation.
  const unwrap = (value: unknown): unknown =>
    value != null && typeof value === 'object' && '_doc' in (value as Record<string, unknown>)
      ? (value as { _doc: unknown })._doc
      : value;
  current = unwrap(current);
  for (let i = 0; i < segments.length - 1; i++) {
    if (current == null || typeof current !== 'object') return;
    if (!Object.prototype.hasOwnProperty.call(current, segments[i])) return;
    current = unwrap((current as Record<string, unknown>)[segments[i]]);
  }
  if (current != null && typeof current === 'object') {
    delete (current as Record<string, unknown>)[segments[segments.length - 1]];
  }
};

const shouldKeepCorrelatedRef = (ref: string, keep: Set<string>): boolean => {
  if (keep.has(ref)) return true;
  const top = ref.split('.')[0];
  if (keep.has(top)) return true;
  // A selected dotted subpath (e.g. select a.b) implies its parent chain was
  // fetched; keep the parent object rather than stripping the whole branch.
  for (const kept of keep) {
    if (kept === ref || kept.startsWith(`${ref}.`) || ref.startsWith(`${kept}.`)) return true;
  }
  return false;
};

export class Service<TModel = unknown> extends Base<TModel> {
  protected model: any;
  protected options: ModelRouterOptions<TModel>;
  public defaults: Defaults<TModel>;
  protected baseFields: string[];
  protected baseFieldsExt: string[];
  private readonly persist = <T>(operation: () => T | PromiseLike<T>): Promise<T> =>
    this.getCorrelatedExecState().scheduler.work(operation);

  public findRawParentDoc(args: { filter: Filter<TModel>; select: string; populate: unknown; lean: boolean }): any {
    return this.model.findOne({
      ...args,
      filter: args.filter as unknown as Filter,
      populate: args.populate as string | Populate[],
    });
  }

  protected createModelAdapter(modelName: string): any {
    return new MongooseModelAdapter(modelName);
  }

  protected getModelRouterOptions(modelName: string): ModelRouterOptions<TModel> {
    return getModelOptions<TModel>(modelName);
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

    this.model = admitModelPersistence(this.createModelAdapter(modelName), this.getCorrelatedExecState().scheduler);
    this.options = this.getModelRouterOptions(modelName);
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
    let processedInclude: ReturnType<typeof this.processInclude>;
    try {
      processedInclude = this.processInclude(include);
      // A trusted denial must not dispatch subqueries while parsing client data.
      parsedFilter = overrideFilter === false ? false : await this.parseClientData(filter);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }

    let [_filter, _select, _populate, allowedSortFields] = await Promise.all([
      overrideFilter ?? this.genFilter(access, parsedFilter),
      overrideSelect || this.genQuerySelect(access, select),
      overridePopulate || this.genPopulate(populateAccess || access, populate),
      this.genAllowedFields({}, access, this.baseFieldsExt),
    ]);

    const { includes, correlatedIncludes, includeLocalFields, includePaths, correlatedReferenceFields } =
      processedInclude;
    const correlatedOutputPaths = correlatedIncludes.map((entry) => entry.path);
    const finalSelect = normalizeSelect(_select).concat(includeLocalFields, correlatedReferenceFields);

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
      mongooseModel: this.model.mongooseModel,
      modelName: this.modelName,
      operation: access,
      originalDocumentSnapshot: toObject(doc),
      resolvedQuery: query,
    };

    // Stable snapshot for correlated references (ACI-01 D7.3): fetched from
    // persistence including internal-only reference fields, before legacy
    // include attachment, decorate, and task mutation.
    const correlatedSnapshots = [cloneDeep(toObject(doc))];

    try {
      doc = await this.includeDocs(doc, includes);
      if (correlatedIncludes.length > 0) {
        const docList = [doc];
        await this.includeCorrelatedDocs(docList, correlatedIncludes, correlatedSnapshots);
        doc = docList[0];
      }
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
      this.baseFieldsExt.concat(includePaths, correlatedOutputPaths, normalizeSelect(overrideSelect)),
    );
    if (correlatedReferenceFields.length > 0) {
      const keep = new Set([
        ...normalizeSelect(_select),
        ...normalizeSelect(overrideSelect),
        ...this.baseFieldsExt,
        ...includePaths,
        ...correlatedOutputPaths,
      ]);
      for (const ref of correlatedReferenceFields) {
        if (!shouldKeepCorrelatedRef(ref, keep)) unsetDocPath(doc, ref);
      }
    }
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
    const filter = overrideIdFilter ?? (await this.genIDFilter(id));
    if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query: { filter } };

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
    let processedInclude: ReturnType<typeof this.processInclude>;
    try {
      processedInclude = this.processInclude(include);
      // A trusted denial must not dispatch subqueries while parsing client data.
      parsedFilter = overrideFilter === false ? false : await this.parseClientData(filter);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }

    const [_filter, _select, _populate, pagination, allowedSortFields] = await Promise.all([
      overrideFilter ?? this.genFilter('list', parsedFilter),
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

    const { includes, correlatedIncludes, includeLocalFields, includePaths, correlatedReferenceFields } =
      processedInclude;
    const correlatedOutputPaths = correlatedIncludes.map((entry) => entry.path);

    const query = {
      filter: _filter,
      select: finalSelect.concat(includeLocalFields, correlatedReferenceFields),
      populate: filteredPopulate,
      sort,
      ...pagination,
    };

    const startedAt = this.beginOp('find', _filter, {
      sort,
      skip: pagination.skip,
      limit: pagination.limit,
      selectCount: finalSelect.concat(includeLocalFields, correlatedReferenceFields).length,
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

    let docs = (await this.model.find({
      ...query,
      hardLimit: this.options.listHardLimit,
      lean,
    })) as any[];

    const contexts: ModelHookContext[] = docs.map((doc) => ({
      mongooseModel: this.model.mongooseModel,
      modelName: this.modelName,
      operation: 'list',
      originalDocumentSnapshot: toObject(doc) as Record<string, unknown>,
      resolvedQuery: query,
    }));

    const _decorate: (...args: unknown[]) => unknown = isFunction(decorate) ? decorate : (v) => v;

    const correlatedSnapshots = docs.map((doc) => cloneDeep(toObject(doc)));

    try {
      docs = await this.includeDocs(docs, includes);
      if (correlatedIncludes.length > 0) {
        docs = (await this.includeCorrelatedDocs(docs, correlatedIncludes, correlatedSnapshots)) as any[];
      }
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
          this.baseFieldsExt.concat(includePaths, correlatedOutputPaths, normalizeSelect(overrideSelect)),
        );
        if (correlatedReferenceFields.length > 0) {
          const keep = new Set([
            ...normalizeSelect(_select),
            ...normalizeSelect(overrideSelect),
            ...this.baseFieldsExt,
            ...includePaths,
            ...correlatedOutputPaths,
          ]);
          for (const ref of correlatedReferenceFields) {
            if (!shouldKeepCorrelatedRef(ref, keep)) unsetDocPath(doc, ref);
          }
        }
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
        mongooseModel: this.model.mongooseModel,
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
      if (resolvedPopulate.length > 0) await this.persist(() => populateDoc(doc as Document, resolvedPopulate));
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

  /**
   * Update at authorized policy paths: admitted leaves preserve omitted siblings;
   * whole-authorized objects/arrays replace. Shared by updateById and existing-row
   * upsert. Validation precedes trusted prepare output (not re-filtered); partial
   * prepare containers preserve omissions. Transform retains explicit document-setter
   * replacement authority. Send nested client JSON, not literal dotted update keys.
   */
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
      overrideFilter ?? this.genFilter('update', filter),
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
      mongooseModel: this.model.mongooseModel,
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
    applyUpdate(doc, prepared, allowedFields);

    context.modifiedPaths = doc.modifiedPaths();
    doc = assertModelDocument<TModel>(await this.transform(doc, 'update', context), this.modelName, 'transform');
    context.currentDocument = doc;
    doc = await this.persist(() => doc!.save());

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
    if (_populate) await this.persist(() => populateDoc(doc as Document, _populate));
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
    const filter = overrideIdFilter ?? (await this.genIDFilter(id));
    if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query: { filter } };

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
    const _filter = await (overrideFilter ?? this.genFilter('update', filter));
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
      mongooseModel: this.model.mongooseModel,
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
    await this.persist(() =>
      'deleteOne' in doc! ? doc.deleteOne() : (doc as Document & { remove: () => Promise<unknown> }).remove(),
    );

    context.finalDocumentSnapshot = toObject(doc) as Record<string, unknown>;
    await this.afterDelete(doc, context);

    this.completeOp('delete', startedAt, Codes.Success, filter);
    return { success: true, kind: 'single', code: Codes.Success, data: doc._id, query };
  }

  /**
   * Check existence under row policy (read by default). Terminal false returns a
   * Forbidden ErrorResult before adapter dispatch, in both includeId modes.
   * Allowed matches return true or an `{ _id }` record; misses return false or null.
   * Custom HTTP routes must map ErrorResult to their intended response status.
   */
  public async exists(
    filter: Filter<TModel>,
    options: ExistsOptions & { includeId: true },
  ): Promise<SingleResult<unknown> | ErrorResult>;
  /** Boolean existence; terminal false policy returns Forbidden, not successful false. */
  public async exists(filter: Filter<TModel>, options?: ExistsOptions): Promise<SingleResult<boolean> | ErrorResult>;
  public async exists(filter: Filter<TModel>, options?: ExistsOptions): Promise<SingleResult<unknown> | ErrorResult> {
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

    const { access, includeId } = this.resolveExistsOptions(options);

    filter = await this.genFilter(access, filter);
    if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query: { filter } };
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

  /**
   * Trusted count for correlated includes (ACI-03): the caller already
   * resolved parent references, revalidated expanded operands, and applied
   * explicit `count` access via `genFilter`. This skips client-filter
   * validation and subquery parsing so substituted parent data stays inert.
   */
  public async countTrusted(authorizedFilter: Filter<TModel>): Promise<SingleResult<number> | ErrorResult> {
    const query = { filter: authorizedFilter };
    if (authorizedFilter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query };
    return {
      success: true,
      kind: 'single',
      code: Codes.Success,
      data: await this.model.countDocuments(authorizedFilter),
      query,
    };
  }

  /**
   * Group target document IDs by original parent-key aliases using one aggregate.
   * Resolves the requested row policy (legacy count includes pass `count`), casts
   * authorized filters/foreign operands with the target schema, and deduplicates IDs
   * independently of pagination. Cast failures return BadRequest; false policy returns
   * Forbidden. Casting does not execute countDocuments middleware/plugins.
   */
  public async countByFieldValues(
    foreignField: string,
    values: unknown[],
    filter: Filter<TModel> = {},
    access: BaseFilterAccess = 'list',
  ): Promise<SingleResult<Map<string, Set<string>>> | ErrorResult> {
    if (!isValidFieldPath(foreignField)) {
      return {
        success: false,
        kind: 'error',
        code: Codes.BadRequest,
        errors: [{ detail: `Invalid include foreignField: ${foreignField}` }],
      };
    }

    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

    const uniqueValues = uniqBy(values, (value) => String(value));
    filter = await this.genFilter(access, {
      ...(filter as object),
      [foreignField]: { $in: uniqueValues },
    } as Filter<TModel>);

    const query = { filter };

    if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query };
    let matchFilter = filter as Record<string, unknown>;
    let castValues = uniqueValues;
    try {
      if (this.model.castFilter) {
        matchFilter = this.model.castFilter(matchFilter);
        // Cast against the real foreign path, before projection renames it.
        // Keep this independent of ACL filter composition/overrides.
        const foreignFilter = this.model.castFilter({ [foreignField]: { $in: uniqueValues } });
        castValues = foreignFilter[foreignField]?.$in;
        if (!Array.isArray(castValues) || castValues.length !== uniqueValues.length) {
          throw new Error('Foreign field query casting must retain the join operands');
        }
      }
    } catch {
      // Only synchronous schema casting is in this boundary, never persistence.
      // Avoid exposing values from trusted ACL filters in the client error detail.
      return {
        success: false,
        kind: 'error',
        code: Codes.BadRequest,
        errors: [{ detail: 'Invalid grouped include count filter or foreign-key value' }],
      };
    }

    const rows = (await this.model.aggregate([
      { $match: matchFilter },
      {
        $project: {
          foreignValues: {
            $cond: [{ $isArray: `$${foreignField}` }, `$${foreignField}`, [`$${foreignField}`]],
          },
        },
      },
      { $unwind: '$foreignValues' },
      { $match: { foreignValues: { $in: castValues } } },
      { $group: { _id: '$foreignValues', documentIds: { $addToSet: '$_id' } } },
    ])) as Array<{ _id: unknown; documentIds: unknown[] }>;

    const grouped = new Map<string, Set<string>>();
    for (const row of rows) {
      const key = String(row._id);
      const ids = grouped.get(key) ?? new Set<string>();
      for (const id of row.documentIds) ids.add(String(id));
      grouped.set(key, ids);
    }
    const counts = new Map<string, Set<string>>();
    for (let i = 0; i < uniqueValues.length; i++) {
      // Casting can normalize a key (uppercase ObjectId hex, string setters,
      // numeric strings). Attachment still looks up the original parent key.
      const ids = grouped.get(String(castValues[i]));
      if (ids) counts.set(String(uniqueValues[i]), ids);
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

    const docs = (await this.model.find({ filter, select: '_id', lean: true })) as Array<{ _id: unknown }>;
    return new Set<string>(docs.map((doc) => String(doc._id)));
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

  /**
   * Apply authorized policy-path updates, preserving protected siblings, then save.
   * Output requires post-save parent read and subdocument read operation/row access;
   * hidden output is successful `data: null` (direct/root-entry 200), not a failed write.
   * Visible output uses read fields plus `_id`. Do not retry solely for null output.
   */
  public async updateSub(
    id: SubdocumentId,
    sub: SubdocumentName,
    subId: SubdocumentId,
    data: Record<string, unknown>,
  ): Promise<SingleResult | ErrorResult> {
    return updateSubImpl(
      this,
      this.persist,
      (access) => this.req.macl.isAllowed(this.modelName, access),
      id,
      sub,
      subId,
      data,
    );
  }

  /**
   * Save authorized targeted updates, then return readable targets in stored order.
   * Requires parent/subdocument read access for output, not subdocument list access;
   * uses read fields plus `_id`. Hidden output succeeds with `data: [], count: 0`
   * (direct/root-entry 200); count measures visible rows, not all updated rows.
   */
  public async bulkUpdateSub(
    id: SubdocumentId,
    sub: SubdocumentName,
    data: SubdocumentBulkUpdateInput | Record<string, unknown>,
  ): Promise<ListResult | ErrorResult> {
    return bulkUpdateSubImpl(
      this,
      this.persist,
      (access) => this.req.macl.isAllowed(this.modelName, access),
      id,
      sub,
      castArray(data),
    );
  }

  /**
   * Append/prepend admitted rows, then return the visible full array (including when
   * input is empty). Output requires post-save parent read and subdocument list AND
   * read guards/row filters; fields use read projection plus `_id`.
   * Hidden output succeeds with code `created`, `data: [], count: 0`
   * (direct/root-entry 201). Visible count/order follow filtered stored rows.
   * Empty output does not mean the write failed; addFirst is a service option.
   */
  public async createSub(
    id: SubdocumentId,
    sub: SubdocumentName,
    data: SubdocumentCreateInput,
    options?: SubdocumentCreateOptions,
  ): Promise<ListResult | ErrorResult> {
    return createSubImpl(
      this,
      this.persist,
      (access) => this.req.macl.isAllowed(this.modelName, access),
      id,
      sub,
      data,
      options,
    );
  }

  public async deleteSub(
    id: SubdocumentId,
    sub: SubdocumentName,
    subId: SubdocumentId,
  ): Promise<SingleResult | ErrorResult> {
    return deleteSubImpl(this, this.persist, id, sub, subId);
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
