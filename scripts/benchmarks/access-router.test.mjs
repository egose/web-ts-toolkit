import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { after, test } from 'node:test';
import { benchmark, verifySnapshotFlagOptions } from './access-router-worker.mjs';
import {
  canonicalJson,
  fingerprint,
  inspectSnapshotDeclarations,
  integer,
  integerList,
  mapBounded,
  pnpmEnvironment,
  prepareTarget,
  reportRows,
  requireSelection,
  runLogged,
  saveReport,
  SCENARIOS,
  snapshotCandidates,
  snapshotFlagOptions,
  snapshotModeLabel,
  supportedSnapshotFlags,
  summarize,
  UNSAFE_SNAPSHOT_FLAGS,
  UNSAFE_INITIAL_OUTPUT_COPY_FLAGS,
  initialOutputCopyCandidates,
  initialOutputCopyFlagOptions,
  initialOutputCopyModeLabel,
  effectiveInitialOutputCopySkips,
  supportedInitialOutputCopyFlags,
  UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS,
  authorizationFastPathCandidates,
  authorizationFastPathFlagOptions,
  authorizationFastPathModeLabel,
  effectiveAuthorizationFastPathModes,
  supportedAuthorizationFastPathFlags,
} from './access-router-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporaryBase = process.env.WTT_BENCH_TMP ?? '/tmp/opencode';
await mkdir(temporaryBase, { recursive: true });
const temporary = await mkdtemp(resolve(temporaryBase, 'access-router-runner-tests-'));
after(() => rm(temporary, { recursive: true, force: true }));

test('numeric prompts reject invalid bounds/empty values and deduplicate matrices', () => {
  assert.equal(integer(' 24 ', 1, 100), 24);
  for (const value of ['', ' ', '-1', '1.2', 'Infinity', '1e3', '101', '0', '9007199254740993'])
    assert.throws(() => integer(value, 1, 100));
  assert.deepEqual(integerList('100, 1,10,100', 1, 1000), [1, 10, 100]);
  assert.throws(() => integerList('1,', 1, 100));
  assert.throws(() => integerList('1,2,3,4,5,6,7,8,9', 1, 100));
  assert.throws(() => requireSelection([]), /at least one/);
  assert.deepEqual(requireSelection(['current']), ['current']);
});

test('all advertised scenarios are uniquely selectable and include no-virtual paths', () => {
  assert.equal(new Set(SCENARIOS.map((scenario) => scenario.id)).size, SCENARIOS.length);
  for (const id of [
    'plain-narrow',
    'plain-wide',
    'hydrated',
    'global-rules',
    'document-rules',
    'large-config',
    'embedded',
    'populate',
    'virtuals',
  ])
    assert.ok(SCENARIOS.some((scenario) => scenario.id === id));
});

test('snapshot support comes from boolean model-option declarations, including shared chunks', async () => {
  const [first, second, third, fourth] = UNSAFE_SNAPSHOT_FLAGS;
  const declarations = [
    [
      'index.d.ts',
      `// ${fourth}?: boolean;
       interface AuthorizationConfiguration { ${fourth}?: boolean; }
       export interface DefaultModelRouterOptions {
         ${first}?: boolean;
         ${third}?: boolean | undefined;
         ${fourth}?: string;
       }
       export { ModelRouterOptions } from './chunk.js';`,
    ],
    ['chunk.d.ts', `export interface ModelRouterOptions { readonly '${second}'?: boolean; }`],
  ];
  assert.deepEqual(await supportedSnapshotFlags(declarations), [first, second, third]);
  const fakeRoot = resolve(temporary, 'flag-support');
  const directory = resolve(fakeRoot, 'packages/access-router/dist');
  await mkdir(directory, { recursive: true });
  for (const [name, text] of declarations) await writeFile(resolve(directory, name), text);
  const inspected = await inspectSnapshotDeclarations(fakeRoot);
  assert.deepEqual(inspected.supportedSnapshotFlags, [first, second, third]);
  assert.match(inspected.snapshotDeclarationsSha256, /^[a-f0-9]{64}$/);
  const implemented = await readFile(
    resolve(root, 'packages/access-router/src/acl/unsafe-snapshot-options.ts'),
    'utf8',
  );
  // Inspect the actual groups, not incidental quoted references elsewhere in the
  // source. The compiler is outside the measured worker process.
  const { default: ts } = await import('typescript');
  const { outputText } = ts.transpileModule(implemented, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  const exported = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  assert.deepEqual(exported.unsafeSnapshotCheckOptions, UNSAFE_SNAPSHOT_FLAGS);
  assert.deepEqual(exported.unsafeInitialOutputCopyOptions, UNSAFE_INITIAL_OUTPUT_COPY_FLAGS);
  assert.deepEqual(exported.unsafeSnapshotOptions, [...UNSAFE_SNAPSHOT_FLAGS, ...UNSAFE_INITIAL_OUTPUT_COPY_FLAGS]);
  assert.deepEqual(exported.unsafeAuthorizationFastPathOptions, UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS);
  assert.deepEqual(exported.unsafeServerOptions, [
    ...UNSAFE_SNAPSHOT_FLAGS,
    ...UNSAFE_INITIAL_OUTPUT_COPY_FLAGS,
    ...UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS,
  ]);
  assert.deepEqual(Object.keys(exported).sort(), [
    'authorizationFastPathPrerequisites',
    'captureAuthorizationFastPath',
    'unsafeAuthorizationFastPathOptions',
    'unsafeInitialOutputCopyOptions',
    'unsafeServerOptions',
    'unsafeSnapshotCheckOptions',
    'unsafeSnapshotOptions',
  ]);
});

test('per-build off/on/both selections become distinct candidates with explicit options', () => {
  const build = {
    id: 'current',
    label: 'Current',
    entry: '/built/index.mjs',
    supportedSnapshotFlags: UNSAFE_SNAPSHOT_FLAGS,
  };
  const [off, on] = snapshotCandidates(build, 'both');
  assert.deepEqual([off.id, on.id], ['current-snapshot-off', 'current-snapshot-on']);
  assert.equal(off.buildId, on.buildId);
  assert.equal(off.entry, on.entry);
  assert.deepEqual([snapshotModeLabel(off), snapshotModeLabel(on)], ['OFF', 'ON']);
  assert.deepEqual(
    snapshotFlagOptions(off.snapshotSkips, off.supportedSnapshotFlags),
    Object.fromEntries(UNSAFE_SNAPSHOT_FLAGS.map((flag) => [flag, false])),
  );
  assert.deepEqual(
    snapshotFlagOptions(on.snapshotSkips, on.supportedSnapshotFlags),
    Object.fromEntries(UNSAFE_SNAPSHOT_FLAGS.map((flag) => [flag, true])),
  );
  assert.deepEqual(
    snapshotCandidates(build, 'on').map((target) => target.id),
    ['current-snapshot-on'],
  );
  assert.throws(() => snapshotCandidates(build, 'unexpected'), /Invalid candidate setting/);
  assert.throws(() => snapshotFlagOptions('on', ['notAFlag']), /Invalid supported/);
  assert.throws(
    () => snapshotFlagOptions('on', [UNSAFE_SNAPSHOT_FLAGS[0], UNSAFE_SNAPSHOT_FLAGS[0]]),
    /Invalid supported/,
  );
});

test('older and partially supported builds cannot silently enable missing flags', () => {
  const old = { id: 'old', label: 'v0.51.0', supportedSnapshotFlags: [] };
  const [off] = snapshotCandidates(old, 'off');
  assert.equal(snapshotModeLabel(off), 'N/A (0/6 supported)');
  assert.deepEqual(snapshotFlagOptions('off', []), {});
  assert.throws(() => snapshotCandidates(old, 'on'), /does not declare/);
  assert.throws(() => snapshotCandidates(old, 'both'), /does not declare/);
  const partial = { ...old, supportedSnapshotFlags: UNSAFE_SNAPSHOT_FLAGS.slice(0, 2) };
  assert.equal(snapshotModeLabel(snapshotCandidates(partial, 'off')[0]), 'OFF (2/6 supported)');
  assert.deepEqual(snapshotFlagOptions('off', partial.supportedSnapshotFlags), {
    [UNSAFE_SNAPSHOT_FLAGS[0]]: false,
    [UNSAFE_SNAPSHOT_FLAGS[1]]: false,
  });
  assert.throws(() => snapshotCandidates(partial, 'on'), /does not declare/);
});

test('initial copy support is separate and candidates retain all four requested modes', async () => {
  const declarations = [
    ['index.d.ts', `interface DefaultModelRouterOptions { ${UNSAFE_INITIAL_OUTPUT_COPY_FLAGS[0]}?: boolean; }`],
    ['chunk.d.ts', `interface ModelRouterOptions { '${UNSAFE_INITIAL_OUTPUT_COPY_FLAGS[1]}'?: boolean | undefined; }`],
  ];
  assert.deepEqual(await supportedSnapshotFlags(declarations), []);
  assert.deepEqual(await supportedInitialOutputCopyFlags(declarations), UNSAFE_INITIAL_OUTPUT_COPY_FLAGS);
  const build = {
    id: 'current',
    label: 'Current',
    supportedSnapshotFlags: UNSAFE_SNAPSHOT_FLAGS,
    supportedInitialOutputCopyFlags: UNSAFE_INITIAL_OUTPUT_COPY_FLAGS,
  };
  const targets = snapshotCandidates(build, 'both').flatMap((target) => initialOutputCopyCandidates(target, 'both'));
  assert.equal(new Set(targets.map((target) => target.id)).size, 4);
  assert.deepEqual(targets.map(initialOutputCopyModeLabel), ['OFF', 'ON (dormant; effective OFF)', 'OFF', 'ON']);
  for (const target of targets) {
    const checks = snapshotFlagOptions(target.snapshotSkips, target.supportedSnapshotFlags);
    const copies = initialOutputCopyFlagOptions(target.initialOutputCopySkips, target.supportedInitialOutputCopyFlags);
    assert.equal(Object.keys(checks).length, 6);
    assert.ok(Object.values(checks).every((value) => value === (target.snapshotSkips === 'on')));
    assert.equal(Object.keys(copies).length, 2);
    assert.equal(
      effectiveInitialOutputCopySkips(checks, copies),
      target.snapshotSkips === 'on' && target.initialOutputCopySkips === 'on' ? 'on' : 'off',
    );
    const expected = { ...checks, ...copies };
    assert.doesNotThrow(() =>
      verifySnapshotFlagOptions(
        { getModelOption: (_name, key) => expected[key], getModelOptions: () => expected },
        'Root',
        expected,
      ),
    );
  }
  const base = { scenario: 'embedded', rows: 10, concurrency: 1, status: 'ok', outputFingerprint: 'same' };
  const report = {
    targets,
    baseline: targets[2].id,
    results: targets.map((target, index) => ({
      ...base,
      targetId: target.id,
      stats: summarize([index + 1], 10, 1000),
    })),
  };
  assert.deepEqual(
    reportRows(report).map((row) => row['initial output copy skips']),
    targets.map(initialOutputCopyModeLabel),
  );
  assert.equal(reportRows(report)[3]['vs baseline'], '1.33x');
});

test('unsupported initial copy flags are N/A or rejected, never silently enabled', () => {
  const target = {
    id: 'old',
    label: 'Old',
    snapshotSkips: 'off',
    supportedSnapshotFlags: [],
    supportedInitialOutputCopyFlags: [],
  };
  assert.equal(initialOutputCopyModeLabel(initialOutputCopyCandidates(target, 'off')[0]), 'N/A (0/2 supported)');
  assert.throws(() => initialOutputCopyCandidates(target, 'on'), /does not declare/);
  assert.throws(() => initialOutputCopyCandidates(target, 'both'), /does not declare/);
  const partial = { ...target, supportedInitialOutputCopyFlags: UNSAFE_INITIAL_OUTPUT_COPY_FLAGS.slice(0, 1) };
  assert.equal(initialOutputCopyModeLabel(initialOutputCopyCandidates(partial, 'off')[0]), 'OFF (1/2 supported)');
  assert.throws(() => initialOutputCopyFlagOptions('on', partial.supportedInitialOutputCopyFlags), /does not declare/);
  assert.throws(() => initialOutputCopyFlagOptions('on', ['notAFlag']), /Invalid supported/);
  assert.throws(
    () =>
      initialOutputCopyFlagOptions('on', [UNSAFE_INITIAL_OUTPUT_COPY_FLAGS[0], UNSAFE_INITIAL_OUTPUT_COPY_FLAGS[0]]),
    /Invalid supported/,
  );
  assert.throws(() => initialOutputCopyFlagOptions('bad', []), /Invalid unsafe/);
  assert.throws(() => initialOutputCopyCandidates(target, 'bad'), /Invalid initial/);
});

test('fast-path declarations are optional booleans, not comments, malformed types or duplicates', async () => {
  assert.deepEqual(UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS, [
    'unsafeUseListAuthorizationFastPath',
    'unsafeUseReadAuthorizationFastPath',
  ]);
  const [list, read] = UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS;
  const declarations = [
    ['index.d.ts', `interface DefaultModelRouterOptions { ${list}?: boolean; }`],
    ['chunk.d.ts', `interface ModelRouterOptions { readonly '${read}'?: boolean | undefined; }`],
  ];
  assert.deepEqual(await supportedAuthorizationFastPathFlags(declarations), UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS);
  assert.deepEqual(await supportedSnapshotFlags(declarations), []);
  assert.deepEqual(await supportedInitialOutputCopyFlags(declarations), []);
  assert.deepEqual(await supportedAuthorizationFastPathFlags([]), []);
  assert.deepEqual(
    await supportedAuthorizationFastPathFlags([
      ...declarations,
      ['malformed.d.ts', 'interface Broken { value?: boolean | ; }'],
    ]),
    [],
  );
  for (const body of [
    `// ${list}?: boolean;`,
    `/* ${list}?: boolean; */`,
    `${list}: boolean;`,
    `${list}?: any;`,
    `${list}?: unknown;`,
    `${list}?: Boolean;`,
    `${list}?: true;`,
    `${list}?: boolean | string;`,
    `${list}?: boolean | undefined | null;`,
    `${list}?: boolean; ${list}?: boolean;`,
    `${list}?: boolean; '${list}'?: string;`,
    `${list}?: boolean | ;`,
  ]) {
    assert.deepEqual(
      await supportedAuthorizationFastPathFlags([['index.d.ts', `interface ModelRouterOptions { ${body} }`]]),
      [],
      body,
    );
  }
  assert.deepEqual(
    await supportedAuthorizationFastPathFlags([
      ['index.d.ts', `interface AuthorizationConfiguration { ${list}?: boolean; }`],
    ]),
    [],
  );
  assert.deepEqual(
    await supportedAuthorizationFastPathFlags([
      ['index.d.ts', `interface DefaultModelRouterOptions { ${list}?: boolean; }`],
      ['chunk.d.ts', `interface ModelRouterOptions { ${list}?: boolean; }`],
    ]),
    [],
  );
  await assert.rejects(
    supportedAuthorizationFastPathFlags([declarations[0], declarations[0]]),
    /Duplicate declaration file/,
  );
  // A different/missing ESM declaration cannot masquerade as dual-condition support.
  assert.deepEqual(
    await supportedAuthorizationFastPathFlags([
      ...declarations,
      ['index.d.mts', `interface DefaultModelRouterOptions { ${list}?: boolean; ${read}?: string; }`],
    ]),
    [list],
  );
});

test('prepared support requires actual exported root options in each published declaration condition', async () => {
  const fakeRoot = resolve(temporary, 'private-fast-path-declaration');
  const directory = resolve(fakeRoot, 'packages/access-router/dist');
  await mkdir(directory, { recursive: true });
  const body = `interface DefaultModelRouterOptions { ${UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS.map((flag) => `${flag}?: boolean;`).join(' ')} }`;
  await writeFile(resolve(directory, 'index.d.ts'), body);
  assert.deepEqual((await inspectSnapshotDeclarations(fakeRoot)).supportedAuthorizationFastPathFlags, []);
  await writeFile(resolve(directory, 'index.d.ts'), `export ${body}`);
  assert.deepEqual(
    (await inspectSnapshotDeclarations(fakeRoot)).supportedAuthorizationFastPathFlags,
    UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS,
  );
  await writeFile(resolve(directory, 'index.d.mts'), body); // comment/private names do not publish ESM support
  assert.deepEqual((await inspectSnapshotDeclarations(fakeRoot)).supportedAuthorizationFastPathFlags, []);
  await writeFile(resolve(directory, 'index.d.mts'), `export ${body}`);
  assert.deepEqual(
    (await inspectSnapshotDeclarations(fakeRoot)).supportedAuthorizationFastPathFlags,
    UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS,
  );
});

test('third-group off/on/both candidates are an independent eight-way cross product', () => {
  const build = {
    id: 'current',
    label: 'Current',
    entry: 'same-build.mjs',
    supportedSnapshotFlags: UNSAFE_SNAPSHOT_FLAGS,
    supportedInitialOutputCopyFlags: UNSAFE_INITIAL_OUTPUT_COPY_FLAGS,
    supportedAuthorizationFastPathFlags: UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS,
  };
  const candidates = snapshotCandidates(build, 'both').flatMap((snapshot) =>
    initialOutputCopyCandidates(snapshot, 'both').flatMap((copy) => authorizationFastPathCandidates(copy, 'both')),
  );
  assert.equal(candidates.length, 8);
  assert.equal(new Set(candidates.map((target) => target.id)).size, 8);
  for (const target of candidates) {
    assert.equal(target.entry, build.entry);
    assert.equal(target.buildId, build.id);
    const checks = snapshotFlagOptions(target.snapshotSkips, target.supportedSnapshotFlags);
    const copies = initialOutputCopyFlagOptions(target.initialOutputCopySkips, target.supportedInitialOutputCopyFlags);
    const fast = authorizationFastPathFlagOptions(
      target.authorizationFastPaths,
      target.supportedAuthorizationFastPathFlags,
    );
    assert.deepEqual(Object.keys(checks), UNSAFE_SNAPSHOT_FLAGS);
    assert.deepEqual(Object.keys(copies), UNSAFE_INITIAL_OUTPUT_COPY_FLAGS);
    assert.deepEqual(Object.keys(fast), UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS);
    assert.ok(Object.values(checks).every((value) => value === (target.snapshotSkips === 'on')));
    assert.ok(Object.values(copies).every((value) => value === (target.initialOutputCopySkips === 'on')));
    assert.ok(Object.values(fast).every((value) => value === (target.authorizationFastPaths === 'on')));
    const mode =
      target.authorizationFastPaths === 'off'
        ? 'off'
        : target.snapshotSkips === 'on' && target.initialOutputCopySkips === 'on'
          ? 'active'
          : 'dormant';
    assert.deepEqual(target.configuredAuthorizationFastPathModes, { list: mode, read: mode });
    assert.match(target.label, /configured LIST .*READ .*not timed; unverified/);
  }
  assert.deepEqual(candidates.map(authorizationFastPathModeLabel), [
    'OFF',
    'ON',
    'OFF',
    'ON',
    'OFF',
    'ON',
    'OFF',
    'ON',
  ]);
  const copy = initialOutputCopyCandidates(snapshotCandidates(build, 'off')[0], 'off')[0];
  assert.equal(authorizationFastPathCandidates(copy, 'off')[0].authorizationFastPaths, 'off');
});

test('effective LIST/READ fast paths require all four literal prerequisites independently', () => {
  const options = Object.fromEntries(
    [...UNSAFE_SNAPSHOT_FLAGS, ...UNSAFE_INITIAL_OUTPUT_COPY_FLAGS].map((key) => [key, true]),
  );
  for (const origin of ['List', 'Read']) {
    const flag = `unsafeUse${origin}AuthorizationFastPath`;
    const other = origin === 'List' ? 'read' : 'list';
    const keys = [
      'DocumentSnapshotChecks',
      'OutputSnapshotChecks',
      'NestedDocumentSnapshotChecks',
      'InitialOutputSnapshotCopy',
    ].map((suffix) => `unsafeSkip${origin}${suffix}`);
    for (let mask = 0; mask < 16; mask++) {
      const prerequisites = {
        ...options,
        ...Object.fromEntries(keys.map((key, index) => [key, !!(mask & (1 << index))])),
      };
      for (const requested of [false, true, undefined, 'true', 1, new Boolean(true)]) {
        const mode = effectiveAuthorizationFastPathModes(prerequisites, {}, { [flag]: requested });
        assert.equal(mode[origin.toLowerCase()], requested !== true ? 'off' : mask === 15 ? 'active' : 'dormant');
        assert.equal(mode[other], 'off');
      }
    }
    for (const key of keys)
      for (const value of [undefined, false, 'true', 1, new Boolean(true)])
        assert.equal(
          effectiveAuthorizationFastPathModes({ ...options, [key]: value }, {}, { [flag]: true })[origin.toLowerCase()],
          'dormant',
        );
  }
});

test('old/partial fast-path support is OFF/N/A only and invalid supported sets reject', () => {
  const target = {
    id: 'old',
    label: 'Old',
    snapshotSkips: 'off',
    initialOutputCopySkips: 'off',
    supportedSnapshotFlags: [],
    supportedInitialOutputCopyFlags: [],
    supportedAuthorizationFastPathFlags: [],
  };
  const off = authorizationFastPathCandidates(target, 'off')[0];
  assert.equal(authorizationFastPathModeLabel(off), 'N/A (0/2 supported)');
  assert.deepEqual(off.configuredAuthorizationFastPathModes, { list: 'n/a', read: 'n/a' });
  assert.deepEqual(authorizationFastPathFlagOptions('off', []), {});
  for (const setting of ['on', 'both'])
    assert.throws(() => authorizationFastPathCandidates(target, setting), /does not declare both/);
  const partial = { ...target, supportedAuthorizationFastPathFlags: UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS.slice(0, 1) };
  assert.equal(
    authorizationFastPathModeLabel(authorizationFastPathCandidates(partial, 'off')[0]),
    'OFF (1/2 supported)',
  );
  assert.deepEqual(authorizationFastPathCandidates(partial, 'off')[0].configuredAuthorizationFastPathModes, {
    list: 'off',
    read: 'n/a',
  });
  assert.throws(() => authorizationFastPathCandidates(partial, 'on'), /does not declare both/);
  for (const supported of [
    undefined,
    ['fake'],
    [...UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS, UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS[0]],
  ])
    assert.throws(() => authorizationFastPathFlagOptions('off', supported), /Invalid supported/);
  assert.throws(() => authorizationFastPathFlagOptions('bad', []), /Invalid authorization/);
  assert.throws(() => authorizationFastPathCandidates(target, 'bad'), /Invalid authorization/);
});

test('all ten options must be applied on both real-model getter paths, not merely declared', () => {
  const expected = Object.fromEntries(
    [...UNSAFE_SNAPSHOT_FLAGS, ...UNSAFE_INITIAL_OUTPUT_COPY_FLAGS, ...UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS].map(
      (key) => [key, true],
    ),
  );
  for (const modelName of ['Source', 'Target']) {
    const api = { getModelOption: (_name, key) => expected[key], getModelOptions: () => ({ ...expected }) };
    const verified = verifySnapshotFlagOptions(api, modelName, expected);
    assert.equal(verified.modelName, modelName);
    assert.deepEqual(verified.getModelOption, expected);
    assert.deepEqual(verified.getModelOptions, expected);
    for (const flag of UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS) {
      assert.throws(
        () =>
          verifySnapshotFlagOptions(
            { ...api, getModelOption: (_name, key) => (key === flag ? false : expected[key]) },
            modelName,
            expected,
          ),
        /did not apply/,
      );
      assert.throws(
        () =>
          verifySnapshotFlagOptions(
            { ...api, getModelOptions: () => ({ ...expected, [flag]: false }) },
            modelName,
            expected,
          ),
        /did not apply/,
      );
    }
  }
});

test('reports distinguish requested from verified configuration and never invent active modes', async () => {
  const build = {
    id: 'current',
    label: 'Current',
    supportedSnapshotFlags: UNSAFE_SNAPSHOT_FLAGS,
    supportedInitialOutputCopyFlags: UNSAFE_INITIAL_OUTPUT_COPY_FLAGS,
    supportedAuthorizationFastPathFlags: UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS,
  };
  const targets = snapshotCandidates(build, 'both').flatMap((snapshot) =>
    initialOutputCopyCandidates(snapshot, 'both').flatMap((copy) => authorizationFastPathCandidates(copy, 'both')),
  );
  const results = targets.map((target) => {
    const flags = {
      ...snapshotFlagOptions(target.snapshotSkips, target.supportedSnapshotFlags),
      ...initialOutputCopyFlagOptions(target.initialOutputCopySkips, target.supportedInitialOutputCopyFlags),
      ...authorizationFastPathFlagOptions(target.authorizationFastPaths, target.supportedAuthorizationFastPathFlags),
    };
    const api = { getModelOption: (_name, key) => flags[key], getModelOptions: () => flags };
    return {
      targetId: target.id,
      status: 'ok',
      scenario: 'document-rules',
      rows: 4,
      concurrency: 1,
      outputFingerprint: 'same',
      stats: summarize([1], 1, 1000),
      measuredAuthorizationOrigin: 'list',
      effectiveAuthorizationFastPathModes: target.configuredAuthorizationFastPathModes,
      runtimeOmissionCounts: null,
      authorizationFastPathVerification: {
        kind: 'server-option-getters',
        models: {
          source: verifySnapshotFlagOptions(api, 'BenchSource', flags),
          target: verifySnapshotFlagOptions(api, 'BenchTarget', flags),
        },
      },
    };
  });
  const report = {
    startedAt: 'test',
    node: process.version,
    platform: process.platform,
    preparationFailures: [],
    targets,
    results,
    baseline: targets[6].id,
    config: {
      modeSelections: [
        { buildId: 'current', snapshotSkips: 'both', initialOutputCopySkips: 'both', authorizationFastPaths: 'both' },
      ],
      readTimed: false,
    },
  };
  const rows = reportRows(report);
  assert.deepEqual(
    rows.map((row) => row['LIST fast path (verified config)']),
    ['off', 'dormant', 'off', 'dormant', 'off', 'dormant', 'off', 'active'],
  );
  assert.deepEqual(
    rows.map((row) => row['READ fast path (not timed; verified config)']),
    rows.map((row) => row['LIST fast path (verified config)']),
  );
  assert.equal(rows[7]['authorization fast paths requested'], 'ON');
  assert.equal(rows[7]['measured origin'], 'list');
  for (const partial of [
    { authorizationFastPathVerification: undefined },
    { authorizationFastPathVerification: { kind: 'server-option-getters', models: {} } },
    { effectiveAuthorizationFastPathModes: { list: 'dormant', read: 'dormant' } },
    { status: 'failed' },
  ]) {
    const unverified = reportRows({ ...report, results: [{ ...results[7], ...partial }] })[0];
    assert.equal(unverified['LIST fast path (verified config)'], 'unknown (unverified)');
    assert.equal(unverified['READ fast path (not timed; verified config)'], 'unknown (unverified)');
    assert.equal(unverified['vs baseline'], '-');
  }
  const missingGetter = structuredClone(results[7]);
  delete missingGetter.authorizationFastPathVerification.models.target.getModelOption;
  assert.equal(
    reportRows({ ...report, results: [missingGetter] })[0]['LIST fast path (verified config)'],
    'unknown (unverified)',
  );
  const unverifiedBaseline = reportRows({ ...report, baseline: targets[7].id, results: [missingGetter, results[6]] });
  assert.equal(unverifiedBaseline[1]['vs baseline'], '-');
  assert.equal(unverifiedBaseline[1].status, 'UNVERIFIED BASELINE');
  const invalidTargets = [{ ...targets[7], supportedAuthorizationFastPathFlags: ['not-a-flag'] }];
  assert.equal(
    reportRows({ ...report, targets: invalidTargets, results: [results[7]] })[0]['LIST fast path (verified config)'],
    'unknown (unverified)',
  );
  const directory = resolve(temporary, 'fast-path-report');
  await saveReport(directory, report);
  const markdown = await readFile(resolve(directory, 'report.md'), 'utf8');
  assert.match(markdown, /READ fast path \(not timed; verified config\)/);
  assert.match(markdown, /NOT per-row borrowing or runtime omission counts/);
  assert.match(markdown, /denial into allowance/);
  assert.match(markdown, /All current workloads time LIST only/);
  assert.deepEqual(JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8')).config, report.config);
});

test('effective flag verification rejects ignored settings on either getter path', () => {
  const expected = snapshotFlagOptions('on', UNSAFE_SNAPSHOT_FLAGS);
  const api = { getModelOption: (_name, key) => expected[key], getModelOptions: () => ({ ...expected }) };
  assert.doesNotThrow(() => verifySnapshotFlagOptions(api, 'Source', expected));
  assert.doesNotThrow(() => verifySnapshotFlagOptions({}, 'OldSource', {}));
  assert.throws(() => verifySnapshotFlagOptions({}, 'Source', expected), /Cannot verify/);
  assert.throws(
    () => verifySnapshotFlagOptions({ ...api, getModelOption: () => false }, 'Source', expected),
    /did not apply.*Source/,
  );
  assert.throws(
    () => verifySnapshotFlagOptions({ ...api, getModelOptions: () => ({}) }, 'Target', expected),
    /did not apply.*Target/,
  );
});

test('statistics include correct even median, nearest-rank p95, throughput and CPU', () => {
  const result = summarize([4, 1, 3, 2], 2000, 8000);
  assert.equal(result.medianMs, 2.5);
  assert.equal(result.p95Ms, 4);
  assert.equal(result.meanMs, 2.5);
  assert.equal(result.requestsPerSecond, 2);
  assert.equal(result.cpuMsPerRequest, 2);
  assert.throws(() => summarize([], 1, 1));
  assert.throws(() => summarize([NaN], 1, 1));
});

test('output hashes ignore object-key order but not array order or denied-field leaks', () => {
  assert.equal(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] }), canonicalJson({ a: [{ c: 2, d: 1 }], b: 1 }));
  assert.equal(fingerprint({ b: 2, a: 1 }), fingerprint({ a: 1, b: 2 }));
  assert.notEqual(fingerprint([1, 2]), fingerprint([2, 1]));
  assert.notEqual(fingerprint({ name: 'yes' }), fingerprint({ name: 'yes', hidden: 'no' }));
});

test('request workers are bounded, ordered and drained before the next phase', async () => {
  let active = 0;
  let peak = 0;
  const results = await mapBounded(9, 2, async (index) => {
    active++;
    peak = Math.max(peak, active);
    await Promise.resolve();
    active--;
    return index;
  });
  assert.equal(peak, 2);
  assert.equal(active, 0);
  assert.deepEqual(
    results,
    Array.from({ length: 9 }, (_, index) => index),
  );
  await assert.rejects(
    mapBounded(10, 2, async (index) => {
      if (index === 0) throw new Error('expected failure');
      active++;
      await new Promise((done) => setTimeout(done, 5));
      active--;
    }),
    /expected failure/,
  );
  assert.equal(active, 0);
});

test('preparation builds current sources without checkout/install; tags use independent frozen installs', async () => {
  const calls = [];
  const fakeRoot = resolve(temporary, 'snapshot');
  await mkdir(resolve(fakeRoot, 'packages/access-router/dist'), { recursive: true });
  await writeFile(resolve(fakeRoot, 'VERSION'), '0.51.0\n');
  await writeFile(resolve(fakeRoot, 'pnpm-lock.yaml'), 'fixture');
  await writeFile(resolve(fakeRoot, 'packages/access-router/dist/index.mjs'), 'export {};');
  await writeFile(resolve(fakeRoot, 'packages/access-router/dist/index.d.ts'), 'interface ModelRouterOptions {}');
  const options = {
    root: fakeRoot,
    repository: root,
    commit: 'a'.repeat(40),
    archive: resolve(temporary, 'tag.tar'),
    logFile: resolve(temporary, 'prepare.log'),
    run: async (command, args, config) => {
      calls.push({ command, args, config });
    },
  };
  const current = await prepareTarget({ ...options, current: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'pnpm');
  assert.ok(calls[0].args.includes('build'));
  assert.ok(calls[0].args.includes('--workspace-concurrency=1'));
  assert.match(current.distSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(current.supportedSnapshotFlags, []);
  assert.match(current.snapshotDeclarationsSha256, /^[a-f0-9]{64}$/);
  calls.length = 0;
  await prepareTarget(options);
  assert.deepEqual(
    calls.map((call) => call.command),
    ['git', 'tar', 'pnpm', 'pnpm'],
  );
  assert.deepEqual(calls[0].args, ['archive', '--format=tar', '--output', options.archive, options.commit]);
  assert.ok(calls[2].args.includes('--frozen-lockfile'));
  assert.ok(calls[2].args.includes('--ignore-scripts'));
  assert.equal(calls[2].config.cwd, fakeRoot);
  assert.deepEqual(calls[2].config.env, pnpmEnvironment);
  assert.ok(!calls.some((call) => call.args.some((arg) => /checkout|reset|clean|worktree/.test(arg))));
});

test('reports compare both modes of one build as separate baselines', async () => {
  const build = { id: 'current', label: 'Current', supportedSnapshotFlags: UNSAFE_SNAPSHOT_FLAGS };
  const targets = snapshotCandidates(build, 'both');
  const base = {
    scenario: 'embedded',
    rows: 10,
    concurrency: 1,
    status: 'ok',
    outputFingerprint: 'same',
    readsPerRequest: 1,
  };
  const report = {
    startedAt: 'test',
    node: process.version,
    platform: process.platform,
    preparationFailures: [],
    targets,
    baseline: targets[0].id,
    results: [
      { ...base, targetId: targets[0].id, stats: summarize([10], 10, 1000) },
      { ...base, targetId: targets[1].id, stats: summarize([5], 5, 1000) },
    ],
  };
  const rows = reportRows(report);
  assert.deepEqual(
    rows.map((row) => row['snapshot skips']),
    ['OFF', 'ON'],
  );
  assert.equal(rows[1]['vs baseline'], '0.50x');
  const directory = resolve(temporary, 'modes-report');
  await saveReport(directory, report);
  const markdown = await readFile(resolve(directory, 'report.md'), 'utf8');
  assert.match(markdown, /Baseline: Current · snapshot skips OFF/);
  assert.match(markdown, /UNSAFE and not security-equivalent/);
  assert.match(markdown, /\| Current \| ON \| embedded/);
  assert.equal(JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8')).targets[1].snapshotSkips, 'on');
});

test('commands use argv, log failures and terminate on timeout/cancellation', async () => {
  const logFile = resolve(temporary, 'command.log');
  const marker = 'literal; $(not-a-shell)';
  await runLogged(process.execPath, ['-e', 'console.log(process.argv[1])', marker], { cwd: root, logFile });
  assert.ok((await readFile(logFile, 'utf8')).includes(marker));
  await assert.rejects(runLogged(process.execPath, ['-e', 'process.exit(7)'], { cwd: root, logFile }), /Exited 7/);
  await assert.rejects(
    runLogged(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: root, logFile, timeoutMs: 50 }),
    /Timed out/,
  );
  const controller = new AbortController();
  const pending = runLogged(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    cwd: root,
    logFile,
    signal: controller.signal,
  });
  const timer = setTimeout(() => controller.abort(new Error('test cancelled')), 50);
  try {
    await assert.rejects(pending, /test cancelled/);
  } finally {
    clearTimeout(timer);
  }
});

test('interactive commands keep terminal I/O out of logs and preserve failures/cancellation', async () => {
  const logFile = resolve(temporary, 'interactive.log');
  await runLogged(process.execPath, ['-e', 'process.stdout.write("terminal-only-output\\n")'], {
    cwd: root,
    logFile,
    interactive: true,
  });
  const contents = await readFile(logFile, 'utf8');
  assert.match(contents, /authentication prompts go to the terminal/);
  assert.match(contents, /\[exit: 0\]/);
  // The argv is logged, but the command's actual stdout must not be appended.
  assert.ok(!contents.includes('\nterminal-only-output\n'));
  await assert.rejects(
    runLogged(process.execPath, ['-e', 'process.exit(9)'], {
      cwd: root,
      logFile,
      interactive: true,
    }),
    /Exited 9/,
  );
  const controller = new AbortController();
  const pending = runLogged(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    cwd: root,
    logFile,
    interactive: true,
    signal: controller.signal,
  });
  const timer = setTimeout(() => controller.abort(new Error('interactive cancelled')), 50);
  try {
    await assert.rejects(pending, /interactive cancelled/);
  } finally {
    clearTimeout(timer);
  }
});

test(
  'interactive children retain the parent session; build workers stay detached',
  {
    skip: process.platform !== 'linux',
  },
  async () => {
    const readSession = (text) => {
      const fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
      return { group: fields[2], session: fields[3] };
    };
    const parent = readSession(await readFile('/proc/self/stat', 'utf8'));
    for (const interactive of [true, false]) {
      const resultPath = resolve(temporary, `session-${interactive}.txt`);
      await runLogged(
        process.execPath,
        [
          '-e',
          'const fs = require("node:fs"); fs.writeFileSync(process.argv[1], fs.readFileSync("/proc/self/stat"));',
          resultPath,
        ],
        { cwd: root, logFile: resolve(temporary, 'sessions.log'), interactive },
      );
      const child = readSession(await readFile(resultPath, 'utf8'));
      if (interactive) assert.deepEqual(child, parent);
      else {
        assert.notEqual(child.session, parent.session);
        assert.notEqual(child.group, parent.group);
      }
    }
  },
);

test('reports never compare failed/mismatched outputs and persist raw samples', async () => {
  const result = {
    targetId: 'old',
    scenario: 'plain-wide',
    rows: 10,
    concurrency: 1,
    status: 'ok',
    stats: summarize([1, 3], 5, 1000),
    outputFingerprint: 'same',
    readsPerRequest: 1,
    samplesMs: [1, 3],
  };
  const report = {
    startedAt: 'test',
    node: process.version,
    platform: process.platform,
    baseline: 'old',
    targets: [
      { id: 'old', label: 'v0.51.0' },
      { id: 'current', label: 'Current' },
    ],
    preparationFailures: [],
    results: [result, { ...result, targetId: 'current', stats: summarize([2, 6], 10, 2000) }],
  };
  assert.equal(reportRows(report)[1]['vs baseline'], '2.00x');
  report.results.push({ ...result, targetId: 'current', outputFingerprint: 'different' });
  report.results.push({ ...result, targetId: 'current', status: 'failed', error: 'test failure', stats: undefined });
  assert.equal(reportRows(report)[2].status, 'OUTPUT DIFF');
  assert.equal(reportRows(report)[2]['vs baseline'], '-');
  assert.equal(reportRows(report)[3]['vs baseline'], '-');
  const directory = resolve(temporary, 'report');
  await saveReport(directory, report);
  assert.deepEqual(JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8')).results[0].samplesMs, [1, 3]);
  assert.match(await readFile(resolve(directory, 'report.md'), 'utf8'), /OUTPUT DIFF/);
  assert.match(await readFile(resolve(directory, 'report.md'), 'utf8'), /test failure/);
});

test('CLI help is noninteractive and does not start builds or fetches', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    resolve(root, 'scripts/benchmarks/access-router.mjs'),
    '--help',
  ]);
  assert.match(stdout, /Fetch tags/);
  assert.match(stdout, /at least one/);
  assert.match(stdout, /unsafe snapshot skips OFF/);
  assert.match(stdout, /authorization fast paths OFF\/ON\/BOTH \(default OFF\)/);
  assert.match(stdout, /eight candidates/);
  assert.match(stdout, /READ is verified but not timed/);
});

test('worker refuses oversized fixtures, foreign databases and modified builds before opening MongoDB', async () => {
  const entry = resolve(temporary, 'modified.mjs');
  await writeFile(entry, 'export {};');
  const job = {
    scenario: 'plain-wide',
    rows: 1,
    fields: 4,
    bytes: 1,
    samples: 1,
    warmup: 0,
    concurrency: 1,
    hookConcurrency: 1,
    database: 'access_router_bench_abcdef012345_1',
    target: { root, entry, distSha256: '0'.repeat(64) },
  };
  await assert.rejects(benchmark({ ...job, rows: 10000, fields: 128, bytes: 4096 }), /safety budget/);
  await assert.rejects(benchmark({ ...job, database: 'production' }), /owned benchmark database/);
  await assert.rejects(benchmark(job), /Prepared dist changed/);
});

test('worker rejects unavailable or changed snapshot flags before loading peers or opening MongoDB', async () => {
  const fakeRoot = resolve(temporary, 'worker-flag-support');
  const directory = resolve(fakeRoot, 'packages/access-router/dist');
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, 'index.d.ts'),
    `interface ModelRouterOptions { ${UNSAFE_SNAPSHOT_FLAGS[0]}?: boolean }`,
  );
  const manifest = await inspectSnapshotDeclarations(fakeRoot);
  const job = {
    scenario: 'embedded',
    rows: 1,
    fields: 4,
    bytes: 1,
    samples: 1,
    warmup: 0,
    concurrency: 1,
    hookConcurrency: 1,
    database: 'access_router_bench_abcdef012345_1',
    target: { root: fakeRoot, entry: resolve(directory, 'not-loaded.mjs'), snapshotSkips: 'on', ...manifest },
  };
  await assert.rejects(benchmark(job), /this build does not declare/);
  await assert.rejects(
    benchmark({ ...job, target: { ...job.target, snapshotSkips: 'off', initialOutputCopySkips: 'on' } }),
    /does not declare both/,
  );
  await assert.rejects(
    benchmark({
      ...job,
      target: {
        ...job.target,
        snapshotSkips: 'off',
        initialOutputCopySkips: 'on',
        supportedInitialOutputCopyFlags: undefined,
      },
    }),
    /requires a prepared declaration manifest/,
  );
  await assert.rejects(
    benchmark({ ...job, target: { ...job.target, snapshotDeclarationsSha256: undefined } }),
    /requires a prepared declaration manifest/,
  );
  await assert.rejects(
    benchmark({ ...job, target: { ...job.target, snapshotSkips: 'invalid' } }),
    /Invalid unsafe snapshot mode/,
  );
  await writeFile(resolve(directory, 'index.d.ts'), 'interface ModelRouterOptions {}');
  await assert.rejects(benchmark(job), /declarations changed/);
});

test('worker rejects fabricated fast-path support and declaration/file manifests before peers or MongoDB', async () => {
  const fakeRoot = resolve(temporary, 'worker-fast-path-support');
  const directory = resolve(fakeRoot, 'packages/access-router/dist');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'index.d.ts'), 'interface ModelRouterOptions {}');
  const manifest = await inspectSnapshotDeclarations(fakeRoot);
  const job = {
    scenario: 'document-rules',
    rows: 1,
    fields: 4,
    bytes: 1,
    samples: 1,
    warmup: 0,
    concurrency: 1,
    hookConcurrency: 1,
    database: 'access_router_bench_abcdef012345_1',
    target: {
      root: fakeRoot,
      entry: resolve(directory, 'must-not-load.mjs'),
      snapshotSkips: 'off',
      initialOutputCopySkips: 'off',
      authorizationFastPaths: 'on',
      ...manifest,
    },
  };
  await assert.rejects(benchmark(job), /does not declare both/);
  await assert.rejects(
    benchmark({
      ...job,
      target: { ...job.target, supportedAuthorizationFastPathFlags: UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS },
    }),
    /fake or inconsistent supportedAuthorizationFastPathFlags/,
  );
  await assert.rejects(
    benchmark({
      ...job,
      target: { ...job.target, authorizationFastPaths: 'off', supportedSnapshotFlags: UNSAFE_SNAPSHOT_FLAGS },
    }),
    /fake or inconsistent supportedSnapshotFlags/,
  );
  await assert.rejects(
    benchmark({ ...job, target: { ...job.target, supportedAuthorizationFastPathFlags: undefined } }),
    /requires a prepared declaration manifest/,
  );
  await assert.rejects(
    benchmark({ ...job, target: { ...job.target, authorizationFastPaths: 'invalid' } }),
    /Invalid authorization/,
  );
  await assert.rejects(
    benchmark({ ...job, target: { ...job.target, authorizationFastPaths: 'off', snapshotDeclarationManifest: [] } }),
    /declaration file manifest changed/,
  );
  await writeFile(
    resolve(directory, 'index.d.mts'),
    `interface DefaultModelRouterOptions { ${UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS[0]}?: boolean; }`,
  );
  await assert.rejects(
    benchmark({ ...job, target: { ...job.target, authorizationFastPaths: 'off' } }),
    /declarations changed/,
  );
});
