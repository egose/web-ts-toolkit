import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { chromium, type Browser, type Page, type Request as NativeRequest } from 'playwright';
import {
  safeError,
  type BrowserDiagnostics,
  type SafeError,
} from '../test-packed-consumer/consumer/installed-browser-observer.mjs';

export type RetryFault =
  | 'load-before-discovery'
  | 'invalidate'
  | 'sign'
  | 'retry-header'
  | 'repeat-proof'
  | 'retry-request';

export type BrowserScenario = {
  name: string;
  crossOrigin: boolean;
  includeCredentials: boolean;
  rotate: boolean;
  exposeMarker: boolean;
  /** Isolate one explicit, unbound native Fetch injection; other boundaries keep their native defaults. */
  nativeFetch?: 'standalone' | 'client' | 'fetch' | 'fetchFn';
  /** Opt-in causal controls only; ordinary installed scenarios keep native defaults. */
  fault?: RetryFault;
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
  /** Null when an opt-in transport control supplies no valid HTTP response. */
  status: number | null;
  marker: string | null;
  allowOrigin: string | null;
  allowCredentials: string | null;
  allowMethods: string | null;
  allowHeaders: string | null;
  maxAge: string | null;
  exposedHeaders: string | null;
  cacheControl: string | null;
  countersAtResponse: Counters | null;
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
  faults: Array<{ fault: 'retry-request'; post: 2 }>;
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
  diagnostics: BrowserDiagnostics;
};

type BrowserInput = {
  apiOrigin: string;
  replayNamespace: string;
  includeCredentials: boolean;
  requestTarget: string;
  bodyText: string;
  nativeFetch?: BrowserScenario['nativeFetch'];
  fault?: RetryFault;
};

type Resource = 'api' | 'discovery' | 'key-module' | 'runtime-module' | 'installed-entry' | 'fixture' | 'other';
type Method = 'GET' | 'POST' | 'OPTIONS' | 'other';
type NativeEvent =
  | { kind: 'request'; request: number; resource: Resource; method: Method }
  | { kind: 'response'; request: number; resource: Resource; method: Method; status: number }
  | {
      kind: 'request-failed';
      request: number;
      resource: Resource;
      method: Method;
      failure: string;
      responseStatus: number | null;
    }
  | { kind: 'console-error' }
  | ({ kind: 'page-error' | 'diagnostics-unavailable' | 'report-unavailable' } & SafeError);
export type NativeDiagnostics = { events: NativeEvent[]; dropped: number };

function resource(url: string): Resource {
  const pathname = new URL(url).pathname;
  if (pathname.startsWith('/api/')) return 'api';
  if (pathname === '/attestation/signer-meta') return 'discovery';
  if (/^\/attestation\/signer\.[a-f0-9]{64}\.mjs$/.test(pathname)) return 'key-module';
  if (/^\/attestation\/runtime\.[a-f0-9]{64}\.mjs$/.test(pathname)) return 'runtime-module';
  if (pathname === '/installed-signer.mjs') return 'installed-entry';
  if (['/', '/session', '/installed-browser.mjs', '/installed-browser-observer.mjs'].includes(pathname))
    return 'fixture';
  return 'other';
}

function method(value: string): Method {
  return value === 'GET' || value === 'POST' || value === 'OPTIONS' ? value : 'other';
}

function failureName(value: string | undefined): string {
  return [
    'net::ERR_FAILED',
    'net::ERR_ABORTED',
    'net::ERR_CONNECTION_REFUSED',
    'net::ERR_CONNECTION_RESET',
    'net::ERR_EMPTY_RESPONSE',
    'net::ERR_HTTP_RESPONSE_CODE_FAILURE',
    'net::ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_LENGTH',
  ].includes(value ?? '')
    ? value!
    : 'other';
}

function summarizeReport(report: ServerReport) {
  return {
    discovery: report.traffic.filter((row) => row.target === '/attestation/signer-meta').length,
    keyModules: report.traffic.filter((row) => /^\/attestation\/signer\./.test(row.target)).length,
    runtimeModules: report.traffic.filter((row) => /^\/attestation\/runtime\./.test(row.target)).length,
    apiStatuses: report.traffic.filter((row) => row.target.startsWith('/api/')).map((row) => [row.method, row.status]),
    faults: report.faults,
    ...report.counters,
  };
}

/** Safe diagnostics survive cleanup and rejection; raw server observations stay private until explicitly inspected. */
export class InstalledBrowserScenarioError extends Error {
  readonly browserDiagnostics: BrowserDiagnostics | null;
  readonly nativeDiagnostics: NativeDiagnostics;
  readonly httpBeforeCleanup: ReturnType<typeof summarizeReport> | null;
  readonly chromiumVersion: string | null;
  #report: ServerReport | null;

  constructor(
    scenario: BrowserScenario,
    reason: unknown,
    context: {
      browserDiagnostics: BrowserDiagnostics | null;
      nativeDiagnostics: NativeDiagnostics;
      report: ServerReport | null;
      chromiumVersion: string | null;
      serverOutputPresent: boolean;
    },
  ) {
    const httpBeforeCleanup = context.report === null ? null : summarizeReport(context.report);
    super(
      `Installed browser scenario failed: ${scenario.name}\n${JSON.stringify({
        error: safeError(reason),
        browserDiagnostics: context.browserDiagnostics,
        nativeDiagnostics: context.nativeDiagnostics,
        httpBeforeCleanup,
        chromiumVersion: context.chromiumVersion,
        serverOutputPresent: context.serverOutputPresent,
      })}`,
    );
    this.browserDiagnostics = context.browserDiagnostics;
    this.nativeDiagnostics = context.nativeDiagnostics;
    this.httpBeforeCleanup = httpBeforeCleanup;
    this.chromiumVersion = context.chromiumVersion;
    this.#report = context.report;
  }

  get report(): ServerReport | null {
    return this.#report;
  }
}

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
  nativeDiagnostics: NativeDiagnostics;
}> {
  const child = spawn(
    process.execPath,
    [
      path.resolve(consumerDir, 'installed-browser-server.mjs'),
      JSON.stringify({ rotate: scenario.rotate, exposeMarker: scenario.exposeMarker, fault: scenario.fault }),
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
  let page: Page | undefined;
  let ready: Ready | undefined;
  let chromiumVersion: string | null = null;
  const pageErrors: string[] = [];
  const nativeEvents: NativeEvent[] = [];
  const nativeRequests = new WeakMap<NativeRequest, { request: number; responseStatus: number | null }>();
  let requestCount = 0;
  const identify = (request: NativeRequest) => {
    let observation = nativeRequests.get(request);
    if (observation === undefined) {
      observation = { request: ++requestCount, responseStatus: null };
      nativeRequests.set(request, observation);
    }
    return observation;
  };
  let dropped = 0;
  const diagnose = (event: NativeEvent): void => {
    if (nativeEvents.length < 64) nativeEvents.push(event);
    else dropped += 1;
  };
  const nativeSnapshot = (): NativeDiagnostics => ({ events: nativeEvents.map((event) => ({ ...event })), dropped });
  try {
    ready = await waitUntilReady(child, () => output);
    browser = await chromium.launch({ timeout: 15_000 });
    chromiumVersion = browser.version();
    const context = await browser.newContext({ serviceWorkers: 'block' });
    page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(10_000);
    page.on('pageerror', (error) => {
      const details = safeError(error);
      if (pageErrors.length < 16) pageErrors.push(details.errorName);
      diagnose({ kind: 'page-error', ...details });
    });
    page.on('console', (message) => {
      if (message.type() === 'error') diagnose({ kind: 'console-error' });
    });
    page.on('request', (request) =>
      diagnose({
        kind: 'request',
        request: identify(request).request,
        resource: resource(request.url()),
        method: method(request.method()),
      }),
    );
    page.on('requestfailed', (request) =>
      diagnose({
        kind: 'request-failed',
        ...identify(request),
        resource: resource(request.url()),
        method: method(request.method()),
        failure: failureName(request.failure()?.errorText),
      }),
    );
    page.on('response', (response) => {
      const observation = identify(response.request());
      observation.responseStatus = response.status();
      diagnose({
        kind: 'response',
        request: observation.request,
        resource: resource(response.url()),
        method: method(response.request().method()),
        status: response.status(),
      });
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
          fault: scenario.fault,
          ...request,
        },
      ),
      15_000,
      () => `Installed browser scenario timed out: ${scenario.name}\n${output}`,
    );
    const report = await readReport(ready.apiOrigin);
    if (`${session.name}=${session.value}` !== report.sessionCookie)
      throw new Error('Installed session cookie differs');
    return { ready, browser: result, report, pageErrors, chromiumVersion, nativeDiagnostics: nativeSnapshot() };
  } catch (error) {
    let browserDiagnostics: BrowserDiagnostics | null = null;
    if (page !== undefined && !page.isClosed()) {
      try {
        browserDiagnostics = await deadline(
          page.evaluate(() => {
            const consumer = (
              globalThis as typeof globalThis & {
                installedBrowserConsumer?: { readDiagnostics: () => BrowserDiagnostics | null };
              }
            ).installedBrowserConsumer;
            return consumer?.readDiagnostics() ?? null;
          }),
          1000,
          () => 'Installed fixture diagnostic read timed out',
        );
      } catch (diagnosticError) {
        diagnose({ kind: 'diagnostics-unavailable', ...safeError(diagnosticError) });
      }
    }
    let report: ServerReport | null = null;
    if (ready !== undefined) {
      try {
        report = await readReport(ready.apiOrigin);
      } catch (reportError) {
        diagnose({ kind: 'report-unavailable', ...safeError(reportError) });
      }
    }
    throw new InstalledBrowserScenarioError(scenario, error, {
      browserDiagnostics,
      nativeDiagnostics: nativeSnapshot(),
      report,
      chromiumVersion,
      serverOutputPresent: output.length > 0,
    });
  } finally {
    // Closing the browser also owns contexts/pages created before a setup failure.
    try {
      await browser?.close();
    } finally {
      await stopServer(child, exited);
    }
  }
}
