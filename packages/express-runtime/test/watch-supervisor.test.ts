import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWatchSupervisor, type WatchSupervisorDeps } from '../src/cli-utils';
import { captureListenerSnapshot, restoreListenerSnapshot } from './support/process-listeners';

describe('watch supervisor — injectable seams and deterministic cleanup', () => {
  const tempDirs: string[] = [];
  let snapshot: ReturnType<typeof captureListenerSnapshot>;

  beforeEach(() => {
    snapshot = captureListenerSnapshot(['SIGINT', 'SIGTERM']);
  });

  afterEach(async () => {
    // Cleanup temp dirs
    for (const d of tempDirs.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch (_e) {
        void _e;
      }
    }
    // Ensure no leaked signal listeners (seam should not install in test mode)
    restoreListenerSnapshot(snapshot, ['SIGINT', 'SIGTERM']);
  });

  it('validates all watch paths before opening any watcher — no leaks on partial failure', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-watch-'));
    tempDirs.push(dir);

    let watchCalls = 0;
    const fakeWatch = (() => {
      watchCalls += 1;
      return { close: () => {} } as unknown as ReturnType<typeof import('node:fs').watch>;
    }) as unknown as typeof import('node:fs').watch;

    const args = {
      appPath: './app.js',
      options: {},
      tsconfigPath: undefined,
      require: [],
      env: [],
      watch: [dir, '/nonexistent/path/does/not/exist'],
      watchExt: ['ts'],
      watchDelay: 10,
    } as const;

    expect(() =>
      createWatchSupervisor(args as unknown as Parameters<typeof createWatchSupervisor>[0], {
        fork: (() =>
          ({ on: () => {}, kill: () => true, pid: 123 }) as unknown as ReturnType<
            typeof import('node:child_process').fork
          >) as unknown as WatchSupervisorDeps['fork'],
        watch: fakeWatch,
        existsSync: (p: string) => p === dir,
      }),
    ).toThrow('Watch path not found');

    expect(watchCalls).toBe(0);
  });

  it('exposes observable controller and cleans up watchers/child deterministically', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-watch-'));
    tempDirs.push(dir);

    const watchers: { closed: boolean }[] = [];
    const fakeWatch = ((_path: string, _opts: unknown, _cb: unknown) => {
      const w = { close: () => (w.closed = true), closed: false };
      watchers.push(w);
      return w as unknown as ReturnType<typeof import('node:fs').watch>;
    }) as unknown as typeof import('node:fs').watch;

    let killCalled = false;
    const fakeFork = (() => {
      const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      const child = {
        pid: 999,
        on: (ev: string, fn: (...args: unknown[]) => void) => {
          handlers[ev] = handlers[ev] ?? [];
          handlers[ev].push(fn);
        },
        once: (ev: string, fn: (...args: unknown[]) => void) => {
          handlers[ev] = handlers[ev] ?? [];
          const wrapped = (...args: unknown[]) => {
            fn(...args);
            handlers[ev] = handlers[ev].filter((h) => h !== wrapped);
          };
          handlers[ev].push(wrapped);
        },
        removeListener: () => {},
        kill: () => {
          killCalled = true;
          // Simulate exit async
          setTimeout(() => handlers['exit']?.forEach((h) => h(null, null)), 10);
          return true;
        },
      } as unknown as ReturnType<typeof import('node:child_process').fork>;
      return child;
    }) as unknown as WatchSupervisorDeps['fork'];

    const controller = createWatchSupervisor(
      {
        appPath: './app.js',
        options: {},
        tsconfigPath: undefined,
        require: [],
        env: [],
        watch: [dir],
        watchExt: ['ts'],
        watchDelay: 500,
      },
      { fork: fakeFork, watch: fakeWatch, existsSync: () => true },
    );

    expect(controller.getWatchers().length).toBe(1);
    expect(controller.getChild()).not.toBeNull();
    expect(controller.isShuttingDown()).toBe(false);

    await controller.shutdown();

    expect(controller.isShuttingDown()).toBe(true);
    expect(watchers[0].closed).toBe(true);
    expect(killCalled).toBe(true);
    // After shutdown, watchers should be empty (spliced)
    expect(controller.getWatchers().length).toBe(0);
  });

  it('does not install SIGINT/SIGTERM handlers in test mode (injectable deps)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-watch-'));
    tempDirs.push(dir);

    const fakeWatch = (() =>
      ({ close: () => {} }) as unknown as ReturnType<
        typeof import('node:fs').watch
      >) as unknown as typeof import('node:fs').watch;
    const fakeFork = (() =>
      ({
        on: () => {},
        once: (_ev: string, fn: (...args: unknown[]) => void) => {
          // For shutdown killChild: simulate exit after kill
          setTimeout(() => fn(null, null), 5);
        },
        removeListener: () => {},
        kill: () => true,
        pid: 1,
      }) as unknown as ReturnType<typeof import('node:child_process').fork>) as unknown as WatchSupervisorDeps['fork'];

    const beforeSIGINT = process.listenerCount('SIGINT');
    const beforeSIGTERM = process.listenerCount('SIGTERM');

    const controller = createWatchSupervisor(
      {
        appPath: './app.js',
        options: {},
        tsconfigPath: undefined,
        require: [],
        env: [],
        watch: [dir],
        watchExt: ['ts'],
        watchDelay: 10,
      },
      { fork: fakeFork, watch: fakeWatch, existsSync: () => true },
    );

    // In test mode (deps provided), no signal listeners should be added
    expect(process.listenerCount('SIGINT')).toBe(beforeSIGINT);
    expect(process.listenerCount('SIGTERM')).toBe(beforeSIGTERM);

    // Cleanup
    void controller.shutdown();
  });
});
