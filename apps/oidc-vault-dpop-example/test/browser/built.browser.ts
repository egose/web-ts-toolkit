import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { decodeProtectedHeader, calculateJwkThumbprint } from 'jose';
import type { Browser } from 'playwright';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startExampleServer, EXAMPLE_BASE_PATH } from '../../server/app';
import { closeServer, listen } from '../../server/http';
import { LOCAL_CLIENT_ID, startLocalIdp } from '../../server/local-idp';
import { browserNames, launchBrowser, loginApp } from './harness';

describe.each(browserNames)('DBJWT-10 real %s production SPA bundle', (name) => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchBrowser(name);
  });
  afterAll(async () => {
    await browser?.close();
  });

  it('runs bundled OIDC/cookie/refresh/API with real cloned keys and a browser-only module graph', async () => {
    const output = await mkdtemp(join(tmpdir(), 'dbjwt-10-built-'));
    const idp = await startLocalIdp();
    const frontendApp = express();
    const frontendServer = createServer(frontendApp);
    const frontendPort = await listen(frontendServer);
    const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
    const backend = await startExampleServer({
      frontendOrigin,
      config: { issuer: idp.issuer, clientId: LOCAL_CLIENT_ID },
      fixture: true,
    });
    const context = await browser.newContext();
    try {
      idp.allowCallback(`${backend.backendOrigin}${EXAMPLE_BASE_PATH}/cookie/callback`);
      const moduleIds: string[] = [];
      await build({
        root: fileURLToPath(new URL('../../', import.meta.url)),
        configFile: false,
        logLevel: 'warn',
        define: { 'import.meta.env.VITE_BACKEND_ORIGIN': JSON.stringify(backend.backendOrigin) },
        build: { outDir: output, emptyOutDir: true, target: 'es2022' },
        plugins: [
          {
            name: 'audit-browser-only-graph',
            generateBundle(options, bundle) {
              void options;
              for (const chunk of Object.values(bundle))
                if (chunk.type === 'chunk') moduleIds.push(...Object.keys(chunk.modules));
            },
          },
        ],
      });
      expect(moduleIds.some((id) => id.includes('/idb/'))).toBe(true);
      expect(moduleIds.some((id) => id.includes('/jose/'))).toBe(true);
      expect(moduleIds.some((id) => /express-oidc-vault|node:|__vite-browser-external|\/server\//.test(id))).toBe(
        false,
      );
      frontendApp.use(express.static(output));
      frontendApp.get('/callback', (_req, res) => res.sendFile(join(output, 'index.html')));
      const page = await context.newPage();
      await page.goto(`${frontendOrigin}/?transport=cookie`);
      await page.waitForFunction(() => Boolean(document.querySelector('#status')?.getAttribute('data-state')));
      await loginApp(page);
      const stored = await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('oidc-vault-dpop-example-v1');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const records = await new Promise<Array<{ privateKey: CryptoKey; jkt: string }>>((resolve, reject) => {
          const request = db.transaction('keys').objectStore('keys').getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        db.close();
        let exportFailed = false;
        try {
          await crypto.subtle.exportKey('jwk', records[0].privateKey);
        } catch {
          exportFailed = true;
        }
        return { jkt: records[0].jkt, extractable: records[0].privateKey.extractable, exportFailed };
      });
      expect(stored).toMatchObject({ extractable: false, exportFailed: true });
      await page.reload();
      await page.waitForFunction(() => document.querySelector('#status')?.getAttribute('data-state') === 'signed-in');
      await page.locator('#api').click();
      await page.waitForFunction(() => document.querySelector('#result')?.textContent?.includes('fixture-user'));
      expect(
        backend.requests.filter((request) => request.path === '/api/profile').map((request) => request.status),
      ).toEqual([401, 200]);
      for (const request of backend.requests.filter((request) => request.proof)) {
        expect(await calculateJwkThumbprint(decodeProtectedHeader(request.proof!).jwk!)).toBe(stored.jkt);
      }
      expect(idp.stats).toMatchObject({ callbacks: 1, refreshes: 1, pkceChecks: 1, upstreamDpopHeaders: 0 });
    } finally {
      await context.close();
      await closeServer(frontendServer);
      await backend.close();
      await idp.close();
      await rm(output, { recursive: true, force: true });
    }
  });
});
