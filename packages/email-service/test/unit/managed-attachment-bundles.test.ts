import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

it('checks locally issued proof across separately bundled ESM and CommonJS entrypoints', async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(import.meta.dirname, 'managed-attachment-bundles.mjs')],
    { timeout: 10_000 },
  );
  expect(stdout).toContain('4 independent ESM/CJS common-checker and writer combinations verified');
}, 12_000);
