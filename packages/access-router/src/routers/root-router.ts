import JsonRouter from '@web-ts-toolkit/express-json-router';
import type { Router } from 'express';
import { isNumber as _isNumber, isString, orderBy as _orderBy } from '@web-ts-toolkit/utils';
import { createSetCore } from '../core';
import { createSetDataCore } from '../core-data';
import { decorateDataListResult, decorateDataSingleResult } from '../http/response-pipelines/data-response';
import { mapCodeToMessage, mapCodeToStatusCode } from '../helpers';
import { accessRouterResponseHandler } from './index';
import type { AccessRuntime } from '../runtime';
import { defaultRuntime } from '../runtime';
import {
  ErrorResult,
  Filter,
  RootRouterOptions,
  Validation,
  RootQueryEntry,
  ModelRequest,
  DataRequest,
  ServiceResult,
  BaseFilterAccess,
  RootOperationResult,
  RootModelOperation,
  RootDataOperation,
  RootModelNewQueryEntry,
  RootModelListQueryEntry,
  RootModelReadByIdQueryEntry,
  RootModelReadByFilterQueryEntry,
  RootModelCreateQueryEntry,
  RootModelUpdateQueryEntry,
  RootModelUpsertQueryEntry,
  RootModelDeleteQueryEntry,
  RootModelSubListQueryEntry,
  RootModelSubReadQueryEntry,
  RootModelSubCreateQueryEntry,
  RootModelSubUpdateQueryEntry,
  RootModelSubBulkUpdateQueryEntry,
  RootModelSubDeleteQueryEntry,
  RootModelDistinctQueryEntry,
  RootModelCountQueryEntry,
  RootDataListQueryEntry,
  RootDataReadByIdQueryEntry,
  RootDataReadByFilterQueryEntry,
} from '../interfaces';
import { Codes } from '../enums';
import { parseBody, rootQuerySchema } from './validation';

const clientErrors = JsonRouter.clientErrors;

type RootRequest = ModelRequest & DataRequest;
type IndexedRootQueryEntry = { item: RootQueryEntry; index: number };
type ModelOperationHandler<TEntry extends RootQueryEntry> = (req: RootRequest, item: TEntry) => Promise<ServiceResult>;
type DataOperationHandler<TEntry extends RootQueryEntry> = (req: RootRequest, item: TEntry) => Promise<ServiceResult>;

const createErrorResult = (code: ErrorResult['code'], detail: string): ErrorResult<{ detail: string }> => ({
  success: false,
  code,
  errors: [{ detail }],
});

const normalizeSubPopulate = (
  populate: RootModelSubReadQueryEntry['args'] extends { populate?: infer TPopulate } ? TPopulate : never,
) =>
  Array.isArray(populate)
    ? populate.map((item) => (isString(item) ? { path: item } : item))
    : isString(populate)
      ? { path: populate }
      : (populate ?? []);

export class RootRouter {
  readonly runtime: AccessRuntime;
  router: JsonRouter;
  basename: string;
  operationAccess: Validation;

  private readonly modelOperations: Record<RootModelOperation, ModelOperationHandler<any>> = {
    new: async (req, item: RootModelNewQueryEntry) => req.macl.getPublicService(item.name)._new(),
    list: async (req, item: RootModelListQueryEntry) =>
      req.macl.getPublicService(item.name)._list((item.filter ?? {}) as Filter, item.args, item.options),
    read: async (req, item: RootModelReadByIdQueryEntry | RootModelReadByFilterQueryEntry) => {
      const svc = req.macl.getPublicService(item.name);
      return 'id' in item
        ? svc._read(item.id, item.args, item.options)
        : svc._readFilter(item.filter, item.args, item.options);
    },
    create: async (req, item: RootModelCreateQueryEntry) =>
      req.macl.getPublicService(item.name)._create(item.data, item.args, item.options),
    update: async (req, item: RootModelUpdateQueryEntry) =>
      req.macl.getPublicService(item.name)._update(item.id, item.data, item.args, item.options),
    upsert: async (req, item: RootModelUpsertQueryEntry) =>
      req.macl.getPublicService(item.name)._upsert(item.data, item.args, item.options),
    delete: async (req, item: RootModelDeleteQueryEntry) => req.macl.getPublicService(item.name)._delete(item.id),
    subList: async (req, item: RootModelSubListQueryEntry) =>
      req.macl.getPublicService(item.name).listSub(item.id, item.sub, {
        filter: (item.filter ?? {}) as Filter,
        select: item.args?.select ?? [],
      }),
    subRead: async (req, item: RootModelSubReadQueryEntry) =>
      req.macl.getPublicService(item.name).readSub(item.id, item.sub, item.subId, {
        select: item.args?.select ?? [],
        populate: normalizeSubPopulate(item.args?.populate),
      }),
    subCreate: async (req, item: RootModelSubCreateQueryEntry) =>
      req.macl.getPublicService(item.name).createSub(item.id, item.sub, item.data),
    subUpdate: async (req, item: RootModelSubUpdateQueryEntry) =>
      req.macl.getPublicService(item.name).updateSub(item.id, item.sub, item.subId, item.data),
    subBulkUpdate: async (req, item: RootModelSubBulkUpdateQueryEntry) =>
      req.macl.getPublicService(item.name).bulkUpdateSub(item.id, item.sub, item.data),
    subDelete: async (req, item: RootModelSubDeleteQueryEntry) =>
      req.macl.getPublicService(item.name).deleteSub(item.id, item.sub, item.subId),
    distinct: async (req, item: RootModelDistinctQueryEntry) =>
      req.macl.getPublicService(item.name)._distinct(item.field, { filter: item.filter }),
    count: async (req, item: RootModelCountQueryEntry) =>
      req.macl
        .getPublicService(item.name)
        ._count((item.filter ?? {}) as Filter, item.options?.access as BaseFilterAccess | undefined),
  };

  private readonly dataOperations: Record<RootDataOperation, DataOperationHandler<any>> = {
    list: async (req, item: RootDataListQueryEntry) => {
      const svc = req.dacl.getService(item.name);
      const result = await svc.find(
        (item.filter ?? {}) as Filter,
        {
          select: item.args?.select,
          sort: item.args?.sort,
          skip: item.args?.skip,
          limit: item.args?.limit,
          page: item.args?.page,
          pageSize: item.args?.pageSize,
        },
        {},
      );

      if (!result.success) {
        return result;
      }

      const decoratedResult = await decorateDataListResult(svc, result, { dataName: item.name });

      return {
        ...decoratedResult,
        totalCount: item.options?.includeCount ? decoratedResult.totalCount : null,
      };
    },
    read: async (req, item: RootDataReadByIdQueryEntry | RootDataReadByFilterQueryEntry) => {
      const svc = req.dacl.getService(item.name);
      const result = await ('id' in item
        ? svc.findById(item.id, item.args, {})
        : svc.findOne(item.filter, item.args, {}));

      if (!result.success) {
        return result;
      }

      return decorateDataSingleResult(svc, result, { dataName: item.name });
    },
  };

  constructor(
    options: RootRouterOptions = { basePath: '', operationAccess: true },
    runtime: AccessRuntime = defaultRuntime,
  ) {
    const { basePath, operationAccess } = options;

    this.runtime = runtime;
    this.basename = basePath || '';
    this.operationAccess = operationAccess;
    this.router = new JsonRouter(
      this.basename,
      [createSetCore(this.runtime), createSetDataCore(this.runtime)],
      accessRouterResponseHandler,
    );
    this.setRoutes();
  }

  private wrapResult(index: number, item: RootQueryEntry, result: ServiceResult): RootOperationResult {
    return {
      index,
      target: item.target,
      name: item.name,
      op: item.op,
      result,
      message: mapCodeToMessage(result.code),
      statusCode: mapCodeToStatusCode(result.code),
    };
  }

  private hasTarget(item: RootQueryEntry) {
    if (item.target === 'model') {
      return this.runtime.hasModel(item.name);
    }

    return this.runtime.getDataNames().includes(item.name);
  }

  private async isAllowed(req: RootRequest, item: RootQueryEntry) {
    if (item.target === 'data') {
      return req.dacl.isAllowed(item.name, item.op);
    }

    switch (item.op) {
      case 'subList':
        return req.macl.isAllowed(item.name, `subs.${item.sub}.list`);
      case 'subRead':
        return req.macl.isAllowed(item.name, `subs.${item.sub}.read`);
      case 'subCreate':
        return req.macl.isAllowed(item.name, `subs.${item.sub}.create`);
      case 'subUpdate':
      case 'subBulkUpdate':
        return req.macl.isAllowed(item.name, `subs.${item.sub}.update`);
      case 'subDelete':
        return req.macl.isAllowed(item.name, `subs.${item.sub}.delete`);
      default:
        return req.macl.isAllowed(item.name, item.op);
    }
  }

  private async processOp(req: RootRequest, item: RootQueryEntry, index: number): Promise<RootOperationResult> {
    if (!this.hasTarget(item)) {
      const label = item.target === 'model' ? 'Model' : 'Data';
      return this.wrapResult(index, item, createErrorResult(Codes.BadRequest, `${label} ${item.name} not found`));
    }

    const allowed = await this.isAllowed(req, item);
    if (!allowed) {
      return this.wrapResult(index, item, createErrorResult(Codes.Unauthorized, 'Unauthorized'));
    }

    const handler = item.target === 'model' ? this.modelOperations[item.op] : this.dataOperations[item.op];
    if (!handler) {
      return this.wrapResult(
        index,
        item,
        createErrorResult(Codes.BadRequest, `Operation ${item.target}.${item.op} not found`),
      );
    }

    return this.wrapResult(index, item, await handler(req, item as never));
  }

  private groupItemsByOrder(items: RootQueryEntry[]) {
    return items.reduce((acc: IndexedRootQueryEntry[][], item: RootQueryEntry, index: number) => {
      let order = 0;

      if (_isNumber(item.order)) {
        order = item.order < 0 ? 0 : item.order;
      }

      if (!acc[order]) {
        acc[order] = [];
      }

      acc[order].push({ index, item });
      return acc;
    }, []);
  }

  private async assertAllowed(req: RootRequest) {
    const allowed = await req.macl.canActivate(this.operationAccess);
    if (!allowed) throw new clientErrors.UnauthorizedError();
  }

  private setRoutes() {
    this.router.post('', async (req: RootRequest) => {
      await this.assertAllowed(req);

      const items = parseBody(rootQuerySchema, req.body) as RootQueryEntry[];
      const groupedItems = this.groupItemsByOrder(items);

      const results: RootOperationResult[] = [];
      for (let x = 0; x < groupedItems.length; x++) {
        const arrResult = await Promise.all(groupedItems[x].map(({ item, index }) => this.processOp(req, item, index)));
        results.push(...arrResult);
      }

      return _orderBy(results, ['index'], ['asc']);
    });
  }

  get routes(): Router {
    return this.router.original;
  }
}
