// Loaded ONLY by the browser harness's test-only HTML transform, never by the
// production SPA/build. Reuse its public-package bridge, local vault and IdP.
import { OidcVaultDpopClientError } from '@web-ts-toolkit/oidc-vault-dpop-client';
import { apiFetch, createSession, exchange, login, logout, refreshBearer } from './page-bridge';

const url = new URL(location.href);
const transport = url.searchParams.get('transport') === 'cookie' ? 'cookie' : 'body';
const backendOrigin = (globalThis as typeof globalThis & { __DPOP_TEST_BACKEND__: string }).__DPOP_TEST_BACKEND__;
const name = 'bearer-app';
document.querySelector('#app')!.innerHTML = `
  <h1>Test-only explicit Bearer fixture</h1>
  <input type="checkbox" id="recognition" />
  <button id="login">Sign in</button><button id="api">Profile</button>
  <button id="refresh">Refresh</button><button id="logout">Log out</button>
  <p id="status"></p><pre id="result"></pre>
`;
const status = document.querySelector<HTMLElement>('#status')!;
const result = document.querySelector<HTMLElement>('#result')!;
const ready = () => {
  status.dataset.state = 'signed-in';
  status.textContent = 'Signed in · Bearer · app-local token in memory';
};
const failure = (error: unknown) => {
  status.dataset.code = error instanceof OidcVaultDpopClientError ? error.code : 'UNEXPECTED_FAILURE';
  status.dataset.state = error instanceof OidcVaultDpopClientError && error.requiresLogin ? 'login-required' : 'error';
  status.textContent = error instanceof Error ? error.message : 'Unexpected fixture error';
};
const run = (operation: () => Promise<unknown>) => void operation().catch(failure);
await createSession({
  name,
  backendOrigin,
  basePath: `/auth/oidc/${transport}`,
  transport,
  dpop: false,
  observeCredentials: true,
});
document.querySelector<HTMLElement>('#login')!.onclick = () =>
  run(() => login({ name, returnTo: `/callback?transport=${transport}&dpop=0` }));
document.querySelector<HTMLElement>('#api')!.onclick = () =>
  run(async () => {
    const response = await apiFetch({ name, backendOrigin });
    if (response.status !== 200) throw new Error('Protected API rejected fixture credentials.');
    result.textContent = JSON.stringify(response.body);
    ready();
  });
document.querySelector<HTMLElement>('#refresh')!.onclick = () =>
  run(async () => {
    await refreshBearer({ name });
    ready();
  });
document.querySelector<HTMLElement>('#logout')!.onclick = () =>
  run(async () => {
    await logout({ name });
    status.dataset.state = 'login-required';
    result.textContent = '';
  });
try {
  const code = url.searchParams.get('code');
  if (code !== null) {
    url.searchParams.delete('code');
    history.replaceState(null, '', url.href);
    await exchange({ name, code });
  } else await refreshBearer({ name });
  ready();
} catch (error) {
  failure(error);
}
