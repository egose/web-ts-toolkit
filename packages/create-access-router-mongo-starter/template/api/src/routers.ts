import { z } from 'zod';
import { createAccessRuntime, fromZod, type ModelRouterOptions } from '@web-ts-toolkit/access-router';
import { CategoryModel, TodoModel, type CategoryRecord, type TodoRecord } from './models';

const OPEN_ACCESS = { list: true, read: true, create: true, update: true, delete: true } as const;

const todoCreateSchema = fromZod(
  z.object({
    title: z.string().min(1),
    completed: z.boolean().optional().default(false),
    categoryId: z.string().optional().nullable(),
  }),
);

const todoUpdateSchema = fromZod(
  z.object({
    title: z.string().min(1).optional(),
    completed: z.boolean().optional(),
    categoryId: z.string().nullable().optional(),
  }),
);

const categoryCreateSchema = fromZod(
  z.object({
    name: z.string().min(1),
    color: z.string().optional(),
  }),
);

const categoryUpdateSchema = fromZod(
  z.object({
    name: z.string().min(1).optional(),
    color: z.string().optional(),
  }),
);

export function createRouters(runtime: ReturnType<typeof createAccessRuntime>) {
  const todoRouter = runtime.createRouter(TodoModel, {
    basePath: '/api/todos',
    operationAccess: OPEN_ACCESS,
    permissionSchema: { title: OPEN_ACCESS, completed: OPEN_ACCESS, categoryId: OPEN_ACCESS },
    requestSchemas: { create: todoCreateSchema, update: todoUpdateSchema },
    listHardLimit: 100,
  } as unknown as ModelRouterOptions<TodoRecord>);

  const categoryRouter = runtime.createRouter(CategoryModel, {
    basePath: '/api/categories',
    operationAccess: OPEN_ACCESS,
    permissionSchema: { name: OPEN_ACCESS, color: OPEN_ACCESS },
    requestSchemas: { create: categoryCreateSchema, update: categoryUpdateSchema },
    listHardLimit: 100,
  } as unknown as ModelRouterOptions<CategoryRecord>);

  const rootRouter = runtime.createRouter({ basePath: '/api/root', operationAccess: true });

  return { todoRouter, categoryRouter, rootRouter };
}

export type ApiRuntime = ReturnType<typeof createAccessRuntime>;
