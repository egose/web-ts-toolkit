/** Native HTTP close counters, including built-ESM discovery in real Chromium. */
import { readFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { describe, expect, it } from 'vitest';

import * as builtRuntime from '../dist/signer.mjs';
import type { SignerClient, SignerModuleLoader } from '../dist/signer.mjs';

type DiscoveryRuntime = Pick<typeof builtRuntime, 'SignerClientError' | 'createSignerClient' | 'fetchSignerBundle'>;
type CloseCounters = { opened: number; closed: number; beforeEof: number; finished: number };
type Report = {
  metadataRequests: number;
  metadata: CloseCounters;
  control: CloseCounters;
  modules: { ready: number; retired: number };
};

function startDiscoveryServer() {
  const clientSource = readFileSync(resolve(__dirname, '../dist/signer.mjs'));
  const metadata: CloseCounters = { opened: 0, closed: 0, beforeEof: 0, finished: 0 };
  const control: CloseCounters = { opened: 0, closed: 0, beforeEof: 0, finished: 0 };
  const modules = { ready: 0, retired: 0 };
  let metadataRequests = 0;
  let state = 'unavailable';
  let origin: string;

  function leaveOpen(response: ServerResponse, counters: CloseCounters): void {
    counters.opened += 1;
    response.once('finish', () => {
      counters.finished += 1;
    });
    response.once('close', () => {
      counters.closed += 1;
      if (!response.writableEnded) counters.beforeEof += 1;
    });
    response.writeHead(503, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
    response.write('temporarily unavailable');
    // No EOF, keep-alive expiry, producer timer, or automatic server-side destroy.
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url!, origin);
    if (url.pathname === '/__report') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ metadataRequests, metadata, control, modules }));
    } else if (url.pathname === '/__state') {
      state = url.searchParams.get('value')!;
      response.writeHead(204).end();
    } else if (url.pathname === '/control') {
      leaveOpen(response, control);
    } else if (url.pathname === '/signer-meta') {
      metadataRequests += 1;
      if (state === 'unavailable') {
        leaveOpen(response, metadata);
      } else {
        const retired = state === 'retirement';
        if (retired) state = 'unavailable';
        response.setHeader('content-type', 'application/json');
        response.setHeader('cache-control', 'no-store');
        response.end(
          JSON.stringify({
            version: 1,
            keyId: 'native-recovery',
            publicOrigin: origin,
            replayNamespace: 'native-discovery-http',
            signerUrl: retired ? '/retired.mjs' : '/ready.mjs',
          }),
        );
      }
    } else if (url.pathname === '/retired.mjs') {
      modules.retired += 1;
      response.writeHead(410, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end('retired');
    } else if (url.pathname === '/ready.mjs') {
      modules.ready += 1;
      response.setHeader('content-type', 'text/javascript');
      response.end(`import { createRequestSigner } from './client.mjs';
        export const signer = createRequestSigner({
          keyId: 'native-recovery', key: new Uint8Array(32).fill(7),
          publicOrigin: ${JSON.stringify(origin)}, replayNamespace: 'native-discovery-http'
        });`);
    } else if (url.pathname === '/client.mjs') {
      response.setHeader('content-type', 'text/javascript');
      response.end(clientSource);
    } else if (url.pathname === '/') {
      response.setHeader('content-type', 'text/html');
      // As in the installed-browser harness, serve the built bytes natively and
      // use a page bridge so Vite never rewrites the browser's module import.
      response.end(`<!doctype html><title>Discovery response ownership</title>
        <script type="module">
          import * as runtime from '/client.mjs';
          globalThis.discoveryRuntime = runtime;
        </script>`);
    } else {
      response.writeHead(404).end();
    }
  });
  // Own the server before awaiting listen or browser launch, including failed setup.
  const ready = new Promise<string>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve(origin);
    });
  });
  const close = () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
        else resolve();
      });
      server.closeAllConnections();
    });
  return { ready, close };
}

/** Closure-free so the same sequence can execute via Playwright in the native page. */
async function exerciseNativeDiscovery(input: {
  origin: string;
  runtime?: DiscoveryRuntime;
  loadModule?: SignerModuleLoader;
}) {
  const runtime = input.runtime ?? (globalThis as unknown as { discoveryRuntime: DiscoveryRuntime }).discoveryRuntime;
  const options = {
    metadataUrl: `${input.origin}/signer-meta`,
    apiOrigin: input.origin,
    replayNamespace: 'native-discovery-http',
    ...(input.loadModule === undefined ? {} : { loadModule: input.loadModule }),
  };
  const caller = new AbortController();
  const lifetime = setTimeout(() => caller.abort(new Error('native discovery test deadline')), 10_000);
  const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const report = async () => {
    const response = await fetch(`${input.origin}/__report`, { signal: caller.signal });
    return (await response.json()) as Report;
  };
  const setState = async (value: string) => {
    const response = await fetch(`${input.origin}/__state?value=${value}`, { signal: caller.signal });
    await response.arrayBuffer();
  };
  const failure = async (pending: Promise<unknown>) => {
    try {
      await pending;
      return { typed: false, name: 'fulfilled', code: '', message: '' };
    } catch (error) {
      const typed = error instanceof runtime.SignerClientError;
      const details = error as { name: string; code: string; message: string };
      return { typed, name: details.name, code: details.code, message: details.message };
    }
  };
  const client = runtime.createSignerClient({ ...options, loadTimeoutMs: 250 });
  let recoveryClient: SignerClient | undefined;
  let control: Response | undefined;
  try {
    // A held ordinary Fetch with the SAME caller signal proves the server does
    // not end these responses naturally and package cleanup does not abort it.
    control = await fetch(`${input.origin}/control`, { signal: caller.signal });
    const errors = [await failure(runtime.fetchSignerBundle({ ...options, signal: caller.signal }))];
    for (let call = 0; call < 3; call += 1) errors.push(await failure(client.getSigner()));
    await delay(500); // Beyond the client's whole-load deadline, with all failures already delivered.
    const afterFailures = await report();
    client.dispose();
    await delay(50);
    const afterDispose = await report();
    const callerAborted = caller.signal.aborted;
    const controlBodyUsed = control.bodyUsed;
    await control.body!.cancel();
    let afterControl = await report();
    for (let attempt = 0; afterControl.control.closed === 0 && attempt < 100; attempt += 1) {
      await delay(10);
      afterControl = await report();
    }

    await setState('ready');
    const standalone = await runtime.fetchSignerBundle({ ...options, signal: caller.signal });
    recoveryClient = runtime.createSignerClient({ ...options, loadTimeoutMs: 250 });
    const recover = async () => {
      const pending = recoveryClient!.getSigner();
      const peers = [pending, recoveryClient!.getSigner(), recoveryClient!.getSigner()];
      const signers = await Promise.all(peers);
      return {
        keyIds: signers.map((signer) => signer.keyId),
        sharedPromise: peers.every((peer) => peer === pending),
        cached: (await recoveryClient!.getSigner()) === signers[0],
      };
    };
    const recovered = await recover();
    const afterRecovery = await report();

    // The module fails natively in Chromium. Its one discovery refetch now gets
    // another open 503, then this SAME client must support an explicit recovery.
    await setState('retirement');
    recoveryClient.invalidate('native-recovery');
    const retirementError = await failure(recoveryClient.getSigner());
    await delay(50);
    const afterRetirement = await report();
    await setState('ready');
    const retirementRecovery = await recover();
    const final = await report();
    return {
      errors,
      afterFailures,
      afterDispose,
      callerAborted,
      controlBodyUsed,
      afterControl,
      standaloneKeyId: standalone.signer.keyId,
      recovered,
      afterRecovery,
      retirementError,
      afterRetirement,
      retirementRecovery,
      final,
    };
  } finally {
    clearTimeout(lifetime);
    client.dispose();
    recoveryClient?.dispose();
    // Only test cleanup aborts the caller. All returned counters precede cleanup.
    caller.abort();
    if (control?.body !== null && control?.body !== undefined) void control.body.cancel().catch(() => undefined);
  }
}

describe('native discovery response closure and recovery', () => {
  it.each(['Node', 'Chromium'] as const)(
    '%s closes abandoned metadata before EOF and recovers',
    async (platform) => {
      const fixture = startDiscoveryServer();
      let browser: Browser | undefined;
      const pageErrors: string[] = [];
      const nodeLoads: string[] = [];
      try {
        const origin = await fixture.ready;
        let result: Awaited<ReturnType<typeof exerciseNativeDiscovery>>;
        if (platform === 'Node') {
          result = await exerciseNativeDiscovery({
            origin,
            runtime: builtRuntime,
            // Stock Node has native Fetch but no HTTP import loader. Keep only
            // this module seam injectable; every discovery is an unmodified Fetch.
            loadModule: async (url) => {
              nodeLoads.push(new URL(url).pathname);
              if (url.endsWith('/retired.mjs')) throw new Error('retired module');
              return {
                signer: builtRuntime.createRequestSigner({
                  keyId: 'native-recovery',
                  key: new Uint8Array(32).fill(7),
                  publicOrigin: origin,
                  replayNamespace: 'native-discovery-http',
                }),
              };
            },
          });
        } else {
          browser = await chromium.launch({ timeout: 15_000 });
          const context = await browser.newContext({ serviceWorkers: 'block' });
          const page = await context.newPage();
          page.setDefaultTimeout(10_000);
          page.setDefaultNavigationTimeout(10_000);
          page.on('pageerror', (error) => pageErrors.push(error.message));
          await page.goto(`${origin}/`, { waitUntil: 'load' });
          await page.waitForFunction(() => 'discoveryRuntime' in globalThis);
          // No fetch/loadModule overrides, routing interception, or source imports.
          result = await page.evaluate(exerciseNativeDiscovery, { origin });
        }

        console.info(
          'Native discovery response counters',
          JSON.stringify({
            platform,
            version: browser?.version() ?? process.version,
            afterFailures: result.afterFailures,
            afterDispose: result.afterDispose,
            afterControl: result.afterControl,
            afterRetirement: result.afterRetirement,
            final: result.final,
          }),
        );
        const error = {
          typed: true,
          name: 'SignerClientError',
          code: 'SIGNER_LOAD_FAILED',
          message: '[express-request-attestation] Signer metadata fetch failed.',
        };
        expect(result.errors).toEqual(Array(4).fill(error));
        const closedFour = { opened: 4, closed: 4, beforeEof: 4, finished: 0 };
        const heldControl = { opened: 1, closed: 0, beforeEof: 0, finished: 0 };
        for (const snapshot of [result.afterFailures, result.afterDispose]) {
          expect.soft(snapshot).toEqual({
            metadataRequests: 4,
            metadata: closedFour,
            control: heldControl,
            modules: { ready: 0, retired: 0 },
          });
        }
        expect(result.callerAborted).toBe(false);
        expect(result.controlBodyUsed).toBe(false);
        expect(result.afterControl.control).toEqual({ opened: 1, closed: 1, beforeEof: 1, finished: 0 });
        expect(result.standaloneKeyId).toBe('native-recovery');
        const recovery = { keyIds: Array(3).fill('native-recovery'), sharedPromise: true, cached: true };
        expect(result.recovered).toEqual(recovery);
        expect(result.afterRecovery.metadataRequests).toBe(6);
        expect(result.retirementError).toEqual(error);
        expect.soft(result.afterRetirement.metadata).toEqual({ opened: 5, closed: 5, beforeEof: 5, finished: 0 });
        expect(result.afterRetirement.metadataRequests).toBe(8);
        expect(result.retirementRecovery).toEqual(recovery);
        expect(result.final.metadataRequests).toBe(9);
        expect.soft(result.final.metadata).toEqual({ opened: 5, closed: 5, beforeEof: 5, finished: 0 });
        if (platform === 'Node') expect(nodeLoads).toEqual(['/ready.mjs', '/ready.mjs', '/retired.mjs', '/ready.mjs']);
        else expect(result.final.modules).toEqual({ ready: 1, retired: 1 });
        expect(pageErrors).toEqual([]);
      } finally {
        try {
          await browser?.close();
        } finally {
          await fixture.close();
        }
      }
    },
    30_000,
  );
});
