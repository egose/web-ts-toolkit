import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Create a unique temporary directory that is cleaned up deterministically.
 * Caller must call cleanup(), or use withTempDir().
 */
export function createTempDir(prefix = 'wtt-express-runtime-'): {
  dir: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const cleanup = () => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  };
  return { dir, cleanup };
}

/**
 * Run a function with a temporary directory, ensuring cleanup even on failure.
 * Restores cwd if changed inside fn.
 */
export async function withTempDir<T>(fn: (dir: string) => Promise<T> | T, prefix = 'wtt-express-runtime-'): Promise<T> {
  const { dir, cleanup } = createTempDir(prefix);
  try {
    return await fn(dir);
  } finally {
    cleanup();
  }
}

/**
 * Helpers for env and cwd restoration.
 */
export function captureEnv(keys?: string[]): Map<string, string | undefined> {
  const map = new Map<string, string | undefined>();
  if (keys) {
    for (const k of keys) map.set(k, process.env[k]);
  } else {
    for (const [k, v] of Object.entries(process.env)) map.set(k, v);
  }
  return map;
}

export function restoreEnv(snapshot: Map<string, string | undefined>, keys?: string[]): void {
  if (keys) {
    for (const k of keys) {
      const v = snapshot.get(k);
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  } else {
    // Restore all keys that were present in snapshot, and delete any new ones
    const currentKeys = Object.keys(process.env);
    for (const k of currentKeys) {
      if (!snapshot.has(k)) delete process.env[k];
    }
    for (const [k, v] of snapshot) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

export function withCapturedEnv<T>(fn: () => Promise<T> | T, keys?: string[]): Promise<T> {
  const snap = captureEnv(keys);
  const run = async () => {
    try {
      return await fn();
    } finally {
      restoreEnv(snap, keys);
    }
  };
  return run();
}

export function captureCwd(): string {
  return process.cwd();
}

export function restoreCwd(original: string): void {
  try {
    process.chdir(original);
  } catch {
    // ignore
  }
}

/**
 * Utility to create a temporary file structure for build tests.
 */
export function writeTempFile(dir: string, relPath: string, content: string): string {
  const fullPath = join(dir, relPath);
  const segments = relPath.split('/').slice(0, -1);
  if (segments.length) {
    mkdirSync(join(dir, ...segments), { recursive: true });
  } else {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}
