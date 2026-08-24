import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';
import { TodoForm } from '../src/pages/todo-form';

describe('TodoForm', () => {
  it('submits a new todo with the entered title', async () => {
    const onSubmit = vi.fn();

    render(<TodoForm categories={[]} submitLabel="Add todo" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Buy milk' } });
    fireEvent.click(screen.getByRole('button', { name: /add todo/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit.mock.calls[0][0]).toEqual(expect.objectContaining({ title: 'Buy milk', completed: false }));
  });

  it('blocks submission when the title is empty', async () => {
    const onSubmit = vi.fn();

    render(<TodoForm categories={[]} submitLabel="Add todo" onSubmit={onSubmit} />);
    const title = screen.getByLabelText(/title/i);

    expect(title).toHaveAccessibleDescription('Enter 1 to 200 characters.');
    expect(title).toHaveAttribute('aria-invalid', 'false');

    fireEvent.click(screen.getByRole('button', { name: /add todo/i }));

    await waitFor(() => {
      expect(title).toHaveAccessibleDescription(/enter 1 to 200 characters.*title is required/i);
    });

    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
