import {
  castArray,
  cloneDeep,
  compact,
  flatten,
  forEach,
  get,
  isArray,
  isBoolean,
  isFunction,
  isNil,
  isPlainObject,
  set,
  uniq,
} from '@web-ts-toolkit/utils';
import { getGlobalOption, getModelOption } from '../options';
import { iterateQuery, setDocValue } from '../helpers';
import { toObject } from '../helpers/document';
import { isValidFieldPath } from '../helpers/sort-policy';
import { RequestConcurrencyScheduler } from '../helpers/concurrency';
import {
  ErrorResult,
  Filter,
  Include,
  CorrelatedInclude,
  LegacyInclude,
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
import {
  collectCorrelatedReferencePaths,
  containsParentMarkerShape,
  CorrelatedReferenceError,
  isCorrelatedInclude,
  resolveCorrelatedFilterTemplate,
  resolveCorrelatedIdTemplate,
  validateCorrelatedIncludeShape,
  validateExpandedCorrelatedOperands,
} from '../correlated-includes';
import { Codes, FilterOperator } from '../enums';
import { resolveRequestComplexity, validateRequestComplexity } from '../request-complexity';
import { getActiveRuntime } from '../runtime-context';

type CrossResourceModelOperation = 'list' | 'read' | 'count';

interface CorrelatedExecState {
  totalQueries: number;
  scheduler: RequestConcurrencyScheduler;
}

const correlatedExecStates = new WeakMap<object, CorrelatedExecState>();

function getCorrelatedTemplateDepth(includes: CorrelatedInclude[]): number {
  let max = 0;
  const visit = (entries: unknown, depth: number) => {
    const list = castArray(entries as CorrelatedInclude | CorrelatedInclude[]).filter(Boolean);
    for (const entry of list) {
      if (!isPlainObject(entry)) continue;
      max = Math.max(max, depth);
      const nested = (entry as { args?: { include?: unknown } }).args?.include;
      if (nested !== undefined) {
        visit(nested as unknown, depth + 1);
      }
    }
  };
  if (includes.length > 0) visit(includes as unknown, 1);
  return max;
}
type ForeignKeyIndex<TValue> = Map<string, TValue[]>;
type ForeignKeyCountIndex = Map<string, Set<string>>;

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

  public genPopulate(
    access?: SelectAccess,
    populate?: Populate | Populate[] | string | null,
    subPaths?: string[],
  ): Promise<Populate[]> {
    return this.req.macl.genPopulate(this.modelName, access, populate, subPaths) as Promise<Populate[]>;
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
    const items = compact(castArray(include));
    const legacy: LegacyInclude[] = [];
    const correlated: CorrelatedInclude[] = [];
    const correlatedReferenceFields: string[] = [];

    for (const entry of items) {
      // Correlated entries are never silently dropped or reinterpreted as
      // legacy includes: malformed correlated input fails closed here so
      // service-direct callers get the same controlled error as HTTP
      // validation (ACI-02 requirement 1; execution lands in ACI-03).
      if (isCorrelatedInclude(entry)) {
        const shapeErrors = validateCorrelatedIncludeShape(entry);
        if (shapeErrors.length > 0) {
          this.throwClientRequestError(Codes.BadRequest, shapeErrors[0]);
        }
        correlated.push(entry);
        correlatedReferenceFields.push(...collectCorrelatedReferencePaths(entry));
        continue;
      }

      // A legacy-shaped entry carrying $parent markers is malformed
      // correlated input, never an ordinary legacy include (ACI-01 D1.2).
      if (containsParentMarkerShape(entry)) {
        this.throwClientRequestError(
          Codes.BadRequest,
          'Legacy includes must not contain $parent markers; use a correlated include (mode: "correlated")',
        );
      }

      const candidate = entry as Partial<LegacyInclude>;
      if (candidate.model && candidate.op && candidate.path && candidate.localField && candidate.foreignField) {
        legacy.push(entry as LegacyInclude);
      }
      // Preserve the legacy silent-drop for malformed legacy entries that
      // carry no correlated signals.
    }

    const seenCorrelatedPaths = new Set<string>();
    for (const entry of correlated) {
      if (seenCorrelatedPaths.has(entry.path)) {
        this.throwClientRequestError(Codes.BadRequest, `Duplicate correlated include output path: ${entry.path}`);
      }
      seenCorrelatedPaths.add(entry.path);
    }

    // include Include local fields and paths
    let includeLocalFields: string[] = [];
    let includePaths: string[] = [];

    forEach(legacy, (inc) => {
      includeLocalFields.push(inc.localField);
      includePaths.push(inc.path);
    });

    includeLocalFields = uniq(compact(includeLocalFields));
    includePaths = uniq(compact(includePaths));

    return {
      includes: legacy,
      correlatedIncludes: correlated,
      includeLocalFields,
      includePaths,
      correlatedReferenceFields: uniq(compact(correlatedReferenceFields)),
    };
  }

  private getForeignKeyValues(value: unknown): unknown[] {
    return flatten(castArray(value));
  }

  private getForeignKey(value: unknown): string {
    return String(value);
  }

  private buildForeignKeyIndex<TValue>(rows: TValue[], foreignField: string): ForeignKeyIndex<TValue> {
    const index: ForeignKeyIndex<TValue> = new Map();

    for (const row of rows) {
      for (const value of this.getForeignKeyValues(get(row, foreignField))) {
        const key = this.getForeignKey(value);
        const values = index.get(key);
        if (values) values.push(row);
        else index.set(key, [row]);
      }
    }

    return index;
  }

  private getIndexedMatches<TValue>(index: ForeignKeyIndex<TValue>, localValue: unknown): TValue[] {
    const seen = new Set<TValue>();
    const matches: TValue[] = [];

    for (const value of this.getForeignKeyValues(localValue)) {
      for (const row of index.get(this.getForeignKey(value)) ?? []) {
        if (seen.has(row)) continue;
        seen.add(row);
        matches.push(row);
      }
    }

    return matches;
  }

  private getIndexedCount(index: ForeignKeyCountIndex, localValue: unknown): number {
    const ids = new Set<string>();

    for (const value of this.getForeignKeyValues(localValue)) {
      for (const id of index.get(this.getForeignKey(value)) ?? []) {
        ids.add(id);
      }
    }

    return ids.size;
  }

  private sanitizeIncludeArgs(args: unknown): Record<string, unknown> {
    if (!isPlainObject(args)) return {};
    const { overrides: _clientOverrides, ...trustedArgs } = args as Record<string, unknown>;
    return trustedArgs;
  }

  private assertIncludeForeignField(include: LegacyInclude): void {
    if (!isValidFieldPath(include.foreignField)) {
      this.throwClientRequestError(Codes.BadRequest, `Invalid include foreignField: ${include.foreignField}`);
    }
  }

  protected async includeDocs<TDoc>(docs: TDoc | TDoc[], include: Include | Include[]): Promise<TDoc | TDoc[]> {
    if (!include) return docs;

    const includes = compact(castArray(include));
    if (includes.length === 0) return docs;

    const isSingle = !isArray(docs);
    let docList: TDoc[] = isSingle ? [docs as TDoc] : (docs as TDoc[]);

    for (let x = 0; x < includes.length; x++) {
      const include = includes[x];
      // Correlated execution lands in ACI-03. Reaching the legacy executor
      // with a correlated entry is a programming error: fail closed instead
      // of silently skipping the include.
      if (isCorrelatedInclude(include)) {
        this.throwClientRequestError(
          Codes.BadRequest,
          'Correlated includes are not supported by the legacy include executor',
        );
      }
      this.assertIncludeForeignField(include);

      switch (include.op) {
        case 'count':
          docList = await this.includeDocsCount<TDoc>(docList, include);
          break;
        case 'read':
          docList = await this.includeDocsRead<TDoc>(docList, include);
          break;
        case 'list':
          docList = await this.includeDocsList<TDoc>(docList, include);
          break;
      }
    }

    return isSingle ? docList[0] : docList;
  }

  private async includeDocsRead<TDoc>(docs: TDoc[], include: LegacyInclude): Promise<TDoc[]> {
    const { model, path, localField, foreignField, filter: _filters, args = {}, options = {} } = include;

    const svc = await this.getAuthorizedTargetService(model, 'read');

    for (let y = 0; y < docs.length; y++) {
      const doc = docs[y];
      const localValue = get(doc, localField);
      const filter = { ...(_filters ?? {}), [foreignField]: { $in: this.getForeignKeyValues(localValue) } };
      const trustedOptions = {
        ...(options as Record<string, unknown>),
        access: 'read',
        lean: true,
        includePermissions: false,
      };
      const result = await svc.findOne(filter, this.sanitizeIncludeArgs(args) as never, trustedOptions as never);

      if (result.success) {
        setDocValue(doc, path, result.data);
      }
    }

    return docs;
  }

  private async includeDocsList<TDoc>(docs: TDoc[], include: LegacyInclude): Promise<TDoc[]> {
    const { model, op, path, localField, foreignField, filter: _filters, args = {}, options = {} } = include;

    const svc = await this.getAuthorizedTargetService(model, op);

    const includeLocalValues: unknown[] = [];
    forEach(docs, (doc) => {
      includeLocalValues.push(...this.getForeignKeyValues(get(doc, localField)));
    });

    const filter = { ...(_filters ?? {}), [foreignField]: { $in: flatten(includeLocalValues) } };
    const authorizedFilter = await svc.genFilter(op, filter);
    const trustedArgs = {
      ...this.sanitizeIncludeArgs(args),
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

    const index = this.buildForeignKeyIndex(trustedResult.data, foreignField);

    for (let y = 0; y < docs.length; y++) {
      const doc = docs[y];
      const matches = this.getIndexedMatches(index, get(doc, localField));
      setDocValue(doc, path, op === 'list' ? matches : matches[0]);
    }

    return docs;
  }

  private async includeDocsCount<TDoc>(docs: TDoc[], include: LegacyInclude): Promise<TDoc[]> {
    const { model, path, localField, foreignField, filter: _filters } = include;

    const svc = await this.getAuthorizedTargetService(model, 'count');

    const localValues = docs.flatMap((doc) => this.getForeignKeyValues(get(doc, localField)));
    const result = await svc.countByFieldValues(foreignField, localValues, _filters ?? {}, 'count');

    if (!result.success) return docs;

    for (let y = 0; y < docs.length; y++) {
      const doc = docs[y];
      setDocValue(doc, path, this.getIndexedCount(result.data, get(doc, localField)));
    }

    return docs;
  }

  protected getCorrelatedExecState(): CorrelatedExecState {
    const key = this.req as object;
    let state = correlatedExecStates.get(key);
    if (!state) {
      state = {
        totalQueries: 0,
        scheduler: new RequestConcurrencyScheduler(this.getRequestComplexity().maxBulkConcurrency),
      };
      correlatedExecStates.set(key, state);
    }
    return state;
  }

  protected claimCorrelatedQuerySlot(): void {
    const limits = this.getRequestComplexity();
    const state = this.getCorrelatedExecState();
    if (state.totalQueries >= limits.maxCorrelatedQueries) {
      this.throwClientRequestError(
        Codes.BadRequest,
        `Correlated include query budget exceeded (max ${limits.maxCorrelatedQueries})`,
      );
    }
    state.totalQueries += 1;
  }

  private sanitizeCorrelatedArgs(include: CorrelatedInclude): {
    select?: unknown;
    sort?: unknown;
    skip?: unknown;
    limit?: unknown;
    page?: unknown;
    pageSize?: unknown;
    nestedInclude?: unknown;
  } {
    const args = (include.args ?? {}) as Record<string, unknown>;
    if (include.op === 'list') {
      const { select, sort, skip, limit, page, pageSize, include: nestedInclude } = args;
      return { select, sort, skip, limit, page, pageSize, nestedInclude };
    }
    const { select, sort, include: nestedInclude } = args;
    return { select, sort, nestedInclude };
  }

  protected async includeCorrelatedDocs<TDoc>(
    docs: TDoc[],
    correlatedIncludes: CorrelatedInclude[],
    snapshots?: unknown[],
    depth = 0,
  ): Promise<TDoc[]> {
    if (correlatedIncludes.length === 0) return docs;

    const limits = this.getRequestComplexity();
    const templateDepth = getCorrelatedTemplateDepth(correlatedIncludes);
    if (depth + templateDepth > limits.maxCorrelatedDepth) {
      this.throwClientRequestError(
        Codes.BadRequest,
        `Correlated include depth exceeded (max ${limits.maxCorrelatedDepth})`,
      );
    }

    const state = this.getCorrelatedExecState();
    const resolvedSnapshots: unknown[] = snapshots ?? docs.map((doc) => cloneDeep(toObject(doc)) as unknown);

    for (const include of correlatedIncludes) {
      switch (include.op) {
        case 'read':
          await this.includeCorrelatedRead(docs, include, resolvedSnapshots, state, depth);
          break;
        case 'list':
          await this.includeCorrelatedList(docs, include, resolvedSnapshots, state, depth);
          break;
        case 'count':
          await this.includeCorrelatedCount(docs, include, resolvedSnapshots, state, depth);
          break;
        default:
          this.throwClientRequestError(
            Codes.BadRequest,
            `Unsupported correlated include op: ${(include as { op?: unknown }).op}`,
          );
      }
    }

    return docs;
  }

  private async includeCorrelatedRead<TDoc>(
    docs: TDoc[],
    include: CorrelatedInclude,
    snapshots: unknown[],
    state: CorrelatedExecState,
    depth: number,
  ): Promise<void> {
    const svc = await this.getAuthorizedTargetService(include.model, 'read');
    const { select, sort, nestedInclude } = this.sanitizeCorrelatedArgs(include);
    const hasId = (include as { id?: unknown }).id !== undefined;

    if (hasId) {
      const idTemplate = (include as { id: unknown }).id;
      const tasks = docs.map((_, index) => ({ index, snapshot: snapshots[index] }));
      await state.scheduler.map(tasks, async ({ index, snapshot }) => {
        let resolution: { status: string; id?: string };
        try {
          resolution = resolveCorrelatedIdTemplate(idTemplate, snapshot);
        } catch (error) {
          if (error instanceof CorrelatedReferenceError) {
            throw new ClientRequestError({
              success: false,
              kind: 'error',
              code: Codes.BadRequest,
              errors: [{ detail: error.message }],
            });
          }
          throw error;
        }
        if (resolution.status === 'unresolvable') {
          setDocValue(docs[index], include.path, null);
          return;
        }
        const resolvedId = (resolution as { id: string }).id;
        // Preserve custom identifier behavior via the target's genIDFilter,
        // then authorize the resulting filter with explicit read access.
        // No read->list fallback by construction (Service.findOne has none).
        let idFilter: Filter;
        try {
          idFilter = await svc.genIDFilter(resolvedId);
        } catch (error) {
          const clientResult = this.getClientRequestErrorResult(error);
          if (clientResult) throw new ClientRequestError(clientResult);
          throw error;
        }
        const authorized = await svc.genFilter('read', idFilter);
        if (authorized === false) {
          throw new ClientRequestError({ success: false, kind: 'error', code: Codes.Forbidden });
        }
        this.claimCorrelatedQuerySlot();
        let result: SingleResult | ErrorResult;
        try {
          result = await svc.findOne(
            {},
            {
              select: select as never,
              sort: sort as never,
              include: nestedInclude as never,
              overrides: { filter: authorized as never },
            },
            { access: 'read', lean: true, includePermissions: false } as never,
          );
        } catch (error) {
          const clientResult = this.getClientRequestErrorResult(error);
          if (clientResult) throw new ClientRequestError(clientResult);
          throw error;
        }
        if (result.success) {
          setDocValue(docs[index], include.path, result.data);
        } else if (result.code === Codes.NotFound) {
          setDocValue(docs[index], include.path, null);
        } else {
          throw new ClientRequestError(result as ErrorResult);
        }
      });
      return;
    }

    const filterTemplate = (include as { filter: Record<string, unknown> }).filter;
    const templateErrors = this.validateClientFilter(filterTemplate as never);
    if (templateErrors.length > 0) {
      this.throwClientRequestError(Codes.BadRequest, templateErrors[0]);
    }
    let parsedTemplate: Record<string, unknown>;
    try {
      parsedTemplate = (await this.parseClientData(
        filterTemplate as Record<string, unknown>,
        state.scheduler,
      )) as Record<string, unknown>;
    } catch (error) {
      const clientResult = this.getClientRequestErrorResult(error);
      if (clientResult) throw new ClientRequestError(clientResult);
      throw error;
    }
    const tasks = docs.map((_, index) => ({ index, snapshot: snapshots[index] }));
    await state.scheduler.map(tasks, async ({ index, snapshot }) => {
      let resolution;
      try {
        resolution = resolveCorrelatedFilterTemplate(parsedTemplate, snapshot);
      } catch (error) {
        if (error instanceof CorrelatedReferenceError) {
          throw new ClientRequestError({
            success: false,
            kind: 'error',
            code: Codes.BadRequest,
            errors: [{ detail: error.message }],
          });
        }
        throw error;
      }
      if (resolution.status === 'unresolvable') {
        setDocValue(docs[index], include.path, null);
        return;
      }
      const expanded = resolution.filter;
      const operandErrors = validateExpandedCorrelatedOperands(expanded, this.getRequestComplexity());
      if (operandErrors.length > 0) {
        throw new ClientRequestError({
          success: false,
          kind: 'error',
          code: Codes.BadRequest,
          errors: [{ detail: operandErrors[0].detail }],
        });
      }
      const authorized = await svc.genFilter('read', expanded as never);
      if (authorized === false) {
        throw new ClientRequestError({ success: false, kind: 'error', code: Codes.Forbidden });
      }
      this.claimCorrelatedQuerySlot();
      let result: SingleResult | ErrorResult;
      try {
        result = await svc.findOne(
          {},
          {
            select: select as never,
            sort: sort as never,
            include: nestedInclude as never,
            overrides: { filter: authorized as never },
          },
          { access: 'read', lean: true, includePermissions: false } as never,
        );
      } catch (error) {
        const clientResult = this.getClientRequestErrorResult(error);
        if (clientResult) throw new ClientRequestError(clientResult);
        throw error;
      }
      if (result.success) {
        setDocValue(docs[index], include.path, result.data);
      } else if (result.code === Codes.NotFound) {
        setDocValue(docs[index], include.path, null);
      } else {
        throw new ClientRequestError(result as ErrorResult);
      }
    });
    void depth;
  }

  private async includeCorrelatedList<TDoc>(
    docs: TDoc[],
    include: CorrelatedInclude,
    snapshots: unknown[],
    state: CorrelatedExecState,
    depth: number,
  ): Promise<void> {
    const svc = await this.getAuthorizedTargetService(include.model, 'list');
    const { select, sort, skip, limit, page, pageSize, nestedInclude } = this.sanitizeCorrelatedArgs(include);
    const filterTemplate = (include as { filter: Record<string, unknown> }).filter;
    const templateErrors = this.validateClientFilter(filterTemplate as never);
    if (templateErrors.length > 0) {
      this.throwClientRequestError(Codes.BadRequest, templateErrors[0]);
    }
    let parsedTemplate: Record<string, unknown>;
    try {
      parsedTemplate = (await this.parseClientData(
        filterTemplate as Record<string, unknown>,
        state.scheduler,
      )) as Record<string, unknown>;
    } catch (error) {
      const clientResult = this.getClientRequestErrorResult(error);
      if (clientResult) throw new ClientRequestError(clientResult);
      throw error;
    }
    const tasks = docs.map((_, index) => ({ index, snapshot: snapshots[index] }));
    await state.scheduler.map(tasks, async ({ index, snapshot }) => {
      let resolution;
      try {
        resolution = resolveCorrelatedFilterTemplate(parsedTemplate, snapshot);
      } catch (error) {
        if (error instanceof CorrelatedReferenceError) {
          throw new ClientRequestError({
            success: false,
            kind: 'error',
            code: Codes.BadRequest,
            errors: [{ detail: error.message }],
          });
        }
        throw error;
      }
      if (resolution.status === 'unresolvable') {
        setDocValue(docs[index], include.path, []);
        return;
      }
      const expanded = resolution.filter;
      const operandErrors = validateExpandedCorrelatedOperands(expanded, this.getRequestComplexity());
      if (operandErrors.length > 0) {
        throw new ClientRequestError({
          success: false,
          kind: 'error',
          code: Codes.BadRequest,
          errors: [{ detail: operandErrors[0].detail }],
        });
      }
      const authorized = await svc.genFilter('list', expanded as never);
      if (authorized === false) {
        throw new ClientRequestError({ success: false, kind: 'error', code: Codes.Forbidden });
      }
      this.claimCorrelatedQuerySlot();
      let result: ListResult | ErrorResult;
      try {
        result = await svc.find(
          {},
          {
            select: select as never,
            sort: sort as never,
            skip: skip as never,
            limit: limit as never,
            page: page as never,
            pageSize: pageSize as never,
            include: nestedInclude as never,
            overrides: { filter: authorized as never },
          },
          { includeCount: false, lean: true, includePermissions: false } as never,
        );
      } catch (error) {
        const clientResult = this.getClientRequestErrorResult(error);
        if (clientResult) throw new ClientRequestError(clientResult);
        throw error;
      }
      if (result.success) {
        setDocValue(docs[index], include.path, result.data);
      } else {
        throw new ClientRequestError(result as ErrorResult);
      }
    });
    void depth;
  }

  private async includeCorrelatedCount<TDoc>(
    docs: TDoc[],
    include: CorrelatedInclude,
    snapshots: unknown[],
    state: CorrelatedExecState,
    depth: number,
  ): Promise<void> {
    const svc = await this.getAuthorizedTargetService(include.model, 'count');
    const filterTemplate = (include as { filter: Record<string, unknown> }).filter;
    const templateErrors = this.validateClientFilter(filterTemplate as never);
    if (templateErrors.length > 0) {
      this.throwClientRequestError(Codes.BadRequest, templateErrors[0]);
    }
    const tasks = docs.map((_, index) => ({ index, snapshot: snapshots[index] }));
    await state.scheduler.map(tasks, async ({ index, snapshot }) => {
      let resolution;
      try {
        resolution = resolveCorrelatedFilterTemplate(filterTemplate as Record<string, unknown>, snapshot);
      } catch (error) {
        if (error instanceof CorrelatedReferenceError) {
          throw new ClientRequestError({
            success: false,
            kind: 'error',
            code: Codes.BadRequest,
            errors: [{ detail: error.message }],
          });
        }
        throw error;
      }
      if (resolution.status === 'unresolvable') {
        setDocValue(docs[index], include.path, 0);
        return;
      }
      const expanded = resolution.filter;
      const operandErrors = validateExpandedCorrelatedOperands(expanded, this.getRequestComplexity());
      if (operandErrors.length > 0) {
        throw new ClientRequestError({
          success: false,
          kind: 'error',
          code: Codes.BadRequest,
          errors: [{ detail: operandErrors[0].detail }],
        });
      }
      // Explicit count access (never the Service.count list default) and
      // count semantics independent of any list limit.
      const authorized = await svc.genFilter('count', expanded as never);
      if (authorized === false) {
        throw new ClientRequestError({ success: false, kind: 'error', code: Codes.Forbidden });
      }
      this.claimCorrelatedQuerySlot();
      let result: SingleResult<number> | ErrorResult;
      try {
        result = await svc.countTrusted(authorized as never);
      } catch (error) {
        const clientResult = this.getClientRequestErrorResult(error);
        if (clientResult) throw new ClientRequestError(clientResult);
        throw error;
      }
      if (result.success) {
        setDocValue(docs[index], include.path, result.data);
      } else {
        throw new ClientRequestError(result as ErrorResult);
      }
    });
    void depth;
  }

  protected async parseClientData<TValue>(
    filter: TValue,
    scheduler = new RequestConcurrencyScheduler(this.getRequestComplexity().maxBulkConcurrency),
    scheduled = false,
  ): Promise<TValue> {
    const result = await iterateQuery(
      filter,
      async (fo: FilterOperator, val: unknown, key: string) => {
        switch (fo) {
          case FilterOperator.SubQuery:
            return this.handleSubQuery(val as SubQueryEntry, key);
          case FilterOperator.Date:
            return this.handleDate(val, key);
          default:
            return null;
        }
      },
      scheduler,
      scheduled,
    );

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
