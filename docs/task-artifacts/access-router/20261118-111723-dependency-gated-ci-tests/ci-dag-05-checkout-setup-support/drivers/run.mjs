import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const scratch = dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const [label, command, ...args] = process.argv.slice(2);
if (!label || !command || !/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid bounded run label');
const directory = mkdtempSync(join(scratch, `${label}-`));
const tmpdir = join(directory, 'tmp');
mkdirSync(tmpdir);
const ignored = spawnSync('git', ['check-ignore', relative(root, directory)], { cwd: root, encoding: 'utf8' });
if (ignored.status !== 0) throw new Error('Run scratch must be ignored');
const watched = ['.github/actions/ci-checkout/action.yml', '.github/actions/ci-checkout/index.mjs',
  'scripts/ci-test-checkout.test.mjs', '.github/workflows/test.yml', '.github/actions/ci-setup/action.yml',
  '.github/actions/ci-prepare/action.yml', '.github/actions/ci-test/action.yml', 'scripts/ci-test-plan.mjs',
  'scripts/ci-test-plan.test.mjs', 'scripts/ci-test-results.test.mjs', 'package.json', 'README.md'];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const inputs = () => Object.fromEntries(watched.map((path) => {
  const bytes = readFileSync(join(root, path));
  return [path, { mode: (lstatSync(join(root, path)).mode & 0o777).toString(8).padStart(4, '0'), bytes: bytes.length, sha256: hash(bytes) }];
}));
const before = inputs();
const startedAt = new Date().toISOString();
const start = performance.now();
const result = spawnSync(command, args, {
  cwd: root,
  env: { ...process.env, TMPDIR: tmpdir },
  encoding: 'utf8',
  maxBuffer: 30 * 1024 * 1024,
});
const sanitize = (value = '') => value.replaceAll(root, '<repo-root>');
const rawStdout = result.stdout ?? '';
const rawStderr = result.stderr ?? '';
const stdout = sanitize(rawStdout);
const stderr = sanitize(rawStderr);
const record = {
  label, command: [command, ...args].map(sanitize), cwd: '<repo-root>',
  tmpdir: relative(root, tmpdir), startedAt, finishedAt: new Date().toISOString(),
  durationMs: Math.round(performance.now() - start), status: result.status,
  signal: result.signal, error: result.error ? sanitize(result.error.message) : null,
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  inputsBefore: before, inputsAfter: inputs(),
  outputProvenance: Object.fromEntries([['stdout', rawStdout, stdout], ['stderr', rawStderr, stderr]].map(([key, original, archived]) =>
    [key, { originalBytes: Buffer.byteLength(original), originalSha256: hash(original), archivedBytes: Buffer.byteLength(archived), archivedSha256: hash(archived), transformation: 'Replace every absolute repository root with <repo-root>; raw logs remain ignored scratch only.' }])),
};
writeFileSync(join(directory, 'stdout.raw.log'), rawStdout);
writeFileSync(join(directory, 'stderr.raw.log'), rawStderr);
writeFileSync(join(directory, 'stdout.log'), stdout);
writeFileSync(join(directory, 'stderr.log'), stderr);
writeFileSync(join(directory, 'result.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ label, command: record.command, status: record.status, durationMs: record.durationMs, directory: relative(root, directory) }, null, 2));
console.log(stdout);
if (stderr) console.error(stderr);
process.exitCode = result.status ?? 1;
