import { createModelHooks } from '@web-ts-toolkit/access-router-react';
import { appServices, type AppServices } from '../api';
import type { Category, CategoryCreateInput, Todo, TodoCreateInput, TodoUpdateInput } from '../types';

interface ListHookResult<T> {
  data?: T[];
  error?: unknown;
  isLoading: boolean;
  isFetching: boolean;
  totalCount?: number;
  query: (listParams: { pageSize: number }) => Promise<unknown>;
  refetch: () => Promise<unknown>;
}

export interface HomePageController {
  useTodoList: (options: { listParams: { pageSize: number } }) => ListHookResult<Todo>;
  useCategoryList: (options: { listParams: { pageSize: number } }) => ListHookResult<Category>;
  useCreateTodo: () => { mutate: (input: TodoCreateInput) => Promise<unknown> };
  useUpdateTodo: () => { mutate: (id: string, input: TodoUpdateInput) => Promise<unknown> };
  useDeleteTodo: () => { mutate: (id: string) => Promise<unknown> };
  useCreateCategory: () => { mutate: (input: CategoryCreateInput) => Promise<unknown> };
  useDeleteCategory: () => { mutate: (id: string) => Promise<unknown> };
}

export function createHomePageController(services: AppServices = appServices): HomePageController {
  const todoHooks = createModelHooks({ modelService: services.todoService });
  const categoryHooks = createModelHooks({ modelService: services.categoryService });

  return {
    useTodoList: todoHooks.useList,
    useCreateTodo: todoHooks.useCreate,
    useUpdateTodo: todoHooks.useUpdate,
    useDeleteTodo: todoHooks.useDelete,
    useCategoryList: categoryHooks.useList,
    useCreateCategory: categoryHooks.useCreate,
    useDeleteCategory: categoryHooks.useDelete,
  };
}

export const defaultHomePageController = createHomePageController();
