import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSubprocess, cleanupTrackedChildren } from './support/subprocess';
import { createDeferred } from './support/deferred';
import { createTempDir } from './support/tmp';
import { runDevCommand, runExpressDevCommand } from '../src/cli-api.ts';
// NOTE: `cli-api.ts` imports `./index` without an extension. Under vitest
// resolution the stale `src/index.js` (see ERT-B17) wins over `src/index.ts`,
// so mock the resolved `./index` target. Mock both spellings; whichever one
// `cli-api` binds to becomes the controllable `vi.fn()`.
import { startLocalServer as mockStartLocalServerTs } from '../src/index.ts';
// @ts-expect-error stale compiled companion without types (ERT-B17)
import { startLocalServer as mockStartLocalServerJs } from '../src/index.js';
import type { DevArgs } from '../src/cli-utils.ts';
import type { LocalServer } from '../src/index.ts';

vi.mock('../src/index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/index.ts')>();
  return { ...actual, startLocalServer: vi.fn() };
});

// @ts-expect-error stale compiled companion without types (ERT-B17)
vi.mock('../src/index.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, startLocalServer: vi.fn() };
});

const mockStartTs = vi.mocked(mockStartLocalServerTs);
// @ts-expect-error mock-typed stale companion
const mockStartJs = vi.mocked(mockStartLocalServerJs);

function resetStartMocks(): void {
  mockStartTs.mockReset();
  mockStartJs.mockReset();
}

function implStartBoth(impl: () => LocalServer): void {
  mockStartTs.mockImplementation(impl);
  mockStartJs.mockImplementation(impl);
}

function startCalls(): unknown[][] {
  return [...mockStartTs.mock.calls, ...mockStartJs.mock.calls];
}

/** Deterministic barrier: resolves when the Express runner invokes start. */
async function waitForStartInvoked(invoked: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      invoked,
      new Promise<void>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timed out waiting for Express start invocation')), 5000);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stubServer(ready: Promise<void>): LocalServer {
  return {
    server: {} as LocalServer['server'],
    shutdown: async () => {},
    ready,
  };
}

function makeDevArgs(appPath: string): DevArgs {
  return {
    appPath,
    options: { port: 0, host: '127.0.0.1', signals: false },
    require: [],
    env: [],
    watch: [],
    watchExt: ['js'],
    watchDelay: 50,
  };
}

async function flushMicrotasks(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe('runDevCommand readiness propagation (ERT-B08)', () => {
  it('keeps pending while readiness is deferred', async () => {
    const gate = createDeferred<void>();
    let started = false;
    const runPromise = runDevCommand<object>(makeDevArgs('./app.mjs'), {
      load: async () => ({}),
      start: () => {
        started = true;
        return stubServer(gate.promise);
      },
    });
    let outcome: string | null = null;
    void runPromise.then(
      () => {
        outcome = 'resolved';
      },
      () => {
        outcome = 'rejected';
      },
    );

    await flushMicrotasks();
    expect(started).toBe(true);
    expect(outcome).toBeNull();

    gate.resolve();
    await runPromise;
    expect(outcome).toBe('resolved');
  });

  it('propagates rejected readiness with the original reason', async () => {
    const failure = new Error('ERT-B08 deferred failure');
    const gate = createDeferred<void>();
    const runPromise = runDevCommand<object>(makeDevArgs('./app.mjs'), {
      load: async () => ({}),
      start: () => stubServer(gate.promise),
    });
    const assertion = expect(runPromise).rejects.toBe(failure);
    gate.reject(failure);
    await assertion;
  });

  it('resolves on successful readiness', async () => {
    await expect(
      runDevCommand<object>(makeDevArgs('./app.mjs'), {
        load: async () => ({}),
        start: () => stubServer(Promise.resolve()),
      }),
    ).resolves.toBeUndefined();
  });

  it('preserves void runners for generic consumers without a server', async () => {
    let started = false;
    await expect(
      runDevCommand<object>(makeDevArgs('./app.mjs'), {
        load: async () => ({}),
        start: () => {
          started = true;
        },
      }),
    ).resolves.toBeUndefined();
    expect(started).toBe(true);
  });
});

describe('runExpressDevCommand propagates Express readiness (ERT-B08)', () => {
  const tempDirs: Array<() => void> = [];

  afterEach(async () => {
    resetStartMocks();
    await cleanupTrackedChildren();
    for (const cleanup of tempDirs.splice(0)) {
      cleanup();
    }
  });

  function writeAppFixture(): { dir: string; appPath: string } {
    const { dir, cleanup } = createTempDir('wtt-ert-b08-');
    tempDirs.push(cleanup);
    const distIndexUrl = new URL('../dist/index.mjs', import.meta.url).href;
    writeFileSync(
      join(dir, 'app.mjs'),
      `import { createExpressApp } from ${JSON.stringify(distIndexUrl)};\n` +
        `const app = createExpressApp();\n` +
        `app.get('/ping', (_req, res) => res.json({ pong: true }));\n` +
        `export default app;\n`,
    );
    return { dir, appPath: join(dir, 'app.mjs') };
  }

  it('keeps pending while Express readiness is deferred', async () => {
    const { appPath } = writeAppFixture();
    const gate = createDeferred<void>();
    const invoked = createDeferred<void>();
    implStartBoth(() => {
      invoked.resolve();
      return stubServer(gate.promise);
    });

    const runPromise = runExpressDevCommand(makeDevArgs(appPath));
    let outcome: string | null = null;
    void runPromise.then(
      () => {
        outcome = 'resolved';
      },
      () => {
        outcome = 'rejected';
      },
    );

    try {
      await waitForStartInvoked(invoked.promise);
      await flushMicrotasks();
      expect(startCalls()).toHaveLength(1);
      expect(startCalls()[0]?.[1]).toMatchObject({ exitAfterShutdown: true });
      expect(outcome).toBeNull();
    } finally {
      gate.resolve();
      await runPromise;
    }
    expect(outcome).toBe('resolved');
  });

  it('propagates rejected Express readiness with the original reason', async () => {
    const { appPath } = writeAppFixture();
    const failure = new Error('ERT-B08 express listen failure');
    const gate = createDeferred<void>();
    implStartBoth(() => stubServer(gate.promise));

    const runPromise = runExpressDevCommand(makeDevArgs(appPath));
    const assertion = expect(runPromise).rejects.toBe(failure);
    gate.reject(failure);
    await assertion;
    expect(startCalls()).toHaveLength(1);
  });

  it('resolves on successful Express readiness', async () => {
    const { appPath } = writeAppFixture();
    implStartBoth(() => stubServer(Promise.resolve()));

    await expect(runExpressDevCommand(makeDevArgs(appPath))).resolves.toBeUndefined();
    expect(startCalls()).toHaveLength(1);
  });

  it('real CLI failure exits nonzero with no leaked process', async () => {
    const { dir } = writeAppFixture();
    writeFileSync(join(dir, 'bad-app.mjs'), `throw new Error('ERT-B08 boom');\n`);
    const cliPath = new URL('../dist/cli.js', import.meta.url).pathname;

    const result = await runSubprocess(
      process.execPath,
      [cliPath, 'dev', './bad-app.mjs', '--port', '0', '--host', '127.0.0.1', '--no-signals'],
      { cwd: dir, timeoutMs: 8000 },
    );

    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('ERT-B08 boom');
  });
});
