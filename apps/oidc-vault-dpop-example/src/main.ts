import {
  createDeviceFingerprint,
  createOidcVaultDpopSession,
  fetchWithDpop,
  OidcVaultDpopClientError,
} from '@web-ts-toolkit/oidc-vault-dpop-client';
import { currentExampleRecognitionSignal } from './recognition';
import './style.css';

const mount = document.querySelector<HTMLDivElement>('#app')!;
const page = new URL(location.href);
const transport = page.searchParams.get('transport') === 'cookie' ? 'cookie' : 'body';
const backendOrigin = import.meta.env.VITE_BACKEND_ORIGIN ?? 'http://127.0.0.1:4318';
const basePath = `${(import.meta.env.VITE_VAULT_BASE_PATH ?? '/auth/oidc').replace(/\/+$/g, '')}/${transport}`;

mount.innerHTML = `
  <h1>OIDC vault · DPoP</h1>
  <p>Persistent non-extractable browser key, memory-only JWT, real OIDC navigation.</p>
  <label>Session transport <select id="transport"><option value="body">Body (sessionStorage handle)</option><option value="cookie">Cookie (HttpOnly backend handle)</option></select></label>
  <fieldset><legend>Optional browser recognition</legend>
    <p>This generic demo signal is copyable change detection, <strong>not proof of possession</strong>.
    It reads browser language/platform only at login/exchange/refresh; the backend hashes it and retains it for the session (8 hours), plus store cleanup/backups.
    This example does not cache or persist the signal. Use a disclosed current-signal adapter in your application.</p>
    <label><input type="checkbox" id="recognition" /> Send current demo signal</label>
    <label>Current demo signal <input id="signal" readonly /></label>
  </fieldset>
  <nav><button id="login">Sign in via OIDC provider</button><button id="api">GET protected profile</button><button id="refresh">Refresh (also after JWT expiry)</button><button id="logout">Log out</button></nav>
  <p id="status" role="status">Starting…</p>
  <pre id="result"></pre>
`;

const status = document.querySelector<HTMLParagraphElement>('#status')!;
const result = document.querySelector<HTMLPreElement>('#result')!;
const selection = document.querySelector<HTMLSelectElement>('#transport')!;
const recognition = document.querySelector<HTMLInputElement>('#recognition')!;
const signal = document.querySelector<HTMLInputElement>('#signal')!;
const loginButton = document.querySelector<HTMLButtonElement>('#login')!;
loginButton.disabled = true;
signal.value = currentExampleRecognitionSignal();
selection.value = transport;
// The checked state can survive an OIDC redirect without storing the identifier.
recognition.checked = page.searchParams.get('recognition') === '1';

let session: ReturnType<typeof createOidcVaultDpopSession>;
const showError = (error: unknown): void => {
  status.textContent = error instanceof Error ? error.message : 'The operation failed.';
  status.dataset.state = error instanceof OidcVaultDpopClientError && error.requiresLogin ? 'login-required' : 'error';
  result.textContent = '';
  loginButton.disabled = false;
};
const showSignedIn = (): void => {
  status.textContent = `Signed in · ${transport} transport · DPoP · JWT in memory only`;
  status.dataset.state = 'signed-in';
  loginButton.disabled = false;
};

try {
  const fingerprint = createDeviceFingerprint(async () =>
    recognition.checked ? currentExampleRecognitionSignal() : undefined,
  );
  session = createOidcVaultDpopSession({ backendOrigin, basePath, sessionTransport: transport, fingerprint });
  const apis = [{ origin: backendOrigin, replayNamespace: 'oidc-vault-dpop-example-api' }];
  const run = (operation: () => Promise<void>) => {
    void operation().catch(showError);
  };
  selection.onchange = () => {
    const next = new URL(location.href);
    next.pathname = '/';
    next.search = `?transport=${selection.value}`;
    location.assign(next.href);
  };
  loginButton.onclick = () =>
    run(async () => {
      loginButton.disabled = true;
      const returnTo = `/callback?transport=${transport}${recognition.checked ? '&recognition=1' : ''}`;
      await session.login(returnTo);
    });
  document.querySelector<HTMLButtonElement>('#api')!.onclick = () =>
    run(async () => {
      const response = await fetchWithDpop({ session, apis }, `${backendOrigin}/api/profile`);
      if (!response.ok) throw new Error('The protected API request failed.');
      result.textContent = JSON.stringify(await response.json(), null, 2);
      showSignedIn();
    });
  document.querySelector<HTMLButtonElement>('#refresh')!.onclick = () =>
    run(async () => {
      await session.refresh();
      showSignedIn();
    });
  document.querySelector<HTMLButtonElement>('#logout')!.onclick = () =>
    run(async () => {
      await session.logout();
      status.textContent = 'Signed out. Sign in to continue.';
      status.dataset.state = 'login-required';
      result.textContent = '';
    });
  const code = page.searchParams.get('code');
  if (code) {
    // Remove the one-time code before asynchronous exchange; refresh never retries it.
    page.searchParams.delete('code');
    history.replaceState(null, '', page.href);
    await session.exchange(code);
    showSignedIn();
  } else {
    await session.refresh();
    showSignedIn();
  }
} catch (error) {
  showError(error);
}
