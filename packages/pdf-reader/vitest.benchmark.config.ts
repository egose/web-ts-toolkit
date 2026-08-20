import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: { args: ['--no-sandbox'] },
      }),
      instances: [{ browser: 'chromium', name: 'chromium' }],
    },
    include: ['benchmark/**/*.browser.ts'],
    fileParallelism: false,
  },
});
