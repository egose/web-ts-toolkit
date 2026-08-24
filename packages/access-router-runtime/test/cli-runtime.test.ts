import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertSubprocessResult, cleanupTrackedChildren, runSubprocess, trackChildProcess } from './support/subprocess';
import { assertNoTrackedTempProjects, cleanupTempProjects, createTempProject, writeProjectFile } from './support/tmp';

const cliPath = new URL('../dist/cli.js', import.meta.url).pathname;
const packageDir = resolve(dirname(cliPath), '..');

function readLines(filePath: string): string[] {
  if (!existsSync(filePath)) {
    return [];
  }
  return readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
}

async function runCli(args: string[], cwd: string, timeoutMs = 4_000) {
  return runSubprocess(process.execPath, [cliPath, ...args], { cwd, timeoutMs });
}

function linkSelfPackage(projectDir: string): void {
  const scopeDir = join(projectDir, 'node_modules', '@web-ts-toolkit');
  mkdirSync(scopeDir, { recursive: true });
  symlinkSync(packageDir, join(scopeDir, 'access-router-runtime'), 'dir');
}

async function buildLocalArtifact(projectDir: string, configContent: string, outName = 'app'): Promise<void> {
  linkSelfPackage(projectDir);
  writeProjectFile(projectDir, 'config.mjs', configContent);

  const result = await runCli(
    ['build', './config.mjs', '--out-dir', './dist', '--out-name', outName, '--format', 'cjs'],
    projectDir,
    30_000,
  );
  assertSubprocessResult(result, { exitCode: 0, timedOut: false });
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolvePromise());
  });
  const address = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (address === null || typeof address === 'string') {
    throw new Error('Expected TCP test server address');
  }
  return address.port;
}

function spawnCli(args: string[], cwd: string, timeoutMs = 8_000) {
  const child = trackChildProcess(
    spawn(process.execPath, [cliPath, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
  }, timeoutMs);
  timeout.unref?.();
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolvePromise, reject) => {
    child.once('exit', (code, signal) => resolvePromise({ code, signal }));
    child.once('error', reject);
  });

  child.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  return {
    child,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
    async waitForStdout(text: string): Promise<void> {
      if (stdout.includes(text)) return;
      await new Promise<void>((resolvePromise, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error(`Timed out waiting for stdout ${JSON.stringify(text)}. stderr: ${stderr}`));
        }, timeoutMs);
        timer.unref?.();
        const onData = () => {
          if (!stdout.includes(text)) return;
          cleanup();
          resolvePromise();
        };
        const onExit = () => {
          cleanup();
          reject(new Error(`Process exited before stdout ${JSON.stringify(text)}. stderr: ${stderr}`));
        };
        const cleanup = () => {
          clearTimeout(timer);
          child.stdout?.removeListener('data', onData);
          child.removeListener('exit', onExit);
        };
        child.stdout?.on('data', onData);
        child.once('exit', onExit);
      });
    },
    async waitForExit() {
      try {
        const { code, signal } = await exit;
        await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
        return { exitCode: code, signal, stdout, stderr, timedOut };
      } finally {
        clearTimeout(timeout);
        child.stdout?.removeAllListeners();
        child.stderr?.removeAllListeners();
      }
    },
  };
}

async function waitForFileLine(filePath: string, line: string, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (readLines(filePath).includes(line)) {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  throw new Error(`Timed out waiting for ${line} in ${filePath}`);
}

function requestText(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise, reject) => {
    const req = httpGet(url, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on('end', () => resolvePromise({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
  });
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await new Promise<void>((resolvePromise) => {
    const timer = setTimeout(resolvePromise, 2_000);
    timer.unref?.();
    child.once('exit', () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
}

describe('access-router-runtime CLI subprocess behavior', () => {
  afterEach(async () => {
    await cleanupTrackedChildren();
    cleanupTempProjects();
    assertNoTrackedTempProjects();
  });

  it('loads --env files and --require modules before evaluating config', async () => {
    const { dir } = createTempProject('access-router-runtime-cli-env-');
    writeProjectFile(dir, 'vars.env', 'ARRT_ENV_ONLY=from-env\n');
    writeProjectFile(dir, 'preload.cjs', "globalThis.__ARRT_PRELOADED = 'from-preload';\n");
    writeProjectFile(
      dir,
      'config.cjs',
      [
        "if (process.env.ARRT_ENV_ONLY !== 'from-env') throw new Error('missing env before config');",
        "if (globalThis.__ARRT_PRELOADED !== 'from-preload') throw new Error('missing preload before config');",
        "module.exports = { init() { throw new Error('config saw env and preload'); } };",
        '',
      ].join('\n'),
    );

    const result = await runCli(
      ['dev', './config.cjs', '--env', './vars.env', '--require', './preload.cjs', '--port', '0', '--no-signals'],
      dir,
    );

    assertSubprocessResult(result, {
      exitCode: 1,
      stderrIncludes: 'config saw env and preload',
      timedOut: false,
    });
    expect(result.stderr).not.toContain('missing env before config');
    expect(result.stderr).not.toContain('missing preload before config');
  });

  it('rejects malformed options before config evaluation', async () => {
    const { dir } = createTempProject('access-router-runtime-cli-validation-');
    const marker = join(dir, 'evaluated.txt');
    writeProjectFile(
      dir,
      'config.cjs',
      "require('node:fs').appendFileSync('./evaluated.txt', 'x'); module.exports = {};\n",
    );

    const cases: string[][] = [
      ['dev', './config.cjs', '--bogus'],
      ['dev', './config.cjs', '--delay', 'Infinity'],
      ['dev', './config.cjs', '--port'],
      ['dev', './config.cjs', '--tsconfig='],
      ['dev', './config.cjs', '--tsconfig', './a.json', '--tsconfig=./b.json'],
      ['unknown-command', './config.cjs'],
    ];

    for (const args of cases) {
      const result = await runCli(args, dir);
      expect(result.exitCode).toBe(1);
      expect(result.timedOut).toBe(false);
    }
    expect(existsSync(marker)).toBe(false);
  }, 15_000);

  it('accepts options before and after the config target and preserves -- target semantics', async () => {
    const { dir } = createTempProject('access-router-runtime-cli-positionals-');
    const config = "module.exports = { init() { throw new Error('target parsed'); } };\n";
    writeProjectFile(dir, 'config.cjs', config);
    writeProjectFile(dir, '--config.cjs', config);

    const before = await runCli(['dev', '--port', '0', '--no-signals', './config.cjs'], dir);
    assertSubprocessResult(before, { exitCode: 1, stderrIncludes: 'target parsed', timedOut: false });

    const after = await runCli(['./config.cjs', '--port', '0', '--no-signals'], dir);
    assertSubprocessResult(after, { exitCode: 1, stderrIncludes: 'target parsed', timedOut: false });

    const terminated = await runCli(['dev', '--', '--config.cjs'], dir);
    assertSubprocessResult(terminated, { exitCode: 1, stderrIncludes: 'target parsed', timedOut: false });
  });

  it('does not evaluate config or initialize app resources in the watch supervisor', async () => {
    const { dir } = createTempProject('access-router-runtime-cli-watch-');
    writeProjectFile(
      dir,
      'config.cjs',
      [
        "const fs = require('node:fs');",
        "const supervisor = process.argv.some((arg) => arg.startsWith('--watch'));",
        "fs.appendFileSync(supervisor ? './supervisor-eval.txt' : './child-eval.txt', `${process.pid}\\n`);",
        'exports.config = {',
        '  init() {',
        "    fs.appendFileSync(supervisor ? './supervisor-init.txt' : './child-init.txt', `${process.pid}\\n`);",
        '  },',
        '};',
        '',
      ].join('\n'),
    );

    const result = await runCli(['dev', './config.cjs', '--watch', '--port', '0', '--no-signals'], dir, 4_000);

    expect(result.timedOut).toBe(true);
    expect(existsSync(join(dir, 'supervisor-eval.txt'))).toBe(false);
    expect(existsSync(join(dir, 'supervisor-init.txt'))).toBe(false);
    expect(readLines(join(dir, 'child-eval.txt'))).toHaveLength(1);
    expect(readLines(join(dir, 'child-init.txt'))).toHaveLength(1);
  }, 10_000);

  it('exits nonzero in bounded time when config init fails before listen', async () => {
    const { dir } = createTempProject('access-router-runtime-cli-init-fail-');
    writeProjectFile(dir, 'config.cjs', "module.exports = { init() { throw new Error('init exploded'); } };\n");

    const result = await runCli(['dev', './config.cjs', '--port', '0', '--no-signals'], dir);

    assertSubprocessResult(result, { exitCode: 1, stderrIncludes: 'init exploded', timedOut: false });
    expect(result.stdout).not.toContain('Server running');
  });

  it('exits nonzero in bounded time when database connection fails before listen', async () => {
    const { dir } = createTempProject('access-router-runtime-cli-db-fail-');
    writeProjectFile(
      dir,
      'config.cjs',
      [
        'exports.config = {',
        "  db: { url: 'mongodb://127.0.0.1:1/arrt04', options: { serverSelectionTimeoutMS: 50 } },",
        '};',
        '',
      ].join('\n'),
    );

    const result = await runCli(['dev', './config.cjs', '--port', '0', '--no-signals'], dir, 5_000);

    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
    expect(result.stderr).toContain('MongooseServerSelectionError');
    expect(result.stderr).toMatch(/Server selection timed out|ECONNREFUSED/);
    expect(result.stdout).not.toContain('Server running');
  });

  it('exits nonzero in bounded time when listen fails', async () => {
    const { dir } = createTempProject('access-router-runtime-cli-listen-fail-');
    writeProjectFile(dir, 'config.cjs', 'module.exports = {};\n');
    const blocker = createServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once('error', reject);
      blocker.listen(0, '127.0.0.1', () => resolve());
    });
    const address = blocker.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected TCP test server address');
    }

    try {
      const result = await runCli(
        ['dev', './config.cjs', '--port', String(address.port), '--host', '127.0.0.1', '--no-signals'],
        dir,
      );

      assertSubprocessResult(result, { exitCode: 1, stderrIncludes: 'already in use', timedOut: false });
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });

  it('imports one or multiple built local app modules without changing signal listener counts', async () => {
    const { dir } = createTempProject('access-router-runtime-built-import-signals-');
    await buildLocalArtifact(dir, 'export default {};\n', 'app-a');
    writeProjectFile(dir, 'config.mjs', 'export default {};\n');
    const secondBuild = await runCli(
      ['build', './config.mjs', '--out-dir', './dist-b', '--out-name', 'app-b', '--format', 'cjs'],
      dir,
      30_000,
    );
    assertSubprocessResult(secondBuild, { exitCode: 0, timedOut: false });

    const result = await runSubprocess(
      process.execPath,
      [
        '-e',
        [
          "const before = { SIGINT: process.listenerCount('SIGINT'), SIGTERM: process.listenerCount('SIGTERM') };",
          "require('./dist/app-a.js');",
          "require('./dist-b/app-b.js');",
          "const after = { SIGINT: process.listenerCount('SIGINT'), SIGTERM: process.listenerCount('SIGTERM') };",
          'console.log(JSON.stringify({ before, after }));',
        ].join('\n'),
      ],
      { cwd: dir },
    );

    assertSubprocessResult(result, { exitCode: 0, timedOut: false });
    const counts = JSON.parse(result.stdout.trim()) as {
      before: Record<'SIGINT' | 'SIGTERM', number>;
      after: Record<'SIGINT' | 'SIGTERM', number>;
    };
    expect(counts.after).toEqual(counts.before);
  }, 15_000);

  it('start --no-signals installs no package-owned signal listener for a built access-router app', async () => {
    const { dir } = createTempProject('access-router-runtime-start-no-signals-');
    await buildLocalArtifact(
      dir,
      [
        "const fs = require('node:fs');",
        'export default {',
        "  init() { fs.appendFileSync('./events.log', 'init\\n'); },",
        "  shutdown() { fs.appendFileSync('./events.log', 'shutdown\\n'); },",
        '};',
        '',
      ].join('\n'),
    );
    writeProjectFile(
      dir,
      'preload.cjs',
      [
        "const fs = require('node:fs');",
        'const originalOnce = process.once;',
        'process.once = function patchedOnce(event, listener) {',
        "  if (event === 'SIGINT' || event === 'SIGTERM') fs.appendFileSync('./signals.log', `${event}\\n`);",
        '  return originalOnce.call(this, event, listener);',
        '};',
        '',
      ].join('\n'),
    );
    const port = await getFreePort();
    const running = spawnCli(
      [
        'start',
        './dist/app.js',
        '--port',
        String(port),
        '--host',
        '127.0.0.1',
        '--require',
        './preload.cjs',
        '--no-signals',
      ],
      dir,
    );

    try {
      await running.waitForStdout('Server running');
      running.child.kill('SIGTERM');
      const result = await running.waitForExit();

      expect(result.signal).toBe('SIGTERM');
      expect(existsSync(join(dir, 'signals.log'))).toBe(false);
      expect(readLines(join(dir, 'events.log'))).toEqual(['init']);
    } finally {
      await stopChild(running.child);
    }
  }, 15_000);

  it('SIGTERM drains an in-flight request before runtime cleanup and process exit', async () => {
    const { dir } = createTempProject('access-router-runtime-start-drain-');
    await buildLocalArtifact(
      dir,
      [
        "const fs = require('node:fs');",
        'const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));',
        'export default {',
        '  express: {',
        '    finalize(app) {',
        "      app.get('/slow', async (_req, res) => {",
        "        fs.appendFileSync('./events.log', 'request:start\\n');",
        "        while (!fs.existsSync('./release.txt')) await delay(10);",
        "        fs.appendFileSync('./events.log', 'request:end\\n');",
        "        res.end('ok');",
        '      });',
        '    },',
        '  },',
        "  shutdown() { fs.appendFileSync('./events.log', 'shutdown\\n'); },",
        '};',
        '',
      ].join('\n'),
    );
    const port = await getFreePort();
    const running = spawnCli(
      ['start', './dist/app.js', '--port', String(port), '--host', '127.0.0.1', '--shutdown-timeout', '3000'],
      dir,
    );

    try {
      await running.waitForStdout('Server running');
      const response = requestText(`http://127.0.0.1:${port}/slow`);
      await waitForFileLine(join(dir, 'events.log'), 'request:start');
      running.child.kill('SIGTERM');
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      expect(readLines(join(dir, 'events.log'))).toEqual(['request:start']);

      writeFileSync(join(dir, 'release.txt'), 'ok');
      await expect(response).resolves.toEqual({ status: 200, body: 'ok' });
      const result = await running.waitForExit();

      assertSubprocessResult(result, { exitCode: 0, signal: null, timedOut: false });
      expect(readLines(join(dir, 'events.log'))).toEqual(['request:start', 'request:end', 'shutdown']);
    } finally {
      await stopChild(running.child);
    }
  }, 15_000);

  it('awaits slow shutdown rejection, reports it, and exits nonzero without an unhandled rejection', async () => {
    const { dir } = createTempProject('access-router-runtime-start-shutdown-reject-');
    await buildLocalArtifact(
      dir,
      [
        "const fs = require('node:fs');",
        'const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));',
        "process.on('unhandledRejection', (reason) => {",
        "  fs.appendFileSync('./events.log', `unhandled:${reason && reason.message ? reason.message : reason}\\n`);",
        '});',
        'export default {',
        "  init() { fs.appendFileSync('./events.log', 'init\\n'); },",
        '  async shutdown() {',
        "    fs.appendFileSync('./events.log', 'shutdown:start\\n');",
        '    await delay(100);',
        "    fs.appendFileSync('./events.log', 'shutdown:end\\n');",
        "    throw new Error('runtime shutdown failed intentionally');",
        '  },',
        '};',
        '',
      ].join('\n'),
    );
    const port = await getFreePort();
    const running = spawnCli(['start', './dist/app.js', '--port', String(port), '--host', '127.0.0.1'], dir);

    try {
      await running.waitForStdout('Server running');
      running.child.kill('SIGTERM');
      const result = await running.waitForExit();

      assertSubprocessResult(result, {
        exitCode: 1,
        signal: null,
        stderrIncludes: 'runtime shutdown failed intentionally',
        timedOut: false,
      });
      expect(readLines(join(dir, 'events.log'))).toEqual(['init', 'shutdown:start', 'shutdown:end']);
    } finally {
      await stopChild(running.child);
    }
  }, 15_000);

  it('normal startup uses one coordinated signal owner and runs each hook once', async () => {
    const { dir } = createTempProject('access-router-runtime-start-single-owner-');
    await buildLocalArtifact(
      dir,
      [
        "const fs = require('node:fs');",
        'export default {',
        "  init() { fs.appendFileSync('./events.log', 'init\\n'); },",
        "  shutdown() { fs.appendFileSync('./events.log', 'shutdown\\n'); },",
        '};',
        '',
      ].join('\n'),
    );
    writeProjectFile(
      dir,
      'preload.cjs',
      [
        "const fs = require('node:fs');",
        'const originalOnce = process.once;',
        'process.once = function patchedOnce(event, listener) {',
        "  if (event === 'SIGINT' || event === 'SIGTERM') fs.appendFileSync('./signals.log', `${event}\\n`);",
        '  return originalOnce.call(this, event, listener);',
        '};',
        '',
      ].join('\n'),
    );
    const port = await getFreePort();
    const running = spawnCli(
      ['start', './dist/app.js', '--port', String(port), '--host', '127.0.0.1', '--require', './preload.cjs'],
      dir,
    );

    try {
      await running.waitForStdout('Server running');
      running.child.kill('SIGTERM');
      const result = await running.waitForExit();

      assertSubprocessResult(result, { exitCode: 0, signal: null, timedOut: false });
      expect(readLines(join(dir, 'signals.log')).sort()).toEqual(['SIGINT', 'SIGTERM']);
      expect(readLines(join(dir, 'events.log'))).toEqual(['init', 'shutdown']);
    } finally {
      await stopChild(running.child);
    }
  }, 15_000);
});
