import { useEffect, useRef, useState } from 'react';
import { Badge } from '@egose/shadcn-theme/components/ui/badge';
import { Button } from '@egose/shadcn-theme/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@egose/shadcn-theme/components/ui/card';
import { Checkbox } from '@egose/shadcn-theme/components/ui/checkbox';
import { Input } from '@egose/shadcn-theme/components/ui/input';
import { Label } from '@egose/shadcn-theme/components/ui/label';
import { Separator } from '@egose/shadcn-theme/components/ui/separator';
import type { Category, Todo } from '../types';
import { TodoForm, type TodoFormValues } from './todo-form';
import { defaultHomePageController, type HomePageController } from './home-page-controller';

const pageClass = 'mx-auto w-full max-w-5xl px-6 py-10';
const titleClass = 'text-3xl font-semibold tracking-tight';
const gridClass = 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]';
const mutedClass = 'text-sm text-muted-foreground';
const todoRowClass = 'flex items-center gap-3 py-2';
const categoryRowClass = 'flex items-center justify-between gap-2 py-2';
const listLimit = 100;

interface RefreshTask {
  run: () => Promise<unknown>;
  complete: () => void;
}

export function HomePage({ controller = defaultHomePageController }: { controller?: HomePageController } = {}) {
  const [editing, setEditing] = useState<Todo | null>(null);
  const [todoFormVersion, setTodoFormVersion] = useState(0);
  const [categoryName, setCategoryName] = useState('');
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationStatus, setOperationStatus] = useState<string | null>(null);
  const [refreshTask, setRefreshTask] = useState<RefreshTask | null>(null);
  const [operationPending, setOperationPending] = useState(false);
  const [categoryNameError, setCategoryNameError] = useState<string | null>(null);
  const operationLock = useRef(false);
  const alertRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const restoreEditFocusId = useRef<string | null>(null);
  const {
    data: todos,
    error: todosError,
    isLoading: todosLoading,
    isFetching: todosFetching,
    totalCount: todoCount,
    query: reloadTodos,
    refetch: refetchTodos,
  } = controller.useTodoList({
    listParams: { pageSize: listLimit },
  });
  const {
    data: categories,
    error: categoriesError,
    isLoading: categoriesLoading,
    isFetching: categoriesFetching,
    totalCount: categoryCount,
    query: reloadCategories,
    refetch: refetchCategories,
  } = controller.useCategoryList({
    listParams: { pageSize: listLimit },
  });

  const { mutate: createTodo } = controller.useCreateTodo();
  const { mutate: updateTodo } = controller.useUpdateTodo();
  const { mutate: deleteTodo } = controller.useDeleteTodo();
  const { mutate: createCategory } = controller.useCreateCategory();
  const { mutate: deleteCategory } = controller.useDeleteCategory();

  useEffect(() => {
    if (operationError) alertRef.current?.focus();
  }, [operationError]);

  useEffect(() => {
    if (editing || !restoreEditFocusId.current) return;
    editButtonRefs.current.get(restoreEditFocusId.current)?.focus();
    restoreEditFocusId.current = null;
  }, [editing]);

  const todoItems = todos ?? [];
  const categoryItems = categories ?? [];
  const categoryById = new Map<string, Category>(categoryItems.map((category) => [category._id, category]));

  const retryRefresh = async () => {
    if (!refreshTask || operationLock.current) return;
    operationLock.current = true;
    setOperationPending(true);
    try {
      await refreshTask.run();
      refreshTask.complete();
      setRefreshTask(null);
      setOperationError(null);
      setOperationStatus('Latest data loaded.');
    } catch {
      setOperationError(
        'The change was saved, but the latest data still could not be loaded. Check your connection and retry refresh.',
      );
    } finally {
      operationLock.current = false;
      setOperationPending(false);
    }
  };

  const runMutation = async ({
    mutate,
    refresh,
    complete,
    rejectedMessage,
    savedMessage,
    focusStatusAfterSave = false,
  }: {
    mutate: () => Promise<unknown>;
    refresh: () => Promise<unknown>;
    complete: () => void;
    rejectedMessage: string;
    savedMessage: string;
    focusStatusAfterSave?: boolean;
  }): Promise<boolean> => {
    if (operationLock.current) return false;
    operationLock.current = true;
    setOperationPending(true);
    setOperationError(null);
    setOperationStatus('Saving changes.');
    setRefreshTask(null);

    try {
      await mutate();
    } catch {
      setOperationError(rejectedMessage);
      setOperationStatus(null);
      operationLock.current = false;
      setOperationPending(false);
      return false;
    }

    try {
      await refresh();
      complete();
      setOperationStatus(savedMessage);
      if (focusStatusAfterSave) {
        requestAnimationFrame(() => statusRef.current?.focus());
      }
      return true;
    } catch {
      setRefreshTask({ run: refresh, complete });
      setOperationError(
        'The change was saved, but the latest data could not be loaded. Check your connection and retry refresh.',
      );
      setOperationStatus(null);
      return false;
    } finally {
      operationLock.current = false;
      setOperationPending(false);
    }
  };

  const handleTodoSubmit = async (values: TodoFormValues) => {
    const todoInput = {
      title: values.title,
      completed: values.completed,
      categoryId: values.categoryId || null,
    };
    const isEditing = Boolean(editing?._id);
    return runMutation({
      mutate: () => (editing?._id ? updateTodo(editing._id, todoInput) : createTodo(todoInput)),
      refresh: () => reloadTodos({ pageSize: listLimit }),
      complete: () => {
        setEditing(null);
        if (!isEditing) setTodoFormVersion((version) => version + 1);
      },
      rejectedMessage: 'The todo could not be saved. Your changes are still here; review them and try again.',
      savedMessage: isEditing ? 'Todo changes saved.' : 'Todo added.',
    });
  };

  const handleAddCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) {
      setCategoryNameError('Category name is required.');
      return;
    }
    await runMutation({
      mutate: () => createCategory({ name }),
      refresh: () => reloadCategories({ pageSize: listLimit }),
      complete: () => {
        setCategoryName('');
        setCategoryNameError(null);
      },
      rejectedMessage: 'The category could not be added. It may already exist; choose another name or try again.',
      savedMessage: `Category ${name} added.`,
    });
  };

  const retryQuery = (refetch: () => Promise<unknown>) => {
    void Promise.resolve(refetch()).catch(() => undefined);
  };

  return (
    <div className={pageClass}>
      <h1 className={titleClass}>{'{{APP_TITLE}}'}</h1>
      <p className={mutedClass}>A CRUD starter built on the web-ts-toolkit access-router stack.</p>
      {operationError && (
        <div
          ref={alertRef}
          role="alert"
          tabIndex={-1}
          className="mt-4 flex flex-wrap items-center gap-2 text-sm text-red-500"
        >
          <span>{operationError}</span>
          {refreshTask && (
            <Button type="button" variant="secondary" size="sm" disabled={operationPending} onClick={retryRefresh}>
              Retry refresh
            </Button>
          )}
        </div>
      )}
      <div
        ref={statusRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        tabIndex={-1}
        className={operationStatus ? 'mt-4 text-sm text-muted-foreground' : 'sr-only'}
      >
        {operationStatus ?? 'Ready.'}
      </div>

      <div className={gridClass + ' mt-8'}>
        <section className="grid gap-4">
          <TodoForm
            key={`${editing?._id ?? 'new'}-${todoFormVersion}`}
            categories={categoryItems}
            disabled={operationPending || Boolean(refreshTask)}
            initialValues={
              editing
                ? {
                    _id: editing._id,
                    title: editing.title,
                    completed: editing.completed,
                    categoryId: editing.categoryId ?? '',
                  }
                : undefined
            }
            submitLabel={editing ? 'Save changes' : 'Add todo'}
            onSubmit={handleTodoSubmit}
            onCancel={
              editing
                ? () => {
                    restoreEditFocusId.current = editing._id;
                    setEditing(null);
                  }
                : undefined
            }
          />

          <Card>
            <CardHeader>
              <CardTitle>Todos</CardTitle>
            </CardHeader>
            <CardContent>
              {todosLoading ? (
                <p role="status" aria-live="polite" className={mutedClass}>
                  Loading todos…
                </p>
              ) : todosError ? (
                <div role="alert" className="grid justify-items-start gap-2 text-sm text-red-500">
                  <span>Todos could not be loaded. Check your connection and try again.</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={todosFetching}
                    onClick={() => retryQuery(refetchTodos)}
                  >
                    Retry todos
                  </Button>
                </div>
              ) : todoItems.length === 0 ? (
                <p className={mutedClass}>No todos yet. Add one above.</p>
              ) : (
                <ul className="grid gap-1">
                  {todoItems.map((todo) => {
                    const category = todo.categoryId ? categoryById.get(todo.categoryId) : undefined;
                    return (
                      <li key={todo._id} className={todoRowClass}>
                        <Checkbox
                          checked={todo.completed}
                          disabled={operationPending || Boolean(refreshTask)}
                          aria-label={`${todo.completed ? 'Mark' : 'Mark'} ${todo.title} as ${todo.completed ? 'not completed' : 'completed'}`}
                          onCheckedChange={(checked) =>
                            void runMutation({
                              mutate: () => updateTodo(todo._id, { completed: checked === true }),
                              refresh: () => reloadTodos({ pageSize: listLimit }),
                              complete: () => undefined,
                              rejectedMessage: 'The todo could not be updated. Try again.',
                              savedMessage: `${todo.title} updated.`,
                            })
                          }
                        />
                        <span className={todo.completed ? 'line-through text-muted-foreground' : ''}>{todo.title}</span>
                        {category && (
                          <Badge variant="secondary" style={{ backgroundColor: category.color }}>
                            {category.name}
                          </Badge>
                        )}
                        <div className="ml-auto flex items-center gap-1">
                          <Button
                            ref={(button) => {
                              if (button) editButtonRefs.current.set(todo._id, button);
                              else editButtonRefs.current.delete(todo._id);
                            }}
                            variant="ghost"
                            size="sm"
                            disabled={operationPending || Boolean(refreshTask)}
                            onClick={() => {
                              setOperationStatus(null);
                              setEditing(todo);
                            }}
                          >
                            Edit <span className="sr-only">{todo.title}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={operationPending || Boolean(refreshTask)}
                            onClick={() =>
                              void runMutation({
                                mutate: () => deleteTodo(todo._id),
                                refresh: () => reloadTodos({ pageSize: listLimit }),
                                complete: () => editing?._id === todo._id && setEditing(null),
                                rejectedMessage: 'The todo could not be deleted. Try again.',
                                savedMessage: `${todo.title} deleted.`,
                                focusStatusAfterSave: true,
                              })
                            }
                          >
                            Delete <span className="sr-only">todo {todo.title}</span>
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {!todosLoading && !todosError && (
                <p className={mutedClass + ' mt-3'}>
                  Showing {todoItems.length} of {todoCount ?? todoItems.length} todos. This demo displays at most the
                  first {listLimit} records.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Categories</CardTitle>
            </CardHeader>
            <CardContent>
              {categoriesLoading ? (
                <p role="status" aria-live="polite" className={mutedClass}>
                  Loading categories…
                </p>
              ) : categoriesError ? (
                <div role="alert" className="grid justify-items-start gap-2 text-sm text-red-500">
                  <span>Categories could not be loaded. Check your connection and try again.</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={categoriesFetching}
                    onClick={() => retryQuery(refetchCategories)}
                  >
                    Retry categories
                  </Button>
                </div>
              ) : categoryItems.length === 0 ? (
                <p className={mutedClass}>No categories yet.</p>
              ) : (
                <ul className="grid gap-1">
                  {categoryItems.map((category) => (
                    <li key={category._id} className={categoryRowClass}>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        <span>{category.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={operationPending || Boolean(refreshTask)}
                        onClick={() =>
                          void runMutation({
                            mutate: () => deleteCategory(category._id),
                            refresh: () =>
                              Promise.all([
                                reloadCategories({ pageSize: listLimit }),
                                reloadTodos({ pageSize: listLimit }),
                              ]),
                            complete: () => undefined,
                            rejectedMessage:
                              'That category may still be used by a todo and could not be deleted. Remove its todo references, then try again.',
                            savedMessage: `Category ${category.name} deleted.`,
                            focusStatusAfterSave: true,
                          })
                        }
                      >
                        Delete <span className="sr-only">category {category.name}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {!categoriesLoading && !categoriesError && (
                <p className={mutedClass + ' mt-3'}>
                  Showing {categoryItems.length} of {categoryCount ?? categoryItems.length} categories. This demo
                  displays at most the first {listLimit} records.
                </p>
              )}

              <Separator className="my-4" />

              <form className="grid gap-2" onSubmit={handleAddCategory}>
                <Label htmlFor="categoryName">New category</Label>
                <span id="categoryNameDescription" className={mutedClass}>
                  Enter a unique category name.
                </span>
                <div className="flex items-center gap-2">
                  <Input
                    id="categoryName"
                    placeholder="Category name"
                    value={categoryName}
                    disabled={operationPending || Boolean(refreshTask)}
                    aria-describedby={
                      categoryNameError ? 'categoryNameDescription categoryNameError' : 'categoryNameDescription'
                    }
                    aria-invalid={categoryNameError ? 'true' : 'false'}
                    onChange={(event) => {
                      setCategoryName(event.target.value);
                      if (categoryNameError) setCategoryNameError(null);
                    }}
                    required
                  />
                  <Button type="submit" variant="primary" size="sm" disabled={operationPending || Boolean(refreshTask)}>
                    Add category
                  </Button>
                </div>
                {categoryNameError && (
                  <span id="categoryNameError" className="text-sm text-red-500">
                    {categoryNameError}
                  </span>
                )}
              </form>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
