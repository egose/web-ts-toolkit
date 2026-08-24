import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { afterAll, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
const packageName = '@web-ts-toolkit/pdf-reader';
const packageDirRelative = 'packages/pdf-reader';
const testVersion = '0.99.0-pdf-reader-pdfr02';
const tempRoots: string[] = [];
const viteVersion = '^8.0.14';

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

  const tempRoot = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'pdf-reader-pdfr02-')));
  seedToolVersions(tempRoot);
  const tarballDir = path.resolve(tempRoot, 'tarballs');
  mkdirSync(tarballDir, { recursive: true });
  const stageDir = path.resolve(tempRoot, packageName.replace(/[@/]/g, '_'));
  const manifest = buildPublishedManifest();

  stagePublishedPackage(stageDir, manifest);
  run('pnpm', ['pack', '--pack-destination', tarballDir], stageDir);

  const tarball = path.resolve(tarballDir, `web-ts-toolkit-pdf-reader-${testVersion}.tgz`);
  if (!existsSync(tarball)) {
    throw new Error(`pnpm pack did not produce expected tarball: ${tarball}`);
  }

  packedWorkspaceCache = { tempRoot, tarball, manifest };
  return packedWorkspaceCache;
}

function unpackTarballToDir(tarballPath: string): string {
  const unpackRoot = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'pdf-reader-pdfr02-unpack-')));
  run('tar', ['-xzf', tarballPath, '-C', unpackRoot], workspaceRoot);
  return path.resolve(unpackRoot, 'package');
}

function installPackedConsumer(): string {
  const packed = preparePackedWorkspace();
  const consumerDir = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'pdf-reader-consumer-')));
  seedToolVersions(consumerDir);

  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'pdf-reader-consumer',
        private: true,
        type: 'module',
        dependencies: {
          [packageName]: `file:${packed.tarball}`,
          'pdfjs-dist': sourcePackageJson.devDependencies?.['pdfjs-dist'],
        },
        devDependencies: {
          typescript: rootPackageJson.devDependencies.typescript,
          vite: viteVersion,
        },
      },
      null,
      2,
    )}\n`,
  );

  run('pnpm', ['install', '--no-frozen-lockfile'], consumerDir);
  return consumerDir;
}

function copyDeclConsumerFiles(consumerDir: string): void {
  for (const file of ['decl-consumer.mts', 'tsconfig-bundler.json', 'tsconfig-nodenext.json']) {
    cpSync(path.resolve(packageRoot, 'test-decl-consumer', file), path.resolve(consumerDir, file));
  }
}

function writeBundlerFiles(consumerDir: string): void {
  mkdirSync(path.resolve(consumerDir, 'src'), { recursive: true });

  writeFileSync(
    path.resolve(consumerDir, 'index.html'),
    [
      '<!doctype html>',
      '<html lang="en">',
      '  <body>',
      '    <div id="app"></div>',
      '    <script type="module" src="/src/main.ts"></script>',
      '  </body>',
      '</html>',
      '',
    ].join('\n'),
  );

  writeFileSync(
    path.resolve(consumerDir, 'src', 'main.ts'),
    `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  PDFReader,
  PdfReaderError,
  configurePdfWorker,
  type ConvertOptions,
  type PageResult,
} from '@web-ts-toolkit/pdf-reader';

configurePdfWorker(workerUrl);

const reader = new PDFReader(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
  canvasFactory: () => document.createElement('canvas'),
});
const options: ConvertOptions = {
  includePageImage: false,
  includeText: true,
  signal: new AbortController().signal,
};
const pages: AsyncGenerator<PageResult> = reader.pages(options);

document.querySelector<HTMLDivElement>('#app')!.textContent = [workerUrl, PdfReaderError.name].join(' | ');

void [reader, pages];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'vite.config.mjs'),
    `export default {
  build: {
    outDir: 'dist',
  },
};
`,
  );
}

afterAll(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop() as string, { recursive: true, force: true });
  }
});

describe('PDFR-02 packed consumer compatibility', () => {
  it('applies the real publish manifest transformation and exposes only the ESM artifact set', () => {
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
    expect(packedManifest.engines).toEqual({ node: '>=22.13.0' });
    expect(packedManifest.files).toEqual(['**/*', '!**/*.map']);
    expect(packedManifest.main).toBe('./index.mjs');
    expect(packedManifest.module).toBe('./index.mjs');
    expect(packedManifest.types).toBe('./index.d.mts');
    expect(packedManifest.exports).toEqual({
      '.': {
        types: './index.d.mts',
        import: './index.mjs',
        default: './index.mjs',
      },
    });
    expect(packedManifest.sideEffects).toBe(false);
    expect(packedManifest.peerDependencies).toEqual({ 'pdfjs-dist': '~6.2.108' });
    expect(packedManifest.devDependencies).toBeUndefined();
    expect(packedManifest.scripts).toBeUndefined();
    expect(containsDisallowedPublishedValue(packedManifest)).toBe(false);
    expect(readFileSync(path.resolve(unpackRoot, 'README.md'), 'utf8')).toContain('ESM-only');
    expect(readdirSync(unpackRoot).sort()).toEqual([
      'LICENSE',
      'README.md',
      'index.d.mts',
      'index.mjs',
      'package.json',
    ]);
  });

  it('`npm pack --dry-run --json` lists only the intended public artifacts', () => {
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
    const expectedFiles = ['LICENSE', 'README.md', 'index.d.mts', 'index.mjs', 'package.json'].sort();

    expect(paths).toEqual(expectedFiles);
    expect(entry.entryCount).toBe(expectedFiles.length);
  });

  it('installs the tarball, typechecks strict consumers, and bundles the browser ESM entry', () => {
    const consumerDir = installPackedConsumer();
    copyDeclConsumerFiles(consumerDir);
    writeBundlerFiles(consumerDir);

    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-bundler.json'], consumerDir);
    run('pnpm', ['exec', 'vite', 'build'], consumerDir);

    const installedPackageDir = path.resolve(consumerDir, 'node_modules', '@web-ts-toolkit', 'pdf-reader');
    const installedManifest = JSON.parse(
      readFileSync(path.resolve(installedPackageDir, 'package.json'), 'utf8'),
    ) as PackageJson;

    expect(installedManifest.version).toBe(testVersion);
    expect(existsSync(path.resolve(installedPackageDir, 'index.mjs'))).toBe(true);
    expect(existsSync(path.resolve(installedPackageDir, 'index.d.mts'))).toBe(true);
    expect(existsSync(path.resolve(installedPackageDir, 'index.js'))).toBe(false);
    expect(existsSync(path.resolve(installedPackageDir, 'index.d.ts'))).toBe(false);
    expect(existsSync(path.resolve(consumerDir, 'dist', 'index.html'))).toBe(true);
  }, 180_000);
});
