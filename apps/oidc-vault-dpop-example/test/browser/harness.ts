import { fileURLToPath } from 'node:url';

import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';

import { startExampleServer, EXAMPLE_BASE_PATH } from '../../server/app';
import { LOCAL_CLIENT_ID, startLocalIdp } from '../../server/local-idp';
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
  // Vite chooses an unused loopback port. Define the runtime backend URL before
  // the first page import; neither a proxy nor Node-side cookie emulation is used.
  const vite = await createViteServer({
    root,
    configFile: false,
    server: { host: '127.0.0.1', port: 0, strictPort: true },
    define: { 'import.meta.env.VITE_BACKEND_ORIGIN': 'globalThis.__DPOP_TEST_BACKEND__' },
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Missing SPA fixture address.');
  const frontendOrigin = `http://127.0.0.1:${address.port}`;
  const backend = await startExampleServer({
    frontendOrigin,
    config: { issuer: idp.issuer, clientId: LOCAL_CLIENT_ID },
    fixture: true,
    ...options,
  });
  for (const transport of ['body', 'cookie'])
    idp.allowCallback(`${backend.backendOrigin}${EXAMPLE_BASE_PATH}/${transport}/callback`);
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
  await page.waitForFunction(() => document.querySelector('#status')?.getAttribute('data-state') === 'signed-in');
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
