import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createCiTestModel, loadWorkspaces } from './ci-test-plan.mjs';
import {
  archiveFilename,
  artifactName,
  assertCleanSource,
  assertOutputDestinations,
  checkoutIdentity,
  decodeArchive,
  encodeArchive,
  githubValues,
  ignoredScratch,
  inventoryOutputs,
  normalizedPath,
  outputContract,
  prepareArtifacts,
  readDownloadedArchive,
  restoreOutputs,
  reviewedOutputRoots,
  runCli,
  sha256,
  toolchainPins,
  validateStarter,
  verifyRestoredOutputs,
} from './ci-test-artifacts.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const identity = {
  checkoutSha: 'a'.repeat(40),
  runId: '12345',
  runAttempt: '2',
  platform: 'linux',
  arch: 'x64',
  node: process.versions.node,
  pnpm: '11.24.0',
  lockSha256: sha256('frozen lock'),
};
const contract = {
  roots: ['packages/sample/dist'],
  files: [{ path: 'packages/sample/dist/cli.js', mode: 0o755 }, { path: 'packages/sample/dist/index.mjs' }],
  starter: false,
};

function write(root, path, data, mode = 0o644) {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true, mode: 0o755 });
  writeFileSync(target, data, { mode });
  chmodSync(target, mode);
}

function fixture(t, { outputs = true } = {}) {
  const scratch = mkdtempSync(resolve(repositoryRoot, '_tmp-ci-artifact-test-'));
  assert.equal(spawnSync('git', ['check-ignore', scratch], { cwd: repositoryRoot }).status, 0);
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const root = resolve(scratch, 'source');
  const consumer = resolve(scratch, 'consumer');
  for (const directory of [root, consumer]) {
    write(directory, 'packages/sample/package.json', '{"name":"sample"}\n');
    write(directory, 'package.json', '{"packageManager":"pnpm@11.24.0"}\n');
    write(directory, '.tool-versions', `nodejs ${process.versions.node}\npnpm 11.24.0\n`);
    write(
      directory,
      'packages/create-access-router-mongo-starter/template/package.json',
      '{"packageManager":"pnpm@11.24.0"}',
    );
    write(directory, 'pnpm-lock.yaml', 'frozen lock');
    write(directory, 'VERSION', '1.2.3\n');
  }
  if (outputs) seedOutputs(root);
  return { scratch, root, consumer };
}

function seedOutputs(root) {
  write(root, 'packages/sample/dist/index.mjs', 'export const value = 42;\n');
  write(root, 'packages/sample/dist/cli.js', '#!/usr/bin/env node\nconsole.log("restored-cli");\n', 0o755);
  write(root, 'packages/sample/dist/.hidden/.env.example', 'PUBLIC_EXAMPLE=example\n');
  write(root, 'packages/sample/dist/template/pnpm-lock.yaml', 'legitimate generated lock\n');
}

function metadata(entries) {
  return entries.map(({ data, ...entry }) => ({ ...entry, size: data.length, sha256: sha256(data) }));
}

// Independent handwritten USTAR fixture. It does not use the production
// encoder/schema, so unsafe types, names, modes, sizes and headers can reach
// the reader rather than being rejected by the writer first.
function tarEntry(path, data, { flag = '0', mode = 0o644, link = '', prefix = '', declaredSize = data.length } = {}) {
  const header = Buffer.alloc(512);
  header.write(path, 0, 100);
  for (const [offset, length, value] of [
    [100, 8, mode],
    [108, 8, 0],
    [116, 8, 0],
    [124, 12, declaredSize],
    [136, 12, 0],
  ])
    header.write(`${value.toString(8).padStart(length - 1, '0')}\0`, offset, length);
  header.fill(32, 148, 156);
  header.write(flag, 156, 1);
  header.write(link, 157, 100);
  header.write('ustar\0', 257, 6);
  header.write('00', 263, 2);
  header.write(prefix, 345, 155);
  header.write(
    `${header
      .reduce((sum, byte) => sum + byte, 0)
      .toString(8)
      .padStart(6, '0')}\0 `,
    148,
    8,
  );
  return Buffer.concat([header, data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}

function independentArchive(root, mutate = () => {}) {
  const entries = inventoryOutputs(root, contract).map((entry) => ({
    ...entry,
    data: entry.type === 'file' ? readFileSync(resolve(root, entry.path)) : Buffer.alloc(0),
  }));
  const manifest = {
    schema: 1,
    identity: { ...identity },
    requiredRoots: [...contract.roots],
    requiredFiles: structuredClone(contract.files),
    entries: metadata(entries),
  };
  const state = { manifest, entries, extra: [], ending: Buffer.alloc(1024) };
  mutate(state);
  return gzipSync(
    Buffer.concat([
      tarEntry('.ci-test-manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)),
      ...state.entries.map((entry) =>
        tarEntry(entry.path, entry.data, { flag: entry.type === 'directory' ? '5' : '0', mode: entry.mode }),
      ),
      ...state.extra,
      state.ending,
    ]),
  );
}

const read = (bytes, expected = identity, digest = sha256(bytes)) => decodeArchive(bytes, digest, expected, contract);

test('resource scratch alone uses a compact fresh ignored mkdtemp name without changing build/restore scratch', (t) => {
  const { consumer } = fixture(t, { outputs: false });
  const first = ignoredScratch(consumer, 'resources');
  const second = ignoredScratch(consumer, 'resources');
  assert.notEqual(first, second);
  for (const directory of [first, second]) {
    assert.match(directory.slice(consumer.length + 1), /^_tmp[A-Za-z0-9]{6}$/);
    assert.equal(Buffer.byteLength(directory, 'utf8') - Buffer.byteLength(consumer, 'utf8'), 11);
    assert.equal(lstatSync(directory).isDirectory(), true);
    assert.equal(lstatSync(directory).isSymbolicLink(), false);
    assert.equal(spawnSync('git', ['check-ignore', directory], { cwd: consumer }).status, 0);
  }
  for (const label of ['prepare', 'restore', 'tools'])
    assert.ok(ignoredScratch(consumer, label).startsWith(`${consumer}/_tmp-ci-test-${label}-`));
});

test('actual pnpm-discovered output contract includes exactly 31 roots, six build-only apps and all published entrypoints', () => {
  const workspaces = loadWorkspaces();
  const model = createCiTestModel(workspaces);
  const actual = outputContract(repositoryRoot, workspaces, model);
  assert.equal(actual.roots.length, 31);
  assert.equal(model.buildOnlyWorkspaces.length, 6);
  assert.deepEqual(actual.roots, [...reviewedOutputRoots]);
  for (const path of [
    'apps/runtime/dist/app.js',
    'apps/nodejs/dist/index.js',
    'apps/mongoose-rxdb-example/dist/index.js',
    'apps/oidc-vault-dpop-example/dist/client/index.html',
    'apps/oidc-vault-dpop-example/dist/server/index.mjs',
    'packages/access-router-runtime/dist/tsconfig.package.json',
    'packages/access-router-runtime/dist/tsconfig.json',
    'packages/express-runtime/dist/cli.js',
    'packages/mongoose-rxdb/dist/storage/index.mjs',
    'packages/create-access-router-mongo-starter/dist/template/pnpm-lock.yaml',
    'packages/create-access-router-mongo-starter/dist/template/.env.example',
  ])
    assert.ok(
      actual.files.some((entry) => entry.path === path),
      path,
    );
  assert.equal(actual.files.filter((file) => file.mode === 0o755).length, 5);
  assert.deepEqual(
    actual.files.filter((file) => file.allowEmpty),
    [{ path: 'packages/express-oidc-vault/dist/wire.mjs', allowEmpty: true }],
  );
  assert.throws(
    () => outputContract(repositoryRoot, workspaces, { ...model, buildWorkspaces: model.buildWorkspaces.slice(1) }),
    /coverage mismatch/,
  );
  const modified = new Map(workspaces);
  modified.set('@web-ts-toolkit/utils', {
    ...workspaces.get('@web-ts-toolkit/utils'),
    directory: 'packages/renamed-utils',
  });
  assert.throws(() => outputContract(repositoryRoot, modified, model), /coverage mismatch/);
});

test('the sole empty type-only ESM output still requires exact presence/hash; runtime source changes require review', (t) => {
  const { root, consumer } = fixture(t);
  const workspaces = loadWorkspaces();
  const model = createCiTestModel(workspaces);
  const sourcePath = 'packages/express-oidc-vault/src/wire.ts';
  write(root, sourcePath, 'export interface Wire { value: string }\nexport type WireKind = "a";\n');
  const required = outputContract(root, workspaces, model).files.find((entry) => entry.allowEmpty);
  const emptyContract = {
    roots: ['packages/express-oidc-vault/dist'],
    files: [required, { path: 'packages/express-oidc-vault/dist/wire.d.mts' }],
    starter: false,
  };
  write(root, required.path, '');
  write(root, emptyContract.files[1].path, 'export interface Wire { value: string }\n');
  write(consumer, 'packages/express-oidc-vault/package.json', '{}');
  const bytes = encodeArchive(root, identity, emptyContract);
  const archive = decodeArchive(bytes, sha256(bytes), identity, emptyContract);
  const emptyEntry = archive.manifest.entries.find((entry) => entry.path === required.path);
  assert.equal(emptyEntry.size, 0);
  assert.equal(emptyEntry.sha256, sha256(''));
  restoreOutputs(consumer, archive, emptyContract);
  verifyRestoredOutputs(consumer, archive, emptyContract);
  assert.equal(lstatSync(resolve(consumer, required.path)).size, 0);
  assert.throws(
    () =>
      decodeArchive(bytes, sha256(bytes), identity, {
        ...emptyContract,
        files: emptyContract.files.map(({ path }) => ({ path })),
      }),
    /Required artifact files mismatch/,
  );
  rmSync(resolve(root, required.path));
  assert.throws(() => inventoryOutputs(root, emptyContract), /required output file/);
  write(root, required.path, '');
  write(root, emptyContract.files[1].path, '');
  assert.throws(() => inventoryOutputs(root, emptyContract), /required output file/);
  write(root, sourcePath, 'export const runtimeValue = 42;\n');
  assert.throws(() => outputContract(root, workspaces, model), /formerly type-only/);
});

test('independent archive and production encoder preserve complete inventory, hidden files and executable modes', (t) => {
  const { root, consumer } = fixture(t);
  for (const bytes of [independentArchive(root), encodeArchive(root, identity, contract)]) {
    const archive = read(bytes);
    assert.deepEqual(archive.manifest.identity, identity);
    assert.ok(archive.entries.some((entry) => entry.path.endsWith('/.hidden/.env.example')));
    restoreOutputs(consumer, archive, contract);
    verifyRestoredOutputs(consumer, archive, contract);
    const cli = resolve(consumer, 'packages/sample/dist/cli.js');
    assert.equal(lstatSync(cli).mode & 0o777, 0o755);
    assert.equal(
      spawnSync(cli, [], { cwd: consumer, encoding: 'utf8', env: { ...process.env, TMPDIR: consumer } }).stdout.trim(),
      'restored-cli',
    );
    assert.equal(
      readFileSync(resolve(consumer, 'packages/sample/dist/.hidden/.env.example'), 'utf8'),
      'PUBLIC_EXAMPLE=example\n',
    );
    assert.equal(readFileSync(resolve(consumer, 'pnpm-lock.yaml'), 'utf8'), 'frozen lock');
    rmSync(resolve(consumer, 'packages/sample/dist'), { recursive: true });
  }
});

test('genuine starter-style private staging directories retain their safe 0700 mode after restore', (t) => {
  const { root, consumer } = fixture(t);
  const path = 'packages/sample/dist/template';
  chmodSync(resolve(root, path), 0o700);
  const archive = read(encodeArchive(root, identity, contract));
  assert.equal(archive.manifest.entries.find((entry) => entry.path === path).mode, 0o700);
  restoreOutputs(consumer, archive, contract);
  verifyRestoredOutputs(consumer, archive, contract);
  assert.equal(lstatSync(resolve(consumer, path)).mode & 0o7777, 0o700);
  assert.equal(lstatSync(resolve(root, path)).mode & 0o7777, 0o700);
});

for (const path of [
  '/absolute',
  '../escape',
  'packages/sample/dist/../../package.json',
  'packages//sample/dist/file',
  'packages/sample/dist/./file',
  'C:/windows',
  'packages\\sample\\dist\\file',
  'packages/sample/dist/file\nname',
  'packages/sample/dist/',
]) {
  test(`archive rejects non-normalized path ${JSON.stringify(path)} before restore`, (t) => {
    const { root, consumer } = fixture(t);
    const bytes = independentArchive(root, (state) => state.extra.push(tarEntry(path, Buffer.from('unsafe'))));
    assert.throws(() => read(bytes), /Unsafe\/non-normalized/);
    assert.equal(existsSync(resolve(consumer, 'packages/sample/dist')), false);
    assert.throws(() => normalizedPath(path), /Unsafe\/non-normalized/);
  });
}

for (const [path, error] of [
  ['package.json', /outside output roots/],
  ['pnpm-lock.yaml', /outside output roots/],
  ['packages/sample/src/index.ts', /outside output roots/],
  ['packages/sample/dist/node_modules/index.js', /Forbidden/],
  ['packages/sample/dist/.env', /Forbidden/],
  ['packages/sample/dist/sub/.env.production', /Forbidden/],
  ['packages/sample/dist/.npmrc', /Forbidden/],
  ['packages/sample/dist/.cache/profile', /Forbidden/],
  ['packages/sample/dist/mongod-x64', /Forbidden/],
  ['packages/sample/dist/secret.pem', /Forbidden/],
  ['packages/sample/dist/ms-playwright/chrome', /Forbidden/],
  ['packages/sample/dist/chromium-1234/chrome', /Forbidden/],
  ['packages/sample/dist/.local-browsers/firefox', /Forbidden/],
  ['packages/sample/dist/id_ed25519', /Forbidden/],
]) {
  test(`archive rejects boundary/private entry ${path}`, (t) => {
    const { root } = fixture(t);
    const bytes = independentArchive(root, (state) => {
      const entry = { path, type: 'file', mode: 0o644, data: Buffer.from('unsafe') };
      state.entries.push(entry);
      state.manifest.entries = metadata(state.entries);
    });
    assert.throws(() => read(bytes), error);
  });
}

for (const [flag, link] of [
  ['1', 'packages/sample/dist/index.mjs'],
  ['2', 'index.mjs'],
  ['2', '../../../package.json'],
  ['2', '/etc/passwd'],
  ['3', ''],
  ['4', ''],
  ['6', ''],
  ['x', ''],
  ['L', ''],
]) {
  test(`archive rejects link/special/extended type ${flag} (${link || 'no link'})`, (t) => {
    const { root } = fixture(t);
    const bytes = independentArchive(root, (state) =>
      state.extra.push(tarEntry('packages/sample/dist/unsafe', Buffer.alloc(0), { flag, link })),
    );
    assert.throws(() => read(bytes), /Unsupported artifact link\/special\/metadata/);
  });
}

for (const mode of [0o777, 0o666, 0o700, 0o4755, 0o2755, 0o1644]) {
  test(`archive rejects unsafe file mode ${mode.toString(8)}`, (t) => {
    const { root } = fixture(t);
    assert.throws(
      () =>
        read(
          independentArchive(root, (state) =>
            state.extra.push(tarEntry('packages/sample/dist/unsafe', Buffer.from('x'), { mode })),
          ),
        ),
      /Unsafe artifact mode/,
    );
  });
}

for (const mode of [0o777, 0o775, 0o750, 0o600, 0o4755, 0o2755, 0o1755]) {
  test(`archive and preparation reject noncanonical/unsafe directory mode ${mode.toString(8)}`, (t) => {
    const { root } = fixture(t);
    assert.throws(
      () =>
        read(
          independentArchive(root, (state) =>
            state.extra.push(tarEntry('packages/sample/dist/unsafe', Buffer.alloc(0), { flag: '5', mode })),
          ),
        ),
      /Unsafe artifact mode/,
    );
    chmodSync(resolve(root, 'packages/sample/dist/template'), mode);
    try {
      assert.throws(() => inventoryOutputs(root, contract), /Unsafe artifact mode/);
    } finally {
      chmodSync(resolve(root, 'packages/sample/dist/template'), 0o755);
    }
  });
}

for (const key of ['checkoutSha', 'runId', 'runAttempt', 'platform', 'arch', 'node', 'pnpm', 'lockSha256']) {
  test(`restore rejects incompatible ${key} identity`, (t) => {
    const { root } = fixture(t);
    assert.throws(() => read(independentArchive(root), { ...identity, [key]: 'different' }), /identity mismatch/);
  });
}

test('expected digest is external and required; self-consistent tampering does not satisfy it', (t) => {
  const { root } = fixture(t);
  const bytes = independentArchive(root);
  assert.throws(() => read(bytes, identity, ''), /external artifact digest/);
  assert.throws(() => read(bytes, identity, 'a'.repeat(64)), /SHA-256 mismatch/);
  const tampered = independentArchive(root, (state) => {
    state.entries.find((entry) => entry.path.endsWith('/index.mjs')).data = Buffer.from('tampered');
    state.manifest.entries = metadata(state.entries);
  });
  assert.throws(() => read(tampered, identity, sha256(bytes)), /SHA-256 mismatch/);
});

test('reader rejects duplicate paths, omitted required files/roots, changed payload, mode and manifest inventories', (t) => {
  const { root } = fixture(t);
  const cases = [
    [(state) => state.extra.push(tarEntry('packages/sample/dist/index.mjs', Buffer.from('duplicate'))), /Duplicate/],
    [
      (state) => {
        state.entries = state.entries.filter((entry) => !entry.path.endsWith('/index.mjs'));
        state.manifest.entries = metadata(state.entries);
      },
      /required output file/,
    ],
    [
      (state) => {
        state.entries.find((entry) => entry.path.endsWith('/index.mjs')).data = Buffer.alloc(0);
        state.manifest.entries = metadata(state.entries);
      },
      /required output file/,
    ],
    [
      (state) => {
        state.entries = state.entries.filter((entry) => entry.path !== contract.roots[0]);
        state.manifest.entries = metadata(state.entries);
      },
      /required output root/,
    ],
    [
      (state) => {
        state.entries.find((entry) => entry.path.endsWith('/index.mjs')).data = Buffer.from('corruption');
      },
      /inventory\/hash\/mode mismatch/,
    ],
    [
      (state) => {
        state.entries.find((entry) => entry.path.endsWith('/cli.js')).mode = 0o644;
      },
      /inventory\/hash\/mode mismatch/,
    ],
    [
      (state) => {
        state.manifest.requiredRoots = [];
      },
      /Required artifact roots mismatch/,
    ],
    [
      (state) => {
        state.manifest.requiredFiles = [];
      },
      /Required artifact files mismatch/,
    ],
    [
      (state) => {
        state.manifest.schema = 2;
      },
      /manifest version mismatch/,
    ],
    [
      (state) => {
        state.manifest.ignored = true;
      },
      /manifest schema mismatch/,
    ],
    [
      (state) => {
        state.manifest.entries[0].type = 'hardlink';
      },
      /Unsupported artifact entry type/,
    ],
    [
      (state) => {
        state.manifest.entries[0].size = -1;
      },
      /Invalid artifact size\/hash/,
    ],
    [
      (state) => {
        state.manifest.entries[0].sha256 = 'bad';
      },
      /Invalid artifact size\/hash/,
    ],
    [
      (state) => {
        state.manifest.entries[0].owner = 'user';
      },
      /entry schema mismatch/,
    ],
    [
      (state) => {
        state.manifest.entries.push(state.manifest.entries[0]);
      },
      /Duplicate/,
    ],
    [
      (state) => {
        state.ending = Buffer.alloc(512);
      },
      /termination/,
    ],
    [
      (state) => {
        state.ending = Buffer.concat([Buffer.alloc(1024), Buffer.from('extra')]);
      },
      /termination/,
    ],
  ];
  for (const [mutate, pattern] of cases) assert.throws(() => read(independentArchive(root, mutate)), pattern);
});

test('download requires one regular archive with the exact current name, never a prefix/cross-run fallback', (t) => {
  const { root, scratch } = fixture(t);
  const directory = resolve(scratch, 'download');
  mkdirSync(directory);
  const bytes = independentArchive(root);
  write(directory, archiveFilename, bytes);
  const name = artifactName(identity);
  assert.equal(
    readDownloadedArchive(directory, name, sha256(bytes), identity, contract).entries.length,
    inventoryOutputs(root, contract).length,
  );
  for (const wrong of ['ci-test-build', `${name}-old`, artifactName({ ...identity, runAttempt: '1' })])
    assert.throws(
      () => readDownloadedArchive(directory, wrong, sha256(bytes), identity, contract),
      /exact run\/attempt\/checkout/,
    );
  write(directory, 'digest.txt', sha256(bytes));
  assert.throws(
    () => readDownloadedArchive(directory, name, sha256(bytes), identity, contract),
    /Downloaded artifact contents/,
  );
  rmSync(resolve(directory, 'digest.txt'));
  rmSync(resolve(directory, archiveFilename));
  assert.throws(
    () => readDownloadedArchive(directory, name, sha256(bytes), identity, contract),
    /Downloaded artifact contents/,
  );
  write(scratch, 'outside-archive', bytes);
  symlinkSync(resolve(scratch, 'outside-archive'), resolve(directory, archiveFilename));
  assert.throws(() => readDownloadedArchive(directory, name, sha256(bytes), identity, contract), /Unsafe\/oversized/);
});

test('restore validates staging before mutation and cannot overwrite existing or symlinked checkout paths', (t) => {
  const { root, consumer, scratch } = fixture(t);
  const archive = read(independentArchive(root));
  const originalManifest = readFileSync(resolve(consumer, 'package.json'));
  const originalLock = readFileSync(resolve(consumer, 'pnpm-lock.yaml'));
  const bad = structuredClone(archive);
  bad.entries[0].path = '../escape';
  assert.throws(() => restoreOutputs(consumer, bad, contract), /Restore inventory mismatch/);
  assert.equal(existsSync(resolve(consumer, 'packages/sample/dist')), false);
  mkdirSync(resolve(consumer, 'packages/sample/dist'));
  assert.throws(() => restoreOutputs(consumer, archive, contract), /absent for a clean/);
  rmSync(resolve(consumer, 'packages/sample/dist'), { recursive: true });
  symlinkSync(resolve(scratch, 'outside'), resolve(consumer, 'packages/sample/dist'));
  assert.throws(() => restoreOutputs(consumer, archive, contract), /absent for a clean/);
  rmSync(resolve(consumer, 'packages/sample/dist'));
  rmSync(resolve(consumer, 'packages/sample'), { recursive: true });
  mkdirSync(resolve(scratch, 'outside'));
  symlinkSync(resolve(scratch, 'outside'), resolve(consumer, 'packages/sample'));
  assert.throws(() => restoreOutputs(consumer, archive, contract), /Unsafe output parent/);
  assert.deepEqual(readFileSync(resolve(consumer, 'package.json')), originalManifest);
  assert.deepEqual(readFileSync(resolve(consumer, 'pnpm-lock.yaml')), originalLock);
  assert.deepEqual(readdirSync(resolve(scratch, 'outside')), []);
});

test('tracked output destinations fail closed, and incomplete staged template validation leaves no outputs', (t) => {
  const { root, consumer } = fixture(t);
  assert.throws(
    () => assertOutputDestinations(consumer, contract, { run: () => 'tracked source' }),
    /tracked source\/configuration/,
  );
  const archive = read(independentArchive(root));
  assert.throws(
    () =>
      restoreOutputs(
        consumer,
        archive,
        { ...contract, starter: true },
        {
          verifyTemplate: () => {
            throw new Error('incomplete real staged template');
          },
        },
      ),
    /incomplete real staged template/,
  );
  assert.equal(existsSync(resolve(consumer, 'packages/sample/dist')), false);
});

test('source/output links and unsafe modes are rejected, not silently excluded from preparation', (t) => {
  const { root, scratch } = fixture(t);
  const path = 'packages/sample/dist/link';
  symlinkSync('index.mjs', resolve(root, path));
  assert.throws(() => inventoryOutputs(root, contract), /Unsupported artifact link\/special/);
  rmSync(resolve(root, path));
  linkSync(resolve(root, 'packages/sample/dist/index.mjs'), resolve(root, path));
  assert.throws(() => inventoryOutputs(root, contract), /Unsupported artifact link\/special/);
  rmSync(resolve(root, path));
  chmodSync(resolve(root, 'packages/sample/dist/index.mjs'), 0o666);
  assert.throws(() => inventoryOutputs(root, contract), /Unsafe artifact mode/);
  chmodSync(resolve(root, 'packages/sample/dist/index.mjs'), 0o644);
  write(root, 'packages/sample/dist/.env.local', 'private');
  assert.throws(() => inventoryOutputs(root, contract), /Forbidden/);
  assert.equal(existsSync(resolve(scratch, 'escape')), false);
});

test('consumer rebuilds cannot alter the preparation archive or another separately restored runner', (t) => {
  const { root, consumer, scratch } = fixture(t);
  const bytes = encodeArchive(root, identity, contract);
  const digest = sha256(bytes);
  const archive = read(bytes);
  const second = resolve(scratch, 'second-consumer');
  write(second, 'packages/sample/package.json', '{}');
  restoreOutputs(consumer, archive, contract);
  restoreOutputs(second, archive, contract);
  write(consumer, 'packages/sample/dist/index.mjs', 'local rebuild only');
  assert.throws(() => verifyRestoredOutputs(consumer, archive, contract), /Restored output integrity/);
  verifyRestoredOutputs(second, archive, contract);
  assert.equal(sha256(bytes), digest);
  assert.deepEqual(inventoryOutputs(root, contract), archive.manifest.entries);
});

test('preparation executes exactly one complete pnpm build and rejects stale outputs and build/identity failures', (t) => {
  const { root } = fixture(t, { outputs: false });
  const calls = [];
  const env = {
    ...process.env,
    GITHUB_SHA: identity.checkoutSha,
    GITHUB_RUN_ID: identity.runId,
    GITHUB_RUN_ATTEMPT: identity.runAttempt,
  };
  const run = (name, args, options) => {
    calls.push([name, args, options]);
    if (name === 'git' && args[0] === 'rev-parse') return identity.checkoutSha;
    if (name === 'git') return '';
    if (args[0] === '--version') return '11.24.0';
    assert.deepEqual([name, args], ['pnpm', ['build']]);
    assert.ok(options.env.TMPDIR.startsWith(`${root}/_tmp-ci-test-prepare-`));
    seedOutputs(root);
    return '';
  };
  const outputs = prepareArtifacts(root, env, { run, contract });
  assert.equal(outputs['artifact-name'], artifactName(identity));
  assert.equal(calls.filter(([name, args]) => name === 'pnpm' && args[0] === 'build').length, 1);
  assert.equal(sha256(readFileSync(outputs['artifact-path'])), outputs['artifact-digest']);
  assert.throws(() => assertCleanSource(root, () => ' M packages/sample/src/index.ts'), /clean tested-revision source/);
  assert.throws(() => assertCleanSource(root, () => '?? packages/sample/src/extra.ts'), /clean tested-revision source/);
  assert.throws(
    () =>
      prepareArtifacts(root, env, {
        run: (name, args, options) => (args[0] === 'status' ? ' M package.json' : run(name, args, options)),
        contract,
      }),
    /clean tested-revision source/,
  );
  assert.throws(() => prepareArtifacts(root, env, { run, contract }), /absent for a clean build\/restore/);
  rmSync(resolve(root, contract.roots[0]), { recursive: true });
  assert.throws(
    () =>
      prepareArtifacts(root, env, {
        contract,
        run: (name, args, options) => {
          if (args[0] === 'build') throw new Error('build failed');
          return run(name, args, options);
        },
      }),
    /build failed/,
  );
  let built = false;
  assert.throws(
    () =>
      prepareArtifacts(root, env, {
        contract,
        run: (name, args, options) => {
          if (name === 'git' && args[0] === 'rev-parse' && built) return 'b'.repeat(40);
          const result = run(name, args, options);
          if (args[0] === 'build') built = true;
          return result;
        },
      }),
    /Actual checkout SHA/,
  );
});

test('toolchain and checkout/run identity are resolved, not trusted from artifact metadata', (t) => {
  const { root } = fixture(t);
  assert.deepEqual(toolchainPins(root), { node: process.versions.node, pnpm: '11.24.0', toolVersionsPnpm: '11.24.0' });
  const env = {
    GITHUB_SHA: identity.checkoutSha,
    GITHUB_RUN_ID: identity.runId,
    GITHUB_RUN_ATTEMPT: identity.runAttempt,
  };
  const run = (name) => (name === 'git' ? identity.checkoutSha : '11.24.0');
  assert.deepEqual(checkoutIdentity(root, env, run), { ...identity, platform: process.platform, arch: process.arch });
  assert.throws(() => checkoutIdentity(root, { ...env, GITHUB_SHA: 'b'.repeat(40) }, run), /Actual checkout SHA/);
  for (const key of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT'])
    for (const value of [undefined, '', '0', '-1', '2\n', 'any'])
      assert.throws(() => checkoutIdentity(root, { ...env, [key]: value }, run), /Missing\/invalid/);
  assert.throws(
    () => checkoutIdentity(root, env, (name) => (name === 'git' ? identity.checkoutSha : '11.24.0')),
    /Resolved CI Node\/pnpm/,
  );
  write(root, 'packages/create-access-router-mongo-starter/template/package.json', '{"packageManager":"pnpm@11.24.0"}');
  assert.throws(() => toolchainPins(root), /Root\/template packageManager/);
});

test('starter readiness rejects a successful unpublished-release skip and stale dependency/pnpm contracts', (t) => {
  const { root } = fixture(t);
  assert.throws(() => validateStarter(root), /complete staged starter template.*unpublished-release stage skip/);
  const path = 'packages/create-access-router-mongo-starter/dist/template/package.json';
  write(
    root,
    path,
    JSON.stringify({ packageManager: 'pnpm@11.24.0', dependencies: { '@web-ts-toolkit/access-router': '^0.1.0' } }),
  );
  assert.throws(() => validateStarter(root), /release dependency mismatch/);
  write(root, path, JSON.stringify({ packageManager: 'pnpm@11.24.0' }));
  assert.throws(() => validateStarter(root), /packageManager mismatch/);
  write(
    root,
    path,
    JSON.stringify({ packageManager: 'pnpm@11.24.0', dependencies: { '@web-ts-toolkit/access-router': '^1.2.3' } }),
  );
  const calls = [];
  validateStarter(root, root, (...args) => calls.push(args));
  assert.equal(calls.length, 1);
  assert.deepEqual(
    calls[0].slice(0, 2).map((value, index) => (index === 1 ? value.slice(0, 5) : value)),
    ['pnpm', ['--filter', 'create-access-router-mongo-starter', 'exec', 'tsx', '-e']],
  );
  assert.match(calls[0][1][5], /assertStagedTemplateReady/);
  assert.match(calls[0][1][5], /"releaseVersion":"1.2.3"/);
});

test('GitHub values reject injection; artifact CLI has no unchecked/legacy/bypass modes', (t) => {
  const { scratch } = fixture(t);
  const file = resolve(scratch, 'outputs');
  githubValues(file, { 'artifact-name': artifactName(identity), 'artifact-digest': 'a'.repeat(64) });
  assert.match(readFileSync(file, 'utf8'), /^artifact-name=ci-test-build-/);
  assert.throws(() => githubValues(file, { unsafe: 'name\nOTHER=value' }), /Unsafe GitHub/);
  assert.throws(() => githubValues(undefined, {}), /Missing GitHub/);
  for (const args of [[], ['restore'], ['prepare', '--skip-template'], ['prepare', '--reuse-dist']]) {
    const errors = [];
    assert.equal(runCli(args, { error: (message) => errors.push(message) }), 1);
    assert.match(errors[0], /Usage:/);
  }
});
