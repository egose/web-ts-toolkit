import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWatchSupervisor, runWithWatch, type DevArgs, type WatchSupervisorDeps } from '../src/cli-utils';
import { captureListenerSnapshot, restoreListenerSnapshot } from './support/process-listeners';

class FakeChild extends EventEmitter {
  pid: number | undefined;
  readonly killSignals: NodeJS.Signals[] = [];
  killResult = true;
  exitOnSigterm = true;
  exitOnSigkill = true;

  constructor(pid: number) {
    super();
    this.pid = pid;
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.killSignals.push(signal);
    if (!this.killResult) return false;
    if ((signal === 'SIGTERM' && this.exitOnSigterm) || (signal === 'SIGKILL' && this.exitOnSigkill)) {
      this.exit(null, signal);
    }
    return true;
  }

  exit(code: number | null = 0, signal: NodeJS.Signals | null = null): void {
    this.pid = undefined;
    this.emit('exit', code, signal);
  }
}

class FakeWatcher extends EventEmitter {
  closed = false;

  constructor(private readonly listener: (eventType: string, filename: string | Buffer | null) => void) {
    super();
  }

  close(): void {
    this.closed = true;
  }

  trigger(filename: string): void {
    this.listener('change', filename);
  }
}

interface FakeTimer {
  fn: () => void;
  ms: number;
  cleared: boolean;
}

function createTimerDeps(): Pick<WatchSupervisorDeps, 'setTimeout' | 'clearTimeout'> & { timers: FakeTimer[] } {
  const timers: FakeTimer[] = [];
  return {
    timers,
    setTimeout: ((fn: () => void, ms?: number) => {
      const timer: FakeTimer = { fn, ms: ms ?? 0, cleared: false };
      timers.push(timer);
      return timer as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout,
    clearTimeout: ((timer: ReturnType<typeof setTimeout>) => {
      (timer as unknown as FakeTimer).cleared = true;
    }) as typeof clearTimeout,
  };
}

function runPendingTimers(timers: FakeTimer[], ms?: number): void {
  for (const timer of [...timers]) {
    if (!timer.cleared && (ms === undefined || timer.ms === ms)) {
      timer.cleared = true;
      timer.fn();
    }
  }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function createArgs(dir: string, overrides: Partial<DevArgs> = {}): DevArgs {
  return {
    appPath: './app.js',
    options: {},
    tsconfigPath: undefined,
    require: [],
    env: [],
    watch: [dir],
    watchExt: ['ts'],
    watchDelay: 0,
    ...overrides,
  };
}

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

  it('rolls back opened watchers if watcher setup fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-watch-'));
    tempDirs.push(dir);
    const opened: FakeWatcher[] = [];
    const fakeWatch = ((
      _path: string,
      _opts: unknown,
      cb: (eventType: string, filename: string | Buffer | null) => void,
    ) => {
      const watcher = new FakeWatcher(cb);
      opened.push(watcher);
      if (opened.length === 2) {
        throw new Error('recursive watch unsupported');
      }
      return watcher as unknown as ReturnType<typeof import('node:fs').watch>;
    }) as unknown as WatchSupervisorDeps['watch'];
    let forkCalls = 0;

    expect(() =>
      createWatchSupervisor(createArgs(dir, { watch: [join(dir, 'one'), join(dir, 'two')] }), {
        fork: (() => {
          forkCalls += 1;
          return new FakeChild(1) as unknown as ReturnType<typeof import('node:child_process').fork>;
        }) as unknown as WatchSupervisorDeps['fork'],
        watch: fakeWatch,
        existsSync: () => true,
      }),
    ).toThrow('recursive watch unsupported');

    expect(opened[0].closed).toBe(true);
    expect(opened[1].closed).toBe(false);
    expect(forkCalls).toBe(0);
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

  it('coalesces burst changes during slow child exit into one replacement with one live child', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-watch-'));
    tempDirs.push(dir);
    const timers = createTimerDeps();
    const watchers: FakeWatcher[] = [];
    const children: FakeChild[] = [];
    const fakeWatch = ((
      _path: string,
      _opts: unknown,
      cb: (eventType: string, filename: string | Buffer | null) => void,
    ) => {
      const watcher = new FakeWatcher(cb);
      watchers.push(watcher);
      return watcher as unknown as ReturnType<typeof import('node:fs').watch>;
    }) as unknown as WatchSupervisorDeps['watch'];
    const fakeFork = (() => {
      const child = new FakeChild(children.length + 1);
      child.exitOnSigterm = children.length !== 0;
      children.push(child);
      return child as unknown as ReturnType<typeof import('node:child_process').fork>;
    }) as unknown as WatchSupervisorDeps['fork'];

    const controller = createWatchSupervisor(createArgs(dir), {
      fork: fakeFork,
      watch: fakeWatch,
      existsSync: () => true,
      killTimeoutMs: 1_000,
      ...timers,
    });

    expect(children).toHaveLength(1);
    watchers[0].trigger('one.ts');
    runPendingTimers(timers.timers, 0);
    await flushMicrotasks();
    expect(children).toHaveLength(1);
    expect(children.filter((child) => child.pid !== undefined)).toHaveLength(1);

    watchers[0].trigger('two.ts');
    watchers[0].trigger('three.ts');
    runPendingTimers(timers.timers, 0);
    await flushMicrotasks();
    expect(children).toHaveLength(1);
    expect(children.filter((child) => child.pid !== undefined)).toHaveLength(1);

    children[0].exit(null, 'SIGTERM');
    await flushMicrotasks();

    expect(children).toHaveLength(2);
    expect(children.filter((child) => child.pid !== undefined)).toHaveLength(1);
    expect(controller.getChild()).toBe(children[1]);

    await controller.shutdown();
  });

  it('handles child spawn errors with one diagnostic and nonzero exit policy', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-watch-'));
    tempDirs.push(dir);
    const watcher = new FakeWatcher(() => {});
    const child = new FakeChild(1);
    const diagnostics: string[] = [];
    const exitCodes: number[] = [];

    const controller = createWatchSupervisor(createArgs(dir), {
      fork: (() =>
        child as unknown as ReturnType<
          typeof import('node:child_process').fork
        >) as unknown as WatchSupervisorDeps['fork'],
      watch: (() =>
        watcher as unknown as ReturnType<typeof import('node:fs').watch>) as unknown as WatchSupervisorDeps['watch'],
      existsSync: () => true,
      logger: { error: (message: unknown) => diagnostics.push(String(message)) },
      exit: (code) => exitCodes.push(code),
    });

    child.emit('error', new Error('spawn ENOENT'));
    await flushMicrotasks();

    expect(diagnostics).toEqual(['Watch child process error: spawn ENOENT']);
    expect(exitCodes).toEqual([1]);
    expect(watcher.closed).toBe(true);
    expect(controller.getWatchers()).toHaveLength(0);
    expect(controller.getChild()).toBeNull();
  });

  it('handles restart kill failure with one diagnostic and nonzero exit policy', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-watch-'));
    tempDirs.push(dir);
    const timers = createTimerDeps();
    let watcher!: FakeWatcher;
    const child = new FakeChild(1);
    child.killResult = false;
    const diagnostics: string[] = [];
    const exitCodes: number[] = [];

    createWatchSupervisor(createArgs(dir), {
      fork: (() =>
        child as unknown as ReturnType<
          typeof import('node:child_process').fork
        >) as unknown as WatchSupervisorDeps['fork'],
      watch: ((_path: string, _opts: unknown, cb: (eventType: string, filename: string | Buffer | null) => void) => {
        watcher = new FakeWatcher(cb);
        return watcher as unknown as ReturnType<typeof import('node:fs').watch>;
      }) as unknown as WatchSupervisorDeps['watch'],
      existsSync: () => true,
      logger: { error: (message: unknown) => diagnostics.push(String(message)) },
      exit: (code) => exitCodes.push(code),
      ...timers,
    });

    watcher.trigger('change.ts');
    runPendingTimers(timers.timers, 0);
    await flushMicrotasks();

    expect(diagnostics).toEqual(['Watch restart failed: child.kill("SIGTERM") returned false']);
    expect(exitCodes).toEqual([1]);
    expect(watcher.closed).toBe(true);
  });

  it('escalates from SIGTERM to SIGKILL after the configured kill timeout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-watch-'));
    tempDirs.push(dir);
    const timers = createTimerDeps();
    const child = new FakeChild(1);
    child.exitOnSigterm = false;

    const controller = createWatchSupervisor(createArgs(dir), {
      fork: (() =>
        child as unknown as ReturnType<
          typeof import('node:child_process').fork
        >) as unknown as WatchSupervisorDeps['fork'],
      watch: (() =>
        new FakeWatcher(() => {}) as unknown as ReturnType<
          typeof import('node:fs').watch
        >) as unknown as WatchSupervisorDeps['watch'],
      existsSync: () => true,
      killTimeoutMs: 25,
      ...timers,
    });

    const shutdown = controller.shutdown();
    await flushMicrotasks();
    expect(child.killSignals).toEqual(['SIGTERM']);
    expect(timers.timers.some((timer) => timer.ms === 25 && !timer.cleared)).toBe(true);

    runPendingTimers(timers.timers, 25);
    await shutdown;

    expect(child.killSignals).toEqual(['SIGTERM', 'SIGKILL']);
    expect(controller.getChild()).toBeNull();
  });

  it('handles watcher runtime errors by closing resources and exiting nonzero once', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-watch-'));
    tempDirs.push(dir);
    const watcher = new FakeWatcher(() => {});
    const child = new FakeChild(1);
    const diagnostics: string[] = [];
    const exitCodes: number[] = [];

    createWatchSupervisor(createArgs(dir), {
      fork: (() =>
        child as unknown as ReturnType<
          typeof import('node:child_process').fork
        >) as unknown as WatchSupervisorDeps['fork'],
      watch: (() =>
        watcher as unknown as ReturnType<typeof import('node:fs').watch>) as unknown as WatchSupervisorDeps['watch'],
      existsSync: () => true,
      logger: { error: (message: unknown) => diagnostics.push(String(message)) },
      exit: (code) => exitCodes.push(code),
    });

    watcher.emit('error', new Error('watch failed'));
    watcher.emit('error', new Error('watch failed again'));
    await flushMicrotasks();

    expect(diagnostics).toEqual(['Watch path runtime error: watch failed']);
    expect(exitCodes).toEqual([1]);
    expect(watcher.closed).toBe(true);
    expect(child.killSignals).toEqual(['SIGTERM']);
  });

  it('repeated signals run one shutdown, remove owned listeners, and do not respawn', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-watch-'));
    tempDirs.push(dir);
    const watcher = new FakeWatcher(() => {});
    const child = new FakeChild(1);
    const exitCodes: number[] = [];
    const beforeSIGINT = process.listenerCount('SIGINT');
    const beforeSIGTERM = process.listenerCount('SIGTERM');

    const controller = runWithWatch(createArgs(dir), {
      fork: (() =>
        child as unknown as ReturnType<
          typeof import('node:child_process').fork
        >) as unknown as WatchSupervisorDeps['fork'],
      watch: (() =>
        watcher as unknown as ReturnType<typeof import('node:fs').watch>) as unknown as WatchSupervisorDeps['watch'],
      existsSync: () => true,
      exit: (code) => exitCodes.push(code),
      installSignalHandlers: true,
    });

    expect(process.listenerCount('SIGINT')).toBe(beforeSIGINT + 1);
    expect(process.listenerCount('SIGTERM')).toBe(beforeSIGTERM + 1);

    process.emit('SIGTERM', 'SIGTERM');
    process.emit('SIGINT', 'SIGINT');
    await flushMicrotasks();

    watcher.trigger('after-shutdown.ts');
    await flushMicrotasks();

    expect(exitCodes).toEqual([0]);
    expect(child.killSignals).toEqual(['SIGTERM']);
    expect(watcher.closed).toBe(true);
    expect(controller.getChild()).toBeNull();
    expect(controller.getWatchers()).toHaveLength(0);
    expect(process.listenerCount('SIGINT')).toBe(beforeSIGINT);
    expect(process.listenerCount('SIGTERM')).toBe(beforeSIGTERM);
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
