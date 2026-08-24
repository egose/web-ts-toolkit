import { createAdapter } from '@web-ts-toolkit/access-router-client';
import type {
  Category,
  CategoryCreateInput,
  CategoryUpdateInput,
  Todo,
  TodoCreateInput,
  TodoUpdateInput,
} from './types';
import { normalizeApiBaseURL } from './shared/normalize-api-base-url';

// Vite validates and defines the same path-only API_BASE_URL used by the
// backend and dev proxy.
const adapter = createAdapter({
  baseURL: normalizeApiBaseURL(import.meta.env.API_BASE_URL),
});

// `basePath` is relative to the adapter baseURL and must match the server-side
// router's `basePath` minus the configured API base path.
export const todoService = adapter.createModelService<Todo, TodoCreateInput, TodoUpdateInput>({
  modelName: 'Todo',
  basePath: 'todos',
});

export const categoryService = adapter.createModelService<Category, CategoryCreateInput, CategoryUpdateInput>({
  modelName: 'Category',
  basePath: 'categories',
});

export interface AppServices {
  todoService: typeof todoService;
  categoryService: typeof categoryService;
}

export const appServices: AppServices = { todoService, categoryService };
