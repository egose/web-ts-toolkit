import { getDataOptions } from '../options';
import { findElement, filterCollection, genPagination, parseSortString } from '../helpers';
import { validateClientFilter } from './base';
import {
  DataHookContext,
  ErrorResult,
  Filter,
  ListResult,
  DataRequest,
  Projection,
  SelectedPublicOutput,
  SelectAccess,
  DecorateAccess,
  DecorateAllAccess,
  BaseFilterAccess,
  DataRouterOptions,
  DataFilter,
  DataFindOneArgs,
  DataFindOneOptions,
  DataFindArgs,
  DataFindOptions,
  SingleResult,
} from '../interfaces';
import { Codes } from '../enums';
import { orderBy, pick } from '@web-ts-toolkit/utils';

export class DataService<T> {
  protected req: DataRequest;
  protected dataName: string;
  protected options: DataRouterOptions<T>;
  protected data: T[];

  constructor(req: DataRequest, dataName: string) {
    this.req = req;
    this.dataName = dataName;
    this.options = getDataOptions<T>(dataName);
    this.data = (this.options.data ?? []) as T[];
  }

  public async findOne<TSelect extends Projection | undefined = undefined>(
    filter: DataFilter<T>,
    args?: DataFindOneArgs<T, TSelect>,
    options?: DataFindOneOptions,
  ): Promise<SingleResult<SelectedPublicOutput<T, TSelect>> | ErrorResult> {
    const filterErrors = validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, code: Codes.BadRequest, errors: filterErrors };

    const { select } = args ?? {};
    const { access = 'read' } = options ?? {};

    let [_filter, _select] = await Promise.all([this.genFilter(access, filter), this.genQuerySelect(access, select)]);

    const query = {
      filter: _filter,
      select: _select,
    };

    if (_filter === false) return { success: false, code: Codes.Forbidden, query };

    let doc = (await findElement(this.data, _filter)) as T | undefined;
    if (!doc) return { success: false, code: Codes.NotFound, query };
    doc = (await this.trimOutputFields(doc, access)) as T;
    if (_select.length > 0) doc = pick(doc as object, _select) as T;

    return { success: true, kind: 'single', code: Codes.Success, data: doc as SelectedPublicOutput<T, TSelect>, query };
  }

  public async findById<TSelect extends Projection | undefined = undefined>(
    id: string,
    args?: DataFindOneArgs<T, TSelect>,
    options?: DataFindOneOptions,
  ): Promise<SingleResult<SelectedPublicOutput<T, TSelect>> | ErrorResult> {
    const { select } = args ?? {};
    const { access = 'read' } = options ?? {};
    const filter = await this.genIDFilter(id);

    return this.findOne(
      filter,
      {
        select,
      },
      { access },
    );
  }

  public async find<TSelect extends Projection | undefined = undefined>(
    filter: DataFilter<T>,
    args?: DataFindArgs<T, TSelect>,
    options?: DataFindOptions,
  ): Promise<ListResult<SelectedPublicOutput<T, TSelect>> | ErrorResult> {
    const filterErrors = validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, code: Codes.BadRequest, errors: filterErrors };

    const { select, sort, skip, limit, page, pageSize } = args ?? {};

    const [_filter, _select, pagination] = await Promise.all([
      this.genFilter('list', filter),
      this.genQuerySelect('list', select),
      genPagination({ skip, limit, page, pageSize }, this.options.listHardLimit),
    ]);

    const query = {
      filter: _filter,
      select: _select,
      sort,
      ...pagination,
    };

    if (_filter === false) return { success: false, code: Codes.Forbidden, query };

    let docs = await filterCollection(this.data, _filter);
    const totalCount = docs.length;

    docs = await Promise.all(
      docs.map(async (doc) => {
        doc = await this.trimOutputFields(doc, 'list');
        if (_select.length > 0) doc = pick(doc as object, _select) as T;
        return doc;
      }),
    );

    if (sort) {
      const { sortKey, sortOrder } = parseSortString(sort);
      docs = orderBy(docs, [sortKey], [sortOrder]) as T[];
    }

    docs = docs.slice(query.skip, query.limit && query.skip + query.limit);

    return {
      success: true,
      kind: 'list',
      code: Codes.Success,
      data: docs as SelectedPublicOutput<T, TSelect>[],
      count: docs.length,
      totalCount,
      query,
    };
  }

  public decorate<TDoc>(doc: TDoc, access: DecorateAccess, context?: DataHookContext): Promise<TDoc> {
    return this.req.dacl.decorate(this.dataName, doc, access, context);
  }

  public decorateAll<TDoc>(docs: TDoc[], access: DecorateAllAccess, context?: DataHookContext): Promise<TDoc[]> {
    return this.req.dacl.decorateAll(this.dataName, docs, access, context);
  }

  public genAllowedFields(doc: unknown, access: SelectAccess, baseFields?: string[]): Promise<string[]> {
    return this.req.dacl.genAllowedFields(this.dataName, doc, access, baseFields);
  }

  public genFilter(access?: BaseFilterAccess, filter?: DataFilter<T>): Promise<DataFilter<T>> {
    return this.req.dacl.genFilter<T>(this.dataName, access, filter);
  }

  public genIDFilter(id: string): Promise<DataFilter<T>> {
    return this.req.dacl.genIDFilter<T>(this.dataName, id);
  }

  public genSelect(
    access: SelectAccess,
    targetFields?: Projection,
    skipChecks?: boolean,
    subPaths?: string[],
  ): Promise<string[]> {
    return this.req.dacl.genSelect(this.dataName, access, targetFields, skipChecks, subPaths);
  }

  public genQuerySelect(
    access: SelectAccess,
    targetFields?: Projection,
    skipChecks?: boolean,
    subPaths?: string[],
  ): Promise<string[]> {
    return this.genSelect(access, targetFields, skipChecks, subPaths);
  }

  public pickAllowedFields<TDoc>(doc: TDoc, access: SelectAccess, baseFields?: string[]): Promise<TDoc> {
    return this.req.dacl.pickAllowedFields(this.dataName, doc, access, baseFields) as Promise<TDoc>;
  }

  public trimOutputFields<TDoc>(doc: TDoc, access: SelectAccess, baseFields?: string[]): Promise<TDoc> {
    return this.pickAllowedFields(doc, access, baseFields);
  }
}
