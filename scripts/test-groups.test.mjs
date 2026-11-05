import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runTestGroups, testGroups, validateTestGroups } from './test-groups.mjs';

function workspace(name, fields = {}) {
  return [name, { name, scripts: { test: 'pnpm build && vitest run' }, ...fields }];
}

test('accepts independent packages in parallel and shared dependencies across sequential groups', () => {
  const workspaces = new Map([
    workspace('shared'),
    workspace('a', { dependencies: { shared: 'workspace:*' } }),
    workspace('b', { dependencies: { shared: 'workspace:*' } }),
    workspace('independent'),
    workspace('no-tests', { scripts: { build: 'tsup' } }),
  ]);
  validateTestGroups(workspaces, { 1: ['shared', 'independent'], 2: ['a'], 3: ['b'] });
});

test('requires every tested workspace exactly once', () => {
  const workspaces = new Map([workspace('a'), workspace('b')]);
  assert.throws(() => validateTestGroups(workspaces, { 1: ['a'] }), /missing from test groups: b/);
  assert.throws(() => validateTestGroups(workspaces, { 1: ['a', 'b'], 2: ['a'] }), /multiple test groups: a/);
  assert.throws(
    () => validateTestGroups(workspaces, { 1: ['a', 'b', 'unknown'] }),
    /No workspace test script for unknown/,
  );
  assert.throws(() => validateTestGroups(workspaces, { 1: ['a', 'b'], 2: [] }), /group 2 is empty/);
});

for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
  test(`rejects transitive build conflicts through ${field}`, () => {
    const workspaces = new Map([
      workspace('shared', { scripts: { build: 'tsup' } }),
      workspace('middle', { scripts: { build: 'tsup' }, [field]: { shared: 'workspace:*' } }),
      workspace('a', { [field]: { middle: 'workspace:*' } }),
      workspace('b', { dependencies: { shared: 'workspace:*' } }),
    ]);
    assert.throws(() => validateTestGroups(workspaces, { 1: ['a', 'b'] }), /build\/read conflicts: shared/);
  });
}

test('handles dependency cycles and ignores non-workspace dependencies', () => {
  const workspaces = new Map([
    workspace('a', { dependencies: { b: 'workspace:*', external: '^1.0.0' } }),
    workspace('b', { dependencies: { a: 'workspace:*' } }),
  ]);
  validateTestGroups(workspaces, { 1: ['a'], 2: ['b'] });
});

test('rejects unresolved workspace dependencies', () => {
  const workspaces = new Map([workspace('a', { dependencies: { missing: 'workspace:*' } })]);
  assert.throws(() => validateTestGroups(workspaces, { 1: ['a'] }), /Unknown workspace dependency missing in a/);
});

test('allows shared read-only consumers but rejects a concurrent dependency rebuild', () => {
  const workspaces = new Map([
    workspace('shared'),
    workspace('a', { scripts: { test: 'vitest run' }, dependencies: { shared: 'workspace:*' } }),
    workspace('b', { scripts: { test: 'vitest run' }, dependencies: { shared: 'workspace:*' } }),
  ]);
  const overrides = { a: { readOnlyTest: 'vitest run' }, b: { readOnlyTest: 'vitest run' } };
  validateTestGroups(workspaces, { 1: ['shared'], 2: ['a', 'b'] }, overrides);
  assert.throws(
    () => validateTestGroups(workspaces, { 1: ['a', 'shared'], 2: ['b'] }, overrides),
    /build\/read conflicts: shared/,
  );
  assert.throws(
    () => validateTestGroups(workspaces, { 1: ['a'], 2: ['shared', 'b'] }, overrides),
    /build\/read conflicts: shared/,
  );
});

test('requires review if a read-only consumer starts rebuilding', () => {
  assert.throws(
    () => validateTestGroups(new Map([workspace('a')]), { 1: ['a'] }, { a: { readOnlyTest: 'vitest run' } }),
    /read-only test override for a/,
  );
});

test('accounts for undeclared fixture reads and their transitive runtime dependencies', () => {
  const workspaces = new Map([
    workspace('runtime', { scripts: { build: 'tsup' }, dependencies: { shared: 'workspace:*' } }),
    workspace('shared'),
    workspace('a'),
  ]);
  assert.throws(
    () => validateTestGroups(workspaces, { 1: ['a', 'shared'] }, { a: { reads: ['runtime'] } }),
    /build\/read conflicts: shared/,
  );
});

test('accounts for builds inside tests and rejects stale overrides', () => {
  const workspaces = new Map([workspace('a'), workspace('b')]);
  assert.throws(
    () => validateTestGroups(workspaces, { 1: ['a', 'b'] }, { a: { writes: ['b'] } }),
    /build\/read conflicts: b/,
  );
  assert.throws(
    () => validateTestGroups(workspaces, { 1: ['a', 'b'] }, { removed: { reads: ['a'] } }),
    /Unused test access override: removed/,
  );
});

test('runs numbered groups in order with parallel members and waits for all members', () => {
  const calls = [];
  const status = runTestGroups(
    { 2: ['c'], 1: ['a', 'b'] },
    (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0 };
    },
    () => {},
  );
  assert.equal(status, 0);
  assert.deepEqual(
    calls.map(({ command }) => command),
    ['pnpm', 'pnpm'],
  );
  assert.deepEqual(calls[0].args, ['-r', '--parallel', '--no-bail', '--filter', 'a', '--filter', 'b', 'run', 'test']);
  assert.deepEqual(calls[1].args, ['-r', '--parallel', '--no-bail', '--filter', 'c', 'run', 'test']);
  assert.equal(calls[0].options.stdio, 'inherit');
});

test('stops before the next group on failure or signal', () => {
  for (const result of [{ status: 42 }, { status: null, signal: 'SIGTERM' }]) {
    let calls = 0;
    const status = runTestGroups(
      { 1: ['a', 'b'], 2: ['c'] },
      () => {
        calls += 1;
        return result;
      },
      () => {},
    );
    assert.equal(calls, 1);
    assert.equal(status, result.status ?? 1);
  }
});

test('propagates a failed pnpm spawn', () => {
  assert.throws(
    () =>
      runTestGroups(
        { 1: ['a'] },
        () => ({ error: new Error('spawn failed') }),
        () => {},
      ),
    /spawn failed/,
  );
});

for (const shouldFail of [false, true]) {
  test(`real pnpm runs members concurrently and ${shouldFail ? 'waits before stopping on failure' : 'advances only after success'}`, (t) => {
    const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
    const root = mkdtempSync(resolve(repositoryRoot, '_tmp-test-groups-fixture-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.equal(spawnSync('git', ['check-ignore', root], { cwd: repositoryRoot }).status, 0);
    writeFileSync(resolve(root, 'package.json'), JSON.stringify({ name: 'test-groups-fixture', private: true }));
    writeFileSync(resolve(root, 'pnpm-workspace.yaml'), 'packages:\n- packages/*\n');
    writeFileSync(
      resolve(root, 'worker.mjs'),
      `import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
const root = resolve(process.cwd(), '../..');
const name = basename(process.cwd());
const record = (event) => appendFileSync(resolve(root, 'events'), name + ':' + event + '\\n');
record('start');
writeFileSync(resolve(root, name + '.started'), '');
if (name !== 'c') {
  const deadline = Date.now() + 5000;
  while (!existsSync(resolve(root, (name === 'a' ? 'b' : 'a') + '.started'))) {
    if (Date.now() > deadline) throw new Error('Group members did not start concurrently');
    await setTimeout(10);
  }
}
if (name === 'b') await setTimeout(150);
record('end');
if (process.env.GROUP_FIXTURE_FAIL === name) process.exitCode = 9;
`,
    );
    for (const name of ['a', 'b', 'c']) {
      const directory = resolve(root, 'packages', name);
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        resolve(directory, 'package.json'),
        JSON.stringify({ name, private: true, scripts: { test: 'node ../../worker.mjs' } }),
      );
    }
    const outputs = [];
    const status = runTestGroups(
      { 1: ['a', 'b'], 2: ['c'] },
      (command, args, options) => {
        const result = spawnSync(command, args, {
          ...options,
          cwd: root,
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 15_000,
          env: { ...process.env, TMPDIR: root, GROUP_FIXTURE_FAIL: shouldFail ? 'a' : '' },
        });
        outputs.push(result.stdout, result.stderr);
        return result;
      },
      () => {},
    );
    assert.equal(status === 0, !shouldFail, outputs.join('\n'));
    const events = readFileSync(resolve(root, 'events'), 'utf8').trim().split('\n');
    assert.deepEqual(new Set(events.slice(0, 2)), new Set(['a:start', 'b:start']));
    assert.deepEqual(new Set(events.slice(2, 4)), new Set(['a:end', 'b:end']));
    assert.deepEqual(events.slice(4), shouldFail ? [] : ['c:start', 'c:end']);
  });
}

test('root scripts preserve serial tests and expose every configured group', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(scripts.test, 'pnpm -r --if-present --workspace-concurrency=1 test');
  assert.equal(scripts['test:grouped'], 'pnpm test:groups:check && node scripts/test-groups.mjs');
  assert.equal(
    scripts['test:groups:check'],
    'node --test scripts/test-groups.test.mjs && node scripts/test-groups.mjs --check',
  );
  for (const group of Object.keys(testGroups)) {
    assert.equal(scripts[`test:group:${group}`], `node scripts/test-groups.mjs ${group}`);
    assert.ok(testGroups[group].length > 1, `Group ${group} should contain multiple packages`);
  }
  assert.equal(
    Object.keys(scripts).filter((name) => name.startsWith('test:group:')).length,
    Object.keys(testGroups).length,
  );
});
