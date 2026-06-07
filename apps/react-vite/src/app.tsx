import { type ReactNode, useEffect, useState } from 'react';
import { Card } from '@egose/shadcn-theme/components/ui/card';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router';
import { cn } from '@egose/shadcn-theme/utils/ui';
import { getSession, loginWithEmail } from './api';
import { LoginPage } from './pages/login-page';
import { MessagesPage } from './pages/messages-page';
import { WorkspacePage } from './pages/workspace-page';
import { clearStoredSessionToken, getStoredSessionToken, setStoredSessionToken } from './storage';
import type { SessionData } from './types';

const appShellClass = 'app-page-shell min-h-screen';
const loadingScreenClass = 'grid min-h-screen place-items-center p-8';
const loadingCardClass = cn('app-surface-raised shadow-none', 'rounded-[22px] p-4');

function LoadingScreen() {
  return (
    <div className={loadingScreenClass}>
      <Card className={loadingCardClass}>
        <h2>Loading session...</h2>
      </Card>
    </div>
  );
}

interface ProtectedRouteProps {
  isLoading: boolean;
  session: SessionData | null | undefined;
  children: ReactNode;
}

function ProtectedRoute({ children, isLoading, session }: ProtectedRouteProps) {
  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function App() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(() => getStoredSessionToken());

  const sessionQuery = useQuery({
    queryKey: ['session', token],
    queryFn: getSession,
    staleTime: 30_000,
  });

  /* eslint-disable react-hooks/set-state-in-effect -- clear invalid session token */
  useEffect(() => {
    if (!token || sessionQuery.isPending) {
      return;
    }

    if (sessionQuery.data === null) {
      clearStoredSessionToken();
      setToken(null);
    }
  }, [token, sessionQuery.data, sessionQuery.isPending]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const loginMutation = useMutation({
    mutationFn: async (email: string) => {
      const session = await loginWithEmail(email);

      if (session.token) {
        setStoredSessionToken(session.token);
        setToken(session.token);
        queryClient.setQueryData(['session', session.token], session);
      }

      return session;
    },
  });

  const refreshSession = async () => {
    await queryClient.invalidateQueries({ queryKey: ['session'] });
  };

  const handleSignedOut = async () => {
    clearStoredSessionToken();
    setToken(null);
    await queryClient.invalidateQueries({ queryKey: ['session'] });
  };

  const firstOrganizationId = sessionQuery.data?.organizations[0]?.organizationId;
  const homePath = firstOrganizationId ? `/organizations/${firstOrganizationId}` : '/organizations';

  return (
    <div className={appShellClass}>
      <Routes>
        <Route
          path="/login"
          element={
            sessionQuery.data ? (
              <Navigate to={homePath} replace />
            ) : (
              <LoginPage
                error={loginMutation.error instanceof Error ? loginMutation.error.message : null}
                isSubmitting={loginMutation.isPending}
                onLogin={(email) => loginMutation.mutateAsync(email)}
              />
            )
          }
        />
        <Route
          path="/organizations/:organizationId?"
          element={
            <ProtectedRoute isLoading={sessionQuery.isPending && !!token} session={sessionQuery.data}>
              <WorkspacePage
                onRefreshSession={refreshSession}
                onSignedOut={handleSignedOut}
                session={sessionQuery.data!}
              />
            </ProtectedRoute>
          }
        />
        <Route
          path="/messages"
          element={
            <ProtectedRoute isLoading={sessionQuery.isPending && !!token} session={sessionQuery.data}>
              <MessagesPage session={sessionQuery.data!} />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to={sessionQuery.data ? homePath : '/login'} replace />} />
      </Routes>
    </div>
  );
}
