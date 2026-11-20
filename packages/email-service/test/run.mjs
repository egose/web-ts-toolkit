import { spawnSync } from 'node:child_process';
import { acquireTestScratch, packageRoot } from './scratch.mjs';

const scratch = acquireTestScratch();
try {
  console.log(`email-service test: using ${scratch.owned ? 'fresh' : 'supplied'} checkout-local TMPDIR`);
  const env = { ...process.env, TMPDIR: scratch.directory };
  for (const script of [
    'build',
    'typecheck',
    'test:unit',
    'test:lifecycle',
    'test:smtp',
    'test:sendgrid',
    'test:mongodb',
    'test:packed-consumer',
  ]) {
    const result = spawnSync('pnpm', ['run', script], { cwd: packageRoot, env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      if (result.signal) console.error(`email-service ${script} terminated by ${result.signal}`);
      process.exitCode = result.status ?? 1;
      break;
    }
  }
} finally {
  scratch.cleanup();
}
