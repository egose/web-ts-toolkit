import { execFileSync, spawn } from 'node:child_process';
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
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe', maxBuffer: 16 * 1024 * 1024 });
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
  ]) {
    cpSync(path.resolve(consumerSourceDir, file), path.resolve(consumerDir, file));
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
  run('pnpm', ['install', '--no-frozen-lockfile'], consumerDir);
  cpSync(
    path.resolve(consumerSourceDir, 'signer-browser-only.ts'),
    path.resolve(consumerDir, 'signer-browser-only.ts'),
  );
  cpSync(path.resolve(consumerSourceDir, 'tsconfig-browser.json'), path.resolve(consumerDir, 'tsconfig-browser.json'));
  return consumerDir;
}

function compileInstalledReadme(consumerDir: string): void {
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
    const isSigner = code.includes('/signer');
    const file = isSigner ? `readme-browser-${index}.ts` : `readme-backend-${index}.ts`;
    writeFileSync(path.resolve(consumerDir, file), `${code}\nexport {};\n`);
    if (isSigner) {
      browserFiles.push(file);
    } else {
      backendFiles.push(file);
    }
  });
  if (backendFiles.length === 0 || browserFiles.length === 0) {
    throw new Error('Installed README must contain both backend and /signer examples');
  }
  // Backend snippets must not leak into the browser-only compile and vice versa.
  for (const file of browserFiles) {
    const code = readFileSync(path.resolve(consumerDir, file), 'utf8');
    expect(code).not.toContain("from 'express'");
    expect(code).not.toContain('from "express"');
  }
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
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-readme-backend.json'], consumerDir);
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-readme-browser.json'], consumerDir);
}

async function runInstalledRouterBrowserCheck(consumerDir: string): Promise<void> {
  const serverScript = path.resolve(consumerDir, 'installed-router-server.mjs');
  writeFileSync(
    serverScript,
    `import express from 'express';
import {
  createMemoryAttestationStore,
  createRequestAttestationMiddleware,
  createSignerBundleRouter,
  createStaticKeyProvider,
  generateAttestationKey,
} from '@web-ts-toolkit/express-request-attestation';

const app = express();
app.get('/', (_req, res) => res.type('html').send('<html><body>attestation</body></html>'));
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.on('listening', resolve));
const address = server.address();
const baseUrl = 'http://127.0.0.1:' + address.port;
const now = Date.now();
const entry = generateAttestationKey('v1-installed-01', { acceptFrom: now - 60000, acceptUntil: now + 60000 });
const keyProvider = createStaticKeyProvider({ currentKeyId: entry.keyId, keys: [entry] });
const store = createMemoryAttestationStore({ now: () => now });
const guard = createRequestAttestationMiddleware({
  publicOrigin: baseUrl,
  replayNamespace: 'packed-installed',
  keyProvider,
  store,
  now: () => now,
});
app.use('/attestation', createSignerBundleRouter({
  publicOrigin: baseUrl,
  replayNamespace: 'packed-installed',
  keyProvider,
  now: () => now,
}));
app.use('/api', guard);
app.post('/api/submit', (_req, res) => res.json({ ok: true }));
console.log('READY ' + baseUrl);
await new Promise(() => undefined);
`,
  );
  const child = spawn('node', [serverScript], { cwd: consumerDir, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });
  const baseUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`installed server did not start: ${stdout} ${stderr}`)), 15_000);
    const check = (): void => {
      const match = /READY (http:\/\/[^\s]+)/.exec(stdout);
      if (match?.[1] !== undefined) {
        clearTimeout(timer);
        resolve(match[1]);
        return;
      }
      if (child.exitCode !== null) {
        clearTimeout(timer);
        reject(new Error(`installed server exited early: ${stdout} ${stderr}`));
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    try {
      const meta = (await (await fetch(`${baseUrl}/attestation/signer-meta`)).json()) as {
        keyId: string;
        signerUrl: string;
      };
      expect(meta.keyId).toBe('v1-installed-01');
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
      const transactionId = (await page.evaluate(
        [
          '(async () => {',
          `  const signerUrl = ${JSON.stringify(meta.signerUrl)};`,
          '  const mod = await import(signerUrl);',
          "  if (typeof mod.signer?.sign !== 'function') {",
          "    throw new Error('installed module does not export signer.sign');",
          '  }',
          '  return mod.signer.sign({',
          "    method: 'POST',",
          "    requestTarget: '/api/submit',",
          "    contentType: '',",
          "    bodyHashHex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',", // pragma: allowlist secret
          '    timestampMs: ' + String(Date.now()) + ',',
          "    nonceHex: '0123456789abcdef0123456789abcdef',", // pragma: allowlist secret
          '  });',
          '})()',
        ].join('\n'),
      )) as string;
      expect(typeof transactionId).toBe('string');
      expect(transactionId.length).toBeGreaterThan(0);
      await page.close();
    } finally {
      await browser.close();
    }
  } finally {
    child.kill('SIGKILL');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

afterAll(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop() as string, { recursive: true, force: true });
  }
});

describe('ATT-08 packed-package consumer compatibility', () => {
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

    for (const declaration of ['index.d.ts', 'index.d.mts', 'signer.d.ts', 'signer.d.mts']) {
      const text = readFileSync(path.resolve(unpackRoot, declaration), 'utf8');
      expect(text).not.toMatch(/\/src\//);
      expect(text).not.toMatch(/reference path=/);
      expect(text).not.toMatch(/from ['"]\.\.\/src\//);
      expect(text).not.toMatch(/from ['"]\.\/src\//);
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
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-browser.json'], consumerDir);
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

  it('serves flattened signer assets from the installed tarball in a real browser', async () => {
    const consumerDir = installBackendConsumer();
    await runInstalledRouterBrowserCheck(consumerDir);
  }, 180_000);
});
