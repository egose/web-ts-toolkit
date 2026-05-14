import { Document } from 'mongoose';
import {
  castArray,
  compact,
  flatten,
  forEach,
  get,
  intersectionBy,
  isArray,
  isBoolean,
  isFunction,
  isNil,
  map,
  omit,
  pick,
  set,
  uniq,
} from '@web-ts-toolkit/utils';
import diff from 'deep-diff';
import Model from '../model';
import { getModelOption, getModelOptions } from '../options';
import {
  getDocPermissions,
  genPagination,
  normalizeSelect,
  populateDoc,
  filterCollection,
  findElement,
  findElementById,
  matchElement,
  toObject,
  genSubPopulate,
} from '../helpers';
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
} from '../interfaces';
import { Codes, StatusCodes } from '../enums';
import { Base } from './base';
import { logger } from '../logger';
import { isDocument } from '../lib';

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
  model: Model;
  options: ModelRouterOptions<TModel>;
  defaults: Defaults<TModel>;
  baseFields: string[];
  baseFieldsExt: string[];

  private asServiceHookContext(context: ModelHookContext): ServiceHookContext {
    return context as ServiceHookContext;
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
    if (filterErrors.length > 0) return { success: false, code: Codes.BadRequest, errors: filterErrors };

    const { select, sort, populate, include, overrides } = this.resolveFindOneArgs(args);
    const { skim, includePermissions, access, populateAccess, lean } = this.resolveFindOneOptions(options);

    const { filter: overrideFilter, select: overrideSelect, populate: overridePopulate } = overrides ?? {};

    let [_filter, _select, _populate] = await Promise.all([
      overrideFilter || this.genFilter(access, await this.parseClientData(filter)),
      overrideSelect || this.genQuerySelect(access, select),
      overridePopulate || this.genPopulate(populateAccess || access, populate),
    ]);

    const { includes, includeLocalFields, includePaths } = this.processInclude(include);
    const finalSelect = normalizeSelect(_select).concat(includeLocalFields);

    const query = {
      filter: _filter,
      select: finalSelect,
      sort,
      populate: _populate,
    };

    logger.debug(JSON.stringify({ op: 'findOne', query }));

    if (_filter === false) return { success: false, code: Codes.Forbidden, query };

    let doc = await this.model.findOne({ ...query, lean });
    if (!doc) return { success: false, code: Codes.NotFound, query };

    const context: ModelHookContext = {
      mongooseModel: this.model.model,
      modelName: this.modelName,
      originalDocumentSnapshot: toObject(doc),
    };

    doc = await this.includeDocs(doc, includes);

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
    decorate?: Function,
  ): Promise<ListResult<TModel> | ErrorResult> {
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, code: Codes.BadRequest, errors: filterErrors };

    const { select, populate, include, sort, skip, limit, page, pageSize, overrides } = this.resolveFindArgs(args);
    const { skim, includePermissions, includeCount, populateAccess, lean } = this.resolveFindOptions(options);

    const { filter: overrideFilter, select: overrideSelect, populate: overridePopulate } = overrides ?? {};

    const [_filter, _select, _populate, pagination] = await Promise.all([
      overrideFilter || this.genFilter('list', await this.parseClientData(filter)),
      overrideSelect || this.genQuerySelect('list', select),
      overridePopulate || this.genPopulate(populateAccess, populate),
      genPagination({ skip, limit, page, pageSize }, this.options.listHardLimit),
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

    logger.debug(JSON.stringify({ op: 'find', query }));

    if (_filter === false) return { success: false, code: Codes.Forbidden, query };

    let docs = await this.model.find({
      ...query,
      lean,
    });

    const contexts: ModelHookContext[] = docs.map((doc) => ({
      mongooseModel: this.model.model,
      modelName: this.modelName,
      originalDocumentSnapshot: toObject(doc),
    }));

    const _decorate: (...args: unknown[]) => unknown = isFunction(decorate) ? decorate : (v) => v;

    docs = await this.includeDocs(docs, includes);

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
    data,
    args?: CreateArgs,
    options?: CreateOptions,
    decorate?: Function,
  ): Promise<ListResult<TModel> | ErrorResult> {
    const { populate } = this.resolveCreateArgs(args);
    const { skim, includePermissions, populateAccess } = this.resolveCreateOptions(options);

    const isArr = Array.isArray(data);
    let dataArr = isArr ? data : [data];
    dataArr = await Promise.all(dataArr.map((d) => this.parseClientData(d)));

    const contexts: ModelHookContext[] = [];

    let validationError = null;
    const items = await Promise.all(
      dataArr.map(async (item, index) => {
        const context: ModelHookContext = {
          mongooseModel: this.model.model,
          modelName: this.modelName,
          originalData: item,
        };

        const allowedFields = await this.genAllowedFields(item, 'create');
        const allowedData = pick(item, allowedFields);

        const validated = await this.validate(allowedData, 'create', context);
        if (isBoolean(validated)) {
          if (!validated) {
            validationError = { success: false, code: Codes.BadRequest };
            return;
          }
        } else if (isArray(validated)) {
          if (validated.length > 0) {
            validationError = { success: false, code: Codes.BadRequest, errors: validated };
            return;
          }
        }

        const preparedData = await this.prepare(allowedData, 'create', context);

        context.preparedData = preparedData;
        contexts.push(context);
        return preparedData;
      }),
    );

    if (validationError) return validationError;

    const _decorate: (...args: unknown[]) => unknown = isFunction(decorate) ? decorate : (v) => v;

    const createdDocs = (await this.model.create(items)) as unknown as Array<ModelDocument<TModel>>;
    const docs = await Promise.all(
      createdDocs.map(async (doc, index) => {
        contexts[index].currentDocument = doc as unknown as ModelDocument<TModel>;
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
        if (populate) await populateDoc(doc as Document, await this.genPopulate(populateAccess, populate));
        doc = await this.trimOutputFields(doc, 'read', this.baseFieldsExt);
        let outputDoc = await _decorate(doc, contexts[index]);
        if (!includePermissions) outputDoc = this.addEmptyPermissions(outputDoc);

        return outputDoc;
      }),
    );

    return {
      success: true,
      kind: 'list',
      code: Codes.Created,
      data: docs as TModel[],
      input: items,
      count: docs.length,
    };
  }

  public async new(): Promise<SingleResult<TModel>> {
    const data = await this.model.new();
    return {
      success: true,
      kind: 'single',
      code: Codes.Success,
      data: data as TModel,
    };
  }

  public async updateOne(
    filter: Filter<TModel>,
    data,
    args?: UpdateOneArgs<TModel>,
    options?: UpdateOneOptions,
    decorate?: Function,
  ): Promise<SingleResult<TModel> | ErrorResult> {
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, code: Codes.BadRequest, errors: filterErrors };

    const { populate, overrides } = this.resolveUpdateOneArgs(args);
    const { skim, includePermissions, populateAccess } = this.resolveUpdateOneOptions(options);
    const { filter: overrideFilter, populate: overridePopulate } = overrides ?? {};

    const [_filter, _populate] = await Promise.all([
      overrideFilter || this.genFilter('update', filter),
      overridePopulate || this.genPopulate(populateAccess, populate),
    ]);

    const query = { filter: _filter, populate: _populate };

    logger.debug(JSON.stringify({ op: 'updateOne', query }));

    if (_filter === false) return { success: false, code: Codes.Forbidden, query };

    let doc = (await this.model.findOne({ filter: _filter })) as ModelDocument<TModel> | null;
    if (!doc) return { success: false, code: Codes.NotFound, query };

    const context: ModelHookContext = { mongooseModel: this.model.model, modelName: this.modelName };

    data = await this.parseClientData(data);

    // see https://mongoosejs.com/docs/api/document.html#Document.prototype.toObject()
    context.originalDocumentSnapshot = doc.toObject({ virtuals: false }) as Record<string, unknown>;
    context.originalData = data;

    doc = await this.addDocPermissions(doc, 'update', context);

    context.docPermissions = this.getDocPermissions(doc) as Record<string, unknown>;
    context.currentDocument = doc as unknown as ModelDocument<TModel>;

    const allowedFields = await this.genAllowedFields(doc, 'update');
    const allowedData = pick(data, allowedFields);

    const validated = await this.validate(allowedData, 'update', context);
    if (isBoolean(validated)) {
      if (!validated) return { success: false, code: Codes.BadRequest };
    } else if (isArray(validated)) {
      if (validated.length > 0) return { success: false, code: Codes.BadRequest, errors: validated };
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

      context.modifiedPaths = uniq(context.changes.map((di) => (di.path.length > 0 ? di.path[0] : '')));
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

    return { success: true, kind: 'single', code: Codes.Success, data: outputDoc as TModel, input: prepared };
  }

  public async updateById(
    id: string,
    data,
    args: UpdateByIdArgs<TModel> = {},
    options: UpdateByIdOptions = {},
    decorate?: Function,
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
    data,
    args?: UpsertArgs<TModel>,
    options?: UpsertOptions,
    decorate?: Function,
  ): Promise<ServiceResult<TModel>> {
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, code: Codes.BadRequest, errors: filterErrors };

    const { populate, overrides } = this.resolveUpsertArgs(args);
    const { skim, includePermissions, populateAccess } = this.resolveUpsertOptions(options);
    const { filter: overrideFilter, populate: overridePopulate } = overrides ?? {};

    const theone = await this.model.findOne({ filter });
    if (theone) {
      const _filter = await (overrideFilter || this.genFilter('update', filter));
      const query = { filter: _filter };

      logger.debug(JSON.stringify({ op: 'upsert', query }));
      if (_filter === false) return { success: false, code: Codes.Forbidden, query };

      const matched = matchElement(theone, _filter);
      if (!matched) return { success: false, code: Codes.Forbidden, query };

      return this.updateOne(
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
      return this.create(
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
  }

  public async delete(id: string): Promise<SingleResult<unknown> | ErrorResult> {
    const filter = await this.genFilter('delete', await this.genIDFilter(id));

    const query = { filter };

    logger.debug(JSON.stringify({ op: 'delete', query }));

    if (filter === false) return { success: false, code: Codes.Forbidden, query };
    let doc = (await this.model.findOne({ filter })) as ModelDocument<TModel> | null;
    if (!doc) return { success: false, code: Codes.NotFound, query };

    const context: ModelHookContext = {
      mongooseModel: this.model.model,
      modelName: this.modelName,
      originalDocumentSnapshot: toObject(doc) as Record<string, unknown>,
      currentDocument: doc as unknown as ModelDocument<TModel>,
    };

    await this.beforeDelete(doc, context);

    // this function utilizes the 'deleteOne' method to delete the document,
    // triggering 'deleteOne' hooks, as opposed to using 'findOneAndDelete'.
    // see https://mongoosejs.com/docs/api/model.html#Model.prototype.deleteOne()
    await ('deleteOne' in doc ? doc.deleteOne() : (doc as Document & { remove: () => Promise<unknown> }).remove());

    context.finalDocumentSnapshot = toObject(doc) as Record<string, unknown>;
    await this.afterDelete(doc, context);

    return { success: true, kind: 'single', code: Codes.Success, data: doc._id, query };
  }

  public async exists(
    filter: Filter<TModel>,
    options: ExistsOptions & { includeId: true },
  ): Promise<SingleResult<unknown> | ErrorResult>;
  public async exists(filter: Filter<TModel>, options?: ExistsOptions): Promise<SingleResult<boolean> | ErrorResult>;
  public async exists(filter: Filter<TModel>, options?: ExistsOptions): Promise<SingleResult<unknown> | ErrorResult> {
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, code: Codes.BadRequest, errors: filterErrors };

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

  public async distinct(field: string, args?: DistinctArgs<TModel>): Promise<ListResult<unknown> | ErrorResult> {
    let { filter } = args ?? {};
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, code: Codes.BadRequest, errors: filterErrors };

    filter = await this.genFilter('read', filter);

    const query = { filter };

    if (filter === false) return { success: false, code: Codes.Forbidden, query };

    const result = await this.model.distinct(field, filter);

    return { success: true, kind: 'list', code: Codes.Success, data: result, count: result.length, query };
  }

  public async count(
    filter: Filter<TModel>,
    access: BaseFilterAccess = 'list',
  ): Promise<SingleResult<number> | ErrorResult> {
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, code: Codes.BadRequest, errors: filterErrors };

    filter = await this.genFilter(access, filter);

    const query = { filter };

    if (filter === false) return { success: false, code: Codes.Forbidden, query };

    return { success: true, kind: 'single', code: Codes.Success, data: await this.model.countDocuments(filter), query };
  }

  public getDocPermissions(doc) {
    return getDocPermissions(this.modelName, doc);
  }

  private resolveFindOneArgs(args: FindOneArgs<TModel> = {}) {
    return {
      select: args.select ?? this.defaults.findOneArgs?.select,
      sort: args.sort ?? this.defaults.findOneArgs?.sort,
      populate: args.populate ?? this.defaults.findOneArgs?.populate,
      include: args.include ?? this.defaults.findOneArgs?.include,
      overrides: args.overrides ?? {},
    };
  }

  private resolveFindOneOptions(options: FindOneOptions = {}) {
    return {
      skim: options.skim ?? this.defaults.findOneOptions?.skim ?? false,
      includePermissions: options.includePermissions ?? this.defaults.findOneOptions?.includePermissions ?? true,
      access: options.access ?? this.defaults.findOneOptions?.access ?? 'read',
      populateAccess: options.populateAccess ?? this.defaults.findOneOptions?.populateAccess,
      lean: options.lean ?? this.defaults.findOneOptions?.lean ?? false,
    };
  }

  private resolveFindByIdArgs(args: FindByIdArgs<TModel> = {}) {
    return {
      select: args.select ?? this.defaults.findByIdArgs?.select,
      populate: args.populate ?? this.defaults.findByIdArgs?.populate,
      include: args.include ?? this.defaults.findByIdArgs?.include,
      overrides: args.overrides ?? {},
    };
  }

  private resolveFindByIdOptions(options: FindByIdOptions = {}) {
    return {
      skim: options.skim ?? this.defaults.findByIdOptions?.skim ?? false,
      includePermissions: options.includePermissions ?? this.defaults.findByIdOptions?.includePermissions ?? true,
      access: options.access ?? this.defaults.findByIdOptions?.access ?? 'read',
      populateAccess: options.populateAccess ?? this.defaults.findByIdOptions?.populateAccess,
      lean: options.lean ?? this.defaults.findByIdOptions?.lean ?? false,
    };
  }

  private resolveFindArgs(args: FindArgs<TModel> = {}) {
    return {
      select: args.select ?? this.defaults.findArgs?.select,
      populate: args.populate ?? this.defaults.findArgs?.populate,
      include: args.include ?? this.defaults.findArgs?.include,
      sort: args.sort ?? this.defaults.findArgs?.sort,
      skip: args.skip ?? this.defaults.findArgs?.skip,
      limit: args.limit ?? this.defaults.findArgs?.limit,
      page: args.page ?? this.defaults.findArgs?.page,
      pageSize: args.pageSize ?? this.defaults.findArgs?.pageSize,
      overrides: args.overrides ?? {},
    };
  }

  private resolveFindOptions(options: FindOptions = {}) {
    return {
      skim: options.skim ?? this.defaults.findOptions?.skim ?? false,
      includePermissions: options.includePermissions ?? this.defaults.findOptions?.includePermissions ?? true,
      includeCount: options.includeCount ?? this.defaults.findOptions?.includeCount ?? false,
      populateAccess: options.populateAccess ?? this.defaults.findOptions?.populateAccess ?? 'read',
      lean: options.lean ?? this.defaults.findOptions?.lean ?? false,
    };
  }

  private resolveCreateArgs(args: CreateArgs = {}) {
    return {
      populate: args.populate ?? this.defaults.createArgs?.populate,
    };
  }

  private resolveCreateOptions(options: CreateOptions = {}) {
    return {
      skim: options.skim ?? this.defaults.createOptions?.skim ?? false,
      includePermissions: options.includePermissions ?? this.defaults.createOptions?.includePermissions ?? true,
      populateAccess: options.populateAccess ?? this.defaults.createOptions?.populateAccess ?? 'read',
    };
  }

  private resolveUpdateOneArgs(args: UpdateOneArgs<TModel> = {}) {
    return {
      populate: args.populate ?? this.defaults.updateOneArgs?.populate,
      overrides: args.overrides ?? {},
    };
  }

  private resolveUpdateOneOptions(options: UpdateOneOptions = {}) {
    return {
      skim: options.skim ?? this.defaults.updateOneOptions?.skim ?? false,
      includePermissions: options.includePermissions ?? this.defaults.updateOneOptions?.includePermissions ?? true,
      populateAccess: options.populateAccess ?? this.defaults.updateOneOptions?.populateAccess ?? 'read',
    };
  }

  private resolveUpdateByIdArgs(args: UpdateByIdArgs<TModel> = {}) {
    return {
      populate: args.populate ?? this.defaults.updateByIdArgs?.populate,
      overrides: args.overrides ?? {},
    };
  }

  private resolveUpdateByIdOptions(options: UpdateByIdOptions = {}) {
    return {
      skim: options.skim ?? this.defaults.updateByIdOptions?.skim ?? false,
      includePermissions: options.includePermissions ?? this.defaults.updateByIdOptions?.includePermissions ?? true,
      populateAccess: options.populateAccess ?? this.defaults.updateByIdOptions?.populateAccess ?? 'read',
    };
  }

  private resolveUpsertArgs(args: UpsertArgs<TModel> = {}) {
    return {
      populate: args.populate ?? this.defaults.upsertArgs?.populate,
      overrides: args.overrides ?? {},
    };
  }

  private resolveUpsertOptions(options: UpsertOptions = {}) {
    return {
      skim: options.skim ?? this.defaults.upsertOptions?.skim ?? false,
      includePermissions: options.includePermissions ?? this.defaults.upsertOptions?.includePermissions ?? true,
      populateAccess: options.populateAccess ?? this.defaults.upsertOptions?.populateAccess ?? 'read',
    };
  }

  private resolveExistsOptions(options: ExistsOptions = {}) {
    return {
      access: options.access ?? this.defaults.existsOptions?.access ?? 'read',
      includeId: options.includeId ?? this.defaults.existsOptions?.includeId ?? false,
    };
  }

  private async getFieldPermissionAccess(ids: unknown[]) {
    const uniqueIds = uniq(ids.map((id) => String(id)).filter(Boolean));
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

  async listSub(id, sub, options?: { filter: Filter; fields: string[] }): Promise<ListResult | ErrorResult> {
    let { filter: ft, fields } = options ?? {};

    const parentDoc = await this.getParentDoc(id, sub, null, { access: 'read' });
    if (!parentDoc) return { success: false, code: Codes.NotFound };
    let result = get(parentDoc, sub) as Record<string, unknown>[];

    const [subFilter, subSelect] = await Promise.all([
      this.genFilter(`subs.${sub}.list`, ft as Filter<TModel>),
      this.genQuerySelect('list', fields, false, [sub, 'sub']),
    ]);

    if (subFilter === false) return { success: false, code: Codes.Forbidden };

    result = filterCollection(result, subFilter);
    if (subSelect) result = result.map((v) => pick(toObject(v), subSelect.concat('_id')));

    return { success: true, kind: 'list', code: Codes.Success, data: result, count: result.length };
  }

  public async readSub(
    id,
    sub,
    subId,
    options?: { fields: string[]; populate: SubPopulate | SubPopulate[] },
  ): Promise<SingleResult | ErrorResult> {
    let { fields, populate } = options ?? {};

    const parentDoc = await this.getParentDoc(id, sub, { populate }, { access: 'read' });
    if (!parentDoc) return { success: false, code: Codes.NotFound };
    const result = get(parentDoc, sub) as Record<string, unknown>[];

    const [subFilter, subSelect] = await Promise.all([
      this.genFilter(`subs.${sub}.read`, { _id: subId }),
      this.genQuerySelect('read', fields, false, [sub, 'sub']),
    ]);

    if (subFilter === false) return { success: false, code: Codes.Forbidden };

    let subdoc = findElement(result, subFilter) as Record<string, unknown> | undefined;
    if (!subdoc) return { success: false, code: Codes.NotFound };

    if (subSelect) subdoc = pick(toObject(subdoc), subSelect.concat(['_id']));
    return { success: true, kind: 'single', code: Codes.Success, data: subdoc };
  }

  public async updateSub(id, sub, subId, data): Promise<SingleResult | ErrorResult> {
    const parentDoc = await this.getParentDoc(id, sub, null, { access: 'update' });
    if (!parentDoc) return { success: false, code: Codes.NotFound };
    const result = get(parentDoc, sub) as Record<string, unknown>[];

    const [subFilter, subReadSelect, subUpdateSelect] = await Promise.all([
      this.genFilter(`subs.${sub}.update`, { _id: subId }),
      this.genQuerySelect('read', null, false, [sub, 'sub']),
      this.genQuerySelect('update', null, false, [sub, 'sub']),
    ]);

    if (subFilter === false) return { success: false, code: Codes.Forbidden };

    let subdoc = findElement(result, subFilter) as Record<string, unknown> | undefined;
    if (!subdoc) return { success: false, code: Codes.NotFound };

    const allowedData = pick(data, subUpdateSelect);
    Object.assign(subdoc, allowedData);

    await parentDoc.save();
    if (subReadSelect) subdoc = pick(toObject(subdoc), subReadSelect.concat(['_id']));
    return { success: true, kind: 'single', code: Codes.Success, data: subdoc };
  }

  public async bulkUpdateSub(id, sub, data): Promise<ListResult | ErrorResult> {
    const parentDoc = await this.getParentDoc(id, sub, null, { access: 'update' });
    if (!parentDoc) return { success: false, code: Codes.NotFound };
    let result = get(parentDoc, sub) as Array<Record<string, unknown> & { _id?: unknown }>;

    data = castArray(data);

    const [subFilter, subReadSelect, subUpdateSelect] = await Promise.all([
      this.genFilter(`subs.${sub}.update`, { _id: { $in: data.map((v) => v._id) } }),
      this.genQuerySelect('read', null, false, [sub, 'sub']),
      this.genQuerySelect('update', null, false, [sub, 'sub']),
    ]);

    if (subFilter === false) return { success: false, code: Codes.Forbidden };

    result = filterCollection(result, subFilter);
    forEach(result, (subdoc: Record<string, unknown> & { _id?: unknown }) => {
      const tdata = findElementById(data, subdoc._id as string);
      if (!tdata) return;

      const allowedData = pick(tdata as object, subUpdateSelect);
      Object.assign(subdoc, allowedData);
    });

    await parentDoc.save();
    if (subReadSelect) result = result.map((v) => pick(toObject(v), subReadSelect.concat(['_id'])));
    return { success: true, kind: 'list', code: Codes.Success, data: result, count: result.length };
  }

  public async createSub(id, sub, data, options?: { addFirst: boolean }): Promise<ListResult | ErrorResult> {
    const { addFirst } = options ?? {};

    const parentDoc = await this.getParentDoc(id, sub, null, { access: 'update' });
    if (!parentDoc) return { success: false, code: Codes.NotFound };
    let result = get(parentDoc, sub) as Record<string, unknown>[];

    const [subCreateSelect, subReadSelect] = await Promise.all([
      this.genQuerySelect('create', null, false, [sub, 'sub']),
      this.genQuerySelect('read', null, false, [sub, 'sub']),
    ]);

    const allowedData = pick(data, subCreateSelect);
    addFirst === true ? result.unshift(allowedData) : result.push(allowedData);

    await parentDoc.save();
    if (subReadSelect) result = result.map((v) => pick(toObject(v), subReadSelect.concat(['_id'])));
    return { success: true, kind: 'list', code: Codes.Created, data: result, count: result.length };
  }

  public async deleteSub(id, sub, subId): Promise<SingleResult | ErrorResult> {
    const parentDoc = await this.getParentDoc(id, sub, null, { access: 'update' });
    if (!parentDoc) return { success: false, code: Codes.NotFound };
    const result = get(parentDoc, sub) as Array<
      Record<string, unknown> & { _id?: unknown; deleteOne?: () => Promise<unknown>; remove?: () => Promise<unknown> }
    >;

    const subFilter = await this.genFilter(`subs.${sub}.delete`, { _id: subId });
    if (subFilter === false) return { success: false, code: Codes.Forbidden };

    const subdoc = findElement(result, subFilter) as
      | (Record<string, unknown> & {
          _id?: unknown;
          deleteOne?: () => Promise<unknown>;
          remove?: () => Promise<unknown>;
        })
      | undefined;
    if (!subdoc) return { success: false, code: Codes.NotFound };

    // starting from version 7.x, the 'deleteOne' method replaces the 'remove' method for subdocuments.
    // see https://mongoosejs.com/docs/subdocs.html#removing-subdocs
    await ('deleteOne' in subdoc ? subdoc.deleteOne?.() : subdoc.remove?.());
    await parentDoc.save();
    return { success: true, kind: 'single', code: Codes.Success, data: subdoc._id };
  }

  public async getParentDoc(
    id,
    sub,
    args?: { populate?: SubPopulate | SubPopulate[] },
    options?: { access?: BaseFilterAccess; lean?: boolean },
  ) {
    const { populate } = args ?? {};
    const { access = 'read', lean = false } = options ?? {};

    const parentFilter = await this.genFilter(access, await this.genIDFilter(id));

    if (parentFilter === false) return null;
    return this.model.findOne({ filter: parentFilter, select: sub, populate: genSubPopulate(sub, populate), lean });
  }
}
