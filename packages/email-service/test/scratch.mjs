import { spawnSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, realpathSync, rmSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const packageRoot = realpathSync(resolve(import.meta.dirname, '..'));
export const repoRoot = resolve(packageRoot, '../..');

function isIgnoredScratch(directory) {
  if (!directory || !isAbsolute(directory) || !relative(repoRoot, directory).split(sep)[0]?.startsWith('_tmp'))
    return false;
  try {
    if (realpathSync(directory) !== directory || !statSync(directory).isDirectory()) return false;
    accessSync(directory, constants.W_OK | constants.X_OK);
  } catch {
    return false;
  }
  const result = spawnSync('git', ['check-ignore', '-q', '--', directory], { cwd: repoRoot, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1)
    throw new Error('Could not verify ignored email-service test scratch');
  return result.status === 0;
}

export function acquireTestScratch(supplied = process.env.TMPDIR) {
  // Use CI's short, real resource path as-is. Never clean up caller-owned scratch.
  if (isIgnoredScratch(supplied)) return { directory: supplied, owned: false, cleanup() {} };

  const directory = mkdtempSync(join(repoRoot, '_tmp'));
  const cleanup = () => rmSync(directory, { recursive: true, force: true });
  try {
    if (!isIgnoredScratch(directory)) throw new Error('Fresh email-service TMPDIR is not gitignored');
  } catch (error) {
    cleanup();
    throw error;
  }
  return { directory, owned: true, cleanup };
}
