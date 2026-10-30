import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';

import { startExampleServer, EXAMPLE_BASE_PATH } from '../../server/app';
import { LOCAL_CLIENT_ID, startLocalIdp } from '../../server/local-idp';
import { closeServer, listen } from '../../server/http';
import type * as Bridge from './page-bridge';

export type BrowserName = 'chromium' | 'firefox' | 'webkit';
export const browserNames = (process.env.DPOP_TEST_BROWSERS ?? 'chromium').split(',') as BrowserName[];

export const launchBrowser = async (name: BrowserName): Promise<Browser> => {
  const engines = { chromium, firefox, webkit };
  if (!engines[name]) throw new Error('Unknown DPOP_TEST_BROWSERS engine.');
  const browser = await engines[name].launch({
    headless: true,
    ...(name === 'chromium' ? { args: ['--no-sandbox'] } : {}),
  });
  console.info(`DBJWT-10 real browser: ${name} ${browser.version()}`);
  return browser;
};

export const startBrowserFixture = async (
  browser: Browser,
  options: { tokenLifetimeSeconds?: number; nonceLifetimeSeconds?: number } = {},
) => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const idp = await startLocalIdp();
  // Bind port 0 atomically in Node. Vite's port-0 helper probes then rebinds a
  // selected port, racing other fixture/Mongo listeners on the same host.
  // HMR is unnecessary here; the real Vite middleware still serves the SPA.
  const vite = await createViteServer({
    root,
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    define: { 'import.meta.env.VITE_BACKEND_ORIGIN': 'globalThis.__DPOP_TEST_BACKEND__' },
  });
  const frontend = createServer(vite.middlewares);
  const port = await listen(frontend);
  const frontendOrigin = `http://127.0.0.1:${port}`;
  const backend = await startExampleServer({
    frontendOrigin,
    config: { issuer: idp.issuer, clientId: LOCAL_CLIENT_ID },
    fixture: true,
    ...options,
  });
  for (const transport of ['body', 'cookie']) {
    idp.allowCallback(`${backend.backendOrigin}${EXAMPLE_BASE_PATH}/${transport}/callback`);
    idp.allowPostLogout(`${frontendOrigin}/signed-out?transport=${transport}`);
  }
  const context = await browser.newContext();
  await context.addInitScript((backendOrigin) => {
    Object.defineProperty(globalThis, '__DPOP_TEST_BACKEND__', { value: backendOrigin });
  }, backend.backendOrigin);
  return {
    backend,
    idp,
    frontendOrigin,
    context,
    vite,
    async close() {
      await context.close();
      await closeServer(frontend);
      await vite.close();
      await backend.close();
      await idp.close();
    },
  };
};
export type BrowserFixture = Awaited<ReturnType<typeof startBrowserFixture>>;

export const openApp = async (
  fixture: BrowserFixture,
  transport: 'body' | 'cookie',
  context: BrowserContext = fixture.context,
): Promise<Page> => {
  const page = await context.newPage();
  await page.goto(`${fixture.frontendOrigin}/?transport=${transport}`);
  await page.waitForFunction(() => Boolean(document.querySelector('#status')?.getAttribute('data-state')));
  return page;
};

export const loginApp = async (page: Page, recognition = false): Promise<void> => {
  if (recognition) await page.locator('#recognition').check();
  const startingStatus = await page.locator('#status').textContent();
  await page.locator('#login').click();
  try {
    await page.waitForURL(/\/issuer\/authorize\?/);
  } catch (error) {
    throw new Error(
      `Login did not navigate: initial=${startingStatus}; current=${await page.locator('#status').textContent()}`,
      { cause: error },
    );
  }
  await page.locator('#continue').click();
  await page.waitForURL(/\/callback\?transport=/);
  try {
    await page.waitForFunction(() => document.querySelector('#status')?.getAttribute('data-state') === 'signed-in');
  } catch (error) {
    throw new Error(`Callback did not sign in: current=${await page.locator('#status').textContent()}`, {
      cause: error,
    });
  }
};

type BridgeApi = typeof Bridge;
export const callBrowser = <K extends keyof BridgeApi>(
  page: Page,
  operation: K,
  input: Parameters<BridgeApi[K]>[0],
): Promise<Awaited<ReturnType<BridgeApi[K]>>> =>
  page.evaluate(
    async ({ operation, input }) => {
      // Only test-controller code uses Function: Vitest SSR rewrites import() in
      // callbacks before Playwright serializes them. Load the bridge in the page's
      // native module realm so all IDB/crypto/cookie activity remains real-browser.
      const load = new Function('return import("/test/browser/page-bridge.ts")') as () => Promise<BridgeApi>;
      const bridge = await load();
      const run = bridge[operation] as (input: unknown) => Promise<unknown>;
      return run(input);
    },
    { operation, input },
  ) as Promise<Awaited<ReturnType<BridgeApi[K]>>>;

export const readBrowserKey = (page: Page, backendOrigin: string, basePath: string) =>
  callBrowser(page, 'inspectKey', { backendOrigin, basePath, create: false });

export const removeBrowserKey = (page: Page, backendOrigin: string, basePath: string) =>
  callBrowser(page, 'removeKey', { backendOrigin, basePath });
