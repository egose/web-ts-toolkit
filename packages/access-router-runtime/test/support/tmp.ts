import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

const tempDirs = new Set<string>();
const jitiCacheDirs = [join(__dirname, '..', '..', 'node_modules', '.cache', 'jiti'), join(tmpdir(), 'jiti')];

export function createTempProject(prefix = 'access-router-runtime-'): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.add(dir);

  return {
    dir,
    cleanup: () => cleanupTempDir(dir),
  };
}

export function cleanupTempDir(dir: string): void {
  cleanupJitiCacheArtifactsForTempDir(dir);
  rmSync(dir, { recursive: true, force: true });
  tempDirs.delete(dir);
}

export function cleanupTempProjects(): void {
  for (const dir of [...tempDirs]) {
    cleanupTempDir(dir);
  }
}

export function cleanupJitiCacheArtifactsForTempDir(dir: string): void {
  const tempName = basename(dir);
  for (const cacheDir of jitiCacheDirs) {
    if (!existsSync(cacheDir)) {
      continue;
    }

    for (const entry of readdirSync(cacheDir)) {
      if (entry.includes(tempName)) {
        rmSync(join(cacheDir, entry), { recursive: true, force: true });
      }
    }
  }
}

export function cleanupSuiteJitiCacheArtifacts(): void {
  for (const cacheDir of jitiCacheDirs) {
    if (!existsSync(cacheDir)) {
      continue;
    }

    for (const entry of readdirSync(cacheDir)) {
      if (entry.startsWith('access-router-runtime-')) {
        rmSync(join(cacheDir, entry), { recursive: true, force: true });
      }
    }
  }
}

export function getTrackedJitiCacheArtifacts(): string[] {
  return jitiCacheDirs.flatMap((cacheDir) => {
    if (!existsSync(cacheDir)) {
      return [];
    }

    return readdirSync(cacheDir)
      .filter((entry) => [...tempDirs].some((dir) => entry.includes(basename(dir))))
      .map((entry) => join(cacheDir, entry));
  });
}

export function assertNoTrackedJitiCacheArtifacts(): void {
  const leftovers = getTrackedJitiCacheArtifacts();
  if (leftovers.length > 0) {
    throw new Error(`Suite-owned Jiti cache artifacts were not removed: ${leftovers.join(', ')}`);
  }
}

export function assertNoTrackedTempProjects(): void {
  const leftovers = [...tempDirs].filter((dir) => existsSync(dir));
  if (leftovers.length > 0) {
    throw new Error(`Suite-owned temporary directories were not removed: ${leftovers.join(', ')}`);
  }
}

export function writeProjectFile(root: string, relativePath: string, contents: string): string {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents, 'utf8');
  return filePath;
}

export async function withTempProject<T>(
  callback: (dir: string) => Promise<T> | T,
  prefix = 'access-router-runtime-',
): Promise<T> {
  const { dir, cleanup } = createTempProject(prefix);
  const cwd = process.cwd();

  try {
    return await callback(dir);
  } finally {
    process.chdir(cwd);
    cleanup();
  }
}
