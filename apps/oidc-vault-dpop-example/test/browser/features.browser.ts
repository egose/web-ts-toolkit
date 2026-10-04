import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { browserNames, callBrowser, launchBrowser, startBrowserFixture } from './harness';

describe.each(browserNames)('DBJWT-10 real %s explicit browser capability detection', (name) => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchBrowser(name);
  });
  afterAll(async () => {
    await browser?.close();
  });

  it.each(['indexedDB', 'crypto', 'locks', 'BroadcastChannel'] as const)(
    'fails explicitly when %s is unavailable; no key/token transport fallback',
    async (missing) => {
      const fixture = await startBrowserFixture(browser);
      try {
        await fixture.context.addInitScript((missing) => {
          if (missing === 'locks') Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
          else Object.defineProperty(globalThis, missing, { configurable: true, value: undefined });
        }, missing);
        const page = await fixture.context.newPage();
        await page.goto(`${fixture.frontendOrigin}/?transport=cookie`);
        await page.waitForFunction(() => document.querySelector('#status')?.getAttribute('data-state') === 'error');
        expect(await page.locator('#status').textContent()).toBe(
          missing === 'locks' || missing === 'BroadcastChannel'
            ? 'Cookie sessions require Web Locks and BroadcastChannel.'
            : 'A secure context, Web Crypto and IndexedDB are required.',
        );
        await expect(callBrowser(page, 'featureDetection', { cookie: true })).rejects.toThrow();
        expect(fixture.backend.requests).toEqual([]);
      } finally {
        await fixture.close();
      }
    },
  );
});
