// This bootstrap runs before the pinned project Node and dependency installation.
// Use only Node-20-compatible built-ins; the runner's actual runtime is a V6 fact.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  ftruncateSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const checkoutRootMaxBytes = 34; // Cross-checked against unchanged R1 in maintained tests.
export const checkoutTmpdirMaxBytes = 45;
const stateName = 'ci_checkout';
const witnessName = 'ci-checkout-owner.json';
const shaPattern = /^[0-9a-f]{40}$/;
const maxBuffer = 256 * 1024 * 1024;
const neutralConfig = '[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n\tlogallrefupdates = false\n\tsymlinks = false\n\tautocrlf = false\n[gc]\n\tauto = 0\n[maintenance]\n\tauto = false\n';
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const identity = (info) => ({ dev: info.dev, ino: info.ino, uid: info.uid });
const sameIdentity = (left, right) => left.dev === right.dev && left.ino === right.ino && left.uid === right.uid;
const fail = (message) => { throw new Error(message); };

function present(path) {
  try { lstatSync(path); return true; } catch (cause) {
    if (cause.code === 'ENOENT') return false;
    throw cause;
  }
}

export function assertNormalizedPath(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || normalize(path) !== path || resolve(path) !== path || /[\0\r\n]/.test(path)) {
    fail('CI checkout requires a normalized absolute Linux path without NUL/CR/LF');
  }
  return path;
}

export function assertCheckoutBudget(root) {
  assertNormalizedPath(root);
  const bytes = Buffer.byteLength(root, 'utf8');
  if (bytes > checkoutRootMaxBytes) fail(`CI real checkout root is ${bytes} UTF-8 bytes; maximum is ${checkoutRootMaxBytes}. No fallback or budget override is supported.`);
  return root;
}

function realDirectory(path) {
  assertNormalizedPath(path);
  let current = '/';
  for (const component of path.split('/').filter(Boolean)) {
    current = join(current, component);
    const info = lstatSync(current);
    if (!info.isDirectory() || info.isSymbolicLink()) fail('CI checkout requires real nonsymlink directory components');
  }
  if (realpathSync(path) !== path) fail('CI checkout rejects real-path aliases');
  return lstatSync(path);
}

function supportedParent(parent) {
  if (process.platform !== 'linux' || typeof process.getuid !== 'function' || parent === '/') fail('Unsupported CI checkout parent/platform');
  const info = realDirectory(parent);
  if (info.uid !== process.getuid() || (info.mode & 0o022) !== 0) fail('CI checkout parent must be owned and not group/world writable');
  return info;
}

export function checkoutRelationship(original) {
  assertNormalizedPath(original);
  realDirectory(original);
  const parent = dirname(original);
  supportedParent(parent);
  const root = join(parent, 'c');
  if (root === original) fail('Original checkout cannot be the reserved sibling c');
  return { original, parent, root };
}

export function selectCheckoutRoot(original) {
  const selection = checkoutRelationship(original);
  assertCheckoutBudget(selection.root);
  return selection;
}

function assertAmbientGit(env) {
  const injected = Object.keys(env).filter((key) => /^GIT_(?:DIR$|WORK_TREE$|COMMON_DIR$|OBJECT_DIRECTORY$|ALTERNATE_OBJECT_DIRECTORIES$|INDEX_FILE$|CONFIG|REPLACE_REF_BASE$|SHALLOW_FILE$|NAMESPACE$|EXEC_PATH$|TEMPLATE_DIR$)/.test(key));
  if (injected.length) fail('Ambient Git repository/config routing overrides are unsupported');
}

export function rejectNpmrc(original, selected) {
  // Presence only, including dangling symlinks. Never read potentially credentialed contents.
  for (const root of [original, selected].filter(Boolean)) {
    if (present(join(root, '.npmrc'))) fail('Root .npmrc is unsupported at the original or selected installer lookup location');
  }
}

function regularBytes(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile()) fail('CI source/index input must be a regular nonsymlink file');
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (!sameIdentity(before, after) || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || !sameIdentity(after, lstatSync(path))) fail('CI source changed during inspection');
    return { bytes, info: after };
  } finally { closeSync(fd); }
}

function exclusiveFile(path, bytes, mode = 0o644) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
  try { writeFileSync(fd, bytes); } finally { closeSync(fd); }
  chmodSync(path, mode);
}

function generatedFile(path, bytes) {
  // Only replace Git's freshly generated config/HEAD, never follow a link or
  // truncate a shared inode. This is not an original-metadata copy operation.
  realDirectory(dirname(path));
  const fd = openSync(path, constants.O_WRONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.uid !== process.getuid() || before.nlink !== 1 || !sameIdentity(before, lstatSync(path))) fail('Unsafe generated Git file; retained');
    ftruncateSync(fd, 0);
    writeFileSync(fd, bytes);
    if (!sameIdentity(before, lstatSync(path))) fail('Generated Git file ownership changed; retained');
  } finally { closeSync(fd); }
}

function ownedRecord(state) {
  const { version, original, parent, root, token, parentId, rootId, gitId, tmpdir, pnpmDest, tmpId, pnpmId } = state;
  return { version, original, parent, root, token, parentId, rootId, gitId, tmpdir, pnpmDest, tmpId, pnpmId };
}

function validateState(state) {
  if (!record(state) || state.version !== 1 || !['empty', 'allocating', 'owned', 'ready', 'cleaned'].includes(state.phase)) fail('Malformed CI checkout ownership state');
  if (state.phase === 'empty') {
    if (Object.keys(state).sort().join(',') !== 'phase,version') fail('Malformed empty CI checkout state');
    return;
  }
  const fields = ['version', 'phase', 'original', 'parent', 'root', 'token', 'parentId', 'rootId', 'gitId', 'tmpdir', 'tmpId', 'pnpmDest', 'pnpmId'];
  if (Object.keys(state).some((key) => !fields.includes(key))) fail('Malformed CI checkout state keys');
  for (const key of ['original', 'parent', 'root']) assertNormalizedPath(state[key]);
  if (dirname(state.original) !== state.parent || state.root !== join(state.parent, 'c') || state.original === state.root || typeof state.token !== 'string' || !/^[0-9a-f]{64}$/.test(state.token)) fail('Malformed CI checkout ownership relationship');
  const partialState = ['allocating', 'cleaned'].includes(state.phase);
  for (const key of ['parentId', 'rootId', 'gitId', 'tmpId', 'pnpmId']) {
    if (partialState && !['parentId', 'rootId'].includes(key) && state[key] === undefined) continue;
    if (!record(state[key]) || Object.keys(state[key]).sort().join(',') !== 'dev,ino,uid' || !['dev', 'ino', 'uid'].every((field) => Number.isSafeInteger(state[key][field]) && state[key][field] >= 0)) fail('Malformed CI checkout directory identity');
  }
  for (const [key, id, prefix] of [['tmpdir', 'tmpId', '_tmp'], ['pnpmDest', 'pnpmId', '_tmp-pnpm-']]) {
    if ((state[key] === undefined) !== (state[id] === undefined) || (!partialState && state[key] === undefined)) fail('Malformed CI checkout owned child identity');
    if (state[key] !== undefined && (dirname(assertNormalizedPath(state[key])) !== state.root || !new RegExp(`^${prefix}[A-Za-z0-9]{6}$`).test(basename(state[key])))) fail('Malformed CI checkout owned child');
  }
  if ((state.tmpdir && !state.gitId) || (state.pnpmDest && !state.tmpdir)) fail('Malformed CI checkout allocation order');
}

function assertOwnedDirectories(state) {
  validateState(state);
  const parent = supportedParent(state.parent);
  const root = realDirectory(state.root);
  if (!sameIdentity(parent, state.parentId) || !sameIdentity(root, state.rootId) || root.uid !== process.getuid() || (root.mode & 0o777) !== 0o700) fail('CI checkout parent/root ownership changed; retained');
  const git = realDirectory(join(state.root, '.git'));
  if (!state.gitId || !sameIdentity(git, state.gitId) || git.uid !== process.getuid() || (git.mode & 0o777) !== 0o700) fail('CI checkout .git ownership changed; retained');
}

function readWitness(state) {
  assertOwnedDirectories(state);
  const input = regularBytes(join(state.root, '.git', witnessName));
  if (input.info.uid !== process.getuid() || input.info.nlink !== 1 || (input.info.mode & 0o777) !== 0o600) fail('Invalid CI checkout ownership witness; retained');
  let witness;
  try { witness = JSON.parse(input.bytes); } catch { fail('Malformed CI checkout ownership witness; retained'); }
  if (JSON.stringify(witness) !== JSON.stringify(ownedRecord(state))) fail('CI checkout ownership witness mismatch; retained');
  return witness;
}

// Deep fixture tests call this ownership subroutine, NOT the native-budget selector.
// Production can only reach it after selectCheckoutRoot, with no public override.
export function claimCheckout(selection, save = () => {}) {
  const expected = checkoutRelationship(selection.original);
  if (selection.parent !== expected.parent || selection.root !== expected.root) fail('Invalid CI checkout selection');
  const parentId = identity(supportedParent(selection.parent));
  const state = { version: 1, phase: 'allocating', ...expected, token: randomBytes(32).toString('hex'), parentId };
  // Exclusive mkdir: even a dangling link is a collision. Never reuse/remove it.
  mkdirSync(state.root, { mode: 0o700 });
  state.rootId = identity(lstatSync(state.root));
  try {
    save(state);
    if (!sameIdentity(supportedParent(state.parent), parentId) || !sameIdentity(realDirectory(state.root), state.rootId)) fail('CI checkout allocation identity changed');
    mkdirSync(join(state.root, '.git'), { mode: 0o700 });
    state.gitId = identity(lstatSync(join(state.root, '.git')));
    save(state);
    state.tmpdir = mkdtempSync(join(state.root, '_tmp'));
    state.tmpId = identity(lstatSync(state.tmpdir));
    save(state);
    state.pnpmDest = mkdtempSync(join(state.root, '_tmp-pnpm-'));
    state.pnpmId = identity(lstatSync(state.pnpmDest));
    save(state);
    exclusiveFile(join(state.root, '.git', witnessName), JSON.stringify(ownedRecord(state)) + '\n', 0o600);
    state.phase = 'owned';
    save(state);
    return state;
  } catch (cause) {
    try { cleanupCheckout(state, { partial: true }); } catch (cleanup) { throw new AggregateError([cause, cleanup], 'CI checkout allocation failed; unsafe cleanup retained'); }
    throw cause;
  }
}

export function cleanupCheckout(state, { partial = false } = {}) {
  validateState(state);
  if (['empty', 'cleaned'].includes(state.phase)) return;
  if (partial && state.phase === 'allocating') {
    const root = realDirectory(state.root);
    if (!sameIdentity(supportedParent(state.parent), state.parentId) || !sameIdentity(root, state.rootId) || root.uid !== process.getuid() || (root.mode & 0o777) !== 0o700) fail('Partial CI checkout ownership changed; retained');
    for (const [path, id] of [[state.pnpmDest, state.pnpmId], [state.tmpdir, state.tmpId], [state.gitId ? join(state.root, '.git') : undefined, state.gitId]]) {
      if (path) {
        const info = realDirectory(path);
        if (!sameIdentity(info, id) || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o700) fail('Partial CI checkout child ownership changed; retained');
        rmdirSync(path); // Only newly owned EMPTY directories, never a recursive partial deletion.
      }
    }
    rmdirSync(state.root);
  } else {
    readWitness(state); // Missing/replaced/malformed state or witness never authorizes deletion.
    // Node rm unlinks dependency symlinks without following them. The real parent
    // is job-owned, not an adversarial shared directory; hard termination is V6.
    rmSync(state.root, { recursive: true, force: false, maxRetries: 0 });
  }
  state.phase = 'cleaned';
}

function sterileEnvironment(state, env) {
  return {
    PATH: env.PATH,
    LANG: 'C', LC_ALL: 'C', TZ: 'UTC', TMPDIR: state.tmpdir,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_COUNT: '0', GIT_ATTR_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1',
    GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/bin/false',
    GIT_ALLOW_PROTOCOL: '', GIT_PROTOCOL_FROM_USER: '0',
  };
}

function gitContext(state, env, run) {
  const gitDir = join(state.root, '.git');
  return (args, { source = false, index = false, input } = {}) => {
    if (source && !['cat-file', 'ls-tree', 'ls-files', 'pack-objects'].includes(args[0])) fail('Read-only source Git command violation');
    if (index && (!source || args[0] !== 'ls-files')) fail('Read-only original index violation');
    const environment = sterileEnvironment(state, env);
    if (source) environment.GIT_OBJECT_DIRECTORY = join(state.original, '.git', 'objects');
    if (index) environment.GIT_INDEX_FILE = join(state.original, '.git', 'index');
    const result = run('git', [
      '--no-optional-locks', `--git-dir=${gitDir}`, `--work-tree=${source ? state.original : state.root}`,
      '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
      '-c', 'core.attributesFile=/dev/null', '-c', 'core.excludesFile=/dev/null', '-c', 'protocol.allow=never',
      '-c', 'credential.helper=', ...args,
    ], { cwd: state.root, env: environment, input, maxBuffer });
    if (result.error || result.status !== 0) fail(`Git ${args[0]} failed (${result.error?.message ?? `exit ${result.status ?? 'signal'}`}): ${result.stderr?.toString().trim() ?? ''}`);
    return Buffer.from(result.stdout ?? '');
  };
}

function scanStorage(root) {
  realDirectory(root);
  const files = new Map();
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const info = lstatSync(path);
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) fail('Unsupported symlink/nonregular Git object storage');
      if (name.endsWith('.promisor')) fail('Promisor Git objects are unsupported');
      if (info.isDirectory()) visit(path); else files.set(path, identity(info));
    }
  };
  for (const name of ['alternates', 'http-alternates']) if (present(join(root, 'info', name))) fail('Git object alternates are unsupported');
  visit(root);
  return files;
}

function objectId(type, bytes) {
  return createHash('sha1').update(`${type} ${bytes.length}\0`).update(bytes).digest('hex');
}

export function parseTreeListing(bytes) {
  const entries = [];
  const seen = new Set();
  if (!Buffer.isBuffer(bytes) || (bytes.length && bytes.at(-1) !== 0)) fail('Malformed NUL-delimited Git tree listing');
  for (const raw of bytes.length ? bytes.subarray(0, -1).toString('latin1').split('\0') : []) {
    if (!raw) fail('Malformed NUL-delimited Git tree listing');
    const delimiter = raw.indexOf('\t');
    const header = raw.slice(0, delimiter);
    const match = /^(040000|100644|100755) (tree|blob) ([0-9a-f]{40})$/.exec(header);
    if (delimiter < 0 || !match || (match[1] === '040000') !== (match[2] === 'tree')) fail('Unsupported Git tree mode/type (symlink/gitlink included)');
    let path;
    try { path = decoder.decode(Buffer.from(raw.slice(delimiter + 1), 'latin1')); } catch { fail('Unsupported non-UTF-8 Git source path'); }
    const components = path.split('/');
    if (!path || /[\0\r\n]/.test(path) || isAbsolute(path) || components.some((part) => !part || part === '.' || part === '..' || part.toLowerCase() === '.git') || seen.has(path)) fail('Unsafe/duplicate Git source path');
    if (path === '.npmrc') fail('Committed root .npmrc is unsupported; blob is not read or transferred');
    if (components[0].startsWith('_tmp')) fail('Committed root scratch paths are unsupported');
    seen.add(path);
    entries.push({ mode: match[1], type: match[2], oid: match[3], path });
  }
  for (const entry of entries) {
    for (let parent = dirname(entry.path); parent !== '.'; parent = dirname(parent)) {
      if (!entries.some((value) => value.path === parent && value.type === 'tree')) fail('Malformed Git tree parent relationship');
    }
  }
  return entries;
}

function batchObjects(git, ids, source) {
  const result = git(['cat-file', '--batch'], { source, input: ids.join('\n') + '\n' });
  const objects = new Map();
  let offset = 0;
  for (const oid of ids) {
    const end = result.indexOf(10, offset);
    const match = /^([0-9a-f]{40}) (commit|tree|blob) (0|[1-9][0-9]*)$/.exec(result.subarray(offset, end).toString('latin1'));
    if (end < offset || !match || match[1] !== oid) fail('Missing/malformed selected Git object');
    const size = Number(match[3]);
    if (!Number.isSafeInteger(size) || size > maxBuffer) fail('Unsupported Git object size');
    const bytes = result.subarray(end + 1, end + 1 + size);
    offset = end + size + 2;
    if (bytes.length !== size || result[offset - 1] !== 10 || objectId(match[2], bytes) !== oid) fail('Selected Git object hash/content mismatch');
    objects.set(oid, { type: match[2], bytes });
  }
  if (offset !== result.length) fail('Unexpected Git object batch output');
  return objects;
}

function verifyObjectInventory(git, ids) {
  const inventory = git(['cat-file', '--batch-all-objects', '--batch-check=%(objectname)']).toString('latin1').split('\n');
  if (inventory.pop() !== '' || inventory.some((oid) => !shaPattern.test(oid)) || JSON.stringify(inventory.sort()) !== JSON.stringify(ids)) fail('Imported object inventory is not exactly the selected closure');
}

function verifyIndex(git, entries, source) {
  const expected = entries.filter((entry) => entry.type === 'blob').map(({ mode, oid, path }) => `${mode} ${oid} 0\t${path}`).sort();
  const actual = decoder.decode(git(['ls-files', '--stage', '--full-name', '-z'], { source, index: source })).split('\0').filter(Boolean).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('Original/selected Git index does not exactly match selected stage-zero tree');
  const flags = decoder.decode(git(['ls-files', '-v', '--full-name', '-z'], { source, index: source })).split('\0').filter(Boolean);
  if (flags.length !== expected.length || flags.some((entry) => !entry.startsWith('H '))) fail('Hidden assume-unchanged/skip-worktree index states are unsupported');
}

function verifySource(root, entries, { state, independentFrom } = {}) {
  const expected = new Map(entries.map((entry) => [entry.path, entry]));
  const found = new Set();
  const files = new Map();
  const allowed = state ? new Set([basename(state.tmpdir), basename(state.pnpmDest)]) : new Set();
  const visit = (directory, prefix = '') => {
    for (const name of readdirSync(directory)) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (!prefix && (name === '.git' || allowed.has(name))) continue;
      const entry = expected.get(path);
      if (!entry) fail('Unexpected source entry, including ignored dependencies/cache/generated state');
      const target = join(root, path);
      const info = lstatSync(target);
      if (info.isSymbolicLink()) fail('Symlink source is unsupported');
      found.add(path);
      if (entry.type === 'tree') {
        if (!info.isDirectory()) fail('Expected a real source tree directory');
        visit(target, path);
      } else {
        const input = regularBytes(target);
        const mode = entry.mode === '100755' ? 0o755 : 0o644;
        if ((input.info.mode & 0o777) !== mode || objectId('blob', input.bytes) !== entry.oid) fail('Dirty source bytes/executable mode do not match selected tree');
        if (independentFrom && (input.info.nlink !== 1 || sameIdentity(input.info, independentFrom.get(path)))) fail('Selected source shares hardlinks/inodes');
        files.set(path, identity(input.info));
      }
    }
  };
  visit(root);
  if (found.size !== expected.size) fail('Missing selected source file/tree');
  return files;
}

function materializeFiles(state, entries, objects) {
  for (const entry of entries.filter((value) => value.type === 'tree').sort((a, b) => a.path.split('/').length - b.path.split('/').length)) {
    realDirectory(dirname(join(state.root, entry.path)));
    mkdirSync(join(state.root, entry.path), { mode: 0o755 });
  }
  for (const entry of entries.filter((value) => value.type === 'blob')) {
    realDirectory(dirname(join(state.root, entry.path)));
    exclusiveFile(join(state.root, entry.path), objects.get(entry.oid).bytes, entry.mode === '100755' ? 0o755 : 0o644);
  }
}

// Selected-only source investigation lives in maintained real ignored fixtures.
// Calling this deep subroutine never constitutes full native selector success.
export function transferSelectedSource(state, sha, { env = process.env, run = spawnSync } = {}) {
  if (typeof sha !== 'string' || !shaPattern.test(sha)) fail('Expected the exact lowercase 40-hex event SHA');
  assertAmbientGit(env);
  validateState(state);
  rejectNpmrc(state.original, state.root);
  verifyInstallerState(state);
  realDirectory(join(state.original, '.git'));
  for (const path of ['commondir', 'info/grafts']) if (present(join(state.original, '.git', path))) fail('Linked/grafted original Git repositories are unsupported');
  const head = regularBytes(join(state.original, '.git', 'HEAD'));
  if (!head.bytes.equals(Buffer.from(sha + '\n'))) fail('Original detached HEAD does not match the exact event SHA');
  const index = regularBytes(join(state.original, '.git', 'index'));
  if (!index.bytes.subarray(0, 4).equals(Buffer.from('DIRC'))) fail('Malformed original Git index');
  const storage = scanStorage(join(state.original, '.git', 'objects'));
  const git = gitContext(state, env, run);
  git(['init', '--template=', '--object-format=sha1', state.root]);
  generatedFile(join(state.root, '.git', 'config'), neutralConfig);
  const commit = batchObjects(git, [sha], true).get(sha);
  if (commit.type !== 'commit') fail('Selected event SHA must be a SHA-1 commit');
  const headerEnd = commit.bytes.indexOf('\n\n');
  const treeMatch = /^tree ([0-9a-f]{40})\n/.exec(commit.bytes.subarray(0, headerEnd).toString('latin1'));
  if (headerEnd < 0 || !treeMatch) fail('Malformed selected commit tree');
  const entries = parseTreeListing(git(['ls-tree', '-r', '-t', '-z', '--full-tree', sha], { source: true }));
  for (const pin of ['.gitignore', '.tool-versions', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) if (!entries.some((entry) => entry.path === pin && entry.type === 'blob')) fail('Selected source lacks required committed pin/config files');
  verifyIndex(git, entries, true);
  const originalFiles = verifySource(state.original, entries);
  const ids = [...new Set([sha, treeMatch[1], ...entries.map((entry) => entry.oid)])].sort();
  const objects = batchObjects(git, ids, true);
  for (const entry of entries) if (objects.get(entry.oid).type !== entry.type) fail('Git tree/object type mismatch');
  if (objects.get(treeMatch[1]).type !== 'tree') fail('Selected commit root must be a tree');
  // No --revs, thin pack, object/delta reuse, delta construction or parent traversal.
  const pack = git(['pack-objects', '--stdout', '--no-reuse-object', '--no-reuse-delta', '--window=0', '--depth=0', '--threads=1'], { source: true, input: ids.join('\n') + '\n' });
  exclusiveFile(join(state.root, '.git', 'shallow'), sha + '\n');
  git(['index-pack', '--stdin', '--fsck-objects'], { input: pack });
  generatedFile(join(state.root, '.git', 'HEAD'), sha + '\n');
  // This strict connectivity check is mandatory. Failure stops; never relax it.
  git(['fsck', '--strict', '--full', '--no-reflogs']);
  const imported = batchObjects(git, ids, false);
  for (const oid of ids) if (objects.get(oid).type !== imported.get(oid).type || !objects.get(oid).bytes.equals(imported.get(oid).bytes)) fail('Imported selected object bytes changed');
  verifyObjectInventory(git, ids);
  materializeFiles(state, entries, imported);
  git(['read-tree', sha]);
  verifyIndex(git, entries, false);
  verifySource(state.original, entries);
  verifyIndex(git, entries, true);
  verifySource(state.root, entries, { state, independentFrom: originalFiles });
  if (!regularBytes(join(state.original, '.git', 'HEAD')).bytes.equals(head.bytes) || !regularBytes(join(state.original, '.git', 'index')).bytes.equals(index.bytes)) fail('Original Git HEAD/index changed during source transfer');
  if (!git(['rev-parse', '--show-object-format']).equals(Buffer.from('sha1\n')) || !git(['rev-parse', 'HEAD']).equals(Buffer.from(sha + '\n')) || !regularBytes(join(state.root, '.git', 'HEAD')).bytes.equals(Buffer.from(sha + '\n'))) fail('Selected detached SHA/object format mismatch');
  if (git(['status', '--porcelain=v1', '--untracked-files=all', '-z']).length) fail('Selected source/index is not clean');
  const children = [basename(state.tmpdir), basename(state.pnpmDest)];
  const ignored = decoder.decode(git(['check-ignore', '--no-index', '-z', '--stdin'], { input: children.join('\0') + '\0' })).split('\0').filter(Boolean);
  if (JSON.stringify(ignored) !== JSON.stringify(children)) fail('Committed ignore rules do not cover owned scratch/installer destinations');
  for (const path of ['objects/info/alternates', 'objects/info/http-alternates', 'hooks', 'logs', 'refs/remotes', 'config.worktree']) if (present(join(state.root, '.git', path))) fail('Selected Git contains forbidden copied/shared metadata');
  if (!regularBytes(join(state.root, '.git', 'config')).bytes.equals(Buffer.from(neutralConfig)) || git(['remote']).length) fail('Selected Git configuration is not generated credential-free configuration');
  const destinationStorage = scanStorage(join(state.root, '.git', 'objects'));
  for (const [path, id] of destinationStorage) if (lstatSync(path).nlink !== 1 || [...storage.values()].some((source) => sameIdentity(source, id))) fail('Selected Git objects share hardlinks/inodes');
  if (!regularBytes(join(state.root, '.git', 'shallow')).bytes.equals(Buffer.from(sha + '\n'))) fail('Selected Git shallow boundary is not exactly the selected event SHA');
  verifyObjectInventory(git, ids);
  verifyInstallerState(state);
  return { sha, entries, objectIds: ids };
}

// Real deep fixtures exercise this ownership subroutine independently. The CLI
// always calls the native selector first; there is no installer-budget override.
function verifyPrivateChild(path, id, label) {
  const info = realDirectory(path);
  if (!sameIdentity(info, id) || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o700) fail(`Installer ${label} directory ownership changed`);
}

export function verifyInstallerState(state) {
  readWitness(state);
  rejectNpmrc(state.original, state.root);
  verifyPrivateChild(state.tmpdir, state.tmpId, 'temporary');
  verifyPrivateChild(state.pnpmDest, state.pnpmId, 'pnpm');
  if (readdirSync(state.pnpmDest).length) fail('pnpm destination is not the newly owned empty installer directory');
}

export function checkInstallerBoundary(original, selected) {
  const selection = selectCheckoutRoot(original);
  if (selected !== selection.root || realpathSync(selected) !== selected) fail('Installer command must run in the verified selected checkout');
  rejectNpmrc(original, selected);
  const witness = JSON.parse(regularBytes(join(selected, '.git', witnessName)).bytes);
  const state = { ...witness, phase: 'owned' };
  if (state.original !== original || state.root !== selected) fail('Installer ownership relationship mismatch');
  verifyInstallerState(state);
}

function appendRunnerFile(path, values) {
  assertNormalizedPath(path);
  const fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW);
  try {
    if (!fstatSync(fd).isFile()) fail('Runner command file must be regular');
    writeFileSync(fd, values);
  } finally { closeSync(fd); }
}

export function runMain(env = process.env, { save, output, run = spawnSync } = {}) {
  const saveState = save ?? ((state) => appendRunnerFile(env.GITHUB_STATE, `${stateName}=${JSON.stringify(state)}\n`));
  const emit = output ?? ((outputs) => appendRunnerFile(env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join('')));
  let state = { version: 1, phase: 'empty' };
  saveState(state); // Establish a no-op post state BEFORE ordinary preflight failures.
  try {
    assertAmbientGit(env);
    if (typeof env.GITHUB_SHA !== 'string' || !shaPattern.test(env.GITHUB_SHA)) fail('Expected the exact lowercase 40-hex event SHA');
    rejectNpmrc(assertNormalizedPath(env.GITHUB_WORKSPACE));
    const selection = selectCheckoutRoot(env.GITHUB_WORKSPACE);
    state = claimCheckout(selection, (value) => { state = value; saveState(value); });
    assertCheckoutBudget(realpathSync(state.root));
    if (Buffer.byteLength(state.tmpdir, 'utf8') > checkoutTmpdirMaxBytes) fail('CI checkout temporary child exceeds unchanged 45-byte TMPDIR maximum');
    transferSelectedSource(state, env.GITHUB_SHA, { env, run });
    state.phase = 'ready';
    saveState(state);
    const relativeRoot = relative(state.original, state.root);
    if (relativeRoot !== '../c' || resolve(state.original, relativeRoot) !== state.root) fail('Unsupported selected-relative installer path');
    emit({ root: state.root, 'relative-root': relativeRoot, tmpdir: state.tmpdir, 'pnpm-dest': state.pnpmDest });
    return state;
  } catch (cause) {
    try { cleanupCheckout(state); saveState(state); } catch (cleanup) { throw new AggregateError([cause, cleanup], 'CI checkout failed; unsafe cleanup retained'); }
    throw cause;
  }
}

export function runAction(env = process.env, options = {}) {
  if (env[`STATE_${stateName}`] !== undefined) {
    let state;
    try { state = JSON.parse(env[`STATE_${stateName}`]); } catch { fail('Malformed CI checkout post state; retained'); }
    cleanupCheckout(state);
    return state;
  }
  return runMain(env, options);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length === 3 && process.argv[2] === '--check-install') checkInstallerBoundary(process.env.GITHUB_WORKSPACE, process.cwd());
    else if (process.argv.length === 2) runAction();
    else fail('No public checkout path/budget/action-mode overrides are supported');
  } catch (cause) {
    console.error(cause.message);
    if (cause instanceof AggregateError) for (const failure of cause.errors) console.error(failure.message);
    process.exitCode = 1;
  }
}
