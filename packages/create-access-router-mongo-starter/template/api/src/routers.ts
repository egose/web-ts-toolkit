import { fromZod, type ModelRouterOptions } from '@web-ts-toolkit/access-router';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  objectIdSchema,
  todoCreateSchema,
  todoUpdateSchema,
} from '../../src/shared/entity-schemas';
import { API_BASE_URL } from './config';
import type { CategoryRecord, TodoRecord } from './models';

export const OPEN_ACCESS = { list: true, read: true, create: true, update: true, delete: true } as const;

const missingCategoryIssue = [{ detail: 'Category does not exist.', parameter: 'categoryId' }];

export async function validateTodoCategory(
  data: unknown,
  _permissions: unknown,
  context: { mongooseModel: { db: { model(name: string): { exists(filter: unknown): Promise<unknown> } } } },
) {
  const categoryId = (data as { categoryId?: unknown }).categoryId;
  if (categoryId === undefined || categoryId === null) return true;
  return (await context.mongooseModel.db.model('Category').exists({ _id: categoryId })) ? true : missingCategoryIssue;
}

const modelBasePaths = [`${API_BASE_URL}/todos`, `${API_BASE_URL}/categories`];
const todoListFilterSchema = z.strictObject({
  _id: objectIdSchema.optional(),
  categoryId: objectIdSchema.nullable().optional(),
  completed: z.boolean().optional(),
});
const categoryListFilterSchema = z.strictObject({
  _id: objectIdSchema.optional(),
  name: z.string().trim().min(1).max(80).optional(),
});

export const enforceBasicRouteContract: RequestHandler = (req, res, next) => {
  for (const basePath of modelBasePaths) {
    const relativePath = req.path.toLowerCase().startsWith(`${basePath.toLowerCase()}/`)
      ? req.path.slice(basePath.length + 1)
      : '';
    const normalizedRelativePath = relativePath.toLowerCase().replace(/\/+$/, '');
    if (req.method === 'POST' && normalizedRelativePath === '__query') {
      const listBody = req.body as { filter?: unknown; sort?: unknown } | undefined;
      const filterSchema = basePath.endsWith('/todos') ? todoListFilterSchema : categoryListFilterSchema;
      if (listBody?.sort !== undefined || !filterSchema.safeParse(listBody?.filter ?? {}).success) {
        res.status(400).json({
          success: false,
          message: 'Bad Request',
          errors: [{ detail: 'Only documented exact-match filters and the default sort are allowed.' }],
        });
        return;
      }
    }
    const advancedMutation =
      (req.method === 'POST' || req.method === 'PUT') && normalizedRelativePath === '__mutation'
        ? true
        : req.method === 'PATCH' && normalizedRelativePath.startsWith('__mutation/');

    if (advancedMutation) {
      res.status(404).json({ success: false, message: 'Not Found' });
      return;
    }

    const directDocumentId =
      ['GET', 'PATCH', 'DELETE'].includes(req.method) && normalizedRelativePath && !normalizedRelativePath.includes('/')
        ? normalizedRelativePath
        : undefined;
    const advancedReadId =
      req.method === 'POST' && normalizedRelativePath.startsWith('__query/')
        ? normalizedRelativePath.slice('__query/'.length)
        : undefined;
    const id =
      directDocumentId && !['count', 'new'].includes(normalizedRelativePath) ? directDocumentId : advancedReadId;

    if (id && !objectIdSchema.safeParse(id).success) {
      res.status(400).json({
        success: false,
        message: 'Bad Request',
        errors: [{ detail: 'Must be a 24-character hexadecimal ObjectId', parameter: 'id' }],
      });
      return;
    }
  }

  next();
};

export const todoRouterOptions = {
  basePath: `${API_BASE_URL}/todos`,
  operationAccess: OPEN_ACCESS,
  permissionSchema: { title: OPEN_ACCESS, completed: OPEN_ACCESS, categoryId: OPEN_ACCESS },
  requestSchemas: {
    create: fromZod(todoCreateSchema),
    update: fromZod(todoUpdateSchema),
  },
  validate: { create: validateTodoCategory, update: validateTodoCategory },
  defaults: { publicListArgs: { sort: { _id: -1 } } },
  listHardLimit: 100,
} satisfies ModelRouterOptions<TodoRecord>;

export const categoryRouterOptions = {
  basePath: `${API_BASE_URL}/categories`,
  operationAccess: OPEN_ACCESS,
  permissionSchema: { name: OPEN_ACCESS, color: OPEN_ACCESS },
  requestSchemas: {
    create: fromZod(categoryCreateSchema),
    update: fromZod(categoryUpdateSchema),
  },
  defaults: { publicListArgs: { sort: { name: 1, _id: 1 } } },
  listHardLimit: 100,
} satisfies ModelRouterOptions<CategoryRecord>;
