import { decodeJwt, decodeProtectedHeader, calculateJwkThumbprint } from 'jose';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EXAMPLE_BASE_PATH } from '../../server/app';
import { browserNames, callBrowser, launchBrowser, loginApp, openApp, startBrowserFixture } from './harness';

describe.each(browserNames)('DBJWT-10 real %s cross-tab key/refresh coordination', (name) => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchBrowser(name);
  });
  afterAll(async () => {
    await browser?.close();
  });

  it('atomically chooses one non-extractable IndexedDB key across four simultaneously creating tabs', async () => {
    const fixture = await startBrowserFixture(browser);
    try {
      const pages = await Promise.all(Array.from({ length: 4 }, () => openApp(fixture, 'body')));
      const scope = {
        backendOrigin: fixture.backend.backendOrigin,
        basePath: `${EXAMPLE_BASE_PATH}/body`,
        create: true,
      };
      await Promise.all(pages.map((page) => callBrowser(page, 'gateKeyCreation', {})));
      const creations = pages.map((page) => callBrowser(page, 'inspectKey', scope));
      // Every tab has actually observed absence and generated a real candidate
      // before any candidate can enter IndexedDB's atomic read/add transaction.
      await Promise.all(pages.map((page) => expect.poll(() => callBrowser(page, 'keyCreationReady', {})).toBe(true)));
      await Promise.all(pages.map((page) => callBrowser(page, 'releaseKeyCreation', {})));
      const keys = await Promise.all(creations);
      expect(new Set(keys.map((key) => key.jkt)).size).toBe(1);
      expect(keys.every((key) => !key.extractable && key.exportFailed)).toBe(true);
      for (const page of pages) {
        await page.reload();
        await page.waitForFunction(() => Boolean(document.querySelector('#status')?.getAttribute('data-state')));
        expect((await callBrowser(page, 'inspectKey', { ...scope, create: false })).jkt).toBe(keys[0].jkt);
      }
      const differentMount = await callBrowser(pages[0], 'inspectKey', {
        ...scope,
        basePath: `${EXAMPLE_BASE_PATH}/cookie`,
      });
      expect(differentMount.jkt).not.toBe(keys[0].jkt);
    } finally {
      await fixture.close();
    }
  });

  it('coalesces concurrent shared-cookie refresh across two tabs, delivers winner JWT and signs fresh independent API proofs', async () => {
    const fixture = await startBrowserFixture(browser, { tokenLifetimeSeconds: 3 });
    try {
      const first = await openApp(fixture, 'cookie');
      await loginApp(first);
      const second = await openApp(fixture, 'cookie');
      await second.waitForFunction(() => document.querySelector('#status')?.getAttribute('data-state') === 'signed-in');
      expect(fixture.idp.stats.refreshes).toBe(0); // bootstrap token delivered from the first tab's memory
      const scope = {
        backendOrigin: fixture.backend.backendOrigin,
        basePath: `${EXAMPLE_BASE_PATH}/cookie`,
        transport: 'cookie' as const,
        name: 'tabs',
      };
      await Promise.all([callBrowser(first, 'createSession', scope), callBrowser(second, 'createSession', scope)]);
      const bootstrap = await Promise.all([
        callBrowser(first, 'refresh', { name: 'tabs' }),
        callBrowser(second, 'refresh', { name: 'tabs' }),
      ]);
      expect(bootstrap[0].tokens[0].accessToken).toBe(bootstrap[1].tokens[0].accessToken);
      expect(fixture.idp.stats.refreshes).toBe(0);
      const expiresAt = bootstrap[0].tokens[0].expiresAt;
      await first.waitForFunction((expiry) => Date.now() > expiry, expiresAt);
      fixture.idp.setRefreshDelay(180);
      const before = fixture.idp.stats.refreshes;
      const refreshed = await Promise.all([
        callBrowser(first, 'refresh', { name: 'tabs', count: 6 }),
        callBrowser(second, 'refresh', { name: 'tabs', count: 6 }),
      ]);
      expect(fixture.idp.stats.refreshes - before).toBe(1);
      expect(refreshed.every((value) => value.samePromise)).toBe(true);
      const winner = refreshed[0].tokens[0];
      expect(
        refreshed.flatMap((value) => value.tokens).every((token) => token.accessToken === winner.accessToken),
      ).toBe(true);
      expect(winner.accessToken).not.toBe(bootstrap[0].tokens[0].accessToken);
      expect(decodeJwt(winner.accessToken).cnf).toEqual({ jkt: winner.jkt });
      const responses = await Promise.all([
        callBrowser(first, 'apiFetch', { name: 'tabs', backendOrigin: scope.backendOrigin }),
        callBrowser(second, 'apiFetch', { name: 'tabs', backendOrigin: scope.backendOrigin }),
      ]);
      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      const apiRequests = fixture.backend.requests.filter((request) => request.path === '/api/profile');
      expect(apiRequests).toHaveLength(4); // two first nonce challenges, two honest fresh retries
      expect(new Set(apiRequests.map((request) => decodeJwt(request.proof!).jti)).size).toBe(4);
      for (const request of apiRequests) {
        expect(request.authorization).toBe(`DPoP ${winner.accessToken}`);
        expect(await calculateJwkThumbprint(decodeProtectedHeader(request.proof!).jwk!)).toBe(winner.jkt);
      }
      const cookie = (await fixture.context.cookies(scope.backendOrigin)).find(
        (cookie) => cookie.name === 'oidc_vault_session_cookie',
      )!;
      expect((await fixture.backend.store.getSession(cookie.value))?.deviceBinding?.jkt).toBe(winner.jkt);
      const storage = await first.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const request = indexedDB.open('oidc-vault-dpop-example-v1');
          request.onsuccess = () => resolve(request.result);
        });
        const rows = await new Promise<unknown[]>((resolve) => {
          const request = db.transaction('cookieSessions').objectStore('cookieSessions').getAll();
          request.onsuccess = () => resolve(request.result);
        });
        db.close();
        return { rows, local: { ...localStorage }, session: { ...sessionStorage } };
      });
      expect(JSON.stringify(storage)).not.toContain(winner.accessToken);
      expect(JSON.stringify(storage)).not.toContain(cookie.value);
      expect(storage.rows).toEqual([
        { jkt: winner.jkt, generation: winner.generation, active: true, refreshedAt: expect.any(Number) },
      ]);
      await first.locator('#logout').click();
      await first.waitForFunction(
        () => document.querySelector('#status')?.getAttribute('data-state') === 'login-required',
      );
      // Clear notification is accepted only for the current shared generation.
      await expect.poll(() => callBrowser(second, 'memoryToken', { name: 'tabs' })).toBeUndefined();
    } finally {
      await fixture.close();
    }
  });

  it('a disposed tab queued on a real peer-held Web Lock does no key, metadata or HTTP work when admitted', async () => {
    const fixture = await startBrowserFixture(browser);
    try {
      const first = await openApp(fixture, 'cookie');
      await loginApp(first);
      // Keep the second page's UI on the independent body scope: only its test
      // session listens on the shared cookie channel while opens are counted.
      const second = await openApp(fixture, 'body');
      const scope = {
        name: 'queued-tab',
        transport: 'cookie' as const,
        backendOrigin: fixture.backend.backendOrigin,
        basePath: `${EXAMPLE_BASE_PATH}/cookie`,
      };
      const { scopeId } = await callBrowser(second, 'createSession', scope);
      await callBrowser(second, 'refresh', { name: scope.name });
      await callBrowser(first, 'holdCookieLock', { scopeId, gate: 'peer-lock' });
      await expect.poll(() => callBrowser(first, 'gateReady', { id: 'peer-lock' })).toBe(true);
      await callBrowser(second, 'watchDatabaseOpens', {});
      const requests = fixture.backend.requests.length;
      await callBrowser(second, 'beginSessionOperation', {
        name: scope.name,
        id: 'queued-login',
        operation: 'login',
      });
      await expect.poll(() => callBrowser(first, 'cookieLockQueue', { scopeId })).toEqual({ held: 1, pending: 1 });
      await callBrowser(second, 'disposeSession', { name: scope.name });
      await callBrowser(first, 'releaseGate', { id: 'peer-lock' });
      expect(await callBrowser(second, 'finishSessionOperation', { id: 'queued-login' })).toEqual({
        ok: false,
        code: 'DPOP_SESSION_DISPOSED',
      });
      expect(await callBrowser(second, 'databaseOpenCount', {})).toBe(0);
      expect(fixture.backend.requests.length).toBe(requests);
      expect(await callBrowser(first, 'readCookieVersion', scope)).toMatchObject({ active: true });
    } finally {
      await fixture.close();
    }
  });

  it.each(['clear', 'token'] as const)(
    'DPH-10: a stale %s envelope with an aborted native metadata read preserves the newer login',
    async (type) => {
      const fixture = await startBrowserFixture(browser);
      try {
        const first = await openApp(fixture, 'cookie');
        await loginApp(first);
        // Only this test session listens on the cookie scope in the second page.
        const second = await openApp(fixture, 'body');
        const scope = {
          name: 'peer-admission',
          transport: 'cookie' as const,
          backendOrigin: fixture.backend.backendOrigin,
          basePath: `${EXAMPLE_BASE_PATH}/cookie`,
        };
        const { scopeId } = await callBrowser(second, 'createSession', scope);
        await callBrowser(second, 'capturePeerMessage', { scopeId, id: 'old', type });
        const old = (await callBrowser(second, 'refresh', { name: scope.name })).tokens[0];
        if (type === 'token')
          await expect.poll(() => callBrowser(second, 'capturedPeerMessage', { id: 'old' })).toBeDefined();
        await loginApp(first);
        const current = (await callBrowser(second, 'refresh', { name: scope.name })).tokens[0];
        expect(current.generation).not.toBe(old.generation);
        await expect.poll(() => callBrowser(second, 'capturedPeerMessage', { id: 'old' })).toBeDefined();
        const message = (await callBrowser(second, 'capturedPeerMessage', { id: 'old' }))!;
        expect(message.type).toBe(type);
        expect(message.generation).not.toBe(current.generation);
        const version = await callBrowser(first, 'readCookieVersion', scope);
        const refreshes = fixture.idp.stats.refreshes;
        await callBrowser(second, 'failNextCookieLookup', { scopeId, id: 'advisory-read' });
        await callBrowser(first, 'broadcastCookieMessage', { scopeId, message });
        await expect
          .poll(() => callBrowser(second, 'cookieLookupEvidence', { id: 'advisory-read' }))
          .toEqual({
            started: true,
            error: 'AbortError',
          });
        expect(await callBrowser(second, 'memoryToken', { name: scope.name })).toEqual(current);
        expect(await callBrowser(first, 'readCookieVersion', scope)).toEqual(version);
        expect(
          (await callBrowser(second, 'apiFetch', { name: scope.name, backendOrigin: scope.backendOrigin })).status,
        ).toBe(200);
        expect(fixture.idp.stats.refreshes).toBe(refreshes);
      } finally {
        await fixture.close();
      }
    },
  );

  it('DPH-10: a new login queued behind an older peer clear on a real Web Lock retains initiation authority', async () => {
    const fixture = await startBrowserFixture(browser);
    try {
      const first = await openApp(fixture, 'cookie');
      await loginApp(first);
      const second = await openApp(fixture, 'body');
      const scope = {
        name: 'peer-clear-login',
        transport: 'cookie' as const,
        backendOrigin: fixture.backend.backendOrigin,
        basePath: `${EXAMPLE_BASE_PATH}/cookie`,
        captureNavigation: true,
      };
      const { scopeId } = await callBrowser(second, 'createSession', scope);
      const old = (await callBrowser(second, 'refresh', { name: scope.name })).tokens[0];
      await callBrowser(first, 'holdCookieLock', { scopeId, gate: 'peer-lock' });
      await expect.poll(() => callBrowser(first, 'gateReady', { id: 'peer-lock' })).toBe(true);
      const cleared = { jkt: old.jkt, generation: 'peer-cleared-generation', active: false };
      await callBrowser(first, 'seedCookieVersion', { ...scope, version: cleared });
      await callBrowser(first, 'broadcastCookieMessage', {
        scopeId,
        message: { type: 'clear', sender: 'clearing-peer', jkt: cleared.jkt, generation: cleared.generation },
      });
      // The first page's UI also listens to the scope, so both callbacks queue.
      await expect.poll(() => callBrowser(first, 'cookieLockQueue', { scopeId })).toEqual({ held: 1, pending: 2 });
      await callBrowser(second, 'beginSessionOperation', { name: scope.name, id: 'login', operation: 'login' });
      await callBrowser(first, 'releaseGate', { id: 'peer-lock' });
      expect(await callBrowser(second, 'finishSessionOperation', { id: 'login' })).toEqual({ ok: true });
      expect(await callBrowser(second, 'navigationCount', { name: scope.name })).toBe(1);
      expect(await second.evaluate((id) => sessionStorage.getItem(`oidc-vault-dpop:pending:${id}`), scopeId)).toBe(
        JSON.stringify({ jkt: old.jkt }),
      );
      const current = await callBrowser(first, 'readCookieVersion', scope);
      expect(current).toMatchObject({ active: false, jkt: old.jkt });
      expect(current?.generation).not.toBe(cleared.generation);
      expect(
        fixture.backend.requests.filter((request) => request.path.endsWith('/login')).map((request) => request.status),
      ).toEqual([400, 200, 400, 200]);
    } finally {
      await fixture.close();
    }
  });
});
