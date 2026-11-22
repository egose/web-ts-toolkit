import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { acquireTestScratch, packageRoot } from '../scratch.mjs';

const scratch = acquireTestScratch();
try {
  const env = {
    ...process.env,
    TMPDIR: scratch.directory,
    // Use the isolated CI preflight binary when supplied. Otherwise keep any download in scratch.
    MONGOMS_VERSION: '8.2.6',
    MONGOMS_DOWNLOAD_DIR: join(scratch.directory, 'mongo-bin'),
    MONGOMS_PREFER_GLOBAL_PATH: 'false',
    MONGOMS_MD5_CHECK: 'true',
  };
  for (const key of Object.keys(env)) {
    if (/^(?:https?_proxy|all_proxy|no_proxy|node_options|node_use_env_proxy|azure_log_level|azurite_.*)$/i.test(key))
      delete env[key];
  }
  const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', 'vitest.managed-delivery.config.mts'], {
    cwd: packageRoot,
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.signal) console.error(`email-service test:managed-delivery terminated by ${result.signal}`);
  process.exitCode = result.status ?? 1;
} finally {
  scratch.cleanup();
}
