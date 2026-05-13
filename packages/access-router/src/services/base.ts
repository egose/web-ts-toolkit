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
  isPlainObject,
  map,
  pick,
  set,
  uniq,
} from '@web-ts-toolkit/utils';
import { getModelOption } from '../options';
import { iterateQuery, setDocValue, genPagination, normalizeSelect, populateDoc } from '../helpers';
import {
  ErrorResult,
  Filter,
  Include,
  ListResult,
  MiddlewareContext,
  ModelRequest,
  Populate,
  Projection,
  SelectAccess,
  DocPermissionsAccess,
  DecorateAccess,
  DecorateAllAccess,
  ValidateAccess,
  PrepareAccess,
  TransformAccess,
  AfterPersistAccess,
  DeleteAccess,
  BaseFilterAccess,
  SingleResult,
  ServiceResult,
  SubQueryEntry,
  Task,
} from '../interfaces';
import { FilterOperator } from '../enums';

export function validateClientFilter(filter: Filter | null | undefined): string[] {
  const errors: string[] = [];
  const blockedOperators = new Set(['$where', '$expr', '$function', '$accumulator']);

  const visit = (value: unknown, path: string) => {
    if (isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }

    if (!isPlainObject(value)) return;

    Object.entries(value).forEach(([key, child]) => {
      const nextPath = path ? `${path}.${key}` : key;

      if (blockedOperators.has(key)) {
        errors.push(`Unsupported filter operator: ${nextPath}`);
        return;
      }

      visit(child, nextPath);
    });
  };

  visit(filter, 'filter');
  return errors;
}

export class Base<TModel = unknown> {
  req: ModelRequest;
  modelName: string;

  constructor(req: ModelRequest, modelName: string) {
    this.req = req;
    this.modelName = modelName;
  }

  public decorate<T>(doc: T, access: DecorateAccess, context: MiddlewareContext): Promise<T> {
    return this.req.macl.decorate(this.modelName, doc, access, context);
  }

  public decorateAll<T>(docs: T[], access: DecorateAllAccess, context: MiddlewareContext): Promise<T[]> {
    return this.req.macl.decorateAll(this.modelName, docs, access, context);
  }

  public genAllowedFields(doc: unknown, access: SelectAccess, baseFields?: string[]): Promise<string[]> {
    return this.req.macl.genAllowedFields(this.modelName, doc, access, baseFields);
  }

  public genDocPermissions(
    doc: unknown,
    access: DocPermissionsAccess,
    context: MiddlewareContext,
  ): Promise<Record<string, unknown>> {
    return this.req.macl.genDocPermissions(this.modelName, doc, access, context);
  }

  public genFilter(access?: BaseFilterAccess, filter?: Filter<TModel>): Promise<Filter<TModel>> {
    return this.req.macl.genFilter<TModel>(this.modelName, access, filter);
  }

  public getIdentifier(): string | null {
    return this.req.macl.getIdentifier(this.modelName);
  }

  public genIDFilter(id: string): Promise<Filter<TModel>> {
    return this.req.macl.genIDFilter<TModel>(this.modelName, id);
  }

  public genPopulate(access?: SelectAccess, populate?: Populate | Populate[] | string | null): Promise<Populate[]> {
    return this.req.macl.genPopulate(this.modelName, access, populate) as Promise<Populate[]>;
  }

  public genSelect(
    access: SelectAccess,
    targetFields?: Projection,
    skipChecks?: boolean,
    subPaths?: string[],
  ): Promise<string[]> {
    return this.req.macl.genSelect(this.modelName, access, targetFields, skipChecks, subPaths);
  }

  public genQuerySelect(
    access: SelectAccess,
    targetFields?: Projection,
    skipChecks?: boolean,
    subPaths?: string[],
  ): Promise<string[]> {
    return this.genSelect(access, targetFields, skipChecks, subPaths);
  }

  public addEmptyPermissions<T>(doc: T): T {
    return this.req.macl.addEmptyPermissions(this.modelName, doc);
  }

  public addDocPermissions<T>(doc: T, access: DocPermissionsAccess, context: MiddlewareContext): Promise<T> {
    return this.req.macl.addDocPermissions(this.modelName, doc, access, context);
  }

  public addFieldPermissions<T extends { _id?: unknown }>(
    doc: T,
    access: DocPermissionsAccess,
    context: MiddlewareContext,
  ): Promise<T> {
    return this.req.macl.addFieldPermissions(this.modelName, doc, access, context);
  }

  public pickAllowedFields<T>(doc: T, access: SelectAccess, baseFields?: string[]): Promise<T> {
    return this.req.macl.pickAllowedFields(this.modelName, doc, access, baseFields);
  }

  public trimOutputFields<T>(doc: T, access: SelectAccess, baseFields?: string[]): Promise<T> {
    return this.pickAllowedFields(doc, access, baseFields);
  }

  public prepare<T>(allowedData: T, access: PrepareAccess, context: MiddlewareContext): Promise<T> {
    return this.req.macl.prepare(this.modelName, allowedData, access, context);
  }

  public runTasks<T extends object>(docObject: T, tasks: Task | Task[]): T {
    return this.req.macl.runTasks(this.modelName, docObject, tasks);
  }

  public transform<T>(doc: T, access: TransformAccess, context: MiddlewareContext): Promise<T> {
    return this.req.macl.transform(this.modelName, doc, access, context);
  }

  public afterPersist<T>(doc: T, access: AfterPersistAccess, context: MiddlewareContext): Promise<T> {
    return this.req.macl.afterPersist(this.modelName, doc, access, context);
  }

  public changes(doc: Record<string, unknown>, context: MiddlewareContext): Promise<void> {
    return this.req.macl.changes(this.modelName, doc, context);
  }

  public beforeDelete<T>(doc: T, access: DeleteAccess, context: MiddlewareContext): Promise<void> {
    return this.req.macl.beforeDelete(this.modelName, doc, access, context);
  }

  public afterDelete<T>(doc: T, access: DeleteAccess, context: MiddlewareContext): Promise<void> {
    return this.req.macl.afterDelete(this.modelName, doc, access, context);
  }

  public validate(
    allowedData: unknown,
    access: ValidateAccess,
    context: MiddlewareContext,
  ): Promise<boolean | unknown[]> {
    return this.req.macl.validate(this.modelName, allowedData, access, context);
  }

  public checkIfModelPermissionExists(accesses: DocPermissionsAccess[]) {
    const modelPermissionKeys = getModelOption(this.modelName, '_modelPermissionKeys');
    return accesses.some((access) => modelPermissionKeys[access]?.length > 0);
  }

  protected validateClientFilter(filter: Filter | null | undefined): string[] {
    return validateClientFilter(filter);
  }

  protected processInclude(include: Include | Include[]) {
    const includes = compact(castArray(include)).filter(({ model, op, path, localField, foreignField }) => {
      return model && op && path && localField && foreignField;
    });

    // include Include local fields and paths
    let includeLocalFields = [];
    let includePaths = [];

    forEach(includes, (inc) => {
      includeLocalFields.push(inc.localField);
      includePaths.push(inc.path);
    });

    includeLocalFields = uniq(compact(includeLocalFields));
    includePaths = uniq(compact(includePaths));

    return {
      includes,
      includeLocalFields,
      includePaths,
    };
  }

  protected async includeDocs(docs, include: Include | Include[]) {
    if (!include) return docs;

    const includes = compact(castArray(include));
    if (includes.length === 0) return docs;

    const isSingle = !isArray(docs);
    if (isSingle) docs = [docs];

    for (let x = 0; x < includes.length; x++) {
      const include = includes[x];

      if (include.op === 'count') {
        docs = await this.includeDocsCount(docs, include);
      } else {
        docs = await this.includeDocsList(docs, include);
      }
    }

    return isSingle ? docs[0] : docs;
  }

  private async includeDocsList(docs, include: Include) {
    const { model, op, path, localField, foreignField, filter: _filters, args = {}, options = {} } = include;

    const svc = this.req.macl.getPublicService(model);
    if (!svc) return docs;

    const includeLocalValues = [];
    forEach(docs, (doc, i) => {
      includeLocalValues.push(get(doc, localField));
    });

    const filter = { ...(_filters ?? {}), [foreignField]: { $in: flatten(includeLocalValues) } };
    const result = await svc.find(filter, args, {
      ...(options as Record<string, unknown>),
      lean: true,
      includePermissions: false,
      includeCount: false,
    });

    if (!result.success) return docs;

    for (let y = 0; y < docs.length; y++) {
      const doc = docs[y];
      const localValue = get(doc, localField);
      const filterFn = (row) =>
        intersectionBy(castArray(localValue), castArray(get(row, foreignField)), String).length > 0;
      const matches = result.data.filter(filterFn);
      setDocValue(doc, path, op === 'list' ? matches : matches[0]);
    }

    return docs;
  }

  private async includeDocsCount(docs, include: Include) {
    const { model, path, localField, foreignField, filter: _filters } = include;

    const svc = this.req.macl.getPublicService(model);
    if (!svc) return docs;

    for (let y = 0; y < docs.length; y++) {
      const doc = docs[y];
      const localValue = get(doc, localField);
      const filter = { ...(_filters ?? {}), [foreignField]: localValue };
      const result = await svc.count(filter);
      if (!result.success) continue;

      setDocValue(doc, path, result.data);
    }

    return docs;
  }

  protected async parseClientData<TValue>(filter: TValue): Promise<TValue> {
    const result = await iterateQuery(filter, async (fo: FilterOperator, val: unknown, key: string) => {
      switch (fo) {
        case FilterOperator.SubQuery:
          return this.handleSubQuery(val as SubQueryEntry, key);
        case FilterOperator.Date:
          return this.handleDate(val, key);
        default:
          return null;
      }
    });

    return result as TValue;
  }

  private async handleSubQuery(sq: SubQueryEntry, key: string) {
    const { model, op, id, filter, args, options, sqOptions = {} } = sq;

    const svc = this.req.macl.getPublicService(model);
    if (!svc) return null;

    let result!: ErrorResult | SingleResult | ListResult;

    if (op === 'list') {
      result = await svc.find(filter, args, options);
    } else if (op === 'read') {
      if (id) {
        result = await svc.findById(id, args, options);
      } else if (filter) {
        result = await svc.findOne(filter, args, options);
      } else {
        return null;
      }
    } else {
      return null;
    }

    if (!result.success) return null;

    let ret = result.data;
    if (sqOptions.path) {
      ret = isArray(ret) ? flatten(ret.map((v) => get(v, sqOptions.path))) : get(ret, sqOptions.path);
    }

    if (sqOptions.compact) {
      ret = compact(castArray(ret));
    }

    return ret;
  }

  private async handleDate(val: unknown, key: string) {
    return new Date();
  }
}
