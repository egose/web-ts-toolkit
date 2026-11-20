import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync, lstatSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  assertCleanSource,
  checkoutIdentity,
  command,
  githubValues,
  ignoredScratch,
  outputContract,
  readDownloadedArchive,
  restoreOutputs,
  sha256,
  toolchainPins,
  verifyRestoredOutputs,
} from './ci-test-artifacts.mjs';
import { createCiTestModel, loadWorkspaces, resolveTestWorkspace } from './ci-test-plan.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const engines = ['chromium', 'firefox', 'webkit'];
export const browserWorkspaces = [
  '@web-ts-toolkit/express-request-attestation',
  '@web-ts-toolkit/pdf-reader',
  'oidc-vault-dpop-example',
];
export const mongoWorkspaces = [
  '@web-ts-toolkit/access-router',
  '@web-ts-toolkit/access-router-deco',
  '@web-ts-toolkit/access-router-client',
  '@web-ts-toolkit/email-service',
  '@web-ts-toolkit/message-service',
  '@web-ts-toolkit/moo',
  '@web-ts-toolkit/express-oidc-vault-mongodb-store',
  '@web-ts-toolkit/express-request-attestation',
  'create-access-router-mongo-starter',
];
export const redisWorkspaces = [
  '@web-ts-toolkit/express-request-attestation',
  '@web-ts-toolkit/express-oidc-vault-redis-store',
];
export const redisImages = ['redis:6.2-alpine', 'redis:7.2-alpine'];

// Linux sun_path[108] needs a terminating NUL. BroadcastChannel 7.4.0 adds
// /pubkey.bc/A + 20 hash characters + /rdrs/ + reader UUID + .s (40 fixed bytes).
// Pinned Node 26.12.1 / V8 14.6.202.34 generates k / 2**53: its base-36 reader
// token needs at most 21 digits. Reserve 22, not the observed 10-11. Review this
// contract when upgrading Node/BroadcastChannel; it is not an arbitrary-number
// or mocked-Math.random bound. See the R1 remediation handoff for the derivation.
export const resourceTmpdirMaxBytes = 107 - 40 - 22;

// Only programmatic tests inject byte measurement for deep filesystem fixtures;
// the CLI/environment exposes no alternate budget or path-selection mode.
export function assertSocketSafeTmpdir(directory, byteLength = Buffer.byteLength) {
  if (
    typeof directory !== 'string' ||
    !isAbsolute(directory) ||
    resolve(directory) !== directory ||
    directory.includes('\0')
  )
    throw new Error('CI resource TMPDIR must be a normalized absolute path');
  const bytes = byteLength(directory, 'utf8');
  if (!Number.isSafeInteger(bytes) || bytes < 1) throw new Error('Invalid CI resource TMPDIR byte measurement');
  if (bytes > resourceTmpdirMaxBytes)
    throw new Error(
      `CI resource TMPDIR is ${bytes} UTF-8 bytes; Linux Unix-socket budget permits at most ${resourceTmpdirMaxBytes} (107 - 40 fixed BroadcastChannel bytes - 22 reader UUID bytes). Use a shorter real checkout path; external-temp or symlink aliases are not supported.`,
    );
}

function version(value, label) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(value))
    throw new Error(`Invalid resolved ${label} version`);
  return value;
}

export function selectedBrowsers(value = 'chromium') {
  if (typeof value !== 'string') throw new Error('DPOP_TEST_BROWSERS must be a comma-separated browser selection');
  const selected = value.split(',');
  if (selected.some((name) => !engines.includes(name)) || new Set(selected).size !== selected.length)
    throw new Error('DPOP_TEST_BROWSERS must contain unique chromium/firefox/webkit engines without whitespace');
  return selected.sort();
}

export function resolvedPackage(directory, name, fromPackage) {
  const require = createRequire(fromPackage ?? resolve(directory, 'package.json'));
  const packageFile = require.resolve(`${name}/package.json`);
  const manifest = JSON.parse(readFileSync(packageFile, 'utf8'));
  if (manifest.name !== name) throw new Error(`Resolved unexpected resource package: ${name}`);
  return { packageFile, version: version(manifest.version, name) };
}

// Subprocess probes exercise package-manager enforcement in each workspace and
// in an independently generated consumer containing the differing asdf pins.
export function setupCi(
  root = repositoryRoot,
  env = process.env,
  { run = command, workspaces = loadWorkspaces(root), log = console.log } = {},
) {
  const pins = toolchainPins(root);
  if (process.versions.node !== pins.node) throw new Error('Resolved CI Node does not match .tool-versions');
  const observations = [];
  const probe = (directory, label) => {
    const pnpm = run('pnpm', ['--version'], { cwd: directory, env });
    const node = run('pnpm', ['exec', 'node', '--version'], { cwd: directory, env });
    if (pnpm !== pins.pnpm || node !== `v${pins.node}`) throw new Error(`CI subprocess toolchain mismatch in ${label}`);
    observations.push({ directory: label, pnpm, node });
  };
  probe(root, '.');
  for (const { directory } of workspaces.values()) probe(resolve(root, directory), directory);
  const scratch = ignoredScratch(root, 'tools');
  try {
    writeFileSync(
      resolve(scratch, 'package.json'),
      JSON.stringify({ name: 'ci-toolchain-probe', private: true, packageManager: `pnpm@${pins.pnpm}` }),
    );
    writeFileSync(resolve(scratch, '.tool-versions'), readFileSync(resolve(root, '.tool-versions')));
    probe(scratch, '<generated-consumer>');
    version(run('npm', ['--version'], { cwd: scratch, env }), 'npm');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  for (const [name, args] of [
    ['git', ['--version']],
    ['sh', ['-c', 'exit 0']],
    ['tar', ['--version']],
    ['find', ['--version']],
  ])
    run(name, args, { cwd: root, env });
  log(JSON.stringify({ toolchain: pins, resolution: observations }));
  return observations;
}

export function assertResourceDirectory(root, directory) {
  if (typeof directory !== 'string' || !/^_tmp[A-Za-z0-9]{6}$/.test(relative(root, directory)))
    throw new Error('Resource directory must be a fresh checkout-local CI scratch directory');
  const stat = lstatSync(directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    realpathSync(directory) !== resolve(directory) ||
    realpathSync(root) !== resolve(root)
  )
    throw new Error('Unsafe CI resource directory');
  command('git', ['check-ignore', directory], { cwd: root });
}

function ensureResourceChild(resourceDirectory, directory) {
  if (dirname(directory) !== resourceDirectory)
    throw new Error('Resource path must be a direct child of the isolated resource directory');
  mkdirSync(directory, { recursive: true });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(directory) !== directory)
    throw new Error('Unsafe CI resource child directory');
}

function resourceJson(output) {
  const records = output.split('\n').filter((line) => line.startsWith('CI_RESOURCE_JSON='));
  if (records.length !== 1) throw new Error('Missing/ambiguous resource preflight result');
  return JSON.parse(records[0].slice('CI_RESOURCE_JSON='.length));
}

function downloadUrl(value, label) {
  if (value === undefined) return undefined;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error(
      `Unsafe ${label}; download overrides must be credential-free HTTP(S) URLs without queries/fragments`,
    );
  return url.href;
}

function mongoConfiguration(core, directory, downloadDirectory, env, run) {
  const script = `
    const path = require('node:path');
    const { resolveConfig: config, ResolveConfigVariables: v } = require(${JSON.stringify(resolve(dirname(core.packageFile), 'lib/util/resolveConfig.js'))});
    const { DryMongoBinary } = require(${JSON.stringify(resolve(dirname(core.packageFile), 'lib/util/DryMongoBinary.js'))});
    (async () => {
      const requestedVersion = config(v.VERSION);
      const options = await DryMongoBinary.generateOptions({ version: requestedVersion, downloadDir: ${JSON.stringify(downloadDirectory)} });
      console.log('CI_RESOURCE_JSON=' + JSON.stringify({
        requestedVersion, version: options.version, systemBinary: options.systemBinary,
        binaryName: await DryMongoBinary.getBinaryName(options), os: options.os,
        platform: options.platform, arch: options.arch,
        download: { mirror: config(v.DOWNLOAD_MIRROR) ?? 'https://fastdl.mongodb.org', url: config(v.DOWNLOAD_URL), archiveName: config(v.ARCHIVE_NAME), distro: config(v.DISTRO) }
      }));
    })().catch(error => { console.error(error.message); process.exitCode = 1; });
  `;
  return resourceJson(run('node', ['-e', script], { cwd: directory, env }));
}

export function resolveResources(
  root,
  workspace,
  resourceDirectory,
  {
    env = process.env,
    run = command,
    packageResolver = resolvedPackage,
    workspaces = loadWorkspaces(root),
    model = createCiTestModel(workspaces),
    tmpdirByteLength = Buffer.byteLength,
  } = {},
) {
  const node = resolveTestWorkspace(model, workspace);
  if (!workspaces.has(workspace)) throw new Error('Test workspace is missing from pnpm discovery');
  const directory = resolve(root, workspaces.get(workspace).directory);
  if (
    node.command.length !== 4 ||
    node.command[0] !== 'pnpm' ||
    node.command[1] !== '--filter' ||
    node.command[2] !== workspace ||
    node.command[3] !== 'test'
  )
    throw new Error('CI workspace command must be exactly pnpm --filter <manifest-name> test');
  assertResourceDirectory(root, resourceDirectory);
  assertSocketSafeTmpdir(resourceDirectory, tmpdirByteLength);
  // TMPDIR is the fresh scratch itself; a /tmp child would spend four more
  // pathname bytes. Cache only the dedicated browser/binary children below,
  // never the resource directory or its mutable test/database state.
  const plan = { workspace, directory, resourceDirectory, tmpdir: resourceDirectory };
  if (browserWorkspaces.includes(workspace)) {
    const playwright = packageResolver(directory, 'playwright');
    const core = packageResolver(directory, 'playwright-core', playwright.packageFile);
    if (core.version !== playwright.version) throw new Error('Workspace Playwright/core versions disagree');
    const selected =
      workspace === 'oidc-vault-dpop-example' ? selectedBrowsers(env.DPOP_TEST_BROWSERS ?? 'chromium') : ['chromium'];
    plan.browser = {
      ...playwright,
      engines: selected,
      directory: resolve(resourceDirectory, 'browsers'),
      cli: resolve(dirname(playwright.packageFile), 'cli.js'),
      cacheKey: `ci-playwright-${process.platform}-${process.arch}-${playwright.version}-${selected.join('-')}`,
    };
  }
  if (mongoWorkspaces.includes(workspace)) {
    if (env.MONGOMS_SYSTEM_BINARY)
      throw new Error('CI Mongo preflight cannot use a machine-installed MONGOMS_SYSTEM_BINARY');
    const memoryServer = packageResolver(directory, 'mongodb-memory-server');
    const core = packageResolver(directory, 'mongodb-memory-server-core', memoryServer.packageFile);
    const downloadDirectory = resolve(resourceDirectory, 'mongodb');
    const mongoEnv = {
      ...env,
      TMPDIR: plan.tmpdir,
      MONGOMS_DOWNLOAD_DIR: downloadDirectory,
      MONGOMS_PREFER_GLOBAL_PATH: 'false',
      MONGOMS_ARCH: process.arch,
      MONGOMS_PLATFORM: process.platform,
      MONGOMS_RUNTIME_DOWNLOAD: 'true',
      MONGOMS_MD5_CHECK: 'true',
      MONGOMS_VALIDATE_BINARY_CHECKSUM: 'true',
      MONGOMS_USE_ARCHIVE_NAME_FOR_BINARY_NAME: 'false',
    };
    // TMPDIR already exists before probes that may use os.tmpdir(). Never put
    // DB state in the binary-only download/cache directory.
    const config = mongoConfiguration(core, directory, downloadDirectory, mongoEnv, run);
    version(config.version, 'mongod');
    if (
      config.requestedVersion !== config.version ||
      config.systemBinary ||
      config.platform !== process.platform ||
      config.arch !== process.arch
    )
      throw new Error(
        'Mongo download/system-binary/platform configuration does not match the requested isolated server',
      );
    if (typeof config.binaryName !== 'string' || !/^mongod-[A-Za-z0-9_.-]+$/.test(config.binaryName))
      throw new Error('Unsafe resolved mongod binary name');
    if (
      !config.os ||
      config.os.os !== process.platform ||
      (process.platform === 'linux' &&
        (typeof config.os.dist !== 'string' ||
          !config.os.dist ||
          typeof config.os.release !== 'string' ||
          !config.os.release))
    )
      throw new Error('Missing/incompatible resolved Mongo OS configuration');
    const download = {
      mirror: downloadUrl(config.download.mirror, 'Mongo mirror'),
      url: downloadUrl(config.download.url, 'Mongo URL'),
      archiveName: config.download.archiveName,
      distro: config.download.distro,
    };
    for (const [key, value] of Object.entries(download)) {
      if (value !== undefined && ['archiveName', 'distro'].includes(key) && !/^[A-Za-z0-9_.-]+$/.test(value))
        throw new Error(`Unsafe Mongo ${key} override`);
    }
    plan.mongo = {
      memoryServer,
      core,
      version: config.version,
      directory: downloadDirectory,
      binaryPath: resolve(downloadDirectory, config.binaryName),
      os: config.os,
      download,
      cacheKey: `ci-mongod-${process.platform}-${process.arch}-${sha256(JSON.stringify(config.os)).slice(0, 16)}-memory-${memoryServer.version}-core-${core.version}-server-${config.version}-${sha256(JSON.stringify(download)).slice(0, 16)}`,
      env: {
        ...mongoEnv,
        MONGOMS_VERSION: config.version,
        MONGOMS_SYSTEM_BINARY: resolve(downloadDirectory, config.binaryName),
        MONGOMS_SYSTEM_BINARY_VERSION_CHECK: 'true',
        MONGOMS_RUNTIME_DOWNLOAD: 'false',
      },
    };
  }
  if (redisWorkspaces.includes(workspace)) plan.redis = [...redisImages];
  return plan;
}

export function resourceOutputs(plan) {
  return {
    'resource-directory': plan.resourceDirectory,
    browser: String(Boolean(plan.browser)),
    'browser-path': plan.browser?.directory ?? '',
    'browser-key': plan.browser?.cacheKey ?? '',
    mongo: String(Boolean(plan.mongo)),
    'mongo-path': plan.mongo?.binaryPath ?? '',
    'mongo-key': plan.mongo?.cacheKey ?? '',
  };
}

export function resourceEnvironment(plan, env = process.env) {
  const result = { ...(plan.mongo?.env ?? env), TMPDIR: plan.tmpdir };
  if (plan.browser) result.PLAYWRIGHT_BROWSERS_PATH = plan.browser.directory;
  if (plan.workspace === 'oidc-vault-dpop-example') result.DPOP_TEST_BROWSERS = plan.browser.engines.join(',');
  return result;
}

function cacheHit(value) {
  if (!['', 'true', 'false', undefined].includes(value)) throw new Error('Invalid resource cache-hit input');
  return value === 'true';
}

export function prepareResources(
  plan,
  {
    run = command,
    env = process.env,
    browserCacheHit,
    mongoCacheHit,
    log = console.log,
    tmpdirByteLength = Buffer.byteLength,
  } = {},
) {
  const browserHit = cacheHit(browserCacheHit);
  const mongoHit = cacheHit(mongoCacheHit);
  if (plan.tmpdir !== plan.resourceDirectory)
    throw new Error('CI resource TMPDIR must be the isolated resource directory');
  assertResourceDirectory(dirname(plan.resourceDirectory), plan.resourceDirectory);
  assertSocketSafeTmpdir(plan.tmpdir, tmpdirByteLength);
  const childEnv = resourceEnvironment(plan, env);
  const observations = { workspace: plan.workspace };
  if (plan.browser) {
    ensureResourceChild(plan.resourceDirectory, plan.browser.directory);
    // A browser cache never represents installed Ubuntu runtime libraries.
    run('node', [plan.browser.cli, 'install-deps', ...plan.browser.engines], {
      cwd: plan.directory,
      env: childEnv,
      inherit: true,
    });
    if (!browserHit)
      run('node', [plan.browser.cli, 'install', ...plan.browser.engines], {
        cwd: plan.directory,
        env: childEnv,
        inherit: true,
      });
    const script = `
      const playwright = require(${JSON.stringify(dirname(plan.browser.packageFile))});
      (async () => {
        const versions = {};
        for (const name of ${JSON.stringify(plan.browser.engines)}) {
          const browser = await playwright[name].launch({ headless: true, ...(name === 'chromium' ? { args: ['--no-sandbox'] } : {}) });
          try { const page = await browser.newPage(); if (await page.evaluate(() => 2 + 2) !== 4) throw new Error('Browser execution preflight failed'); versions[name] = browser.version(); }
          finally { await browser.close(); }
        }
        console.log('CI_RESOURCE_JSON=' + JSON.stringify(versions));
      })().catch(error => { console.error(error.message); process.exitCode = 1; });
    `;
    const versions = resourceJson(run('node', ['-e', script], { cwd: plan.directory, env: childEnv }));
    if (
      Object.keys(versions).sort().join(',') !== plan.browser.engines.join(',') ||
      Object.values(versions).some((value) => typeof value !== 'string' || !value)
    )
      throw new Error('Incomplete real-browser preflight');
    observations.browser = {
      playwright: plan.browser.version,
      engines: plan.browser.engines,
      cacheHit: browserHit,
      versions,
    };
  }
  if (plan.mongo) {
    ensureResourceChild(plan.resourceDirectory, plan.mongo.directory);
    const script = `
      const { execFileSync } = require('node:child_process');
      const { readFileSync, lstatSync, realpathSync } = require('node:fs');
      const { createHash } = require('node:crypto');
      const { createRequire } = require('node:module');
      const memory = require(${JSON.stringify(dirname(plan.mongo.memoryServer.packageFile))});
      const coreRequire = createRequire(${JSON.stringify(plan.mongo.core.packageFile)});
      const { MongoBinaryDownload } = coreRequire('./lib/util/MongoBinaryDownload.js');
      const { MongoClient } = coreRequire('mongodb');
      (async () => {
        const expectedPath = ${JSON.stringify(plan.mongo.binaryPath)};
        const assertBinary = () => {
          const stat = lstatSync(expectedPath);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o7777) !== 0o755 || realpathSync(expectedPath) !== expectedPath)
            throw new Error('Unsafe cached/downloaded mongod binary');
        };
        try { assertBinary(); } catch (error) { if (error.code !== 'ENOENT' || ${JSON.stringify(mongoHit)}) throw error; }
        // The direct downloader never searches another checkout or the user's
        // global cache. Tests and generated consumers use only this exact path.
        const downloader = new MongoBinaryDownload({ version: ${JSON.stringify(plan.mongo.version)}, downloadDir: ${JSON.stringify(plan.mongo.directory)}, platform: ${JSON.stringify(process.platform)}, arch: ${JSON.stringify(process.arch)}, os: ${JSON.stringify(plan.mongo.os)}, checkMD5: true });
        const binaryPath = await downloader.getMongodPath();
        if (binaryPath !== expectedPath) throw new Error('Mongo downloader escaped the isolated binary path');
        assertBinary();
        const output = execFileSync(binaryPath, ['--version'], { encoding: 'utf8' });
        const binaryVersion = /db version v([0-9.]+)/.exec(output)?.[1];
        if (binaryVersion !== ${JSON.stringify(plan.mongo.version)}) throw new Error('mongod binary version mismatch');
        const server = await memory.MongoMemoryReplSet.create({ binary: { version: ${JSON.stringify(plan.mongo.version)}, systemBinary: binaryPath, downloadDir: ${JSON.stringify(plan.mongo.directory)} }, replSet: { count: 1, storageEngine: 'wiredTiger' } });
        try {
          const client = new MongoClient(server.getUri());
          try {
            await client.connect(); await client.db('admin').command({ ping: 1 });
            const serverVersion = (await client.db('admin').command({ buildInfo: 1 })).version;
            console.log('CI_RESOURCE_JSON=' + JSON.stringify({ binaryPath, binaryVersion, serverVersion, sha256: createHash('sha256').update(readFileSync(binaryPath)).digest('hex') }));
          } finally { await client.close(); }
        } finally { await server.stop(); }
      })().catch(error => { console.error(error.message); process.exitCode = 1; });
    `;
    const result = resourceJson(run('node', ['-e', script], { cwd: plan.directory, env: childEnv }));
    if (
      result.binaryPath !== plan.mongo.binaryPath ||
      result.binaryVersion !== plan.mongo.version ||
      result.serverVersion !== plan.mongo.version ||
      !/^[0-9a-f]{64}$/.test(result.sha256)
    )
      throw new Error('Isolated mongod availability/version preflight mismatch');
    observations.mongo = {
      memoryServer: plan.mongo.memoryServer.version,
      core: plan.mongo.core.version,
      version: result.serverVersion,
      binary: relative(dirname(plan.resourceDirectory), result.binaryPath).split(sep).join('/'),
      sha256: result.sha256,
      os: plan.mongo.os,
      download: plan.mongo.download,
      cacheHit: mongoHit,
    };
  }
  if (plan.redis) {
    const cli = run('docker', ['--version'], { cwd: plan.directory, env: childEnv });
    const daemon = run('docker', ['info', '--format', '{{.ServerVersion}}'], { cwd: plan.directory, env: childEnv });
    if (!cli || !daemon) throw new Error('Redis tests require a working Docker CLI and daemon');
    const images = [];
    for (const image of plan.redis) {
      run('docker', ['pull', image], { cwd: plan.directory, env: childEnv, inherit: true });
      const digests = JSON.parse(
        run('docker', ['image', 'inspect', '--format', '{{json .RepoDigests}}', image], {
          cwd: plan.directory,
          env: childEnv,
        }),
      );
      if (
        !Array.isArray(digests) ||
        !digests.length ||
        digests.some(
          (digest) => typeof digest !== 'string' || !/^(?:[A-Za-z0-9._/-]+\/)?redis@sha256:[0-9a-f]{64}$/.test(digest),
        )
      )
        throw new Error(`Missing/invalid pulled Redis image digest: ${image}`);
      const output = run('docker', ['run', '--rm', '--network', 'none', image, 'redis-server', '--version'], {
        cwd: plan.directory,
        env: childEnv,
      });
      const serverVersion = /Redis server v=(\d+\.\d+\.\d+)/.exec(output)?.[1];
      if (!serverVersion?.startsWith(`${image.slice('redis:'.length).split('-')[0]}.`))
        throw new Error(`Redis image version mismatch: ${image}`);
      images.push({ image, digests, version: serverVersion });
    }
    observations.redis = { cli, daemon, images };
  }
  log(JSON.stringify({ resources: observations }));
  return { env: childEnv, observations };
}

function context(root, env, options) {
  const workspaces = options.workspaces ?? loadWorkspaces(root);
  const model = options.model ?? createCiTestModel(workspaces);
  const workspace = env.CI_TEST_WORKSPACE;
  const node = resolveTestWorkspace(model, workspace);
  const contract = options.contract ?? outputContract(root, workspaces, model);
  const identity = checkoutIdentity(root, env, options.run ?? command);
  assertCleanSource(root, options.run ?? command);
  if (!env.CI_TEST_ARTIFACT_DIR) throw new Error('Missing CI_TEST_ARTIFACT_DIR');
  const archive = readDownloadedArchive(
    env.CI_TEST_ARTIFACT_DIR,
    env.CI_TEST_ARTIFACT_NAME,
    env.CI_TEST_ARTIFACT_DIGEST,
    identity,
    contract,
  );
  return { workspaces, model, workspace, node, contract, identity, archive };
}

export function restoreWorkspace(root = repositoryRoot, env = process.env, options = {}) {
  const state = context(root, env, options);
  // Reject an unsupported checkout before allocating resources, resolving
  // packages, invoking resource probes, or restoring compiled outputs.
  assertSocketSafeTmpdir(resolve(root, '_tmpXXXXXX'), options.tmpdirByteLength);
  const resourceDirectory = ignoredScratch(root, 'resources');
  const plan = resolveResources(root, state.workspace, resourceDirectory, {
    ...options,
    env,
    workspaces: state.workspaces,
    model: state.model,
  });
  restoreOutputs(root, state.archive, state.contract, {
    env,
    ...(options.verifyTemplate ? { verifyTemplate: options.verifyTemplate } : {}),
  });
  return resourceOutputs(plan);
}

export function runWorkspace(root = repositoryRoot, env = process.env, options = {}) {
  const state = context(root, env, options);
  const verify = () =>
    verifyRestoredOutputs(root, state.archive, state.contract, {
      env,
      ...(options.verifyTemplate ? { verifyTemplate: options.verifyTemplate } : {}),
    });
  verify();
  const plan = resolveResources(root, state.workspace, env.CI_TEST_RESOURCE_DIR, {
    ...options,
    env,
    workspaces: state.workspaces,
    model: state.model,
  });
  const prepared = prepareResources(plan, {
    ...options,
    env,
    browserCacheHit: env.CI_TEST_BROWSER_CACHE_HIT,
    mongoCacheHit: env.CI_TEST_MONGO_CACHE_HIT,
  });
  if (!isDeepStrictEqual(checkoutIdentity(root, env, options.run ?? command), state.identity))
    throw new Error('Checkout/run/platform/toolchain/lock identity changed during resource preparation');
  assertCleanSource(root, options.run ?? command);
  verify();
  // Keep the whole manifest script and its own worker/rebuild controls. No
  // dependency-closure filter, shell interpolation, reduced lane, or retry.
  (options.run ?? command)(state.node.command[0], state.node.command.slice(1), {
    cwd: root,
    env: prepared.env,
    inherit: true,
  });
  return prepared.observations;
}

export function runCli(
  args,
  { root = repositoryRoot, env = process.env, log = console.log, error = console.error, ...options } = {},
) {
  try {
    if (args.length > 1 || (args.length === 1 && !['setup', 'restore'].includes(args[0])))
      throw new Error('Usage: node scripts/ci-test-workspace.mjs [setup|restore]');
    if (args[0] === 'setup') setupCi(root, env, { ...options, log });
    else if (args[0] === 'restore') githubValues(env.GITHUB_OUTPUT, restoreWorkspace(root, env, options));
    else runWorkspace(root, env, { ...options, log });
    return 0;
  } catch (cause) {
    error(cause.message);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = runCli(process.argv.slice(2));
