import { createAdapter } from '@web-ts-toolkit/access-router-client';
import type { Category, Todo } from './types';

// The adapter baseURL points at the Vite dev-server proxy (`/api`), which
// forwards to the local backend started by the `server` script. In a
// serverless deploy, set `VITE_API_BASE_URL` to the function mount path.
const adapter = createAdapter({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
});

// `basePath` is relative to the adapter baseURL and must match the server-side
// router's `basePath` minus its `/api` prefix.
export const todoService = adapter.createModelService<Todo>({
  modelName: 'Todo',
  basePath: 'todos',
});

export const categoryService = adapter.createModelService<Category>({
  modelName: 'Category',
  basePath: 'categories',
});
