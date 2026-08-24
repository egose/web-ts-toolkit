import { useEffect, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from '../src/pages/home-page';
import type { HomePageController } from '../src/pages/home-page-controller';
import type { Category, CategoryCreateInput, Todo, TodoCreateInput, TodoUpdateInput } from '../src/types';

const services = {
  todo: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  category: {
    list: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
};

const todoId = '111111111111111111111111';
const categoryId = '222222222222222222222222';

const success = <T,>(data: T, status = 200) => ({
  success: true as const,
  raw: data,
  data,
  message: 'ok',
  status,
  headers: {},
});

const listSuccess = <T,>(data: T[], totalCount = data.length) => ({
  ...success(data),
  totalCount,
});

const operation = <T,>(run: () => Promise<T>) => ({ exec: run });

type ListResponse<T> = ReturnType<typeof listSuccess<T>>;
type Operation<T> = ReturnType<typeof operation<T>>;

function useTestList<T>(
  list: (params: { pageSize: number }) => Operation<ListResponse<T>>,
  listParams: { pageSize: number },
) {
  const [state, setState] = useState<{
    data?: T[];
    error?: unknown;
    isLoading: boolean;
    isFetching: boolean;
    totalCount?: number;
  }>({ isLoading: true, isFetching: false });

  const query = async (params: { pageSize: number }) => {
    setState((current) => ({ ...current, isFetching: true }));
    try {
      const response = await list(params).exec();
      setState({ data: response.data, totalCount: response.totalCount, isLoading: false, isFetching: false });
      return response;
    } catch (error) {
      setState({ error, isLoading: false, isFetching: false });
      throw error;
    }
  };

  useEffect(() => {
    void Promise.resolve()
      .then(() => query(listParams))
      .catch(() => undefined);
    // The test hook intentionally captures the initial list params like the real auto-query hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, query, refetch: () => query(listParams) };
}

function createTestController(): HomePageController {
  return {
    useTodoList: ({ listParams }) => useTestList<Todo>(services.todo.list, listParams),
    useCategoryList: ({ listParams }) => useTestList<Category>(services.category.list, listParams),
    useCreateTodo: () => ({ mutate: (input: TodoCreateInput) => services.todo.create(input).exec() }),
    useUpdateTodo: () => ({ mutate: (id: string, input: TodoUpdateInput) => services.todo.update(id, input).exec() }),
    useDeleteTodo: () => ({ mutate: (id: string) => services.todo.delete(id).exec() }),
    useCreateCategory: () => ({ mutate: (input: CategoryCreateInput) => services.category.create(input).exec() }),
    useDeleteCategory: () => ({ mutate: (id: string) => services.category.delete(id).exec() }),
  };
}

function renderHomePage() {
  return render(<HomePage controller={createTestController()} />);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('HomePage', () => {
  let todos: Array<{ _id: string; title: string; completed: boolean; categoryId: string | null }>;
  let categories: Array<{ _id: string; name: string; color: string }>;

  beforeEach(() => {
    vi.clearAllMocks();
    todos = [];
    categories = [];
    services.todo.list.mockImplementation(() => operation(async () => listSuccess(todos)));
    services.category.list.mockImplementation(() => operation(async () => listSuccess(categories)));
    services.todo.create.mockImplementation((input) => operation(async () => success({ _id: todoId, ...input }, 201)));
    services.todo.update.mockImplementation((id, input) => operation(async () => success({ _id: id, ...input })));
    services.todo.delete.mockImplementation((id) => operation(async () => success(id)));
    services.category.create.mockImplementation((input) =>
      operation(async () => success({ _id: categoryId, color: '#6366f1', ...input }, 201)),
    );
    services.category.delete.mockImplementation((id) => operation(async () => success(id)));
  });

  it('renders loading, empty, and explicit 100-record list states', async () => {
    const todoRequest = deferred<ReturnType<typeof listSuccess>>();
    const categoryRequest = deferred<ReturnType<typeof listSuccess>>();
    services.todo.list.mockImplementationOnce(() => operation(() => todoRequest.promise));
    services.category.list.mockImplementationOnce(() => operation(() => categoryRequest.promise));

    renderHomePage();
    expect(screen.getByText('Loading todos…')).toBeInTheDocument();
    expect(screen.getByText('Loading categories…')).toBeInTheDocument();

    todoRequest.resolve(listSuccess([], 135));
    categoryRequest.resolve(listSuccess([], 104));

    expect(await screen.findByText('No todos yet. Add one above.')).toBeInTheDocument();
    expect(screen.getByText('No categories yet.')).toBeInTheDocument();
    expect(screen.getByText(/showing 0 of 135 todos.*first 100 records/i)).toBeInTheDocument();
    expect(screen.getByText(/showing 0 of 104 categories.*first 100 records/i)).toBeInTheDocument();
  });

  it('shows safe query errors and retries the failed list', async () => {
    services.todo.list
      .mockImplementationOnce(() => operation(async () => Promise.reject(new Error('mongodb://secret/private.todos'))))
      .mockImplementationOnce(() => operation(async () => listSuccess([])));

    renderHomePage();

    expect(
      await screen.findByText('Todos could not be loaded. Check your connection and try again.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/mongodb|private\.todos/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry todos' }));

    expect(await screen.findByText('No todos yet. Add one above.')).toBeInTheDocument();
    expect(services.todo.list).toHaveBeenCalledTimes(2);
  });

  it('retains a rejected create input and permits a successful retry', async () => {
    services.todo.create
      .mockImplementationOnce(() => operation(async () => Promise.reject(new Error('private server detail'))))
      .mockImplementationOnce((input) =>
        operation(async () => {
          todos = [{ _id: todoId, title: input.title, completed: input.completed, categoryId: input.categoryId }];
          return success(todos[0], 201);
        }),
      );

    renderHomePage();
    await screen.findByText('No todos yet. Add one above.');
    const title = screen.getByLabelText('Title');
    fireEvent.change(title, { target: { value: 'Keep this text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/todo could not be saved/i);
    expect(alert).toHaveFocus();
    expect(title).toHaveValue('Keep this text');
    expect(screen.queryByText(/private server detail/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }));
    expect(await screen.findByRole('button', { name: 'Delete todo Keep this text' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(services.todo.create).toHaveBeenCalledTimes(2);
  });

  it('serializes controls while pending so repeated clicks cannot create duplicates', async () => {
    const createRequest = deferred<ReturnType<typeof success>>();
    services.todo.create.mockImplementationOnce((input) =>
      operation(async () => {
        const response = await createRequest.promise;
        todos = [{ _id: todoId, title: input.title, completed: input.completed, categoryId: input.categoryId }];
        return response;
      }),
    );

    renderHomePage();
    await screen.findByText('No todos yet. Add one above.');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Only once' } });
    const submit = screen.getByRole('button', { name: 'Add todo' });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => {
      expect(submit).toBeDisabled();
      expect(services.todo.create).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      createRequest.resolve(success({ _id: todoId, title: 'Only once', completed: false, categoryId: null }, 201));
      await createRequest.promise;
    });
    expect(await screen.findByRole('button', { name: 'Delete todo Only once' })).toBeInTheDocument();
  });

  it('retains edit state after rejection and closes it only after mutation and refresh succeed', async () => {
    todos = [{ _id: todoId, title: 'Original', completed: false, categoryId: null }];
    services.todo.update
      .mockImplementationOnce(() => operation(async () => Promise.reject(new Error('write conflict detail'))))
      .mockImplementationOnce((id, input) =>
        operation(async () => {
          todos = [{ ...todos[0], ...input, _id: id }];
          return success(todos[0]);
        }),
      );

    renderHomePage();
    await screen.findByRole('button', { name: 'Edit Original' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Original' }));
    const title = screen.getByLabelText('Title');
    expect(title).toHaveFocus();
    fireEvent.change(title, { target: { value: 'Edited value' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/todo could not be saved/i)).toBeInTheDocument();
    expect(screen.getByText('Edit todo')).toBeInTheDocument();
    expect(title).toHaveValue('Edited value');

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('button', { name: 'Edit Edited value' })).toBeInTheDocument();
    expect(screen.getByText('New todo')).toBeInTheDocument();
  });

  it('restores focus to the edited todo action after cancel', async () => {
    todos = [{ _id: todoId, title: 'Original', completed: false, categoryId: null }];

    renderHomePage();
    await screen.findByRole('button', { name: 'Edit Original' });
    const editButton = screen.getByRole('button', { name: 'Edit Original' });
    fireEvent.click(editButton);

    expect(screen.getByLabelText('Title')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(editButton).toHaveFocus());
  });

  it('reports refetch failure without duplicating a confirmed create and retries only the refresh', async () => {
    let failRefresh = false;
    services.todo.list.mockImplementation(() =>
      operation(async () => {
        if (failRefresh) throw new Error('temporary outage');
        return listSuccess(todos);
      }),
    );
    services.todo.create.mockImplementationOnce((input) =>
      operation(async () => {
        todos = [{ _id: todoId, title: input.title, completed: input.completed, categoryId: input.categoryId }];
        return success(todos[0], 201);
      }),
    );

    renderHomePage();
    await screen.findByText('No todos yet. Add one above.');
    failRefresh = true;
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Already saved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }));

    await waitFor(() => expect(services.todo.create).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/change was saved, but the latest data could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Already saved');
    expect(screen.getByRole('button', { name: 'Add todo' })).toBeDisabled();
    failRefresh = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry refresh' }));

    expect(await screen.findByRole('button', { name: 'Delete todo Already saved' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(services.todo.create).toHaveBeenCalledTimes(1);
  });

  it('keeps duplicate category input and refreshes both related lists after category deletion', async () => {
    categories = [{ _id: categoryId, name: 'Work', color: '#6366f1' }];
    services.category.create.mockImplementationOnce(() =>
      operation(async () => Promise.reject(new Error('E11000 private.categories'))),
    );

    renderHomePage();
    await screen.findAllByText('Work');
    const categoryInput = screen.getByLabelText('New category');
    fireEvent.change(categoryInput, { target: { value: 'Work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));

    expect(await screen.findByText(/category could not be added.*already exist/i)).toBeInTheDocument();
    expect(categoryInput).toHaveValue('Work');
    expect(screen.queryByText(/E11000|private\.categories/i)).not.toBeInTheDocument();

    const todoListCalls = services.todo.list.mock.calls.length;
    const categoryListCalls = services.category.list.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Delete category Work' }));
    await waitFor(() => {
      expect(services.category.delete).toHaveBeenCalledTimes(1);
      expect(services.todo.list).toHaveBeenCalledTimes(todoListCalls + 1);
      expect(services.category.list).toHaveBeenCalledTimes(categoryListCalls + 1);
    });
  });

  it('exposes item-specific accessible names and focuses saved delete status', async () => {
    todos = [
      { _id: todoId, title: 'File taxes', completed: false, categoryId: null },
      { _id: '333333333333333333333333', title: 'Book travel', completed: true, categoryId: null },
    ];
    categories = [{ _id: categoryId, name: 'Work', color: '#6366f1' }];
    services.todo.delete.mockImplementationOnce((id) =>
      operation(async () => {
        todos = todos.filter((todo) => todo._id !== id);
        return success(id);
      }),
    );

    renderHomePage();
    await screen.findByRole('checkbox', { name: 'Mark File taxes as completed' });

    expect(screen.getByRole('checkbox', { name: 'Mark File taxes as completed' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mark Book travel as not completed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete todo File taxes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete todo Book travel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete category Work' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete todo File taxes' }));

    const status = await screen.findByText('File taxes deleted.');
    await waitFor(() => expect(status).toHaveFocus());
  });
});
