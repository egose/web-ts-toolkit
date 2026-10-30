import { decodeJwt } from 'jose';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { EXAMPLE_BASE_PATH } from '../../server/app';
import {
  browserNames,
  callBrowser,
  launchBrowser,
  loginApp,
  openApp,
  startBrowserFixture,
  type BrowserFixture,
} from './harness';

const scopeFor = (fixture: BrowserFixture, transport: 'body' | 'cookie', captureNavigation = false) => ({
  name: 'navigation',
  transport,
  backendOrigin: fixture.backend.backendOrigin,
  basePath: `${EXAMPLE_BASE_PATH}/${transport}`,
  captureNavigation,
});
const handleFor = async (page: Page, fixture: BrowserFixture, transport: 'body' | 'cookie') => {
  if (transport === 'cookie')
    return (await fixture.context.cookies()).find((cookie) => cookie.name === 'oidc_vault_session_cookie')!.value;
  return page.evaluate(() => {
    const entry = Object.entries(sessionStorage).find(([key]) => key.startsWith('oidc-vault-dpop:handle:'));
    return (JSON.parse(entry![1]) as { sessionId: string }).sessionId;
  });
};

describe.each(browserNames)('OVAPP-07 real %s logout navigation', (name) => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchBrowser(name);
  });
  afterAll(async () => {
    await browser?.close();
  });

  for (const transport of ['body', 'cookie'] as const) {
    it.each(['live', 'expired', 'reload-no-jwt'] as const)(
      `commits a provider document, registered return and replay fallback (${transport}, %s)`,
      async (mode) => {
        const fixture = await startBrowserFixture(browser, { tokenLifetimeSeconds: mode === 'expired' ? 1 : 30 });
        try {
          const page = await openApp(fixture, transport);
          await loginApp(page);
          let accessToken: string | undefined;
          const scope = scopeFor(fixture, transport);
          if (mode === 'reload-no-jwt') {
            // New document, retained original handle/cookie + key, no bootstrap refresh.
            await page.goto(`${fixture.frontendOrigin}/test/performance/blank.html`);
            await callBrowser(page, 'createSession', scope);
            expect(await callBrowser(page, 'memoryToken', { name: scope.name })).toBeUndefined();
          } else {
            await callBrowser(page, 'createSession', scope);
            accessToken = (await callBrowser(page, 'refresh', { name: scope.name })).tokens[0].accessToken;
          }
          const handle = await handleFor(page, fixture, transport);
          const original = await fixture.backend.store.getSession(handle);
          expect(original?.idToken).toBeTruthy();
          const originalHint = original!.idToken;
          if (mode === 'expired') {
            const exp = decodeJwt(accessToken!).exp!;
            await page.waitForFunction((exp) => Date.now() >= exp * 1000, exp);
          }
          const bare = `${fixture.backend.backendOrigin}${EXAMPLE_BASE_PATH}/${transport}/logout/navigation`;
          const refreshes = fixture.idp.stats.refreshes;
          const documents: string[] = [];
          const requests: Array<{ url: string; navigation: boolean; main: boolean; referer?: string }> = [];
          page.on('framenavigated', (frame) => {
            if (frame === page.mainFrame()) documents.push(frame.url());
          });
          page.on('request', (request) =>
            requests.push({
              url: request.url(),
              navigation: request.isNavigationRequest(),
              main: request.frame() === page.mainFrame(),
              referer: request.headers().referer,
            }),
          );
          // Existing adapter snapshots a native Response clone in the page and
          // holds delivery, keeping Chromium's document/stream lifetime explicit.
          await callBrowser(page, 'holdSessionResponse', {
            name: scope.name,
            route: 'logout/navigation',
            gate: 'response',
          });
          const initiation = page.waitForResponse(
            (response) =>
              response.url() === bare && response.request().method() === 'POST' && response.status() === 200,
          );
          await callBrowser(page, 'beginSessionOperation', {
            name: scope.name,
            id: 'logout',
            operation: 'logoutAndNavigate',
          });
          await expect.poll(() => callBrowser(page, 'gateReady', { id: 'response' })).toBe(true);
          const response = await initiation;
          const dto = (await callBrowser(page, 'heldResponseValue', { name: scope.name })) as {
            loggedOut: boolean;
            navigationUrl: string;
          };
          expect(Object.keys(dto).sort()).toEqual(['loggedOut', 'navigationUrl']);
          expect(dto.loggedOut).toBe(true);
          expect(dto.navigationUrl).toMatch(
            new RegExp(`^${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?ticket=lnt_[A-Za-z0-9_-]{43}$`),
          );
          for (const secret of [originalHint, original!.refreshToken, handle, ...(accessToken ? [accessToken] : [])])
            expect(JSON.stringify(dto)).not.toContain(secret);
          expect(response.headers()['cache-control']).toBe('no-store');
          expect(response.headers()['referrer-policy']).toBe('no-referrer');
          await callBrowser(page, 'releaseGate', { id: 'response' });
          await page.waitForURL(`${fixture.idp.issuer}/logout?**`);
          await page.locator('#provider-logged-out').waitFor();
          const providerUrl = new URL(page.url());
          expect(providerUrl.searchParams.get('id_token_hint')).toBe(originalHint);
          const registered = `${fixture.frontendOrigin}/signed-out?transport=${transport}`;
          expect(providerUrl.searchParams.get('post_logout_redirect_uri')).toBe(registered);
          expect([...providerUrl.searchParams.keys()].sort()).toEqual(['id_token_hint', 'post_logout_redirect_uri']);
          expect(documents.some((url) => url.startsWith(`${fixture.idp.issuer}/logout?`))).toBe(true);
          expect(requests.find((request) => request.url === dto.navigationUrl)).toMatchObject({
            navigation: true,
            main: true,
          });
          expect(requests.find((request) => request.url === providerUrl.href)).toMatchObject({
            navigation: true,
            main: true,
            referer: undefined,
          });
          expect(
            requests
              .filter((request) => request.url.includes(originalHint))
              .every((request) => request.url.startsWith(`${fixture.idp.issuer}/logout?`)),
          ).toBe(true);
          expect(await fixture.backend.store.getSession(handle)).toBeNull();
          expect(
            (await fixture.context.cookies()).some((cookie) => cookie.name === `oidc_vault_session_${transport}`),
          ).toBe(false);
          expect(fixture.idp.stats).toMatchObject({ logouts: 1, refreshes, upstreamDpopHeaders: 0 });
          const calls = fixture.backend.requests.filter(
            (request) => request.path.endsWith('/logout/navigation') && request.method === 'POST',
          );
          expect(calls.map((request) => request.status)).toEqual(
            mode === 'reload-no-jwt' || (transport === 'cookie' && refreshes === 0) ? [400, 200] : [200],
          );
          expect(new Set(calls.map((request) => decodeJwt(request.proof!).jti)).size).toBe(calls.length);
          for (const call of calls) {
            expect(call.authorization).toBeUndefined();
            expect(call.fingerprint).toBeUndefined();
            expect(decodeJwt(call.proof!)).not.toHaveProperty('ath');
          }
          expect(await page.locator('#logout-return').getAttribute('href')).toBe(registered);
          await page.locator('#logout-return').click();
          await page.waitForURL(registered);
          await page.waitForFunction(
            () => document.querySelector('#status')?.getAttribute('data-state') === 'login-required',
          );
          expect(JSON.stringify(await page.evaluate(() => ({ ...sessionStorage })))).not.toContain('sessionId');
          await page.goto(dto.navigationUrl);
          await page.waitForURL(`${registered}&fallback=1`);
          expect(fixture.idp.stats.logouts).toBe(1);
        } finally {
          await fixture.close();
        }
      },
    );

    it.each(['missing-endpoint', 'unavailable', 'consume-error'] as const)(
      `navigates only to fixed fallback on %s (${transport})`,
      async (failure) => {
        const fixture = await startBrowserFixture(browser);
        let clock: ReturnType<typeof vi.spyOn> | undefined;
        try {
          const page = await openApp(fixture, transport);
          await loginApp(page);
          const scope = scopeFor(fixture, transport);
          await callBrowser(page, 'createSession', scope);
          const handle = await handleFor(page, fixture, transport);
          if (failure === 'consume-error')
            vi.spyOn(fixture.backend.store, 'consumeLogoutNavigationTicket').mockRejectedValue(
              new Error('fixture consume unavailable'),
            );
          else {
            fixture.idp.setDiscovery(failure);
            // Expire the server's ten-minute discovery cache deterministically.
            // Core/store/proof clocks captured Date.now at construction; browser
            // clocks and original-session expiry remain real and unchanged.
            clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 600_001);
          }
          const bare = `${fixture.backend.backendOrigin}${EXAMPLE_BASE_PATH}/${transport}/logout/navigation`;
          await callBrowser(page, 'holdSessionResponse', {
            name: scope.name,
            route: 'logout/navigation',
            gate: 'response',
          });
          const initiation = page.waitForResponse((response) => response.url() === bare && response.status() === 200);
          await callBrowser(page, 'beginSessionOperation', {
            name: scope.name,
            id: 'logout',
            operation: 'logoutAndNavigate',
          });
          await expect.poll(() => callBrowser(page, 'gateReady', { id: 'response' })).toBe(true);
          await initiation;
          const dto = (await callBrowser(page, 'heldResponseValue', { name: scope.name })) as { navigationUrl: string };
          expect(dto.navigationUrl === bare).toBe(failure !== 'consume-error');
          await callBrowser(page, 'releaseGate', { id: 'response' });
          await page.waitForURL(`${fixture.frontendOrigin}/signed-out?transport=${transport}&fallback=1`);
          expect(fixture.idp.stats.logouts).toBe(0);
          if (failure !== 'consume-error') expect(fixture.idp.stats.discoveryRequests).toBe(2);
          expect(await fixture.backend.store.getSession(handle)).toBeNull();
          expect(
            (await fixture.context.cookies()).some((cookie) => cookie.name === `oidc_vault_session_${transport}`),
          ).toBe(false);
        } finally {
          clock?.mockRestore();
          vi.restoreAllMocks();
          await fixture.close();
        }
      },
    );

    it(`coalesces double-clicks and orders refresh/logout/refresh (${transport})`, async () => {
      const fixture = await startBrowserFixture(browser);
      try {
        const page = await openApp(fixture, transport);
        await loginApp(page);
        const scope = scopeFor(fixture, transport, true);
        await callBrowser(page, 'createSession', scope);
        await callBrowser(page, 'refresh', { name: scope.name });
        const start = fixture.backend.requests.length;
        await callBrowser(page, 'holdSessionResponse', { name: scope.name, route: 'refresh', gate: 'rotation' });
        await callBrowser(page, 'beginSessionOperation', { name: scope.name, id: 'refresh', operation: 'refresh' });
        await expect.poll(() => callBrowser(page, 'gateReady', { id: 'rotation' })).toBe(true);
        expect(await callBrowser(page, 'beginNavigationClicks', { name: scope.name, id: 'logout' })).toEqual({
          samePromise: true,
        });
        await callBrowser(page, 'beginSessionOperation', { name: scope.name, id: 'later', operation: 'refresh' });
        await callBrowser(page, 'releaseGate', { id: 'rotation' });
        expect(await callBrowser(page, 'finishSessionOperation', { id: 'refresh' })).toEqual({ ok: true });
        expect(await callBrowser(page, 'finishSessionOperation', { id: 'logout' })).toEqual({ ok: true });
        expect(await callBrowser(page, 'finishSessionOperation', { id: 'later' })).toEqual({
          ok: false,
          code: 'LOGIN_REQUIRED',
        });
        expect(await callBrowser(page, 'navigationCount', { name: scope.name })).toBe(1);
        const calls = fixture.backend.requests.slice(start).filter((request) => request.status === 200);
        expect(calls.map((request) => request.path)).toEqual([
          `${scope.basePath}/refresh`,
          `${scope.basePath}/logout/navigation`,
        ]);
        if (transport === 'body')
          expect((calls[0].body as { sessionId: string }).sessionId).not.toBe(
            (calls[1].body as { sessionId: string }).sessionId,
          );
      } finally {
        await fixture.close();
      }
    });

    it.each(['login', 'clear', 'dispose'] as const)(
      `%s withdraws navigation from a held committed POST (${transport})`,
      async (action) => {
        const fixture = await startBrowserFixture(browser);
        try {
          const page = await openApp(fixture, transport);
          await loginApp(page);
          const scope = scopeFor(fixture, transport, true);
          await callBrowser(page, 'createSession', scope);
          await callBrowser(page, 'holdSessionResponse', {
            name: scope.name,
            route: 'logout/navigation',
            gate: 'logout',
          });
          await callBrowser(page, 'beginSessionOperation', {
            name: scope.name,
            id: 'logout',
            operation: 'logoutAndNavigate',
          });
          expect(await callBrowser(page, 'waitForOperationGate', { gate: 'logout', id: 'logout' })).toBe(true);
          if (action === 'dispose') await callBrowser(page, 'disposeSession', { name: scope.name });
          else await callBrowser(page, 'beginSessionOperation', { name: scope.name, id: 'next', operation: action });
          await callBrowser(page, 'releaseGate', { id: 'logout' });
          expect(await callBrowser(page, 'finishSessionOperation', { id: 'logout' })).toEqual({
            ok: false,
            code: action === 'dispose' ? 'DPOP_SESSION_DISPOSED' : 'DPOP_OPERATION_SUPERSEDED',
          });
          if (action !== 'dispose')
            expect(await callBrowser(page, 'finishSessionOperation', { id: 'next' })).toEqual({ ok: true });
          expect(await callBrowser(page, 'navigationCount', { name: scope.name })).toBe(action === 'login' ? 1 : 0);
          expect(fixture.idp.stats.logouts).toBe(0);
        } finally {
          await fixture.close();
        }
      },
    );

    it.each(['malicious-url', 'response-loss'] as const)(
      `never navigates/retries after %s (${transport})`,
      async (failure) => {
        const fixture = await startBrowserFixture(browser);
        try {
          const page = await openApp(fixture, transport);
          await loginApp(page);
          const scope = scopeFor(fixture, transport, true);
          await callBrowser(page, 'createSession', scope);
          const first = await callBrowser(page, 'refresh', { name: scope.name });
          await callBrowser(page, 'refresh', { name: scope.name, rejectedToken: first.tokens[0].accessToken });
          const token = await callBrowser(page, 'memoryToken', { name: scope.name });
          const oldVersion = await callBrowser(page, 'readCookieVersion', scope);
          const handle = await handleFor(page, fixture, transport);
          let attempts = 0;
          await page.route(`${fixture.backend.backendOrigin}${scope.basePath}/logout/navigation`, async (route) => {
            attempts++;
            // The actual server commits; fault only the browser's response delivery.
            const response = await route.fetch();
            if (failure === 'response-loss') await route.abort('failed');
            else
              await route.fulfill({
                response,
                json: { loggedOut: true, navigationUrl: 'https://evil.example/logout?id_token_hint=secret' },
              });
          });
          await callBrowser(page, 'beginSessionOperation', {
            name: scope.name,
            id: 'logout',
            operation: 'logoutAndNavigate',
          });
          const outcome = await callBrowser(page, 'finishSessionOperation', { id: 'logout' });
          expect(outcome.ok).toBe(false);
          if (failure === 'malicious-url') expect(outcome.code).toBe('INVALID_LOGOUT_NAVIGATION_RESPONSE');
          expect(attempts).toBe(1);
          expect(await fixture.backend.store.getSession(handle)).toBeNull();
          expect(await callBrowser(page, 'navigationCount', { name: scope.name })).toBe(0);
          const current = await callBrowser(page, 'memoryToken', { name: scope.name });
          if (failure === 'malicious-url') {
            expect(current).toBeUndefined();
            if (transport === 'cookie')
              expect(await callBrowser(page, 'readCookieVersion', scope)).toMatchObject({ active: false });
          } else {
            expect(current).toEqual(token);
            expect(await callBrowser(page, 'readCookieVersion', scope)).toEqual(oldVersion);
          }
        } finally {
          await fixture.close();
        }
      },
    );

    it(`clear during real IndexedDB key verification prevents initiation (${transport})`, async () => {
      const fixture = await startBrowserFixture(browser);
      try {
        const page = await openApp(fixture, transport);
        await loginApp(page);
        const scope = scopeFor(fixture, transport, true);
        await callBrowser(page, 'createSession', scope);
        await callBrowser(page, 'holdKeyLookup', { gate: 'key' });
        await callBrowser(page, 'beginSessionOperation', {
          name: scope.name,
          id: 'logout',
          operation: 'logoutAndNavigate',
        });
        await expect.poll(() => callBrowser(page, 'gateReady', { id: 'key' })).toBe(true);
        await callBrowser(page, 'beginSessionOperation', { name: scope.name, id: 'clear', operation: 'clear' });
        await callBrowser(page, 'releaseGate', { id: 'key' });
        expect(await callBrowser(page, 'finishSessionOperation', { id: 'logout' })).toEqual({
          ok: false,
          code: 'DPOP_OPERATION_SUPERSEDED',
        });
        expect(await callBrowser(page, 'finishSessionOperation', { id: 'clear' })).toEqual({ ok: true });
        expect(fixture.backend.requests.some((request) => request.path.includes('/logout/navigation'))).toBe(false);
        expect(await callBrowser(page, 'navigationCount', { name: scope.name })).toBe(0);
      } finally {
        await fixture.close();
      }
    });
  }

  it('checks navigation intent after a real cookie Web Lock wait', async () => {
    const fixture = await startBrowserFixture(browser);
    try {
      const page = await openApp(fixture, 'cookie');
      await loginApp(page);
      const scope = scopeFor(fixture, 'cookie', true);
      const { scopeId } = await callBrowser(page, 'createSession', scope);
      await callBrowser(page, 'holdCookieLock', { scopeId, gate: 'lock' });
      await expect.poll(() => callBrowser(page, 'gateReady', { id: 'lock' })).toBe(true);
      await callBrowser(page, 'beginSessionOperation', {
        name: scope.name,
        id: 'logout',
        operation: 'logoutAndNavigate',
      });
      await expect.poll(() => callBrowser(page, 'cookieLockQueue', { scopeId })).toMatchObject({ held: 1, pending: 1 });
      await callBrowser(page, 'beginSessionOperation', { name: scope.name, id: 'login', operation: 'login' });
      await callBrowser(page, 'releaseGate', { id: 'lock' });
      expect(await callBrowser(page, 'finishSessionOperation', { id: 'logout' })).toEqual({
        ok: false,
        code: 'DPOP_OPERATION_SUPERSEDED',
      });
      expect(await callBrowser(page, 'finishSessionOperation', { id: 'login' })).toEqual({ ok: true });
      expect(fixture.backend.requests.some((request) => request.path.includes('/logout/navigation'))).toBe(false);
    } finally {
      await fixture.close();
    }
  });
});
