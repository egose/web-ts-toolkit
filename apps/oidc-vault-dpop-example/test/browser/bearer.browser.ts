import { decodeJwt } from 'jose';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EXAMPLE_BASE_PATH } from '../../server/app';
import {
  browserNames,
  callBrowser,
  launchBrowser,
  loginApp,
  openApp,
  readBrowserKey,
  startBrowserFixture,
} from './harness';

const appName = 'bearer-app';
const noKeyUse = { generatedKeys: 0, signatures: 0, keyStoreAccesses: 0 };

describe.each(browserNames)('OBEAR-05 real %s explicit Bearer integration', (name) => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchBrowser(name);
  });
  afterAll(async () => {
    await browser?.close();
  });

  it.each(['body', 'cookie'] as const)(
    'uses guarded local-IdP login, keyless reload, expiry/API refresh and ordinary expired-token logout (%s)',
    async (transport) => {
      const fixture = await startBrowserFixture(browser, {
        fixtureDeviceBindingMode: 'optional',
        tokenLifetimeSeconds: 3,
        auditKeyUse: true,
        disableKeyStorage: transport === 'body',
      });
      const networkFailures: Array<{ method: string; path: string; error?: string }> = [];
      const browserErrors: string[] = [];
      try {
        const page = await openApp(fixture, transport, fixture.context, { dpop: false });
        page.on('requestfailed', (request) =>
          networkFailures.push({
            method: request.method(),
            path: new URL(request.url()).pathname,
            error: request.failure()?.errorText,
          }),
        );
        page.on('console', (message) => {
          if (message.type() === 'error') browserErrors.push(message.text());
        });
        expect(await page.locator('#status').getAttribute('data-state')).toBe('login-required');
        const navigations: string[] = [];
        page.on('request', (request) => {
          if (request.isNavigationRequest()) navigations.push(request.url());
        });
        await loginApp(page);
        expect(navigations.some((url) => url.startsWith(`${fixture.idp.issuer}/authorize`))).toBe(true);
        expect(
          navigations.some((url) =>
            url.startsWith(`${fixture.backend.backendOrigin}${EXAMPLE_BASE_PATH}/${transport}/callback`),
          ),
        ).toBe(true);
        const first = (await callBrowser(page, 'memoryToken', { name: appName }))!;
        expect(first.tokenType).toBe('Bearer');
        expect(first).not.toHaveProperty('jkt');
        expect(decodeJwt(first.accessToken)).toMatchObject({
          iss: fixture.backend.backendOrigin,
          aud: 'oidc-vault-dpop-example-api',
          sub: 'fixture-user',
        });
        expect(decodeJwt(first.accessToken)).not.toHaveProperty('cnf');
        expect(decodeJwt(first.accessToken)).not.toHaveProperty('sid');
        const storage = await page.evaluate(() => ({
          local: { ...localStorage },
          session: { ...sessionStorage },
          cookie: document.cookie,
        }));
        expect(storage.local).toEqual({});
        expect(JSON.stringify(storage)).not.toContain(first.accessToken);
        expect(storage.cookie).not.toContain('oidc_vault_session');
        const handleEntry = Object.entries(storage.session).find(([key]) =>
          key.startsWith('oidc-vault-bearer:handle:'),
        );
        if (transport === 'body') {
          expect(JSON.parse(handleEntry![1])).toEqual({ mode: 'bearer', sessionId: expect.any(String) });
        } else {
          expect(handleEntry).toBeUndefined();
          const cookie = (await fixture.context.cookies()).find((value) => value.name === 'oidc_vault_session_cookie')!;
          expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
          expect((await fixture.backend.store.getSession(cookie.value))?.deviceBinding).toBeUndefined();
          expect(JSON.stringify(storage)).not.toContain(cookie.value);
        }
        await page.reload();
        await page.waitForFunction(() => document.querySelector('#status')?.getAttribute('data-state') === 'signed-in');
        expect(fixture.idp.stats.refreshes).toBe(1);
        const reloaded = (await callBrowser(page, 'memoryToken', { name: appName }))!;
        // The local issuer is deterministic within an epoch second; generation
        // and the observed upstream rotation, not JWT inequality, prove reload.
        expect(reloaded.generation).not.toBe(first.generation);
        await page.waitForFunction((expiry) => Date.now() > expiry, reloaded.expiresAt);
        expect(
          await callBrowser(page, 'apiFetch', { name: appName, backendOrigin: fixture.backend.backendOrigin }),
        ).toMatchObject({
          status: 200,
          body: { subject: 'fixture-user' },
        });
        expect(fixture.idp.stats.refreshes).toBe(2);
        const beforeChallenge = fixture.idp.stats.refreshes;
        expect(
          (
            await callBrowser(page, 'apiFetch', {
              name: appName,
              backendOrigin: fixture.backend.backendOrigin,
              path: '/api/reject-once',
            })
          ).status,
        ).toBe(200);
        expect(fixture.idp.stats.refreshes - beforeChallenge).toBe(1);
        expect(
          fixture.backend.requests
            .filter((request) => request.path === '/api/reject-once')
            .map((request) => request.status),
        ).toEqual([401, 200]);
        const token = await callBrowser(page, 'memoryToken', { name: appName });
        const requests = fixture.backend.requests.length;
        // JS probes exercise the rejecting runtime stubs, without a type escape in app code.
        for (const operation of ['getKey', 'resetKey', 'logoutAndNavigate'] as const) {
          await callBrowser(page, 'beginSessionOperation', { name: appName, id: operation, operation });
          expect(await callBrowser(page, 'finishSessionOperation', { id: operation })).toEqual({
            ok: false,
            code: 'DPOP_OPERATION_UNSUPPORTED',
          });
        }
        expect(fixture.backend.requests).toHaveLength(requests);
        expect(await callBrowser(page, 'memoryToken', { name: appName })).toEqual(token);
        await page.waitForFunction((expiry) => Date.now() > expiry, token!.expiresAt);
        await page.locator('#logout').click();
        await page.waitForFunction(
          () => document.querySelector('#status')?.getAttribute('data-state') === 'login-required',
        );
        expect(await callBrowser(page, 'memoryToken', { name: appName })).toBeUndefined();
        await expect
          .poll(async () => (await callBrowser(page, 'credentialEvents', { name: appName })).at(-1))
          .toBeUndefined();
        expect(JSON.stringify(await page.evaluate(() => ({ ...sessionStorage })))).not.toContain('sessionId');
        expect(
          (await fixture.context.cookies()).some((cookie) => cookie.name === `oidc_vault_session_${transport}`),
        ).toBe(false);
        const vault = fixture.backend.requests.filter(
          (request) => request.path.startsWith(`${EXAMPLE_BASE_PATH}/${transport}/`) && request.method === 'POST',
        );
        expect(vault.filter((request) => request.path.endsWith('/login')).map((request) => request.status)).toEqual([
          200,
        ]);
        expect(vault.filter((request) => request.path.endsWith('/exchange')).map((request) => request.status)).toEqual([
          200,
        ]);
        for (const request of vault) {
          expect(request.authorization).toBeUndefined();
          expect(request.proof).toBeUndefined();
          if (request.path.endsWith('/refresh') || request.path.endsWith('/logout')) {
            if (transport === 'body') expect(request.body).toEqual({ sessionId: expect.any(String) });
            else expect(request.body).toEqual({});
          }
        }
        for (const request of fixture.backend.requests.filter((request) => request.path.startsWith('/api/'))) {
          expect(request.authorization).toMatch(/^Bearer /);
          expect(request.proof).toBeUndefined();
          expect(decodeJwt(request.authorization!.slice(7))).not.toHaveProperty('cnf');
        }
        expect(fixture.idp.stats).toMatchObject({
          authorizations: 1,
          callbacks: 1,
          pkceChecks: 1,
          upstreamDpopHeaders: 0,
        });
        const audit = await callBrowser(page, 'keyUseAudit', {});
        expect(audit).toMatchObject(noKeyUse);
        expect(fixture.keyUse).toMatchObject(noKeyUse); // Includes the initiating pre-navigation document.
        if (transport === 'body') {
          expect(audit.databaseOpens).toBe(0);
          expect(fixture.keyUse.databaseOpens).toBe(0);
        } else {
          expect(audit.databaseOpens).toBeGreaterThan(0);
          expect(
            await callBrowser(page, 'inspectScopeRecords', {
              backendOrigin: fixture.backend.backendOrigin,
              basePath: `${EXAMPLE_BASE_PATH}/cookie`,
            }),
          ).toMatchObject({
            keyPresent: false,
            cookieVersion: { mode: 'bearer', active: false },
            version: 1,
          });
        }
      } catch (error) {
        throw new Error(`Bearer browser lifecycle failed: ${JSON.stringify({ networkFailures, browserErrors })}`, {
          cause: error,
        });
      } finally {
        await fixture.close();
      }
    },
  );

  it('shares one keyless cookie winner across real tabs and notifies observers/logout peers', async () => {
    const fixture = await startBrowserFixture(browser, {
      fixtureDeviceBindingMode: 'optional',
      tokenLifetimeSeconds: 3,
      auditKeyUse: true,
    });
    try {
      const first = await openApp(fixture, 'cookie', fixture.context, { dpop: false });
      await loginApp(first);
      const second = await openApp(fixture, 'cookie', fixture.context, { dpop: false });
      await second.waitForFunction(() => document.querySelector('#status')?.getAttribute('data-state') === 'signed-in');
      expect(fixture.idp.stats.refreshes).toBe(0);
      const previous = (await callBrowser(first, 'memoryToken', { name: appName }))!;
      expect(await callBrowser(second, 'memoryToken', { name: appName })).toEqual(previous);
      await first.waitForFunction((expiry) => Date.now() > expiry, previous.expiresAt);
      fixture.idp.setRefreshDelay(180);
      const refreshed = await Promise.all(
        [first, second].map((page) => callBrowser(page, 'refreshBearer', { name: appName, count: 6 })),
      );
      expect(fixture.idp.stats.refreshes).toBe(1);
      expect(refreshed.every((result) => result.samePromise)).toBe(true);
      const winner = refreshed[0].tokens[0];
      expect(
        refreshed.flatMap((result) => result.tokens).every((token) => token.accessToken === winner.accessToken),
      ).toBe(true);
      for (const page of [first, second]) {
        await expect
          .poll(async () => (await callBrowser(page, 'credentialEvents', { name: appName })).at(-1))
          .toEqual(winner);
        expect(
          (await callBrowser(page, 'apiFetch', { name: appName, backendOrigin: fixture.backend.backendOrigin })).status,
        ).toBe(200);
        expect(await callBrowser(page, 'keyUseAudit', {})).toMatchObject(noKeyUse);
      }
      expect(fixture.keyUse).toMatchObject(noKeyUse);
      const records = await callBrowser(first, 'inspectScopeRecords', {
        backendOrigin: fixture.backend.backendOrigin,
        basePath: `${EXAMPLE_BASE_PATH}/cookie`,
      });
      expect(records.keyPresent).toBe(false);
      expect(records.cookieVersion).toEqual({
        mode: 'bearer',
        generation: winner.generation,
        active: true,
        refreshedAt: expect.any(Number),
      });
      expect(JSON.stringify(records)).not.toContain(winner.accessToken);
      await callBrowser(first, 'logout', { name: appName });
      await expect.poll(() => callBrowser(second, 'memoryToken', { name: appName })).toBeUndefined();
      await expect
        .poll(async () => (await callBrowser(second, 'credentialEvents', { name: appName })).at(-1))
        .toBeUndefined();
      expect(
        fixture.backend.requests.filter((request) => request.path === '/api/profile').map((request) => request.status),
      ).toEqual([200, 200]);
    } finally {
      await fixture.close();
    }
  });

  it('uses the historical lock across modes, requires fresh login and preserves successor metadata/installed keys', async () => {
    const fixture = await startBrowserFixture(browser, { fixtureDeviceBindingMode: 'optional' });
    try {
      const dpopPage = await openApp(fixture, 'cookie');
      await loginApp(dpopPage);
      const scope = {
        name: 'old-dpop',
        transport: 'cookie' as const,
        backendOrigin: fixture.backend.backendOrigin,
        basePath: `${EXAMPLE_BASE_PATH}/cookie`,
      };
      const key = await readBrowserKey(dpopPage, scope.backendOrigin, scope.basePath);
      const { scopeId } = await callBrowser(dpopPage, 'createSession', scope);
      const old = (await callBrowser(dpopPage, 'refresh', { name: scope.name })).tokens[0];
      const bearerPage = await openApp(fixture, 'cookie', fixture.context, { dpop: false });
      expect(await bearerPage.locator('#status').getAttribute('data-state')).toBe('login-required');
      const before = fixture.backend.requests.length;
      await callBrowser(dpopPage, 'holdCookieLock', { scopeId, gate: 'shared-mode-lock' });
      await expect.poll(() => callBrowser(dpopPage, 'gateReady', { id: 'shared-mode-lock' })).toBe(true);
      const login = loginApp(bearerPage);
      await expect.poll(() => callBrowser(dpopPage, 'cookieLockQueue', { scopeId })).toEqual({ held: 1, pending: 1 });
      expect(fixture.backend.requests).toHaveLength(before); // Same lock, no concurrent cookie mutation.
      await callBrowser(dpopPage, 'releaseGate', { id: 'shared-mode-lock' });
      await login;
      const bearer = (await callBrowser(bearerPage, 'memoryToken', { name: appName }))!;
      expect(bearer.tokenType).toBe('Bearer');
      expect(bearer.generation).not.toBe(old.generation);
      await expect.poll(() => callBrowser(dpopPage, 'memoryToken', { name: scope.name })).toBeUndefined();
      const current = await callBrowser(bearerPage, 'readCookieVersion', scope);
      expect(current).toMatchObject({ mode: 'bearer', active: true, generation: bearer.generation });
      const after = fixture.backend.requests.length;
      await callBrowser(dpopPage, 'beginSessionOperation', {
        name: scope.name,
        id: 'wrong-mode',
        operation: 'refresh',
      });
      expect(await callBrowser(dpopPage, 'finishSessionOperation', { id: 'wrong-mode' })).toEqual({
        ok: false,
        code: 'LOGIN_REQUIRED',
      });
      for (const operation of ['clear', 'resetKey'] as const) {
        await callBrowser(dpopPage, 'beginSessionOperation', { name: scope.name, id: operation, operation });
        expect(await callBrowser(dpopPage, 'finishSessionOperation', { id: operation })).toEqual({ ok: true });
      }
      expect(fixture.backend.requests).toHaveLength(after);
      expect(await callBrowser(bearerPage, 'readCookieVersion', scope)).toEqual(current);
      expect((await readBrowserKey(dpopPage, scope.backendOrigin, scope.basePath)).jkt).toBe(key.jkt);
      expect(
        (await callBrowser(bearerPage, 'apiFetch', { name: appName, backendOrigin: scope.backendOrigin })).status,
      ).toBe(200);
      await loginApp(dpopPage); // Fresh original-key DPoP login, not Bearer refresh/relabeling.
      await expect.poll(() => callBrowser(bearerPage, 'memoryToken', { name: appName })).toBeUndefined();
      const successor = await callBrowser(dpopPage, 'readCookieVersion', scope);
      expect(successor).toMatchObject({ mode: 'dpop', active: true, jkt: key.jkt });
      const switched = fixture.backend.requests.length;
      await callBrowser(bearerPage, 'beginSessionOperation', {
        name: appName,
        id: 'old-bearer-refresh',
        operation: 'refresh',
      });
      expect(await callBrowser(bearerPage, 'finishSessionOperation', { id: 'old-bearer-refresh' })).toEqual({
        ok: false,
        code: 'LOGIN_REQUIRED',
      });
      await callBrowser(bearerPage, 'beginSessionOperation', {
        name: appName,
        id: 'old-bearer-clear',
        operation: 'clear',
      });
      expect(await callBrowser(bearerPage, 'finishSessionOperation', { id: 'old-bearer-clear' })).toEqual({ ok: true });
      expect(fixture.backend.requests).toHaveLength(switched);
      expect(await callBrowser(dpopPage, 'readCookieVersion', scope)).toEqual(successor);
      await dpopPage.locator('#api').click();
      await dpopPage.waitForFunction(() => document.querySelector('#result')?.textContent?.includes('fixture-user'));
      expect(fixture.backend.requests.at(-1)?.authorization).toMatch(/^DPoP /);
      expect(fixture.backend.requests.at(-1)?.proof).toBeTruthy();
      expect(fixture.idp.stats.authorizations).toBe(3);
    } finally {
      await fixture.close();
    }
  });

  it.each(['body', 'cookie'] as const)(
    'required-binding login rejects explicit Bearer without GET fallback or key creation (%s)',
    async (transport) => {
      const fixture = await startBrowserFixture(browser, { auditKeyUse: true });
      try {
        const page = await openApp(fixture, transport, fixture.context, { dpop: false });
        await page.locator('#login').click();
        // Read the client-parsed native response in the page, not a transient
        // Chromium CDP response body that the browser may already have released.
        await page.waitForFunction(
          () => document.querySelector('#status')?.getAttribute('data-code') === 'OIDC_VAULT_DEVICE_BINDING_REQUIRED',
        );
        await page.waitForFunction(
          () => document.querySelector('#status')?.getAttribute('data-state') === 'login-required',
        );
        expect(
          fixture.backend.requests
            .filter((request) => request.path.endsWith('/login'))
            .map((request) => ({ method: request.method, status: request.status, proof: request.proof })),
        ).toEqual([{ method: 'POST', status: 401, proof: undefined }]);
        expect(fixture.idp.stats.authorizations).toBe(0);
        expect(await callBrowser(page, 'keyUseAudit', {})).toMatchObject(noKeyUse);
        expect(fixture.keyUse).toMatchObject(noKeyUse);
        expect(await callBrowser(page, 'memoryToken', { name: appName })).toBeUndefined();
      } finally {
        await fixture.close();
      }
    },
  );
});
