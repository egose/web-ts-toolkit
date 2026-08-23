import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

type PackageJson = {
  name: string;
  version: string;
  license?: string;
  repository?: string | { type?: string; url?: string; directory?: string };
  files?: string[];
  main?: string;
  module?: string;
  types?: string;
  bin?: Record<string, string> | string;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
};

type PackedWorkspace = {
  tempRoot: string;
  tarball: string;
  manifest: PackageJson;
  stageDir: string;
};

const localRequire = createRequire(import.meta.url);
const publisherRequire = createRequire(localRequire.resolve('@repo-toolkit/release-artifact')) as NodeRequire;
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

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const packageRoot = path.resolve(__dirname, '..');
const packageName = '@web-ts-toolkit/express-runtime';
const packageDirRelative = 'packages/express-runtime';
const testVersion = '1.2.3';
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
  if (packedWorkspaceCache) return packedWorkspaceCache;

  const tempRoot = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'express-runtime-ert09-')));
  seedToolVersions(tempRoot);
  const tarballDir = path.resolve(tempRoot, 'tarballs');
  mkdirSync(tarballDir, { recursive: true });
  const stageDir = path.resolve(tempRoot, packageName.replace(/[@/]/g, '_'));
  const manifest = buildPublishedManifest();

  stagePublishedPackage(stageDir, manifest);
  run('pnpm', ['pack', '--pack-destination', tarballDir], stageDir);

  const tarball = path.resolve(tarballDir, `web-ts-toolkit-express-runtime-${testVersion}.tgz`);
  if (!existsSync(tarball)) {
    throw new Error(`pnpm pack did not produce expected tarball: ${tarball}`);
  }

  packedWorkspaceCache = { tempRoot, tarball, manifest, stageDir };
  return packedWorkspaceCache;
}

function installPackedConsumer(): string {
  const packed = preparePackedWorkspace();
  const consumerDir = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'express-runtime-consumer-')));
  seedToolVersions(consumerDir);

  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'express-runtime-consumer',
        private: true,
        type: 'module',
        dependencies: {
          [packageName]: `file:${packed.tarball}`,
          express: sourcePackageJson.devDependencies?.express,
        },
        devDependencies: {
          '@types/express': sourcePackageJson.devDependencies?.['@types/express'],
          typescript: rootPackageJson.devDependencies.typescript,
          '@types/node': rootPackageJson.devDependencies['@types/node'],
          tsx: '^4.23.12',
        },
      },
      null,
      2,
    )}\n`,
  );

  run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], consumerDir);
  return consumerDir;
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.resolve(dir, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

function assertExportTargetsExist(stageDir: string, manifest: PackageJson): void {
  const exportsMap = manifest.exports ?? {};
  const targets = new Set<string>();
  const collect = (value: unknown): void => {
    if (typeof value === 'string' && value.startsWith('./')) {
      targets.add(value);
      return;
    }
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) collect(child);
    }
  };
  collect(manifest.main);
  collect(manifest.module);
  collect(manifest.types);
  collect(manifest.bin);
  collect(exportsMap);

  for (const target of targets) {
    expect(existsSync(path.resolve(stageDir, target))).toBe(true);
  }
}

function writeConsumerFiles(consumerDir: string): void {
  writeFileSync(
    path.resolve(consumerDir, 'consumer.mjs'),
    `import assert from 'node:assert/strict';
import * as runtime from '@web-ts-toolkit/express-runtime';
import * as cli from '@web-ts-toolkit/express-runtime/cli';

assert.equal(typeof runtime.createExpressApp, 'function');
assert.equal(typeof runtime.createServerlessHandler, 'function');
assert.equal(typeof runtime.startLocalServer, 'function');
assert.equal(typeof cli.parseArgs, 'function');
assert.equal(typeof cli.createServerlessAdapterApp, 'function');
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.cjs'),
    `const assert = require('node:assert/strict');
const runtime = require('@web-ts-toolkit/express-runtime');
const cli = require('@web-ts-toolkit/express-runtime/cli');

assert.equal(typeof runtime.createExpressApp, 'function');
assert.equal(typeof runtime.createServerlessHandler, 'function');
assert.equal(typeof runtime.startLocalServer, 'function');
assert.equal(typeof cli.parseArgs, 'function');
assert.equal(typeof cli.createServerlessAdapterApp, 'function');
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer-esm.mts'),
    `import express, { type RequestHandler } from 'express';
import {
  createExpressApp,
  createServerlessHandler,
  type ExpressAppOptions,
  type LocalServerOptions,
} from '@web-ts-toolkit/express-runtime';
import { createServerlessAdapterApp, parseArgs, type ApiGatewayRestEvent } from '@web-ts-toolkit/express-runtime/cli';

const middleware: RequestHandler = (_req, _res, next) => next();
const router = express.Router();
router.get('/health', (_req, res) => res.json({ ok: true }));

const options: ExpressAppOptions = {
  middleware: [middleware],
  routers: [{ path: '/api', handler: router }],
};
const app = createExpressApp(options);
const handler = createServerlessHandler(app, { init: async () => undefined });
handler.reset();

const adapter = createServerlessAdapterApp(async (event: unknown) => {
  const typed = event as ApiGatewayRestEvent;
  return { statusCode: 200, headers: { 'content-type': 'text/plain' }, body: typed.path };
});
const parsed = parseArgs(['dev', './app.js']);
const serverOptions: LocalServerOptions = { port: 0, signals: false };

void [adapter, parsed, serverOptions];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer-cjs.cts'),
    `import runtime = require('@web-ts-toolkit/express-runtime');
import cli = require('@web-ts-toolkit/express-runtime/cli');

const app = runtime.createExpressApp({ routers: [] });
const parsed = cli.parseArgs(['start', './dist/app.js']);
const adapterOptions: cli.ServerlessAdapterOptions = { maxBodyBytes: 1024 };
const localOptions: runtime.LocalServerOptions = { port: 0, signals: false };

void [app, parsed, adapterOptions, localOptions];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer-bundler.ts'),
    `import express from 'express';
import { createExpressApp, createServerlessHandler } from '@web-ts-toolkit/express-runtime';
import { parseArgs, type ServerlessResult } from '@web-ts-toolkit/express-runtime/cli';

const router = express.Router();
const app = createExpressApp({ routers: [{ path: () => '/api', handler: router }] });
const handler = createServerlessHandler(app);
const parsed = parseArgs(['build', './src/app.ts']);
const result: ServerlessResult = { statusCode: 204, body: '' };

void [handler, parsed, result];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'tsconfig-nodenext.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2023',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          esModuleInterop: true,
          types: ['node'],
        },
        include: ['consumer-esm.mts', 'consumer-cjs.cts'],
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'tsconfig-bundler.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2023',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          esModuleInterop: true,
          types: ['node'],
        },
        include: ['consumer-bundler.ts'],
      },
      null,
      2,
    )}\n`,
  );
}

afterAll(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop() as string, { recursive: true, force: true });
  }
});

describe('ERT-09 staged export contract', () => {
  it('stages package metadata, export targets, binary paths, and declaration conditions correctly', () => {
    const packed = preparePackedWorkspace();
    const packedManifest = JSON.parse(
      readFileSync(path.resolve(packed.stageDir, 'package.json'), 'utf8'),
    ) as PackageJson;

    expect(packedManifest).toEqual(packed.manifest);
    expect(packedManifest.version).toBe(testVersion);
    expect(packedManifest.license).toBe(rootPackageJson.license);
    expect(packedManifest.engines).toEqual({ node: '>=22' });
    expect(packedManifest.repository).toEqual({ ...rootPackageJson.repository, directory: packageDirRelative });
    expect(packedManifest.files).toEqual(['**/*', '!**/*.map']);
    expect(packedManifest.main).toBe('./index.js');
    expect(packedManifest.module).toBe('./index.mjs');
    expect(packedManifest.types).toBe('./index.d.ts');
    expect(packedManifest.bin).toEqual({ 'wtt-express-runtime': './cli.js' });
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
      './cli': {
        types: {
          import: './cli-api.d.mts',
          require: './cli-api.d.ts',
          default: './cli-api.d.ts',
        },
        import: './cli-api.mjs',
        require: './cli-api.js',
        default: './cli-api.js',
      },
    });
    expect(packedManifest.dependencies).toMatchObject({
      'serverless-http': sourcePackageJson.dependencies?.['serverless-http'],
      tsup: sourcePackageJson.dependencies?.tsup,
    });
    expect(packedManifest.peerDependencies).toEqual({ '@types/express': '^5.0.0', express: '>=5.0.0' });
    expect(packedManifest.devDependencies).toBeUndefined();
    expect(packedManifest.scripts).toBeUndefined();
    expect(containsDisallowedPublishedValue(packedManifest)).toBe(false);
    assertExportTargetsExist(packed.stageDir, packedManifest);

    const publishedCodeFiles = walkFiles(packed.stageDir).filter((file) => /\.(?:js|mjs|d\.ts|d\.mts)$/.test(file));
    expect(publishedCodeFiles.length).toBeGreaterThan(0);
    for (const file of publishedCodeFiles) {
      expect(readFileSync(file, 'utf8')).not.toContain('0.0.0-PLACEHOLDER');
    }
  });

  it('packs only the intended staged files', () => {
    const packed = preparePackedWorkspace();
    const stdout = run('npm', ['pack', '--dry-run', '--json'], packed.stageDir);
    const report = JSON.parse(stdout) as Array<{
      entryCount: number;
      bundled: unknown[];
      files: Array<{ path: string }>;
    }>;
    expect(report).toHaveLength(1);
    const [entry] = report;
    const paths = entry.files.map((file) => file.path).sort();
    const requiredFiles = [
      'LICENSE',
      'README.md',
      'cli-api.d.mts',
      'cli-api.d.ts',
      'cli-api.js',
      'cli-api.mjs',
      'cli.js',
      'index.d.mts',
      'index.d.ts',
      'index.js',
      'index.mjs',
      'package.json',
    ];
    expect(entry.bundled).toEqual([]);
    for (const requiredFile of requiredFiles) {
      expect(paths).toContain(requiredFile);
    }
    expect(paths.some((file) => file.endsWith('.map'))).toBe(false);
    expect(paths.some((file) => file.startsWith('src/') || file.startsWith('test/'))).toBe(false);
    expect(paths.some((file) => file === 'tsconfig.json' || file === 'tsup.config.ts')).toBe(false);
    expect(entry.entryCount).toBe(paths.length);
  });

  it('installs and exercises root, /cli, bin, docs CLI paths, and strict TypeScript consumers', () => {
    const consumerDir = installPackedConsumer();
    writeConsumerFiles(consumerDir);

    run('node', ['consumer.mjs'], consumerDir);
    run('node', ['consumer.cjs'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-bundler.json'], consumerDir);

    const installedPackageDir = path.resolve(consumerDir, 'node_modules', '@web-ts-toolkit', 'express-runtime');
    const installedManifest = JSON.parse(
      readFileSync(path.resolve(installedPackageDir, 'package.json'), 'utf8'),
    ) as PackageJson;
    expect(installedManifest.version).toBe(testVersion);
    expect(existsSync(path.resolve(consumerDir, 'node_modules', '@types', 'express', 'index.d.ts'))).toBe(true);

    const binPath = path.resolve(consumerDir, 'node_modules', '.bin', 'wtt-express-runtime');
    expect(run(binPath, ['--version'], consumerDir).trim()).toBe(testVersion);
    expect(run('node', [path.resolve(installedPackageDir, 'cli.js'), '--version'], consumerDir).trim()).toBe(
      testVersion,
    );
    expect(run(binPath, ['--help'], consumerDir)).toContain('wtt-express-runtime');

    const documentedCliPath = './node_modules/@web-ts-toolkit/express-runtime/cli.js';
    expect(run('pnpm', ['exec', 'tsx', documentedCliPath, '--help'], consumerDir)).toContain('wtt-express-runtime');

    const readme = readFileSync(path.resolve(packageRoot, 'README.md'), 'utf8');
    const websiteDoc = readFileSync(path.resolve(workspaceRoot, 'website/docs/packages/express-runtime.md'), 'utf8');
    expect(readme).not.toContain('@web-ts-toolkit/express-runtime/dist/cli.js');
    expect(websiteDoc).not.toContain('@web-ts-toolkit/express-runtime/dist/cli.js');
    expect(readme).toContain('@web-ts-toolkit/express-runtime/cli.js');
    expect(websiteDoc).toContain('@web-ts-toolkit/express-runtime/cli.js');
  }, 180_000);
});
