import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createCiTestModel, loadWorkspaces } from './ci-test-plan.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
export const archiveFilename = 'ci-test-output.tar.gz';
const manifestFilename = '.ci-test-manifest.json';
const maxArchiveBytes = 512 * 1024 * 1024;
const maxEntries = 10000;
const starterDirectory = 'packages/create-access-router-mongo-starter';
// tsup emits a genuinely empty ESM module for this declarations-only entry.
// Require its file/hash nonetheless, and fail review if the source gains runtime
// statements. No other required entrypoint may use an empty-output exception.
const typeOnlyOutputs = new Map([
  ['packages/express-oidc-vault/dist/wire.mjs', 'packages/express-oidc-vault/src/wire.ts'],
]);
const sorted = (values) => [...values].sort();
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

// Reviewed outputs, not a packages/*/dist glob. The pnpm-discovered build set
// must agree exactly, including all six build-only applications.
export const reviewedOutputRoots = [
  'apps/mongoose-rxdb-example/dist',
  'apps/nodejs/dist',
  'apps/oidc-vault-dpop-angular-example/dist',
  'apps/oidc-vault-dpop-example/dist',
  'apps/oidc-vault-dpop-react-example/dist',
  'apps/oidc-vault-dpop-vue-example/dist',
  'apps/react-vite/dist',
  'apps/runtime/dist',
  'packages/access-router/dist',
  'packages/access-router-client/dist',
  'packages/access-router-deco/dist',
  'packages/access-router-react/dist',
  'packages/access-router-runtime/dist',
  'packages/asset-inliner/dist',
  'packages/create-access-router-mongo-starter/dist',
  'packages/express-json-router/dist',
  'packages/express-oidc-vault/dist',
  'packages/express-oidc-vault-memory-store/dist',
  'packages/express-oidc-vault-mongodb-store/dist',
  'packages/express-oidc-vault-redis-store/dist',
  'packages/express-request-attestation/dist',
  'packages/express-response-handler/dist',
  'packages/express-runtime/dist',
  'packages/http-errors/dist',
  'packages/json-frame/dist',
  'packages/message-service/dist',
  'packages/mongoose-rxdb/dist',
  'packages/moo/dist',
  'packages/oidc-vault-dpop-client/dist',
  'packages/pdf-reader/dist',
  'packages/utils/dist',
].sort();

export function command(command, args, { cwd, env = process.env, inherit = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.error?.message ?? result.status ?? 'signal'})${result.stderr ? `: ${result.stderr.trim()}` : ''}`,
    );
  return result.stdout?.trim() ?? '';
}

function same(actual, expected, label) {
  if (!isDeepStrictEqual(actual, expected)) throw new Error(`${label} mismatch`);
}

export function normalizedPath(path) {
  if (
    typeof path !== 'string' ||
    !path ||
    // eslint-disable-next-line no-control-regex -- Reject control bytes in untrusted archive paths.
    /[\\:\x00-\x1f\x7f]/.test(path) ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error(`Unsafe/non-normalized artifact path: ${JSON.stringify(path)}`);
  return path;
}

function allowedPath(path, roots) {
  normalizedPath(path);
  if (!roots.some((root) => path === root || path.startsWith(`${root}/`)))
    throw new Error(`Artifact path outside output roots: ${path}`);
  const denied = new Set([
    'node_modules',
    '.git',
    '.pnpm',
    '.pnpm-store',
    '.cache',
    '.ssh',
    '.aws',
    '.netlify',
    '.npmrc',
    '.netrc',
    '.pypirc',
    'credentials',
    'test-results',
    'playwright-report',
    'coverage',
    '.local-browsers',
    'ms-playwright',
    'id_rsa',
    'id_ed25519',
  ]);
  if (
    path
      .split('/')
      .some(
        (part) =>
          denied.has(part) ||
          (part !== '.env.example' && (part === '.env' || part.startsWith('.env.'))) ||
          /^(?:mongod(?:-|$)|(?:chromium(?:_headless_shell)?|firefox|webkit|ffmpeg)-\d+$)/.test(part),
      ) ||
    /\.(?:pem|key|p12|pfx)$/.test(path)
  )
    throw new Error(`Forbidden non-output/private artifact entry: ${path}`);
}

function safeMode(type, mode) {
  // The genuine starter stage atomically renames a private mkdtemp directory.
  // Preserve its 0700 mode rather than broadening permissions or editing builds.
  if ((type === 'directory' && ![0o700, 0o755].includes(mode)) || (type === 'file' && ![0o644, 0o755].includes(mode)))
    throw new Error(`Unsafe artifact mode: ${type} ${mode.toString(8)}`);
}

function strings(value) {
  if (typeof value === 'string') return [value];
  if (record(value)) return Object.values(value).flatMap(strings);
  if (Array.isArray(value)) return value.flatMap(strings);
  return [];
}

export function outputContract(
  root = repositoryRoot,
  workspaces = loadWorkspaces(root),
  model = createCiTestModel(workspaces),
) {
  const roots = sorted(model.buildWorkspaces.map((name) => `${workspaces.get(name).directory}/dist`));
  same(roots, reviewedOutputRoots, 'Reviewed pnpm build-output coverage');
  const files = new Map();
  const add = (path, mode) => {
    allowedPath(path, roots);
    const sourcePath = typeOnlyOutputs.get(path);
    if (sourcePath && !files.has(path)) {
      const ts = createRequire(resolve(root, 'package.json'))('typescript');
      const source = ts.createSourceFile(
        sourcePath,
        readFileSync(resolve(root, sourcePath), 'utf8'),
        ts.ScriptTarget.Latest,
      );
      if (
        source.parseDiagnostics.length ||
        !source.statements.length ||
        source.statements.some(
          (statement) => !ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement),
        )
      )
        throw new Error(`Review formerly type-only build output with runtime/invalid source: ${sourcePath}`);
    }
    files.set(path, {
      path,
      ...(mode === undefined ? {} : { mode }),
      ...(sourcePath ? { allowEmpty: true } : {}),
    });
  };
  for (const name of model.buildWorkspaces) {
    const { directory, manifest } = workspaces.get(name);
    for (const target of [manifest.main, manifest.module, manifest.types, ...strings(manifest.exports)].filter(
      Boolean,
    )) {
      if (target.includes('*')) throw new Error(`Review wildcard build output in ${name}: ${target}`);
      add(`${directory}/${target.replace(/^\.\//, '')}`);
    }
    for (const target of strings(manifest.bin)) add(`${directory}/${target.replace(/^\.\//, '')}`, 0o755);
  }
  for (const path of [
    'apps/mongoose-rxdb-example/dist/index.js',
    'apps/nodejs/dist/index.js',
    'apps/oidc-vault-dpop-angular-example/dist/index.html',
    'apps/oidc-vault-dpop-react-example/dist/index.html',
    'apps/oidc-vault-dpop-vue-example/dist/index.html',
    'apps/react-vite/dist/index.html',
    'apps/runtime/dist/app.js',
    'apps/oidc-vault-dpop-example/dist/client/index.html',
    'apps/oidc-vault-dpop-example/dist/server/index.mjs',
    'packages/access-router/dist/MIGRATION.md',
    'packages/access-router-runtime/dist/tsconfig.package.json',
    'packages/access-router-runtime/dist/tsconfig.json',
    ...['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '_gitignore', '.dockerignore', '.env.example'].map(
      (file) => `${starterDirectory}/dist/template/${file}`,
    ),
  ])
    add(path);
  return { roots, files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)), starter: true };
}

export function toolchainPins(root) {
  const versions = readFileSync(resolve(root, '.tool-versions'), 'utf8');
  const node = versions.match(/^nodejs ([0-9]+\.[0-9]+\.[0-9]+)$/m)?.[1];
  const packageManager = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).packageManager;
  const pnpm = /^pnpm@([0-9]+\.[0-9]+\.[0-9]+)$/.exec(packageManager ?? '')?.[1];
  if (!node || !pnpm) throw new Error('CI requires exact .tool-versions Node and root packageManager pnpm pins');
  const templateManager = JSON.parse(
    readFileSync(resolve(root, starterDirectory, 'template/package.json'), 'utf8'),
  ).packageManager;
  if (templateManager !== packageManager) throw new Error('Root/template packageManager pins disagree');
  return { node, pnpm, toolVersionsPnpm: versions.match(/^pnpm (\S+)$/m)?.[1] };
}

export function checkoutIdentity(root, env = process.env, run = command) {
  const pins = toolchainPins(root);
  const checkoutSha = run('git', ['rev-parse', 'HEAD'], { cwd: root, env });
  if (!/^[0-9a-f]{40}$/.test(checkoutSha) || env.GITHUB_SHA !== checkoutSha)
    throw new Error('Actual checkout SHA must equal GITHUB_SHA');
  for (const key of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT']) {
    if (!/^[1-9][0-9]*$/.test(env[key] ?? '')) throw new Error(`Missing/invalid ${key}`);
  }
  const pnpm = run('pnpm', ['--version'], { cwd: root, env });
  if (process.versions.node !== pins.node || pnpm !== pins.pnpm)
    throw new Error('Resolved CI Node/pnpm do not match repository pins');
  return {
    checkoutSha,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    platform: process.platform,
    arch: process.arch,
    node: process.versions.node,
    pnpm,
    lockSha256: sha256(readFileSync(resolve(root, 'pnpm-lock.yaml'))),
  };
}

export function artifactName(identity) {
  if (
    !/^[0-9a-f]{40}$/.test(identity.checkoutSha) ||
    !/^[1-9][0-9]*$/.test(identity.runId) ||
    !/^[1-9][0-9]*$/.test(identity.runAttempt)
  )
    throw new Error('Invalid artifact run/revision identity');
  return `ci-test-build-${identity.runId}-${identity.runAttempt}-${identity.checkoutSha}`;
}

export function ignoredScratch(root, label) {
  // Resource TMPDIR contributes to Unix-socket paths. Keep mkdtemp's six random
  // characters and checkout-local ignore check, without a descriptive prefix.
  const scratch = mkdtempSync(resolve(root, label === 'resources' ? '_tmp' : `_tmp-ci-test-${label}-`));
  command('git', ['check-ignore', scratch], { cwd: root });
  return scratch;
}

// Never follow checkout/output parent links, including links in packages/apps.
function safeParents(root, path, includeLeaf = false) {
  const parts = normalizedPath(path).split('/');
  if (!includeLeaf) parts.pop();
  let current = realpathSync(root);
  for (const part of parts) {
    current = resolve(current, part);
    if (!existsSync(current)) throw new Error(`Missing output parent: ${path}`);
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe output parent: ${path}`);
  }
}

export function assertOutputDestinations(root, contract, { absent = false, run = command } = {}) {
  same(realpathSync(root), resolve(root), 'Checkout real path');
  for (const path of contract.roots) {
    safeParents(root, path);
    // lstat, not existsSync: a dangling link is also an occupied destination.
    let stat;
    try {
      stat = lstatSync(resolve(root, path));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (stat && (absent || !stat.isDirectory() || stat.isSymbolicLink()))
      throw new Error(
        `Output destination must be ${absent ? 'absent for a clean build/restore' : 'a real directory'}: ${path}`,
      );
  }
  if (run('git', ['ls-files', '-z', '--', ...contract.roots], { cwd: root }))
    throw new Error('Refusing to overwrite tracked source/configuration within output roots');
}

export function assertCleanSource(root, run = command) {
  if (run('git', ['status', '--porcelain=v1', '--untracked-files=normal', '--', '.'], { cwd: root }))
    throw new Error(
      'CI preparation requires clean tested-revision source; tracked/untracked checkout changes were detected',
    );
}

export function inventoryOutputs(root, contract) {
  const entries = [];
  let totalBytes = 0;
  const walk = (path) => {
    allowedPath(path, contract.roots);
    const absolute = resolve(root, path);
    const stat = lstatSync(absolute);
    const type = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : undefined;
    if (!type || stat.isSymbolicLink() || (type === 'file' && stat.nlink !== 1))
      throw new Error(`Unsupported artifact link/special entry: ${path}`);
    const mode = stat.mode & 0o7777;
    safeMode(type, mode);
    totalBytes += type === 'file' ? stat.size : 0;
    if (entries.length >= maxEntries || totalBytes > maxArchiveBytes)
      throw new Error('Build-output inventory exceeds size/entry limits');
    const data = type === 'file' ? readFileSync(absolute) : Buffer.alloc(0);
    entries.push({ path, type, mode, size: data.length, sha256: sha256(data) });
    if (type === 'directory') for (const child of sorted(readdirSync(absolute))) walk(`${path}/${child}`);
  };
  for (const path of contract.roots) {
    safeParents(root, path, true);
    walk(path);
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  validateEntrySet(entries, contract);
  return entries;
}

function validateEntrySet(entries, contract) {
  if (!Array.isArray(entries) || entries.length > maxEntries) throw new Error('Invalid/oversized artifact inventory');
  const seen = new Map();
  for (const entry of entries) {
    if (!record(entry)) throw new Error('Invalid artifact inventory entry');
    same(sorted(Object.keys(entry)), ['mode', 'path', 'sha256', 'size', 'type'], 'Artifact entry schema');
    allowedPath(entry.path, contract.roots);
    if (seen.has(entry.path)) throw new Error(`Duplicate artifact path: ${entry.path}`);
    if (!['file', 'directory'].includes(entry.type)) throw new Error(`Unsupported artifact entry type: ${entry.type}`);
    if (!Number.isInteger(entry.mode)) throw new Error('Invalid artifact mode');
    safeMode(entry.type, entry.mode);
    if (
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      entry.size > maxArchiveBytes ||
      !/^[0-9a-f]{64}$/.test(entry.sha256)
    )
      throw new Error('Invalid artifact size/hash');
    if (entry.type === 'directory' && (entry.size !== 0 || entry.sha256 !== sha256('')))
      throw new Error('Invalid directory inventory');
    seen.set(entry.path, entry);
  }
  for (const root of contract.roots) {
    if (
      seen.get(root)?.type !== 'directory' ||
      !entries.some((entry) => entry.type === 'file' && entry.path.startsWith(`${root}/`))
    )
      throw new Error(`Missing/incomplete required output root: ${root}`);
  }
  for (const { path, mode, allowEmpty } of contract.files) {
    const entry = seen.get(path);
    if (
      entry?.type !== 'file' ||
      (entry.size === 0 && allowEmpty !== true) ||
      (mode !== undefined && entry.mode !== mode)
    )
      throw new Error(`Missing/incomplete required output file or mode: ${path}`);
  }
  for (const entry of entries) {
    if (
      !contract.roots.includes(entry.path) &&
      seen.get(dirname(entry.path).split(sep).join('/'))?.type !== 'directory'
    )
      throw new Error(`Missing/non-directory artifact parent: ${entry.path}`);
  }
}

function entryMetadata(entry) {
  const metadata = { ...entry };
  delete metadata.data;
  return metadata;
}

export function validateStarter(root, outputRoot = root, run = command, env = process.env) {
  const releaseVersion = readFileSync(resolve(root, 'VERSION'), 'utf8').trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(releaseVersion)) throw new Error('Invalid repository VERSION');
  const targetDir = resolve(outputRoot, starterDirectory, 'dist/template');
  if (!existsSync(targetDir))
    throw new Error(
      `CI build artifact requires a complete staged starter template for release ${releaseVersion}; an unpublished-release stage skip is not fixture readiness`,
    );
  const staged = JSON.parse(readFileSync(resolve(targetDir, 'package.json'), 'utf8'));
  if (staged.packageManager !== `pnpm@${toolchainPins(root).pnpm}`)
    throw new Error('Staged template packageManager mismatch');
  for (const [name, range] of Object.entries(staged.dependencies ?? {})) {
    if (name.startsWith('@web-ts-toolkit/') && range !== `^${releaseVersion}`)
      throw new Error(`Staged template release dependency mismatch: ${name}`);
  }
  // Reuse the actual publication gate: complete source-file agreement, hidden
  // files, VERSION substitution, real lock resolution and importer specifiers.
  const script = `import { assertStagedTemplateReady } from './scripts/stage-template.ts'; assertStagedTemplateReady(${JSON.stringify({ sourceDir: resolve(root, starterDirectory, 'template'), targetDir, releaseVersion })});`;
  run('pnpm', ['--filter', 'create-access-router-mongo-starter', 'exec', 'tsx', '-e', script], { cwd: root, env });
}

function tarHeader(path, type, mode, size) {
  const header = Buffer.alloc(512);
  let name = path;
  let prefix = '';
  if (Buffer.byteLength(name) > 100) {
    const split = [...path.matchAll(/\//g)]
      .map((match) => match.index)
      .reverse()
      .find(
        (index) => Buffer.byteLength(path.slice(0, index)) <= 155 && Buffer.byteLength(path.slice(index + 1)) <= 100,
      );
    if (split === undefined) throw new Error(`Artifact path exceeds USTAR bounds: ${path}`);
    prefix = path.slice(0, split);
    name = path.slice(split + 1);
  }
  header.write(name, 0, 100, 'utf8');
  const octal = (value, offset, length) => {
    const text = value.toString(8).padStart(length - 1, '0');
    if (text.length >= length) throw new Error('Artifact exceeds USTAR numeric bounds');
    header.write(`${text}\0`, offset, length, 'ascii');
  };
  octal(mode, 100, 8);
  octal(0, 108, 8);
  octal(0, 116, 8);
  octal(size, 124, 12);
  octal(0, 136, 12);
  header.fill(32, 148, 156);
  header.write(type === 'file' ? '0' : '5', 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  header.write(prefix, 345, 155, 'utf8');
  header.write(
    `${header
      .reduce((sum, byte) => sum + byte, 0)
      .toString(8)
      .padStart(6, '0')}\0 `,
    148,
    8,
    'ascii',
  );
  return header;
}

export function encodeArchive(root, identity, contract, entries = inventoryOutputs(root, contract)) {
  validateEntrySet(entries, contract);
  const manifest = { schema: 1, identity, requiredRoots: contract.roots, requiredFiles: contract.files, entries };
  const parts = [];
  const add = (path, type, mode, data) => {
    parts.push(tarHeader(path, type, mode, data.length), data, Buffer.alloc((512 - (data.length % 512)) % 512));
  };
  add(manifestFilename, 'file', 0o644, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  for (const entry of entries) {
    const data = entry.type === 'file' ? readFileSync(resolve(root, entry.path)) : Buffer.alloc(0);
    if (data.length !== entry.size || sha256(data) !== entry.sha256)
      throw new Error(`Output changed during archiving: ${entry.path}`);
    add(entry.path, entry.type, entry.mode, data);
  }
  parts.push(Buffer.alloc(1024));
  const tar = Buffer.concat(parts);
  if (tar.length > maxArchiveBytes) throw new Error('Build-output archive exceeds size limit');
  return gzipSync(tar);
}

// Intentionally supports only our USTAR regular files/directories. No external
// tar extraction, PAX/GNU metadata, links (even internal), devices, or ownership.
export function decodeArchive(bytes, expectedDigest, identity, contract) {
  if (!/^[0-9a-f]{64}$/.test(expectedDigest ?? '')) throw new Error('Missing/invalid external artifact digest');
  if (bytes.length > maxArchiveBytes || sha256(bytes) !== expectedDigest)
    throw new Error('Build-output archive SHA-256 mismatch');
  const tar = gunzipSync(bytes, { maxOutputLength: maxArchiveBytes });
  const entries = [];
  const seen = new Set();
  let position = 0;
  let terminated = false;
  const text = (bytes) => {
    const nul = bytes.indexOf(0);
    if (nul !== -1 && bytes.subarray(nul).some((byte) => byte !== 0)) throw new Error('Invalid USTAR string padding');
    return new TextDecoder('utf-8', { fatal: true }).decode(nul === -1 ? bytes : bytes.subarray(0, nul));
  };
  const number = (bytes) => {
    const value = bytes.toString('ascii').replace(/[\0 ]+$/, '');
    if (!/^[0-7]+$/.test(value)) throw new Error('Invalid USTAR numeric field');
    const parsed = Number.parseInt(value, 8);
    if (!Number.isSafeInteger(parsed)) throw new Error('Oversized USTAR numeric field');
    return parsed;
  };
  while (position + 512 <= tar.length) {
    const header = tar.subarray(position, position + 512);
    if (header.every((byte) => byte === 0)) {
      if (tar.length - position !== 1024 || tar.subarray(position).some((byte) => byte !== 0))
        throw new Error('Invalid USTAR termination/trailing entries');
      terminated = true;
      break;
    }
    const checksum = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (number(header.subarray(148, 156)) !== checksum || header.toString('ascii', 257, 265) !== 'ustar\0' + '00')
      throw new Error('Invalid USTAR header/checksum');
    const name = text(header.subarray(0, 100));
    const prefix = text(header.subarray(345, 500));
    const path = normalizedPath(prefix ? `${prefix}/${name}` : name);
    if (seen.has(path)) throw new Error(`Duplicate artifact path: ${path}`);
    seen.add(path);
    const flag = header.toString('ascii', 156, 157);
    if (!['0', '5'].includes(flag) || text(header.subarray(157, 257)))
      throw new Error(`Unsupported artifact link/special/metadata entry: ${path}`);
    const type = flag === '0' ? 'file' : 'directory';
    const mode = number(header.subarray(100, 108));
    safeMode(type, mode);
    const size = number(header.subarray(124, 136));
    if (size > maxArchiveBytes || (type === 'directory' && size !== 0)) throw new Error('Invalid USTAR entry size');
    position += 512;
    const padded = Math.ceil(size / 512) * 512;
    if (position + padded > tar.length || tar.subarray(position + size, position + padded).some((byte) => byte !== 0))
      throw new Error('Truncated/invalid USTAR data padding');
    const data = tar.subarray(position, position + size);
    entries.push({ path, type, mode, size, sha256: sha256(data), data });
    if (entries.length > maxEntries + 1) throw new Error('Too many artifact entries');
    position += padded;
  }
  if (!terminated) throw new Error('Truncated USTAR archive');
  const manifestEntry = entries.shift();
  if (
    manifestEntry?.path !== manifestFilename ||
    manifestEntry.type !== 'file' ||
    manifestEntry.mode !== 0o644 ||
    manifestEntry.size > 5 * 1024 * 1024
  )
    throw new Error('Missing/invalid build-output manifest');
  const manifest = JSON.parse(manifestEntry.data.toString('utf8'));
  if (!record(manifest)) throw new Error('Invalid build-output manifest');
  same(
    sorted(Object.keys(manifest)),
    ['entries', 'identity', 'requiredFiles', 'requiredRoots', 'schema'],
    'Artifact manifest schema',
  );
  same(manifest.schema, 1, 'Artifact manifest version');
  same(manifestEntry.data.toString('utf8'), `${JSON.stringify(manifest, null, 2)}\n`, 'Canonical artifact manifest');
  same(manifest.identity, identity, 'Artifact checkout/run/platform/toolchain/lock identity');
  same(manifest.requiredRoots, contract.roots, 'Required artifact roots');
  same(manifest.requiredFiles, contract.files, 'Required artifact files');
  validateEntrySet(manifest.entries, contract);
  same(entries.map(entryMetadata), manifest.entries, 'Archive inventory/hash/mode');
  return { manifest, entries };
}

export function readDownloadedArchive(directory, name, digest, identity, contract) {
  if (name !== artifactName(identity)) throw new Error('Artifact name must match this exact run/attempt/checkout');
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe artifact download directory');
  same(sorted(readdirSync(directory)), [archiveFilename], 'Downloaded artifact contents');
  const path = resolve(directory, archiveFilename);
  const file = lstatSync(path);
  if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1 || file.size > maxArchiveBytes)
    throw new Error('Unsafe/oversized downloaded artifact');
  return decodeArchive(readFileSync(path), digest, identity, contract);
}

export function restoreOutputs(root, archive, contract, { verifyTemplate = validateStarter, env = process.env } = {}) {
  validateEntrySet(archive.manifest.entries, contract);
  same(archive.entries.map(entryMetadata), archive.manifest.entries, 'Restore inventory');
  for (const entry of archive.entries) {
    if (!Buffer.isBuffer(entry.data) || entry.data.length !== entry.size || sha256(entry.data) !== entry.sha256)
      throw new Error('Restore payload integrity mismatch');
  }
  assertOutputDestinations(root, contract, { absent: true });
  const stage = ignoredScratch(root, 'restore');
  const moved = [];
  try {
    for (const entry of archive.entries) {
      const target = resolve(stage, entry.path);
      mkdirSync(dirname(target), { recursive: true });
      if (entry.type === 'directory') mkdirSync(target, { recursive: true });
      else writeFileSync(target, entry.data, { flag: 'wx' });
      chmodSync(target, entry.mode);
    }
    same(inventoryOutputs(stage, contract), archive.manifest.entries, 'Staged output integrity');
    if (contract.starter) verifyTemplate(root, stage, command, { ...env, TMPDIR: stage });
    // Validate all destination boundaries again before the first rename.
    assertOutputDestinations(root, contract, { absent: true });
    for (const path of contract.roots) {
      renameSync(resolve(stage, path), resolve(root, path));
      moved.push(path);
    }
  } catch (error) {
    // Only roots created by this restore; never remove preexisting/user outputs.
    for (const path of moved) rmSync(resolve(root, path), { recursive: true, force: true });
    throw error;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

export function verifyRestoredOutputs(
  root,
  archive,
  contract,
  { verifyTemplate = validateStarter, env = process.env } = {},
) {
  assertOutputDestinations(root, contract);
  same(inventoryOutputs(root, contract), archive.manifest.entries, 'Restored output integrity before tests');
  if (contract.starter) verifyTemplate(root, root, command, env);
}

export function githubValues(file, values) {
  if (!file) throw new Error('Missing GitHub output/environment file');
  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) || /[\r\n\0]/.test(String(value)))
      throw new Error('Unsafe GitHub output/environment value');
    appendFileSync(file, `${key}=${value}\n`);
  }
}

export function prepareArtifacts(
  root = repositoryRoot,
  env = process.env,
  { run = command, contract = outputContract(root), verifyTemplate = validateStarter } = {},
) {
  const identity = checkoutIdentity(root, env, run);
  assertCleanSource(root, run);
  assertOutputDestinations(root, contract, { absent: true, run });
  const scratch = ignoredScratch(root, 'prepare');
  const buildEnv = { ...env, TMPDIR: scratch };
  run('pnpm', ['build'], { cwd: root, env: buildEnv, inherit: true });
  same(checkoutIdentity(root, buildEnv, run), identity, 'Identity after full pnpm build');
  assertCleanSource(root, run);
  if (contract.starter) verifyTemplate(root, root, run, buildEnv);
  const entries = inventoryOutputs(root, contract);
  const bytes = encodeArchive(root, identity, contract, entries);
  // Verify our own archive using the same strict consumer parser.
  const digest = sha256(bytes);
  decodeArchive(bytes, digest, identity, contract);
  const path = resolve(scratch, archiveFilename);
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
  return { 'artifact-name': artifactName(identity), 'artifact-path': path, 'artifact-digest': digest };
}

export function runCli(
  args,
  { root = repositoryRoot, env = process.env, log = console.log, error = console.error } = {},
) {
  try {
    if (args.length !== 1 || args[0] !== 'prepare')
      throw new Error('Usage: node scripts/ci-test-artifacts.mjs prepare');
    const outputs = prepareArtifacts(root, env);
    githubValues(env.GITHUB_OUTPUT, outputs);
    log(`Prepared ${outputs['artifact-name']} (archive SHA-256 ${outputs['artifact-digest']}).`);
    return 0;
  } catch (cause) {
    error(cause.message);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = runCli(process.argv.slice(2));
