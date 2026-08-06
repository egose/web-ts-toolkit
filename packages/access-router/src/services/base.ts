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
import { getGlobalOption, getModelOption } from '../options';
import { iterateQuery, setDocValue } from '../helpers';
import {
  ErrorResult,
  Filter,
  Include,
  ListResult,
  ModelHookContext,
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
  BaseFilterAccess,
  SingleResult,
  ServiceResult,
  SubQueryEntry,
  Task,
} from '../interfaces';
import { Codes, FilterOperator } from '../enums';
import { resolveRequestComplexity, validateRequestComplexity } from '../request-complexity';
import { getActiveRuntime } from '../runtime-context';

type CrossResourceModelOperation = 'list' | 'read' | 'count';

class ClientRequestError extends Error {
  readonly result: ErrorResult;

  constructor(result: ErrorResult) {
    super(String(result.code));
    this.result = result;
  }
}

export function validateClientFilter(filter: Filter | null | undefined): string[] {
  const errors: string[] = [];
  const complexityErrors = validateRequestComplexity(filter, getGlobalOption('requestComplexity'), 'filter');
  if (complexityErrors.length > 0) {
    return complexityErrors.map((error) => error.detail);
  }

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
  protected req: ModelRequest;
  protected modelName: string;

  constructor(req: ModelRequest, modelName: string) {
    this.req = req;
    this.modelName = modelName;
  }

  public decorate<T>(doc: T, access: DecorateAccess, context: ModelHookContext): Promise<T> {
    return this.req.macl.decorate(this.modelName, doc, access, context);
  }

  public decorateAll<T>(docs: T[], access: DecorateAllAccess, context: ModelHookContext): Promise<T[]> {
    return this.req.macl.decorateAll(this.modelName, docs, access, context);
  }

  public genAllowedFields(doc: unknown, access: SelectAccess, baseFields?: string[]): Promise<string[]> {
    return this.req.macl.genAllowedFields(this.modelName, doc, access, baseFields);
  }

  public genDocPermissions(
    doc: unknown,
    access: DocPermissionsAccess,
    context: ModelHookContext,
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

  public addDocPermissions<T>(doc: T, access: DocPermissionsAccess, context: ModelHookContext): Promise<T> {
    return this.req.macl.addDocPermissions(this.modelName, doc, access, context);
  }

  public addFieldPermissions<T extends { _id?: unknown }>(
    doc: T,
    access: DocPermissionsAccess,
    context: ModelHookContext,
  ): Promise<T> {
    return this.req.macl.addFieldPermissions(this.modelName, doc, access, context);
  }

  public pickAllowedFields<T>(doc: T, access: SelectAccess, baseFields?: string[]): Promise<T> {
    return this.req.macl.pickAllowedFields(this.modelName, doc, access, baseFields);
  }

  public trimOutputFields<T>(doc: T, access: SelectAccess, baseFields?: string[]): Promise<T> {
    return this.pickAllowedFields(doc, access, baseFields);
  }

  public prepare<T>(allowedData: T, access: PrepareAccess, context: ModelHookContext): Promise<T> {
    return this.req.macl.prepare(this.modelName, allowedData, access, context);
  }

  public runTasks<T extends object>(docObject: T, tasks: Task | Task[]): T {
    return this.req.macl.runTasks(this.modelName, docObject, tasks);
  }

  public transform<T>(doc: T, access: TransformAccess, context: ModelHookContext): Promise<T> {
    return this.req.macl.transform(this.modelName, doc, access, context);
  }

  public afterPersist<T>(doc: T, access: AfterPersistAccess, context: ModelHookContext): Promise<T> {
    return this.req.macl.afterPersist(this.modelName, doc, access, context);
  }

  public changes(doc: Record<string, unknown>, context: ModelHookContext): Promise<void> {
    return this.req.macl.changes(this.modelName, doc, context);
  }

  public beforeDelete<T>(doc: T, context: ModelHookContext): Promise<void> {
    return this.req.macl.beforeDelete(this.modelName, doc, context);
  }

  public afterDelete<T>(doc: T, context: ModelHookContext): Promise<void> {
    return this.req.macl.afterDelete(this.modelName, doc, context);
  }

  public validate(
    allowedData: unknown,
    access: ValidateAccess,
    context: ModelHookContext,
  ): Promise<boolean | unknown[]> {
    return this.req.macl.validate(this.modelName, allowedData, access, context);
  }

  public checkIfModelPermissionExists(accesses: DocPermissionsAccess[]) {
    const modelPermissionKeys = getModelOption(this.modelName, '_modelPermissionKeys' as never) as Record<
      string,
      string[]
    >;
    return accesses.some((access) => modelPermissionKeys[access]?.length > 0);
  }

  protected validateClientFilter(filter: Filter | null | undefined): string[] {
    return validateClientFilter(filter);
  }

  public getRequestComplexity() {
    return resolveRequestComplexity(getGlobalOption('requestComplexity'));
  }

  protected getClientRequestErrorResult(error: unknown): ErrorResult | null {
    return error instanceof ClientRequestError ? error.result : null;
  }

  protected throwClientRequestError(code: ErrorResult['code'], detail: string): never {
    throw new ClientRequestError({
      success: false,
      kind: 'error',
      code,
      errors: [{ detail }],
    });
  }

  protected async getAuthorizedTargetService(modelName: string, op: CrossResourceModelOperation) {
    const runtime = getActiveRuntime();
    if (runtime && !runtime.hasModel(modelName)) {
      this.throwClientRequestError(Codes.BadRequest, `Model ${modelName} not found`);
    }

    const allowed = await this.req.macl.isAllowed(modelName, op);
    if (!allowed) {
      this.throwClientRequestError(Codes.Unauthorized, 'Unauthorized');
    }

    return this.req.macl.getPublicService(modelName);
  }

  protected processInclude(include: Include | Include[]) {
    const includes = compact(castArray(include)).filter(({ model, op, path, localField, foreignField }) => {
      return model && op && path && localField && foreignField;
    });

    // include Include local fields and paths
    let includeLocalFields: string[] = [];
    let includePaths: string[] = [];

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

  protected async includeDocs<TDoc>(docs: TDoc | TDoc[], include: Include | Include[]): Promise<TDoc | TDoc[]> {
    if (!include) return docs;

    const includes = compact(castArray(include));
    if (includes.length === 0) return docs;

    const isSingle = !isArray(docs);
    let docList: TDoc[] = isSingle ? [docs as TDoc] : (docs as TDoc[]);

    for (let x = 0; x < includes.length; x++) {
      const include = includes[x];

      if (include.op === 'count') {
        docList = await this.includeDocsCount<TDoc>(docList, include);
      } else {
        docList = await this.includeDocsList<TDoc>(docList, include);
      }
    }

    return isSingle ? docList[0] : docList;
  }

  private async includeDocsList<TDoc>(docs: TDoc[], include: Include): Promise<TDoc[]> {
    const { model, op, path, localField, foreignField, filter: _filters, args = {}, options = {} } = include;

    const svc = await this.getAuthorizedTargetService(model, op);

    const includeLocalValues: unknown[] = [];
    forEach(docs, (doc, i) => {
      includeLocalValues.push(get(doc, localField));
    });

    const filter = { ...(_filters ?? {}), [foreignField]: { $in: flatten(includeLocalValues) } };
    const authorizedFilter = await svc.genFilter(op, filter);
    const trustedArgs = {
      ...(args as Record<string, unknown>),
      overrides: {
        filter: authorizedFilter,
      },
    };
    const trustedOptions = {
      ...(options as Record<string, unknown>),
      lean: true,
      includePermissions: false,
      includeCount: false,
    };
    const trustedResult = await svc.find(filter, trustedArgs as never, trustedOptions as never);

    if (!trustedResult.success) return docs;

    for (let y = 0; y < docs.length; y++) {
      const doc = docs[y];
      const localValue = get(doc, localField);
      const filterFn = (row: unknown) =>
        intersectionBy(castArray(localValue), castArray(get(row, foreignField)), String).length > 0;
      const matches = trustedResult.data.filter(filterFn);
      setDocValue(doc, path, op === 'list' ? matches : matches[0]);
    }

    return docs;
  }

  private async includeDocsCount<TDoc>(docs: TDoc[], include: Include): Promise<TDoc[]> {
    const { model, path, localField, foreignField, filter: _filters, args = {}, options = {} } = include;

    const svc = await this.getAuthorizedTargetService(model, 'count');

    const includeLocalValues: unknown[] = [];
    forEach(docs, (doc) => {
      includeLocalValues.push(get(doc, localField));
    });

    const filter = { ...(_filters ?? {}), [foreignField]: { $in: flatten(includeLocalValues) } };
    const authorizedFilter = await svc.genFilter('list', filter);
    const trustedArgs = {
      ...(args as Record<string, unknown>),
      select: [foreignField],
      overrides: {
        filter: authorizedFilter,
      },
    };
    const trustedOptions = {
      ...(options as Record<string, unknown>),
      lean: true,
      includePermissions: false,
      includeCount: false,
    };
    const result = await svc.find(filter, trustedArgs as never, trustedOptions as never);

    if (!result.success) return docs;

    for (let y = 0; y < docs.length; y++) {
      const doc = docs[y];
      const localValue = get(doc, localField);
      const filterFn = (row: unknown) =>
        intersectionBy(castArray(localValue), castArray(get(row, foreignField)), String).length > 0;

      setDocValue(doc, path, result.data.filter(filterFn).length);
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

    let result!: ErrorResult | SingleResult | ListResult;

    if (op === 'list') {
      const svc = await this.getAuthorizedTargetService(model, 'list');
      result = await svc._list(filter, args as never, options as never);
    } else if (op === 'read') {
      const svc = await this.getAuthorizedTargetService(model, 'read');
      // ARF-01: cross-resource read subqueries must not fall back to the
      // target list access path. The fallback is authorized separately above
      // and target list row/field policy would never be re-evaluated.
      const readOptions = { ...(options as object), tryList: false } as never;
      if (id) {
        result = await svc._read(id, args as never, readOptions);
      } else if (filter) {
        result = await svc._readFilter(filter, args as never, readOptions);
      } else {
        this.throwClientRequestError(Codes.BadRequest, `Subquery for field ${key} requires an id or filter`);
      }
    } else {
      this.throwClientRequestError(Codes.BadRequest, `Unsupported subquery operation: ${op}`);
    }

    if (!result.success) {
      throw new ClientRequestError(result as ErrorResult);
    }

    let ret = result.data;
    if (sqOptions.path) {
      ret = isArray(ret) ? flatten(ret.map((v) => get(v, sqOptions.path))) : get(ret, sqOptions.path);
    }

    if (sqOptions.compact) {
      ret = compact(castArray(ret));
    }

    return ret;
  }

  private handleDate(val: unknown, key: string) {
    if (val instanceof Date) return val;
    if (typeof val === 'string' || typeof val === 'number') return new Date(val);
    return new Date();
  }
}
