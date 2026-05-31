import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../src/pages/login-page';

describe('LoginPage', () => {
  it('renders the email sign-in flow', () => {
    render(
      <MemoryRouter>
        <LoginPage error={null} isSubmitting={false} onLogin={vi.fn()} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: /manage organizations, roles, and reporting lines/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with email/i })).toBeInTheDocument();
  });
});
