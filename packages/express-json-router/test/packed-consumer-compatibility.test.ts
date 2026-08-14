import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
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
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
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
  author?: string;
  bugs?: unknown;
  engines?: Record<string, string>;
  repository: { type?: string; url?: string };
  devDependencies: Record<string, string>;
};
const rootLicensePath = path.resolve(workspaceRoot, 'LICENSE');
const testVersion = '0.99.0-express-json-router-test';
const typescriptVersion = rootPackageJson.devDependencies.typescript;
const nodeTypesVersion = rootPackageJson.devDependencies['@types/node'];

const workspacePackages = [
  { name: '@web-ts-toolkit/utils', dir: path.resolve(workspaceRoot, 'packages/utils') },
  { name: '@web-ts-toolkit/http-errors', dir: path.resolve(workspaceRoot, 'packages/http-errors') },
  {
    name: '@web-ts-toolkit/express-response-handler',
    dir: path.resolve(workspaceRoot, 'packages/express-response-handler'),
  },
  { name: '@web-ts-toolkit/express-json-router', dir: packageRoot },
] as const;

const tempRoots: string[] = [];
let packedWorkspaceCache: PackedWorkspace | undefined;

function run(command: string, args: string[], cwd: string): string {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    const details = error as { stdout?: string; stderr?: string; message?: string };
    throw new Error([details.message, details.stdout, details.stderr].filter(Boolean).join('\n'), { cause: error });
  }
}

function seedToolVersions(dir: string): void {
  const workspaceToolVersions = path.resolve(workspaceRoot, '.tool-versions');
  if (existsSync(workspaceToolVersions)) {
    cpSync(workspaceToolVersions, path.resolve(dir, '.tool-versions'));
  }
}

function mergeRootRepository(
  rootRepository: { type?: string; url?: string } | undefined,
  packageDirRelative: string,
): { type?: string; url?: string; directory?: string } | undefined {
  return rootRepository ? { ...rootRepository, directory: packageDirRelative } : undefined;
}

function buildPublishedManifest(sourceManifest: PackageJson, packageDirRelative: string): PackageJson {
  return createPublishPackageJson(sourceManifest as Record<string, unknown>, {
    version: testVersion,
    internalPackageNames: new Set(workspacePackages.map((pkg) => pkg.name)),
    rootMetadata: {
      author: rootPackageJson.author,
      bugs: rootPackageJson.bugs,
      engines: rootPackageJson.engines,
      license: rootPackageJson.license,
      repository: mergeRootRepository(rootPackageJson.repository, packageDirRelative),
    },
    rewrite: { versionPlaceholder: DEFAULT_VERSION_PLACEHOLDER, publishDir: 'dist' },
  }) as PackageJson;
}

function stagePublishedPackage(stageDir: string, sourceDir: string, manifest: PackageJson): void {
  mkdirSync(stageDir, { recursive: true });
  cpSync(path.resolve(sourceDir, 'dist'), stageDir, { recursive: true });

  for (const entry of DEFAULT_PACKAGE_FILES) {
    const source = path.resolve(sourceDir, entry);
    if (existsSync(source)) {
      cpSync(source, path.resolve(stageDir, path.basename(entry)));
    }
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

function preparePackedWorkspace(): PackedWorkspace {
  if (packedWorkspaceCache) {
    return packedWorkspaceCache;
  }

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'express-json-router-packed-'));
  tempRoots.push(tempRoot);
  seedToolVersions(tempRoot);
  const tarballDir = path.resolve(tempRoot, 'tarballs');
  mkdirSync(tarballDir, { recursive: true });
  const tarballs: Record<string, string> = {};
  const manifests: Record<string, PackageJson> = {};

  for (const pkg of workspacePackages) {
    const rawManifest = JSON.parse(readFileSync(path.resolve(pkg.dir, 'package.json'), 'utf8')) as PackageJson;
    const manifest = buildPublishedManifest(rawManifest, path.relative(workspaceRoot, pkg.dir).replace(/\\/g, '/'));
    const stageDir = path.resolve(tempRoot, pkg.name.replace(/[@/]/g, '_'));
    stagePublishedPackage(stageDir, pkg.dir, manifest);
    run('pnpm', ['pack', '--pack-destination', tarballDir], stageDir);

    const tarballName = pkg.name.replace('@web-ts-toolkit/', 'web-ts-toolkit-');
    const resolvedTarball = path.resolve(tarballDir, `${tarballName}-${testVersion}.tgz`);
    if (!existsSync(resolvedTarball)) {
      throw new Error(`pnpm pack did not produce expected tarball: ${resolvedTarball}`);
    }

    tarballs[pkg.name] = resolvedTarball;
    manifests[pkg.name] = manifest;
  }

  packedWorkspaceCache = { tempRoot, tarballs, manifests };
  return packedWorkspaceCache;
}

function unpackTarballToDir(tarballPath: string): string {
  const unpackRoot = mkdtempSync(path.join(os.tmpdir(), 'express-json-router-unpack-'));
  tempRoots.push(unpackRoot);
  run('tar', ['-xzf', tarballPath, '-C', unpackRoot], workspaceRoot);
  return path.resolve(unpackRoot, 'package');
}

function installPackedConsumer(): string {
  const packed = preparePackedWorkspace();
  const consumerDir = mkdtempSync(path.join(os.tmpdir(), 'express-json-router-consumer-'));
  tempRoots.push(consumerDir);
  seedToolVersions(consumerDir);

  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    JSON.stringify(
      {
        name: 'express-json-router-consumer',
        private: true,
        type: 'module',
        dependencies: {
          ...Object.fromEntries(workspacePackages.map((pkg) => [pkg.name, `file:${packed.tarballs[pkg.name]}`])),
          express: '^5.2.1',
        },
        devDependencies: {
          typescript: typescriptVersion,
          '@types/node': nodeTypesVersion,
          '@types/express': '^5.0.6',
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.resolve(consumerDir, 'pnpm-workspace.yaml'),
    ['packages: []', 'overrides:']
      .concat(workspacePackages.map((pkg) => `  '${pkg.name}': file:${packed.tarballs[pkg.name]}`))
      .join('\n') + '\n',
  );
  run('pnpm', ['install'], consumerDir);

  return consumerDir;
}

function writeConsumerFiles(consumerDir: string): void {
  writeFileSync(
    path.resolve(consumerDir, 'esm.mjs'),
    `import JsonRouter from '@web-ts-toolkit/express-json-router';

const entry = import.meta.resolve('@web-ts-toolkit/express-json-router');
const first = JsonRouter.defaultHandler;
const second = JsonRouter.defaultHandler;
const router = new JsonRouter('/api');
router.get('/health', () => ({ ok: true }));

if (!entry.endsWith('/index.mjs')) throw new Error(entry);
if (typeof JsonRouter !== 'function') throw new Error('missing default export');
if (first === second) throw new Error('defaultHandler must create a fresh handler');
if (router.getEndpoints()[0]?.path !== '/api/health') throw new Error('endpoint registration failed');
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'cjs.cjs'),
    `const mod = require('@web-ts-toolkit/express-json-router');
const JsonRouter = mod.default;
const entry = require.resolve('@web-ts-toolkit/express-json-router');
const first = JsonRouter.defaultHandler;
const second = JsonRouter.defaultHandler;
const router = new JsonRouter('/api');
router.get('/health', () => ({ ok: true }));

if (!entry.endsWith('/index.js')) throw new Error(entry);
if (typeof JsonRouter !== 'function') throw new Error('missing default export');
if (first === second) throw new Error('defaultHandler must create a fresh handler');
if (router.getEndpoints()[0]?.path !== '/api/health') throw new Error('endpoint registration failed');
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.nodenext.mts'),
    `import JsonRouter, { type JsonRouterCallback, type JsonRouterEndpoint } from '@web-ts-toolkit/express-json-router';
import { BadRequestError } from '@web-ts-toolkit/http-errors';

JsonRouter.errorMessageProvider = () => 'custom-error';
const firstRouter = new JsonRouter('/api');
JsonRouter.errorMessageProvider = () => 'later-error';
const secondRouter = new JsonRouter('/admin', undefined, JsonRouter.createHandler({ errorFormat: JsonRouter.ErrorFormats.rfc9457 }));
const callback: JsonRouterCallback<{ id: string }> = (req) => ({ id: req.params.id });

firstRouter.get('/users/:id', callback);
secondRouter.post('/validation', () => { throw new BadRequestError('invalid'); });

const endpoints: JsonRouterEndpoint[] = firstRouter.getEndpoints();
void [endpoints, secondRouter, JsonRouter.HttpResponse.created({ ok: true })];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.nodenext.cts'),
    `import JsonRouterModule = require('@web-ts-toolkit/express-json-router');
import type { JsonRouterCallback, JsonRouterEndpoint } from '@web-ts-toolkit/express-json-router';

const JsonRouter = JsonRouterModule.default;
const callback: JsonRouterCallback<{ id: string }> = (req) => ({ id: req.params.id });
const router = new JsonRouter('/api');
router.get('/users/:id', callback);
const endpoints: JsonRouterEndpoint[] = router.getEndpoints();
void endpoints;
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.bundler.ts'),
    `import JsonRouter, { type JsonRouterCallback } from '@web-ts-toolkit/express-json-router';

const handler = JsonRouter.createHandler({ errorFormat: JsonRouter.ErrorFormats.aip193 });
handler.errorMessageProvider = () => 'isolated';
const router = new JsonRouter('/api', undefined, handler);
const callback: JsonRouterCallback<{ id: string }> = (req) => ({ id: req.params.id });
router.get('/users/:id', callback);
void router.getEndpoints();
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
          skipLibCheck: false,
          esModuleInterop: true,
          types: ['node'],
        },
        include: ['consumer.nodenext.mts', 'consumer.nodenext.cts'],
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
          skipLibCheck: false,
          esModuleInterop: true,
          types: ['node'],
        },
        include: ['consumer.bundler.ts'],
      },
      null,
      2,
    ),
  );
}

function writeDocumentationExampleFiles(consumerDir: string): void {
  const docs = [
    { fileNamePrefix: 'readme', path: 'README.md' },
    { fileNamePrefix: 'llms', path: 'llms.txt' },
  ];
  const exampleFiles: string[] = [];

  for (const doc of docs) {
    const content = readFileSync(
      path.resolve(consumerDir, 'node_modules/@web-ts-toolkit/express-json-router', doc.path),
      'utf8',
    );
    let index = 0;

    for (const match of content.matchAll(/```ts\n([\s\S]*?)\n```/g)) {
      index += 1;
      const fileName = `${doc.fileNamePrefix}-example-${index}.ts`;
      exampleFiles.push(fileName);
      writeFileSync(path.resolve(consumerDir, fileName), match[1]);
    }

    if (index === 0) {
      throw new Error(`${doc.path} contains no TypeScript examples to compile`);
    }
  }

  if (exampleFiles.length === 0) {
    throw new Error('documentation contains no TypeScript examples to compile');
  }

  writeFileSync(
    path.resolve(consumerDir, 'tsconfig.docs.json'),
    JSON.stringify(
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
        include: exampleFiles,
      },
      null,
      2,
    ),
  );
}

function runConsumerSmokeTests(consumerDir: string): void {
  writeConsumerFiles(consumerDir);
  writeDocumentationExampleFiles(consumerDir);
  run('node', ['esm.mjs'], consumerDir);
  run('node', ['cjs.cjs'], consumerDir);
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.nodenext.json'], consumerDir);
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.bundler.json'], consumerDir);
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.docs.json'], consumerDir);
}

afterAll(() => {
  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('express-json-router packed consumer compatibility', () => {
  it('packs the production-transformed manifest and intended file allowlist', () => {
    const packed = preparePackedWorkspace();
    const stagedManifest = packed.manifests['@web-ts-toolkit/express-json-router'];
    const packageDir = unpackTarballToDir(packed.tarballs['@web-ts-toolkit/express-json-router']);
    const packedManifest = JSON.parse(readFileSync(path.resolve(packageDir, 'package.json'), 'utf8')) as PackageJson;

    expect(packedManifest).toEqual(stagedManifest);
    expect(packedManifest.version).toBe(testVersion);
    expect(packedManifest.license).toBe(rootPackageJson.license);
    expect(packedManifest.repository).toEqual({
      ...rootPackageJson.repository,
      directory: 'packages/express-json-router',
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
    expect(packedManifest.dependencies).toMatchObject({
      '@web-ts-toolkit/express-response-handler': testVersion,
      '@web-ts-toolkit/http-errors': testVersion,
      '@web-ts-toolkit/utils': testVersion,
      '@types/express': '^5.0.6',
      express: '^5.2.1',
    });
    expect(packedManifest.devDependencies).toBeUndefined();
    expect(packedManifest.scripts).toBeUndefined();
    expect(containsDisallowedPublishedValue(packedManifest)).toBe(false);
    expect(readFileSync(path.resolve(packageDir, 'README.md'), 'utf8')).toContain(
      "import JsonRouter from '@web-ts-toolkit/express-json-router'",
    );
    expect(readFileSync(path.resolve(packageDir, 'llms.txt'), 'utf8')).toContain(
      "import JsonRouter from '@web-ts-toolkit/express-json-router'",
    );

    expect(readdirSync(packageDir).sort()).toEqual([
      'LICENSE',
      'README.md',
      'index.d.mts',
      'index.d.ts',
      'index.js',
      'index.mjs',
      'llms.txt',
      'package.json',
    ]);
  });

  it('rewrites every internal workspace dependency in the packed closure', () => {
    const packed = preparePackedWorkspace();

    for (const pkg of workspacePackages) {
      const packageDir = unpackTarballToDir(packed.tarballs[pkg.name]);
      const manifest = JSON.parse(readFileSync(path.resolve(packageDir, 'package.json'), 'utf8')) as PackageJson;

      expect(manifest.version).toBe(testVersion);
      expect(containsDisallowedPublishedValue(manifest)).toBe(false);
      for (const blockField of ['dependencies', 'peerDependencies', 'optionalDependencies'] as const) {
        const block = manifest[blockField];
        if (block) {
          for (const [name, range] of Object.entries(block)) {
            if (name.startsWith('@web-ts-toolkit/')) {
              expect(range).toBe(testVersion);
            }
          }
        }
      }
    }
  });

  it('runs ESM, CJS, NodeNext, and Bundler consumers against installed tarballs', () => {
    const consumerDir = installPackedConsumer();
    runConsumerSmokeTests(consumerDir);
  }, 60000);
});
