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
  tarballs: Record<string, string>;
  manifests: Record<string, PackageJson>;
};

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const packageRoot = path.resolve(__dirname, '..');
const consumerSourceDir = path.resolve(packageRoot, 'test-packed-consumer', 'consumer');
const packageName = '@web-ts-toolkit/express-oidc-vault';
const memoryPackageName = '@web-ts-toolkit/express-oidc-vault-memory-store';
const providerNames = [
  memoryPackageName,
  '@web-ts-toolkit/express-oidc-vault-redis-store',
  '@web-ts-toolkit/express-oidc-vault-mongodb-store',
];
const testVersion = '0.99.0-test';
const packageDirRelative = 'packages/express-oidc-vault';

const rootPackageJson = JSON.parse(readFileSync(path.resolve(workspaceRoot, 'package.json'), 'utf8')) as {
  author?: string;
  bugs?: unknown;
  engines?: Record<string, string>;
  license: string;
  repository: { type?: string; url?: string };
  devDependencies: Record<string, string>;
};
const sourcePackageJson = JSON.parse(readFileSync(path.resolve(packageRoot, 'package.json'), 'utf8')) as PackageJson;
const tempRoots: string[] = [];
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
      maxBuffer: 16 * 1024 * 1024,
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

function buildPublishedManifest(source = sourcePackageJson, directory = packageDirRelative): PackageJson {
  return createPublishPackageJson(source as Record<string, unknown>, {
    version: testVersion,
    internalPackageNames: new Set([packageName, ...providerNames]),
    rootMetadata: {
      author: rootPackageJson.author,
      bugs: rootPackageJson.bugs,
      engines: rootPackageJson.engines,
      license: rootPackageJson.license,
      repository: { ...rootPackageJson.repository, directory },
    },
    rewrite: { versionPlaceholder: DEFAULT_VERSION_PLACEHOLDER, publishDir: 'dist' },
  }) as PackageJson;
}

function stagePublishedPackage(stageDir: string, manifest: PackageJson, sourceRoot = packageRoot): void {
  mkdirSync(stageDir, { recursive: true });
  cpSync(path.resolve(sourceRoot, 'dist'), stageDir, { recursive: true });
  for (const entry of DEFAULT_PACKAGE_FILES) {
    const source = path.resolve(sourceRoot, entry);
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

  const tempRoot = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'express-oidc-vault-oidc11-')));
  seedToolVersions(tempRoot);
  const tarballDir = path.resolve(tempRoot, 'tarballs');
  mkdirSync(tarballDir, { recursive: true });
  const stageDir = path.resolve(tempRoot, packageName.replace(/[@/]/g, '_'));
  const manifest = buildPublishedManifest();
  stagePublishedPackage(stageDir, manifest);
  run('pnpm', ['pack', '--pack-destination', tarballDir], stageDir);
  // Core's prebuild is complete. Build each documentation dependency alone,
  // sequentially, so a clean checkout can compile every installed wiring example.
  const providerTarballs: Record<string, string> = {};
  const providerManifests: Record<string, PackageJson> = {};
  for (const name of providerNames) {
    run('pnpm', ['--filter', name, 'build'], workspaceRoot);
    const directory = `packages/${name.split('/')[1]}`;
    const root = path.resolve(workspaceRoot, directory);
    const source = JSON.parse(readFileSync(path.resolve(root, 'package.json'), 'utf8')) as PackageJson;
    const published = buildPublishedManifest(source, directory);
    const stage = path.resolve(tempRoot, name.replace(/[@/]/g, '_'));
    stagePublishedPackage(stage, published, root);
    run('pnpm', ['pack', '--pack-destination', tarballDir], stage);
    providerTarballs[name] = path.resolve(
      tarballDir,
      `${name.replace('@web-ts-toolkit/', 'web-ts-toolkit-')}-${testVersion}.tgz`,
    );
    providerManifests[name] = published;
  }

  const tarball = path.resolve(tarballDir, `web-ts-toolkit-express-oidc-vault-${testVersion}.tgz`);
  if (!existsSync(tarball)) {
    throw new Error(`pnpm pack did not produce expected tarball: ${tarball}`);
  }

  packedWorkspaceCache = {
    tempRoot,
    tarballs: { [packageName]: tarball, ...providerTarballs },
    manifests: { [packageName]: manifest, ...providerManifests },
  };
  return packedWorkspaceCache;
}

function unpackTarballToDir(tarballPath: string): string {
  const unpackRoot = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'express-oidc-vault-oidc11-unpack-')));
  run('tar', ['-xzf', tarballPath, '-C', unpackRoot], workspaceRoot);
  return path.resolve(unpackRoot, 'package');
}

function installPackedConsumer(): string {
  const packed = preparePackedWorkspace();
  const consumerDir = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'express-oidc-vault-consumer-')));
  seedToolVersions(consumerDir);
  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'express-oidc-vault-consumer',
        private: true,
        type: 'module',
        dependencies: {
          [packageName]: `file:${packed.tarballs[packageName]}`,
          ...Object.fromEntries(providerNames.map((name) => [name, `file:${packed.tarballs[name]}`])),
          express: sourcePackageJson.devDependencies?.express,
          jose: sourcePackageJson.dependencies?.jose,
          cors: '^2.8.6',
          idb: '^8.0.3',
          redis: '^5.9.0',
          mongodb: '^6.20.0',
        },
        devDependencies: {
          '@types/express': sourcePackageJson.devDependencies?.['@types/express'],
          '@types/node': rootPackageJson.devDependencies['@types/node'],
          '@types/cors': '^2.8.19',
          typescript: rootPackageJson.devDependencies.typescript,
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'pnpm-workspace.yaml'),
    `packages: []\noverrides:\n  '${packageName}': file:${packed.tarballs[packageName]}\n`,
  );
  run('pnpm', ['install', '--no-frozen-lockfile'], consumerDir);
  return consumerDir;
}

function copyConsumerSources(consumerDir: string): void {
  for (const file of [
    'consumer.cjs',
    'consumer.mjs',
    'consumer-types.ts',
    'consumer-types.cts',
    'tsconfig-nodenext.json',
    'tsconfig-nodenext-cts.json',
    'tsconfig-bundler.json',
    'docs-runtime.mjs',
  ]) {
    cpSync(path.resolve(consumerSourceDir, file), path.resolve(consumerDir, file));
  }
}

function compileInstalledReadme(consumerDir: string): void {
  const readme = readFileSync(path.resolve(consumerDir, 'node_modules', packageName, 'README.md'), 'utf8');
  const snippet = (heading: string): string => {
    const start = readme.indexOf(heading);
    if (start < 0) throw new Error(`Installed README heading missing: ${heading}`);
    const code = readme.slice(start).match(/```ts\n([\s\S]*?)\n```/)?.[1];
    if (!code) throw new Error(`Installed README snippet missing: ${heading}`);
    return code;
  };
  const server = snippet('### Complete DPoP server');
  writeFileSync(path.resolve(consumerDir, 'readme-server.ts'), server);
  writeFileSync(path.resolve(consumerDir, 'readme-server.cts'), server);
  const backendSnippets = [
    server,
    snippet('### POST login and browser-authenticated callback'),
    snippet('### Sender-constrained exchange, refresh and logout'),
    snippet('## Optional Fingerprint Recognition (Not PoP)'),
    snippet('## Local Access Token Example (unbound Bearer)'),
    snippet('## Access Token Validation Middleware'),
    snippet('### Request-aware DPoP APIs'),
    snippet('## Quick Start (default unbound lifecycle)'),
    snippet('### Memory store'),
    snippet('### Redis store'),
    snippet('### MongoDB store'),
    snippet('### Cookie transport\n'),
    snippet('### Manual endpoint mode'),
    snippet('### Audit and user provisioning hooks'),
  ];
  // The POST/config snippets above are individually complete. Wire DTO snippets
  // are extracted by their function names to avoid selecting a preceding config.
  for (const name of ['initiateLogin', 'exchangeBoundCode']) {
    const code = [...readme.matchAll(/```ts\n([\s\S]*?)\n```/g)].find((match) =>
      match[1].includes(`async function ${name}(`),
    )?.[1];
    if (!code) throw new Error(`Installed DTO snippet missing: ${name}`);
    backendSnippets.push(code);
  }
  const files = backendSnippets.map((code, index) => {
    const file = `readme-backend-${index}.ts`;
    writeFileSync(path.resolve(consumerDir, file), `${code}\nexport {};\n`);
    return file;
  });
  const options = {
    target: 'ES2022',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    strict: true,
    skipLibCheck: false,
    noEmit: true,
    esModuleInterop: true,
    types: ['node'],
  };
  writeFileSync(
    path.resolve(consumerDir, 'tsconfig-readme-nodenext.json'),
    JSON.stringify({
      compilerOptions: options,
      files: [...files, 'readme-server.cts'],
    }),
  );
  writeFileSync(
    path.resolve(consumerDir, 'tsconfig-readme-bundler.json'),
    JSON.stringify({
      compilerOptions: { ...options, module: 'ESNext', moduleResolution: 'Bundler' },
      files,
    }),
  );
  const browserSnippets = [
    snippet('### Standalone body-transport DPoP client'),
    snippet('### Default unbound bearer frontend'),
    snippet('### Cookie transport frontend example'),
    snippet('### Frontend signal adapter'),
  ];
  const browserFiles = browserSnippets.map((code, index) => {
    expect(code).not.toContain('@web-ts-toolkit/express');
    const file = index === 0 ? 'readme-browser.ts' : `readme-browser-${index}.ts`;
    writeFileSync(path.resolve(consumerDir, file), `${code}\nexport {};\n`);
    return file;
  });
  writeFileSync(
    path.resolve(consumerDir, 'tsconfig-readme-browser.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: false,
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        types: [],
        outDir: 'compiled-readme',
      },
      files: browserFiles,
    }),
  );
  for (const config of [
    'tsconfig-readme-nodenext.json',
    'tsconfig-readme-bundler.json',
    'tsconfig-readme-browser.json',
  ]) {
    run('pnpm', ['exec', 'tsc', '-p', config], consumerDir);
  }
  // Compile a real proof from the extracted browser code and authenticate it
  // using installed core + memory packages (both CJS and ESM conditions).
  run('node', ['docs-runtime.mjs', 'esm'], consumerDir);
  run('node', ['docs-runtime.mjs', 'cjs'], consumerDir);
}

afterAll(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop() as string, { recursive: true, force: true });
  }
});

describe('OIDC-11 packed-package consumer compatibility', () => {
  it('applies the real publish manifest transformation to the express-oidc-vault tarball', () => {
    const packed = preparePackedWorkspace();
    const stagedManifest = packed.manifests[packageName];
    const unpackRoot = unpackTarballToDir(packed.tarballs[packageName]);
    const packedManifest = JSON.parse(readFileSync(path.resolve(unpackRoot, 'package.json'), 'utf8')) as PackageJson;

    expect(packedManifest).toEqual(stagedManifest);
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
    expect(packedManifest.peerDependencies).toEqual({ express: '>=5.0.0' });
    expect(packedManifest.dependencies).toEqual({ jose: '^6.1.0' });
    expect(packedManifest.engines).toEqual({ node: '>=22.12.0' });
    expect(packedManifest.devDependencies).toBeUndefined();
    expect(packedManifest.scripts).toBeUndefined();
    expect(containsDisallowedPublishedValue(packedManifest)).toBe(false);
    for (const emitted of ['index.js', 'index.mjs', 'index.d.ts', 'index.d.mts']) {
      expect(existsSync(path.resolve(unpackRoot, emitted))).toBe(true);
    }
    for (const declaration of ['index.d.ts', 'index.d.mts']) {
      const text = readFileSync(path.resolve(unpackRoot, declaration), 'utf8');
      expect(text).not.toMatch(/from ['"]\.|\/src\/|reference path=/);
      for (const contract of [
        'OidcVaultDeviceBindingOptions',
        'OidcVaultApiDeviceBindingOptions',
        'OidcVaultRequestAwareAccessTokenValidator',
        'OidcVaultDeviceBindingStoreProvider',
        'OidcVaultLoginInitiationResult',
      ]) {
        expect(text).toContain(contract);
      }
      expect(text).toContain('No live reservation is evicted');
      expect(text).toContain('Create the OIDC lifecycle router using a named package-root import');
    }
  }, 180_000);

  it('`npm pack --dry-run --json` lists only intended files in the staged express-oidc-vault tree', () => {
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
    const paths = entry.files.map((f) => f.path).sort();
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

  it('installs the staged tarball and runs CJS, ESM, NodeNext, NodeNext-CJS, and Bundler consumers', () => {
    const consumerDir = installPackedConsumer();
    copyConsumerSources(consumerDir);

    run('node', ['consumer.cjs'], consumerDir);
    run('node', ['consumer.mjs'], consumerDir);
    run('pnpm', ['--ignore-workspace', 'exec', 'tsc', '-p', 'tsconfig-nodenext.json'], consumerDir);
    run('pnpm', ['--ignore-workspace', 'exec', 'tsc', '-p', 'tsconfig-nodenext-cts.json'], consumerDir);
    run('pnpm', ['--ignore-workspace', 'exec', 'tsc', '-p', 'tsconfig-bundler.json'], consumerDir);
    compileInstalledReadme(consumerDir);

    const nodenextTrace = run(
      'pnpm',
      ['--ignore-workspace', 'exec', 'tsc', '-p', 'tsconfig-nodenext.json', '--traceResolution'],
      consumerDir,
    );
    expect(nodenextTrace).toMatch(/Resolving module '@web-ts-toolkit\/express-oidc-vault'/);
    expect(nodenextTrace).toMatch(
      /Resolving in ESM mode with conditions 'import'[\s\S]*?express-oidc-vault\/index\.d\.mts'/,
    );
    const nodenextCtsTrace = run(
      'pnpm',
      ['--ignore-workspace', 'exec', 'tsc', '-p', 'tsconfig-nodenext-cts.json', '--traceResolution'],
      consumerDir,
    );
    expect(nodenextCtsTrace).toMatch(/Resolving module '@web-ts-toolkit\/express-oidc-vault'/);
    expect(nodenextCtsTrace).toMatch(
      /Resolving in CJS mode with conditions 'require'[\s\S]*?express-oidc-vault\/index\.d\.ts'/,
    );

    const installedPackageDir = path.resolve(consumerDir, 'node_modules', '@web-ts-toolkit', 'express-oidc-vault');
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
    const allFiles = walk(installedPackageDir).map((p) => path.relative(installedPackageDir, p).replace(/\\/g, '/'));
    expect(allFiles.some((p) => p.endsWith('.map'))).toBe(false);
  }, 180_000);
});
