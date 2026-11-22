import { spawnSync } from 'node:child_process';
import { acquireTestScratch, packageRoot } from '../scratch.mjs';

const scratch = acquireTestScratch();
try {
  const env = { ...process.env, TMPDIR: scratch.directory };
  // No inherited test endpoints, proxy, injected runtime flags or Azurite accounts.
  for (const key of Object.keys(env)) {
    if (/^(?:https?_proxy|all_proxy|no_proxy|node_options|azure_log_level|azurite_.*)$/i.test(key)) delete env[key];
  }
  const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', 'vitest.azure.config.mts'], {
    cwd: packageRoot,
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.signal) console.error(`email-service test:azure terminated by ${result.signal}`);
  process.exitCode = result.status ?? 1;
} finally {
  scratch.cleanup();
}
