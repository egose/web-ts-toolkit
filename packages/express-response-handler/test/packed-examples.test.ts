import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const packageRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '..', '..');
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
  main?: string;
  module?: string;
  types?: string;
  exports?: Record<string, Record<string, string> | string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  files?: string[];
};

const testVersion = '0.99.0-erh11';
const tempRoots: string[] = [];
const rootPackageJson = JSON.parse(readFileSync(path.resolve(workspaceRoot, 'package.json'), 'utf8')) as {
  version: string;
  license: string;
  author?: string;
  bugs?: unknown;
  engines?: Record<string, string>;
  repository: { type?: string; url?: string };
  devDependencies: Record<string, string>;
};
const workspacePackages = [
  { name: '@web-ts-toolkit/utils', dir: path.resolve(workspaceRoot, 'packages', 'utils') },
  { name: '@web-ts-toolkit/http-errors', dir: path.resolve(workspaceRoot, 'packages', 'http-errors') },
  { name: '@web-ts-toolkit/express-response-handler', dir: packageRoot },
] as const;

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
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

  const distSource = path.resolve(sourceDir, 'dist');
  if (existsSync(distSource)) {
    cpSync(distSource, stageDir, { recursive: true });
  }

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

let packedWorkspaceCache: { tarballs: Record<string, string>; manifests: Record<string, PackageJson> } | undefined;

function preparePackedWorkspace() {
  if (packedWorkspaceCache) {
    return packedWorkspaceCache;
  }

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'erh11-packed-'));
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
    seedToolVersions(stageDir);
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

function stagePackedConsumer(): string {
  const packed = preparePackedWorkspace();
  const consumerDir = mkdtempSync(path.join(os.tmpdir(), 'erh11-consumer-'));
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
          express: '^5.2.1',
          '@types/express': '^5.0.6',
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

afterAll(() => {
  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('ERH-11 packed root exports and documented examples', () => {
  it('applies the production manifest rewrite before packing', () => {
    const packed = preparePackedWorkspace();
    const manifest = packed.manifests['@web-ts-toolkit/express-response-handler'];

    expect(manifest.version).toBe(testVersion);
    expect(manifest.main).toBe('./index.js');
    expect(manifest.module).toBe('./index.mjs');
    expect(manifest.types).toBe('./index.d.ts');
    expect(manifest.exports).toEqual({
      '.': { types: './index.d.ts', import: './index.mjs', require: './index.js', default: './index.js' },
      './types': {
        types: './public-types.d.ts',
        import: './public-types.mjs',
        require: './public-types.js',
        default: './public-types.js',
      },
      './responses': {
        types: './responses/index.d.ts',
        import: './responses/index.mjs',
        require: './responses/index.js',
        default: './responses/index.js',
      },
      './responses/csv': {
        types: './responses/csv.d.ts',
        import: './responses/csv.mjs',
        require: './responses/csv.js',
        default: './responses/csv.js',
      },
      './responses/success': {
        types: './responses/success.d.ts',
        import: './responses/success.mjs',
        require: './responses/success.js',
        default: './responses/success.js',
      },
    });
    expect(manifest.dependencies).toMatchObject({
      '@web-ts-toolkit/http-errors': testVersion,
      '@web-ts-toolkit/utils': testVersion,
    });
    expect(manifest.devDependencies).toBeUndefined();
    expect(manifest.scripts).toBeUndefined();
    expect(manifest.files).toEqual(['**/*', '!**/*.map']);
  });

  it('executes root and every documented subpath from the packed artifact in ESM and CJS', () => {
    const consumerDir = stagePackedConsumer();

    writeFileSync(
      path.resolve(consumerDir, 'consumer.mjs'),
      `import apiHandler, { HttpResponse, Response as RootResponse, handleResponse } from '@web-ts-toolkit/express-response-handler';
import { ErrorFormats as TypesErrorFormats } from '@web-ts-toolkit/express-response-handler/types';
import { Response, isResponse } from '@web-ts-toolkit/express-response-handler/responses';
import { CSVResponse, isCSVResponse } from '@web-ts-toolkit/express-response-handler/responses/csv';
import { Created, NoContent } from '@web-ts-toolkit/express-response-handler/responses/success';

if (handleResponse !== apiHandler.handleResponse) throw new Error('named handleResponse does not match default singleton');
if (typeof handleResponse(() => new Created({ id: 'user_1' })) !== 'function') throw new Error('handleResponse did not return middleware');
if (TypesErrorFormats.rfc9457 !== 'rfc9457') throw new Error('types subpath runtime export failed');
if (!isResponse(new RootResponse(200, { ok: true }))) throw new Error('root Response recognition failed');
if (!isResponse(new Response(200, { ok: true }))) throw new Error('responses subpath recognition failed');
if (new Created({ id: 'user_1' }).statusCode !== 201) throw new Error('Created example failed');
if (new NoContent().statusCode !== 204) throw new Error('NoContent example failed');
if (HttpResponse.created({ ok: true }).statusCode !== 201) throw new Error('HttpResponse factory failed');
if (new CSVResponse([{ id: 1 }]).filename !== 'download.csv') throw new Error('CSVResponse subpath failed');
if (!isCSVResponse(HttpResponse.csv([{ id: 1 }]))) throw new Error('cross-entry CSV wrapper recognition failed');
if ('handleResult' in apiHandler || 'handlePromise' in apiHandler) throw new Error('internal lifecycle helpers leaked');
`,
    );
    writeFileSync(
      path.resolve(consumerDir, 'consumer.cjs'),
      `const api = require('@web-ts-toolkit/express-response-handler');
const types = require('@web-ts-toolkit/express-response-handler/types');
const responses = require('@web-ts-toolkit/express-response-handler/responses');
const success = require('@web-ts-toolkit/express-response-handler/responses/success');
const csv = require('@web-ts-toolkit/express-response-handler/responses/csv');

const apiHandler = api.default;
if (api.handleResponse !== apiHandler.handleResponse) throw new Error('CJS named handleResponse does not match default singleton');
if (typeof api.handleResponse(() => new success.Created({ id: 'user_1' })) !== 'function') throw new Error('CJS handleResponse failed');
if (types.ErrorFormats.simple !== 'simple') throw new Error('CJS types subpath runtime export failed');
if (!responses.isResponse(new api.Response(200, { ok: true }))) throw new Error('CJS cross-entry Response recognition failed');
if (new success.Created({ id: 'user_1' }).statusCode !== 201) throw new Error('CJS Created example failed');
if (new success.NoContent().statusCode !== 204) throw new Error('CJS NoContent example failed');
if (new csv.CSVResponse([{ id: 1 }]).filename !== 'download.csv') throw new Error('CJS CSVResponse subpath failed');
if (!csv.isCSVResponse(api.HttpResponse.csv([{ id: 1 }]))) throw new Error('CJS cross-entry CSV wrapper recognition failed');
if ('handleResult' in apiHandler || 'handlePromise' in apiHandler) throw new Error('CJS internal lifecycle helpers leaked');
`,
    );

    run('node', ['consumer.mjs'], consumerDir);
    run('node', ['consumer.cjs'], consumerDir);
  });

  it('compiles documented import styles under strict NodeNext, Bundler, .mts, and .cts resolution from packed artifacts', () => {
    const consumerDir = stagePackedConsumer();
    const source = `import apiHandler, { ErrorFormats, HttpResponse, Response, createHandler, handleResponse } from '@web-ts-toolkit/express-response-handler';
import type { RequestHandler } from 'express';
import { type HandleResponse, type ExpressResponseHandlerOptions } from '@web-ts-toolkit/express-response-handler/types';
import { isResponse } from '@web-ts-toolkit/express-response-handler/responses';
import { CSVResponse } from '@web-ts-toolkit/express-response-handler/responses/csv';
import { Created, NoContent } from '@web-ts-toolkit/express-response-handler/responses/success';

declare global {
  namespace Express {
    interface User {
      id: string;
      role: 'admin' | 'viewer';
    }

    interface Request {
      user?: User;
    }
  }
}

const defaultHandleResponse: HandleResponse = apiHandler.handleResponse;
const namedHandleResponse: HandleResponse = handleResponse;
const isolatedHandleResponse: HandleResponse = createHandler({ errorFormat: ErrorFormats.rfc9457 }).handleResponse;

async function createUser() {
  return { id: 'user_1' };
}

const middleware = namedHandleResponse(async () => new Created(await createUser()));
const noContentMiddleware = namedHandleResponse(async () => new NoContent());
const typedMiddleware: RequestHandler<
  { userId: string },
  { ok: true },
  { name: string },
  { include?: string },
  { traceId: string }
> = namedHandleResponse<
  { userId: string },
  { ok: true },
  { name: string },
  { include?: string },
  { traceId: string }
>((req, res, next) => {
  const param: string = req.params.userId;
  const body: string = req.body.name;
  const query: string | undefined = req.query.include;
  const local: string = res.locals.traceId;
  const userRole: 'admin' | 'viewer' | undefined = req.user?.role;

  void [param, body, query, local, userRole, next];
  return { ok: true };
});
const created = HttpResponse.created({ ok: true });
const csv = new CSVResponse([{ id: 1 }]);
const csvWithExplicitHeaders = new CSVResponse([{ id: 1 }], { headers: ['id'] });
const recognized: boolean = isResponse(new Response(200, { ok: true }));
const options: ExpressResponseHandlerOptions = { errorFormat: ErrorFormats.rfc9457, rfc9457ContentType: 'application/json' };

void [defaultHandleResponse, isolatedHandleResponse, middleware, noContentMiddleware, typedMiddleware, created, csv, csvWithExplicitHeaders, recognized, options];
`;
    const ctsSource = `import api = require('@web-ts-toolkit/express-response-handler');
import types = require('@web-ts-toolkit/express-response-handler/types');
import responses = require('@web-ts-toolkit/express-response-handler/responses');
import csv = require('@web-ts-toolkit/express-response-handler/responses/csv');
import success = require('@web-ts-toolkit/express-response-handler/responses/success');

const handler: types.HandleResponse = api.handleResponse;
const created = new success.Created({ ok: true });
const csvResponse = new csv.CSVResponse([{ ok: true }], { headers: ['ok'] });
const recognized: boolean = responses.isResponse(created);

void [handler, api.default, api.HttpResponse, types.ErrorFormats, csvResponse, recognized];
`;
    writeFileSync(path.resolve(consumerDir, 'consumer-types.ts'), source);
    writeFileSync(path.resolve(consumerDir, 'consumer-mts.mts'), source);
    writeFileSync(path.resolve(consumerDir, 'consumer-cts.cts'), ctsSource);
    writeFileSync(
      path.resolve(consumerDir, 'tsconfig-nodenext.json'),
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
          include: ['consumer-types.ts', 'consumer-mts.mts', 'consumer-cts.cts'],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      path.resolve(consumerDir, 'tsconfig-bundler.json'),
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
          include: ['consumer-types.ts', 'consumer-mts.mts'],
        },
        null,
        2,
      ),
    );

    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-bundler.json'], consumerDir);
  }, 30_000);
});
