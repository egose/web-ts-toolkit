import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';

const publisherRequire = createRequire(require.resolve('@repo-toolkit/release-artifact')) as NodeRequire;
const { createPublishPackageJson, DEFAULT_PACKAGE_FILES, DEFAULT_VERSION_PLACEHOLDER } = publisherRequire(
  '@repo-toolkit/publish-package',
) as {
  createPublishPackageJson: (
    packageJson: Record<string, unknown>,
    options: {
      version: string;
      internalPackageNames: Set<string>;
      rootMetadata?: {
        author?: unknown;
        bugs?: unknown;
        engines?: unknown;
        license?: unknown;
        repository?: unknown;
      };
      rewrite?: { versionPlaceholder?: string; publishDir?: string };
    },
  ) => Record<string, unknown>;
  DEFAULT_PACKAGE_FILES: string[];
  DEFAULT_VERSION_PLACEHOLDER: string;
};

type PackageJson = {
  name: string;
  version: string;
  license?: string;
  repository?: string | { type?: string; url?: string; directory?: string };
  sideEffects?: string[] | boolean;
  files?: string[];
  main?: string;
  module?: string;
  types?: string;
  exports?: Record<string, unknown>;
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

type PackedWorkspace = {
  tempRoot: string;
  tarball: string;
  manifest: PackageJson;
};

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const packageRoot = path.resolve(__dirname, '..');
const packageName = '@web-ts-toolkit/json-frame';
const packageDirRelative = 'packages/json-frame';
const testVersion = '0.99.0-json-frame-test';
const tempRoots: string[] = [];

const rootPackageJson = JSON.parse(readFileSync(path.resolve(workspaceRoot, 'package.json'), 'utf8')) as {
  author?: string;
  bugs?: unknown;
  engines?: Record<string, string>;
  license: string;
  repository: { type?: string; url?: string };
  devDependencies: Record<string, string>;
};

const sourcePackageJson = JSON.parse(readFileSync(path.resolve(packageRoot, 'package.json'), 'utf8')) as PackageJson;

let packedWorkspaceCache: PackedWorkspace | undefined;

function trackTempRoot(dir: string): string {
  tempRoots.push(dir);
  return dir;
}

function run(command: string, args: string[], cwd: string): string {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    const caught = error as { stdout?: string; stderr?: string; status?: number; message?: string };
    const detail = [caught.stdout, caught.stderr].filter(Boolean).join('\n');
    throw new Error(
      `Command failed: ${command} ${args.join(' ')} (cwd: ${cwd}, status: ${caught.status})\n${detail}\n${caught.message ?? ''}`,
      { cause: error },
    );
  }
}

function seedToolVersions(dir: string): void {
  const source = path.resolve(workspaceRoot, '.tool-versions');
  if (existsSync(source)) {
    cpSync(source, path.resolve(dir, '.tool-versions'));
  }
}

function containsDisallowedPublishedValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.includes('PLACEHOLDER') || value.includes('workspace:');
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsDisallowedPublishedValue(entry));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((entry) => containsDisallowedPublishedValue(entry));
  }
  return false;
}

function buildPublishedManifest(): PackageJson {
  return createPublishPackageJson(sourcePackageJson as Record<string, unknown>, {
    version: testVersion,
    internalPackageNames: new Set([packageName]),
    rootMetadata: {
      author: rootPackageJson.author,
      bugs: rootPackageJson.bugs,
      engines: rootPackageJson.engines,
      license: rootPackageJson.license,
      repository: { ...rootPackageJson.repository, directory: packageDirRelative },
    },
    rewrite: { versionPlaceholder: DEFAULT_VERSION_PLACEHOLDER, publishDir: 'dist' },
  }) as PackageJson;
}

function stagePublishedPackage(stageDir: string, manifest: PackageJson): void {
  mkdirSync(stageDir, { recursive: true });
  cpSync(path.resolve(packageRoot, 'dist'), stageDir, { recursive: true });

  for (const entry of DEFAULT_PACKAGE_FILES) {
    const source = path.resolve(packageRoot, entry);
    if (existsSync(source)) {
      cpSync(source, path.resolve(stageDir, path.basename(entry)));
    }
  }

  cpSync(path.resolve(workspaceRoot, 'LICENSE'), path.resolve(stageDir, 'LICENSE'));
  writeFileSync(path.resolve(stageDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function preparePackedWorkspace(): PackedWorkspace {
  if (packedWorkspaceCache) {
    return packedWorkspaceCache;
  }

  const tempRoot = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'json-frame-jframe08-')));
  seedToolVersions(tempRoot);
  const tarballDir = path.resolve(tempRoot, 'tarballs');
  mkdirSync(tarballDir, { recursive: true });
  const stageDir = path.resolve(tempRoot, packageName.replace(/[@/]/g, '_'));
  const manifest = buildPublishedManifest();

  stagePublishedPackage(stageDir, manifest);
  run('pnpm', ['pack', '--pack-destination', tarballDir], stageDir);

  const tarball = path.resolve(tarballDir, `web-ts-toolkit-json-frame-${testVersion}.tgz`);
  if (!existsSync(tarball)) {
    throw new Error(`pnpm pack did not produce expected tarball: ${tarball}`);
  }

  packedWorkspaceCache = { tempRoot, tarball, manifest };
  return packedWorkspaceCache;
}

function unpackTarballToDir(tarballPath: string): string {
  const unpackRoot = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'json-frame-jframe08-unpack-')));
  run('tar', ['-xzf', tarballPath, '-C', unpackRoot], workspaceRoot);
  return path.resolve(unpackRoot, 'package');
}

function installPackedConsumer(): string {
  const packed = preparePackedWorkspace();
  const consumerDir = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'json-frame-consumer-')));
  seedToolVersions(consumerDir);

  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'json-frame-consumer',
        private: true,
        type: 'module',
        dependencies: {
          [packageName]: `file:${packed.tarball}`,
        },
        devDependencies: {
          '@types/node': rootPackageJson.devDependencies['@types/node'],
          typescript: rootPackageJson.devDependencies.typescript,
        },
      },
      null,
      2,
    )}\n`,
  );

  // Keep repository-local TMPDIR consumers outside the parent pnpm workspace.
  writeFileSync(path.resolve(consumerDir, 'pnpm-workspace.yaml'), 'packages: []\n');
  run('pnpm', ['install', '--no-frozen-lockfile'], consumerDir);
  return consumerDir;
}

function writeConsumerFiles(consumerDir: string): void {
  const ownOverrideRuntime = `
for (const column of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf']) {
  for (const packThreshold of [0, 1]) {
    for (const columnTypes of [undefined, {}, { n: 'integer' }, Object.create(null), { [column]: 'float' }]) {
      const input = [{ [column]: 1, n: 2 }];
      const frame = fromOrient(input, { columnTypes, packThreshold });
      const explicit = columnTypes && Object.hasOwn(columnTypes, column);
      const expectedType = explicit ? 'float' : 'integer';
      for (const result of [frame, frame.select(column, 'n').sort(() => 0).resetIndex().filter(() => false)]) {
        if (result.columnInfo.get(column).type !== expectedType) throw new Error('inherited column type: ' + column);
        const table = result.toTable();
        if (!table.schema.fields.some(field => field.name === column && field.type === (explicit ? 'number' : 'integer'))) throw new Error('invalid table field: ' + column);
        if (result.toJSONString('table') !== JSON.stringify(table)) throw new Error('table string mismatch');
      }
      if (JSON.stringify(frame.rows()) !== JSON.stringify(input)) throw new Error('prototype-named cells changed');
    }
  }
}
`;
  const datetimeRuntime = `
const dates = ['0000-02-29', '0001-01-01 00:00:00.1', '0099-12-31', '0100-02-28', '1900-02-28', '2000-02-29', '9999-12-31T23:59:59.999999999'];
for (const packThreshold of [0, 1]) {
  const input = dates.map((ts, n) => ({ ts, n }));
  const frame = fromOrient(input, { orient: 'records', packThreshold, columnTypes: { ts: 'datetime' } });
  const transformed = frame.sort((a, b) => b.n - a.n).filter(row => row.n >= 0).select('ts', 'n').rename({ ts: 'when' }).resetIndex();
  const expected = [...dates].reverse();
  if (transformed.columnInfo.get('when').type !== 'datetime') throw new Error('datetime metadata lost');
  for (const orient of ['records', 'values', 'split', 'index', 'columns', 'table']) {
    const restored = fromOrient(transformed.toJSONString(orient), { orient, columns: ['when', 'n'], columnTypes: { when: 'datetime' }, packThreshold });
    if (JSON.stringify(restored.rows().map(row => row.when)) !== JSON.stringify(expected)) throw new Error('datetime cells changed in ' + orient);
    if (restored.columnInfo.get('when').type !== 'datetime') throw new Error('datetime type lost in ' + orient);
  }
  const table = transformed.toTable();
  if (!table.schema.fields.some(field => field.name === 'when' && field.type === 'datetime')) throw new Error('datetime schema lost');
  if (JSON.stringify(frame.rows()) !== JSON.stringify(input)) throw new Error('datetime source changed');
  if (fromOrient(input).columnInfo.get('ts').type !== 'string') throw new Error('dates inferred as datetime');
}
for (const ts of ['0100-02-29', '1900-02-29', '2000-02-30', '0000-01-01T24:00:00', '0001-01-01T00:00:00Z', 1704164645000]) {
  let rejected = false;
  try { fromOrient([{ ts: '0000-02-29' }, { ts }], { orient: 'records', columnTypes: { ts: 'datetime' } }); }
  catch (error) { rejected = error.name === 'JsonFrameValidationError' && error.orient === 'records' && error.row === 1 && error.column === 'ts' && error.path === '$[1]["ts"]'; }
  if (!rejected) throw new Error('expected invalid datetime rejection: ' + ts);
}
`;
  const budgetRuntime = `
const budgeted = fromOrient('[{"n":1}]', { orient: 'records', maxNodes: 3 });
for (const [orient, nodes] of [['records', 3], ['index', 3], ['columns', 3], ['values', 3], ['split', 8], ['table', 9]]) {
  const expected = budgeted.toJSONString(orient);
  if (budgeted.toJSONString(orient, { maxNodes: nodes }) !== expected) throw new Error('exact budget changed output');
  let rejected = false;
  try { budgeted.toJSONString(orient, { maxNodes: nodes - 1 }); }
  catch (error) { rejected = error.name === 'JsonFrameValidationError' && error.orient === orient && typeof error.path === 'string'; }
  if (!rejected) throw new Error('expected budget rejection for ' + orient);
}
let invalidBudget = false;
try { fromOrient([], { orient: 'records', maxNodes: 0 }); }
catch (error) { invalidBudget = error.name === 'JsonFrameOptionError' && error.option === 'maxNodes'; }
if (!invalidBudget) throw new Error('expected invalid ingestion budget');
`;
  const inferenceRuntime = `
for (const orient of [undefined, 'auto', 'values']) {
  const frame = fromOrient([[1], [null]], { orient, columns: ['n'] });
  if (Array.isArray(frame.row(0)) || typeof frame.row(0).map !== 'undefined') throw new Error('array-shaped values row');
  if (frame.row(0).n !== 1 || frame.row(1).n !== null) throw new Error('values cells changed');
}
for (const orient of [undefined, 'auto', 'records']) {
  const sparse = fromOrient([{ n: 1 }, {}], { orient });
  if (sparse.row(1).n !== null) throw new Error('sparse cell not null-filled');
  if (sparse.filter(row => row.n != null && row.n.toFixed() === '1').length !== 1) throw new Error('null-safe filter failed');
  const mixed = fromOrient([{ n: 1 }, { label: 'x' }], { orient });
  if (mixed.row(0).label !== null || mixed.row(1).n !== null) throw new Error('heterogeneous cells not null-filled');
  for (const key of ['metric_n', '1', 'n_metric', 'pre_n_post', 'N']) {
    for (const known of [{}, { id: 'a', toString: 'ok' }, { metric_fixed: 2 }]) {
      const dictionary = fromOrient([{ ...known, [key]: 1 }, { ...known }], { orient });
      if (dictionary.row(1)[key] !== null || dictionary.row(0)[key] !== 1) throw new Error('pattern dictionary cells changed');
      if (dictionary.row(0).metric_absent !== undefined) throw new Error('absent pattern column created');
      const absent = fromOrient([{ ...known }], { orient });
      if (absent.row(0)[key] !== undefined || absent.columns.includes(key)) throw new Error('absent dictionary key created');
      if (Object.getPrototypeOf(dictionary.row(1)) !== null) throw new Error('pattern row prototype changed');
      const unsafe = cell => cell !== undefined ? Number(cell.toFixed()) : 0;
      for (const operation of [() => unsafe(dictionary.row(1)[key]), () => dictionary.filter(row => unsafe(row[key]) === 1), () => dictionary.sort((a, b) => unsafe(a[key]) - unsafe(b[key]))]) {
        let threw = false;
        try { operation(); } catch (error) { threw = error instanceof TypeError; }
        if (!threw) throw new Error('expected undefined-only pattern guard to throw on null');
      }
      const scalar = cell => typeof cell === 'number' ? cell : 0;
      if (dictionary.filter(row => typeof row[key] === 'number' && row[key].toFixed() === '1').length !== 1) throw new Error('pattern guard failed');
      if (dictionary.sort((a, b) => scalar(a[key]) - scalar(b[key])).row(0)[key] !== null) throw new Error('pattern sort failed');
    }
  }
  for (const key of ['toString', 'constructor', 'valueOf']) {
    const members = fromOrient([{ [key]: 'ok' }, {}], { orient });
    if (members.columns.join() !== key || members.row(1)[key] !== null) throw new Error('Object-member cell not null-filled');
    if (Object.getPrototypeOf(members.row(1)) !== null || !Object.hasOwn(members.row(1), key)) throw new Error('unsafe row prototype');
    if (members.filter(row => row[key] != null && row[key].toUpperCase() === 'OK').length !== 1) throw new Error('Object-member guard failed');
    if (members.sort((a, b) => (a[key] ?? '').localeCompare(b[key] ?? '')).row(0)[key] !== null) throw new Error('Object-member sort failed');
    if (fromOrient([{ [key]: 'ok' }], { orient }).row(0)[key] !== 'ok') throw new Error('dense Object-member cell changed');
  }
  for (const [input, expected] of [
    [[{ 1: 1 }, { 1: 2 }], [[1], [2]]],
    [[{ '1': 1 }, { '1': 2 }], [[1], [2]]],
    [[{ 1: 1 }, { '1': 'x' }], [[1], ['x']]],
    [[{ '1': 'x' }, { 1: 1 }], [['x'], [1]]],
    [[{ 1: 1 }, { '1': 'x' }, {}], [[1], ['x'], [null]]],
    [[{ id: 'a', 1: 1 }, { id: 'b', '1': 'x' }], [[1, 'a'], ['x', 'b']]],
  ]) {
    const numeric = fromOrient(input, { orient });
    if (numeric.columns[0] !== '1' || JSON.stringify(numeric.toValues()) !== JSON.stringify(expected)) throw new Error('numeric alias cells changed');
    for (const row of numeric.rows()) {
      if (row[1] !== row['1'] || Object.getPrototypeOf(row) !== null) throw new Error('numeric alias row changed');
    }
  }
}
if (fromOrient([{ id: 'a' }]).row(0).n !== undefined) throw new Error('absent column was created');
if (fromOrient([{ id: 'a' }]).row(0)[1] !== undefined) throw new Error('absent numeric column was created');
`;
  const inferenceDeclaration = readFileSync(
    path.resolve(packageRoot, 'test-decl-consumer/inference-contract.mts'),
    'utf8',
  );
  for (const extension of ['mts', 'cts', 'ts']) {
    writeFileSync(path.resolve(consumerDir, `inference-contract.${extension}`), inferenceDeclaration);
  }
  const budgetDeclaration = readFileSync(path.resolve(packageRoot, 'test-decl-consumer/budget-contract.mts'), 'utf8');
  for (const extension of ['mts', 'cts', 'ts']) {
    writeFileSync(path.resolve(consumerDir, `budget-contract.${extension}`), budgetDeclaration);
  }
  writeFileSync(
    path.resolve(consumerDir, 'consumer.cjs'),
    `const { AmbiguousOrientError, JsonFrameOptionError, fromOrient } = require('@web-ts-toolkit/json-frame');

const entry = require.resolve('@web-ts-toolkit/json-frame');
const frame = fromOrient('[{"city":"Paris","temp":21}]');
const valuesFrame = fromOrient([["Paris", 21]], { orient: 'values', columns: ['city', 'temp'] });

if (!entry.endsWith('/index.js')) throw new Error(entry);
if (frame.row(0).city !== 'Paris') throw new Error('records payload failed');
if (valuesFrame.toSplit().columns[1] !== 'temp') throw new Error('values payload failed');

let sawAmbiguity = false;
try {
  fromOrient({ r1: { city: 'Paris', temp: 21 } });
} catch (error) {
  sawAmbiguity =
    error instanceof AmbiguousOrientError &&
    error.candidates.includes('index') &&
    error.candidates.includes('columns');
}

if (!sawAmbiguity) throw new Error('expected ambiguous orient error for nested-object payload');

let sawValuesColumnsError = false;
try {
  fromOrient([["Paris", 21]], { orient: 'values' });
} catch (error) {
  sawValuesColumnsError = error instanceof JsonFrameOptionError && error.option === 'columns';
}

if (!sawValuesColumnsError) throw new Error('expected values-without-columns option error');
${inferenceRuntime}
${budgetRuntime}
${datetimeRuntime}
${ownOverrideRuntime}
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.mjs'),
    `import { AmbiguousOrientError, fromOrient } from '@web-ts-toolkit/json-frame';

const entry = import.meta.resolve('@web-ts-toolkit/json-frame');
const indexFrame = fromOrient({ r1: { city: 'Paris', temp: 21 } }, { orient: 'index' });
const columnsFrame = fromOrient(
  {
    city: { r1: 'Paris' },
    temp: { r1: 21 },
  },
  { orient: 'columns' },
);
const splitFrame = fromOrient(
  {
    columns: ['city', 'temp'],
    index: ['r1'],
    data: [['Paris', 21]],
  },
  { orient: 'split' },
);
const tableFrame = fromOrient(
  {
    schema: {
      fields: [
        { name: 'row_id', type: 'string' },
        { name: 'city', type: 'string' },
        { name: 'temp', type: 'integer' },
      ],
      primaryKey: ['row_id'],
      pandas_version: '1.4.0',
    },
    data: [{ row_id: 'r1', city: 'Paris', temp: 21 }],
  },
  { orient: 'table' },
);

if (!entry.endsWith('/index.mjs')) throw new Error(entry);
if (indexFrame.index[0] !== 'r1') throw new Error('index payload failed');
if (columnsFrame.row(0).city !== 'Paris') throw new Error('columns payload failed');
if (splitFrame.toSplit().index[0] !== 'r1') throw new Error('split payload failed');
if (tableFrame.toTable().schema.primaryKey?.[0] !== 'row_id') throw new Error('table payload failed');

let sawAmbiguity = false;
try {
  fromOrient({ city: { r1: 'Paris' } });
} catch (error) {
  sawAmbiguity = error instanceof AmbiguousOrientError;
}

if (!sawAmbiguity) throw new Error('expected columns payload to require explicit orient under auto');
${inferenceRuntime}
${budgetRuntime}
${datetimeRuntime}
${ownOverrideRuntime}
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.nodenext.mts'),
    `import {
  AmbiguousOrientError,
  fromOrient,
  type DataFrame,
  type JsonValue,
  type SplitPayload,
  type TablePayload,
} from '@web-ts-toolkit/json-frame';

interface WeatherRow {
  city: string;
  temp: number | null;
}

const records = fromOrient<WeatherRow>('[{"city":"Paris","temp":21},{"city":"Berlin","temp":null}]');
const typedFrame: DataFrame<WeatherRow> = records;
const exportedSplit: SplitPayload = records.toSplit();
const exportedTable: TablePayload = records.toTable();
const splitRoundTrip = fromOrient<WeatherRow>(exportedSplit, { orient: 'split' });
const tableRoundTrip = fromOrient<WeatherRow>(exportedTable, { orient: 'table' });
const exportedJson: string = records.toJSONString('split');
const value: JsonValue = JSON.parse(exportedJson) as JsonValue;

try {
  fromOrient({ r1: { city: 'Paris', temp: 21 } });
} catch (error) {
  if (error instanceof AmbiguousOrientError) {
    const candidates: readonly string[] = error.candidates;
    void candidates;
  }
}

void [typedFrame, exportedSplit, exportedTable, splitRoundTrip, tableRoundTrip, value, records.resetIndex()];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.nodenext.cts'),
    `import type { DataFrame, JsonValue } from '@web-ts-toolkit/json-frame';

const jsonFrame: typeof import('@web-ts-toolkit/json-frame') = require('@web-ts-toolkit/json-frame');
const frame = jsonFrame.fromOrient<Record<string, JsonValue>>('[{"city":"Paris"}]');
const typed: DataFrame<Record<string, JsonValue>> = frame;
interface WeatherRow {
  city: string;
  temp: number | null;
}

const weather = jsonFrame.fromOrient<WeatherRow>('[{"city":"Paris","temp":21}]');
const splitRoundTrip = jsonFrame.fromOrient<WeatherRow>(weather.toSplit(), { orient: 'split' });
const tableRoundTrip = jsonFrame.fromOrient<WeatherRow>(weather.toTable(), { orient: 'table' });
void [typed, jsonFrame.JsonFrameOptionError, frame.toRecords(), splitRoundTrip, tableRoundTrip];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.bundler.ts'),
    `import { fromOrient, type ColumnType, type DataFrame, type JsonValue } from '@web-ts-toolkit/json-frame';

interface WeatherRow {
  city: string;
  temp: number;
  coastal: boolean;
}

const frame = fromOrient<WeatherRow>(
  [
    { city: 'Paris', temp: 21.5, coastal: false },
    { city: 'Tokyo', temp: 27.1, coastal: true },
  ],
  {
    orient: 'records',
    columnTypes: {
      temp: 'float',
      coastal: 'boolean',
    },
    packThreshold: 0,
  },
);

const columnTypes: ColumnType[] = [...frame.columnInfo.values()].map((info) => info.type);
const json: string = frame.toJSONString('records');
const parsed: JsonValue = JSON.parse(json) as JsonValue;
const splitRoundTrip = fromOrient<WeatherRow>(frame.toSplit(), { orient: 'split' });
const tableRoundTrip = fromOrient<WeatherRow>(frame.toTable(), { orient: 'table' });
const typedRoundTrips: readonly DataFrame<WeatherRow>[] = [splitRoundTrip, tableRoundTrip];

void [columnTypes, parsed, frame.filter((row) => row.coastal === true), typedRoundTrips];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.browser.ts'),
    `import { fromOrient, type DataFrame } from '@web-ts-toolkit/json-frame';

interface WeatherRow {
  city: string;
  temp: number;
}

const frame = fromOrient<WeatherRow>([{ city: 'Paris', temp: 21 }], { orient: 'records' });
const splitRoundTrip = fromOrient<WeatherRow>(frame.toSplit(), { orient: 'split' });
const tableRoundTrip = fromOrient<WeatherRow>(frame.toTable(), { orient: 'table' });
const typedRoundTrips: readonly DataFrame<WeatherRow>[] = [splitRoundTrip, tableRoundTrip];

void [typedRoundTrips, frame.row(0).city];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'tsconfig.nodenext.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          esModuleInterop: true,
          types: ['node'],
        },
        include: [
          'consumer.nodenext.mts',
          'consumer.nodenext.cts',
          'inference-contract.mts',
          'inference-contract.cts',
          'budget-contract.mts',
          'budget-contract.cts',
        ],
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'tsconfig.bundler.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          esModuleInterop: true,
          types: ['node'],
        },
        include: ['consumer.bundler.ts', 'inference-contract.ts', 'budget-contract.ts'],
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'tsconfig.browser.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          lib: ['ES2022'],
          types: [],
        },
        include: ['consumer.browser.ts', 'inference-contract.ts', 'budget-contract.ts'],
      },
      null,
      2,
    )}\n`,
  );
}

function writeReadmeExampleFiles(consumerDir: string): void {
  const readmePath = path.resolve(consumerDir, 'node_modules', '@web-ts-toolkit', 'json-frame', 'README.md');
  const content = readFileSync(readmePath, 'utf8');
  const exampleFiles: string[] = [];
  let index = 0;

  for (const match of content.matchAll(/```ts\n([\s\S]*?)\n```/g)) {
    index += 1;
    const fileName = `readme-example-${index}.ts`;
    exampleFiles.push(fileName);
    writeFileSync(path.resolve(consumerDir, fileName), match[1]);
  }

  if (exampleFiles.length === 0) {
    throw new Error('README.md contains no TypeScript examples to compile');
  }

  writeFileSync(
    path.resolve(consumerDir, 'tsconfig.readme.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          lib: ['ES2022'],
          types: [],
        },
        include: exampleFiles,
      },
      null,
      2,
    )}\n`,
  );
}

function assertNoNodeBuiltinImports(packageDir: string): void {
  for (const file of ['index.js', 'index.mjs']) {
    const source = readFileSync(path.resolve(packageDir, file), 'utf8');
    expect(source).not.toMatch(/\bfrom\s+['"]node:/);
    expect(source).not.toMatch(/\bimport\(['"]node:/);
    expect(source).not.toMatch(/require\(['"]node:/);
  }
}

afterAll(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop() as string, { recursive: true, force: true });
  }
});

describe('JFRAME-08 packed consumer compatibility', () => {
  it.each([false, true])(
    'checks source API inference with exactOptionalPropertyTypes=%s and unchecked-index guards',
    (exactOptionalPropertyTypes) => {
      const configPath = path.resolve(packageRoot, 'test-decl-consumer/tsconfig-source.json');
      const config = ts.readConfigFile(configPath, ts.sys.readFile);
      expect(config.error).toBeUndefined();
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
      expect(parsed.errors).toEqual([]);
      const fixturePath = path.resolve(packageRoot, 'test-decl-consumer/inference-contract.mts');
      const options = { ...parsed.options, noEmit: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes };
      const resolved = ts.resolveModuleName(packageName, fixturePath, options, ts.sys).resolvedModule;
      expect(resolved?.resolvedFileName).toBe(path.resolve(packageRoot, 'src/index.ts'));
      const program = ts.createProgram([fixturePath], options);
      const fixture = program.getSourceFile(fixturePath);
      expect(fixture).toBeDefined();
      // Check consumer usage against actual source types under consumer flags.
      // Implementation bodies are checked separately by typecheck:source using
      // the package's own settings, not consumers' exact-optional preferences.
      const diagnostics = [
        ...program.getOptionsDiagnostics(),
        ...program.getGlobalDiagnostics(),
        ...program.getSyntacticDiagnostics(),
        ...program.getSemanticDiagnostics(fixture),
      ];
      expect(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCurrentDirectory: () => packageRoot,
          getCanonicalFileName: (file) => file,
          getNewLine: () => '\n',
        }),
      ).toBe('');
    },
    30_000,
  );

  it('applies the real publish manifest transformation to the json-frame tarball and exposes only intended files', () => {
    const packed = preparePackedWorkspace();
    const unpackRoot = unpackTarballToDir(packed.tarball);
    const packedManifest = JSON.parse(readFileSync(path.resolve(unpackRoot, 'package.json'), 'utf8')) as PackageJson;

    expect(packedManifest).toEqual(packed.manifest);
    expect(packedManifest.version).toBe(testVersion);
    expect(packedManifest.license).toBe(rootPackageJson.license);
    expect(packedManifest.repository).toEqual({
      ...rootPackageJson.repository,
      directory: packageDirRelative,
    });
    expect(packedManifest.files).toEqual(['**/*', '!**/*.map']);
    expect(packedManifest.main).toBe('./index.js');
    expect(packedManifest.module).toBe('./index.mjs');
    expect(packedManifest.types).toBe('./index.d.ts');
    expect(packedManifest.exports).toEqual({
      '.': {
        types: {
          import: './index.d.mts',
          require: './index.d.ts',
          default: './index.d.ts',
        },
        import: './index.mjs',
        require: './index.js',
        default: './index.js',
      },
    });
    expect(packedManifest.sideEffects).toBe(false);
    expect(packedManifest.dependencies).toBeUndefined();
    expect(packedManifest.peerDependencies).toBeUndefined();
    expect(packedManifest.devDependencies).toBeUndefined();
    expect(packedManifest.scripts).toBeUndefined();
    expect(containsDisallowedPublishedValue(packedManifest)).toBe(false);
    expect(readFileSync(path.resolve(unpackRoot, 'README.md'), 'utf8')).toContain("from '@web-ts-toolkit/json-frame'");
    for (const declarationFile of ['index.d.ts', 'index.d.mts']) {
      const declaration = readFileSync(path.resolve(unpackRoot, declarationFile), 'utf8');
      expect(declaration).toContain('non-empty `values` arrays');
      expect(declaration).toContain('nested JSON');
      expect(declaration).toContain('Table Schema format version');
      expect(declaration).toContain('Fields missing from');
      expect(declaration).toContain('inherited members do not supply cells');
      expect(declaration).toContain("spellings (1 and '1') infer one string-named column");
      expect(declaration).toContain('template patterns such as `metric_${string}` and `${number}`');
      expect(declaration).toContain('Finite template');
      expect(declaration).toContain('it is an assertion, not runtime schema validation');
      expect(declaration).toContain('four-digit years 0000–9999 under proleptic Gregorian rules');
      expect(declaration).toContain('Calendar validity does not guarantee pandas');
    }
    expect(readdirSync(unpackRoot).sort()).toEqual([
      'LICENSE',
      'README.md',
      'index.d.mts',
      'index.d.ts',
      'index.js',
      'index.mjs',
      'package.json',
    ]);
    assertNoNodeBuiltinImports(unpackRoot);
  });

  it('`npm pack --dry-run --json` lists only intended files in the staged json-frame tree', () => {
    const packed = preparePackedWorkspace();
    const stageDir = path.resolve(packed.tempRoot, packageName.replace(/[@/]/g, '_'));
    const stdout = run('npm', ['pack', '--dry-run', '--json'], stageDir);
    const report = JSON.parse(stdout) as Array<{
      entryCount: number;
      bundled: unknown[];
      files: Array<{ path: string }>;
    }>;

    expect(report).toHaveLength(1);
    const [entry] = report;
    expect(entry.bundled).toEqual([]);
    const paths = entry.files.map((file) => file.path).sort();
    const expectedFiles = [
      'LICENSE',
      'README.md',
      'index.d.mts',
      'index.d.ts',
      'index.js',
      'index.mjs',
      'package.json',
    ].sort();
    expect(paths).toEqual(expectedFiles);
    expect(entry.entryCount).toBe(expectedFiles.length);
  });

  it('installs the tarball and runs CJS, ESM, NodeNext, Bundler, and README example consumers', () => {
    const consumerDir = installPackedConsumer();
    writeConsumerFiles(consumerDir);
    writeReadmeExampleFiles(consumerDir);

    run('node', ['consumer.cjs'], consumerDir);
    run('node', ['consumer.mjs'], consumerDir);
    for (const config of ['tsconfig.nodenext.json', 'tsconfig.bundler.json', 'tsconfig.browser.json']) {
      for (const exactOptionalPropertyTypes of ['false', 'true']) {
        run(
          'pnpm',
          [
            'exec',
            'tsc',
            '-p',
            config,
            '--noUncheckedIndexedAccess',
            '--exactOptionalPropertyTypes',
            exactOptionalPropertyTypes,
          ],
          consumerDir,
        );
      }
    }
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.readme.json'], consumerDir);

    const installedPackageDir = path.resolve(consumerDir, 'node_modules', '@web-ts-toolkit', 'json-frame');
    const installedManifest = JSON.parse(
      readFileSync(path.resolve(installedPackageDir, 'package.json'), 'utf8'),
    ) as PackageJson;

    expect(installedManifest.version).toBe(testVersion);
    for (const emitted of ['index.js', 'index.mjs', 'index.d.ts', 'index.d.mts']) {
      expect(existsSync(path.resolve(installedPackageDir, emitted))).toBe(true);
    }

    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
      });

    const allFiles = walk(installedPackageDir).map((file) =>
      path.relative(installedPackageDir, file).replace(/\\/g, '/'),
    );
    expect(allFiles.some((file) => file.endsWith('.map'))).toBe(false);
    assertNoNodeBuiltinImports(installedPackageDir);
  }, 180_000);
});
