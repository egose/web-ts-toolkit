import JsonRouter from '@web-ts-toolkit/express-json-router';
import type { Router } from 'express';
import mongoose from 'mongoose';
import { isNumber as _isNumber, orderBy as _orderBy } from '@web-ts-toolkit/utils';
import { setCore } from '../core';
import { mapCodeToMessage, mapCodeToStatusCode } from '../helpers';
import { accessRouterResponseHandler } from './index';
import { getModelOption } from '../options';
import {
  ErrorResult,
  Filter,
  ListResult,
  RootRouterOptions,
  Validation,
  RootQueryEntry,
  Request,
  SingleResult,
  ServiceResult,
  RouteGuardAccess,
} from '../interfaces';
import { Codes } from '../enums';
import { parseBody, rootQuerySchema } from './validation';

const clientErrors = JsonRouter.clientErrors;

const ALL_ROUTES = ['new', 'list', 'read', 'update', 'delete', 'create', 'distinct', 'count'];

export class RootRouter {
  router: JsonRouter;
  basename: string;
  routeGuard: Validation;

  constructor(options: RootRouterOptions = { basePath: '', routeGuard: true }) {
    const { basePath, routeGuard } = options;

    this.basename = basePath || '';
    this.routeGuard = routeGuard;
    this.router = new JsonRouter(this.basename, setCore, accessRouterResponseHandler);
    this.setRoutes();
  }

  private processResult(op: string, result: ServiceResult) {
    const message = mapCodeToMessage(result.code);
    const statusCode = mapCodeToStatusCode(result.code);

    if (!result.success) {
      const { success, code, errors } = result as ErrorResult;
      return { success, code, errors, message, statusCode, op };
    }

    if (result.kind === 'list') {
      const { success, code, data, count, totalCount } = result as ListResult;
      return { success, code, data, count, totalCount, message, statusCode, op };
    }

    const { success, code, data } = result as SingleResult;
    return { success, code, data, message, statusCode, op };
  }

  private async processOp(req: Request, item: RootQueryEntry) {
    if (!mongoose.models[item.model]) {
      return { success: false, code: Codes.BadRequest, data: null, message: `Model ${item.model} not found` };
    }

    const svc = req.macl.getPublicService(item.model);

    if (!ALL_ROUTES.includes(item.op))
      return { success: false, code: Codes.BadRequest, data: null, message: `Operation ${item.op} not found` };

    const routeGuard = getModelOption(item.model, `routeGuard.${item.op as RouteGuardAccess}`) as Validation;
    const allowed = await req.macl.canActivate(routeGuard);
    if (!allowed) return { success: false, code: Codes.Unauthorized, data: null, message: 'Unauthorized' };

    if (item.op === 'list') {
      return this.processResult(item.op, await svc._list(item.filter, item.args, item.options));
    } else if (item.op === 'create') {
      return this.processResult(item.op, await svc._create(item.data, item.args));
    } else if (item.op === 'new') {
      return this.processResult(item.op, await svc._new());
    } else if (item.op === 'read') {
      if (item.id) {
        return this.processResult(item.op, await svc._read(item.id, item.args, item.options));
      }
      if (item.filter) {
        return this.processResult(item.op, await svc._readFilter(item.filter, item.args, item.options));
      }
      return { success: false, code: Codes.BadRequest, data: null, message: `Operation ${item.op} invalid` };
    } else if (item.op === 'update') {
      return this.processResult(item.op, await svc._update(item.id, item.data, item.args, item.options));
    } else if (item.op === 'delete') {
      return this.processResult(item.op, await svc._delete(item.id));
    } else if (item.op === 'distinct') {
      return this.processResult(item.op, await svc._distinct(item.field, { filter: item.filter }));
    } else if (item.op === 'count') {
      return this.processResult(item.op, await svc._count(item.filter));
    } else {
      return { success: false, code: Codes.BadRequest, data: null, message: `operation ${item.op} not found` };
    }
  }

  private groupItemsByOrder(items: RootQueryEntry[]) {
    return items.reduce((acc: { item: RootQueryEntry; index: number }[][], item: RootQueryEntry, index: number) => {
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

  private async assertAllowed(req: Request) {
    const allowed = await req.macl.canActivate(this.routeGuard);
    if (!allowed) throw new clientErrors.UnauthorizedError();
  }

  private setRoutes() {
    this.router.post('', async (req: Request) => {
      await this.assertAllowed(req);

      const items: RootQueryEntry[] = parseBody(rootQuerySchema, req.body).map((item) => ({
        ...item,
        filter: (item.filter ?? {}) as Filter,
      }));
      const groupedItems = this.groupItemsByOrder(items);

      const results = [];
      for (let x = 0; x < groupedItems.length; x++) {
        const arrResult = await Promise.all(
          groupedItems[x].map(async ({ item, index }) => {
            const ret = await this.processOp(req, item);
            return { ret, index };
          }),
        );

        results.push(...arrResult);
      }

      return _orderBy(results, ['index'], ['asc']).map(({ ret }) => ret);
    });
  }

  get routes(): Router {
    return this.router.original;
  }
}
