import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  archiveFilename,
  artifactName,
  encodeArchive,
  ignoredScratch,
  inventoryOutputs,
  sha256,
} from './ci-test-artifacts.mjs';
import { ciActions, createCiTestModel, loadWorkspaces, validateHelperContracts } from './ci-test-plan.mjs';
import {
  assertResourceDirectory,
  assertSocketSafeTmpdir,
  browserWorkspaces,
  mongoWorkspaces,
  prepareResources,
  redisImages,
  redisWorkspaces,
  resolvedPackage,
  resolveResources,
  resourceEnvironment,
  resourceOutputs,
  resourceTmpdirMaxBytes,
  restoreWorkspace,
  runCli,
  runWorkspace,
  selectedBrowsers,
  setupCi,
} from './ci-test-workspace.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const plain = '@web-ts-toolkit/utils';
const browser = '@web-ts-toolkit/pdf-reader';
const mongo = '@web-ts-toolkit/access-router';
const combined = '@web-ts-toolkit/express-request-attestation';
const dpop = 'oidc-vault-dpop-example';
const identity = {
  checkoutSha: 'a'.repeat(40),
  runId: '12345',
  runAttempt: '2',
  platform: process.platform,
  arch: process.arch,
  node: process.versions.node,
  pnpm: '11.18.0',
  lockSha256: sha256('frozen lock'),
};
const contract = {
  roots: ['packages/sample/dist'],
  files: [{ path: 'packages/sample/dist/index.mjs' }],
  starter: false,
};
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('MONGOMS_')));

function write(root, path, data, mode = 0o644) {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data, { mode });
  chmodSync(target, mode);
}

function fixture(t, workspace = plain) {
  const scratch = mkdtempSync(resolve(repositoryRoot, '_tmp-ci-workspace-test-'));
  assert.equal(spawnSync('git', ['check-ignore', scratch], { cwd: repositoryRoot }).status, 0);
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const root = resolve(scratch, 'source');
  const consumer = resolve(scratch, 'consumer');
  const manifest = {
    name: workspace,
    scripts: { build: 'tsup', test: 'pnpm build && vitest run --maxWorkers=1 --fileParallelism=false' },
  };
  const workspaces = new Map([[workspace, { directory: 'packages/sample', manifest }]]);
  const model = createCiTestModel(workspaces, [{ workspace, dependencies: {} }], []);
  for (const directory of [root, consumer]) {
    write(directory, 'packages/sample/package.json', JSON.stringify(manifest));
    write(directory, 'package.json', '{"packageManager":"pnpm@11.18.0"}');
    write(directory, '.tool-versions', `nodejs ${process.versions.node}\npnpm 11.24.0\n`);
    write(
      directory,
      'packages/create-access-router-mongo-starter/template/package.json',
      '{"packageManager":"pnpm@11.18.0"}',
    );
    write(directory, 'pnpm-lock.yaml', 'frozen lock');
  }
  write(root, 'packages/sample/dist/index.mjs', 'export const value = 42;\n');
  const bytes = encodeArchive(root, identity, contract);
  const download = resolve(scratch, 'download');
  write(download, archiveFilename, bytes);
  const env = {
    ...cleanEnv(),
    GITHUB_SHA: identity.checkoutSha,
    GITHUB_RUN_ID: identity.runId,
    GITHUB_RUN_ATTEMPT: identity.runAttempt,
    CI_TEST_WORKSPACE: workspace,
    CI_TEST_ARTIFACT_NAME: artifactName(identity),
    CI_TEST_ARTIFACT_DIGEST: sha256(bytes),
    CI_TEST_ARTIFACT_DIR: download,
  };
  return { scratch, root, consumer, download, bytes, env, workspaces, model };
}

function recorder({ onCall = () => undefined, json = {} } = {}) {
  const calls = [];
  const run = (name, args, options) => {
    calls.push({ name, args, options });
    const result = onCall(name, args, options);
    if (result !== undefined) return result;
    if (name === 'git' && args[0] === 'rev-parse') return identity.checkoutSha;
    if (name === 'git') return '';
    if (name === 'pnpm' && args[0] === '--version') return identity.pnpm;
    if (name === 'pnpm' && args[0] === 'exec') return `v${identity.node}`;
    if (name === 'npm') return '11.20.0';
    if (name === 'node' && args[0] === '-e') return `CI_RESOURCE_JSON=${JSON.stringify(json)}\n`;
    return '';
  };
  return { calls, run };
}

function packages(directory, name) {
  return {
    packageFile: resolve(directory, '_tmp-modules', name, 'package.json'),
    version: name.startsWith('playwright') ? '1.62.1' : '11.3.0',
  };
}

function mongoConfig(overrides = {}) {
  return {
    requestedVersion: '8.2.6',
    version: '8.2.6',
    systemBinary: '',
    binaryName: `mongod-${process.arch}-ubuntu-8.2.6`,
    os: { os: 'linux', dist: 'ubuntu', release: '24.04' },
    platform: process.platform,
    arch: process.arch,
    download: { mirror: 'https://fastdl.mongodb.org' },
    ...overrides,
  };
}

function resolvePlan(state, options = {}) {
  const resourceDirectory = ignoredScratch(state.consumer, 'resources');
  return resolveResources(state.consumer, state.env.CI_TEST_WORKSPACE, resourceDirectory, {
    env: state.env,
    workspaces: state.workspaces,
    model: state.model,
    ...fixtureResourceOptions,
    packageResolver: packages,
    run: recorder({ json: mongoConfig() }).run,
    ...options,
  });
}

function preparePlan(plan, options = {}) {
  return prepareResources(plan, { ...fixtureResourceOptions, ...options });
}

const testCalls = (calls) => calls.filter(({ name, args }) => name === 'pnpm' && args.at(-1) === 'test');
const noLog = () => {};

// Filesystem/artifact fixtures intentionally live in deep ignored checkouts.
// Simulate only their checkout-prefix byte count (33); retain the complete
// allocation suffix and run the production budget check. No resource is launched
// in these success fixtures. Default-byte rejection and a real helper allocation
// are covered separately, without this measurement seam or a CLI/env bypass.
function fixtureTmpdirBytes(directory, encoding) {
  assert.equal(encoding, 'utf8');
  const start = directory.lastIndexOf(`${sep}_tmp`);
  assert.notEqual(start, -1);
  return Buffer.byteLength(`${sep}${'r'.repeat(32)}${directory.slice(start)}`, encoding);
}

const fixtureResourceOptions = { tmpdirByteLength: fixtureTmpdirBytes };
let discovered;
const actualWorkspaces = () => (discovered ??= loadWorkspaces());

test('checked-in CI composites match the strict independent helper contract without wiring the active workflow', () => {
  validateHelperContracts(
    Object.fromEntries(
      [ciActions.source, ciActions.setup, ciActions.prepare, ciActions.test].map((path) => [
        path,
        readFileSync(resolve(repositoryRoot, path, 'action.yml'), 'utf8'),
      ]),
    ),
  );
});

test('lean setup probes root, every workspace and generated consumer with the packageManager pnpm pin', (t) => {
  const state = fixture(t);
  const capture = recorder();
  const observations = setupCi(state.consumer, state.env, {
    workspaces: state.workspaces,
    run: capture.run,
    log: noLog,
  });
  assert.deepEqual(
    observations.map(({ directory }) => directory),
    ['.', 'packages/sample', '<generated-consumer>'],
  );
  assert.ok(observations.every(({ pnpm, node }) => pnpm === '11.18.0' && node === `v${process.versions.node}`));
  const generated = capture.calls.find(({ name }) => name === 'npm').options.cwd;
  assert.equal(existsSync(generated), false);
  assert.deepEqual(
    capture.calls.slice(-4).map(({ name }) => name),
    ['git', 'sh', 'tar', 'find'],
  );
  assert.equal(
    capture.calls.some(({ name, args }) => ['python', 'pip', 'asdf'].includes(name) || args.includes('website')),
    false,
  );
});

test('lean setup fails on workspace/generated subprocess resolution drift and still removes its own probe', (t) => {
  const state = fixture(t);
  for (const target of ['packages/sample', '<generated-consumer>']) {
    let generated;
    const capture = recorder({
      onCall: (name, args, options) => {
        if (name !== 'pnpm' || args[0] !== '--version') return;
        const isGenerated = options.cwd.includes('_tmp-ci-test-tools-');
        if (isGenerated) generated = options.cwd;
        if (
          (target === '<generated-consumer>' && isGenerated) ||
          (target === 'packages/sample' && options.cwd.endsWith('/packages/sample'))
        )
          return '11.24.0';
      },
    });
    assert.throws(
      () => setupCi(state.consumer, state.env, { workspaces: state.workspaces, run: capture.run, log: noLog }),
      /subprocess toolchain mismatch/,
    );
    if (generated) assert.equal(existsSync(generated), false);
  }
});

test('socket budget reserves the reviewed pinned-engine UUID bound, not observed or arbitrary-number lengths', () => {
  assert.equal(process.versions.node, '26.12.1', 'Review the socket budget when upgrading pinned Node');
  assert.match(process.versions.v8, /^14\.6\.202\.34(?:-|$)/, 'Review the pinned V8 radix/random implementation');
  const rxdb = resolvedPackage(resolve(repositoryRoot, 'packages/mongoose-rxdb'), 'rxdb');
  const channel = resolvedPackage(dirname(rxdb.packageFile), 'broadcast-channel', rxdb.packageFile);
  assert.equal(channel.version, '7.4.0', 'Review the socket layout and UUID generator when upgrading BroadcastChannel');
  assert.equal(resourceTmpdirMaxBytes, 45);
  assert.equal(Buffer.byteLength(`/pubkey.bc/A${'h'.repeat(20)}/rdrs/${'r'.repeat(22)}.s`, 'utf8'), 62);
  // Smallest nonzero native random value is 2**-53; V8's minimum rounding
  // delta is 2**-106. After 21 radix-36 digits delta > 1, so conversion stops.
  assert.ok(36 ** 21 * 2 ** -106 > 1);
  assert.equal((2 ** -53).toString(36).substring(2).length, 21);
  assert.equal((2 ** -52).toString(36).substring(2).length, 21);
  for (let exponent = 1; exponent <= 53; exponent += 1)
    for (const value of [2 ** -exponent, 1 - 2 ** -exponent, 2 ** -exponent + 2 ** -53])
      assert.ok(value.toString(36).substring(2).length <= 21);
  // A supported finite Number need not be a possible native Math.random value.
  assert.ok(Number.MIN_VALUE.toString(36).substring(2).length > 22);
});

for (const [label, root, rootBytes, supported] of [
  ['normal', `${sep}${'r'.repeat(32)}`, 33, true],
  ['maximum', `${sep}${'r'.repeat(33)}`, 34, true],
  ['one byte over', `${sep}${'r'.repeat(34)}`, 35, false],
  ['representative hosted depth', `${sep}${'r'.repeat(46)}`, 47, false],
  ['UTF-8 maximum', `${sep}${'é'.repeat(16)}r`, 34, true],
  ['UTF-8 one byte over', `${sep}${'é'.repeat(16)}rr`, 35, false],
]) {
  test(`socket-safe TMPDIR checks the ${label} checkout in UTF-8 bytes`, () => {
    const tmpdir = resolve(root, '_tmpABC123');
    assert.equal(Buffer.byteLength(root, 'utf8'), rootBytes);
    assert.equal(Buffer.byteLength(tmpdir, 'utf8'), rootBytes + 11);
    if (supported) {
      assert.doesNotThrow(() => assertSocketSafeTmpdir(tmpdir));
      assert.ok(Buffer.byteLength(tmpdir, 'utf8') + 40 + 22 <= 107);
    } else {
      assert.throws(() => assertSocketSafeTmpdir(tmpdir), /TMPDIR.*Linux Unix-socket budget permits at most 45/);
    }
    if (label.startsWith('UTF-8')) assert.ok(tmpdir.length < resourceTmpdirMaxBytes);
  });
}

test('socket budget rejects nonabsolute, nonnormalized and invalid byte measurements', () => {
  for (const directory of [undefined, null, '_tmpABC123', `${sep}a${sep}..${sep}_tmpABC123`, `${sep}_tmpABC\0`])
    assert.throws(() => assertSocketSafeTmpdir(directory), /normalized absolute path/);
  for (const bytes of [undefined, NaN, Infinity, -1, 0, 1.5, '44'])
    assert.throws(() => assertSocketSafeTmpdir(resolve(sep, '_tmpABC123'), () => bytes), /Invalid.*byte measurement/);
});

test('actual helper allocation either provides socket-safe isolated TMPDIR or rejects the real checkout depth', (t) => {
  const resourceDirectory = ignoredScratch(repositoryRoot, 'resources');
  t.after(() => rmSync(resourceDirectory, { recursive: true, force: true }));
  assert.match(relative(repositoryRoot, resourceDirectory), /^_tmp[A-Za-z0-9]{6}$/);
  const workspaces = actualWorkspaces();
  const options = {
    workspaces,
    model: createCiTestModel(workspaces),
    packageResolver: () => assert.fail('RxDB-only planning must not resolve browsers/Mongo'),
    run: () => assert.fail('No resource/test command may be invoked'),
  };
  const plan = () => resolveResources(repositoryRoot, '@web-ts-toolkit/mongoose-rxdb', resourceDirectory, options);
  if (Buffer.byteLength(resourceDirectory, 'utf8') > resourceTmpdirMaxBytes) {
    assert.throws(plan, /TMPDIR.*Unix-socket budget/);
  } else {
    const resolved = plan();
    assert.equal(resolved.tmpdir, resourceDirectory);
    const prepared = prepareResources(resolved, { run: options.run, env: cleanEnv(), log: noLog });
    assert.equal(prepared.env.TMPDIR, resourceDirectory);
    assert.deepEqual(prepared.observations, { workspace: '@web-ts-toolkit/mongoose-rxdb' });
  }
});

test('unsupported default TMPDIR fails before browser/Mongo resolution or resource probes', (t) => {
  const state = fixture(t, combined);
  const capture = recorder({ json: mongoConfig() });
  let resolutions = 0;
  assert.throws(
    () =>
      resolvePlan(state, {
        tmpdirByteLength: Buffer.byteLength,
        run: capture.run,
        packageResolver: (...args) => {
          resolutions += 1;
          return packages(...args);
        },
      }),
    /TMPDIR.*Unix-socket budget/,
  );
  assert.equal(resolutions, 0);
  assert.equal(capture.calls.length, 0);
});

test('direct resource preparation rejects an unsupported default TMPDIR before commands', (t) => {
  const state = fixture(t, combined);
  const plan = resolvePlan(state);
  const capture = recorder();
  assert.throws(
    () => prepareResources(plan, { run: capture.run, env: state.env, log: noLog }),
    /TMPDIR.*Unix-socket budget/,
  );
  assert.equal(capture.calls.length, 0);
});

test('compact resource directories still require an ignored real checkout and reject an aliased checkout root', (t) => {
  const state = fixture(t);
  const safe = ignoredScratch(state.consumer, 'resources');
  const aliasRoot = resolve(state.scratch, 'alias-root');
  symlinkSync(state.consumer, aliasRoot);
  assert.throws(
    () => assertResourceDirectory(aliasRoot, resolve(aliasRoot, relative(state.consumer, safe))),
    /Unsafe CI resource/,
  );
  assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: state.consumer }).status, 0);
  write(state.consumer, '.gitignore', '_tmp-ci-test-*\n');
  assert.throws(() => assertResourceDirectory(state.consumer, safe), /git check-ignore.*failed/);
});

test('resource inventory selects only the three real-browser jobs, eight Mongo jobs and two Redis jobs', (t) => {
  const state = fixture(t);
  const workspaces = actualWorkspaces();
  const model = createCiTestModel(workspaces);
  const selected = { browser: [], mongo: [], redis: [] };
  for (const { workspace } of model.nodes) {
    mkdirSync(resolve(state.consumer, workspaces.get(workspace).directory), { recursive: true });
    const plan = resolveResources(state.consumer, workspace, ignoredScratch(state.consumer, 'resources'), {
      env: cleanEnv(),
      workspaces,
      model,
      ...fixtureResourceOptions,
      packageResolver: packages,
      run: recorder({ json: mongoConfig() }).run,
    });
    for (const kind of Object.keys(selected)) if (plan[kind]) selected[kind].push(workspace);
    assert.equal(plan.tmpdir, plan.resourceDirectory);
    for (const path of [plan.browser?.directory, plan.mongo?.directory].filter(Boolean)) {
      assert.equal(dirname(path), plan.resourceDirectory);
      assert.ok(!path.includes('/dist') && !path.includes('/node_modules'));
    }
  }
  assert.deepEqual(selected.browser.sort(), [...browserWorkspaces].sort());
  assert.deepEqual(selected.mongo.sort(), [...mongoWorkspaces].sort());
  assert.deepEqual(selected.redis.sort(), [...redisWorkspaces].sort());
  assert.deepEqual(browserWorkspaces, [combined, browser, dpop]);
  for (const workspace of ['@web-ts-toolkit/access-router-client', '@web-ts-toolkit/access-router-react', 'react-vite'])
    assert.ok(!browserWorkspaces.includes(workspace));
});

test('browser selection is canonical and rejects empty, unknown, duplicate, whitespace and shell-like engines', () => {
  assert.deepEqual(selectedBrowsers(), ['chromium']);
  assert.deepEqual(selectedBrowsers('webkit,chromium,firefox'), ['chromium', 'firefox', 'webkit']);
  for (const value of [
    '',
    'chromium,',
    'chromium,chromium',
    ' chromium',
    'chromium, firefox',
    'Chrome',
    'all',
    'chromium;true',
    ['chromium'],
    null,
  ])
    assert.throws(() => selectedBrowsers(value), /DPOP_TEST_BROWSERS/);
});

test('browser resolution uses workspace Playwright/core and keys exact version, platform and selected engines', (t) => {
  const state = fixture(t, dpop);
  state.env.DPOP_TEST_BROWSERS = 'webkit,chromium';
  const resolutions = [];
  const plan = resolvePlan(state, {
    packageResolver: (directory, name, fromPackage) => {
      resolutions.push({ directory, name, fromPackage });
      return packages(directory, name);
    },
  });
  assert.equal(resolutions[0].directory, resolve(state.consumer, 'packages/sample'));
  assert.equal(resolutions[1].fromPackage, plan.browser.packageFile);
  assert.deepEqual(plan.browser.engines, ['chromium', 'webkit']);
  assert.equal(plan.browser.cacheKey, `ci-playwright-${process.platform}-${process.arch}-1.62.1-chromium-webkit`);
  assert.equal(resourceEnvironment(plan, state.env).DPOP_TEST_BROWSERS, 'chromium,webkit');
  const other = resolvePlan(state, {
    packageResolver: (directory, name) => ({ ...packages(directory, name), version: '1.63.0' }),
  });
  assert.notEqual(plan.browser.cacheKey, other.browser.cacheKey);
  assert.throws(
    () =>
      resolvePlan(state, {
        packageResolver: (directory, name) => ({
          ...packages(directory, name),
          version: name === 'playwright-core' ? '1.63.0' : '1.62.1',
        }),
      }),
    /versions disagree/,
  );
  state.env.DPOP_TEST_BROWSERS = 'chromium, firefox';
  assert.throws(() => resolvePlan(state), /DPOP_TEST_BROWSERS/);
});

test('resource paths reject non-local, preexisting alias, symlink and nonignored directory boundaries', (t) => {
  const state = fixture(t);
  const safe = ignoredScratch(state.consumer, 'resources');
  assertResourceDirectory(state.consumer, safe);
  for (const bad of [
    undefined,
    resolve(state.scratch, '_tmpOut123'),
    resolve(state.consumer, 'dist'),
    resolve(safe, 'nested'),
  ])
    assert.throws(() => assertResourceDirectory(state.consumer, bad), /fresh checkout-local/);
  const alias = resolve(state.consumer, '_tmpAlias1');
  symlinkSync(safe, alias);
  assert.throws(() => assertResourceDirectory(state.consumer, alias), /Unsafe CI resource/);
  const plan = resolvePlan(state);
  rmSync(plan.resourceDirectory, { recursive: true });
  symlinkSync(safe, plan.tmpdir);
  assert.throws(
    () => preparePlan(plan, { run: recorder().run, env: state.env, log: noLog }),
    /Unsafe CI resource directory/,
  );
  const browserState = fixture(t, browser);
  const browserPlan = resolvePlan(browserState);
  symlinkSync(safe, browserPlan.browser.directory);
  assert.throws(
    () => preparePlan(browserPlan, { run: recorder().run, env: browserState.env, log: noLog }),
    /Unsafe CI resource child/,
  );
});

test('Mongo configuration resolves both package versions and an exact job-local system binary, never machine/global fallback', (t) => {
  const state = fixture(t, mongo);
  const capture = recorder({ json: mongoConfig() });
  const plan = resolvePlan(state, {
    run: capture.run,
    env: { ...state.env, MONGOMS_PREFER_GLOBAL_PATH: 'true', MONGOMS_RUNTIME_DOWNLOAD: 'false' },
  });
  assert.equal(plan.mongo.memoryServer.version, '11.3.0');
  assert.equal(plan.mongo.core.version, '11.3.0');
  assert.equal(plan.mongo.version, '8.2.6');
  const env = resourceEnvironment(plan, state.env);
  assert.equal(env.MONGOMS_SYSTEM_BINARY, plan.mongo.binaryPath);
  assert.equal(env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK, 'true');
  assert.equal(env.MONGOMS_RUNTIME_DOWNLOAD, 'false');
  assert.equal(env.MONGOMS_PREFER_GLOBAL_PATH, 'false');
  assert.equal(env.MONGOMS_DOWNLOAD_DIR, plan.mongo.directory);
  assert.equal(env.TMPDIR, plan.tmpdir);
  assert.match(capture.calls[0].args[1], /DryMongoBinary\.getBinaryName\(options\)/);
  assert.equal(capture.calls[0].options.env.MONGOMS_ARCH, process.arch);
  assert.equal(capture.calls[0].options.env.MONGOMS_PLATFORM, process.platform);
  assert.equal(capture.calls[0].options.env.MONGOMS_USE_ARCHIVE_NAME_FOR_BINARY_NAME, 'false');
  assert.match(
    plan.mongo.cacheKey,
    new RegExp(`^ci-mongod-${process.platform}-${process.arch}-.+-memory-11\\.3\\.0-core-11\\.3\\.0-server-8\\.2\\.6-`),
  );
  assert.throws(
    () => resolvePlan(state, { env: { ...state.env, MONGOMS_SYSTEM_BINARY: '/usr/bin/mongod' } }),
    /machine-installed/,
  );
});

test('Mongo cache keys change with resolved server/core/memory versions, distro and download overrides', (t) => {
  const state = fixture(t, mongo);
  const baseline = resolvePlan(state).mongo.cacheKey;
  for (const config of [
    mongoConfig({ requestedVersion: '8.2.7', version: '8.2.7' }),
    mongoConfig({ os: { os: 'linux', dist: 'ubuntu', release: '22.04' } }),
    mongoConfig({ download: { mirror: 'https://downloads.example.org/mongo' } }),
    mongoConfig({
      download: {
        mirror: 'https://fastdl.mongodb.org',
        url: 'https://downloads.example.org/mongo.tgz',
        archiveName: 'mongo.tgz',
        distro: 'ubuntu-2404',
      },
    }),
  ])
    assert.notEqual(resolvePlan(state, { run: recorder({ json: config }).run }).mongo.cacheKey, baseline);
  for (const changed of ['mongodb-memory-server', 'mongodb-memory-server-core']) {
    assert.notEqual(
      resolvePlan(state, {
        packageResolver: (directory, name) => ({
          ...packages(directory, name),
          version: name === changed ? '11.2.0' : '11.3.0',
        }),
      }).mongo.cacheKey,
      baseline,
    );
  }
});

for (const [label, config, error] of [
  ['version mismatch', mongoConfig({ requestedVersion: '8.0.0' }), /configuration does not match/],
  ['invalid version', mongoConfig({ version: 'latest' }), /Invalid resolved mongod/],
  ['system fallback', mongoConfig({ systemBinary: '/usr/bin/mongod' }), /configuration does not match/],
  ['platform drift', mongoConfig({ platform: 'other' }), /configuration does not match/],
  ['arch drift', mongoConfig({ arch: 'other' }), /configuration does not match/],
  ['escaping binary', mongoConfig({ binaryName: '../mongod' }), /Unsafe resolved mongod/],
  ['missing OS', mongoConfig({ os: undefined }), /resolved Mongo OS configuration/],
  ['OS drift', mongoConfig({ os: { os: 'other' } }), /resolved Mongo OS configuration/],
  ['missing distro', mongoConfig({ os: { os: process.platform } }), /resolved Mongo OS configuration/],
  ['credential URL', mongoConfig({ download: { mirror: 'https://example.org/<redacted-synthetic-auth>/' } }), /Unsafe Mongo mirror/],
  ['queried URL', mongoConfig({ download: { url: 'https://example.org/mongo.tgz?token=secret' } }), /Unsafe Mongo URL/],
  ['non-HTTP URL', mongoConfig({ download: { url: 'file:///etc/mongod' } }), /Unsafe Mongo URL/],
  ['escaping archive name', mongoConfig({ download: { archiveName: '../mongo.tgz' } }), /Unsafe Mongo archiveName/],
  ['unsafe distro', mongoConfig({ download: { distro: 'ubuntu 24.04' } }), /Unsafe Mongo distro/],
]) {
  test(`Mongo planning fails closed on ${label}`, (t) => {
    const state = fixture(t, mongo);
    assert.throws(() => resolvePlan(state, { run: recorder({ json: config }).run }), error);
  });
}

test('plain/jsdom jobs set isolated TMPDIR without downloading browsers, databases or tools', (t) => {
  const state = fixture(t);
  const plan = resolvePlan(state);
  const capture = recorder();
  const prepared = preparePlan(plan, {
    run: capture.run,
    env: { ...state.env, VITEST_MAX_THREADS: '1' },
    log: noLog,
  });
  assert.equal(capture.calls.length, 0);
  assert.equal(prepared.env.TMPDIR, plan.tmpdir);
  assert.equal(prepared.env.VITEST_MAX_THREADS, '1');
  assert.deepEqual(resourceOutputs(plan), {
    'resource-directory': plan.resourceDirectory,
    browser: 'false',
    'browser-path': '',
    'browser-key': '',
    mongo: 'false',
    'mongo-path': '',
    'mongo-key': '',
  });
});

test('resource preparation rejects a changed TMPDIR before commands and fresh allocations cannot share test state', (t) => {
  const state = fixture(t);
  const first = resolvePlan(state);
  const second = resolvePlan(state);
  assert.notEqual(first.resourceDirectory, second.resourceDirectory);
  assert.notEqual(first.tmpdir, second.tmpdir);
  write(first.tmpdir, 'pubkey.bc/local-state', 'first job only');
  assert.equal(existsSync(resolve(second.tmpdir, 'pubkey.bc/local-state')), false);
  const capture = recorder();
  assert.throws(
    () =>
      preparePlan(
        { ...first, tmpdir: resolve(first.resourceDirectory, 'tmp') },
        {
          run: capture.run,
          env: state.env,
          log: noLog,
        },
      ),
    /TMPDIR must be the isolated resource directory/,
  );
  assert.equal(capture.calls.length, 0);
});

for (const hit of [undefined, '', 'false', 'true']) {
  test(`browser preflight installs system dependencies even with cache-hit ${String(hit)}`, (t) => {
    const state = fixture(t, browser);
    const plan = resolvePlan(state);
    const capture = recorder({ json: { chromium: '148.0.0.0' } });
    const prepared = preparePlan(plan, { run: capture.run, env: state.env, browserCacheHit: hit, log: noLog });
    assert.deepEqual(capture.calls[0].args, [plan.browser.cli, 'install-deps', 'chromium']);
    assert.equal(capture.calls.filter(({ args }) => args[1] === 'install').length, hit === 'true' ? 0 : 1);
    assert.match(capture.calls.at(-1).args[1], /\.launch\(\{ headless: true/);
    assert.match(capture.calls.at(-1).args[1], /page\.evaluate\(\(\) => 2 \+ 2\)/);
    assert.ok(
      capture.calls.every(
        ({ options }) =>
          options.env.PLAYWRIGHT_BROWSERS_PATH === plan.browser.directory && options.env.TMPDIR === plan.tmpdir,
      ),
    );
    assert.equal(prepared.observations.browser.cacheHit, hit === 'true');
    assert.deepEqual(prepared.observations.browser.versions, { chromium: '148.0.0.0' });
  });
}

test('browser preflight requires actual complete launch results; a cache hit cannot hide missing/broken engines', (t) => {
  const state = fixture(t, dpop);
  state.env.DPOP_TEST_BROWSERS = 'chromium,firefox';
  const plan = resolvePlan(state);
  for (const json of [
    {},
    { chromium: '148' },
    { chromium: '148', firefox: '' },
    { chromium: '148', firefox: '148', webkit: '18' },
  ])
    assert.throws(
      () => preparePlan(plan, { run: recorder({ json }).run, env: state.env, browserCacheHit: 'true', log: noLog }),
      /Incomplete real-browser/,
    );
  for (const output of ['no result', 'CI_RESOURCE_JSON={}\nCI_RESOURCE_JSON={}']) {
    const capture = recorder({ onCall: (name, args) => (name === 'node' && args[0] === '-e' ? output : undefined) });
    assert.throws(
      () => preparePlan(plan, { run: capture.run, env: state.env, browserCacheHit: 'true', log: noLog }),
      /Missing\/ambiguous/,
    );
  }
  assert.throws(
    () =>
      preparePlan(plan, {
        run: recorder({
          onCall: (name, args) => {
            if (name === 'node' && args[0] === '-e') throw new Error('cached Firefox launch failed');
          },
        }).run,
        env: state.env,
        browserCacheHit: 'true',
        log: noLog,
      }),
    /cached Firefox launch failed/,
  );
});

test('invalid cache-hit inputs cannot weaken resource preflight', (t) => {
  const state = fixture(t);
  const plan = resolvePlan(state);
  for (const key of ['browserCacheHit', 'mongoCacheHit'])
    for (const value of ['TRUE', '1', 'true\n', false]) {
      const capture = recorder();
      assert.throws(
        () => preparePlan(plan, { run: capture.run, env: state.env, [key]: value, log: noLog }),
        /Invalid resource cache-hit/,
      );
      assert.equal(capture.calls.length, 0);
    }
});

for (const hit of ['false', 'true']) {
  test(`Mongo ${hit === 'true' ? 'cache hit' : 'download miss'} preflight directly resolves and starts the exact isolated binary`, (t) => {
    const state = fixture(t, mongo);
    const plan = resolvePlan(state);
    const result = {
      binaryPath: plan.mongo.binaryPath,
      binaryVersion: '8.2.6',
      serverVersion: '8.2.6',
      sha256: 'b'.repeat(64),
    };
    const capture = recorder({ json: result });
    const prepared = preparePlan(plan, { run: capture.run, env: state.env, mongoCacheHit: hit, log: noLog });
    const script = capture.calls[0].args[1];
    assert.match(script, /new MongoBinaryDownload\(/);
    assert.ok(script.includes(`os: ${JSON.stringify(plan.mongo.os)}, checkMD5: true`));
    assert.match(script, /downloader\.getMongodPath\(\)/);
    assert.doesNotMatch(script, /MongoBinary\.getPath|locateBinary\(/);
    assert.match(script, new RegExp(`error\\.code !== 'ENOENT' \\|\\| ${hit}`));
    assert.match(script, /stat\.nlink !== 1/);
    assert.match(script, /stat\.mode & 0o7777/);
    assert.match(script, /MongoMemoryReplSet\.create/);
    assert.match(script, /command\(\{ ping: 1 \}\)/);
    assert.equal(capture.calls[0].options.env.MONGOMS_SYSTEM_BINARY, plan.mongo.binaryPath);
    assert.equal(prepared.observations.mongo.cacheHit, hit === 'true');
    assert.equal(prepared.observations.mongo.sha256, result.sha256);
    assert.equal(prepared.observations.mongo.binary, relative(state.consumer, plan.mongo.binaryPath));
  });
}

test('Mongo preflight rejects wrong binary path/version/server/hash, even when the cache claims a hit', (t) => {
  const state = fixture(t, mongo);
  const plan = resolvePlan(state);
  const result = {
    binaryPath: plan.mongo.binaryPath,
    binaryVersion: '8.2.6',
    serverVersion: '8.2.6',
    sha256: 'b'.repeat(64),
  };
  for (const [key, value] of [
    ['binaryPath', '/usr/bin/mongod'],
    ['binaryVersion', '8.0.0'],
    ['serverVersion', '8.0.0'],
    ['sha256', 'bad'],
  ])
    assert.throws(
      () =>
        preparePlan(plan, {
          run: recorder({ json: { ...result, [key]: value } }).run,
          env: state.env,
          mongoCacheHit: 'true',
          log: noLog,
        }),
      /availability\/version preflight mismatch/,
    );
});

for (const unsafe of ['missing', 'symlink', 'hardlink', 'unsafe-mode']) {
  test(`real Mongo cache boundary rejects ${unsafe} before download, startup or tests`, (t) => {
    const state = fixture(t, mongo);
    const packageResolver = (_directory, name, fromPackage) => resolvedPackage(repositoryRoot, name, fromPackage);
    const plan = resolvePlan(state, { packageResolver });
    mkdirSync(plan.mongo.directory);
    if (unsafe !== 'missing') {
      const outside = resolve(state.scratch, 'not-a-mongod');
      write(state.scratch, 'not-a-mongod', '#!/usr/bin/env node\nthrow new Error("unsafe cache executed");\n', 0o755);
      if (unsafe === 'symlink') symlinkSync(outside, plan.mongo.binaryPath);
      else if (unsafe === 'hardlink') linkSync(outside, plan.mongo.binaryPath);
      else writeFileSync(plan.mongo.binaryPath, 'not executable', { mode: 0o644 });
    }
    assert.throws(
      () => preparePlan(plan, { env: state.env, mongoCacheHit: 'true', log: noLog }),
      unsafe === 'missing' ? /ENOENT/ : /Unsafe cached\/downloaded mongod/,
    );
  });
}

function redisRecorder(onCall = () => undefined) {
  return recorder({
    onCall: (name, args, options) => {
      const custom = onCall(name, args, options);
      if (custom !== undefined) return custom;
      if (name !== 'docker') return;
      if (args[0] === '--version') return 'Docker version 29.9.3';
      if (args[0] === 'info') return '29.9.3';
      if (args[0] === 'image') return JSON.stringify([`redis@sha256:${'c'.repeat(64)}`]);
      if (args[0] === 'run')
        return `Redis server v=${args.includes('redis:6.2-alpine') ? '6.2.22' : '7.2.13'} sha=example`;
    },
  });
}

test('Redis preflight requires a daemon, pulls both real required tags and records image digests/server versions', (t) => {
  const state = fixture(t, '@web-ts-toolkit/express-oidc-vault-redis-store');
  const plan = resolvePlan(state);
  const capture = redisRecorder();
  const prepared = preparePlan(plan, { run: capture.run, env: state.env, log: noLog });
  assert.deepEqual(plan.redis, redisImages);
  assert.deepEqual(
    capture.calls.slice(0, 2).map(({ args }) => args),
    [['--version'], ['info', '--format', '{{.ServerVersion}}']],
  );
  assert.deepEqual(
    capture.calls.filter(({ args }) => args[0] === 'pull').map(({ args }) => args[1]),
    ['redis:6.2-alpine', 'redis:7.2-alpine'],
  );
  assert.ok(
    capture.calls
      .filter(({ args }) => args[0] === 'run')
      .every(({ args }) => args.includes('--rm') && args.includes('none')),
  );
  assert.deepEqual(
    prepared.observations.redis.images.map(({ version }) => version),
    ['6.2.22', '7.2.13'],
  );
});

test('Redis cannot silently skip a missing daemon, failed image pull, invalid digest or wrong server', (t) => {
  const state = fixture(t, '@web-ts-toolkit/express-oidc-vault-redis-store');
  const plan = resolvePlan(state);
  for (const [onCall, error] of [
    [(_name, args) => (args[0] === 'info' ? '' : undefined), /working Docker/],
    [
      (_name, args) => {
        if (args[0] === 'pull') throw new Error('pull denied');
      },
      /pull denied/,
    ],
    [(_name, args) => (args[0] === 'image' ? '[]' : undefined), /image digest/],
    [(_name, args) => (args[0] === 'image' ? '["redis:7.2-alpine"]' : undefined), /image digest/],
    [(_name, args) => (args[0] === 'run' ? 'Redis server v=5.0.0' : undefined), /version mismatch/],
  ])
    assert.throws(() => preparePlan(plan, { run: redisRecorder(onCall).run, env: state.env, log: noLog }), error);
});

test('unsupported Unix-socket checkout budget rejects restore before resources or tests', (t) => {
  const state = fixture(t, combined);
  const capture = recorder({ json: mongoConfig() });
  let resolutions = 0;
  const options = {
    workspaces: state.workspaces,
    model: state.model,
    contract,
    run: capture.run,
    packageResolver: (...args) => {
      resolutions += 1;
      return packages(...args);
    },
  };
  assert.throws(() => restoreWorkspace(state.consumer, state.env, options), /TMPDIR.*Unix-socket budget/);
  assert.equal(resolutions, 0);
  assert.equal(
    capture.calls.some(({ name }) => name === 'node' || name === 'docker'),
    false,
  );
  assert.equal(testCalls(capture.calls).length, 0);
  assert.equal(existsSync(resolve(state.consumer, contract.roots[0])), false);
  assert.deepEqual(
    readdirSync(state.consumer).filter((name) => /^_tmp[A-Za-z0-9]{6}$/.test(name)),
    [],
  );
});

test('restore validates the artifact before resource setup and exposes only isolated binary/download cache paths', (t) => {
  const state = fixture(t, combined);
  const capture = recorder({ json: mongoConfig() });
  const options = {
    ...fixtureResourceOptions,
    workspaces: state.workspaces,
    model: state.model,
    contract,
    packageResolver: packages,
    run: capture.run,
  };
  const outputs = restoreWorkspace(state.consumer, state.env, options);
  assert.deepEqual(
    readFileSync(resolve(state.consumer, 'packages/sample/dist/index.mjs')),
    readFileSync(resolve(state.root, 'packages/sample/dist/index.mjs')),
  );
  assert.equal(outputs.browser, 'true');
  assert.equal(outputs.mongo, 'true');
  assert.equal(dirname(outputs['browser-path']), outputs['resource-directory']);
  assert.equal(dirname(dirname(outputs['mongo-path'])), outputs['resource-directory']);
  assert.match(outputs['mongo-path'], /\/mongodb\/mongod-/);
  assert.equal(
    capture.calls.some(
      ({ name, args }) => name === 'docker' || args.includes('install') || args.includes('install-deps'),
    ),
    false,
  );
  assert.equal(testCalls(capture.calls).length, 0);
});

test('runner invokes exactly one validated full package command as argv, retaining worker/environment controls', (t) => {
  const state = fixture(t);
  const capture = recorder();
  const options = {
    ...fixtureResourceOptions,
    workspaces: state.workspaces,
    model: state.model,
    contract,
    run: capture.run,
    log: noLog,
  };
  const outputs = restoreWorkspace(state.consumer, state.env, options);
  const env = {
    ...state.env,
    CI_TEST_RESOURCE_DIR: outputs['resource-directory'],
    VITEST_MAX_THREADS: '1',
    NODE_OPTIONS: '--max-old-space-size=4096',
  };
  runWorkspace(state.consumer, env, options);
  assert.equal(testCalls(capture.calls).length, 1);
  const invocation = testCalls(capture.calls)[0];
  assert.deepEqual([invocation.name, invocation.args], ['pnpm', ['--filter', plain, 'test']]);
  assert.equal(invocation.options.cwd, state.consumer);
  assert.equal(invocation.options.inherit, true);
  assert.equal(invocation.options.env.VITEST_MAX_THREADS, '1');
  assert.equal(invocation.options.env.NODE_OPTIONS, '--max-old-space-size=4096');
  assert.equal(invocation.options.env.TMPDIR, outputs['resource-directory']);
  assert.equal(state.model.nodes[0].testScript, state.workspaces.get(plain).manifest.scripts.test);
});

test('workspace CLI rejects an unsupported real checkout before resource preparation or the complete script', (t) => {
  const state = fixture(t, combined);
  const capture = recorder({ json: mongoConfig() });
  let resolutions = 0;
  const options = {
    ...fixtureResourceOptions,
    workspaces: state.workspaces,
    model: state.model,
    contract,
    run: capture.run,
    log: noLog,
    packageResolver: (...args) => {
      resolutions += 1;
      return packages(...args);
    },
  };
  const outputs = restoreWorkspace(state.consumer, state.env, options);
  const before = resolutions;
  capture.calls.length = 0;
  const errors = [];
  assert.equal(
    runCli([], {
      ...options,
      tmpdirByteLength: Buffer.byteLength,
      root: state.consumer,
      env: { ...state.env, CI_TEST_RESOURCE_DIR: outputs['resource-directory'] },
      error: (message) => errors.push(message),
    }),
    1,
  );
  assert.match(errors[0], /TMPDIR.*Unix-socket budget/);
  assert.equal(resolutions, before);
  assert.equal(
    capture.calls.some(({ name }) => name === 'node' || name === 'docker'),
    false,
  );
  assert.equal(testCalls(capture.calls).length, 0);
});

test('test failures propagate without retry or a smaller fallback script', (t) => {
  const state = fixture(t);
  const capture = recorder({
    onCall: (name, args) => {
      if (name === 'pnpm' && args.at(-1) === 'test') throw new Error('full test failed');
    },
  });
  const options = {
    ...fixtureResourceOptions,
    workspaces: state.workspaces,
    model: state.model,
    contract,
    run: capture.run,
    log: noLog,
  };
  const outputs = restoreWorkspace(state.consumer, state.env, options);
  const errors = [];
  assert.equal(
    runCli([], {
      root: state.consumer,
      env: { ...state.env, CI_TEST_RESOURCE_DIR: outputs['resource-directory'] },
      ...options,
      error: (message) => errors.push(message),
    }),
    1,
  );
  assert.match(errors[0], /full test failed/);
  assert.equal(testCalls(capture.calls).length, 1);
});

test('invalid workspace inputs and corrupted/missing/cross-run artifacts fail before resources or test execution', (t) => {
  const state = fixture(t, browser);
  let resolutions = 0;
  const capture = recorder();
  const options = {
    ...fixtureResourceOptions,
    workspaces: state.workspaces,
    model: state.model,
    contract,
    run: capture.run,
    packageResolver: (...args) => {
      resolutions += 1;
      return packages(...args);
    },
  };
  for (const value of [undefined, 'pdf-reader', `${browser}...`, '*', `${browser};true`])
    assert.throws(
      () => restoreWorkspace(state.consumer, { ...state.env, CI_TEST_WORKSPACE: value }, options),
      /not allowlisted/,
    );
  for (const env of [
    { ...state.env, CI_TEST_ARTIFACT_DIGEST: 'b'.repeat(64) },
    { ...state.env, CI_TEST_ARTIFACT_DIGEST: '' },
    { ...state.env, CI_TEST_ARTIFACT_NAME: 'old-run' },
    { ...state.env, CI_TEST_ARTIFACT_DIR: undefined },
  ])
    assert.throws(
      () => restoreWorkspace(state.consumer, env, options),
      /SHA-256 mismatch|external artifact digest|exact run\/attempt\/checkout|Missing CI_TEST_ARTIFACT_DIR/,
    );
  rmSync(resolve(state.download, archiveFilename));
  assert.throws(() => runWorkspace(state.consumer, state.env, options), /Downloaded artifact contents/);
  assert.equal(resolutions, 0);
  assert.equal(testCalls(capture.calls).length, 0);
  assert.equal(
    capture.calls.some(({ name }) => name === 'node' || name === 'docker'),
    false,
  );
  assert.equal(existsSync(resolve(state.consumer, contract.roots[0])), false);
});

test('missing or mutated restored outputs stop execution before resource preflight', (t) => {
  const state = fixture(t, browser);
  const capture = recorder();
  const options = {
    ...fixtureResourceOptions,
    workspaces: state.workspaces,
    model: state.model,
    contract,
    run: capture.run,
    packageResolver: packages,
    log: noLog,
  };
  assert.throws(() => runWorkspace(state.consumer, state.env, options), /ENOENT|Missing output parent/);
  const outputs = restoreWorkspace(state.consumer, state.env, options);
  write(state.consumer, 'packages/sample/dist/index.mjs', 'changed');
  assert.throws(
    () => runWorkspace(state.consumer, { ...state.env, CI_TEST_RESOURCE_DIR: outputs['resource-directory'] }, options),
    /Restored output integrity/,
  );
  assert.equal(
    capture.calls.some(({ args }) => args.includes('install-deps')),
    false,
  );
  assert.equal(testCalls(capture.calls).length, 0);
});

for (const mutation of ['output', 'source', 'lock']) {
  test(`runner rechecks ${mutation} integrity after resource preflight immediately before testing`, (t) => {
    const state = fixture(t, browser);
    let changed = false;
    const capture = recorder({
      onCall: (name, args) => {
        if (name === 'git' && args[0] === 'status' && changed && mutation === 'source')
          return ' M packages/sample/package.json';
        if (name === 'node' && args[0] === '-e') {
          changed = true;
          if (mutation === 'output') write(state.consumer, 'packages/sample/dist/index.mjs', 'resource changed output');
          if (mutation === 'lock') write(state.consumer, 'pnpm-lock.yaml', 'different lock');
          return 'CI_RESOURCE_JSON={"chromium":"148.0.0.0"}';
        }
      },
    });
    const options = {
      ...fixtureResourceOptions,
      workspaces: state.workspaces,
      model: state.model,
      contract,
      run: capture.run,
      packageResolver: packages,
      log: noLog,
    };
    const outputs = restoreWorkspace(state.consumer, state.env, options);
    assert.throws(
      () =>
        runWorkspace(
          state.consumer,
          { ...state.env, CI_TEST_RESOURCE_DIR: outputs['resource-directory'], CI_TEST_BROWSER_CACHE_HIT: 'true' },
          options,
        ),
      /Restored output integrity|clean tested-revision source|identity changed during resource/,
    );
    assert.equal(testCalls(capture.calls).length, 0);
  });
}

test('failed real-browser cache preflight prevents the complete package script from starting', (t) => {
  const state = fixture(t, browser);
  const capture = recorder({
    onCall: (name, args) => {
      if (name === 'node' && args[0] === '-e') throw new Error('cached browser is unavailable');
    },
  });
  const options = {
    ...fixtureResourceOptions,
    workspaces: state.workspaces,
    model: state.model,
    contract,
    run: capture.run,
    packageResolver: packages,
    log: noLog,
  };
  const outputs = restoreWorkspace(state.consumer, state.env, options);
  assert.throws(
    () =>
      runWorkspace(
        state.consumer,
        { ...state.env, CI_TEST_RESOURCE_DIR: outputs['resource-directory'], CI_TEST_BROWSER_CACHE_HIT: 'true' },
        options,
      ),
    /cached browser is unavailable/,
  );
  assert.equal(testCalls(capture.calls).length, 0);
});

test('separate restores/resource directories cannot share dependencies, compiled outputs or mutable cache inputs', (t) => {
  const state = fixture(t);
  const capture = recorder();
  const options = {
    ...fixtureResourceOptions,
    workspaces: state.workspaces,
    model: state.model,
    contract,
    run: capture.run,
    log: noLog,
  };
  const first = restoreWorkspace(state.consumer, state.env, options);
  const other = resolve(state.scratch, 'other');
  mkdirSync(resolve(other, 'packages/sample'), { recursive: true });
  for (const path of [
    'package.json',
    '.tool-versions',
    'pnpm-lock.yaml',
    'packages/create-access-router-mongo-starter/template/package.json',
  ])
    write(other, path, readFileSync(resolve(state.consumer, path)));
  const second = restoreWorkspace(other, state.env, options);
  assert.notEqual(first['resource-directory'], second['resource-directory']);
  const before = inventoryOutputs(other, contract);
  write(state.consumer, 'packages/sample/dist/index.mjs', 'one checkout rebuild only');
  write(state.consumer, 'node_modules/local-cache', 'one checkout dependency state');
  write(first['resource-directory'], 'local-test-state', 'one checkout resource state');
  assert.deepEqual(inventoryOutputs(other, contract), before);
  assert.equal(existsSync(resolve(other, 'node_modules')), false);
  assert.equal(existsSync(resolve(second['resource-directory'], 'local-test-state')), false);
  assert.equal(sha256(readFileSync(resolve(state.download, archiveFilename))), state.env.CI_TEST_ARTIFACT_DIGEST);
  assert.deepEqual(inventoryOutputs(state.root, contract), before);
});

test('workspace CLI accepts no subset, extra-filter, skip-resource or reuse-output mode', () => {
  for (const args of [
    ['test'],
    ['--filter', plain],
    ['restore', '--skip-template'],
    ['setup', '--skip-probes'],
    ['--skip-resources'],
    ['--reuse-dist'],
  ]) {
    const errors = [];
    assert.equal(runCli(args, { error: (message) => errors.push(message) }), 1);
    assert.match(errors[0], /Usage:/);
  }
});
