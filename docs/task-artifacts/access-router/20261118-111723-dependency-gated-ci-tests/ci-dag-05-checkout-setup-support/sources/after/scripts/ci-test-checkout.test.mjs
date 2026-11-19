import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import {
  assertCheckoutBudget,
  assertNormalizedPath,
  checkoutRootMaxBytes,
  checkoutTmpdirMaxBytes,
  claimCheckout,
  checkoutRelationship,
  cleanupCheckout,
  parseTreeListing,
  rejectNpmrc,
  runAction,
  runMain,
  selectCheckoutRoot,
  transferSelectedSource,
  verifyInstallerState,
} from '../.github/actions/ci-checkout/index.mjs';
import { assertSocketSafeTmpdir, resourceTmpdirMaxBytes } from './ci-test-workspace.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const action = (name) =>
  parseDocument(readFileSync(resolve(repositoryRoot, `.github/actions/${name}/action.yml`), 'utf8')).toJS();
const workflow = () =>
  parseDocument(readFileSync(resolve(repositoryRoot, '.github/workflows/test.yml'), 'utf8')).toJS();
const mainJobs = () =>
  Object.entries(workflow().jobs).filter(
    ([id]) => !['lint', 'access-router-minimum-node-smoke', 'access-router-react-minimum-node'].includes(id),
  );

function scratch(t) {
  const root = mkdtempSync(resolve(repositoryRoot, '_tmp-ci-checkout-'));
  assert.equal(spawnSync('git', ['check-ignore', relative(repositoryRoot, root)], { cwd: repositoryRoot }).status, 0);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(root, path, bytes) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}

function bindingFixture(t) {
  const parent = scratch(t);
  const original = join(parent, 'original');
  const selected = join(parent, 'c');
  for (const [root, marker] of [
    [original, 'original'],
    [selected, 'selected'],
  ]) {
    write(root, '.tool-versions', marker);
    write(root, 'package.json', JSON.stringify({ packageManager: marker }));
    write(
      root,
      'scripts/sentinel.mjs',
      `console.log(JSON.stringify({ origin: '${marker}', cwd: process.cwd(), tmpdir: process.env.TMPDIR }));`,
    );
  }
  const tmpdir = join(selected, '_tmpABC123');
  const dest = join(selected, '_tmp-pnpm-ABC123');
  const defaultTmpdir = join(parent, 'unbound-runner-temp');
  const runnerTemp = join(parent, 'artifact-service-temp');
  for (const path of [tmpdir, dest, defaultTmpdir, runnerTemp]) mkdirSync(path, { mode: 0o700 });
  return { original, selected, tmpdir, dest, defaultTmpdir, runnerTemp, relative: '../c' };
}

function evaluate(value, context) {
  if (typeof value !== 'string') return value;
  return value.replace(/\$\{\{ ([^}]+) \}\}/g, (_match, key) => {
    if (key === 'toJSON(needs)') return '{}'; // Result policy is tested independently, not executed here.
    let result = context;
    for (const part of key.split('.')) {
      assert.ok(result && Object.hasOwn(result, part), `Missing modeled binding: ${key}`);
      result = result[part];
    }
    return result;
  });
}

// Model inspected action file joins and composite input/environment inheritance.
// Source/helper/installer/cache commands are NOT run. Each modeled project shell
// is replaced by a harmless selected/original module sentinel at its effective cwd.
function modelJob(job, fixture) {
  const observations = { shells: [], node: [], pnpm: [], local: [], downloads: [] };
  const sourceOutputs = {
    root: fixture.selected,
    'relative-root': fixture.relative,
    tmpdir: fixture.tmpdir,
    'pnpm-dest': fixture.dest,
  };
  const walk = (steps, inputs, inherited, scope) => {
    const context = {
      inputs,
      github: { workspace: fixture.original, sha: 'a'.repeat(40) },
      runner: { temp: fixture.runnerTemp },
      steps: {
        source: { outputs: sourceOutputs },
        artifacts: { outputs: { 'download-path': join(fixture.runnerTemp, 'ci-test-artifacts') } },
        restore: {
          outputs: {
            'resource-directory': join(fixture.selected, '_tmpResourceModel'),
            'browser-path': join(fixture.selected, '_tmpBrowserModel'),
            'browser-key': 'synthetic-browser',
            'mongo-path': join(fixture.selected, '_tmpMongoModel'),
            'mongo-key': 'synthetic-mongo',
          },
        },
        'browser-cache': { outputs: { 'cache-hit': 'false' } },
        'mongo-cache': { outputs: { 'cache-hit': 'false' } },
        prepare: {
          outputs: {
            'artifact-name': 'synthetic-artifact',
            'artifact-path': join(fixture.selected, '_tmpArchiveModel'),
          },
        },
      },
      needs: {
        'ci-prepare': { outputs: { 'artifact-name': 'synthetic-artifact', 'artifact-digest': 'd'.repeat(64) } },
      },
    };
    for (const step of steps) {
      const env = {
        ...inherited,
        ...Object.fromEntries(Object.entries(step.env ?? {}).map(([key, value]) => [key, evaluate(value, context)])),
      };
      const supplied = Object.fromEntries(
        Object.entries(step.with ?? {}).map(([key, value]) => [key, evaluate(value, context)]),
      );
      if (step.run)
        observations.shells.push({
          run: step.run,
          cwd: evaluate(step['working-directory'], context) ?? fixture.original,
          env,
          scope,
        });
      if (step.uses?.startsWith('actions/setup-node@'))
        observations.node.push({
          path: join(fixture.original, supplied['node-version-file']),
          cwd: fixture.original,
          with: supplied,
          env,
        });
      if (step.uses?.startsWith('pnpm/action-setup@'))
        observations.pnpm.push({
          path: join(fixture.original, supplied.package_json_file),
          cwd: supplied.dest,
          with: supplied,
          env,
        });
      if (step.uses?.startsWith('actions/download-artifact@')) observations.downloads.push(supplied);
      if (step.uses?.startsWith('./.github/actions/')) {
        const name = step.uses.split('/').at(-1);
        const metadata = action(name);
        observations.local.push({ path: resolve(fixture.original, step.uses), scope });
        if (metadata.runs.using === 'composite') {
          for (const key of Object.keys(metadata.inputs))
            assert.ok(Object.hasOwn(supplied, key), `Missing forwarded ${key} in ${name}`);
          walk(metadata.runs.steps, supplied, env, `${scope}/${name}`);
        }
      }
    }
  };
  walk(job.steps, {}, { TMPDIR: fixture.defaultTmpdir }, 'main');
  return observations;
}

function assertModeledBindings(observations, fixture) {
  for (const shell of observations.shells) {
    assert.equal(shell.cwd, fixture.selected, shell.run);
    assert.equal(shell.env.TMPDIR, fixture.tmpdir, `${shell.scope}: ${shell.run}`);
  }
  for (const node of observations.node) {
    assert.equal(readFileSync(node.path, 'utf8'), 'selected');
    assert.equal(node.with['package-manager-cache'], false);
    assert.equal(node.with.cache, undefined);
    assert.equal(node.cwd, fixture.original); // Inspected action-internal diagnostics, not a project shell.
  }
  for (const pnpm of observations.pnpm) {
    assert.equal(JSON.parse(readFileSync(pnpm.path, 'utf8')).packageManager, 'selected');
    assert.equal(pnpm.cwd, fixture.dest);
    assert.equal(pnpm.with.run_install, false);
    assert.equal(pnpm.with.cache, false);
    assert.equal(pnpm.env.TMPDIR, fixture.tmpdir);
  }
  for (const local of observations.local) assert.ok(local.path.startsWith(join(fixture.original, '.github/actions/')));
}

test('wiring: setup-node effectively reads the selected version pin, not the original workspace', (t) => {
  const fixture = bindingFixture(t);
  const [node] = modelJob(workflow().jobs['ci-validate'], fixture).node;
  // Model the inspected action's path.join(GITHUB_WORKSPACE, file input), not shell cwd.
  assert.equal(readFileSync(node.path, 'utf8'), 'selected');
  assert.equal(node.with['package-manager-cache'], false);
  assert.equal(node.with.cache, undefined);
});

test('wiring: pnpm effectively reads the selected manifest and receives only the fresh owned destination', (t) => {
  const fixture = bindingFixture(t);
  const [pnpm] = modelJob(workflow().jobs['ci-validate'], fixture).pnpm;
  assert.equal(JSON.parse(readFileSync(pnpm.path, 'utf8')).packageManager, 'selected');
  assert.equal(pnpm.cwd, fixture.dest);
  assert.equal(pnpm.with.run_install, false);
  assert.equal(pnpm.with.cache, false);
});

test('wiring: every main project shell resolves the selected module, cwd and TMPDIR', (t) => {
  const fixture = bindingFixture(t);
  for (const [id, job] of mainJobs()) {
    const observations = modelJob(job, fixture);
    assertModeledBindings(observations, fixture);
    for (const shell of observations.shells) {
      const result = spawnSync(process.execPath, ['scripts/sentinel.mjs'], {
        cwd: shell.cwd,
        env: { PATH: process.env.PATH, ...shell.env },
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(
        JSON.parse(result.stdout),
        { origin: 'selected', cwd: fixture.selected, tmpdir: fixture.tmpdir },
        `${id}: ${shell.run}`,
      );
    }
    for (const download of observations.downloads)
      assert.equal(download.path, join(fixture.runnerTemp, 'ci-test-artifacts'));
  }
});

test('wiring: all 28 main jobs retain the original SHA checkout then register a top-level source action', () => {
  const jobs = mainJobs();
  assert.equal(jobs.length, 28);
  for (const [id, job] of jobs) {
    assert.deepEqual(
      job.steps[0],
      { uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', with: { ref: '${{ github.sha }}' } },
      id,
    );
    assert.deepEqual(job.steps[1], { id: 'source', uses: './.github/actions/ci-checkout' }, id);
  }
});

test('wiring: source metadata declares dependency-free node20 main/post and always cleanup, not a composite deletion', () => {
  const path = resolve(repositoryRoot, '.github/actions/ci-checkout/action.yml');
  const metadata = existsSync(path) ? action('ci-checkout') : {};
  assert.deepEqual(metadata.runs, { using: 'node20', main: 'index.mjs', post: 'index.mjs', 'post-if': 'always()' });
  assert.deepEqual(Object.keys(metadata.outputs).sort(), ['pnpm-dest', 'relative-root', 'root', 'tmpdir']);
  assert.equal(metadata.inputs, undefined);
});

function fixtureGit(root, args, input) {
  const result = spawnSync('git', ['--no-optional-locks', '-c', 'init.defaultBranch=fixture', ...args], {
    cwd: root,
    input,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      TMPDIR: process.env.TMPDIR,
      LANG: 'C',
      LC_ALL: 'C',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Synthetic Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Synthetic Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      GIT_AUTHOR_DATE: '2026-11-19T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-11-19T00:00:00Z',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function sourceFixture(t, { files: overrides = {}, omit = [], prepare = () => {} } = {}) {
  const parent = scratch(t);
  const original = join(parent, 'original');
  mkdirSync(original);
  fixtureGit(original, ['init', '--template=', '--object-format=sha1']);
  const files = {
    '.gitignore': '_tmp*\nnode_modules\ndist\ncoverage\n',
    '.tool-versions': 'nodejs 26.12.1\npnpm 11.24.0\n',
    '.gitattributes': '*.txt filter=fixture\n',
    'package.json': '{"name":"synthetic-source-only","private":true,"packageManager":"pnpm@11.24.0"}\n',
    'pnpm-lock.yaml': "lockfileVersion: '9.0'\nimporters: {}\n",
    'pnpm-workspace.yaml': 'packages: []\n',
    '.hidden': 'hidden\n',
    empty: '',
    'nested/utf8-é.txt': 'raw UTF-8: 한글\n',
    'nested/binary': Buffer.from([0, 1, 2, 255, 13, 10]),
    executable: '#!/bin/sh\nexit 0\n',
    ...overrides,
  };
  for (const path of omit) delete files[path];
  for (const [path, bytes] of Object.entries(files)) {
    write(original, path, bytes);
    chmodSync(join(original, path), 0o644);
  }
  chmodSync(join(original, 'executable'), 0o755);
  prepare(original);
  fixtureGit(original, ['add', '--all']);
  const tree = fixtureGit(original, ['write-tree']);
  const emptyTree = fixtureGit(original, ['mktree'], '');
  const parents = [
    fixtureGit(original, ['commit-tree', emptyTree], 'parent one\n'),
    fixtureGit(original, ['commit-tree', emptyTree], 'parent two\n'),
  ];
  const sha = fixtureGit(original, ['commit-tree', tree, '-p', parents[0], '-p', parents[1]], 'selected merge\n');
  const unrelated = fixtureGit(
    original,
    ['hash-object', '-w', '--stdin'],
    'SYNTHETIC_UNREFERENCED_PRIVATE_OBJECT_NOT_A_SECRET\n',
  );
  fixtureGit(original, ['update-ref', 'refs/heads/unrelated-fixture', parents[0]]);
  write(original, '.git/HEAD', sha + '\n');
  const config = readFileSync(join(original, '.git/config'), 'utf8');
  // Public synthetic sentinels only: the transfer must never consume this config/hook.
  write(
    original,
    '.git/config',
    config +
      '[remote "origin"]\n\turl = https://fixture.invalid/SYNTHETIC_NOT_A_SECRET\n[http]\n\textraheader = SYNTHETIC_NOT_A_CREDENTIAL\n[filter "fixture"]\n\tclean = touch FORBIDDEN_FILTER_SENTINEL\n\tsmudge = touch FORBIDDEN_FILTER_SENTINEL\n',
  );
  write(original, '.git/hooks/post-checkout', '#!/bin/sh\ntouch FORBIDDEN_HOOK_SENTINEL\n');
  chmodSync(join(original, '.git/hooks/post-checkout'), 0o755);
  write(original, '.git/info/exclude', 'synthetic-private-exclude\n');
  return { parent, original, sha, parents, unrelated, files };
}

function fingerprintTree(root) {
  const files = {};
  const visit = (directory, prefix = '') => {
    for (const name of readdirSync(directory)) {
      const path = prefix ? `${prefix}/${name}` : name;
      const target = join(root, path);
      const info = lstatSync(target);
      const base = { mode: info.mode & 0o777, dev: info.dev, ino: info.ino, nlink: info.nlink };
      if (info.isDirectory()) {
        files[path] = { ...base, kind: 'directory' };
        visit(target, path);
      } else if (info.isSymbolicLink()) files[path] = { ...base, kind: 'symlink', target: readlinkSync(target) };
      // Even fixture fingerprinting does not inspect root .npmrc contents.
      else if (path === '.npmrc') files[path] = { ...base, kind: 'presence-only', bytes: info.size };
      else if (info.isFile())
        files[path] = {
          ...base,
          kind: 'file',
          bytes: info.size,
          sha256: createHash('sha256').update(readFileSync(target)).digest('hex'),
        };
      else files[path] = { ...base, kind: 'nonregular' };
    }
  };
  visit(root);
  return files;
}

test('real fixture: selected-only merge closure passes strict import and connectivity without history or private metadata', (t) => {
  const fixture = sourceFixture(t);
  const before = fingerprintTree(fixture.original);
  const states = [];
  const state = claimCheckout(checkoutRelationship(fixture.original), (value) => states.push(structuredClone(value)));
  const commands = [];
  const result = transferSelectedSource(state, fixture.sha, {
    run: (command, args, options) => {
      commands.push({ command, args, env: options.env });
      return spawnSync(command, args, options);
    },
  });
  assert.deepEqual(fingerprintTree(fixture.original), before);
  assert.equal(result.sha, fixture.sha);
  assert.ok(commands.some(({ args }) => args.slice(-3).join(' ') === 'index-pack --stdin --fsck-objects'));
  assert.ok(commands.some(({ args }) => args.slice(-4).join(' ') === 'fsck --strict --full --no-reflogs'));
  assert.ok(
    commands.every(
      ({ env }) =>
        env.GIT_CONFIG_GLOBAL === '/dev/null' && env.GIT_NO_REPLACE_OBJECTS === '1' && env.GIT_ALLOW_PROTOCOL === '',
    ),
  );
  assert.ok(!result.objectIds.includes(fixture.unrelated));
  for (const parent of fixture.parents) assert.ok(!result.objectIds.includes(parent));
  const raw = fixtureGit(state.root, ['cat-file', 'commit', fixture.sha]);
  for (const parent of fixture.parents) assert.ok(raw.includes(`parent ${parent}\n`));
  assert.equal(readFileSync(join(state.root, '.git/shallow'), 'utf8'), fixture.sha + '\n');
  assert.equal(fixtureGit(state.root, ['status', '--porcelain=v1']), '');
  assert.equal(fixtureGit(state.root, ['remote']), '');
  assert.doesNotMatch(readFileSync(join(state.root, '.git/config'), 'utf8'), /SYNTHETIC|fixture.invalid|extraheader/);
  assert.equal(existsSync(join(state.root, '.git/hooks')), false);
  assert.equal(existsSync(join(state.root, 'FORBIDDEN_FILTER_SENTINEL')), false);
  for (const [path, bytes] of Object.entries(fixture.files)) {
    assert.deepEqual(readFileSync(join(state.root, path)), Buffer.from(bytes));
    const selected = lstatSync(join(state.root, path));
    const original = lstatSync(join(fixture.original, path));
    assert.equal(selected.nlink, 1);
    assert.ok(selected.dev !== original.dev || selected.ino !== original.ino);
    assert.equal(selected.mode & 0o777, path === 'executable' ? 0o755 : 0o644);
  }
  assert.deepEqual(
    states.map((value) => value.phase),
    ['allocating', 'allocating', 'allocating', 'allocating', 'owned'],
  );
  verifyInstallerState(state);
  cleanupCheckout(state);
  assert.equal(existsSync(state.root), false);
  assert.deepEqual(fingerprintTree(fixture.original), before);
});

test('modeled arithmetic: representative 47-byte original becomes only the fixed 34-byte sibling', () => {
  const parent = `/${'p'.repeat(31)}`;
  const original = `${parent}/${'r'.repeat(14)}`;
  const selected = join(dirname(original), 'c');
  assert.equal(Buffer.byteLength(original), 47);
  assert.equal(Buffer.byteLength(selected), 34);
  assert.throws(() => assertCheckoutBudget(original), /47 UTF-8 bytes/);
  assert.equal(assertCheckoutBudget(selected), selected);
  assertSocketSafeTmpdir(join(selected, '_tmpABC123'));
  assert.equal(checkoutRootMaxBytes, resourceTmpdirMaxBytes - 11);
  assert.equal(checkoutTmpdirMaxBytes, resourceTmpdirMaxBytes);
  assert.equal(resourceTmpdirMaxBytes, 107 - 40 - 22);
});

for (const [name, root, bytes, accepted] of [
  ['ASCII maximum', `/${'a'.repeat(31)}/c`, 34, true],
  ['ASCII one over', `/${'a'.repeat(32)}/c`, 35, false],
  ['two-byte maximum', `/a${'é'.repeat(15)}/c`, 34, true],
  ['two-byte one over', `/${'é'.repeat(16)}/c`, 35, false],
  ['three-byte maximum', `/${'한'.repeat(10)}a/c`, 34, true],
  ['three-byte one over', `/${'한'.repeat(10)}ab/c`, 35, false],
]) {
  test(`modeled arithmetic with native UTF-8 measurement: ${name}`, () => {
    assert.equal(Buffer.byteLength(root, 'utf8'), bytes);
    if (accepted) {
      assert.equal(assertCheckoutBudget(root), root);
      assertSocketSafeTmpdir(join(root, '_tmpABC123'));
    } else {
      assert.throws(() => assertCheckoutBudget(root), /maximum is 34/);
      assert.throws(() => assertSocketSafeTmpdir(join(root, '_tmpABC123')), /at most 45/);
    }
  });
}

for (const path of [
  undefined,
  null,
  7,
  {},
  [],
  '',
  'relative/c',
  '/a/../c',
  '/a/./c',
  '/a//c',
  '/a/',
  '/c\0suffix',
  '/c\r',
  '/c\n',
]) {
  test(`path normalization rejects ${JSON.stringify(path)}`, () => {
    assert.throws(() => assertNormalizedPath(path), /normalized absolute Linux path/);
  });
}

test('native deep fixture: full main rejects the actual over-budget sibling before allocation or Git', (t) => {
  const fixture = sourceFixture(t);
  const before = fingerprintTree(fixture.parent);
  assert.ok(Buffer.byteLength(join(fixture.parent, 'c')) > checkoutRootMaxBytes);
  assert.throws(() => selectCheckoutRoot(fixture.original), /maximum is 34/);
  const saved = [];
  const outputs = [];
  const env = {
    ...process.env,
    GITHUB_WORKSPACE: fixture.original,
    GITHUB_SHA: fixture.sha,
    RUNNER_TEMP: join(fixture.parent, 'unused-runner-temp'),
  };
  const originalEnv = { ...env };
  assert.throws(
    () =>
      runMain(env, {
        save: (state) => saved.push(structuredClone(state)),
        output: (value) => outputs.push(value),
        run: () => assert.fail('No Git/tool/resource command may run before native selection succeeds'),
      }),
    /maximum is 34/,
  );
  assert.deepEqual(env, originalEnv);
  assert.deepEqual(outputs, []);
  assert.ok(saved.every((state) => state.version === 1 && state.phase === 'empty'));
  assert.deepEqual(fingerprintTree(fixture.parent), before);
  runAction(
    { STATE_ci_checkout: JSON.stringify(saved.at(-1)) },
    { run: () => assert.fail('Empty post must be a no-op') },
  );
  assert.deepEqual(fingerprintTree(fixture.parent), before);
});

test('real parent rejects filesystem-root parent, reserved original c, writable parent and symlink components', (t) => {
  const parent = scratch(t);
  const original = join(parent, 'original');
  mkdirSync(original);
  assert.throws(() => checkoutRelationship('/'), /Unsupported CI checkout parent/);
  mkdirSync(join(parent, 'c'));
  assert.throws(() => checkoutRelationship(join(parent, 'c')), /reserved sibling c/);
  chmodSync(parent, 0o720);
  assert.throws(() => checkoutRelationship(original), /owned and not group\/world writable/);
  chmodSync(parent, 0o700);
  const alias = join(parent, 'alias');
  symlinkSync(original, alias);
  assert.throws(() => checkoutRelationship(alias), /nonsymlink directory components/);
  symlinkSync(parent, join(parent, 'parent-alias'));
  assert.throws(
    () => checkoutRelationship(join(parent, 'parent-alias', 'original')),
    /nonsymlink directory components/,
  );
});

for (const kind of ['file', 'directory', 'symlink', 'dangling symlink']) {
  test(`real exclusive claim retains an existing ${kind} collision without fallback`, (t) => {
    const parent = scratch(t);
    const original = join(parent, 'original');
    const root = join(parent, 'c');
    mkdirSync(original);
    if (kind === 'file') writeFileSync(root, 'EXISTING_SYNTHETIC_COLLISION\n');
    if (kind === 'directory') write(root, 'existing', 'EXISTING_SYNTHETIC_COLLISION\n');
    if (kind === 'symlink') symlinkSync(original, root);
    if (kind === 'dangling symlink') symlinkSync(join(parent, 'missing'), root);
    const before = fingerprintTree(parent);
    assert.throws(
      () => claimCheckout(checkoutRelationship(original), () => assert.fail('Collision must not save owned state')),
      /EEXIST/,
    );
    assert.deepEqual(fingerprintTree(parent), before);
  });
}

for (const key of [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_INDEX_FILE',
  'GIT_CONFIG',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_KEY_0',
  'GIT_SHALLOW_FILE',
  'GIT_REPLACE_REF_BASE',
  'GIT_NAMESPACE',
  'GIT_EXEC_PATH',
  'GIT_TEMPLATE_DIR',
]) {
  test(`main rejects ambient ${key} before claiming or exporting a root`, (t) => {
    const parent = scratch(t);
    const saved = [];
    assert.throws(
      () =>
        runMain(
          {
            PATH: process.env.PATH,
            GITHUB_WORKSPACE: parent,
            GITHUB_SHA: 'a'.repeat(40),
            [key]: 'SYNTHETIC_ROUTING_NOT_A_SECRET',
          },
          {
            save: (value) => saved.push(structuredClone(value)),
            output: () => assert.fail('Routing failure must not publish outputs'),
            run: () => assert.fail('Routing failure must not launch Git'),
          },
        ),
      /Ambient Git repository\/config routing/,
    );
    assert.ok(saved.every((value) => value.phase === 'empty'));
    assert.deepEqual(readdirSync(parent), []);
  });
}

for (const sha of [
  undefined,
  null,
  7,
  [],
  'a'.repeat(39),
  'a'.repeat(41),
  'A'.repeat(40),
  `${'a'.repeat(40)}\n`,
  'g'.repeat(40),
]) {
  test(`main rejects malformed event SHA ${JSON.stringify(sha)} without a source/tool command`, (t) => {
    const parent = scratch(t);
    assert.throws(
      () =>
        runMain(
          { GITHUB_WORKSPACE: parent, GITHUB_SHA: sha },
          {
            save: () => {},
            output: () => assert.fail('Malformed SHA must not publish outputs'),
            run: () => assert.fail('Malformed SHA must not launch Git'),
          },
        ),
      /exact lowercase 40-hex event SHA/,
    );
    assert.deepEqual(readdirSync(parent), []);
  });
}

for (const kind of ['unreadable file', 'directory', 'dangling symlink']) {
  test(`presence-only npmrc: main rejects original ${kind} before selection or content reads`, (t) => {
    const parent = scratch(t);
    const original = join(parent, 'original');
    mkdirSync(original);
    const npmrc = join(original, '.npmrc');
    if (kind === 'unreadable file') {
      writeFileSync(npmrc, 'SYNTHETIC_NOT_A_CREDENTIAL\n');
      chmodSync(npmrc, 0o000);
    }
    if (kind === 'directory') mkdirSync(npmrc);
    if (kind === 'dangling symlink') symlinkSync(join(parent, 'missing'), npmrc);
    assert.throws(
      () =>
        runMain(
          { GITHUB_WORKSPACE: original, GITHUB_SHA: 'a'.repeat(40) },
          {
            save: () => {},
            output: () => assert.fail('npmrc rejection must not publish outputs'),
            run: () => assert.fail('npmrc rejection precedes source-content reads/transfer'),
          },
        ),
      /Root .npmrc is unsupported/,
    );
    assert.equal(existsSync(join(parent, 'c')), false);
    assert.equal(lstatSync(npmrc).isSymbolicLink(), kind === 'dangling symlink');
  });
}

const listingEntry = (path, mode = '100644', type = 'blob', oid = 'a'.repeat(40)) =>
  Buffer.concat([
    Buffer.from(`${mode} ${type} ${oid}\t`),
    Buffer.isBuffer(path) ? path : Buffer.from(path),
    Buffer.from([0]),
  ]);
for (const [name, bytes, pattern] of [
  ['symlink', listingEntry('link', '120000'), /mode\/type/],
  ['gitlink', listingEntry('module', '160000', 'commit'), /mode\/type/],
  ['wrong mode/type pair', listingEntry('tree', '040000', 'blob'), /mode\/type/],
  ['non-UTF-8 path', listingEntry(Buffer.from([255])), /non-UTF-8/],
  ['absolute path', listingEntry('/absolute'), /Unsafe/],
  ['traversal path', listingEntry('../outside'), /Unsafe/],
  ['dot component', listingEntry('nested/./file'), /Unsafe/],
  ['double slash', listingEntry('nested//file'), /Unsafe/],
  ['Git administrative path', listingEntry('.Git/config'), /Unsafe/],
  ['newline path', listingEntry('line\nfile'), /Unsafe/],
  ['carriage-return path', listingEntry('line\rfile'), /Unsafe/],
  ['missing parent tree', listingEntry('nested/file'), /parent relationship/],
  ['root scratch', listingEntry('_tmpForbidden'), /scratch/],
  ['root npmrc', listingEntry('.npmrc'), /blob is not read or transferred/],
  ['duplicate path', Buffer.concat([listingEntry('file'), listingEntry('file')]), /duplicate/],
  ['missing final NUL', listingEntry('file').subarray(0, -1), /NUL-delimited/],
  ['empty record', Buffer.concat([listingEntry('file'), Buffer.from([0])]), /NUL-delimited/],
  ['leading empty record', Buffer.concat([Buffer.from([0]), listingEntry('file')]), /NUL-delimited/],
]) {
  test(`tree parser rejects ${name} before any blob transfer`, () =>
    assert.throws(() => parseTreeListing(bytes), pattern));
}

test('tree parser retains hidden, UTF-8/BOM and nested npmrc paths with explicit real parents', () => {
  const entries = parseTreeListing(
    Buffer.concat([
      listingEntry('nested', '040000', 'tree'),
      listingEntry('nested/.npmrc'),
      listingEntry('.hidden'),
      listingEntry('nested/한글-é'),
      listingEntry('\uFEFFhidden'),
    ]),
  );
  assert.deepEqual(
    entries.map((entry) => entry.path),
    ['nested', 'nested/.npmrc', '.hidden', 'nested/한글-é', '\uFEFFhidden'],
  );
});

for (const bytes of [undefined, null, '', [], {}]) {
  test(`tree parser rejects non-Buffer input ${JSON.stringify(bytes)}`, () =>
    assert.throws(() => parseTreeListing(bytes), /NUL-delimited/));
}

const sourceRejections = [
  ['wrong detached HEAD', (f) => write(f.original, '.git/HEAD', f.parents[0] + '\n'), /detached HEAD/],
  ['symbolic HEAD', (f) => write(f.original, '.git/HEAD', 'ref: refs/heads/unrelated-fixture\n'), /detached HEAD/],
  ['CRLF HEAD', (f) => write(f.original, '.git/HEAD', f.sha + '\r\n'), /detached HEAD/],
  [
    'high-bit HEAD',
    (f) => {
      const bytes = Buffer.from(f.sha + '\n');
      bytes[0] |= 128;
      write(f.original, '.git/HEAD', bytes);
    },
    /detached HEAD/,
  ],
  ['malformed index header', (f) => write(f.original, '.git/index', 'NOT_AN_INDEX'), /Malformed original Git index/],
  ['truncated index', (f) => write(f.original, '.git/index', 'DIRC'), /Git ls-files failed/],
  ['missing HEAD', (f) => unlinkSync(join(f.original, '.git/HEAD')), /ENOENT/],
  ['missing index', (f) => unlinkSync(join(f.original, '.git/index')), /ENOENT/],
  [
    'HEAD symlink',
    (f) => {
      renameSync(join(f.original, '.git/HEAD'), join(f.parent, 'held-head'));
      symlinkSync(join(f.parent, 'held-head'), join(f.original, '.git/HEAD'));
    },
    /ELOOP|nonsymlink/,
  ],
  [
    'index symlink',
    (f) => {
      renameSync(join(f.original, '.git/index'), join(f.parent, 'held-index'));
      symlinkSync(join(f.parent, 'held-index'), join(f.original, '.git/index'));
    },
    /ELOOP|nonsymlink/,
  ],
  [
    'gitfile',
    (f) => {
      renameSync(join(f.original, '.git'), join(f.parent, 'held-git'));
      write(f.original, '.git', 'gitdir: ../held-git\n');
    },
    /nonsymlink directory/,
  ],
  [
    'Git directory symlink',
    (f) => {
      renameSync(join(f.original, '.git'), join(f.parent, 'held-git'));
      symlinkSync(join(f.parent, 'held-git'), join(f.original, '.git'));
    },
    /nonsymlink directory/,
  ],
  ['linked worktree marker', (f) => write(f.original, '.git/commondir', '../private\n'), /Linked\/grafted/],
  ['grafts', (f) => write(f.original, '.git/info/grafts', f.sha + '\n'), /Linked\/grafted/],
  ['object alternates', (f) => write(f.original, '.git/objects/info/alternates', '../private\n'), /alternates/],
  [
    'HTTP alternates',
    (f) => write(f.original, '.git/objects/info/http-alternates', 'https://fixture.invalid/not-accessed\n'),
    /alternates/,
  ],
  ['promisor marker', (f) => write(f.original, '.git/objects/pack/synthetic.promisor', ''), /Promisor/],
  [
    'object storage symlink',
    (f) => {
      renameSync(join(f.original, '.git/objects'), join(f.parent, 'held-objects'));
      symlinkSync(join(f.parent, 'held-objects'), join(f.original, '.git/objects'));
    },
    /nonsymlink directory/,
  ],
  [
    'missing selected commit object',
    (f) => unlinkSync(join(f.original, '.git/objects', f.sha.slice(0, 2), f.sha.slice(2))),
    /Missing\/malformed selected Git object/,
  ],
  [
    'selected SHA is a blob',
    (f) => {
      f.sha = f.unrelated;
      write(f.original, '.git/HEAD', f.sha + '\n');
    },
    /event SHA must be a SHA-1 commit/,
  ],
  [
    'loose object symlink',
    (f) => {
      const path = join(f.original, '.git/objects', f.sha.slice(0, 2), f.sha.slice(2));
      renameSync(path, join(f.parent, 'held-object'));
      symlinkSync(join(f.parent, 'held-object'), path);
    },
    /symlink\/nonregular Git object/,
  ],
  ['dirty blob', (f) => write(f.original, 'nested/binary', 'CHANGED_SYNTHETIC_BYTES'), /Dirty source bytes/],
  ['changed executable mode', (f) => chmodSync(join(f.original, 'executable'), 0o644), /executable mode/],
  ['missing committed file', (f) => unlinkSync(join(f.original, '.hidden')), /Missing selected source/],
  [
    'tracked file symlink',
    (f) => {
      unlinkSync(join(f.original, '.hidden'));
      symlinkSync('empty', join(f.original, '.hidden'));
    },
    /Symlink source/,
  ],
  [
    'nonregular tracked file',
    (f) => {
      unlinkSync(join(f.original, '.hidden'));
      mkdirSync(join(f.original, '.hidden'));
    },
    /regular nonsymlink/,
  ],
  [
    'staged different blob',
    (f) => {
      write(f.original, '.hidden', 'STAGED_SYNTHETIC_BYTES');
      fixtureGit(f.original, ['add', '.hidden']);
    },
    /stage-zero tree/,
  ],
  [
    'assume-unchanged index',
    (f) => fixtureGit(f.original, ['update-index', '--assume-unchanged', '.hidden']),
    /Hidden assume-unchanged/,
  ],
  [
    'skip-worktree index',
    (f) => fixtureGit(f.original, ['update-index', '--skip-worktree', '.hidden']),
    /Hidden assume-unchanged/,
  ],
  [
    'ignored dependencies',
    (f) => write(f.original, 'node_modules/synthetic/index.js', 'NOT_TRANSFERABLE'),
    /Unexpected source entry/,
  ],
  [
    'ignored generated output',
    (f) => write(f.original, 'dist/synthetic.js', 'NOT_TRANSFERABLE'),
    /Unexpected source entry/,
  ],
  [
    'ignored cache/scratch',
    (f) => write(f.original, '_tmp-cache/synthetic', 'NOT_TRANSFERABLE'),
    /Unexpected source entry/,
  ],
  ['extra empty directory', (f) => mkdirSync(join(f.original, 'untracked-directory')), /Unexpected source entry/],
];

for (const [name, mutate, pattern] of sourceRejections) {
  test(`real source rejection: ${name} leaves the original untouched and launches no installer`, (t) => {
    const fixture = sourceFixture(t);
    mutate(fixture);
    const before = fingerprintTree(fixture.original);
    const state = claimCheckout(checkoutRelationship(fixture.original));
    const commands = [];
    assert.throws(
      () =>
        transferSelectedSource(state, fixture.sha, {
          run: (command, args, options) => {
            commands.push(args);
            assert.equal(command, 'git');
            return spawnSync(command, args, options);
          },
        }),
      pattern,
    );
    assert.ok(!commands.some((args) => args.includes('pack-objects')));
    assert.deepEqual(fingerprintTree(fixture.original), before);
    cleanupCheckout(state);
    assert.equal(existsSync(state.root), false);
    assert.deepEqual(fingerprintTree(fixture.original), before);
  });
}

test('committed root npmrc is rejected from the tree even when absent from the worktree, before its blob batch/pack', (t) => {
  const fixture = sourceFixture(t, { files: { '.npmrc': 'SYNTHETIC_NOT_A_CREDENTIAL\n' } });
  unlinkSync(join(fixture.original, '.npmrc'));
  const state = claimCheckout(checkoutRelationship(fixture.original));
  const commands = [];
  assert.throws(
    () =>
      transferSelectedSource(state, fixture.sha, {
        run: (command, args, options) => {
          commands.push(args);
          return spawnSync(command, args, options);
        },
      }),
    /Committed root .npmrc.*blob is not read or transferred/,
  );
  assert.equal(commands.filter((args) => args.includes('--batch')).length, 1); // Selected commit only.
  assert.ok(!commands.some((args) => args.includes('pack-objects')));
  cleanupCheckout(state);
});

for (const location of ['original', 'selected']) {
  test(`installer rechecks presence-only ${location} npmrc immediately before a modeled installer`, (t) => {
    const fixture = sourceFixture(t);
    const state = claimCheckout(checkoutRelationship(fixture.original));
    transferSelectedSource(state, fixture.sha);
    verifyInstallerState(state);
    const root = location === 'original' ? fixture.original : state.root;
    symlinkSync(join(fixture.parent, 'missing-credential-file'), join(root, '.npmrc'));
    assert.throws(() => rejectNpmrc(fixture.original, state.root), /Root .npmrc/);
    assert.throws(() => verifyInstallerState(state), /Root .npmrc/);
    cleanupCheckout(state);
    assert.equal(existsSync(state.root), false);
    if (location === 'original') assert.equal(lstatSync(join(root, '.npmrc')).isSymbolicLink(), true);
  });
}

for (const pin of ['.gitignore', '.tool-versions', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
  test(`selected closure requires committed ${pin} before packing`, (t) => {
    const fixture = sourceFixture(t, { omit: [pin] });
    const state = claimCheckout(checkoutRelationship(fixture.original));
    assert.throws(() => transferSelectedSource(state, fixture.sha), /lacks required committed pin\/config/);
    cleanupCheckout(state);
  });
}

test('real committed symlink is rejected before source bytes or pack', (t) => {
  const fixture = sourceFixture(t, { prepare: (root) => symlinkSync('empty', join(root, 'committed-link')) });
  const state = claimCheckout(checkoutRelationship(fixture.original));
  assert.throws(() => transferSelectedSource(state, fixture.sha), /mode\/type.*symlink\/gitlink/);
  cleanupCheckout(state);
});

test('real gitlink is rejected and no submodule/source fetch is attempted', (t) => {
  const fixture = sourceFixture(t);
  fixtureGit(fixture.original, ['update-index', '--add', '--cacheinfo', `160000,${fixture.parents[0]},module`]);
  const tree = fixtureGit(fixture.original, ['write-tree']);
  fixture.sha = fixtureGit(fixture.original, ['commit-tree', tree, '-p', fixture.parents[0]], 'selected gitlink\n');
  write(fixture.original, '.git/HEAD', fixture.sha + '\n');
  const state = claimCheckout(checkoutRelationship(fixture.original));
  assert.throws(() => transferSelectedSource(state, fixture.sha), /mode\/type.*symlink\/gitlink/);
  cleanupCheckout(state);
});

test('committed ignore rules must cover both freshly owned children, without local excludes', (t) => {
  const fixture = sourceFixture(t, { files: { '.gitignore': '' } });
  const state = claimCheckout(checkoutRelationship(fixture.original));
  assert.throws(() => transferSelectedSource(state, fixture.sha), /Git check-ignore failed \(exit 1\)/);
  assert.equal(existsSync(join(state.root, '.git/info/exclude')), false);
  cleanupCheckout(state);
});

const gitOperations = new Set([
  'init',
  'cat-file',
  'ls-tree',
  'ls-files',
  'pack-objects',
  'index-pack',
  'fsck',
  'read-tree',
  'rev-parse',
  'status',
  'check-ignore',
  'remote',
]);
const operation = (args) => args.find((arg) => gitOperations.has(arg));

for (const [name, matches, replacement, pattern] of [
  [
    'initializer exit',
    (args) => operation(args) === 'init',
    () => ({ status: 1, stderr: Buffer.from('synthetic init failure') }),
    /Git init failed.*exit 1/,
  ],
  [
    'producer spawn error',
    (args) => operation(args) === 'pack-objects',
    () => ({ status: null, error: new Error('synthetic spawn failure') }),
    /Git pack-objects failed.*synthetic spawn failure/,
  ],
  [
    'producer signal',
    (args) => operation(args) === 'pack-objects',
    () => ({ status: null, signal: 'SIGTERM' }),
    /Git pack-objects failed.*signal/,
  ],
  [
    'producer exit',
    (args) => operation(args) === 'pack-objects',
    () => ({ status: 1, stderr: Buffer.from('synthetic producer failure') }),
    /Git pack-objects failed.*exit 1/,
  ],
  [
    'import exit',
    (args) => operation(args) === 'index-pack',
    () => ({ status: 1, stderr: Buffer.from('synthetic strict import failure') }),
    /Git index-pack failed.*exit 1/,
  ],
  [
    'strict connectivity exit',
    (args) => operation(args) === 'fsck',
    () => ({ status: 1, stderr: Buffer.from('synthetic strict connectivity failure') }),
    /Git fsck failed.*exit 1/,
  ],
  [
    'new index write exit',
    (args) => operation(args) === 'read-tree',
    () => ({ status: 1, stderr: Buffer.from('synthetic index write failure') }),
    /Git read-tree failed.*exit 1/,
  ],
]) {
  test(`real deep failure fixture: ${name} stops once and safely cleans only its new root`, (t) => {
    const fixture = sourceFixture(t);
    const before = fingerprintTree(fixture.original);
    const state = claimCheckout(checkoutRelationship(fixture.original));
    const commands = [];
    let failures = 0;
    assert.throws(
      () =>
        transferSelectedSource(state, fixture.sha, {
          run: (command, args, options) => {
            assert.equal(command, 'git');
            commands.push(args);
            if (matches(args)) {
              failures++;
              return replacement();
            }
            return spawnSync(command, args, options);
          },
        }),
      pattern,
    );
    assert.equal(failures, 1);
    assert.ok(matches(commands.at(-1)), 'No fallback, weaker fsck, history copy, fetch or retry follows failure');
    assert.deepEqual(fingerprintTree(fixture.original), before);
    cleanupCheckout(state);
    assert.equal(existsSync(state.root), false);
    assert.deepEqual(fingerprintTree(fixture.original), before);
  });
}

for (const [name, matches, alter, pattern] of [
  [
    'high-bit batch header',
    (args, options) => operation(args) === 'cat-file' && args.includes('--batch') && options.env.GIT_OBJECT_DIRECTORY,
    (result) => {
      result.stdout = Buffer.from(result.stdout);
      result.stdout[0] |= 128;
    },
    /Missing\/malformed selected Git object/,
  ],
  [
    'corrupted selected object bytes',
    (args) => operation(args) === 'cat-file' && args.includes('--batch'),
    (result) => {
      result.stdout = Buffer.from(result.stdout);
      result.stdout[result.stdout.indexOf(10) + 1] ^= 1;
    },
    /hash\/content mismatch/,
  ],
  [
    'truncated producer stdout',
    (args) => operation(args) === 'pack-objects',
    (result) => {
      result.stdout = result.stdout.subarray(0, 12);
    },
    /Git index-pack failed/,
  ],
  [
    'additional imported object inventory',
    (args) => operation(args) === 'cat-file' && args.includes('--batch-all-objects'),
    (result) => {
      result.stdout = Buffer.concat([result.stdout, Buffer.from('b'.repeat(40) + '\n')]);
    },
    /inventory is not exactly/,
  ],
  [
    'high-bit imported object inventory',
    (args) => operation(args) === 'cat-file' && args.includes('--batch-all-objects'),
    (result) => {
      result.stdout = Buffer.from(result.stdout);
      result.stdout[0] |= 128;
    },
    /inventory is not exactly/,
  ],
  [
    'unterminated imported object inventory',
    (args) => operation(args) === 'cat-file' && args.includes('--batch-all-objects'),
    (result) => {
      result.stdout = result.stdout.subarray(0, -1);
    },
    /inventory is not exactly/,
  ],
]) {
  test(`malformed command-output fixture: ${name} is rejected without relaxed verification`, (t) => {
    const fixture = sourceFixture(t);
    const before = fingerprintTree(fixture.original);
    const state = claimCheckout(checkoutRelationship(fixture.original));
    let altered = false;
    assert.throws(
      () =>
        transferSelectedSource(state, fixture.sha, {
          run: (command, args, options) => {
            const result = spawnSync(command, args, options);
            if (!altered && matches(args, options)) {
              altered = true;
              alter(result);
            }
            return result;
          },
        }),
      pattern,
    );
    assert.equal(altered, true);
    assert.deepEqual(fingerprintTree(fixture.original), before);
    cleanupCheckout(state);
    assert.deepEqual(fingerprintTree(fixture.original), before);
  });
}

for (const [name, mutate, pattern] of [
  [
    'duplicate shallow boundary',
    (state, fixture) => write(state.root, '.git/shallow', fixture.sha + '\n' + fixture.sha + '\n'),
    /shallow boundary/,
  ],
  ['pnpm child mode changed before ready', (state) => chmodSync(state.pnpmDest, 0o755), /pnpm.*ownership changed/],
  [
    'late independent synthetic orphan object',
    (state, fixture) =>
      write(
        state.root,
        `.git/objects/${fixture.unrelated.slice(0, 2)}/${fixture.unrelated.slice(2)}`,
        readFileSync(join(fixture.original, '.git/objects', fixture.unrelated.slice(0, 2), fixture.unrelated.slice(2))),
      ),
    /inventory is not exactly/,
  ],
  [
    'forbidden hook metadata',
    (state) => write(state.root, '.git/hooks/synthetic', 'NEVER_RUN_SYNTHETIC_HOOK'),
    /forbidden copied\/shared metadata/,
  ],
]) {
  test(`late source isolation fixture: ${name} cannot become a verified checkout`, (t) => {
    const fixture = sourceFixture(t);
    const state = claimCheckout(checkoutRelationship(fixture.original));
    let changed = false;
    assert.throws(
      () =>
        transferSelectedSource(state, fixture.sha, {
          run: (command, args, options) => {
            const result = spawnSync(command, args, options);
            if (!changed && operation(args) === 'cat-file' && args.includes('--batch-all-objects')) {
              changed = true;
              mutate(state, fixture);
            }
            return result;
          },
        }),
      pattern,
    );
    assert.equal(changed, true);
    cleanupCheckout(state);
  });
}

for (const [name, mutate, pattern] of [
  ['source bytes', (fixture) => write(fixture.original, '.hidden', 'CHANGED_DURING_TRANSFER'), /Dirty source bytes/],
  [
    'raw HEAD',
    (fixture) => write(fixture.original, '.git/HEAD', fixture.sha + '\r\n'),
    /HEAD\/index changed during source transfer/,
  ],
  // update-index may refresh other entries: neutralize the public synthetic
  // filter so this mutation changes only index flags, not a source sentinel.
  [
    'index flags',
    (fixture) =>
      fixtureGit(fixture.original, [
        '-c',
        'filter.fixture.clean=',
        '-c',
        'filter.fixture.smudge=',
        'update-index',
        '--assume-unchanged',
        '.hidden',
      ]),
    /Hidden assume-unchanged/,
  ],
]) {
  test(`real transfer recheck rejects changed original ${name} and never modifies it further`, (t) => {
    const fixture = sourceFixture(t);
    const state = claimCheckout(checkoutRelationship(fixture.original));
    let changed;
    assert.throws(
      () =>
        transferSelectedSource(state, fixture.sha, {
          run: (command, args, options) => {
            const result = spawnSync(command, args, options);
            if (!changed && operation(args) === 'pack-objects') {
              mutate(fixture);
              changed = fingerprintTree(fixture.original);
            }
            return result;
          },
        }),
      pattern,
    );
    assert.ok(changed);
    assert.deepEqual(fingerprintTree(fixture.original), changed);
    cleanupCheckout(state);
    assert.deepEqual(fingerprintTree(fixture.original), changed);
  });
}

test('late selected source hardlink is rejected and cleanup only unlinks the owned alias', (t) => {
  const fixture = sourceFixture(t);
  const before = fingerprintTree(fixture.original);
  const state = claimCheckout(checkoutRelationship(fixture.original));
  let changed = false;
  assert.throws(
    () =>
      transferSelectedSource(state, fixture.sha, {
        run: (command, args, options) => {
          const result = spawnSync(command, args, options);
          if (!changed && operation(args) === 'read-tree') {
            changed = true;
            unlinkSync(join(state.root, '.hidden'));
            linkSync(join(fixture.original, '.hidden'), join(state.root, '.hidden'));
          }
          return result;
        },
      }),
    /shares hardlinks\/inodes/,
  );
  assert.equal(changed, true);
  cleanupCheckout(state);
  assert.deepEqual(fingerprintTree(fixture.original), before);
});

for (const kind of ['symlink', 'hardlink']) {
  test(`generated config ${kind} replacement fails without truncating another inode`, (t) => {
    const fixture = sourceFixture(t);
    const state = claimCheckout(checkoutRelationship(fixture.original));
    const held = join(fixture.parent, 'unowned-synthetic-config');
    writeFileSync(held, 'DO_NOT_TRUNCATE_SYNTHETIC_CONFIG\n');
    const before = readFileSync(held);
    assert.throws(
      () =>
        transferSelectedSource(state, fixture.sha, {
          run: (command, args, options) => {
            const result = spawnSync(command, args, options);
            if (operation(args) === 'init') {
              unlinkSync(join(state.root, '.git/config'));
              if (kind === 'symlink') symlinkSync(held, join(state.root, '.git/config'));
              else linkSync(held, join(state.root, '.git/config'));
            }
            return result;
          },
        }),
      /ELOOP|Unsafe generated Git file/,
    );
    assert.deepEqual(readFileSync(held), before);
    cleanupCheckout(state);
    assert.deepEqual(readFileSync(held), before);
  });
}

for (const kind of ['file collision', 'symlink collision', 'directory symlink']) {
  test(`exclusive materialization ${kind} fails without touching its external target`, (t) => {
    const fixture = sourceFixture(t);
    const state = claimCheckout(checkoutRelationship(fixture.original));
    const held = join(fixture.parent, 'retained-materialization-target');
    write(held, 'sentinel', 'DO_NOT_TOUCH_SYNTHETIC_TARGET\n');
    const before = fingerprintTree(held);
    assert.throws(
      () =>
        transferSelectedSource(state, fixture.sha, {
          run: (command, args, options) => {
            const result = spawnSync(command, args, options);
            if (operation(args) === 'cat-file' && args.includes('--batch-all-objects')) {
              if (kind === 'file collision') writeFileSync(join(state.root, '.hidden'), 'EXISTING_OWNED_COLLISION');
              if (kind === 'symlink collision') symlinkSync(join(held, 'sentinel'), join(state.root, '.hidden'));
              if (kind === 'directory symlink') symlinkSync(held, join(state.root, 'nested'));
            }
            return result;
          },
        }),
      /EEXIST|nonsymlink directory/,
    );
    assert.deepEqual(fingerprintTree(held), before);
    cleanupCheckout(state);
    assert.deepEqual(fingerprintTree(held), before);
  });
}

for (const stop of [1, 2, 3, 4, 5]) {
  test(`ordinary allocation save failure ${stop} removes only observed newly owned empty directories`, (t) => {
    const parent = scratch(t);
    const original = join(parent, 'original');
    mkdirSync(original);
    let calls = 0;
    assert.throws(
      () =>
        claimCheckout(checkoutRelationship(original), () => {
          if (++calls === stop) throw new Error('synthetic state writer failure');
        }),
      /synthetic state writer failure/,
    );
    assert.equal(calls, stop);
    assert.deepEqual(readdirSync(parent), ['original']);
  });
}

test('partial allocation mode change refuses cleanup and retains the unsupported allocation', (t) => {
  const parent = scratch(t);
  const original = join(parent, 'original');
  mkdirSync(original);
  assert.throws(
    () =>
      claimCheckout(checkoutRelationship(original), (state) => {
        chmodSync(state.root, 0o755);
        throw new Error('synthetic state writer failure after mode change');
      }),
    /unsafe cleanup retained/,
  );
  assert.equal(lstatSync(join(parent, 'c')).mode & 0o777, 0o755);
});

for (const [name, stop, target] of [
  ['Git directory mode', 2, (state) => join(state.root, '.git')],
  ['temporary child mode', 3, (state) => state.tmpdir],
  ['installer child mode', 4, (state) => state.pnpmDest],
]) {
  test(`partial allocation ${name} change retains every observed directory`, (t) => {
    const parent = scratch(t);
    const original = join(parent, 'original');
    mkdirSync(original);
    let calls = 0;
    assert.throws(
      () =>
        claimCheckout(checkoutRelationship(original), (state) => {
          if (++calls === stop) {
            chmodSync(target(state), 0o755);
            throw new Error('synthetic allocation state failure');
          }
        }),
      /unsafe cleanup retained/,
    );
    assert.equal(existsSync(join(parent, 'c/.git')), true);
  });
}

test('nonempty partial allocation and unwitnessed modeled post retain contents without falling through to main', (t) => {
  const parent = scratch(t);
  const original = join(parent, 'original');
  mkdirSync(original);
  let saved;
  assert.throws(
    () =>
      claimCheckout(checkoutRelationship(original), (state) => {
        if (state.gitId) {
          saved = structuredClone(state);
          write(state.root, '.git/unwitnessed-sentinel', 'RETAIN_SYNTHETIC_CONTENT');
          throw new Error('synthetic allocation interruption');
        }
      }),
    /unsafe cleanup retained/,
  );
  const before = fingerprintTree(parent);
  assert.throws(
    () =>
      runAction(
        { STATE_ci_checkout: JSON.stringify(saved) },
        {
          save: () => assert.fail('Post must not begin main'),
          run: () => assert.fail('Post must not run source commands'),
        },
      ),
    /ENOENT/,
  );
  assert.deepEqual(fingerprintTree(parent), before);
});

const invalidStates = [
  [
    'wrong version',
    (s) => {
      s.version = 2;
    },
  ],
  [
    'wrong phase',
    (s) => {
      s.phase = 'unknown';
    },
  ],
  [
    'unexpected key',
    (s) => {
      s.fallback = true;
    },
  ],
  [
    'original root reuse',
    (s) => {
      s.root = s.original;
    },
  ],
  [
    'foreign sibling',
    (s) => {
      s.root = join(s.parent, 'foreign');
    },
  ],
  [
    'non-string token',
    (s) => {
      s.token = [s.token];
    },
  ],
  [
    'bad token',
    (s) => {
      s.token = 'a';
    },
  ],
  [
    'unsafe inode',
    (s) => {
      s.rootId.ino = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
  [
    'negative device',
    (s) => {
      s.rootId.dev = -1;
    },
  ],
  [
    'missing root identity',
    (s) => {
      delete s.rootId;
    },
  ],
  [
    'extra identity key',
    (s) => {
      s.gitId.path = 'unexpected';
    },
  ],
  [
    'foreign tmp child',
    (s) => {
      s.tmpdir = join(s.parent, '_tmpABC123');
    },
  ],
  [
    'malformed tmp child',
    (s) => {
      s.tmpdir = join(s.root, '_tmpTOOLONG');
    },
  ],
  [
    'missing pnpm identity',
    (s) => {
      delete s.pnpmId;
    },
  ],
  [
    'mismatched parent identity',
    (s) => {
      s.parentId.ino++;
    },
  ],
  [
    'mismatched root identity',
    (s) => {
      s.rootId.ino++;
    },
  ],
  [
    'mismatched Git identity',
    (s) => {
      s.gitId.ino++;
    },
  ],
];
for (const [name, mutate] of invalidStates) {
  test(`ownership cleanup rejects ${name} and leaves both roots byte/mode/inode-identical`, (t) => {
    const fixture = sourceFixture(t);
    const state = claimCheckout(checkoutRelationship(fixture.original));
    const before = fingerprintTree(fixture.parent);
    const invalid = structuredClone(state);
    mutate(invalid);
    assert.throws(() => cleanupCheckout(invalid), /Malformed|ownership changed|witness mismatch/);
    assert.deepEqual(fingerprintTree(fixture.parent), before);
    cleanupCheckout(state);
  });
}

for (const kind of ['missing', 'malformed', 'mismatched', 'wrong mode', 'symlink', 'hardlink']) {
  test(`ownership cleanup retains ${kind} witness rather than authorizing deletion`, (t) => {
    const fixture = sourceFixture(t);
    const state = claimCheckout(checkoutRelationship(fixture.original));
    const path = join(state.root, '.git/ci-checkout-owner.json');
    if (kind === 'missing') unlinkSync(path);
    if (kind === 'malformed') writeFileSync(path, '{');
    if (kind === 'mismatched') {
      const witness = JSON.parse(readFileSync(path));
      witness.token = '0'.repeat(64);
      writeFileSync(path, JSON.stringify(witness));
    }
    if (kind === 'wrong mode') chmodSync(path, 0o644);
    if (kind === 'symlink' || kind === 'hardlink') {
      renameSync(path, join(fixture.parent, 'held-witness'));
      if (kind === 'symlink') symlinkSync(join(fixture.parent, 'held-witness'), path);
      else linkSync(join(fixture.parent, 'held-witness'), path);
    }
    const before = fingerprintTree(fixture.parent);
    assert.throws(() => cleanupCheckout(state), /ENOENT|Malformed|mismatch|Invalid|ELOOP/);
    assert.deepEqual(fingerprintTree(fixture.parent), before);
  });
}

for (const kind of ['root', 'Git directory', 'parent']) {
  test(`post ownership rejects ${kind} mode changes and retains all observed contents`, (t) => {
    const fixture = sourceFixture(t);
    const state = claimCheckout(checkoutRelationship(fixture.original));
    const target = kind === 'root' ? state.root : kind === 'Git directory' ? join(state.root, '.git') : state.parent;
    chmodSync(target, kind === 'parent' ? 0o720 : 0o755);
    const before = fingerprintTree(fixture.parent);
    assert.throws(
      () => runAction({ STATE_ci_checkout: JSON.stringify(state) }),
      /ownership changed|owned and not group\/world writable/,
    );
    assert.deepEqual(fingerprintTree(fixture.parent), before);
    chmodSync(target, 0o700);
    cleanupCheckout(state);
  });
}

for (const kind of ['directory', 'symlink']) {
  test(`post rejects a replaced ${kind} root without removing the replacement or moved owned root`, (t) => {
    const fixture = sourceFixture(t);
    const state = claimCheckout(checkoutRelationship(fixture.original));
    renameSync(state.root, join(fixture.parent, 'moved-owned-root'));
    if (kind === 'directory') write(state.root, 'foreign-sentinel', 'DO_NOT_DELETE_REPLACEMENT');
    else symlinkSync(fixture.original, state.root);
    const before = fingerprintTree(fixture.parent);
    assert.throws(() => runAction({ STATE_ci_checkout: JSON.stringify(state) }), /ownership changed|nonsymlink/);
    assert.deepEqual(fingerprintTree(fixture.parent), before);
  });
}

for (const child of ['tmpdir', 'pnpmDest']) {
  test(`installer guard rejects replaced ${child} and child mode changes`, (t) => {
    const fixture = sourceFixture(t);
    const state = claimCheckout(checkoutRelationship(fixture.original));
    verifyInstallerState(state);
    chmodSync(state[child], 0o755);
    assert.throws(() => verifyInstallerState(state), /ownership changed/);
    chmodSync(state[child], 0o700);
    renameSync(state[child], join(fixture.parent, 'held-installer-child'));
    mkdirSync(state[child], { mode: 0o700 });
    assert.throws(() => verifyInstallerState(state), /ownership changed/);
    cleanupCheckout(state); // Root/witness still owned; no traversal outside that root.
    assert.equal(existsSync(join(fixture.parent, 'held-installer-child')), true);
  });
}

test('installer guard rejects a nonempty pnpm destination without removing its contents', (t) => {
  const fixture = sourceFixture(t);
  const state = claimCheckout(checkoutRelationship(fixture.original));
  write(state.pnpmDest, 'existing', 'DO_NOT_INSTALL_OVER_SYNTHETIC_CONTENT\n');
  const before = fingerprintTree(fixture.parent);
  assert.throws(() => verifyInstallerState(state), /not the newly owned empty installer directory/);
  assert.deepEqual(fingerprintTree(fixture.parent), before);
  cleanupCheckout(state);
});

test('modeled isolated pnpm recreation and LIFO posts keep inputs until cache/tool posts, then clean only selected root', (t) => {
  const fixture = sourceFixture(t);
  const original = fingerprintTree(fixture.original);
  const state = claimCheckout(checkoutRelationship(fixture.original));
  transferSelectedSource(state, fixture.sha);
  state.phase = 'ready'; // Deep fixture lifecycle model, not a runMain/native/hosted success.
  verifyInstallerState(state);
  rmdirSync(state.pnpmDest);
  mkdirSync(state.pnpmDest, { mode: 0o700 }); // Inspected installer owns remove/recreate ONLY here.
  const sentinel = spawnSync(
    process.execPath,
    ['-e', 'console.log(JSON.stringify({cwd:process.cwd(),tmpdir:process.env.TMPDIR}))'],
    { cwd: state.pnpmDest, env: { PATH: process.env.PATH, TMPDIR: state.tmpdir }, encoding: 'utf8' },
  );
  assert.equal(sentinel.status, 0, sentinel.stderr);
  assert.deepEqual(JSON.parse(sentinel.stdout), { cwd: state.pnpmDest, tmpdir: state.tmpdir });
  const held = join(fixture.parent, 'retained-symlink-target');
  write(held, 'sentinel', 'OUTSIDE_ROOT_SYNTHETIC_SENTINEL');
  symlinkSync(held, join(state.root, 'node_modules'));
  const heldBefore = fingerprintTree(held);
  const order = [];
  const posts = [
    () => {
      order.push('original-checkout');
      assert.deepEqual(fingerprintTree(fixture.original), original);
    },
    () => {
      order.push('source');
      runAction(
        { STATE_ci_checkout: JSON.stringify(state), GITHUB_WORKSPACE: fixture.original },
        { run: () => assert.fail('Post must not run source/tool commands') },
      );
    },
    () => {
      order.push('cache/tool');
      assert.equal(existsSync(state.root), true);
      assert.equal(existsSync(state.tmpdir), true);
    },
  ];
  while (posts.length) posts.pop()();
  assert.deepEqual(order, ['cache/tool', 'source', 'original-checkout']);
  assert.equal(existsSync(state.root), false);
  assert.deepEqual(fingerprintTree(held), heldBefore);
  assert.deepEqual(fingerprintTree(fixture.original), original);
});

test('post empty/cleaned states are idempotent and malformed private state never falls through to main', (t) => {
  const parent = scratch(t);
  for (const input of ['', '{', 'null', '[]', '{}', '{"version":1,"phase":"empty","root":"/c"}']) {
    assert.throws(
      () =>
        runAction(
          { STATE_ci_checkout: input, GITHUB_WORKSPACE: parent },
          {
            save: () => assert.fail('Malformed post must not start main'),
            run: () => assert.fail('Malformed post must not run Git'),
          },
        ),
      /Malformed/,
    );
  }
  assert.deepEqual(runAction({ STATE_ci_checkout: '{"version":1,"phase":"empty"}' }), { version: 1, phase: 'empty' });
  const original = join(parent, 'original');
  mkdirSync(original);
  const state = claimCheckout(checkoutRelationship(original));
  cleanupCheckout(state);
  write(join(parent, 'c'), 'foreign', 'NEW_COLLISION_MUST_REMAIN');
  const before = fingerprintTree(parent);
  runAction({ STATE_ci_checkout: JSON.stringify(state) });
  assert.deepEqual(fingerprintTree(parent), before);
});

test('runner state file symlink is rejected before main allocation and its target is unchanged', (t) => {
  const parent = scratch(t);
  const held = join(parent, 'runner-state-target');
  writeFileSync(held, 'DO_NOT_APPEND\n');
  symlinkSync(held, join(parent, 'runner-state-link'));
  assert.throws(
    () =>
      runMain({
        GITHUB_STATE: join(parent, 'runner-state-link'),
        GITHUB_WORKSPACE: parent,
        GITHUB_SHA: 'a'.repeat(40),
      }),
    /ELOOP/,
  );
  assert.equal(readFileSync(held, 'utf8'), 'DO_NOT_APPEND\n');
});

for (const args of [['--skip-budget'], ['--root', '/c'], ['--mode', 'post'], ['--check-install', '--skip-budget']]) {
  test(`CLI exposes no selector, budget or lifecycle override: ${args.join(' ')}`, (t) => {
    const parent = scratch(t);
    const result = spawnSync(
      process.execPath,
      [resolve(repositoryRoot, '.github/actions/ci-checkout/index.mjs'), ...args],
      { cwd: parent, env: { PATH: process.env.PATH, TMPDIR: parent }, encoding: 'utf8' },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /No public checkout path\/budget\/action-mode overrides/);
    assert.deepEqual(readdirSync(parent), []);
  });
}

for (const [name, mutate] of [
  [
    'top-level TMPDIR missing',
    (job) => {
      delete job.steps[2].env;
    },
  ],
  [
    'selected input missing',
    (job) => {
      delete job.steps[2].with['checkout-root'];
    },
  ],
  [
    'original cwd on validation shell',
    (job) => {
      job.steps[3]['working-directory'] = '${{ github.workspace }}';
    },
  ],
]) {
  test(`effective inheritance model detects ${name} instead of assuming fixture defaults`, (t) => {
    const fixture = bindingFixture(t);
    const job = structuredClone(workflow().jobs['ci-validate']);
    mutate(job);
    assert.throws(() => assertModeledBindings(modelJob(job, fixture), fixture));
  });
}
