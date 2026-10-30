import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EXAMPLE_BASE_PATH } from '../../server/app';
import { browserNames, callBrowser, launchBrowser, loginApp, openApp, startBrowserFixture } from './harness';

describe.each(browserNames)('OVAR real %s session maintenance', (name) => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchBrowser(name);
  });
  afterAll(async () => {
    await browser?.close();
  });

  it('observes bootstrap, peer replacement and peer clear without a scheduler', async () => {
    const fixture = await startBrowserFixture(browser);
    try {
      const first = await openApp(fixture, 'cookie');
      await loginApp(first);
      const second = await openApp(fixture, 'body');
      const scope = {
        name: 'observed',
        transport: 'cookie' as const,
        observeCredentials: true,
        backendOrigin: fixture.backend.backendOrigin,
        basePath: `${EXAMPLE_BASE_PATH}/cookie`,
      };
      for (const page of [first, second]) {
        await callBrowser(page, 'createSession', scope);
        await callBrowser(page, 'refresh', { name: scope.name });
        await expect.poll(() => callBrowser(page, 'credentialEvents', { name: scope.name })).toHaveLength(1);
      }
      const before = fixture.idp.stats.refreshes;
      const refreshed = await callBrowser(first, 'refresh', { name: scope.name });
      expect(fixture.idp.stats.refreshes - before).toBe(1);
      await expect.poll(() => callBrowser(second, 'credentialEvents', { name: scope.name })).toHaveLength(2);
      expect((await callBrowser(second, 'credentialEvents', { name: scope.name })).at(-1)).toEqual(refreshed.tokens[0]);
      await callBrowser(first, 'beginSessionOperation', { name: scope.name, id: 'clear-observed', operation: 'clear' });
      await callBrowser(first, 'finishSessionOperation', { id: 'clear-observed' });
      await expect
        .poll(async () => (await callBrowser(second, 'credentialEvents', { name: scope.name })).at(-1))
        .toBeUndefined();
      expect(await callBrowser(second, 'memoryToken', { name: scope.name })).toBeUndefined();
    } finally {
      await fixture.close();
    }
  });

  it('shares simultaneous scheduled cookie refresh across native tabs and publishes one winner', async () => {
    const fixture = await startBrowserFixture(browser, { tokenLifetimeSeconds: 60 });
    try {
      const first = await openApp(fixture, 'cookie');
      await loginApp(first);
      const second = await openApp(fixture, 'body');
      const scope = {
        name: 'scheduled-tabs',
        transport: 'cookie' as const,
        observeCredentials: true,
        autoRefresh: { refreshBeforeExpiryMs: 0, maxRefreshIntervalMs: 3_000 },
        backendOrigin: fixture.backend.backendOrigin,
        basePath: `${EXAMPLE_BASE_PATH}/cookie`,
      };
      fixture.idp.setRefreshDelay(150);
      for (const page of [first, second]) {
        await callBrowser(page, 'createSession', scope);
        await callBrowser(page, 'refresh', { name: scope.name });
      }
      const original = await callBrowser(first, 'memoryToken', { name: scope.name });
      const before = fixture.idp.stats.refreshes;
      await expect.poll(() => fixture.idp.stats.refreshes, { timeout: 8_000 }).toBe(before + 1);
      for (const page of [first, second])
        await expect
          .poll(async () => (await callBrowser(page, 'memoryToken', { name: scope.name }))?.generation)
          .not.toBe(original?.generation);
      const winners = await Promise.all(
        [first, second].map((page) => callBrowser(page, 'memoryToken', { name: scope.name })),
      );
      expect(winners[0]).toEqual(winners[1]);
      expect(winners[0]?.accessToken).not.toBe(original?.accessToken);
      for (const page of [first, second]) await callBrowser(page, 'disposeSession', { name: scope.name });
      expect(fixture.idp.stats.refreshes - before).toBe(1);
      const metadata = (await callBrowser(first, 'inspectScopeRecords', scope)).cookieVersion;
      expect(metadata).toMatchObject({ generation: winners[0]?.generation, refreshedAt: expect.any(Number) });
      expect(Number.isSafeInteger(metadata?.refreshedAt)).toBe(true);
      for (const page of [first, second])
        expect(await callBrowser(page, 'maintenanceErrors', { name: scope.name })).toEqual([]);
    } finally {
      await fixture.close();
    }
  });

  it('rechecks a native peer winner while a due timer waits for the real cookie lock', async () => {
    const fixture = await startBrowserFixture(browser, { tokenLifetimeSeconds: 60 });
    try {
      const first = await openApp(fixture, 'cookie');
      await loginApp(first);
      const second = await openApp(fixture, 'body');
      const scope = {
        name: 'scheduled-lock',
        transport: 'cookie' as const,
        observeCredentials: true,
        autoRefresh: { refreshBeforeExpiryMs: 0, maxRefreshIntervalMs: 2_000 },
        backendOrigin: fixture.backend.backendOrigin,
        basePath: `${EXAMPLE_BASE_PATH}/cookie`,
      };
      const { scopeId } = await callBrowser(second, 'createSession', scope);
      await callBrowser(second, 'capturePeerMessage', { scopeId, id: 'original-maintenance', type: 'token' });
      const original = (await callBrowser(second, 'refresh', { name: scope.name })).tokens[0];
      await expect.poll(() => callBrowser(second, 'capturedPeerMessage', { id: 'original-maintenance' })).toBeDefined();
      await callBrowser(first, 'holdCookieLock', { scopeId, gate: 'maintenance-lock' });
      await expect.poll(() => callBrowser(first, 'gateReady', { id: 'maintenance-lock' })).toBe(true);
      await expect
        .poll(async () => (await callBrowser(first, 'cookieLockQueue', { scopeId })).pending, { timeout: 8_000 })
        .toBe(1);
      // The test lock owner commits a controlled generation/hint using real IDB;
      // token validation, recognition, channel delivery and queue admission stay native.
      const winner = { ...original, generation: 'controlled-native-winner' };
      const refreshedAt = await first.evaluate(() => Date.now());
      await callBrowser(first, 'seedCookieVersion', {
        ...scope,
        version: { jkt: winner.jkt, generation: winner.generation, active: true, refreshedAt },
      });
      const message = (await callBrowser(second, 'capturedPeerMessage', { id: 'original-maintenance' }))!;
      await callBrowser(first, 'broadcastCookieMessage', {
        scopeId,
        message: { ...message, generation: winner.generation, token: winner },
      });
      await expect
        .poll(async () => (await callBrowser(second, 'memoryToken', { name: scope.name }))?.generation)
        .toBe(winner.generation);
      await callBrowser(first, 'releaseGate', { id: 'maintenance-lock' });
      await expect.poll(async () => (await callBrowser(first, 'cookieLockQueue', { scopeId })).pending).toBe(0);
      await callBrowser(second, 'disposeSession', { name: scope.name });
      expect(fixture.idp.stats.refreshes).toBe(0);
      expect(await callBrowser(second, 'maintenanceErrors', { name: scope.name })).toEqual([]);
    } finally {
      await fixture.close();
    }
  });

  it('refreshes old cookie metadata without inventing a fresh maximum-interval anchor on reload', async () => {
    const fixture = await startBrowserFixture(browser);
    try {
      const first = await openApp(fixture, 'cookie');
      await loginApp(first);
      const second = await openApp(fixture, 'body');
      await second.reload();
      await second.waitForFunction(() => Boolean(document.querySelector('#status')?.getAttribute('data-state')));
      const scope = {
        name: 'old-hint',
        transport: 'cookie' as const,
        observeCredentials: true,
        autoRefresh: { maxRefreshIntervalMs: 60_000 },
        backendOrigin: fixture.backend.backendOrigin,
        basePath: `${EXAMPLE_BASE_PATH}/cookie`,
      };
      const current = (await callBrowser(first, 'inspectScopeRecords', scope)).cookieVersion!;
      await callBrowser(first, 'seedCookieVersion', {
        ...scope,
        version: { jkt: current.jkt, generation: current.generation, active: true },
      });
      await callBrowser(second, 'createSession', scope);
      await callBrowser(second, 'refresh', { name: scope.name });
      await expect.poll(() => fixture.idp.stats.refreshes, { timeout: 5_000 }).toBe(1); // not 60 seconds since peer receipt
      await expect
        .poll(async () => (await callBrowser(second, 'memoryToken', { name: scope.name }))?.generation)
        .not.toBe(current.generation);
      await callBrowser(second, 'disposeSession', { name: scope.name });
      expect(await callBrowser(second, 'maintenanceErrors', { name: scope.name })).toEqual([]);
    } finally {
      await fixture.close();
    }
  });

  it('reports confirmed provider refresh rejection and clears the observed cookie credential', async () => {
    const fixture = await startBrowserFixture(browser);
    try {
      const first = await openApp(fixture, 'cookie');
      await loginApp(first);
      const second = await openApp(fixture, 'body');
      const scope = {
        name: 'rejected-maintenance',
        transport: 'cookie' as const,
        observeCredentials: true,
        autoRefresh: { maxRefreshIntervalMs: 2_000 },
        backendOrigin: fixture.backend.backendOrigin,
        basePath: `${EXAMPLE_BASE_PATH}/cookie`,
      };
      await callBrowser(second, 'createSession', scope);
      await callBrowser(second, 'refresh', { name: scope.name });
      fixture.idp.expireRefreshTokens();
      await expect
        .poll(() => callBrowser(second, 'maintenanceErrors', { name: scope.name }), { timeout: 8_000 })
        .toEqual([{ code: 'OIDC_VAULT_REFRESH_REJECTED', requiresLogin: true }]);
      await expect.poll(() => callBrowser(second, 'memoryToken', { name: scope.name })).toBeUndefined();
      expect((await callBrowser(second, 'credentialEvents', { name: scope.name })).at(-1)).toBeUndefined();
      const refreshes = fixture.backend.requests.filter((request) => request.path.endsWith('/refresh')).length;
      await second.evaluate(() => {
        window.dispatchEvent(new Event('pageshow'));
      });
      await callBrowser(second, 'disposeSession', { name: scope.name });
      expect(fixture.backend.requests.filter((request) => request.path.endsWith('/refresh'))).toHaveLength(refreshes);
    } finally {
      await fixture.close();
    }
  });
});
