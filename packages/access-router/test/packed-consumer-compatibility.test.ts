import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

type PackageJson = {
  name: string;
  version: string;
  license?: string;
  repository?: string | { type?: string; url?: string };
  files?: string[];
  exports?: Record<string, Record<string, string>>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

type PackedWorkspace = {
  tempRoot: string;
  tarballs: Record<string, string>;
  manifests: Record<string, PackageJson>;
};

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const packageRoot = path.resolve(__dirname, '..');
const rootPackageJson = JSON.parse(readFileSync(path.resolve(workspaceRoot, 'package.json'), 'utf8')) as {
  version: string;
  license: string;
  repository: { type?: string; url?: string };
  devDependencies: Record<string, string>;
};
const rootLicensePath = path.resolve(workspaceRoot, 'LICENSE');
const releaseVersion = rootPackageJson.version;
const typescriptVersion = rootPackageJson.devDependencies.typescript;
const nodeTypesVersion = rootPackageJson.devDependencies['@types/node'];

const workspacePackages = [
  { name: '@web-ts-toolkit/utils', dir: path.resolve(workspaceRoot, 'packages/utils') },
  { name: '@web-ts-toolkit/http-errors', dir: path.resolve(workspaceRoot, 'packages/http-errors') },
  {
    name: '@web-ts-toolkit/express-response-handler',
    dir: path.resolve(workspaceRoot, 'packages/express-response-handler'),
  },
  { name: '@web-ts-toolkit/express-json-router', dir: path.resolve(workspaceRoot, 'packages/express-json-router') },
  { name: '@web-ts-toolkit/access-router', dir: packageRoot },
] as const;

const tempRoots: string[] = [];

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function rewriteDependencyBlock(
  block: Record<string, string> | undefined,
  workspaceNames: Set<string>,
): Record<string, string> | undefined {
  if (block == null) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(block).map(([name, version]) => {
      if (typeof version === 'string' && version.startsWith('workspace:') && workspaceNames.has(name)) {
        return [name, releaseVersion];
      }

      return [name, version];
    }),
  );
}

function rewriteManifest(manifest: PackageJson, workspaceNames: Set<string>): PackageJson {
  const repository =
    manifest.repository === 'PLACEHOLDER' ||
    (typeof manifest.repository === 'object' && manifest.repository?.url === 'PLACEHOLDER')
      ? rootPackageJson.repository
      : manifest.repository;

  return {
    ...manifest,
    version: releaseVersion,
    license: manifest.license === 'PLACEHOLDER' ? rootPackageJson.license : manifest.license,
    repository,
    dependencies: rewriteDependencyBlock(manifest.dependencies, workspaceNames),
    peerDependencies: rewriteDependencyBlock(manifest.peerDependencies, workspaceNames),
    devDependencies: rewriteDependencyBlock(manifest.devDependencies, workspaceNames),
    optionalDependencies: rewriteDependencyBlock(manifest.optionalDependencies, workspaceNames),
  };
}

function stagePackage(stageDir: string, sourceDir: string, manifest: PackageJson): void {
  mkdirSync(stageDir, { recursive: true });

  for (const entry of manifest.files ?? []) {
    const source = path.resolve(sourceDir, entry);
    if (!existsSync(source)) {
      continue;
    }

    const target = path.resolve(stageDir, entry);
    cpSync(source, target, { recursive: true });
  }

  if (existsSync(rootLicensePath)) {
    cpSync(rootLicensePath, path.resolve(stageDir, 'LICENSE'));
  }

  writeFileSync(path.resolve(stageDir, 'package.json'), JSON.stringify(manifest, null, 2));
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

let packedWorkspaceCache: PackedWorkspace | undefined;

function preparePackedWorkspace(): PackedWorkspace {
  if (packedWorkspaceCache) {
    return packedWorkspaceCache;
  }

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'access-router-ar22-'));
  tempRoots.push(tempRoot);
  const tarballDir = path.resolve(tempRoot, 'tarballs');
  mkdirSync(tarballDir, { recursive: true });
  const workspaceNames = new Set(workspacePackages.map((pkg) => pkg.name));
  const tarballs: Record<string, string> = {};
  const manifests: Record<string, PackageJson> = {};

  for (const pkg of workspacePackages) {
    const rawManifest = JSON.parse(readFileSync(path.resolve(pkg.dir, 'package.json'), 'utf8')) as PackageJson;
    const manifest = rewriteManifest(rawManifest, workspaceNames);
    const stageDir = path.resolve(tempRoot, pkg.name.replace(/[@/]/g, '_'));
    stagePackage(stageDir, pkg.dir, manifest);
    run('pnpm', ['pack', '--pack-destination', tarballDir], stageDir);
    tarballs[pkg.name] = path.resolve(
      tarballDir,
      `${pkg.name.replace('@web-ts-toolkit/', 'web-ts-toolkit-')}-${releaseVersion}.tgz`,
    );
    manifests[pkg.name] = manifest;
  }

  packedWorkspaceCache = { tempRoot, tarballs, manifests };
  return packedWorkspaceCache;
}

function unpackTarball(tarballPath: string): PackageJson {
  const unpackRoot = mkdtempSync(path.join(os.tmpdir(), 'access-router-ar22-unpack-'));
  tempRoots.push(unpackRoot);
  run('tar', ['-xzf', tarballPath, '-C', unpackRoot], workspaceRoot);
  return JSON.parse(readFileSync(path.resolve(unpackRoot, 'package/package.json'), 'utf8')) as PackageJson;
}

function installPackedConsumer(expressVersion: string, mongooseVersion: string): string {
  const packed = preparePackedWorkspace();
  const consumerDir = mkdtempSync(path.join(os.tmpdir(), 'access-router-consumer-'));
  tempRoots.push(consumerDir);

  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    JSON.stringify({ name: 'access-router-consumer', private: true, type: 'module' }, null, 2),
  );

  run(
    'pnpm',
    [
      'add',
      packed.tarballs['@web-ts-toolkit/utils'],
      packed.tarballs['@web-ts-toolkit/http-errors'],
      packed.tarballs['@web-ts-toolkit/express-response-handler'],
      packed.tarballs['@web-ts-toolkit/express-json-router'],
      packed.tarballs['@web-ts-toolkit/access-router'],
      `express@${expressVersion}`,
      `mongoose@${mongooseVersion}`,
    ],
    consumerDir,
  );

  run(
    'pnpm',
    ['add', '-D', `typescript@${typescriptVersion}`, `@types/node@${nodeTypesVersion}`, '@types/express@^5.0.0'],
    consumerDir,
  );

  return consumerDir;
}

function writeConsumerFiles(consumerDir: string): void {
  writeFileSync(
    path.resolve(consumerDir, 'esm.mjs'),
    `import acl, { createAccessRuntime, guard } from '@web-ts-toolkit/access-router';
import { Codes, parseBody } from '@web-ts-toolkit/access-router/advanced';
import { copyAndDepopulate } from '@web-ts-toolkit/access-router/processors';

const runtime = createAccessRuntime();
const output = copyAndDepopulate({ items: [{ _id: 'x', name: 'x' }] }, [{ src: 'items', dest: 'snapshot' }], {
  mutable: false,
});

if (typeof acl.createRouter !== 'function') throw new Error('missing default runtime API');
if (typeof runtime.createRouter !== 'function') throw new Error('missing isolated runtime API');
if (typeof guard !== 'function') throw new Error('missing guard export');
if (typeof parseBody !== 'function') throw new Error('missing advanced parser export');
if (Codes.Success == null) throw new Error('missing Codes export');
if (output.items[0] !== 'x') throw new Error('processors subpath failed');
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'cjs.cjs'),
    `const accessRouter = require('@web-ts-toolkit/access-router');
const advanced = require('@web-ts-toolkit/access-router/advanced');
const processors = require('@web-ts-toolkit/access-router/processors');

const acl = accessRouter.default ?? accessRouter.acl ?? accessRouter;
const runtime = accessRouter.createAccessRuntime();
const output = processors.copyAndDepopulate({ items: [{ _id: 'x', name: 'x' }] }, [{ src: 'items', dest: 'snapshot' }], {
  mutable: false,
});

if (typeof acl.createRouter !== 'function') throw new Error('missing createRouter');
if (typeof runtime.createRouter !== 'function') throw new Error('missing runtime.createRouter');
if (typeof advanced.parseBody !== 'function') throw new Error('missing parseBody');
if (!advanced.Codes || !advanced.Codes.Success) throw new Error('missing Codes');
if (output.items[0] !== 'x') throw new Error('processors subpath failed');
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.nodenext.ts'),
    `import acl, { createAccessRuntime, type GuardModelCondition, type RootRouterOptions } from '@web-ts-toolkit/access-router';
import { Codes } from '@web-ts-toolkit/access-router/advanced';
import { copyAndDepopulate, type CopyAndDepopulateOptions, type ProcessCopy } from '@web-ts-toolkit/access-router/processors';

const opts: RootRouterOptions = { basePath: '/api', operationAccess: true };
const condition: GuardModelCondition = { modelName: 'User', id: 'x', condition: 'isAdmin' };
const op: ProcessCopy = { src: 'items', dest: 'snapshot' };
const processorOptions: CopyAndDepopulateOptions = { mutable: false };
const runtime = createAccessRuntime();
const out = copyAndDepopulate({ items: [{ _id: 'x' }] }, [op], processorOptions);

void [acl, runtime, opts, condition, Codes, out];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.bundler.ts'),
    `import acl, { createAccessRuntime, type GuardModelCondition } from '@web-ts-toolkit/access-router';
import { MIDDLEWARE } from '@web-ts-toolkit/access-router/advanced';
import { copyAndDepopulate } from '@web-ts-toolkit/access-router/processors';

const condition: GuardModelCondition = { modelName: 'User', id: 'x', condition: 'isAdmin' };
const runtime = createAccessRuntime();
const out = copyAndDepopulate({ items: [{ _id: 'x' }] }, [{ src: 'items', dest: 'snapshot' }], { mutable: false });

void [acl, runtime, condition, MIDDLEWARE, out];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'tsconfig.nodenext.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: ['node'],
        },
        include: ['consumer.nodenext.ts'],
      },
      null,
      2,
    ),
  );

  writeFileSync(
    path.resolve(consumerDir, 'tsconfig.bundler.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: ['node'],
        },
        include: ['consumer.bundler.ts'],
      },
      null,
      2,
    ),
  );
}

function runConsumerSmokeTests(consumerDir: string): void {
  writeConsumerFiles(consumerDir);
  run('node', ['cjs.cjs'], consumerDir);
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.nodenext.json'], consumerDir);
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.bundler.json'], consumerDir);
}

afterAll(() => {
  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('AR-22 packed-package compatibility and manifest verification', () => {
  it('rewrites packed manifest metadata and internal dependency versions for release artifacts', () => {
    const packed = preparePackedWorkspace();
    const accessRouterManifest = unpackTarball(packed.tarballs['@web-ts-toolkit/access-router']);

    expect(accessRouterManifest.version).toBe(releaseVersion);
    expect(accessRouterManifest.license).toBe(rootPackageJson.license);
    expect(accessRouterManifest.repository).toEqual(rootPackageJson.repository);
    expect(accessRouterManifest.files).toEqual(expect.arrayContaining(['README.md', 'llms.txt', 'dist']));
    expect(accessRouterManifest.exports).toMatchObject({
      '.': expect.objectContaining({
        types: './dist/index.d.ts',
        import: './dist/index.mjs',
        require: './dist/index.js',
      }),
      './advanced': expect.objectContaining({
        types: './dist/advanced.d.ts',
        import: './dist/advanced.mjs',
        require: './dist/advanced.js',
      }),
      './processors': expect.objectContaining({
        types: './dist/processors.d.ts',
        import: './dist/processors.mjs',
        require: './dist/processors.js',
      }),
    });
    expect(accessRouterManifest.dependencies).toMatchObject({
      '@web-ts-toolkit/express-json-router': releaseVersion,
      '@web-ts-toolkit/utils': releaseVersion,
    });
    expect(containsDisallowedPublishedValue(accessRouterManifest)).toBe(false);
  });

  it.each([
    ['minimum peers', '5.0.0', '8.0.0'],
    ['current majors', '5.2.1', '9.8.0'],
  ])(
    'supports %s from packed tarballs in CJS runtime plus NodeNext and Bundler TypeScript consumers',
    (_label, expressVersion, mongooseVersion) => {
      const consumerDir = installPackedConsumer(expressVersion, mongooseVersion);
      runConsumerSmokeTests(consumerDir);
    },
  );
});
