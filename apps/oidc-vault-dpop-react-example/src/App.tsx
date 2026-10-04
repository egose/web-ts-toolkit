import { useEffect, useMemo, useState, type JSX } from 'react';
import { fetchWithDpop, OidcVaultDpopClientError } from '@web-ts-toolkit/oidc-vault-dpop-client';

import { apis, backendOrigin, getSession } from './auth';

type Phase = 'starting' | 'signed-in' | 'login-required' | 'error';

export default function App(): JSX.Element {
  // One session per page lifetime; the same persistent IndexedDB key backs every proof.
  const session = useMemo(getSession, []);
  const [phase, setPhase] = useState<Phase>('starting');
  const [message, setMessage] = useState('Starting…');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);

  const fail = (error: unknown): void => {
    const loginRequired = error instanceof OidcVaultDpopClientError && error.requiresLogin;
    setPhase(loginRequired ? 'login-required' : 'error');
    setMessage(error instanceof Error ? error.message : 'The operation failed.');
    setResult('');
  };

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async (): Promise<void> => {
      try {
        const page = new URL(location.href);
        const code = page.searchParams.get('code');
        if (code) {
          // Remove the one-time code before asynchronous exchange; refresh never retries it.
          page.searchParams.delete('code');
          history.replaceState(null, '', page.href);
          await session.exchange(code);
        } else {
          await session.refresh();
        }
        if (!cancelled) {
          setPhase('signed-in');
          setMessage('Signed in · body transport · DPoP · JWT in memory only');
        }
      } catch (error) {
        if (!cancelled) fail(error);
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const run = (operation: () => Promise<void>): void => {
    setBusy(true);
    void operation()
      .catch(fail)
      .finally(() => setBusy(false));
  };

  return (
    <main>
      <h1>OIDC vault · DPoP · React</h1>
      <p>Persistent non-extractable browser key, memory-only JWT, real OIDC navigation.</p>

      <p>
        Backend: {backendOrigin} · {phase} · {message}
      </p>

      <nav>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await session.login('/callback');
            })
          }
        >
          Sign in via OIDC provider
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const response = await fetchWithDpop({ session, apis }, `${backendOrigin}/api/profile`);
              if (!response.ok) throw new Error('The protected API request failed.');
              setResult(JSON.stringify(await response.json(), null, 2));
              setPhase('signed-in');
              setMessage('Signed in · body transport · DPoP · JWT in memory only');
            })
          }
        >
          GET protected profile
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await session.refresh();
              setPhase('signed-in');
              setMessage('Signed in · body transport · DPoP · JWT in memory only');
            })
          }
        >
          Refresh (also after JWT expiry)
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await session.logout();
              setPhase('login-required');
              setMessage('Signed out. Sign in to continue.');
              setResult('');
            })
          }
        >
          Log out
        </button>
      </nav>
      <pre>{result}</pre>
    </main>
  );
}
