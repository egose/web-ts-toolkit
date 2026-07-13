import { useState } from 'react';
import { createModelHooks } from '@web-ts-toolkit/access-router-react';
import { Badge } from '@egose/shadcn-theme/components/ui/badge';
import { Button } from '@egose/shadcn-theme/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@egose/shadcn-theme/components/ui/card';
import { Checkbox } from '@egose/shadcn-theme/components/ui/checkbox';
import { Input } from '@egose/shadcn-theme/components/ui/input';
import { Label } from '@egose/shadcn-theme/components/ui/label';
import { Separator } from '@egose/shadcn-theme/components/ui/separator';
import { categoryService, todoService } from '../api';
import type { Category, Todo } from '../types';
import { TodoForm, type TodoFormValues } from './todo-form';

const {
  useList: useTodoList,
  useCreate: useCreateTodo,
  useUpdate: useUpdateTodo,
  useDelete: useDeleteTodo,
} = createModelHooks({ modelService: todoService });
const {
  useList: useCategoryList,
  useCreate: useCreateCategory,
  useDelete: useDeleteCategory,
} = createModelHooks({
  modelService: categoryService,
});

const pageClass = 'mx-auto w-full max-w-5xl px-6 py-10';
const titleClass = 'text-3xl font-semibold tracking-tight';
const gridClass = 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]';
const mutedClass = 'text-sm text-muted-foreground';
const todoRowClass = 'flex items-center gap-3 py-2';
const categoryRowClass = 'flex items-center justify-between gap-2 py-2';

export function HomePage() {
  const {
    data: todos,
    isLoading: todosLoading,
    refetch: refetchTodos,
  } = useTodoList({
    listParams: { pageSize: 100 },
  });
  const {
    data: categories,
    isLoading: categoriesLoading,
    refetch: refetchCategories,
  } = useCategoryList({
    listParams: { pageSize: 100 },
  });

  const { mutate: createTodo } = useCreateTodo({ onSuccess: () => refetchTodos() });
  const { mutate: updateTodo } = useUpdateTodo({ onSuccess: () => refetchTodos() });
  const { mutate: deleteTodo } = useDeleteTodo({ onSuccess: () => refetchTodos() });
  const { mutate: createCategory, isPending: isCreatingCategory } = useCreateCategory({
    onSuccess: () => refetchCategories(),
  });
  const { mutate: deleteCategory } = useDeleteCategory({ onSuccess: () => refetchCategories() });

  const [editing, setEditing] = useState<Todo | null>(null);
  const [categoryName, setCategoryName] = useState('');

  const categoryById = new Map<string, Category>(
    (categories ?? []).map((category) => [category._id as string, category]),
  );

  const handleTodoSubmit = (values: TodoFormValues) => {
    if (editing?._id) {
      updateTodo(editing._id, {
        title: values.title,
        completed: values.completed,
        categoryId: values.categoryId || null,
      });
      setEditing(null);
    } else {
      createTodo({
        title: values.title,
        completed: values.completed,
        categoryId: values.categoryId || null,
      });
    }
  };

  const handleAddCategory = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) return;
    createCategory({ name });
    setCategoryName('');
  };

  return (
    <div className={pageClass}>
      <h1 className={titleClass}>{'{{APP_TITLE}}'}</h1>
      <p className={mutedClass}>A CRUD starter built on the web-ts-toolkit access-router stack.</p>

      <div className={gridClass + ' mt-8'}>
        <section className="grid gap-4">
          <TodoForm
            key={editing?._id ?? 'new'}
            categories={categories ?? []}
            initialValues={
              editing
                ? { title: editing.title, completed: editing.completed, categoryId: editing.categoryId ?? '' }
                : undefined
            }
            submitLabel={editing ? 'Save changes' : 'Add todo'}
            onSubmit={handleTodoSubmit}
            onCancel={editing ? () => setEditing(null) : undefined}
          />

          <Card>
            <CardHeader>
              <CardTitle>Todos</CardTitle>
            </CardHeader>
            <CardContent>
              {todosLoading ? (
                <p className={mutedClass}>Loading…</p>
              ) : todos.length === 0 ? (
                <p className={mutedClass}>No todos yet. Add one above.</p>
              ) : (
                <ul className="grid gap-1">
                  {todos.map((todo) => {
                    const category = todo.categoryId ? categoryById.get(String(todo.categoryId)) : undefined;
                    return (
                      <li key={todo._id} className={todoRowClass}>
                        <Checkbox
                          checked={todo.completed}
                          onCheckedChange={(checked) => updateTodo(todo._id as string, { completed: checked === true })}
                        />
                        <span className={todo.completed ? 'line-through text-muted-foreground' : ''}>{todo.title}</span>
                        {category && (
                          <Badge variant="secondary" style={{ backgroundColor: category.color }}>
                            {category.name}
                          </Badge>
                        )}
                        <div className="ml-auto flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(todo)}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteTodo(todo._id as string)}>
                            Delete
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
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
                <p className={mutedClass}>Loading…</p>
              ) : categories.length === 0 ? (
                <p className={mutedClass}>No categories yet.</p>
              ) : (
                <ul className="grid gap-1">
                  {categories.map((category) => (
                    <li key={category._id} className={categoryRowClass}>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        <span>{category.name}</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => deleteCategory(category._id as string)}>
                        Delete
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <Separator className="my-4" />

              <form className="grid gap-2" onSubmit={handleAddCategory}>
                <Label htmlFor="categoryName">New category</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="categoryName"
                    placeholder="Category name"
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    required
                  />
                  <Button type="submit" variant="primary" size="sm" disabled={isCreatingCategory}>
                    Add
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
