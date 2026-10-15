import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { runInstalledBrowserScenario, type BrowserScenario } from './installed-browser-harness.js';

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
  peerDependenciesMeta?: Record<string, unknown>;
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
const packageName = '@web-ts-toolkit/express-request-attestation';
const packageDirRelative = 'packages/express-request-attestation';
const consumerSourceDir = path.resolve(packageRoot, 'test-packed-consumer', 'consumer');
const testVersion = '0.99.0-attestation-test';
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
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
      killSignal: 'SIGKILL',
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
  const tempRoot = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'attestation-packed-')));
  seedToolVersions(tempRoot);
  const tarballDir = path.resolve(tempRoot, 'tarballs');
  mkdirSync(tarballDir, { recursive: true });
  const stageDir = path.resolve(tempRoot, packageName.replace(/[@/]/g, '_'));
  const manifest = buildPublishedManifest();
  stagePublishedPackage(stageDir, manifest);
  run('pnpm', ['pack', '--pack-destination', tarballDir], stageDir);
  const tarball = path.resolve(tarballDir, `web-ts-toolkit-express-request-attestation-${testVersion}.tgz`);
  if (!existsSync(tarball)) {
    throw new Error(`pnpm pack did not produce expected tarball: ${tarball}`);
  }
  packedWorkspaceCache = { tempRoot, tarball, manifest };
  return packedWorkspaceCache;
}

function unpackTarballToDir(tarballPath: string): string {
  const unpackRoot = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'attestation-unpack-')));
  run('tar', ['-xzf', tarballPath, '-C', unpackRoot], workspaceRoot);
  return path.resolve(unpackRoot, 'package');
}

/** Keep strict consumer compiles meaningful: assertions must not hide incompatible public types. */
function checkedConsumerSource(code: string, fileName: string): ts.SourceFile {
  expect(code, fileName).not.toMatch(/@ts-(?:ignore|expect-error|nocheck)\b/);
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node): void {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      // Literal narrowing is fine; asserting an arbitrary handler/body type is not.
      expect(node.type.getText(source), `${fileName}: suppressing type assertion`).toBe('const');
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return source;
}

function expectHoverDocs(text: string, name: string, contractTerms: string[]): void {
  const source = ts.createSourceFile('public.d.ts', text, ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  expect(declaration, `${name} must be declared`).toBeDefined();
  if (declaration === undefined) throw new Error(`Missing public declaration: ${name}`);
  const docs = ts
    .getJSDocCommentsAndTags(declaration)
    .map((comment) => comment.getText(source))
    .join('\n');
  for (const term of contractTerms) {
    expect(docs, `${name} hover must describe ${term}`).toContain(term);
  }
}

function installBackendConsumer(): string {
  const packed = preparePackedWorkspace();
  const consumerDir = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'attestation-backend-consumer-')));
  seedToolVersions(consumerDir);
  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'attestation-backend-consumer',
        private: true,
        type: 'module',
        dependencies: {
          [packageName]: `file:${packed.tarball}`,
          express: sourcePackageJson.devDependencies?.express ?? '^5.2.1',
          redis: sourcePackageJson.devDependencies?.redis ?? '^5.9.0',
          mongodb: sourcePackageJson.devDependencies?.mongodb ?? '^6.20.0',
        },
        devDependencies: {
          '@types/express': sourcePackageJson.devDependencies?.['@types/express'] ?? '^5.0.6',
          '@types/node': rootPackageJson.devDependencies['@types/node'],
          typescript: rootPackageJson.devDependencies.typescript,
        },
      },
      null,
      2,
    )}\n`,
  );
  // Repository-local TMPDIR fixtures must install their own manifest rather
  // than let pnpm discover the enclosing repository workspace.
  writeFileSync(path.resolve(consumerDir, 'pnpm-workspace.yaml'), 'packages: []\n');
  run('pnpm', ['install', '--no-frozen-lockfile'], consumerDir);
  for (const file of [
    'consumer.mjs',
    'consumer.cjs',
    'consumer-types.mts',
    'consumer-types.cts',
    'consumer-bundler.ts',
    'signer-browser-only.ts',
    'tsconfig-nodenext.json',
    'tsconfig-nodenext-cts.json',
    'tsconfig-bundler.json',
    'tsconfig-browser.json',
    'installed-browser-server.mjs',
    'installed-browser.mjs',
    'installed-browser.html',
  ]) {
    cpSync(path.resolve(consumerSourceDir, file), path.resolve(consumerDir, file));
    if (/\.[cm]?ts$/.test(file)) {
      checkedConsumerSource(readFileSync(path.resolve(consumerDir, file), 'utf8'), file);
    }
  }
  return consumerDir;
}

function installBrowserOnlyConsumer(): string {
  const packed = preparePackedWorkspace();
  const consumerDir = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'attestation-browser-consumer-')));
  seedToolVersions(consumerDir);
  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'attestation-browser-consumer',
        private: true,
        type: 'module',
        dependencies: {
          [packageName]: `file:${packed.tarball}`,
        },
        devDependencies: {
          typescript: rootPackageJson.devDependencies.typescript,
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(path.resolve(consumerDir, 'pnpm-workspace.yaml'), 'packages: []\n');
  run('pnpm', ['install', '--no-frozen-lockfile'], consumerDir);
  cpSync(
    path.resolve(consumerSourceDir, 'signer-browser-only.ts'),
    path.resolve(consumerDir, 'signer-browser-only.ts'),
  );
  cpSync(path.resolve(consumerSourceDir, 'tsconfig-browser.json'), path.resolve(consumerDir, 'tsconfig-browser.json'));
  return consumerDir;
}

function compileInstalledReadme(consumerDir: string, mode: 'all' | 'browser' = 'all'): void {
  const readme = readFileSync(
    path.resolve(consumerDir, 'node_modules', '@web-ts-toolkit', 'express-request-attestation', 'README.md'),
    'utf8',
  );
  const blocks = [...readme.matchAll(/```ts\n([\s\S]*?)\n```/g)].map((m) => m[1] as string);
  if (blocks.length < 5) {
    throw new Error(`Installed README must contain at least 5 TypeScript examples, found ${blocks.length}`);
  }
  const backendFiles: string[] = [];
  const browserFiles: string[] = [];
  blocks.forEach((code, index) => {
    expect(code).not.toContain('workspace:');
    expect(code).not.toContain('PLACEHOLDER');
    expect(code).not.toContain("from './src/");
    expect(code).not.toContain('from "../src/');
    const source = checkedConsumerSource(code, `README example ${index + 1}.ts`);
    const isSigner = source.statements.some(
      (node) =>
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === `${packageName}/signer`,
    );
    if (mode === 'browser' && !isSigner) return;
    const file = isSigner ? `readme-browser-${index}.ts` : `readme-backend-${index}.ts`;
    writeFileSync(path.resolve(consumerDir, file), `${code}\nexport {};\n`);
    if (isSigner) {
      browserFiles.push(file);
    } else {
      backendFiles.push(file);
    }
  });
  if ((mode === 'all' && backendFiles.length === 0) || browserFiles.length === 0) {
    throw new Error('Installed README must contain both backend and /signer examples');
  }
  // Backend snippets must not leak into the browser-only compile and vice versa.
  for (const file of browserFiles) {
    const code = readFileSync(path.resolve(consumerDir, file), 'utf8');
    expect(code).not.toContain("from 'express'");
    expect(code).not.toContain('from "express"');
  }
  if (mode === 'all') {
    writeFileSync(
      path.resolve(consumerDir, 'tsconfig-readme-backend.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          esModuleInterop: true,
          types: ['node'],
        },
        include: backendFiles,
      }),
    );
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-readme-backend.json'], consumerDir);
  }
  writeFileSync(
    path.resolve(consumerDir, 'tsconfig-readme-browser.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        esModuleInterop: true,
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        types: [],
      },
      include: browserFiles,
    }),
  );
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-readme-browser.json'], consumerDir);
  console.info(
    `Installed README (${mode}): ${backendFiles.length} backend / ${browserFiles.length} browser examples compiled strictly.`,
  );
}

afterAll(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop() as string, { recursive: true, force: true });
  }
});

describe('packed-package consumer compatibility', () => {
  it('applies the real publish manifest transformation with flattened release paths', () => {
    const packed = preparePackedWorkspace();
    const stagedManifest = packed.manifest;
    const unpackRoot = unpackTarballToDir(packed.tarball);
    const packedManifest = JSON.parse(readFileSync(path.resolve(unpackRoot, 'package.json'), 'utf8')) as PackageJson;

    expect(packedManifest).toEqual(stagedManifest);
    expect(packedManifest.version).toBe(testVersion);
    expect(packedManifest.license).toBe(rootPackageJson.license);
    expect(packedManifest.repository).toEqual({ ...rootPackageJson.repository, directory: packageDirRelative });
    expect(packedManifest.files).toEqual(['**/*', '!**/*.map']);
    expect(packedManifest.main).toBe('./index.js');
    expect(packedManifest.module).toBe('./index.mjs');
    expect(packedManifest.types).toBe('./index.d.ts');
    expect(packedManifest.exports).toEqual({
      '.': {
        types: { import: './index.d.mts', require: './index.d.ts', default: './index.d.ts' },
        import: './index.mjs',
        require: './index.js',
        default: './index.js',
      },
      './signer': {
        types: { import: './signer.d.mts', require: './signer.d.ts', default: './signer.d.ts' },
        import: './signer.mjs',
        require: './signer.js',
        default: './signer.js',
      },
    });
    expect(packedManifest.sideEffects).toBe(false);
    expect(packedManifest.peerDependencies).toEqual({ express: '>=5.0.0' });
    expect(packedManifest.peerDependenciesMeta).toEqual({ express: { optional: true } });
    expect(packedManifest.devDependencies).toBeUndefined();
    expect(packedManifest.scripts).toBeUndefined();
    expect(containsDisallowedPublishedValue(packedManifest)).toBe(false);

    for (const emitted of [
      'index.js',
      'index.mjs',
      'index.d.ts',
      'index.d.mts',
      'signer.js',
      'signer.mjs',
      'signer.d.ts',
      'signer.d.mts',
    ]) {
      expect(existsSync(path.resolve(unpackRoot, emitted))).toBe(true);
    }
    // Flattened release keeps the signer runtime sibling to the server entry.
    expect(existsSync(path.resolve(unpackRoot, 'signer.mjs'))).toBe(true);
    expect(readdirSync(unpackRoot).includes('dist')).toBe(false);

    const declarations = readdirSync(unpackRoot).filter((file) => /\.d\.[cm]?ts$/.test(file));
    for (const declaration of declarations) {
      const text = readFileSync(path.resolve(unpackRoot, declaration), 'utf8');
      expect(text).not.toMatch(/\/src\//);
      expect(text).not.toMatch(/reference path=/);
      expect(text).not.toMatch(/from ['"]\.\.\/src\//);
      expect(text).not.toMatch(/from ['"]\.\/src\//);
      expect(text).not.toMatch(/\b(?:R?ATT|MONGO)-\d+\b|\bscaffold\b|\btask[- ]text\b|\bsection \d+\.\d+/);
      expect(text).not.toMatch(/\bretainUntil\b/);
      // Relative imports that remain must be explicit file imports with
      // extensions (the bundled time-policy chunk), never extensionless
      // directory imports that plain Node ESM cannot resolve.
      for (const match of text.matchAll(/from ['"](\.[^'"]+)['"]/g)) {
        const specifier = match[1] as string;
        expect(specifier).toMatch(/\.(js|mjs|cjs)$/);
        const direct = path.resolve(unpackRoot, specifier);
        const asDts = path.resolve(unpackRoot, specifier.replace(/\.m?js$/, '.d.ts'));
        const asDmts = path.resolve(unpackRoot, specifier.replace(/\.m?js$/, '.d.mts'));
        expect(existsSync(direct) || existsSync(asDts) || existsSync(asDmts)).toBe(true);
      }
      expect(containsDisallowedPublishedValue(text)).toBe(false);
    }
    for (const extension of ['d.ts', 'd.mts']) {
      const server = readFileSync(path.resolve(unpackRoot, `index.${extension}`), 'utf8');
      expectHoverDocs(server, 'createRequestAttestationMiddleware', [
        'express.RequestHandler',
        'operationTimeoutMs',
        'Public HMAC',
      ]);
      expectHoverDocs(server, 'createAttestationBodyCapture', ['inflate: false', 'capture.errorHandler', '413/415']);
      expectHoverDocs(server, 'createMongoAttestationStore', [
        'createIndex({ kind: 1, retainUntilMs: 1 })',
        'expireAfterSeconds',
        'deadlines',
      ]);
      expectHoverDocs(server, 'createSignerBundleRouter', ['/signer-meta', '/prefix/', 'operationTimeoutMs']);
      const signer = readFileSync(path.resolve(unpackRoot, `signer.${extension}`), 'utf8');
      expectHoverDocs(signer, 'createSignerClient', [
        'multiple rotations behind',
        'whole headers/body/import/refetch',
        'dispose()',
      ]);
      expectHoverDocs(signer, 'fetchSignerBundle', ['5000 ms', 'response headers', 'whole-load']);
      expectHoverDocs(signer, 'fetchWithAttestation', ['no-cors', 'first stale response', 'caller-owned']);
    }
    const indexText = readFileSync(path.resolve(unpackRoot, 'index.d.ts'), 'utf8');
    expect(indexText).toContain('createRequestAttestationMiddleware');
    expect(indexText).toContain('createSignerBundleRouter');
    expect(indexText).toContain('Public HMAC material');
    // MONGO-03: MongoDB replay store is part of the root named public surface.
    expect(indexText).toContain('createMongoAttestationStore');
    expect(indexText).toContain('AttestationMongoStoreError');
    expect(indexText).toContain('CreateMongoAttestationStoreOptions');
    const signerText = readFileSync(path.resolve(unpackRoot, 'signer.d.ts'), 'utf8');
    expect(signerText).toContain('createRequestSigner');
    expect(signerText).toContain('fetchWithAttestation');
    expect(signerText).toContain('Public HMAC material');
    // Browser declarations must not import server types. JSDoc prose and
    // fenced examples may mention Express or node:*; only real top-level
    // import statements count (browser-only tsc with types:[] is the
    // authoritative gate and runs in a later test).
    expect(signerText).not.toMatch(/^import .*from ['"]express['"]/m);
    // Allow JSDoc prose (`node:*` in backticks) but reject real node imports.
    expect(signerText).not.toMatch(/^import .*from ['"]node:/m);
    expect(signerText).not.toMatch(/import\(['"]node:/);
    // MONGO-03: the `/signer` closure stays free of Redis/Mongo server types.
    expect(signerText).not.toMatch(/^import .*from ['"]redis['"]/m);
    expect(signerText).not.toMatch(/^import .*from ['"]mongodb['"]/m);
    expect(signerText).not.toMatch(/import\(['"]mongodb:/);
    const signerJs = readFileSync(path.resolve(unpackRoot, 'signer.mjs'), 'utf8');
    expect(signerJs).not.toMatch(/from\s+['"]express['"]/);
    expect(signerJs).not.toMatch(/from\s+['"]node:/);
    expect(signerJs).not.toMatch(/require\(['"]express['"]/);
    expect(signerJs).not.toMatch(/from\s+['"]redis['"]/);
    expect(signerJs).not.toMatch(/from\s+['"]mongodb['"]/);
    expect(signerJs).not.toMatch(/require\(['"]mongodb['"]/);
  }, 180_000);

  it('source and release-shaped inventories agree with their different metadata locations', () => {
    const packed = preparePackedWorkspace();
    const sourceReport = JSON.parse(run('npm', ['pack', '--dry-run', '--json'], packageRoot)) as Array<{
      files: Array<{ path: string }>;
      bundled: unknown[];
    }>;
    expect(sourceReport).toHaveLength(1);
    const sourcePaths = sourceReport[0]?.files.map((f) => f.path).sort();
    expect(sourcePaths).toContain('package.json');
    expect(sourcePaths).toContain('README.md');
    expect(sourcePaths?.some((p) => p.startsWith('dist/'))).toBe(true);

    const stageDir = path.resolve(packed.tempRoot, packageName.replace(/[@/]/g, '_'));
    const stagedReport = JSON.parse(run('npm', ['pack', '--dry-run', '--json'], stageDir)) as Array<{
      files: Array<{ path: string }>;
      bundled: unknown[];
    }>;
    expect(stagedReport).toHaveLength(1);
    expect(stagedReport[0]?.bundled).toEqual([]);
    const stagedPaths = stagedReport[0]?.files.map((f) => f.path).sort() ?? [];
    expect(stagedPaths).toContain('package.json');
    expect(stagedPaths).toContain('README.md');
    expect(stagedPaths).toContain('LICENSE');
    expect(stagedPaths).toContain('index.js');
    expect(stagedPaths).toContain('signer.mjs');
    expect(stagedPaths.some((p) => p.startsWith('dist/'))).toBe(false);
    expect(stagedPaths.some((p) => p.includes('PLACEHOLDER'))).toBe(false);
    // Two `npm pack --dry-run` invocations take ~5.5s; the default 5s test
    // timeout flakes this inventory check.
  }, 120_000);

  it('installs the staged tarball and runs CJS, ESM, NodeNext, Bundler, and README consumers', () => {
    const consumerDir = installBackendConsumer();
    run('node', ['consumer.cjs'], consumerDir);
    run('node', ['consumer.mjs'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext-cts.json'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-bundler.json'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-browser.json'], consumerDir);
    compileInstalledReadme(consumerDir);

    const installedPackageDir = path.resolve(
      consumerDir,
      'node_modules',
      '@web-ts-toolkit',
      'express-request-attestation',
    );
    const installedManifest = JSON.parse(
      readFileSync(path.resolve(installedPackageDir, 'package.json'), 'utf8'),
    ) as PackageJson;
    expect(installedManifest.version).toBe(testVersion);
    for (const emitted of ['index.js', 'index.mjs', 'signer.js', 'signer.mjs']) {
      expect(existsSync(path.resolve(installedPackageDir, emitted))).toBe(true);
    }
  }, 180_000);

  it('supports a browser-only install without Express, Redis, MongoDB, or Node types', () => {
    const consumerDir = installBrowserOnlyConsumer();
    expect(existsSync(path.resolve(consumerDir, 'node_modules', 'express'))).toBe(false);
    expect(existsSync(path.resolve(consumerDir, 'node_modules', 'redis'))).toBe(false);
    expect(existsSync(path.resolve(consumerDir, 'node_modules', 'mongodb'))).toBe(false);
    expect(existsSync(path.resolve(consumerDir, 'node_modules', '@types', 'express'))).toBe(false);
    expect(existsSync(path.resolve(consumerDir, 'node_modules', '@types', 'node'))).toBe(false);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-browser.json'], consumerDir);
    compileInstalledReadme(consumerDir, 'browser');
    const output = run(
      'node',
      [
        '--input-type=module',
        '-e',
        "import * as s from '@web-ts-toolkit/express-request-attestation/signer'; console.log(typeof s.createRequestSigner);",
      ],
      consumerDir,
    );
    expect(output.trim()).toBe('function');
  }, 180_000);

  // One isolated install, with a fresh server process and Chromium context for
  // each case (no shared key, replay, cookie, module, or preflight cache state).
  let browserConsumerDir: string | undefined;
  const browserScenarios: Array<
    BrowserScenario & {
      statuses: number[];
      preflights: number;
      discoveries: number;
      keyModules: number;
      reserves: number;
    }
  > = [
    {
      name: 'same-origin default credentials reach the authenticated handler',
      crossOrigin: false,
      includeCredentials: false,
      rotate: false,
      exposeMarker: true,
      statuses: [200],
      preflights: 0,
      discoveries: 1,
      keyModules: 1,
      reserves: 1,
    },
    {
      name: 'cross-origin explicit cookies recover once from an exposed stale-key challenge',
      crossOrigin: true,
      includeCredentials: true,
      rotate: true,
      exposeMarker: true,
      statuses: [403, 200],
      preflights: 2,
      discoveries: 2,
      keyModules: 2,
      reserves: 1,
    },
    {
      name: 'cross-origin missing marker exposure returns a readable stale response without retry',
      crossOrigin: true,
      includeCredentials: true,
      rotate: true,
      exposeMarker: false,
      statuses: [403],
      preflights: 1,
      discoveries: 1,
      keyModules: 1,
      reserves: 0,
    },
    {
      name: 'cross-origin default credentials omit the cookie and return a readable auth failure',
      crossOrigin: true,
      includeCredentials: false,
      rotate: false,
      exposeMarker: true,
      statuses: [401],
      preflights: 1,
      discoveries: 1,
      keyModules: 1,
      reserves: 0,
    },
    {
      name: 'explicit native fetch in fetchSignerBundle discovers before a credentialed POST',
      crossOrigin: true,
      includeCredentials: true,
      rotate: false,
      exposeMarker: true,
      nativeFetch: 'standalone',
      // Standalone discovery precedes a separate default client; native module caching is shared.
      statuses: [200],
      preflights: 1,
      discoveries: 2,
      keyModules: 1,
      reserves: 1,
    },
    {
      name: 'explicit native fetch in createSignerClient shares discovery and reloads on rotation',
      crossOrigin: true,
      includeCredentials: true,
      rotate: true,
      exposeMarker: true,
      nativeFetch: 'client',
      statuses: [403, 200],
      preflights: 2,
      discoveries: 2,
      keyModules: 2,
      reserves: 1,
    },
    {
      name: 'explicit native fetch in prepared fetch preserves both credentialed attempts',
      crossOrigin: true,
      includeCredentials: true,
      rotate: true,
      exposeMarker: true,
      nativeFetch: 'fetch',
      statuses: [403, 200],
      preflights: 2,
      discoveries: 2,
      keyModules: 2,
      reserves: 1,
    },
    {
      name: 'explicit native fetchFn in prepared fetch preserves both credentialed attempts',
      crossOrigin: true,
      includeCredentials: true,
      rotate: true,
      exposeMarker: true,
      nativeFetch: 'fetchFn',
      statuses: [403, 200],
      preflights: 2,
      discoveries: 2,
      keyModules: 2,
      reserves: 1,
    },
  ];

  it.each(browserScenarios)(
    'installed Chromium: $name',
    async (scenario) => {
      browserConsumerDir ??= installBackendConsumer();
      const requestTarget = '/api/submit?part=two%2Fparts&order=1&order=2';
      // Whitespace, UTF-8, and query spelling make reserialization observable.
      const bodyText = '{\n  "message": "café / 雪 🚀",\n  "items": [3, 1],\n  "enabled": true\n}\n';
      const capturedBody = {
        digestHex: createHash('sha256').update(bodyText).digest('hex'),
        byteLength: Buffer.byteLength(bodyText),
      };
      const { ready, browser, report, pageErrors, chromiumVersion } = await runInstalledBrowserScenario(
        browserConsumerDir,
        scenario,
        { requestTarget, bodyText },
      );
      const api = report.traffic.filter((row) => row.target.startsWith('/api/') && row.method !== 'OPTIONS');
      const preflights = report.traffic.filter((row) => row.method === 'OPTIONS');
      const discovery = report.traffic.filter((row) => row.target === '/attestation/signer-meta');
      const keyModules = report.traffic.filter((row) => /^\/attestation\/signer\.[a-f0-9]{64}\.mjs$/.test(row.target));
      const runtimes = report.traffic.filter((row) => /^\/attestation\/runtime\.[a-f0-9]{64}\.mjs$/.test(row.target));
      const publicEntry = report.traffic.filter((row) => row.target === '/installed-signer.mjs');
      console.info(`Installed Chromium ${chromiumVersion}: ${scenario.name}`, {
        apiStatuses: api.map((row) => row.status),
        preflights: preflights.length,
        discoveries: discovery.length,
        keyModules: keyModules.length,
        runtimeModules: runtimes.length,
        bodyBytes: capturedBody.byteLength,
        ...report.counters,
      });

      expect(path.relative(browserConsumerDir, ready.signerEntry)).toMatch(/^node_modules\//);
      expect(ready.signerEntry).toMatch(/\/signer\.mjs$/);
      expect(ready.signerEntry).not.toMatch(/\/(src|dist)\//);
      expect(pageErrors).toEqual([]);
      expect(browser.secureContext).toBe(true);
      expect(browser.visibleCookies).toBe(''); // The HTTP session cookie is HttpOnly.
      expect(browser.credentials).toBe(scenario.includeCredentials ? 'include' : 'same-origin');
      expect(browser.callerBodyUsed).toBe(false);
      expect(browser.callerBodyText).toBe(bodyText);
      expect(browser.discoveryProbe).toEqual(
        scenario.nativeFetch === 'standalone' || scenario.nativeFetch === 'client'
          ? {
              kind: scenario.nativeFetch,
              keyId: 'installed-k1',
              publicOrigin: ready.apiOrigin,
              replayNamespace: ready.replayNamespace,
              shared: scenario.nativeFetch === 'client' ? true : null,
            }
          : null,
      );
      expect(browser.response).toMatchObject({
        status: scenario.statuses.at(-1),
        type: scenario.crossOrigin ? 'cors' : 'basic',
        url: `${ready.apiOrigin}${requestTarget}`,
        redirected: false,
        marker: null,
        bodyUsed: false,
        bodyLocked: false,
      });

      expect(publicEntry).toHaveLength(1);
      expect(publicEntry[0]).toMatchObject({ method: 'GET', status: 200, fetchDest: 'script' });
      expect(discovery).toHaveLength(scenario.discoveries);
      expect(keyModules).toHaveLength(scenario.keyModules);
      expect(new Set(keyModules.map((row) => row.target)).size).toBe(scenario.keyModules);
      expect(runtimes).toHaveLength(1); // Native module cache shares the runtime across the replacement import.
      for (const row of [...discovery, ...keyModules, ...runtimes]) {
        expect(row).toMatchObject({ method: 'GET', status: 200, fetchMode: 'cors' });
        if (scenario.crossOrigin) {
          expect(row).toMatchObject({ origin: ready.webOrigin, allowOrigin: ready.webOrigin, cookie: null });
        }
      }
      for (const row of discovery) {
        expect(row).toMatchObject({ cookie: null, fetchDest: 'empty', cacheControl: 'no-store' });
      }
      for (const row of [...keyModules, ...runtimes]) {
        expect(row).toMatchObject({ fetchDest: 'script', cacheControl: 'public, max-age=31536000, immutable' });
      }

      const authenticated = !scenario.crossOrigin || scenario.includeCredentials;
      expect(api.map((row) => row.status)).toEqual(scenario.statuses);
      expect(report.counters).toEqual({
        captureCalls: scenario.statuses.length,
        authCalls: scenario.statuses.length,
        authorizedCalls: authenticated ? scenario.statuses.length : 0,
        guardCalls: authenticated ? scenario.statuses.length : 0,
        rotations: scenario.rotate ? 1 : 0,
        reserveCalls: scenario.reserves,
        successfulReservations: scenario.reserves,
        businessCalls: scenario.reserves,
      });
      for (const row of api) {
        expect(row).toMatchObject({
          method: 'POST',
          target: requestTarget,
          origin: scenario.crossOrigin ? ready.webOrigin : ready.apiOrigin,
          contentType: 'application/json; charset=utf-8',
          fetchMode: 'cors',
          fetchDest: 'empty',
          proofHeaderCount: 1,
          rawBodyHex: Buffer.from(bodyText).toString('hex'),
          capturedBody,
          parsedBody: JSON.parse(bodyText),
          cookie: authenticated ? report.sessionCookie : null,
          principal: authenticated ? 'installed-browser-user' : null,
        });
        expect(row.proof).not.toBe('caller-proof-must-be-replaced');
        expect(row.envelope).not.toBeNull();
        expect(row.envelope?.nonceHex).toMatch(/^[a-f0-9]{32}$/);
        expect(row.envelope?.mac).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(row.envelope?.timestampMs).toBeGreaterThanOrEqual(row.receivedAtMs - 10_000);
        expect(row.envelope?.timestampMs).toBeLessThanOrEqual(row.receivedAtMs);
        if (scenario.crossOrigin) {
          expect(row).toMatchObject({ allowOrigin: ready.webOrigin, allowCredentials: 'true' });
        }
      }
      expect(api[0]?.envelope?.keyId).toBe('installed-k1');
      if (scenario.statuses.length === 2) {
        expect(api[1]?.envelope?.keyId).toBe('installed-k2');
        expect(api[1]?.proof).not.toBe(api[0]?.proof);
        expect(api[1]?.envelope?.nonceHex).not.toBe(api[0]?.envelope?.nonceHex);
        expect(api[1]?.envelope?.mac).not.toBe(api[0]?.envelope?.mac);
        expect(api[1]?.envelope?.timestampMs).toBeGreaterThanOrEqual(api[0]?.envelope?.timestampMs ?? Infinity);
        expect(api[1]?.rawBodyHex).toBe(api[0]?.rawBodyHex);
      }
      if (scenario.rotate) {
        expect(api[0]).toMatchObject({
          status: 403,
          marker: 'stale-key',
          exposedHeaders: scenario.exposeMarker ? 'x-attestation-error' : null,
          cacheControl: 'no-store',
          countersAtResponse: { reserveCalls: 0, successfulReservations: 0, businessCalls: 0 },
        });
      }

      expect(preflights).toHaveLength(scenario.preflights);
      for (const row of preflights) {
        expect(row).toMatchObject({
          target: requestTarget,
          origin: ready.webOrigin,
          cookie: null,
          proof: null,
          proofHeaderCount: 0,
          requestedMethod: 'POST',
          status: 204,
          allowOrigin: ready.webOrigin,
          allowCredentials: 'true',
          allowMethods: 'POST',
          allowHeaders: 'content-type, x-client-transaction-id',
          maxAge: '0',
          countersAtResponse: { reserveCalls: 0, businessCalls: 0 },
        });
        expect(row.requestedHeaders.sort()).toEqual(['content-type', 'x-client-transaction-id']);
      }
      expect(report.reservations.map((row) => row.result)).toEqual(Array(scenario.reserves).fill('reserved'));
      if (scenario.reserves === 1) {
        const effect = {
          principal: 'installed-browser-user',
          body: JSON.parse(bodyText),
          target: requestTarget,
          capturedBody,
        };
        expect(report.effects).toEqual([effect]);
        expect(JSON.parse(browser.response.text)).toEqual({ ok: true, ...effect });
        expect(report.reservations[0]?.replayKey).toMatch(/^att:v1:[a-f0-9]{64}$/);
      } else {
        expect(report.effects).toEqual([]);
        expect(browser.response.cacheControl).toBe('no-store');
        expect(JSON.parse(browser.response.text)).toEqual(
          scenario.rotate
            ? {
                code: 'ATTESTATION_STALE_KEY',
                message: 'Request signing key is no longer accepted.',
              }
            : { code: 'UNAUTHORIZED', message: 'Fixture session is required.' },
        );
      }
    },
    180_000,
  );
});
