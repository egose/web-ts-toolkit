import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
      rootMetadata?: Record<string, unknown>;
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
  main?: string;
  module?: string;
  types?: string;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  files?: string[];
};

const packageRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '..', '..');
const testVersion = '0.99.0-http-errors-hte06';
const tempRoots: string[] = [];
const rootPackageJson = JSON.parse(readFileSync(path.resolve(workspaceRoot, 'package.json'), 'utf8')) as {
  license: string;
  author?: string;
  bugs?: unknown;
  engines?: Record<string, string>;
  repository: { type?: string; url?: string };
  devDependencies: Record<string, string>;
};
const workspacePackages = [
  { name: '@web-ts-toolkit/utils', dir: path.resolve(workspaceRoot, 'packages', 'utils') },
  { name: '@web-ts-toolkit/http-errors', dir: packageRoot },
] as const;

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

function buildPublishedManifest(sourceDir: string, sourceManifest: PackageJson): PackageJson {
  const packageDirRelative = path.relative(workspaceRoot, sourceDir).replace(/\\/g, '/');

  return createPublishPackageJson(sourceManifest as Record<string, unknown>, {
    version: testVersion,
    internalPackageNames: new Set(workspacePackages.map((pkg) => pkg.name)),
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

function stagePublishedPackage(stageDir: string, sourceDir: string, manifest: PackageJson): void {
  mkdirSync(stageDir, { recursive: true });
  cpSync(path.resolve(sourceDir, 'dist'), stageDir, { recursive: true });

  for (const entry of DEFAULT_PACKAGE_FILES) {
    const source = path.resolve(sourceDir, entry);
    if (existsSync(source)) {
      cpSync(source, path.resolve(stageDir, path.basename(entry)));
    }
  }

  const licenseSource = path.resolve(workspaceRoot, 'LICENSE');
  if (existsSync(licenseSource)) {
    cpSync(licenseSource, path.resolve(stageDir, 'LICENSE'));
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

let packedWorkspaceCache: { tarballs: Record<string, string>; manifests: Record<string, PackageJson> } | undefined;

function preparePackedWorkspace() {
  if (packedWorkspaceCache) {
    return packedWorkspaceCache;
  }

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'http-errors-hte06-packed-'));
  tempRoots.push(tempRoot);
  seedToolVersions(tempRoot);
  const tarballDir = path.resolve(tempRoot, 'tarballs');
  mkdirSync(tarballDir, { recursive: true });
  const tarballs: Record<string, string> = {};
  const manifests: Record<string, PackageJson> = {};

  for (const pkg of workspacePackages) {
    const rawManifest = JSON.parse(readFileSync(path.resolve(pkg.dir, 'package.json'), 'utf8')) as PackageJson;
    const manifest = buildPublishedManifest(pkg.dir, rawManifest);
    const stageDir = path.resolve(tempRoot, pkg.name.replace(/[@/]/g, '_'));
    stagePublishedPackage(stageDir, pkg.dir, manifest);
    run('pnpm', ['pack', '--pack-destination', tarballDir], stageDir);

    const tarballName = pkg.name.replace('@web-ts-toolkit/', 'web-ts-toolkit-');
    const tarball = path.resolve(tarballDir, `${tarballName}-${testVersion}.tgz`);
    if (!existsSync(tarball)) {
      throw new Error(`pnpm pack did not produce expected tarball: ${tarball}`);
    }
    tarballs[pkg.name] = tarball;
    manifests[pkg.name] = manifest;
  }

  packedWorkspaceCache = { tarballs, manifests };
  return packedWorkspaceCache;
}

function unpackTarballToDir(tarballPath: string): string {
  const unpackRoot = mkdtempSync(path.join(os.tmpdir(), 'http-errors-hte06-unpack-'));
  tempRoots.push(unpackRoot);
  run('tar', ['-xzf', tarballPath, '-C', unpackRoot], workspaceRoot);
  return path.resolve(unpackRoot, 'package');
}

function stagePackedConsumer(): string {
  const packed = preparePackedWorkspace();
  const consumerDir = mkdtempSync(path.join(os.tmpdir(), 'http-errors-hte06-consumer-'));
  tempRoots.push(consumerDir);
  seedToolVersions(consumerDir);

  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: Object.fromEntries(
          workspacePackages.map((pkg) => [pkg.name, `file:${packed.tarballs[pkg.name]}`]),
        ),
        devDependencies: {
          '@types/node': rootPackageJson.devDependencies['@types/node'],
          typescript: rootPackageJson.devDependencies.typescript,
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
    `import { BadRequestError, toRfc9457ErrorPayload } from '@web-ts-toolkit/http-errors';

const entry = import.meta.resolve('@web-ts-toolkit/http-errors');
const error = new BadRequestError('invalid email');
const payload = toRfc9457ErrorPayload(error);

if (!entry.endsWith('/index.mjs')) throw new Error(entry);
if (error.statusCode !== 400) throw new Error('wrong status');
if (payload.title !== 'Bad Request') throw new Error('wrong RFC 9457 title');
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'cjs.cjs'),
    `const { BadRequestError, toAip193ErrorPayload } = require('@web-ts-toolkit/http-errors');

const entry = require.resolve('@web-ts-toolkit/http-errors');
const error = new BadRequestError('invalid email', { reason: 'INVALID_EMAIL', domain: 'api.example.com' });
const payload = toAip193ErrorPayload(error);

if (!entry.endsWith('/index.js')) throw new Error(entry);
if (error.statusCode !== 400) throw new Error('wrong status');
if (payload.error.status !== 'INVALID_ARGUMENT') throw new Error('wrong AIP-193 status');
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.nodenext.mts'),
    `import {
  BadRequestError,
  HttpError,
  toAip193ErrorPayload,
  toRfc9457ErrorPayload,
  toRfc9457ValidationErrorPayload,
  type HttpErrorShape,
  type Rfc9457ErrorPayload,
  type Rfc9457ValidationError,
} from '@web-ts-toolkit/http-errors';

type CustomEntry = { code: 'INVALID_NAME'; path: string[] };

const typedError: HttpErrorShape<CustomEntry[]> = {
  statusCode: 400,
  message: 'invalid payload',
  errors: [{ code: 'INVALID_NAME', path: ['name'] }],
};
const customPayload = toRfc9457ErrorPayload(typedError);
const customEntry: CustomEntry | undefined = customPayload.errors?.[0];

const runtimeError = new BadRequestError('invalid payload', { errors: [{ wrong: true }] });
const unknownPayload = toRfc9457ErrorPayload(runtimeError);
const unknownEntry: unknown = unknownPayload.errors?.[0];
const validationPayload = toRfc9457ValidationErrorPayload(runtimeError);
const validationEntry: Rfc9457ValidationError | undefined = validationPayload.errors?.[0];
const aipPayload = toAip193ErrorPayload(new HttpError(503));

// @ts-expect-error runtime HttpError entries remain unknown without a typed shape
const unsupportedCustomEntry: CustomEntry | undefined = unknownPayload.errors?.[0];

// @ts-expect-error wrong-shaped entries cannot be claimed as validation errors through the general serializer
const unsupportedValidationPayload: Rfc9457ErrorPayload<Rfc9457ValidationError> = toRfc9457ErrorPayload(runtimeError);

void [customEntry, unknownEntry, validationEntry, aipPayload, unsupportedCustomEntry, unsupportedValidationPayload];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.nodenext.cts'),
    `import httpErrors = require('@web-ts-toolkit/http-errors');
import type { HttpErrorShape } from '@web-ts-toolkit/http-errors';

const error = new httpErrors.ServiceUnavailableError();
const payload = httpErrors.toRfc9457ErrorPayload(error);
const shape: HttpErrorShape = error;
const statusCode: number = payload.status;
void [shape, statusCode];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.bundler.ts'),
    `import { UnauthorizedError, getCanonicalStatus, toRfc9457ValidationErrorPayload } from '@web-ts-toolkit/http-errors';
import type { Rfc9457ValidationError } from '@web-ts-toolkit/http-errors';

const error = new UnauthorizedError('missing bearer token', {
  errors: [{ detail: 'Authorization header is required', header: 'authorization' }],
});
const payload = toRfc9457ValidationErrorPayload(error);
const entry: Rfc9457ValidationError | undefined = payload.errors?.[0];
const status: string = getCanonicalStatus(error.statusCode);
void [entry, status];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'readme-serializer-examples.ts'),
    `import { BadRequestError, toAip193ErrorPayload, toRfc9457ErrorPayload } from '@web-ts-toolkit/http-errors';

const error = new BadRequestError('Email must be a valid address.', {
  reason: 'INVALID_EMAIL',
  domain: 'api.example.com',
  type: 'https://api.example.com/problems/invalid-email',
  title: 'Invalid email address',
  errors: [{ detail: 'must be a valid email address', pointer: '#/email' }],
});

const aip193 = toAip193ErrorPayload(error);
const rfc9457 = toRfc9457ErrorPayload(error);
void [aip193, rfc9457];
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
          types: ['node'],
        },
        include: ['consumer.bundler.ts', 'readme-*.ts'],
      },
      null,
      2,
    ),
  );
}

function writeReadmeExampleFiles(consumerDir: string): void {
  const content = readFileSync(path.resolve(consumerDir, 'node_modules/@web-ts-toolkit/http-errors/README.md'), 'utf8');
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
}

function runConsumerSmokeTests(consumerDir: string): void {
  writeConsumerFiles(consumerDir);
  writeReadmeExampleFiles(consumerDir);
  run('node', ['esm.mjs'], consumerDir);
  run('node', ['cjs.cjs'], consumerDir);
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.nodenext.json'], consumerDir);
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.bundler.json'], consumerDir);
}

afterAll(() => {
  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('HTE-06 packed consumer compatibility', () => {
  it('packs the production-transformed manifest and intended file allowlist', () => {
    const packed = preparePackedWorkspace();
    const stagedManifest = packed.manifests['@web-ts-toolkit/http-errors'];
    const packageDir = unpackTarballToDir(packed.tarballs['@web-ts-toolkit/http-errors']);
    const packedManifest = JSON.parse(readFileSync(path.resolve(packageDir, 'package.json'), 'utf8')) as PackageJson;

    expect(packedManifest).toEqual(stagedManifest);
    expect(packedManifest.version).toBe(testVersion);
    expect(packedManifest.license).toBe(rootPackageJson.license);
    expect(packedManifest.repository).toEqual({
      ...rootPackageJson.repository,
      directory: 'packages/http-errors',
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
    expect(packedManifest.dependencies).toEqual({ '@web-ts-toolkit/utils': testVersion });
    expect(packedManifest.devDependencies).toBeUndefined();
    expect(packedManifest.scripts).toBeUndefined();
    expect(containsDisallowedPublishedValue(packedManifest)).toBe(false);
    expect(readFileSync(path.resolve(packageDir, 'README.md'), 'utf8')).toContain("from '@web-ts-toolkit/http-errors'");
    expect(readdirSync(packageDir).sort()).toEqual([
      'LICENSE',
      'README.md',
      'index.d.mts',
      'index.d.ts',
      'index.js',
      'index.mjs',
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
      for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
        if (name.startsWith('@web-ts-toolkit/')) {
          expect(range).toBe(testVersion);
        }
      }
    }
  });

  it('runs ESM, CJS, NodeNext, Bundler, README, and serializer consumers against installed tarballs', () => {
    const consumerDir = stagePackedConsumer();
    runConsumerSmokeTests(consumerDir);
  }, 60000);
});
