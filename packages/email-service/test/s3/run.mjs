import { spawnSync } from 'node:child_process';
import { acquireTestScratch, packageRoot } from '../scratch.mjs';

const scratch = acquireTestScratch();
try {
  const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', 'vitest.s3.config.mts'], {
    cwd: packageRoot,
    env: { ...process.env, TMPDIR: scratch.directory },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.signal) console.error(`email-service test:s3 terminated by ${result.signal}`);
  process.exitCode = result.status ?? 1;
} finally {
  scratch.cleanup();
}
