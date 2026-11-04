import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSync } from 'esbuild';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertCollectionDiagnostics,
  assertMigrationDiagnostics,
  extractMigrationBlocks,
} from './migration-guide-fixture';

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
  engines?: Record<string, string>;
  files?: string[];
  main?: string;
  module?: string;
  types?: string;
  bin?: Record<string, string> | string;
  exports?: Record<string, Record<string, string | Record<string, string>> | string>;
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

const releaseArtifactBinPackages = [
  {
    name: '@web-ts-toolkit/access-router-runtime',
    dir: path.resolve(workspaceRoot, 'packages/access-router-runtime'),
  },
  {
    name: 'create-access-router-mongo-starter',
    dir: path.resolve(workspaceRoot, 'packages/create-access-router-mongo-starter'),
  },
  {
    name: '@web-ts-toolkit/express-runtime',
    dir: path.resolve(workspaceRoot, 'packages/express-runtime'),
  },
] as const;

const tempRoots: string[] = [];
let authorizationMongo: MongoMemoryServer;

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): string {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, ...env },
      timeout: 180_000,
    });
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      `Command failed: ${command} ${args.join(' ')}\n${error.stdout ?? ''}${error.stderr ?? error.message ?? ''}`,
      { cause: err },
    );
  }
}

function hasBuiltBinEntries(packageDir: string): boolean {
  const manifest = JSON.parse(readFileSync(path.resolve(packageDir, 'package.json'), 'utf8')) as PackageJson;
  const binEntries = typeof manifest.bin === 'string' ? [manifest.bin] : Object.values(manifest.bin ?? {});
  return binEntries.every((entry) => existsSync(path.resolve(packageDir, entry)));
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
    // tempRoot already owns the tool-version pin; do not pack test-only tooling
    // into the production publication tree.
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

  // Exercise the actual artifact assembler on a fresh, bounded package tree.
  // Do not build unrelated workspace CLIs or overwrite a previous release artifact.
  const scopedRoot = mkdtempSync(path.join(os.tmpdir(), 'access-router-scoped-artifact-'));
  tempRoots.push(scopedRoot);
  const packagesDir = path.join(scopedRoot, 'packages');
  // The assembler requires a real CLI owner. Stage one existing compiled CLI
  // read-only for discovery, not a synthetic bin or a claimed CLI build/test.
  const cli = releaseArtifactBinPackages.find((pkg) => hasBuiltBinEntries(pkg.dir));
  if (!cli) throw new Error('A prebuilt release-artifact CLI fixture is required; no unrelated builds are run');
  for (const pkg of [...workspacePackages, cli]) {
    const target = path.join(packagesDir, path.basename(pkg.dir));
    mkdirSync(target, { recursive: true });
    cpSync(path.join(pkg.dir, 'dist'), path.join(target, 'dist'), { recursive: true });
    // The artifact assembler preserves source-package docs (unlike the flattening
    // npm publisher). Include the real new package-root file in this bounded tree.
    for (const file of ['package.json', ...DEFAULT_PACKAGE_FILES, 'MIGRATION.md']) {
      const source = path.join(pkg.dir, file);
      if (existsSync(source)) cpSync(source, path.join(target, path.basename(file)), { recursive: true });
    }
  }
  const { buildReleaseArtifact } = publisherRequire('@repo-toolkit/release-artifact');
  const { artifactRoot } = buildReleaseArtifact({
    cwd: workspaceRoot,
    version: testVersion,
    toolName: 'web-ts-toolkit',
    packagesDir,
    distDir: path.join(scopedRoot, 'dist'),
    nodeModulesMode: 'none',
    versionFiles: [],
  }) as { artifactRoot: string };

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

  // Compile the SAME strict fixtures against the actual installed publication,
  // not repository aliases or a manually reconstructed declaration surface.
  const authorizationFixtures = [
    'service-authorization-consumer.types.fixture',
    'service-authorization-boundary.types.fixture',
    'service-authorization-migration.types.fixture',
    'field-helper-migration.types.fixture',
    'grouped-count-consumer.types.fixture',
    'hydration-consumer.types.fixture',
    'virtuals-populate-dependencies.types.fixture',
    'private-populate-read-policy.types.fixture',
    'output-publication-fusion-withdrawal.types.fixture',
    'authorization-fast-path-consumer.types.fixture',
    'owned-authorization-many.types.fixture',
    'owned-authorization-many-consumer.types.fixture',
    'document-permissions-dependencies.types.fixture',
  ];
  for (const fixture of authorizationFixtures) {
    const snippet = readFileSync(path.resolve(packageRoot, `test/${fixture}.ts`), 'utf8')
      .replaceAll("'../dist/index.js'", "'@web-ts-toolkit/access-router'")
      .replaceAll("'../dist/advanced.js'", "'@web-ts-toolkit/access-router/advanced'");
    for (const extension of ['ts', 'mts', 'cts']) {
      writeFileSync(path.resolve(consumerDir, `${fixture}.${extension}`), snippet);
    }
  }
  // Execute the shipped README itself in both Node module systems, with a real
  // database supplied by the suite. Its assertions cover facts/policy/targets.
  const readme = readFileSync(
    path.resolve(consumerDir, 'node_modules/@web-ts-toolkit/access-router/README.md'),
    'utf8',
  );
  // Compile the exact shipped hydration migration example in all supported module
  // forms/resolvers, not a source alias or a separately maintained approximation.
  const hydrationExample = [...readme.matchAll(/<!--\s*doc-example:\s*partial\s*-->\s*```ts\n([\s\S]*?)```/g)]
    .map((match) => match[1])
    .find((snippet) => snippet.includes('// Server-owned hydration migration:'));
  if (!hydrationExample) throw new Error('Installed README is missing its server-owned hydration migration');
  authorizationFixtures.push('hydration.readme');
  for (const extension of ['ts', 'mts', 'cts']) {
    writeFileSync(path.resolve(consumerDir, `hydration.readme.${extension}`), hydrationExample);
  }
  const authorizationExample = [
    ...readme.matchAll(/<!--\s*doc-example:\s*complete-runtime\s*-->\s*```ts\n([\s\S]*?)```/g),
  ]
    .map((match) => match[1])
    .find((snippet) => snippet.includes('async function runServiceAuthorizationExample()'));
  if (!authorizationExample) throw new Error('Installed README is missing its runnable authorization contract');
  const privatePopulateExample = [
    ...readme.matchAll(/<!--\s*doc-example:\s*complete-runtime\s*-->\s*```ts\n([\s\S]*?)```/g),
  ]
    .map((match) => match[1])
    .find((snippet) => snippet.includes('async function runPrivatePopulateExample()'));
  if (!privatePopulateExample) throw new Error('Installed README is missing its runnable private-populate contract');
  const migration = readFileSync(
    path.resolve(consumerDir, 'node_modules/@web-ts-toolkit/access-router/MIGRATION.md'),
    'utf8',
  );
  const guideBlocks = extractMigrationBlocks(migration);
  for (const [name, marker] of [
    ['collection-raw-recipe', 'export async function rawBefore('],
    ['collection-presentation-recipe', 'export function presentationSubset('],
    ['collection-current-recipe', 'export async function currentList('],
  ]) {
    const block = guideBlocks.find((block) => block.kind === 'partial' && block.source.includes(marker));
    if (!block) throw new Error(`Missing exact shipped ${name}`);
    authorizationFixtures.push(name);
    for (const extension of ['ts', 'mts', 'cts'])
      writeFileSync(path.resolve(consumerDir, `${name}.${extension}`), block.source);
  }
  const javascriptErrors = migration.match(/<!-- doc-example: javascript-errors -->\s*```js\n([\s\S]*?)\n```/)?.[1];
  if (!javascriptErrors) throw new Error('Missing exact shipped JavaScript rejection example');
  writeFileSync(path.resolve(consumerDir, 'migration-errors.mjs'), javascriptErrors);
  const fastPathExample = guideBlocks.find((block) => block.kind === 'complete-runtime')!.source;
  guideBlocks
    .filter((block) => block.kind === 'partial')
    .forEach((block, index) => {
      const name = `migration-target-${index}`;
      authorizationFixtures.push(name);
      for (const extension of ['ts', 'mts', 'cts'])
        writeFileSync(path.resolve(consumerDir, `${name}.${extension}`), block.source);
    });
  const negatives = [
    guideBlocks.find((block) => block.kind === 'expected-error')!.source,
    readFileSync(path.resolve(packageRoot, 'test/owned-authorization-migration.invalid.types.fixture.ts'), 'utf8'),
    readFileSync(path.resolve(packageRoot, 'test/owned-authorization-many.invalid.types.fixture.ts'), 'utf8'),
  ];
  negatives.forEach((source, index) => {
    for (const extension of ['ts', 'mts', 'cts'])
      writeFileSync(path.resolve(consumerDir, `migration-negative-${index}.${extension}`), source);
  });
  authorizationFixtures.push('authorization-fast-path.readme');
  for (const extension of ['ts', 'mts', 'cts']) {
    writeFileSync(path.resolve(consumerDir, `authorization-fast-path.readme.${extension}`), fastPathExample);
  }
  authorizationFixtures.push('private-populate.readme');
  for (const extension of ['ts', 'mts', 'cts']) {
    writeFileSync(path.resolve(consumerDir, `private-populate.readme.${extension}`), privatePopulateExample);
  }
  for (const extension of ['mts', 'cts']) {
    const collection = readFileSync(
      path.resolve(packageRoot, 'test/owned-authorization-many-consumer.runtime.fixture.ts'),
      'utf8',
    );
    writeFileSync(
      path.resolve(consumerDir, `collection.runtime.${extension}`),
      extension === 'cts' ? collection.replaceAll('-recipe.mjs', '-recipe.cjs') : collection,
    );
    writeFileSync(path.resolve(consumerDir, `authorization.readme.${extension}`), authorizationExample);
    writeFileSync(
      path.resolve(consumerDir, `field-helper.runtime.${extension}`),
      readFileSync(path.resolve(packageRoot, 'test/field-helper-consumer.runtime.fixture.ts'), 'utf8'),
    );
    writeFileSync(
      path.resolve(consumerDir, `private-populate.runtime.${extension}`),
      readFileSync(
        path.resolve(packageRoot, 'test/virtuals-populate-dependencies.consumer.runtime.fixture.ts'),
        'utf8',
      ),
    );
  }
  writeFileSync(
    path.resolve(consumerDir, 'tsconfig.authorization.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        skipLibCheck,
        esModuleInterop: true,
        outDir: 'authorization-out',
        types: ['node'],
      },
      files: [
        'authorization.readme.mts',
        'authorization.readme.cts',
        'field-helper.runtime.mts',
        'field-helper.runtime.cts',
        'private-populate.readme.mts',
        'private-populate.readme.cts',
        'private-populate.runtime.mts',
        'private-populate.runtime.cts',
        'authorization-fast-path.readme.mts',
        'authorization-fast-path.readme.cts',
        'collection.runtime.mts',
        'collection.runtime.cts',
      ],
    }),
  );
  writeFileSync(
    path.resolve(consumerDir, 'private-exports.cjs'),
    `
const assert = require('node:assert/strict');
(async () => {
  const modules = [require('@web-ts-toolkit/access-router'), require('@web-ts-toolkit/access-router/advanced'),
    await import('@web-ts-toolkit/access-router'), await import('@web-ts-toolkit/access-router/advanced')];
  for (const entry of modules) {
    for (const name of ['Service', 'DocumentAuthorization', 'ServiceAuthorization', 'resolveServiceAuthorization',
       'createServiceExecution', 'createDocumentAuthorizationStage', 'createServiceOutputContext',
       'prepareModelQuery', 'executePreparedFind', 'executeCreate', 'registerServiceExecutors',
       'withExecutionHydration', 'normalizeHydration', 'normalizeHydrationUpdate', 'attachPermissionsAlias',
        'requiresDocumentSnapshotChecks', 'requiresOutputSnapshotChecks', 'unsafeSnapshotOptions',
        'unsafeSnapshotCheckOptions', 'unsafeInitialOutputCopyOptions',
         'skipsInitialOutputSnapshotCopy', 'tryOutputIdentitiesWithoutSnapshot',
         'AuthorizationFastPathCapture', 'AuthorizationFastPathOrigin', 'unsafeAuthorizationFastPathOptions',
         'unsafeServerOptions', 'authorizationFastPathPrerequisites', 'captureAuthorizationFastPath',
         'readAuthorizationFastPath', 'readTrustedServiceAuthorization', 'deriveTrustedQueryAuthorization',
         'captureAuthorizationConfiguration', 'ownedAuthorizationConfiguration',
         'QueryAuthorizationSource', 'TrustedOutputBudget', 'TrustedOutputMemberBuilder',
         'isBorrowableAuthorizationRecord', 'prepareTrustedAuthorizationSource', 'createTrustedOutputBudget',
         'createTrustedOutputMemberBuilder', 'retainTrustedOutputMember', 'retainTrustedOutputSpine',
         'getIssuedEmbeddedDocumentAuthorization', 'isIssuedOutputMember', 'isTrustedAuthorizationOutput',
          'materializeTrustedOutputValue', 'FilteredOutput', 'OutputWorkLedger', 'createOutputWorkLedger',
          'debitOutputWork', 'debitOutputPayload', 'admitOutputHelperRows', 'admitOutputHelperManyControls',
          'filterModelOutputManyForHelper',
       'PopulatePolicyDefaultsToken', 'capturePopulatePolicyDefaults', 'getCapturedPopulatePolicyDefaults',
       'resolvePopulatePolicy', 'modelServicePopulatePolicyDefaults', 'capturePopulateTargetBinding',
       'setPopulateTargetMeta', 'withCapturedPopulateModel']) {
      assert.equal(Object.hasOwn(entry, name), false, name + ' must not be a runtime escape hatch');
    }
  }
  for (const subpath of ['src/acl/service-authorization', 'src/acl/document-authorization',
     'src/acl/service-execution', 'src/acl/prepared-query', 'src/acl/populate-policy',
       'src/options/populate-policy', 'src/acl/unsafe-snapshot-options', 'dist/index.js',
       'src/acl/output-work-ledger', 'src/acl/output-helper-many-admission']) {
      // The exact entry map also excludes new private trusted/capture modules.
    assert.throws(() => require.resolve('@web-ts-toolkit/access-router/' + subpath),
      { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
   }
   for (const subpath of ['src/acl/captured-authorization-configuration', 'src/acl/trusted-output-materialization']) {
     assert.throws(() => require.resolve('@web-ts-toolkit/access-router/' + subpath),
       { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
   }
})().catch((error) => { console.error(error); process.exitCode = 1; });
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'esm.mjs'),
    `import acl, { createAccessRuntime, guard } from '@web-ts-toolkit/access-router';
import { Codes, parseBody } from '@web-ts-toolkit/access-router/advanced';
import { copyAndDepopulate } from '@web-ts-toolkit/access-router/processors';

const runtime = createAccessRuntime();
const output = copyAndDepopulate({ items: [{ _id: 'x', name: 'x' }] }, [{ src: 'items', dest: 'snapshot' }], {
  mutable: false,
});

// ARH-09: exercise actual calls, not only symbol existence.
const middlewareFactory = acl();
if (typeof middlewareFactory !== 'function') throw new Error('default factory did not return middleware');
const defaultRouter = acl.createRouter({ basePath: '/api', operationAccess: true });
if (typeof defaultRouter.routes === 'undefined') throw new Error('acl.createRouter failed');
const isolatedRouter = runtime.createRouter({ basePath: '/api', operationAccess: true });
if (typeof isolatedRouter.routes === 'undefined') throw new Error('runtime.createRouter failed');
const handler = guard('isAdmin');
if (typeof handler !== 'function') throw new Error('guard call failed');

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

// ARH-09: exercise actual calls, not only symbol existence.
const middlewareFactory = acl();
if (typeof middlewareFactory !== 'function') throw new Error('default factory did not return middleware');
const defaultRouter = acl.createRouter({ basePath: '/api', operationAccess: true });
if (typeof defaultRouter.routes === 'undefined') throw new Error('acl.createRouter failed');
const isolatedRouter = runtime.createRouter({ basePath: '/api', operationAccess: true });
if (typeof isolatedRouter.routes === 'undefined') throw new Error('runtime.createRouter failed');
const handler = accessRouter.guard('isAdmin');
if (typeof handler !== 'function') throw new Error('guard call failed');

if (typeof acl.createRouter !== 'function') throw new Error('missing createRouter');
if (typeof runtime.createRouter !== 'function') throw new Error('missing runtime.createRouter');
if (typeof advanced.parseBody !== 'function') throw new Error('missing parseBody');
if (!advanced.Codes || !advanced.Codes.Success) throw new Error('missing Codes');
if (output.items[0] !== 'x') throw new Error('processors subpath failed');
`,
  );

  // Exercise nested entry behavior through installed ESM/CJS entrypoints and
  // both real publication layouts, using database-free HTTP data routes.
  writeFileSync(
    path.resolve(consumerDir, 'operation-access-smoke.cjs'),
    `const assert = require('node:assert/strict');
const { once } = require('node:events');
const express = require('express');

module.exports = async function verifyOperationAccess(createAccessRuntime) {
  const api = createAccessRuntime();
  api.setGlobalOptions({ globalPermissions(req) { return req.headers.user === 'admin' ? ['isAdmin'] : []; } });
  api.setDefaultModelOptions({ operationAccess: { read: { basic: true }, list: { advanced: false } } });
  const router = api.createDataRouter('PackedVariantFruit', {
    basePath: '/fruit', idParam: 'id', idField: 'id',
    data: [{ id: 'apple', name: 'Apple', secret: 'private' }], // pragma: allowlist secret
    operationAccess: { list: { default: true }, read: { default: true, basic: false } },
    permissionSchema: { id: true, name: { list: true, read: true }, secret: false },
  });
  const root = api.createRouter({ basePath: '/batch', operationAccess: true });
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  app.use(root.routes);
  app.use(api.createOpenApiRouter({ docsPath: false }));
  const original = router.options;
  const endpoints = router.router.getEndpoints();
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = 'http://127.0.0.1:' + address.port;
    async function call(route, status, method = 'GET', body, user) {
      const headers = { 'content-type': 'application/json' };
      if (user) headers.user = user;
      const response = await fetch(url + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      assert.equal(response.status, status, method + ' ' + route);
      return method === 'HEAD' ? undefined : response.json();
    }
    async function checkReadOutput(route, method = 'GET', body) {
      const data = await call(route, 200, method, body);
      assert.equal(data.name, 'Apple');
      assert.equal(data.secret, undefined);
    }
    await call('/fruit/apple', 401);
    await call('/fruit/apple', 401, 'HEAD');
    await checkReadOutput('/fruit/__query/apple', 'POST', { select: ['name', 'secret'] });
    await checkReadOutput('/fruit/__query/__filter', 'POST', { filter: { id: 'apple' }, select: ['name', 'secret'] });
    const basicList = await call('/fruit', 200);
    assert.equal(basicList.data[0].name, 'Apple');
    await call('/fruit/__query', 200, 'POST', {}); // Does not inherit denied model-default list.advanced.
    const spec = await call('/openapi.json', 200);
    assert.ok(spec.paths['/fruit/{id}'].get.responses['401']);
    assert.ok(spec.paths['/fruit/__query/{id}'].post);
    assert.ok(spec.paths['/fruit/__query/__filter'].post);

    router.operationAccess('read.basic', true);
    assert.equal(api.runtime.getExactDataOption('PackedVariantFruit', 'operationAccess.read.default'), true);
    await checkReadOutput('/fruit/apple');
    await call('/fruit/apple', 200, 'HEAD');
    router.setOption('operationAccess.read.basic', false);
    await call('/fruit/apple', 401);
    router.set('operationAccess.read.basic', undefined);
    await checkReadOutput('/fruit/apple');

    router.operationAccess('list.advanced', false);
    await call('/fruit/__query', 401, 'POST', {});
    await call('/fruit', 200);
    router.operationAccess('list.advanced', 'isAdmin');
    await call('/fruit/__query', 401, 'POST', {});
    await call('/fruit/__query', 200, 'POST', {}, 'admin');

    // Replacement overrides the denied base for this endpoint only.
    router.operationAccess({ list: true, read: { default: false, advanced: true } });
    await call('/fruit/apple', 401);
    await checkReadOutput('/fruit/__query/apple', 'POST', {});
    const rootResult = await call('/batch', 200, 'POST', [{ target: 'data', name: 'PackedVariantFruit', op: 'read', id: 'apple' }]);
    assert.equal(rootResult[0].statusCode, 401);
    assert.equal(rootResult[0].result.code, 'unauthorized');
    await call('/batch', 400, 'POST', [{ target: 'data', name: 'PackedVariantFruit', op: 'advancedRead', id: 'apple' }]);

    router.operationAccess('read.root', true);
    const rootAllowed = await call('/batch', 200, 'POST', [{ target: 'data', name: 'PackedVariantFruit', op: 'read', id: 'apple' }]);
    assert.equal(rootAllowed[0].statusCode, 200);
    assert.equal(rootAllowed[0].result.data.name, 'Apple');
    await call('/fruit/apple', 401);
    router.operationAccess('read', { default: true, root: false });
    await checkReadOutput('/fruit/apple');
    const rootDenied = await call('/batch', 200, 'POST', [{ target: 'data', name: 'PackedVariantFruit', op: 'read', id: 'apple' }]);
    assert.equal(rootDenied[0].statusCode, 401);
    const beforeInvalid = api.runtime.getDataOptions('PackedVariantFruit');
    assert.throws(() => router.operationAccess('basicRead', true), /read.basic/);
    assert.throws(() => router.setOptions({ operationAccess: { read: true, advancedRead: false } }), /read.advanced/);
    assert.deepEqual(api.runtime.getDataOptions('PackedVariantFruit'), beforeInvalid);

    router.setOptions({ operationAccess: { read: { default: true, advanced: false } } });
    await call('/fruit', 401); // Replaced list, rather than recursively retaining it.
    await checkReadOutput('/fruit/apple');
    await call('/fruit/__query/apple', 401, 'POST', {});
    assert.deepEqual(original.operationAccess, { list: { default: true }, read: { default: true, basic: false } });
    assert.equal(Object.isFrozen(original), true);
    assert.equal(Object.isFrozen(api.runtime.getDataOptions('PackedVariantFruit')), true);
    assert.deepEqual(router.router.getEndpoints(), endpoints);
    const updatedSpec = await call('/openapi.json', 200);
    assert.ok(updatedSpec.paths['/fruit'].get);
    assert.ok(updatedSpec.paths['/fruit/__query/{id}'].post);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
};
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'operation-access.esm.mjs'),
    `import { createAccessRuntime } from '@web-ts-toolkit/access-router';
import verifyOperationAccess from './operation-access-smoke.cjs';
await verifyOperationAccess(createAccessRuntime);
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'operation-access.cjs.cjs'),
    `const { createAccessRuntime } = require('@web-ts-toolkit/access-router');
const verifyOperationAccess = require('./operation-access-smoke.cjs');
verifyOperationAccess(createAccessRuntime).catch((err) => { console.error(err); process.exitCode = 1; });
`,
  );

  // ARH-09: strict NodeNext ESM consumer. Uses the README preferred default
  // import plus named helpers, selects the `import` declaration condition
  // (`.d.mts`), and executes actual calls. Under the pre-fix single `.d.ts`
  // mapping the default import is unusable here (NodeNext treats `.d.ts` as
  // CommonJS, so `acl.createRouter` is not callable).
  writeFileSync(
    path.resolve(consumerDir, 'consumer.nodenext.mts'),
    `import acl, { createAccessRuntime, fromZod, guard, type GuardModelCondition, type RootRouterOptions, type OperationAccess, type FieldOperationAccess, type OperationAccessContext, type OperationAccessRule } from '@web-ts-toolkit/access-router';
import { Codes, parseBody, type AdvancedReadBody, type OperationAccessVariants } from '@web-ts-toolkit/access-router/advanced';
import { copyAndDepopulate, type CopyAndDepopulateOptions, type ProcessCopy } from '@web-ts-toolkit/access-router/processors';

type DepopulatedItems = { items: string[]; snapshot: Array<{ _id: string }> };

const opts: RootRouterOptions = { basePath: '/api', operationAccess: true };
const condition: GuardModelCondition = { modelName: 'User', id: 'x', condition: 'isAdmin' };
const op: ProcessCopy = { src: 'items', dest: 'snapshot' };
const processorOptions: CopyAndDepopulateOptions = { mutable: false };

const middlewareFactory: unknown = acl();
if (typeof middlewareFactory !== 'function') throw new Error('default factory did not return middleware');

const defaultRouter = acl.createRouter(opts);
if (typeof defaultRouter.routes === 'undefined') throw new Error('acl.createRouter failed');

const runtime = createAccessRuntime();
const isolatedRouter = runtime.createRouter(opts);
if (typeof isolatedRouter.routes === 'undefined') throw new Error('runtime.createRouter failed');

const context: OperationAccessContext = 'root';
const variants: OperationAccessVariants = { default: true, basic: false, [context]: true };
const rule: OperationAccessRule = variants;
const access: OperationAccess = { list: { default: true, advanced: 'isAdmin' }, read: rule };
const fields: FieldOperationAccess = { list: true, read: true };
const dataRouter = runtime.createDataRouter('TypedVariantFruit', {
  data: [{ id: 'apple', name: 'Apple' }], operationAccess: access, permissionSchema: { id: fields, name: fields },
});
dataRouter.operationAccess('read.basic', false).setOption('operationAccess.read.basic', undefined);
dataRouter.set('operationAccess.read.advanced', true);
// @ts-expect-error removed flat keys are not supported aliases
const removedAccess: OperationAccess = { basicRead: true };
// @ts-expect-error removed flat-name type is not exported
type RemovedRoot = import('@web-ts-toolkit/access-router').RouteVariantAccess;
// @ts-expect-error removed flat-name type is not exported by advanced
type RemovedAdvanced = import('@web-ts-toolkit/access-router/advanced').RouteVariantAccess;
const readBody: AdvancedReadBody = { options: { populateAccess: 'read' } };
// @ts-expect-error route-only selectors are not PopulateAccess
const invalidReadBody: AdvancedReadBody = { options: { populateAccess: 'advancedRead' } };
// @ts-expect-error route variants do not grant fields
const invalidFields: FieldOperationAccess = { basicRead: true };
void [readBody, invalidReadBody, invalidFields, removedAccess];

const handler = guard(condition);
const stringHandler = guard('isAdmin');
if (typeof handler !== 'function' || typeof stringHandler !== 'function') throw new Error('guard call failed');
if (typeof fromZod !== 'function') throw new Error('missing fromZod export');
if (typeof parseBody !== 'function') throw new Error('missing parseBody export');
if (Codes.Success == null) throw new Error('missing Codes export');

const out = copyAndDepopulate({ items: [{ _id: 'x' }] }, [op], processorOptions) as unknown as DepopulatedItems;
if (out.items[0] !== 'x') throw new Error('processors subpath failed');

export { defaultRouter, isolatedRouter, dataRouter, handler, out };
`,
  );

  // ARH-09: strict NodeNext CJS consumer. The `import ... = require(...)`
  // form selects the `require` declaration condition (`.d.ts`).
  writeFileSync(
    path.resolve(consumerDir, 'consumer.nodenext.cts'),
    `import accessRouterModule = require('@web-ts-toolkit/access-router');
import type { GuardModelCondition, RootRouterOptions, OperationAccess, FieldOperationAccess, OperationAccessVariants } from '@web-ts-toolkit/access-router';
import type { OperationAccessContext, OperationAccessRule } from '@web-ts-toolkit/access-router/advanced';
import advancedModule = require('@web-ts-toolkit/access-router/advanced');
import processorsModule = require('@web-ts-toolkit/access-router/processors');

const acl = accessRouterModule.default;
const opts: RootRouterOptions = { basePath: '/api', operationAccess: true };
const condition: GuardModelCondition = { modelName: 'User', id: 'x', condition: 'isAdmin' };

const middlewareFactory: unknown = acl();
if (typeof middlewareFactory !== 'function') throw new Error('default factory did not return middleware');

const defaultRouter = acl.createRouter(opts);
if (typeof defaultRouter.routes === 'undefined') throw new Error('acl.createRouter failed');

const runtime = accessRouterModule.createAccessRuntime();
const isolatedRouter = runtime.createRouter(opts);
if (typeof isolatedRouter.routes === 'undefined') throw new Error('runtime.createRouter failed');

const context: OperationAccessContext = 'basic';
const variants: OperationAccessVariants = { default: true, [context]: false };
const rule: OperationAccessRule = variants;
const access: OperationAccess = { default: true, read: rule, list: { advanced: 'isAdmin' } };
const fields: FieldOperationAccess = { list: true, read: true };
const dataRouter = runtime.createDataRouter('CjsTypedVariantFruit', {
  data: [{ id: 'apple', name: 'Apple' }], operationAccess: access, permissionSchema: { id: fields, name: fields },
});
dataRouter.setOption('operationAccess.read.basic', undefined).operationAccess('list.advanced', false);
dataRouter.runtime.setDataOption('CjsTypedVariantFruit', 'operationAccess.read.advanced', true);
// @ts-expect-error removed flat keys are not supported aliases
const removedAccess: OperationAccess = { advancedRead: true };
// @ts-expect-error removed flat-name type is not exported
type RemovedRoot = import('@web-ts-toolkit/access-router').RouteVariantAccess;
// @ts-expect-error removed flat-name type is not exported by advanced
type RemovedAdvanced = import('@web-ts-toolkit/access-router/advanced').RouteVariantAccess;
// @ts-expect-error variants are not field grants
const invalidFields: FieldOperationAccess = { advancedRead: true };
void [invalidFields, removedAccess];

const handler = accessRouterModule.guard(condition);
if (typeof handler !== 'function') throw new Error('guard call failed');
if (typeof advancedModule.parseBody !== 'function') throw new Error('missing parseBody export');
if (advancedModule.Codes.Success == null) throw new Error('missing Codes export');

const out = processorsModule.copyAndDepopulate(
  { items: [{ _id: 'x' }] },
  [{ src: 'items', dest: 'snapshot' }],
  { mutable: false },
) as unknown as { items: string[]; snapshot: Array<{ _id: string }> };
if (out.items[0] !== 'x') throw new Error('processors subpath failed');

export { defaultRouter, isolatedRouter, dataRouter, handler, out };
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.bundler.ts'),
    `import acl, { createAccessRuntime, type GuardModelCondition, type OperationAccess } from '@web-ts-toolkit/access-router';
import { MIDDLEWARE } from '@web-ts-toolkit/access-router/advanced';
import { copyAndDepopulate } from '@web-ts-toolkit/access-router/processors';

type DepopulatedItems = { items: string[]; snapshot: Array<{ _id: string }> };

const condition: GuardModelCondition = { modelName: 'User', id: 'x', condition: 'isAdmin' };
const runtime = createAccessRuntime();
const access: OperationAccess = { list: { default: true }, read: { default: true, basic: false } };
const dataRouter = runtime.createDataRouter('BundlerVariantFruit', { data: [], operationAccess: access });
dataRouter.set('operationAccess.list.advanced', false).setOption('operationAccess.read.basic', undefined);
const out = copyAndDepopulate(
  { items: [{ _id: 'x' }] },
  [{ src: 'items', dest: 'snapshot' }],
  { mutable: false },
) as unknown as DepopulatedItems;

void [acl, runtime, dataRouter, condition, MIDDLEWARE, out];
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
          esModuleInterop: true,
          types: ['node'],
        },
        include: [
          'consumer.nodenext.mts',
          'consumer.nodenext.cts',
          ...authorizationFixtures.flatMap((fixture) => [`${fixture}.mts`, `${fixture}.cts`]),
        ],
      },
      null,
      2,
    ),
  );

  writeFileSync(
    path.resolve(consumerDir, 'tsconfig.nodenext.emit.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: false,
          outDir: 'nodenext-out',
          skipLibCheck,
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
    path.resolve(consumerDir, 'tsconfig.node16.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'Node16',
        moduleResolution: 'Node16',
        strict: true,
        outDir: 'node16-out',
        skipLibCheck,
        esModuleInterop: true,
        types: ['node'],
      },
      files: [
        ...authorizationFixtures
          .filter((name) => name.startsWith('migration-target-'))
          .flatMap((name) => [`${name}.mts`, `${name}.cts`]),
        'field-helper-migration.types.fixture.mts',
        'field-helper-migration.types.fixture.cts',
        'grouped-count-consumer.types.fixture.mts',
        'grouped-count-consumer.types.fixture.cts',
        'output-publication-fusion-withdrawal.types.fixture.mts',
        'output-publication-fusion-withdrawal.types.fixture.cts',
        'authorization-fast-path-consumer.types.fixture.mts',
        'authorization-fast-path-consumer.types.fixture.cts',
        'authorization-fast-path.readme.mts',
        'authorization-fast-path.readme.cts',
        'owned-authorization-many.types.fixture.mts',
        'owned-authorization-many.types.fixture.cts',
        'owned-authorization-many-consumer.types.fixture.mts',
        'owned-authorization-many-consumer.types.fixture.cts',
        'document-permissions-dependencies.types.fixture.mts',
        'document-permissions-dependencies.types.fixture.cts',
        'collection.runtime.mts',
        'collection.runtime.cts',
        ...['raw', 'presentation', 'current'].flatMap((name) => [
          `collection-${name}-recipe.mts`,
          `collection-${name}-recipe.cts`,
        ]),
      ],
    }),
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
          esModuleInterop: true,
          types: ['node'],
        },
        include: ['consumer.bundler.ts', ...authorizationFixtures.map((fixture) => `${fixture}.ts`)],
      },
      null,
      2,
    ),
  );
}

/**
 * Execute the ESM runtime (`esm.mjs`), the CJS runtime (`cjs.cjs`), the
 * strict NodeNext `.mts`/`.cts` type checks, the emitted `.mts` runtime, and
 * the Bundler TypeScript type check against the installed consumer tree.
 * The ESM smoke file was previously written but never executed, which left
 * ESM-only import failures undetected (ARF-09 finding #2). ARH-09 extends the
 * same gap to types: the NodeNext consumer merely voided `acl` instead of
 * calling it, so the `.d.ts`-as-CJS default-import failure stayed hidden.
 * All execution paths must pass against the real release-artifact tarballs.
 * Current-peer TypeScript configs intentionally keep skipLibCheck disabled so
 * root, /advanced, and /processors declarations are checked as a real
 * installed consumer sees them. Minimum-peer runtime smoke keeps lib checking
 * skipped to avoid failing on old peer declaration internals unrelated to
 * access-router's emitted declaration graph.
 */
function runMongoConsumer(file: string, consumerDir: string): Promise<string> {
  // MongoMemoryServer drains mongod stdout in this process. Keeping its event loop
  // blocked across several execFileSync workflows can fill that pipe and stall the DB.
  return new Promise((resolve, reject) => {
    execFile(
      'node',
      [file],
      {
        cwd: consumerDir,
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, MONGODB_URL: authorizationMongo.getUri() },
      },
      (error, stdout, stderr) => {
        if (error)
          reject(new Error(`Installed authorization workflow failed (${file}):\n${stdout}${stderr}`, { cause: error }));
        else resolve(stdout);
      },
    );
  });
}

async function runConsumerSmokeTests(consumerDir: string, options: { fullDeclarationCheck: boolean }): Promise<void> {
  writeConsumerFiles(consumerDir, options);
  const migrationRuns: unknown[] = [];
  const collectionRuns: unknown[] = [];
  const runCollection = async (file: string) => {
    const observed = JSON.parse(await runMongoConsumer(file, consumerDir));
    expect(observed).toEqual({
      guide: 'collection-alternatives',
      statuses: [200],
      reads: 4,
      hooks: 8,
      virtuals: 0,
      observations: ['isolated', 'trusted'].map((mode) => ({
        mode,
        rawHelperCalls: { singles: 2, many: 1 },
        rawFieldCallbacks: 4,
        rawExtra: { reads: 0, hooks: 0 },
        presentationExtra: { reads: 0, hooks: 0, helperCalls: 0 },
        currentListExtra: { reads: 1, hooks: 2 },
        visibleRows: 2,
        nativeGettersAndCore: true,
        rejectedControlsAndRows: 6,
        proxyTraps: 0,
      })),
    });
    collectionRuns.push({ file, ...observed });
  };
  const runMigration = async (file: string) => {
    const observed = JSON.parse(await runMongoConsumer(file, consumerDir));
    expect(observed).toEqual({
      guide: 'owned-authorization',
      statuses: [200, 200, 400],
      reads: 4,
      hooks: 4,
      observations: ['isolated', 'trusted'].map((mode) => ({
        mode,
        initial: { reads: 1, hooks: 1 },
        helperExtra: { reads: 0, hooks: 0 },
        currentExtra: { reads: 1, hooks: 1 },
      })),
    });
    migrationRuns.push({ file, ...observed });
  };
  run('node', ['esm.mjs'], consumerDir);
  run('node', ['cjs.cjs'], consumerDir);
  run('node', ['operation-access.esm.mjs'], consumerDir);
  run('node', ['operation-access.cjs.cjs'], consumerDir);
  run('node', ['private-exports.cjs'], consumerDir);
  expect(JSON.parse(run('node', ['migration-errors.mjs'], consumerDir))).toEqual({
    retiredPresenceRejections: 40,
    invalidModes: 6,
    atomicBulk: true,
  });
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.nodenext.json'], consumerDir);
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.node16.json'], consumerDir);
  // Compile and execute the EXACT packed README through Node16 import/require
  // conditions, not just a hand-maintained fixture or a NodeNext-only example.
  await runMigration('node16-out/authorization-fast-path.readme.mjs');
  await runMigration('node16-out/authorization-fast-path.readme.cjs');
  await runCollection('node16-out/collection.runtime.mjs');
  await runCollection('node16-out/collection.runtime.cjs');
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.nodenext.emit.json'], consumerDir);
  run('node', ['nodenext-out/consumer.nodenext.mjs'], consumerDir);
  run('node', ['nodenext-out/consumer.nodenext.cjs'], consumerDir);
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.bundler.json'], consumerDir);
  const migrationDiagnostics: unknown[] = [];
  for (const [resolution, extension, module] of [
    ['Bundler', 'ts', 'ESNext'],
    ['NodeNext', 'mts', 'NodeNext'],
    ['NodeNext', 'cts', 'NodeNext'],
    ['Node16', 'mts', 'Node16'],
    ['Node16', 'cts', 'Node16'],
  ]) {
    for (const index of [0, 1, 2]) {
      const file = `migration-negative-${index}.${extension}`;
      const source = readFileSync(path.resolve(consumerDir, file), 'utf8');
      const config = `tsconfig-migration-negative-${resolution}-${extension}-${index}.json`;
      writeFileSync(
        path.resolve(consumerDir, config),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module,
            moduleResolution: resolution,
            strict: true,
            noEmit: true,
            skipLibCheck: !options.fullDeclarationCheck,
            esModuleInterop: true,
            types: ['node'],
          },
          files: [file],
        }),
      );
      let output: string;
      let status = 0;
      try {
        output = execFileSync('pnpm', ['exec', 'tsc', '-p', config], {
          cwd: consumerDir,
          encoding: 'utf8',
          stdio: 'pipe',
        });
      } catch (error) {
        const rejected = error as { status: number; stdout: string; stderr: string };
        status = rejected.status;
        output = rejected.stdout + rejected.stderr;
      }
      expect(status).not.toBe(0);
      if (index === 2) assertCollectionDiagnostics(source, file, output);
      else assertMigrationDiagnostics(source, file, output);
      migrationDiagnostics.push({ resolution, extension, file, status, output });
    }
  }
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.authorization.json'], consumerDir);
  run('node', ['authorization-out/field-helper.runtime.mjs'], consumerDir);
  run('node', ['authorization-out/field-helper.runtime.cjs'], consumerDir);
  await runMongoConsumer('authorization-out/authorization.readme.mjs', consumerDir);
  await runMongoConsumer('authorization-out/authorization.readme.cjs', consumerDir);
  await runMigration('authorization-out/authorization-fast-path.readme.mjs');
  await runMigration('authorization-out/authorization-fast-path.readme.cjs');
  await runCollection('authorization-out/collection.runtime.mjs');
  await runCollection('authorization-out/collection.runtime.cjs');
  cpSync(
    path.resolve(packageRoot, 'test/authorization-fast-path-native.runtime.fixture.mjs'),
    path.resolve(consumerDir, 'authorization-fast-path-native.runtime.mjs'),
  );
  await runMongoConsumer('authorization-fast-path-native.runtime.mjs', consumerDir);
  // MPO-03: exact shipped mixed Document/User and live-default workflow plus
  // both-hydration arrays/native/default/authorized-union/exact-ID/miss/capture controls,
  // using the real transformed packed installation and both runtime entry conditions.
  for (const file of [
    'private-populate.readme.mjs',
    'private-populate.readme.cjs',
    'private-populate.runtime.mjs',
    'private-populate.runtime.cjs',
  ]) {
    await runMongoConsumer(`authorization-out/${file}`, consumerDir);
  }
  // Include the installed access-router and its implementation in a real Node
  // bundle. Keep framework peers external so model/Express identity stays shared.
  buildSync({
    absWorkingDir: consumerDir,
    entryPoints: ['authorization.readme.mts'],
    outfile: 'authorization.bundle.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['express', 'mongoose'],
    logLevel: 'silent',
  });
  await runMongoConsumer('authorization.bundle.cjs', consumerDir);
  buildSync({
    absWorkingDir: consumerDir,
    entryPoints: ['authorization-fast-path.readme.mts'],
    outfile: 'authorization-fast-path.bundle.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['express', 'mongoose'],
    logLevel: 'silent',
  });
  await runMigration('authorization-fast-path.bundle.cjs');
  buildSync({
    absWorkingDir: consumerDir,
    entryPoints: ['collection.runtime.mts'],
    outfile: 'collection.bundle.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['express', 'mongoose'],
    logLevel: 'silent',
  });
  await runCollection('collection.bundle.cjs');
  // Optional repo-local evidence survives normal consumer scratch cleanup. It is
  // written only AFTER every real packed compile/runtime path above has passed.
  const evidenceRoot = process.env.WTT_ACCESS_ROUTER_CONSUMER_EVIDENCE_DIR;
  if (evidenceRoot) {
    const evidenceBase = path.resolve(workspaceRoot, evidenceRoot);
    mkdirSync(evidenceBase, { recursive: true });
    const evidence = mkdtempSync(path.resolve(evidenceBase, 'packed-consumer-'));
    const installed = path.resolve(consumerDir, 'node_modules/@web-ts-toolkit/access-router');
    cpSync(installed, path.resolve(evidence, 'installed'), { recursive: true, dereference: true });
    writeFileSync(path.resolve(evidence, 'migration-runs.json'), JSON.stringify(migrationRuns, null, 2));
    writeFileSync(path.resolve(evidence, 'collection-runs.json'), JSON.stringify(collectionRuns, null, 2));
    writeFileSync(path.resolve(evidence, 'migration-diagnostics.json'), JSON.stringify(migrationDiagnostics, null, 2));
    const files = [
      'tsconfig.nodenext.json',
      'tsconfig.node16.json',
      'tsconfig.bundler.json',
      'tsconfig.authorization.json',
      ...['ts', 'mts', 'cts'].flatMap((extension) => [
        `authorization-fast-path-consumer.types.fixture.${extension}`,
        `authorization-fast-path.readme.${extension}`,
        `output-publication-fusion-withdrawal.types.fixture.${extension}`,
      ]),
      'node16-out/authorization-fast-path.readme.mjs',
      'node16-out/authorization-fast-path.readme.cjs',
      'authorization-out/authorization-fast-path.readme.mjs',
      'authorization-out/authorization-fast-path.readme.cjs',
      'authorization-fast-path.bundle.cjs',
      'private-exports.cjs',
      'migration-errors.mjs',
      ...['ts', 'mts', 'cts'].flatMap((extension) => [
        `owned-authorization-many.types.fixture.${extension}`,
        `owned-authorization-many-consumer.types.fixture.${extension}`,
        `migration-negative-2.${extension}`,
        ...['raw', 'presentation', 'current'].map((name) => `collection-${name}-recipe.${extension}`),
      ]),
      'collection.runtime.mts',
      'collection.runtime.cts',
      'node16-out/collection.runtime.mjs',
      'node16-out/collection.runtime.cjs',
      'authorization-out/collection.runtime.mjs',
      'authorization-out/collection.runtime.cjs',
      'collection.bundle.cjs',
    ];
    const hashes: Record<string, string> = {};
    for (const file of files) {
      const destination = path.resolve(evidence, file);
      mkdirSync(path.dirname(destination), { recursive: true });
      cpSync(path.resolve(consumerDir, file), destination);
      hashes[file] = createHash('sha256').update(readFileSync(destination)).digest('hex');
    }
    const tarballs: Record<string, string> = {};
    for (const [name, tarball] of Object.entries(preparePackedWorkspace().tarballs)) {
      const file = path.basename(tarball);
      cpSync(tarball, path.resolve(evidence, file));
      tarballs[name] = createHash('sha256').update(readFileSync(tarball)).digest('hex');
    }
    const consumer = JSON.parse(readFileSync(path.resolve(consumerDir, 'package.json'), 'utf8')) as PackageJson;
    const consumerRequire = createRequire(path.resolve(consumerDir, 'package.json'));
    const actualVersions = Object.fromEntries(
      ['express', 'mongoose', 'typescript', '@types/node', '@types/express'].map((name) => [
        name,
        JSON.parse(readFileSync(consumerRequire.resolve(`${name}/package.json`), 'utf8')).version,
      ]),
    );
    writeFileSync(
      path.resolve(evidence, 'verification.json'),
      JSON.stringify(
        {
          passed: true,
          fullDeclarationCheck: options.fullDeclarationCheck,
          requestedPeers: { express: consumer.dependencies!.express, mongoose: consumer.dependencies!.mongoose },
          peers: { express: actualVersions.express, mongoose: actualVersions.mongoose },
          actualVersions,
          runtimePaths: files.filter((file) => /(?:node16-out\/|authorization-out\/|bundle\.cjs$)/.test(file)),
          hashes,
          tarballs,
        },
        null,
        2,
      ) + '\n',
    );
  }
}

afterAll(async () => {
  await authorizationMongo?.stop();
  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('ARF-09 packed-package compatibility using the real release-artifact pipeline', () => {
  // Tarball checks can run independently without invoking release tooling.
  // Artifact-only tests lazily prepare their separately cached workspace.
  beforeAll(async () => {
    preparePackedWorkspace();
    authorizationMongo = await MongoMemoryServer.create();
  }, 240_000);

  it('OAR-05 verifies fresh helpers, current-document reads and private guards on a fresh public tarball', async () => {
    const tarball = preparePackedWorkspace().tarballs['@web-ts-toolkit/access-router'];
    const packedRoot = unpackTarballToDir(tarball);
    symlinkSync(path.resolve(packageRoot, 'node_modules'), path.resolve(packedRoot, 'node_modules'), 'dir');
    const packedDistSha256: Record<string, string> = {};
    for (const file of readdirSync(path.resolve(packageRoot, 'dist')).filter((name) =>
      /\.(?:js|mjs|ts|mts)$/.test(name),
    )) {
      const packedBytes = readFileSync(path.resolve(packedRoot, file));
      expect(packedBytes).toEqual(readFileSync(path.resolve(packageRoot, 'dist', file)));
      packedDistSha256[file] = createHash('sha256').update(packedBytes).digest('hex');
    }
    expect(Object.keys(packedDistSha256)).toHaveLength(14);
    const source = readFileSync(path.resolve(packageRoot, 'test/field-helper-consumer.runtime.fixture.ts'), 'utf8');
    for (const extension of ['mts', 'cts']) writeFileSync(path.resolve(packedRoot, `helpers.${extension}`), source);
    for (const extension of ['mts', 'cts'])
      writeFileSync(
        path.resolve(packedRoot, `hooks.${extension}`),
        readFileSync(path.resolve(packageRoot, 'test/owned-authorization-hooks.types.fixture.ts')),
      );
    writeFileSync(
      path.resolve(packedRoot, 'tsconfig.helpers.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: false,
          esModuleInterop: true,
          outDir: 'helpers-out',
          types: ['node'],
        },
        files: ['helpers.mts', 'helpers.cts', 'hooks.mts', 'hooks.cts'],
      }),
    );
    run(
      'node',
      [path.resolve(workspaceRoot, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.helpers.json'],
      packedRoot,
    );
    run('node', ['helpers-out/helpers.mjs'], packedRoot);
    run('node', ['helpers-out/helpers.cjs'], packedRoot);
    run('node', ['helpers-out/hooks.mjs'], packedRoot);
    run('node', ['helpers-out/hooks.cjs'], packedRoot);
    for (const extension of ['mts', 'cts'])
      writeFileSync(
        path.resolve(packedRoot, `removed.${extension}`),
        readFileSync(path.resolve(packageRoot, 'test/owned-authorization-cutover.invalid.types.fixture.ts')),
      );
    writeFileSync(
      path.resolve(packedRoot, 'tsconfig.removed.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: false,
          esModuleInterop: true,
          noEmit: true,
          types: ['node'],
        },
        files: ['removed.mts', 'removed.cts'],
      }),
    );
    let negativeDiagnostics = '';
    try {
      run(
        'node',
        [path.resolve(workspaceRoot, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.removed.json'],
        packedRoot,
      );
    } catch (error) {
      const cause = (error as Error).cause as { status: number; stdout: string; stderr: string };
      expect(cause.status).toBe(2);
      negativeDiagnostics = cause.stdout + cause.stderr;
    }
    expect(negativeDiagnostics).toMatch(/has no exported member(?: named)? 'DocumentAuthorization'/);
    for (const name of [
      'DocumentStage',
      'unsafeUseReadAuthorizationFastPath',
      'documentAuthorization',
      'getDocumentAuthorization',
      'mongooseModel',
      'originalDocumentSnapshot',
      'currentDocument',
    ])
      expect(negativeDiagnostics).toContain(name);
    expect(negativeDiagnostics).toContain("Property 'filter' does not exist");
    expect(negativeDiagnostics).toContain('only permits reading');
    expect(negativeDiagnostics).not.toContain('node_modules/');
    writeFileSync(path.resolve(packedRoot, 'removed.log'), negativeDiagnostics, { flag: 'wx' });
    const fixture = 'owned-authorization-helpers.runtime.mjs';
    cpSync(
      path.resolve(packageRoot, `test/${fixture.replace('.mjs', '.fixture.mjs')}`),
      path.resolve(packedRoot, fixture),
    );
    const result = {
      ...JSON.parse((await runMongoConsumer(fixture, packedRoot)).trim()),
      tarballSha256: createHash('sha256').update(readFileSync(tarball)).digest('hex'),
      esmSha256: createHash('sha256')
        .update(readFileSync(path.resolve(packedRoot, 'index.mjs')))
        .digest('hex'),
      installedHelperConditions: ['ESM', 'CJS'],
      packedDistSha256,
      packedNegativeTypeConditions: ['NodeNext .mts', 'NodeNext .cts'],
    };
    console.log('OAR05_PACKED_PUBLIC', JSON.stringify(result));
    if (process.env.WTT_ACCESS_ROUTER_CONSUMER_EVIDENCE_DIR) {
      const base = path.resolve(workspaceRoot, process.env.WTT_ACCESS_ROUTER_CONSUMER_EVIDENCE_DIR);
      mkdirSync(base, { recursive: true });
      const evidence = mkdtempSync(path.resolve(base, 'owned-helpers-'));
      cpSync(tarball, path.resolve(evidence, path.basename(tarball)));
      for (const file of [
        'helpers.mts',
        'helpers.cts',
        'hooks.mts',
        'hooks.cts',
        'removed.mts',
        'removed.cts',
        'tsconfig.helpers.json',
        'tsconfig.removed.json',
        'removed.log',
        fixture,
      ])
        cpSync(path.resolve(packedRoot, file), path.resolve(evidence, file));
      cpSync(path.resolve(packedRoot, 'helpers-out'), path.resolve(evidence, 'helpers-out'), { recursive: true });
      writeFileSync(path.resolve(evidence, 'result.json'), JSON.stringify(result, null, 2) + '\n');
    }
  }, 120_000);

  it('OAR-04 rejects overbound native scopes on packed public LIST/READ in both source modes and retains ordinary Code/DBRef', async () => {
    const tarball = preparePackedWorkspace().tarballs['@web-ts-toolkit/access-router'];
    const packedRoot = unpackTarballToDir(tarball);
    // No install required for this focused runtime gate. Package self-reference
    // resolves the real tarball's exports; existing dependencies supply only peers
    // and its workspace dependency closure, never access-router's implementation.
    symlinkSync(path.resolve(packageRoot, 'node_modules'), path.resolve(packedRoot, 'node_modules'), 'dir');
    const fixture = 'authorization-fast-path-native.runtime.mjs';
    cpSync(
      path.resolve(packageRoot, 'test/authorization-fast-path-native.runtime.fixture.mjs'),
      path.resolve(packedRoot, fixture),
    );
    for (const file of readdirSync(path.resolve(packageRoot, 'dist')).filter((name) =>
      /\.(?:js|mjs|ts|mts)$/.test(name),
    ))
      expect(readFileSync(path.resolve(packedRoot, file))).toEqual(
        readFileSync(path.resolve(packageRoot, 'dist', file)),
      );
    const result = {
      ...JSON.parse((await runMongoConsumer(fixture, packedRoot)).trim()),
      tarballSha256: createHash('sha256').update(readFileSync(tarball)).digest('hex'),
      esmSha256: createHash('sha256')
        .update(readFileSync(path.resolve(packedRoot, 'index.mjs')))
        .digest('hex'),
    };
    console.log('FP08_PACKED_PUBLIC', JSON.stringify(result));
    if (process.env.WTT_ACCESS_ROUTER_CONSUMER_EVIDENCE_DIR) {
      const base = path.resolve(workspaceRoot, process.env.WTT_ACCESS_ROUTER_CONSUMER_EVIDENCE_DIR);
      mkdirSync(base, { recursive: true });
      const evidence = mkdtempSync(path.resolve(base, 'native-budget-'));
      cpSync(tarball, path.resolve(evidence, path.basename(tarball)));
      cpSync(path.resolve(packedRoot, fixture), path.resolve(evidence, fixture));
      writeFileSync(path.resolve(evidence, 'result.json'), JSON.stringify(result, null, 2) + '\n');
    }
  }, 120_000);

  it.each([
    ['minimum peers', '5.0.0', '8.0.0'],
    ['current majors', '5.2.1', '9.11.4'],
  ])(
    'ARL-08 installs the numeric count API with %s in Bundler, NodeNext and Node16',
    (label, expressVersion, mongooseVersion) => {
      const consumerDir = installPackedConsumer(expressVersion, mongooseVersion);
      const source = 'grouped-count-consumer.types.fixture';
      const snippet = readFileSync(path.resolve(packageRoot, `test/${source}.ts`), 'utf8');
      for (const extension of ['ts', 'mts', 'cts']) {
        writeFileSync(path.resolve(consumerDir, `${source}.${extension}`), snippet);
      }
      for (const resolution of ['Bundler', 'NodeNext', 'Node16']) {
        const config = `tsconfig-grouped-count-${resolution}.json`;
        writeFileSync(
          path.resolve(consumerDir, config),
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              module: resolution === 'Bundler' ? 'ESNext' : resolution,
              moduleResolution: resolution,
              strict: true,
              noUnusedLocals: true,
              noUnusedParameters: true,
              noEmit: true,
              skipLibCheck: label !== 'current majors',
              esModuleInterop: true,
              types: ['node'],
            },
            files: resolution === 'Bundler' ? [`${source}.ts`] : [`${source}.mts`, `${source}.cts`],
          }),
        );
        expect(run('pnpm', ['exec', 'tsc', '-p', config], consumerDir)).toBe('');
      }
    },
    180_000,
  );

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
    expect(accessRouterManifest.engines).toEqual({ node: '>=24' });
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
        types: {
          import: './index.d.mts',
          require: './index.d.ts',
          default: './index.d.ts',
        },
        import: './index.mjs',
        require: './index.js',
        default: './index.js',
      },
      './advanced': {
        types: {
          import: './advanced.d.mts',
          require: './advanced.d.ts',
          default: './advanced.d.ts',
        },
        import: './advanced.mjs',
        require: './advanced.js',
        default: './advanced.js',
      },
      './processors': {
        types: {
          import: './processors.d.mts',
          require: './processors.d.ts',
          default: './processors.d.ts',
        },
        import: './processors.mjs',
        require: './processors.js',
        default: './processors.js',
      },
    });
    // ARH-09: ESM consumers must resolve `.d.mts` while CJS/Bundler consumers
    // resolve `.d.ts`, for the root and both subpaths.
    for (const subpath of ['.', './advanced', './processors'] as const) {
      const entry = (accessRouterManifest.exports as Record<string, Record<string, unknown>>)[subpath] as Record<
        string,
        unknown
      >;
      const types = entry.types as Record<string, string>;
      expect(types.import).toMatch(/\.d\.mts$/);
      expect(types.require).toMatch(/\.d\.ts$/);
      expect(types.default).toMatch(/\.d\.ts$/);
    }
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
    for (const emitted of [
      'index.js',
      'index.mjs',
      'index.d.ts',
      'index.d.mts',
      'advanced.js',
      'advanced.mjs',
      'advanced.d.ts',
      'advanced.d.mts',
      'processors.js',
      'processors.mjs',
      'processors.d.ts',
      'processors.d.mts',
    ]) {
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

  it('packs the current JavaScript, declaration graph and shipped docs', () => {
    const packed = preparePackedWorkspace();
    const packedRoot = unpackTarballToDir(packed.tarballs['@web-ts-toolkit/access-router']);
    const distRoot = path.resolve(packageRoot, 'dist');
    const emitted = readdirSync(distRoot).filter((file) => /\.(?:js|mjs|ts|mts)$/.test(file));
    expect(emitted).toHaveLength(14);
    expect(emitted.filter((file) => /\.d\.(?:ts|mts)$/.test(file))).toHaveLength(8);
    expect(readdirSync(packedRoot).sort()).toEqual(
      [...emitted, 'README.md', 'MIGRATION.md', 'llms.txt', 'LICENSE', 'package.json'].sort(),
    );
    expect(emitted).toEqual(expect.arrayContaining(['index.mjs', 'index.d.mts', 'advanced.d.ts', 'processors.js']));
    for (const file of emitted) {
      const current = readFileSync(path.resolve(distRoot, file), 'utf8');
      expect(readFileSync(path.resolve(packedRoot, file), 'utf8'), `packed ${file}`).toBe(current);
    }
    for (const file of ['README.md', 'MIGRATION.md', 'llms.txt']) {
      const current = readFileSync(path.resolve(packageRoot, file), 'utf8');
      expect(readFileSync(path.resolve(packedRoot, file), 'utf8'), `packed ${file}`).toBe(current);
    }
  });

  it('OAR-08 packs the linked executable guide without private authority or test files', () => {
    const packedRoot = unpackTarballToDir(preparePackedWorkspace().tarballs['@web-ts-toolkit/access-router']);
    const readme = readFileSync(path.resolve(packedRoot, 'README.md'), 'utf8');
    const llms = readFileSync(path.resolve(packedRoot, 'llms.txt'), 'utf8');
    const migration = readFileSync(path.resolve(packedRoot, 'MIGRATION.md'), 'utf8');
    expect(extractMigrationBlocks(migration)).toHaveLength(13); // ten preserved purposes plus three nested-operation targets
    expect(migration).toContain('Model conditions are facts-only');
    expect(migration).toContain('readEmployeeForBusinessWork');
    for (const mode of ['readAuthorizationMode', 'listAuthorizationMode']) {
      expect(readme).toContain(mode);
      expect(llms).toContain(mode);
    }
    expect(readme).toContain('(MIGRATION.md)');
    expect(llms).toContain('(MIGRATION.md)');
    expect(migration).toContain('async function runOwnedAuthorizationExample()');
    expect(migration).toContain('0 DB operations / 0 document hooks');
    expect(readdirSync(packedRoot).some((name) => /^(?:test|src|_tmp)|fixture|\.test\./.test(name))).toBe(false);
    expect(readdirSync(packedRoot).some((name) => name.startsWith('.'))).toBe(false);
    for (const file of readdirSync(packedRoot).filter((name) => /\.d\.(?:ts|mts)$/.test(name))) {
      const declaration = readFileSync(path.resolve(packedRoot, file), 'utf8');
      for (const name of [
        'AuthorizationFastPathCapture',
        'QueryAuthorizationSource',
        'TrustedOutputBudget',
        'TrustedOutputMemberBuilder',
        'readAuthorizationFastPath',
        'unsafeAuthorizationFastPathOptions',
        'createTrustedOutputBudget',
        'OutputWorkLedger',
        'createOutputWorkLedger',
        'debitOutputWork',
        'debitOutputPayload',
        'admitOutputHelperRows',
        'admitOutputHelperManyControls',
        'filterModelOutputManyForHelper',
      ])
        expect(declaration, `packed ${file}`).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it('assembles the current JavaScript, declaration graph and shipped docs in the artifact', () => {
    const artifactRoot = prepareReleaseArtifactWorkspace().packageDirs['@web-ts-toolkit/access-router'];
    const distRoot = path.resolve(packageRoot, 'dist');
    const emitted = readdirSync(distRoot).filter((file) => /\.(?:js|mjs|ts|mts)$/.test(file));
    expect(emitted).toEqual(expect.arrayContaining(['index.mjs', 'index.d.mts', 'advanced.d.ts', 'processors.js']));
    for (const file of emitted) {
      expect(readFileSync(path.resolve(artifactRoot, 'dist', file), 'utf8'), `artifact ${file}`).toBe(
        readFileSync(path.resolve(distRoot, file), 'utf8'),
      );
    }
    for (const file of ['README.md', 'MIGRATION.md', 'llms.txt']) {
      expect(readFileSync(path.resolve(artifactRoot, file), 'utf8'), `artifact ${file}`).toBe(
        readFileSync(path.resolve(packageRoot, file), 'utf8'),
      );
    }
  }, 240_000);

  it.each([
    ['minimum peers', '5.0.0', '8.0.0'],
    ['current majors', '5.2.1', '9.11.4'],
  ])(
    'supports %s from release-artifact tarballs across ESM, CJS, NodeNext, and Bundler consumers',
    async (_label, expressVersion, mongooseVersion) => {
      const consumerDir = installPackedConsumer(expressVersion, mongooseVersion);
      await runConsumerSmokeTests(consumerDir, { fullDeclarationCheck: _label === 'current majors' });
    },
    // Includes install, runtime smoke and three compiler invocations under suite load.
    300000,
  );

  it.each([
    ['minimum peers', '5.0.0', '8.0.0'],
    ['current majors', '5.2.1', '9.11.4'],
  ])(
    'supports %s from the actual build-artifact package tree across ESM, CJS, NodeNext, and Bundler consumers',
    async (_label, expressVersion, mongooseVersion) => {
      const consumerDir = installArtifactConsumer(expressVersion, mongooseVersion);
      await runConsumerSmokeTests(consumerDir, { fullDeclarationCheck: _label === 'current majors' });
    },
    300000,
  );
});
