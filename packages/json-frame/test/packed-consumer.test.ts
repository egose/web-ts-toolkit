import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

  run('pnpm', ['install', '--no-frozen-lockfile'], consumerDir);
  return consumerDir;
}

function writeConsumerFiles(consumerDir: string): void {
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
      pandas_version: '3.0.3',
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
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.nodenext.mts'),
    `import {
  AmbiguousOrientError,
  fromOrient,
  type DataFrame,
  type JsonValue,
  type TablePayload,
} from '@web-ts-toolkit/json-frame';

type WeatherRow = { city: string; temp: number | null };

const records = fromOrient<WeatherRow>('[{"city":"Paris","temp":21},{"city":"Berlin","temp":null}]');
const typedFrame: DataFrame<WeatherRow> = records;
const exportedTable: TablePayload = records.toTable();
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

void [typedFrame, exportedTable, value, records.resetIndex()];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.nodenext.cts'),
    `import type { DataFrame, JsonValue } from '@web-ts-toolkit/json-frame';

const jsonFrame: typeof import('@web-ts-toolkit/json-frame') = require('@web-ts-toolkit/json-frame');
const frame = jsonFrame.fromOrient<Record<string, JsonValue>>('[{"city":"Paris"}]');
const typed: DataFrame<Record<string, JsonValue>> = frame;
void [typed, jsonFrame.JsonFrameOptionError, frame.toRecords()];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.bundler.ts'),
    `import { fromOrient, type ColumnType, type JsonValue } from '@web-ts-toolkit/json-frame';

const frame = fromOrient(
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

void [columnTypes, parsed, frame.filter((row) => row.coastal === true)];
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
        include: ['consumer.nodenext.mts', 'consumer.nodenext.cts'],
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
        include: ['consumer.bundler.ts'],
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
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.nodenext.json'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.bundler.json'], consumerDir);
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
