import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TestWorkspace {
  root: string;
  source: string;
  target: string;
  sandbox: string;
  bin: string;
  consumer: string;
  cleanup(): void;
}

export function createTestWorkspace(prefix = 'carms-'): TestWorkspace {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const paths = {
    source: join(root, 'source'),
    target: join(root, 'target'),
    sandbox: join(root, 'sandbox'),
    bin: join(root, 'bin'),
    consumer: join(root, 'consumer'),
  };

  for (const path of Object.values(paths)) mkdirSync(path, { recursive: true });

  return {
    root,
    ...paths,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export async function withTestWorkspace<T>(
  run: (workspace: TestWorkspace) => T | Promise<T>,
  prefix?: string,
): Promise<T> {
  const workspace = createTestWorkspace(prefix);
  try {
    return await run(workspace);
  } finally {
    workspace.cleanup();
  }
}

export function workspaceWasRemoved(workspace: TestWorkspace): boolean {
  return !existsSync(workspace.root);
}
