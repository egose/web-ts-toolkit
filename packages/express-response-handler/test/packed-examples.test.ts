import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { INSTALL_TIMEOUT_MS, NODE_TIMEOUT_MS, PACK_TIMEOUT_MS, TSC_TIMEOUT_MS, run } from './helpers/packed-subprocess';

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
  exports?: Record<string, Record<string, string | Record<string, string>> | string>;
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
    run('pnpm', ['pack', '--pack-destination', tarballDir], stageDir, { timeoutMs: PACK_TIMEOUT_MS });

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
  run('pnpm', ['install'], consumerDir, { timeoutMs: INSTALL_TIMEOUT_MS });

  return consumerDir;
}

// B-ERH-10: strict isolated consumer for the exact advertised README recipe.
// Broad `stagePackedConsumer` above installs every workspace package directly,
// which masks a missing direct dependency. This fixture installs only what the
// documented recipe names (handler + express + http-errors, plus TypeScript
// tooling for compilation) and runs the README quickstart against it. The
// transitive-only `@web-ts-toolkit/utils` stays resolvable for the handler
// itself via overrides but is never a direct consumer dependency, so a direct
// `utils` import or a `dist/` deep import would fail under pnpm isolation.
function stageExactRecipeConsumer(): string {
  const packed = preparePackedWorkspace();
  const consumerDir = mkdtempSync(path.join(os.tmpdir(), 'erh10-recipe-'));
  tempRoots.push(consumerDir);
  seedToolVersions(consumerDir);

  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: {
          '@web-ts-toolkit/express-response-handler': `file:${packed.tarballs['@web-ts-toolkit/express-response-handler']}`,
          '@web-ts-toolkit/http-errors': `file:${packed.tarballs['@web-ts-toolkit/http-errors']}`,
          express: '^5.2.1',
        },
        devDependencies: {
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
  run('pnpm', ['install'], consumerDir, { timeoutMs: INSTALL_TIMEOUT_MS });

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
      '.': {
        types: { import: './index.d.mts', require: './index.d.ts', default: './index.d.ts' },
        import: './index.mjs',
        require: './index.js',
        default: './index.js',
      },
      './types': {
        types: { import: './public-types.d.mts', require: './public-types.d.ts', default: './public-types.d.ts' },
        import: './public-types.mjs',
        require: './public-types.js',
        default: './public-types.js',
      },
      './responses': {
        types: {
          import: './responses/index.d.mts',
          require: './responses/index.d.ts',
          default: './responses/index.d.ts',
        },
        import: './responses/index.mjs',
        require: './responses/index.js',
        default: './responses/index.js',
      },
      './responses/csv': {
        types: {
          import: './responses/csv.d.mts',
          require: './responses/csv.d.ts',
          default: './responses/csv.d.ts',
        },
        import: './responses/csv.mjs',
        require: './responses/csv.js',
        default: './responses/csv.js',
      },
      './responses/success': {
        types: {
          import: './responses/success.d.mts',
          require: './responses/success.d.ts',
          default: './responses/success.d.ts',
        },
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
  }, 240_000);

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
const singletonShaped = handleResponse([() => new Created({ id: 'user_1' })]);
if (typeof singletonShaped !== 'function' || Array.isArray(singletonShaped)) throw new Error('singleton array must return a single middleware (length-dependent runtime)');
const multiShaped = handleResponse([() => 'a', () => 'b']);
if (!Array.isArray(multiShaped) || multiShaped.length !== 2 || multiShaped.some((fn) => typeof fn !== 'function')) throw new Error('multi array must return an array of middlewares');
const variadicShaped = handleResponse(() => 'a', () => 'b');
if (!Array.isArray(variadicShaped) || variadicShaped.length !== 2) throw new Error('variadic multi must return an array of middlewares');
const spreadSingleton = handleResponse(...[() => 'a']);
if (typeof spreadSingleton !== 'function' || Array.isArray(spreadSingleton)) throw new Error('spread singleton must return a single middleware');
const spreadPair = handleResponse(...[() => 'a', () => 'b']);
if (!Array.isArray(spreadPair) || spreadPair.length !== 2) throw new Error('spread pair must return an array of middlewares');
let emptyArrayThrew = false;
try {
  handleResponse([]);
} catch {
  emptyArrayThrew = true;
}
if (!emptyArrayThrew) throw new Error('empty array must throw at runtime');
let emptyVariadicThrew = false;
try {
  handleResponse();
} catch {
  emptyVariadicThrew = true;
}
if (!emptyVariadicThrew) throw new Error('empty variadic must throw at runtime');
if (HttpResponse.ok({ id: 'user_1' }).data.id !== 'user_1') throw new Error('HttpResponse.ok payload lost');
if (HttpResponse.json({ id: 'user_2' }).data.id !== 'user_2') throw new Error('HttpResponse.json payload lost');
if (TypesErrorFormats.rfc9457 !== 'rfc9457') throw new Error('types subpath runtime export failed');
if (!isResponse(new RootResponse(200, { ok: true }))) throw new Error('root Response recognition failed');
if (!isResponse(new Response(200, { ok: true }))) throw new Error('responses subpath recognition failed');
if (new Created({ id: 'user_1' }).statusCode !== 201) throw new Error('Created example failed');
if (new NoContent().statusCode !== 204) throw new Error('NoContent example failed');
if (HttpResponse.created({ ok: true }).statusCode !== 201) throw new Error('HttpResponse factory failed');
if (new CSVResponse([{ id: 1 }]).filename !== 'download.csv') throw new Error('CSVResponse subpath failed');
if (!isCSVResponse(HttpResponse.csv([{ id: 1 }]))) throw new Error('cross-entry CSV wrapper recognition failed');
if ('handleResult' in apiHandler || 'handlePromise' in apiHandler) throw new Error('internal lifecycle helpers leaked');
// B-ERH-08: the ESM default import is the handler singleton, not the module
// namespace. preJson/errorMessageProvider exist only on the singleton
// (no matching named exports), so this also guards declaration routing:
// resolving the CJS declaration graph for an ESM importer types the default
// as the namespace and fails compilation below.
if (!('preJson' in apiHandler) || !('errorMessageProvider' in apiHandler)) throw new Error('ESM default singleton members missing at runtime');
apiHandler.preJson = null;
const originalProvider = apiHandler.errorMessageProvider;
if (typeof originalProvider !== 'function') throw new Error('ESM default errorMessageProvider missing at runtime');
apiHandler.errorMessageProvider = () => 'B-ERH-08 probe';
if (apiHandler.errorMessageProvider() !== 'B-ERH-08 probe') throw new Error('ESM default errorMessageProvider set failed at runtime');
apiHandler.errorMessageProvider = originalProvider;
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
const cjsSingleton = api.handleResponse([() => 'a']);
if (typeof cjsSingleton !== 'function' || Array.isArray(cjsSingleton)) throw new Error('CJS singleton array must return a single middleware');
const cjsMulti = api.handleResponse([() => 'a', () => 'b']);
if (!Array.isArray(cjsMulti) || cjsMulti.length !== 2) throw new Error('CJS multi array must return an array');
const cjsVariadic = api.handleResponse(() => 'a', () => 'b');
if (!Array.isArray(cjsVariadic) || cjsVariadic.length !== 2) throw new Error('CJS variadic multi must return an array');
let cjsEmptyThrew = false;
try {
  api.handleResponse([]);
} catch {
  cjsEmptyThrew = true;
}
if (!cjsEmptyThrew) throw new Error('CJS empty array must throw');
if (api.HttpResponse.ok({ id: 'user_1' }).data.id !== 'user_1') throw new Error('CJS HttpResponse.ok payload lost');
if (api.HttpResponse.json({ id: 'user_2' }).data.id !== 'user_2') throw new Error('CJS HttpResponse.json payload lost');
if (types.ErrorFormats.simple !== 'simple') throw new Error('CJS types subpath runtime export failed');
if (!responses.isResponse(new api.Response(200, { ok: true }))) throw new Error('CJS cross-entry Response recognition failed');
if (new success.Created({ id: 'user_1' }).statusCode !== 201) throw new Error('CJS Created example failed');
if (new success.NoContent().statusCode !== 204) throw new Error('CJS NoContent example failed');
if (new csv.CSVResponse([{ id: 1 }]).filename !== 'download.csv') throw new Error('CJS CSVResponse subpath failed');
if (!csv.isCSVResponse(api.HttpResponse.csv([{ id: 1 }]))) throw new Error('CJS cross-entry CSV wrapper recognition failed');
if ('handleResult' in apiHandler || 'handlePromise' in apiHandler) throw new Error('CJS internal lifecycle helpers leaked');
// B-ERH-08: the CJS default export is the handler singleton. Same
// singleton-only round-trip as the ESM consumer above.
if (!('preJson' in apiHandler) || !('errorMessageProvider' in apiHandler)) throw new Error('CJS default singleton members missing at runtime');
apiHandler.preJson = null;
const cjsOriginalProvider = apiHandler.errorMessageProvider;
if (typeof cjsOriginalProvider !== 'function') throw new Error('CJS default errorMessageProvider missing at runtime');
apiHandler.errorMessageProvider = () => 'B-ERH-08 probe';
if (apiHandler.errorMessageProvider() !== 'B-ERH-08 probe') throw new Error('CJS default errorMessageProvider set failed at runtime');
apiHandler.errorMessageProvider = cjsOriginalProvider;
`,
    );

    run('node', ['consumer.mjs'], consumerDir, { timeoutMs: NODE_TIMEOUT_MS });
    run('node', ['consumer.cjs'], consumerDir, { timeoutMs: NODE_TIMEOUT_MS });
  }, 300_000);

  it('compiles documented import styles under strict NodeNext, Bundler, .mts, and .cts resolution from packed artifacts', () => {
    const consumerDir = stagePackedConsumer();
    const source = `import apiHandler, { ErrorFormats, HttpResponse, Response, createHandler, handleResponse } from '@web-ts-toolkit/express-response-handler';
import type { RequestHandler } from 'express';
import { type HandleResponse, type ErrorMessageProvider, type ExpressResponseHandler, type ExpressResponseHandlerOptions, type Hook } from '@web-ts-toolkit/express-response-handler/types';
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

// B-ERH-07 call-shape declarations must agree with the length-dependent runtime.
const singleShape: RequestHandler = namedHandleResponse(() => ({ ok: true }));
const singletonShape: RequestHandler = namedHandleResponse([() => ({ ok: true })]);
// @ts-expect-error - singleton array returns a single middleware, not an array
const singletonIsNotArray: RequestHandler[] = namedHandleResponse([() => ({ ok: true })]);
const multiArrayShape: RequestHandler[] = namedHandleResponse([() => 'a', () => 'b']);
// @ts-expect-error - multi array returns an array, not a single middleware
const multiIsNotSingle: RequestHandler = namedHandleResponse([() => 'a', () => 'b']);
const variadicShape: RequestHandler[] = namedHandleResponse(() => 'a', () => 'b');
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const emptyArrayResult = namedHandleResponse([]);
const emptyArrayIsNever: Equals<typeof emptyArrayResult, never> = true;
const emptyVariadicResult = (namedHandleResponse as () => never)();
const emptyVariadicIsNever: Equals<typeof emptyVariadicResult, never> = true;
const dynamicList: Array<() => string> = [() => 'a'];
const dynamicArrayShape = namedHandleResponse(dynamicList);
if (Array.isArray(dynamicArrayShape)) {
  const narrowedArray: RequestHandler[] = dynamicArrayShape;
  void narrowedArray;
} else {
  const narrowedSingle: RequestHandler = dynamicArrayShape;
  void narrowedSingle;
}
const dynamicSpreadShape = namedHandleResponse(...dynamicList);
if (Array.isArray(dynamicSpreadShape)) {
  const narrowedSpreadArray: RequestHandler[] = dynamicSpreadShape;
  void narrowedSpreadArray;
} else {
  const narrowedSpreadSingle: RequestHandler = dynamicSpreadShape;
  void narrowedSpreadSingle;
}

// B-ERH-07 payload-bearing factories retain payload types without casts.
const okPayload = HttpResponse.ok({ id: 'user_1' });
const okId: string = okPayload.data.id;
// @ts-expect-error - nonexistent payload field must fail compilation
const okMissing = okPayload.data.nonexistent;
const jsonPayload = HttpResponse.json({ id: 'user_2' });
const jsonId: string = jsonPayload.data.id;
// @ts-expect-error - nonexistent payload field must fail compilation
const jsonMissing = jsonPayload.data.nonexistent;
const createdPayload = HttpResponse.created({ id: 'user_3' });
const createdId: string = createdPayload.data.id;

// B-ERH-08 default-import declaration routing: the default import is the
// handler singleton, not the module namespace. preJson and
// errorMessageProvider exist only on ExpressResponseHandler (no matching
// named exports), so these assertions fail when an ESM importer resolves the
// CJS declaration graph (index.d.ts) instead of index.d.mts. Access and
// assignment must both typecheck; the fixture is compile-only (tsc --noEmit)
// so the assignments never execute.
const singletonFromDefault: ExpressResponseHandler = apiHandler;
const defaultPreJson: Hook | null = apiHandler.preJson;
apiHandler.preJson = (value) => {
  void value;
};
apiHandler.preJson = null;
const defaultProvider: ErrorMessageProvider = apiHandler.errorMessageProvider;
apiHandler.errorMessageProvider = () => 'B-ERH-08 probe';
apiHandler.errorMessageProvider = defaultProvider;
// @ts-expect-error - preJson is a singleton member, not a named export
import { preJson as noNamedPreJson } from '@web-ts-toolkit/express-response-handler';

void [defaultHandleResponse, isolatedHandleResponse, middleware, noContentMiddleware, typedMiddleware, created, csv, csvWithExplicitHeaders, recognized, options, singleShape, singletonShape, singletonIsNotArray, multiArrayShape, multiIsNotSingle, variadicShape, emptyArrayIsNever, emptyVariadicIsNever, dynamicArrayShape, dynamicSpreadShape, okPayload, okId, okMissing, jsonPayload, jsonId, jsonMissing, createdPayload, createdId, singletonFromDefault, defaultPreJson, defaultProvider, noNamedPreJson];
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

// B-ERH-08: require consumers see the same singleton through default.
// The CJS declaration graph (*.d.ts) types this correctly; the access +
// assignment assertions below mirror the ESM fixture above.
const ctsSingleton: types.ExpressResponseHandler = api.default;
const ctsPreJson: types.Hook | null = api.default.preJson;
api.default.preJson = null;
const ctsProvider: types.ErrorMessageProvider = api.default.errorMessageProvider;
api.default.errorMessageProvider = () => 'B-ERH-08 probe';
api.default.errorMessageProvider = ctsProvider;

void [handler, api.default, api.HttpResponse, types.ErrorFormats, csvResponse, recognized, ctsSingleton, ctsPreJson, ctsProvider];
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

    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json'], consumerDir, { timeoutMs: TSC_TIMEOUT_MS });
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-bundler.json'], consumerDir, { timeoutMs: TSC_TIMEOUT_MS });
  }, 300_000);

  it('installs only the documented recipe and runs the README quickstart in isolation (B-ERH-10)', () => {
    const consumerDir = stageExactRecipeConsumer();
    const manifest = JSON.parse(readFileSync(path.resolve(consumerDir, 'package.json'), 'utf8')) as PackageJson;

    // Exact recipe: handler + directly imported express + http-errors only.
    // The transitive-only utils package must not be a direct dependency.
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(
      ['@web-ts-toolkit/express-response-handler', '@web-ts-toolkit/http-errors', 'express'].sort(),
    );
    expect(manifest.dependencies?.['@web-ts-toolkit/utils']).toBeUndefined();

    const quickstartTs = `import express from 'express';
import apiHandler from '@web-ts-toolkit/express-response-handler';
import { NotFoundError } from '@web-ts-toolkit/http-errors';

const { handleResponse, HttpResponse } = apiHandler;
const app = express();

async function getUser(id: string) {
  return id === 'missing' ? null : { id, name: 'Ada' };
}

async function createJob() {
  return { id: 'job_1' };
}

app.get('/health', handleResponse(() => ({ ok: true })));

app.get(
  '/users/:id',
  handleResponse(async (req) => {
    const rawId: string | string[] = req.params.id;
    const user = await getUser(Array.isArray(rawId) ? (rawId[0] ?? '') : rawId);
    if (!user) throw new NotFoundError('user not found');
    return user;
  }),
);

app.post(
  '/jobs',
  handleResponse(async () => {
    const job = await createJob();
    return HttpResponse.created(job);
  }),
);

export default app;
`;
    const quickstartRun = `import express from 'express';
import apiHandler from '@web-ts-toolkit/express-response-handler';
import { NotFoundError } from '@web-ts-toolkit/http-errors';

const { handleResponse, HttpResponse } = apiHandler;
const app = express();

async function getUser(id) {
  return id === 'missing' ? null : { id, name: 'Ada' };
}

app.get('/health', handleResponse(() => ({ ok: true })));
app.get(
  '/users/:id',
  handleResponse(async (req) => {
    const user = await getUser(req.params.id);
    if (!user) throw new NotFoundError('user not found');
    return user;
  }),
);
app.post(
  '/jobs',
  handleResponse(async () => HttpResponse.created({ id: 'job_1' })),
);

const server = app.listen(0, async () => {
  const finish = (code) => {
    server.close(() => process.exit(code));
  };
  try {
    const port = server.address().port;
    const base = 'http://127.0.0.1:' + port;
    const health = await (await fetch(base + '/health')).json();
    if (health?.ok !== true) throw new Error('GET /health failed: ' + JSON.stringify(health));
    const ada = await (await fetch(base + '/users/ada')).json();
    if (ada?.id !== 'ada') throw new Error('GET /users/ada failed: ' + JSON.stringify(ada));
    const missing = await fetch(base + '/users/missing');
    if (missing.status !== 404) throw new Error('GET /users/missing status=' + missing.status);
    const created = await fetch(base + '/jobs', { method: 'POST' });
    if (created.status !== 201) throw new Error('POST /jobs status=' + created.status);
    const job = await created.json();
    if (job?.id !== 'job_1') throw new Error('POST /jobs body=' + JSON.stringify(job));
    finish(0);
  } catch (error) {
    console.error(error);
    finish(1);
  }
});
`;
    // No transitive-root visibility or source deep imports in the recipe.
    for (const source of [quickstartTs, quickstartRun]) {
      expect(source).not.toContain('@web-ts-toolkit/utils');
      expect(source).not.toContain('/dist/');
    }

    writeFileSync(path.resolve(consumerDir, 'quickstart.ts'), quickstartTs);
    writeFileSync(path.resolve(consumerDir, 'quickstart-run.mjs'), quickstartRun);
    writeFileSync(
      path.resolve(consumerDir, 'tsconfig-recipe-nodenext.json'),
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
          include: ['quickstart.ts'],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      path.resolve(consumerDir, 'tsconfig-recipe-bundler.json'),
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
          include: ['quickstart.ts'],
        },
        null,
        2,
      ),
    );

    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-recipe-nodenext.json'], consumerDir, {
      timeoutMs: TSC_TIMEOUT_MS,
    });
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-recipe-bundler.json'], consumerDir, {
      timeoutMs: TSC_TIMEOUT_MS,
    });
    run('node', ['quickstart-run.mjs'], consumerDir, { timeoutMs: NODE_TIMEOUT_MS });
  }, 300_000);
});
