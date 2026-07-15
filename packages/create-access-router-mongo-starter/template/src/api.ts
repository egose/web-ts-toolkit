import { createAdapter } from '@web-ts-toolkit/access-router-client';
import type { Category, Todo } from './types';

function normalizeApiBaseURL(value: string | undefined) {
  const normalized = value?.trim().replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '/api';
}

// The adapter baseURL points at the Vite dev-server proxy (`API_BASE_URL`,
// default `/api`), which forwards to the local backend started by the `server`
// script. For frontend-only deploy overrides, `VITE_API_BASE_URL` is still
// supported.
const adapter = createAdapter({
  baseURL: normalizeApiBaseURL(import.meta.env.API_BASE_URL ?? import.meta.env.VITE_API_BASE_URL),
});

// `basePath` is relative to the adapter baseURL and must match the server-side
// router's `basePath` minus the configured API base path.
export const todoService = adapter.createModelService<Todo>({
  modelName: 'Todo',
  basePath: 'todos',
});

export const categoryService = adapter.createModelService<Category>({
  modelName: 'Category',
  basePath: 'categories',
});
