import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';

export type BrowserScenario = {
  name: string;
  crossOrigin: boolean;
  includeCredentials: boolean;
  rotate: boolean;
  exposeMarker: boolean;
  /** Isolate one explicit, unbound native Fetch injection; other boundaries keep their native defaults. */
  nativeFetch?: 'standalone' | 'client' | 'fetch' | 'fetchFn';
};

type Ready = {
  type: 'ready';
  apiOrigin: string;
  webOrigin: string;
  replayNamespace: string;
  signerEntry: string;
};

type Counters = {
  captureCalls: number;
  authCalls: number;
  authorizedCalls: number;
  guardCalls: number;
  rotations: number;
  reserveCalls: number;
  successfulReservations: number;
  businessCalls: number;
};

export type HttpObservation = {
  method: string;
  target: string;
  origin: string | null;
  cookie: string | null;
  contentType: string | null;
  fetchMode: string | null;
  fetchDest: string | null;
  requestedMethod: string | null;
  requestedHeaders: string[];
  proof: string | null;
  proofHeaderCount: number;
  envelope: { keyId: string; timestampMs: number; nonceHex: string; mac: string } | null;
  receivedAtMs: number;
  rawBodyHex: string | null;
  capturedBody: { digestHex: string; byteLength: number } | null;
  parsedBody: unknown;
  principal: string | null;
  status: number;
  marker: string | null;
  allowOrigin: string | null;
  allowCredentials: string | null;
  allowMethods: string | null;
  allowHeaders: string | null;
  maxAge: string | null;
  exposedHeaders: string | null;
  cacheControl: string | null;
  countersAtResponse: Counters;
};

type ServerReport = {
  counters: Counters;
  traffic: HttpObservation[];
  reservations: Array<{ replayKey: string; retainUntilMs: number; result: string }>;
  effects: Array<{
    principal: string;
    body: unknown;
    target: string;
    capturedBody: { digestHex: string; byteLength: number };
  }>;
  sessionCookie: string;
};

type BrowserResult = {
  discoveryProbe: {
    kind: 'standalone' | 'client';
    keyId: string;
    publicOrigin: string;
    replayNamespace: string;
    shared: boolean | null;
  } | null;
  response: {
    status: number;
    type: string;
    url: string;
    redirected: boolean;
    marker: string | null;
    cacheControl: string | null;
    bodyUsed: boolean;
    bodyLocked: boolean;
    text: string;
  };
  credentials: string;
  callerBodyUsed: boolean;
  callerBodyText: string;
  secureContext: boolean;
  visibleCookies: string;
};

type BrowserInput = {
  apiOrigin: string;
  replayNamespace: string;
  includeCredentials: boolean;
  requestTarget: string;
  bodyText: string;
  nativeFetch?: BrowserScenario['nativeFetch'];
};

function deadline<T>(pending: Promise<T>, milliseconds: number, message: () => string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((resolve, reject) => {
    void resolve;
    timer = setTimeout(() => reject(new Error(message())), milliseconds);
  });
  return Promise.race([pending, timeout]).finally(() => clearTimeout(timer));
}

function waitUntilReady(child: ChildProcess, output: () => string): Promise<Ready> {
  return new Promise<Ready>((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('error', onError);
      child.off('exit', onExit);
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onExit = (): void => {
      cleanup();
      reject(new Error(`Installed server exited before readiness: ${output()}`));
    };
    const onMessage = (message: unknown): void => {
      if (message !== null && typeof message === 'object' && 'type' in message && message.type === 'ready') {
        cleanup();
        resolve(message as Ready);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Installed server startup timed out: ${output()}`));
    }, 15_000);
    child.on('message', onMessage);
    child.on('error', onError);
    child.on('exit', onExit);
  });
}

type Exit = { code: number | null; signal: NodeJS.Signals | null; error?: Error };

async function stopServer(child: ChildProcess, exited: Promise<Exit>): Promise<void> {
  if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 3000);
  try {
    const exit = await deadline(exited, 5000, () => 'Installed server failed to exit after SIGKILL');
    if (exit.error) throw exit.error;
    if (exit.code !== 0 || exit.signal !== null) {
      throw new Error(`Installed server did not shut down cleanly: code=${exit.code}, signal=${exit.signal}`);
    }
  } finally {
    clearTimeout(killTimer);
  }
}

async function readReport(apiOrigin: string): Promise<ServerReport> {
  const response = await fetch(`${apiOrigin}/__report`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Installed report failed: ${response.status}`);
  return (await response.json()) as ServerReport;
}

/** Own resources before awaiting readiness/launch, including partial setup failures. */
export async function runInstalledBrowserScenario(
  consumerDir: string,
  scenario: BrowserScenario,
  request: { requestTarget: string; bodyText: string },
): Promise<{
  ready: Ready;
  browser: BrowserResult;
  report: ServerReport;
  pageErrors: string[];
  chromiumVersion: string;
}> {
  const child = spawn(
    process.execPath,
    [
      path.resolve(consumerDir, 'installed-browser-server.mjs'),
      JSON.stringify({ rotate: scenario.rotate, exposeMarker: scenario.exposeMarker }),
    ],
    { cwd: consumerDir, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
  );
  let output = '';
  const observeOutput = (chunk: Buffer): void => {
    output = (output + String(chunk)).slice(-16_384);
  };
  child.stdout?.on('data', observeOutput);
  child.stderr?.on('data', observeOutput);
  // Always observe spawn errors, including ones preceding readiness or cleanup.
  const exited = new Promise<Exit>((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
    child.once('error', (error) => resolve({ code: null, signal: null, error }));
  });
  let browser: Browser | undefined;
  let ready: Ready | undefined;
  const pageErrors: string[] = [];
  const browserDiagnostics: string[] = [];
  const diagnose = (message: string): void => {
    if (browserDiagnostics.length < 16) browserDiagnostics.push(message);
  };
  try {
    ready = await waitUntilReady(child, () => output);
    browser = await chromium.launch({ timeout: 15_000 });
    const chromiumVersion = browser.version();
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(10_000);
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') diagnose(message.text());
    });
    page.on('requestfailed', (request) => diagnose(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('response', (response) => {
      if (response.status() >= 400) diagnose(`${response.status()}: ${response.url()}`);
    });
    // Set a real HttpOnly cookie via HTTP, rather than inserting it through Playwright.
    const sessionResponse = await page.goto(`${ready.apiOrigin}/session`, { waitUntil: 'load' });
    if (sessionResponse?.status() !== 200) throw new Error('Installed session setup failed');
    const session = (await context.cookies(ready.apiOrigin)).find((cookie) => cookie.name === 'installed_session');
    if (!session?.httpOnly || session.sameSite !== 'Lax')
      throw new Error('Installed HttpOnly session cookie is missing');
    const pageOrigin = scenario.crossOrigin ? ready.webOrigin : ready.apiOrigin;
    await page.goto(`${pageOrigin}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => 'installedBrowserConsumer' in globalThis);
    const result = await deadline(
      page.evaluate(
        (input: BrowserInput) => {
          const pageGlobal = globalThis as typeof globalThis & {
            installedBrowserConsumer: { submitPreparedPost: (input: BrowserInput) => Promise<BrowserResult> };
          };
          return pageGlobal.installedBrowserConsumer.submitPreparedPost(input);
        },
        {
          apiOrigin: ready.apiOrigin,
          replayNamespace: ready.replayNamespace,
          includeCredentials: scenario.includeCredentials,
          nativeFetch: scenario.nativeFetch,
          ...request,
        },
      ),
      15_000,
      () => `Installed browser scenario timed out: ${scenario.name}\n${output}`,
    );
    const report = await readReport(ready.apiOrigin);
    if (`${session.name}=${session.value}` !== report.sessionCookie)
      throw new Error('Installed session cookie differs');
    return { ready, browser: result, report, pageErrors, chromiumVersion };
  } catch (error) {
    if (ready !== undefined) {
      try {
        const report = await readReport(ready.apiOrigin);
        diagnose(
          `HTTP before cleanup: ${JSON.stringify({
            discovery: report.traffic.filter((row) => row.target === '/attestation/signer-meta').length,
            keyModules: report.traffic.filter((row) => /^\/attestation\/signer\./.test(row.target)).length,
            runtimeModules: report.traffic.filter((row) => /^\/attestation\/runtime\./.test(row.target)).length,
            apiStatuses: report.traffic
              .filter((row) => row.target.startsWith('/api/'))
              .map((row) => [row.method, row.status]),
            ...report.counters,
          })}`,
        );
      } catch (reportError) {
        diagnose(`HTTP report failed: ${String(reportError)}`);
      }
    }
    throw new Error(
      `Installed browser scenario failed: ${scenario.name}\n${String(error)}\n` +
        [...pageErrors, ...browserDiagnostics, output].join('\n'),
      { cause: error },
    );
  } finally {
    // Closing the browser also owns contexts/pages created before a setup failure.
    try {
      await browser?.close();
    } finally {
      await stopServer(child, exited);
    }
  }
}
