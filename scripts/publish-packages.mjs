import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readOption(args, names) {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    for (const name of names) {
      if (argument === name) return args[index + 1];
      if (argument.startsWith(`${name}=`)) return argument.slice(name.length + 1);
    }
  }
  return undefined;
}

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  const result = spawnSync('repo-toolkit-publish-packages', args, { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} else {
  const requestedVersion = readOption(args, ['--version', '--tag'])?.replace(/^v/, '');
  if (!requestedVersion) throw new Error('Publication requires --version <version> or --tag <version>.');

  const repositoryVersion = readFileSync(resolve('VERSION'), 'utf8').trim();
  if (requestedVersion !== repositoryVersion) {
    throw new Error(
      `Publication version ${requestedVersion} does not match VERSION (${repositoryVersion}); refusing to build a mismatched starter lockfile.`,
    );
  }

  const result = spawnSync('repo-toolkit-publish-packages', args, {
    stdio: 'inherit',
    env: { ...process.env, WTT_RELEASE_VERSION: requestedVersion },
  });
  process.exitCode = result.status ?? 1;
}
