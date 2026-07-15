import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Resolve the actual CLI entry file.
 *
 * Built CommonJS runs know their own file path via `__filename`; local `tsx`
 * execution falls back to the invoked script path, resolving symlinks so npm/
 * pnpm bin shims still point back at the package's real `dist/cli.js`.
 */
export function resolveCliScriptPath(
  currentFilePath: string | undefined,
  invokedScriptPath: string | undefined,
): string {
  if (currentFilePath) return currentFilePath;
  if (!invokedScriptPath) return resolve(process.cwd(), 'cli.js');

  try {
    return realpathSync(invokedScriptPath);
  } catch {
    return resolve(invokedScriptPath);
  }
}
