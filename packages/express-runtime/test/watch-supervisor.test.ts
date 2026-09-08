import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createWatchSupervisor, runWithWatch, type DevArgs, type WatchSupervisorDeps } from '../src/cli-utils';
import { captureListenerSnapshot, restoreListenerSnapshot } from './support/process-listeners';
import { cleanupTrackedChildren } from './support/subprocess';

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
    await cleanupTrackedChildren();
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

  it('ERT-B11 rejects timer durations above the Node limit before creating resources', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-watch-'));
    tempDirs.push(dir);
    const timers = createTimerDeps();
    let forkCalls = 0;
    let watchCalls = 0;

    const deps = {
      ...timers,
      fork: (() => {
        forkCalls += 1;
        return new FakeChild(1) as unknown as ReturnType<typeof import('node:child_process').fork>;
      }) as unknown as WatchSupervisorDeps['fork'],
      watch: (() => {
        watchCalls += 1;
        return { close: () => {} } as unknown as ReturnType<typeof import('node:fs').watch>;
      }) as unknown as WatchSupervisorDeps['watch'],
      existsSync: () => true,
    };

    // 0 and 2147483647 are explicit: accepted without overflow.
    for (const watchDelay of [0, 2147483647]) {
      const controller = createWatchSupervisor(createArgs(dir, { watchDelay }), deps);
      expect(timers.timers.length).toBe(0);
      await controller.shutdown();
    }
    expect(forkCalls).toBe(2);

    // 2147483648+ rejected before fork/watch/timer creation.
    for (const watchDelay of [2147483648, Number.MAX_SAFE_INTEGER]) {
      const beforeFork = forkCalls;
      const beforeWatch = watchCalls;
      const beforeTimers = timers.timers.length;
      expect(() => createWatchSupervisor(createArgs(dir, { watchDelay }), deps)).toThrow('Invalid --delay');
      expect(forkCalls).toBe(beforeFork);
      expect(watchCalls).toBe(beforeWatch);
      expect(timers.timers.length).toBe(beforeTimers);
    }

    // Injected kill timeout above the limit is rejected the same way.
    expect(() => createWatchSupervisor(createArgs(dir), { ...deps, killTimeoutMs: 2147483648 })).toThrow(
      'Invalid killTimeoutMs',
    );

    // Timer injection avoids waiting: max delay is scheduled exactly on change.
    const maxTimers = createTimerDeps();
    let changeListener: ((eventType: string, filename: string | Buffer | null) => void) | undefined;
    const maxController = createWatchSupervisor(createArgs(dir, { watchDelay: 2147483647 }), {
      ...deps,
      ...maxTimers,
      watch: ((_path: string, _opts: unknown, cb: (eventType: string, filename: string | Buffer | null) => void) => {
        changeListener = cb;
        return { close: () => {} } as unknown as ReturnType<typeof import('node:fs').watch>;
      }) as unknown as WatchSupervisorDeps['watch'],
    });
    changeListener?.('change', 'a.ts');
    expect(maxTimers.timers.map((t) => t.ms)).toEqual([2147483647]);
    await maxController.shutdown();
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

  it('falls back to non-recursive watching when recursive fs.watch is unavailable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-watch-'));
    tempDirs.push(dir);
    const options: unknown[] = [];
    let forkCalls = 0;
    const fakeWatch = ((
      _path: string,
      opts: unknown,
      cb?: (eventType: string, filename: string | Buffer | null) => void,
    ) => {
      options.push(opts);
      if (options.length === 1) {
        const error = new Error('recursive watch unavailable') as NodeJS.ErrnoException;
        error.code = 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM';
        throw error;
      }
      return new FakeWatcher(
        cb ?? (opts as (eventType: string, filename: string | Buffer | null) => void),
      ) as unknown as ReturnType<typeof import('node:fs').watch>;
    }) as unknown as WatchSupervisorDeps['watch'];

    const controller = createWatchSupervisor(createArgs(dir), {
      fork: (() => {
        forkCalls += 1;
        return new FakeChild(1) as unknown as ReturnType<typeof import('node:child_process').fork>;
      }) as unknown as WatchSupervisorDeps['fork'],
      watch: fakeWatch,
      existsSync: () => true,
    });

    expect(options).toEqual([{ recursive: true }, expect.any(Function)]);
    expect(forkCalls).toBe(1);
    await controller.shutdown();
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

  it('ERT-B07: live-child error retains ownership when termination fails (no silent drop)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-watch-'));
    tempDirs.push(dir);
    const watcher = new FakeWatcher(() => {});
    const child = new FakeChild(1);
    // kill() reports failure: child stays live, ownership must be retained.
    child.killResult = false;
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

    child.emit('error', new Error('live child hiccup'));
    await flushMicrotasks();
    await flushMicrotasks();

    // Deterministic diagnostic, nonzero exit, kill attempted, ownership kept.
    expect(diagnostics).toEqual(['Watch child process error: live child hiccup']);
    expect(exitCodes).toEqual([1]);
    expect(child.killSignals).toEqual(['SIGTERM']);
    expect(controller.getChild()).toBe(child);
    expect(child.pid).toBe(1);
    expect(watcher.closed).toBe(true);
    expect(controller.getWatchers()).toHaveLength(0);

    // Cleanup the retained live child without pretending success: the failed
    // shutdown is single-flight, so terminate out-of-band via the child's own
    // exit (mirrors an operator kill); the exit handler releases ownership.
    child.exit(null, 'SIGTERM');
    await flushMicrotasks();
    expect(controller.getChild()).toBeNull();
  });

  it('ERT-B07: failed SIGTERM/SIGKILL retains ownership and reports inability to terminate', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-watch-'));
    tempDirs.push(dir);
    const timers = createTimerDeps();
    let watcher!: FakeWatcher;
    const child = new FakeChild(1);
    child.killResult = false;
    const diagnostics: string[] = [];
    const exitCodes: number[] = [];

    const controller = createWatchSupervisor(createArgs(dir), {
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
    await flushMicrotasks();

    expect(diagnostics).toEqual(['Watch restart failed: child.kill("SIGTERM") returned false']);
    expect(exitCodes).toEqual([1]);
    // Ownership retained: same live child still tracked, not silently nulled.
    expect(controller.getChild()).toBe(child);
    expect(child.pid).toBe(1);
    expect(watcher.closed).toBe(true);

    // Single-flight shutdown already settled; release out-of-band like an
    // operator kill so the fake handle leaves no listeners behind.
    child.exit(null, 'SIGTERM');
    await flushMicrotasks();
    expect(controller.getChild()).toBeNull();
  });

  it('ERT-B07: second signal while shutdown is pending escalates to SIGKILL without leaking handlers', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-watch-'));
    tempDirs.push(dir);
    const watcher = new FakeWatcher(() => {});
    const child = new FakeChild(1);
    child.exitOnSigterm = false;
    child.exitOnSigkill = true;
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

    // First signal starts graceful SIGTERM shutdown; handlers must stay
    // installed (no return to Node default) while cleanup is pending.
    // Assert synchronously: shutdown is still in flight (SIGTERM ignored).
    process.emit('SIGTERM', 'SIGTERM');
    expect(child.killSignals).toEqual(['SIGTERM']);
    expect(process.listenerCount('SIGINT')).toBe(beforeSIGINT + 1);
    expect(process.listenerCount('SIGTERM')).toBe(beforeSIGTERM + 1);

    // Second signal while pending follows the bounded policy: immediate
    // best-effort SIGKILL escalation, still guarded (no default restore).
    // Assert synchronously before the exit settles.
    process.emit('SIGTERM', 'SIGTERM');
    expect(child.killSignals).toEqual(['SIGTERM', 'SIGKILL']);
    expect(process.listenerCount('SIGINT')).toBe(beforeSIGINT + 1);
    expect(process.listenerCount('SIGTERM')).toBe(beforeSIGTERM + 1);

    // Third+ signals are coalesced, never restoring the default action.
    process.emit('SIGINT', 'SIGINT');
    expect(child.killSignals).toEqual(['SIGTERM', 'SIGKILL']);

    await flushMicrotasks();
    await flushMicrotasks();
    expect(exitCodes).toEqual([0]);
    expect(watcher.closed).toBe(true);
    expect(controller.getChild()).toBeNull();
    expect(controller.getWatchers()).toHaveLength(0);
    expect(process.listenerCount('SIGINT')).toBe(beforeSIGINT);
    expect(process.listenerCount('SIGTERM')).toBe(beforeSIGTERM);
  });

  it('ERT-B07: real subprocess receiving two OS signals cleans up its child (posix only)', async () => {
    // Platform rationale: SIGTERM delivery/escalation semantics differ on
    // Windows (no POSIX signals, kill() emulation). Windows coverage relies on
    // the fake-timer escalation test above; this real-OS test runs on POSIX.
    if (process.platform === 'win32') return;

    const dir = mkdtempSync(join(tmpdir(), 'wtt-watch-os-'));
    tempDirs.push(dir);
    const watchDir = join(dir, 'watched');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(watchDir, { recursive: true });
    writeFileSync(join(watchDir, 'one.ts'), 'export {};\n');

    const sleeperPath = join(dir, 'child-sleeper.mjs');
    const sigtermReceipt = join(dir, 'sleeper-sigterm.receipt');
    writeFileSync(
      sleeperPath,
      [
        `import { writeFileSync } from 'node:fs';`,
        `const receipt = process.argv[2];`,
        `process.on('SIGTERM', () => {`,
        `  try { writeFileSync(receipt, '1'); } catch {}`,
        `  setTimeout(() => process.exit(0), 500);`,
        `});`,
        `setInterval(() => {}, 1000);`,
        ``,
      ].join('\n'),
    );
    const cliApiUrl = new URL('../dist/cli-api.mjs', import.meta.url).pathname;
    const readyFile = join(dir, 'ready.pid');
    const supervisorPath = join(dir, 'supervisor.mjs');
    // NOTE: no extra SIGTERM listener is installed here on purpose. Any extra
    // listener would keep Node alive after the owned handlers are removed and
    // mask the ERT-B07 defect (second signal restoring default termination).
    // The shutdown barrier is observed via the sleeper's own SIGTERM receipt.
    writeFileSync(
      supervisorPath,
      [
        `import { writeFileSync } from 'node:fs';`,
        `import { spawn } from 'node:child_process';`,
        `import { runWithWatch } from ${JSON.stringify(cliApiUrl)};`,
        `const watchDir = ${JSON.stringify(watchDir)};`,
        `const readyFile = ${JSON.stringify(readyFile)};`,
        `const sleeperPath = ${JSON.stringify(sleeperPath)};`,
        `const sigtermReceipt = ${JSON.stringify(sigtermReceipt)};`,
        `const forkImpl = () => spawn(process.execPath, [sleeperPath, sigtermReceipt], { stdio: 'inherit' });`,
        `const controller = runWithWatch(`,
        `  { appPath: './app.js', options: {}, tsconfigPath: undefined, require: [], env: [], watch: [watchDir], watchExt: ['ts'], watchDelay: 50 },`,
        `  { fork: forkImpl, killTimeoutMs: 1500, exit: (code) => process.exit(code), installSignalHandlers: true },`,
        `);`,
        `const iv = setInterval(() => {`,
        `  const c = controller.getChild();`,
        `  if (c && c.pid) { try { writeFileSync(readyFile, String(c.pid)); } catch {} clearInterval(iv); }`,
        `}, 20);`,
        ``,
      ].join('\n'),
    );

    const beforeSIGINT = process.listenerCount('SIGINT');
    const beforeSIGTERM = process.listenerCount('SIGTERM');

    const helper: ChildProcess = spawn(process.execPath, [supervisorPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const { trackedSpawn } = await import('./support/subprocess');
    // Track via internal set by re-emitting? Use direct cleanup fallback below.
    void trackedSpawn;
    let helperStdout = '';
    let helperStderr = '';
    helper.stdout?.on('data', (c: Buffer) => (helperStdout += c.toString()));
    helper.stderr?.on('data', (c: Buffer) => (helperStderr += c.toString()));
    const helperExit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      helper.once('exit', (code, signal) => resolve({ code, signal }));
    });

    try {
      const deadline = Date.now() + 10_000;
      while (!existsSync(readyFile) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(existsSync(readyFile)).toBe(true);
      const grandchildPid = Number(readFileSync(readyFile, 'utf8').trim());
      expect(Number.isInteger(grandchildPid) && grandchildPid > 0).toBe(true);
      // Readiness barrier: grandchild really alive.
      expect(() => process.kill(grandchildPid, 0)).not.toThrow();

      // First OS signal starts graceful shutdown; the sleeper's receipt proves
      // the supervisor acted on it (explicit shutdown barrier, no fixed sleep).
      helper.kill('SIGTERM');
      const sigDeadline = Date.now() + 10_000;
      while (!existsSync(sigtermReceipt) && Date.now() < sigDeadline) {
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(existsSync(sigtermReceipt)).toBe(true);
      // Second OS signal while cleanup is pending (sleeper delays 500ms).
      // With the ERT-B07 defect this restores Node's default action because
      // owned handlers were already removed, killing the supervisor (fail).
      // Fixed code keeps guarded handling and still cleans up the child.
      helper.kill('SIGTERM');

      const exitDeadline = Date.now() + 15_000;
      let exitResult: { code: number | null; signal: NodeJS.Signals | null } | null = null;
      while (Date.now() < exitDeadline) {
        if (helper.exitCode !== null || helper.signalCode !== null) break;
        await new Promise((r) => setTimeout(r, 25));
      }
      exitResult = await Promise.race([
        helperExit,
        new Promise<{ code: null; signal: null }>((r) => setTimeout(() => r({ code: null, signal: null }), 1000)),
      ]);
      expect(exitResult.code).toBe(0);
      expect(helperStderr).toBe('');

      // No leaked grandchild: absence confirmed via kill(signal 0) polling.
      const goneDeadline = Date.now() + 5_000;
      let gone = false;
      while (Date.now() < goneDeadline) {
        try {
          process.kill(grandchildPid, 0);
          await new Promise((r) => setTimeout(r, 50));
        } catch {
          gone = true;
          break;
        }
      }
      expect(gone).toBe(true);
      void helperStdout;
    } finally {
      try {
        if (helper.exitCode === null && helper.signalCode === null) helper.kill('SIGKILL');
      } catch (_e) {
        void _e;
      }
      await new Promise((r) => setTimeout(r, 50));
      try {
        if (helper.exitCode === null && helper.signalCode === null) helper.kill('SIGKILL');
      } catch (_e) {
        void _e;
      }
    }

    // Parent process listener baseline unchanged (owned-only removal).
    expect(process.listenerCount('SIGINT')).toBe(beforeSIGINT);
    expect(process.listenerCount('SIGTERM')).toBe(beforeSIGTERM);
  });
});
