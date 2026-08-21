import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Resolve the real production manifest transformer (`createPublishPackageJson`)
 * from `@repo-toolkit/publish-package`.
 *
 * `@repo-toolkit/publish-package` is the implementation backing
 * `repo-toolkit-publish-package` / `repo-toolkit-publish-packages` at release
 * time: it strips `dist/` prefixes from `main`/`module`/`types`/`bin`/`exports`,
 * replaces the version placeholder, rewrites `workspace:` ranges on internal
 * dependencies to the target version, drops devDependencies/scripts/private,
 * copies author/bugs/engines/license/repository metadata from the workspace
 * root, and sets the publish files allowlist. It is a transitive dependency of
 * the directly installed `@repo-toolkit/release-artifact` / `publish-packages`,
 * so it is resolvable only through a `createRequire` chained off one of those
 * hoisted packages. Importing the real transformer (rather than rewriting
 * manifests by hand) means a regression in the production release
 * transformation fails this compatibility test instead of being silently
 * masked. Separately, the CLI release artifact pipeline (`pnpm build-artifact`
 * / `pnpm verify-artifact`) is exercised from the command line per the ARF-09
 * acceptance criteria.
 */
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
  repository?: string | { type?: string; url?: string };
  sideEffects?: string[] | boolean;
  files?: string[];
  main?: string;
  module?: string;
  types?: string;
  bin?: Record<string, string> | string;
  exports?: Record<string, Record<string, string> | string>;
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

type ReleaseArtifactWorkspace = {
  artifactRoot: string;
  packageDirs: Record<string, string>;
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

/**
 * Test version stamped into every packed tarball and the resolved manifest.
 * A non-released sentinel version is used so an accidental registry lookup of
 * these tarballs (e.g. via a leaked lockfile entry) cannot collide with a
 * published release. The release pipeline is exercised at this same version
 * via `pnpm build-artifact` / `pnpm verify-artifact` (see ARF-09 acceptance
 * evidence in the task document).
 */
const testVersion = '0.99.0-test';
const rootLicensePath = path.resolve(workspaceRoot, 'LICENSE');
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
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      `Command failed: ${command} ${args.join(' ')}\n${error.stdout ?? ''}${error.stderr ?? error.message ?? ''}`,
    );
  }
}

/**
 * Seed an asdf `.tool-versions` into a temp directory so spawned `pnpm` /
 * `node` / `tsc` processes (started from a consumer tree under `/tmp`)
 * resolve the same runtime versions the workspace pins. Without this, asdf
 * walks up from the consumer dir to `/` and `pnpm` falls back to "no version
 * is set", failing the install. This keeps the test self-contained rather
 * than relying on ambient `/tmp/.tool-versions` state (see ARF-12 evidence
 * note in the task document).
 */
function seedToolVersions(dir: string): string {
  const workspaceToolVersions = path.resolve(workspaceRoot, '.tool-versions');
  if (!existsSync(workspaceToolVersions)) {
    return dir;
  }
  const targetToolVersions = path.resolve(dir, '.tool-versions');
  if (!existsSync(targetToolVersions)) {
    cpSync(workspaceToolVersions, targetToolVersions);
  }
  return dir;
}

/**
 * Compute the real production-rewritten manifest for a workspace package using
 * `createPublishPackageJson` from `@repo-toolkit/publish-package`. This is the
 * exact transformation `repo-toolkit-publish-package` performs at release time:
 * it strips `dist/` prefixes from `main`/`module`/`types`/`bin`/`exports`,
 * replaces the version placeholder, rewrites `workspace:` ranges on internal
 * dependencies to the target version, drops `devDependencies`/`scripts`/
 * `private`, copies `author`/`bugs`/`engines`/`license`/`repository` metadata
 * from the workspace root, and sets the publish files allowlist to all
 * non-sourcemap files. A regression in any of those steps will surface as a
 * manifest diff in the assertions below.
 */
function buildPublishedManifest(
  sourceManifest: PackageJson,
  internalPackageNames: Set<string>,
  packageDirRelative: string,
): PackageJson {
  const rootMetadata = {
    author: rootPackageJson.author,
    bugs: rootPackageJson.bugs,
    engines: rootPackageJson.engines,
    license: rootPackageJson.license,
    repository: mergeRootRepository(rootPackageJson.repository, packageDirRelative),
  };
  return createPublishPackageJson(sourceManifest as Record<string, unknown>, {
    version: testVersion,
    internalPackageNames,
    rootMetadata,
    rewrite: { versionPlaceholder: DEFAULT_VERSION_PLACEHOLDER, publishDir: 'dist' },
  }) as PackageJson;
}

function mergeRootRepository(
  rootRepository: { type?: string; url?: string } | undefined,
  packageDirRelative: string,
): { type?: string; url?: string; directory?: string } | undefined {
  if (!rootRepository || (typeof rootRepository !== 'object' && typeof rootRepository !== 'string')) {
    return undefined;
  }
  if (typeof rootRepository === 'string') {
    return rootRepository as unknown as { type?: string; url?: string };
  }
  return { ...rootRepository, directory: packageDirRelative };
}

/**
 * Stage a package exactly as `repo-toolkit-publish-package` would stage its
 * publish directory: copy the existing built `dist/` outputs as the package
 * root, copy package files (README.md, llms.txt) and root files (LICENSE)
 * flattened into the staging root, and write the production-rewritten
 * `package.json`. The staged tree matches the layout `npm publish` would pack.
 */
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
let releaseArtifactWorkspaceCache: ReleaseArtifactWorkspace | undefined;

function preparePackedWorkspace(): PackedWorkspace {
  if (packedWorkspaceCache) {
    return packedWorkspaceCache;
  }

  if (!existsSync(path.resolve(workspaceRoot, 'release-artifact.config.json'))) {
    throw new Error('release-artifact.config.json not found at workspace root');
  }

  const internalPackageNames = new Set(workspacePackages.map((pkg) => pkg.name));
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'access-router-arf09-'));
  tempRoots.push(tempRoot);
  seedToolVersions(tempRoot);
  const tarballDir = path.resolve(tempRoot, 'tarballs');
  mkdirSync(tarballDir, { recursive: true });
  const tarballs: Record<string, string> = {};
  const manifests: Record<string, PackageJson> = {};

  for (const pkg of workspacePackages) {
    const rawManifest = JSON.parse(readFileSync(path.resolve(pkg.dir, 'package.json'), 'utf8')) as PackageJson;
    const packageDirRelative = path.relative(workspaceRoot, pkg.dir).replace(/\\/g, '/');
    const manifest = buildPublishedManifest(rawManifest, internalPackageNames, packageDirRelative);
    const stageDir = path.resolve(tempRoot, pkg.name.replace(/[@/]/g, '_'));
    stagePublishedPackage(stageDir, pkg.dir, manifest);
    seedToolVersions(stageDir);
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
  const unpackRoot = mkdtempSync(path.join(os.tmpdir(), 'access-router-arf09-unpack-'));
  tempRoots.push(unpackRoot);
  run('tar', ['-xzf', tarballPath, '-C', unpackRoot], workspaceRoot);
  return path.resolve(unpackRoot, 'package');
}

function unpackTarball(tarballPath: string): PackageJson {
  return JSON.parse(readFileSync(path.resolve(unpackTarballToDir(tarballPath), 'package.json'), 'utf8')) as PackageJson;
}

function prepareReleaseArtifactWorkspace(): ReleaseArtifactWorkspace {
  if (releaseArtifactWorkspaceCache) {
    return releaseArtifactWorkspaceCache;
  }

  const artifactRoot = path.resolve(workspaceRoot, 'dist', `web-ts-toolkit-${testVersion}`);
  if (!existsSync(artifactRoot)) {
    // `pnpm build-artifact` walks every `package.json` under `packages/` and
    // requires each `bin` entry's file to exist as a regular file (it runs
    // `lstatSync` against it during command discovery). The access-router test
    // script only builds access-router and its transitive `workspace:`
    // dependencies (`pnpm --filter @web-ts-toolkit/access-router... build`),
    // so CLI-only packages outside that closure — e.g.
    // `@web-ts-toolkit/access-router-runtime`,
    // `create-access-router-mongo-starter`, and `@web-ts-toolkit/express-runtime`
    // — may ship an unbuilt `dist/` on a fresh CI runner and trip `Bin entry
    // must be an existing regular file`. The workspace is built up-front in
    // `beforeAll` (see the describe block) so every package's compiled outputs
    // are present before artifact assembly runs.
    run('pnpm', ['build-artifact', '--version', testVersion], workspaceRoot);
  }

  const packageDirs = Object.fromEntries(
    workspacePackages.map((pkg) => [
      pkg.name,
      path.resolve(artifactRoot, 'packages', pkg.name.replace('@web-ts-toolkit/', '')),
    ]),
  );

  for (const packageDir of Object.values(packageDirs)) {
    if (!existsSync(packageDir)) {
      throw new Error(`release artifact missing expected package directory: ${packageDir}`);
    }
  }

  releaseArtifactWorkspaceCache = { artifactRoot, packageDirs };
  return releaseArtifactWorkspaceCache;
}

function installConsumer(
  internalDependencies: Record<string, string>,
  expressVersion: string,
  mongooseVersion: string,
): string {
  const consumerDir = mkdtempSync(path.join(os.tmpdir(), 'access-router-consumer-'));
  tempRoots.push(consumerDir);
  seedToolVersions(consumerDir);

  // Installing the access-router package alone would let pnpm recurse into its
  // transitive `@web-ts-toolkit/*` dependencies and fetch them from the npm
  // registry, which silently defeats the point of staging a local release
  // closure. Pin every internal workspace package to the prepared local source
  // (either packed tarballs or the extracted build-artifact package dirs) via a
  // `pnpm-workspace.yaml` override so the resolved closure is exactly what this
  // test prepared, and an accidental registry lookup of the sentinel
  // `0.99.0-test` version fails loudly.
  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    JSON.stringify(
      {
        name: 'access-router-consumer',
        private: true,
        type: 'module',
        dependencies: {
          ...internalDependencies,
          express: expressVersion,
          mongoose: mongooseVersion,
        },
        devDependencies: {
          typescript: typescriptVersion,
          '@types/node': nodeTypesVersion,
          '@types/express': '^5.0.0',
        },
      },
      null,
      2,
    ),
  );

  writeFileSync(
    path.resolve(consumerDir, 'pnpm-workspace.yaml'),
    ['packages: []', 'overrides:']
      .concat(Object.entries(internalDependencies).map(([name, source]) => `  '${name}': ${source}`))
      .join('\n') + '\n',
  );

  run('pnpm', ['install'], consumerDir);

  return consumerDir;
}

function installPackedConsumer(expressVersion: string, mongooseVersion: string): string {
  const packed = preparePackedWorkspace();
  return installConsumer(
    Object.fromEntries(workspacePackages.map((pkg) => [pkg.name, `file:${packed.tarballs[pkg.name]}`])),
    expressVersion,
    mongooseVersion,
  );
}

function installArtifactConsumer(expressVersion: string, mongooseVersion: string): string {
  const artifact = prepareReleaseArtifactWorkspace();
  return installConsumer(
    Object.fromEntries(workspacePackages.map((pkg) => [pkg.name, `file:${artifact.packageDirs[pkg.name]}`])),
    expressVersion,
    mongooseVersion,
  );
}

function writeConsumerFiles(consumerDir: string, options: { fullDeclarationCheck: boolean }): void {
  const skipLibCheck = !options.fullDeclarationCheck;

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

type DepopulatedItems = { items: string[]; snapshot: Array<{ _id: string }> };

const opts: RootRouterOptions = { basePath: '/api', operationAccess: true };
const condition: GuardModelCondition = { modelName: 'User', id: 'x', condition: 'isAdmin' };
const op: ProcessCopy = { src: 'items', dest: 'snapshot' };
const processorOptions: CopyAndDepopulateOptions = { mutable: false };
const runtime = createAccessRuntime();
const out = copyAndDepopulate({ items: [{ _id: 'x' }] }, [op], processorOptions) as unknown as DepopulatedItems;

void [acl, runtime, opts, condition, Codes, out];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.bundler.ts'),
    `import acl, { createAccessRuntime, type GuardModelCondition } from '@web-ts-toolkit/access-router';
import { MIDDLEWARE } from '@web-ts-toolkit/access-router/advanced';
import { copyAndDepopulate } from '@web-ts-toolkit/access-router/processors';

type DepopulatedItems = { items: string[]; snapshot: Array<{ _id: string }> };

const condition: GuardModelCondition = { modelName: 'User', id: 'x', condition: 'isAdmin' };
const runtime = createAccessRuntime();
const out = copyAndDepopulate(
  { items: [{ _id: 'x' }] },
  [{ src: 'items', dest: 'snapshot' }],
  { mutable: false },
) as unknown as DepopulatedItems;

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
          skipLibCheck,
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
          skipLibCheck,
          types: ['node'],
        },
        include: ['consumer.bundler.ts'],
      },
      null,
      2,
    ),
  );
}

/**
 * Execute the ESM runtime (`esm.mjs`), the CJS runtime (`cjs.cjs`), and the
 * NodeNext/Bundler TypeScript type checks against the installed consumer tree.
 * The ESM smoke file was previously written but never executed, which left
 * ESM-only import failures undetected (ARF-09 finding #2). All four execution
 * paths must pass against the real release-artifact tarballs. Current-peer
 * TypeScript configs intentionally keep skipLibCheck disabled so root,
 * /advanced, and /processors declarations are checked as a real installed
 * consumer sees them. Minimum-peer runtime smoke keeps lib checking skipped to
 * avoid failing on old peer declaration internals unrelated to access-router's
 * emitted declaration graph.
 */
function runConsumerSmokeTests(consumerDir: string, options: { fullDeclarationCheck: boolean }): void {
  writeConsumerFiles(consumerDir, options);
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

describe('ARF-09 packed-package compatibility using the real release-artifact pipeline', () => {
  // Prime both fixture workspaces up-front so the per-test timeout budget is
  // spent on the consumer smoke checks rather than the (slow, one-time)
  // workspace + artifact assembly. Without this, the first artifact test body
  // would absorb the cost of `pnpm --recursive --if-present build` +
  // `pnpm build-artifact --version <testVersion>` (~40-90s on a fresh runner)
  // and routinely blow past the 60s per-test cap. Both `prepare*Workspace`
  // helpers are idempotent and cache their result, so priming here is a no-op
  // for the test bodies.
  beforeAll(() => {
    // Build every workspace package that `pnpm build-artifact` will scan: it
    // runs `lstatSync` against each `bin` entry, which must be an existing
    // regular file. The CLI-only packages
    // (`@web-ts-toolkit/access-router-runtime`, `create-access-router-mongo-starter`,
    // `@web-ts-toolkit/express-runtime`) live outside access-router's transitive
    // build closure, so they need an explicit full-workspace build on a freshly
    // checked-out runner where their `dist/` is otherwise absent.
    run('pnpm', ['--recursive', '--if-present', 'build'], workspaceRoot);

    preparePackedWorkspace();
    prepareReleaseArtifactWorkspace();
  }, 240_000);

  it('applies the real `@repo-toolkit/publish-package` manifest transformation to the access-router tarball', () => {
    const packed = preparePackedWorkspace();
    const stagedManifest = packed.manifests['@web-ts-toolkit/access-router'];
    const accessRouterPackageRoot = unpackTarballToDir(packed.tarballs['@web-ts-toolkit/access-router']);
    const accessRouterManifest = JSON.parse(
      readFileSync(path.resolve(accessRouterPackageRoot, 'package.json'), 'utf8'),
    ) as PackageJson;

    // The resolved manifest fields are produced by the real publisher
    // transformation (`createPublishPackageJson`), then re-read from the packed
    // tarball to prove the staging + `pnpm pack` round-trips the same fields.
    expect(accessRouterManifest).toEqual(stagedManifest);
    expect(accessRouterManifest.version).toBe(testVersion);
    expect(accessRouterManifest.license).toBe(rootPackageJson.license);
    expect(accessRouterManifest.repository).toEqual({
      ...rootPackageJson.repository,
      directory: 'packages/access-router',
    });
    expect(accessRouterManifest.files).toEqual(['**/*', '!**/*.map']);
    expect(accessRouterManifest.main).toBe('./index.js');
    expect(accessRouterManifest.module).toBe('./index.mjs');
    expect(accessRouterManifest.types).toBe('./index.d.ts');
    expect(accessRouterManifest.exports).toEqual({
      '.': {
        types: './index.d.ts',
        import: './index.mjs',
        require: './index.js',
        default: './index.js',
      },
      './advanced': {
        types: './advanced.d.ts',
        import: './advanced.mjs',
        require: './advanced.js',
        default: './advanced.js',
      },
      './processors': {
        types: './processors.d.ts',
        import: './processors.mjs',
        require: './processors.js',
        default: './processors.js',
      },
    });
    expect(accessRouterManifest.sideEffects).toEqual([
      './**/index.js',
      './**/index.mjs',
      './**/advanced.js',
      './**/advanced.mjs',
    ]);
    expect(accessRouterManifest.dependencies).toMatchObject({
      '@web-ts-toolkit/express-json-router': testVersion,
      '@web-ts-toolkit/utils': testVersion,
    });
    expect(accessRouterManifest.devDependencies).toBeUndefined();
    expect(accessRouterManifest.scripts).toBeUndefined();
    expect(containsDisallowedPublishedValue(accessRouterManifest)).toBe(false);
    for (const emitted of ['index.js', 'index.mjs', 'advanced.js', 'advanced.mjs']) {
      expect(existsSync(path.resolve(accessRouterPackageRoot, emitted))).toBe(true);
    }
  });

  it('rewrites every internal workspace dependency to the test version in all packed tarballs', () => {
    const packed = preparePackedWorkspace();
    for (const pkg of workspacePackages) {
      const manifest = unpackTarball(packed.tarballs[pkg.name]);
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

  it.each([
    ['minimum peers', '5.0.0', '8.0.0'],
    ['current majors', '5.2.1', '9.8.0'],
  ])(
    'supports %s from release-artifact tarballs across ESM, CJS, NodeNext, and Bundler consumers',
    (_label, expressVersion, mongooseVersion) => {
      const consumerDir = installPackedConsumer(expressVersion, mongooseVersion);
      runConsumerSmokeTests(consumerDir, { fullDeclarationCheck: _label === 'current majors' });
    },
    60000,
  );

  it.each([
    ['minimum peers', '5.0.0', '8.0.0'],
    ['current majors', '5.2.1', '9.8.0'],
  ])(
    'supports %s from the actual build-artifact package tree across ESM, CJS, NodeNext, and Bundler consumers',
    (_label, expressVersion, mongooseVersion) => {
      const consumerDir = installArtifactConsumer(expressVersion, mongooseVersion);
      runConsumerSmokeTests(consumerDir, { fullDeclarationCheck: _label === 'current majors' });
    },
    60000,
  );
});
