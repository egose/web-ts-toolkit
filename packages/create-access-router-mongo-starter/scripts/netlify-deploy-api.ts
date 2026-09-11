/**
 * CLI-free Netlify deploy orchestration (Task DEPLOY-02).
 *
 * Reimplements the reference `netlify-cli` 26.2.0 algorithm
 * (`dist/utils/deploy/*` — historical reference only, never
 * imported at runtime) in constrained form for this starter's shape:
 * `dist/` statics + a single pre-bundled `<functionsName>.cjs`.
 *
 * Steps: sha1 statics + sha256 zipped function → `createSiteDeploy`
 * (`{ draft: !prod && !alias, branch: alias, title: message }`, mirroring
 * `commands/deploy/deploy.js:419-426`) → diff-wait poll → upload only
 * `required` / `required_functions` (bounded concurrency, retry) → poll to
 * `ready` → derive `{ deployUrl, sslUrl, logsUrl }`.
 *
 * Zip dependency decision (documented per DEPLOY-02 deferred decision #1):
 * `@netlify/zip-it-and-ship-it` (`~850KB` dist + a heavy bundling graph:
 * esbuild/rust tooling for multi-runtime function bundling) is overkill
 * here. The starter's function artifact is already a single pre-bundled
 * `.cjs` file (see `scripts/deploy-shared.ts:722,728`), so no bundling,
 * transpiling, or dependency tracing is needed — only placing one file
 * into a zip. This module therefore builds a single-entry deflate zip with
 * `node:zlib` + an ~80-line writer below: zero new runtime dependencies,
 * `dist/bin/deploy-netlify.js` stays small, and nothing needs adding to
 * `tsup.config.ts` `external`. Netlify (like AWS Lambda) accepts both
 * deflated and stored zip entries; deflate is used as the most standard
 * choice. If the function shape ever grows beyond one pre-bundled file,
 * revisit `@netlify/zip-it-and-ship-it`.
 *
 * No `child_process` spawn, no `netlify-cli` import. Only Node built-ins
 * (`node:crypto`, `node:fs`, `node:path`, `node:zlib`) + `@netlify/api`
 * via the injectable `NetlifyApiClient`.
 *
 * Cancellation on failure is intentionally NOT done here — DEPLOY-03's
 * wiring layer owns `cancelSiteDeploy` (best effort after deploy creation).
 */

import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { readdir as fsReaddir, readFile as fsReadFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { getClient, type NetlifyApiClient, type NetlifyDeployObject } from './netlify-api';

// ---------------------------------------------------------------------------
// Constants (CLI parity: constants.js — DEFAULT_CONCURRENT_UPLOAD=5,
// DEPLOY_POLL=1000, DEFAULT_DEPLOY_TIMEOUT=1_200_000)
// ---------------------------------------------------------------------------

export const API_DEPLOY_CONCURRENCY = 5;
export const API_DEPLOY_MAX_RETRIES = 3;
export const API_DEPLOY_POLL_MS = 1000;
export const API_DEPLOY_TIMEOUT_MS = 1_200_000;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 10_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiDeployLog {
  (message?: string): void;
}

export interface ApiDeployDeps {
  readdir?: (dir: string) => Promise<Dirent[]>;
  readFile?: (path: string) => Promise<Buffer>;
  /** Zip a single function file. Defaults to the built-in deflate writer. */
  zipFunction?: (entryName: string, data: Buffer) => Buffer;
  sleep?: (ms: number) => Promise<void>;
  /** Clock seam for deterministic timeout tests. Defaults to `Date.now`. */
  now?: () => number;
}

export interface PerformApiDeployOptions {
  authToken: string;
  siteId: string;
  distAbs: string;
  functionsAbs: string;
  functionsName: string;
  prod: boolean;
  alias?: string;
  message?: string;
  dryRun: boolean;
  log?: ApiDeployLog;
  client?: NetlifyApiClient;
  deps?: ApiDeployDeps;
  concurrency?: number;
  maxRetries?: number;
  pollIntervalMs?: number;
  diffTimeoutMs?: number;
  deployTimeoutMs?: number;
}

export interface ApiDeployUrls {
  deployUrl?: string;
  sslUrl?: string;
  logsUrl?: string;
  deployId?: string;
}

interface FileManifestEntry {
  relPath: string;
  data: Buffer;
}

interface ResolvedDeps {
  readdir: (dir: string) => Promise<Dirent[]>;
  readFile: (path: string) => Promise<Buffer>;
  zipFunction: (entryName: string, data: Buffer) => Buffer;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

function resolveDeps(deps?: ApiDeployDeps): ResolvedDeps {
  return {
    readdir: deps?.readdir ?? ((dir: string) => fsReaddir(dir, { withFileTypes: true })),
    readFile: deps?.readFile ?? ((path: string) => fsReadFile(path)),
    zipFunction: deps?.zipFunction ?? createSingleFileZip,
    sleep: deps?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms))),
    now: deps?.now ?? Date.now,
  };
}

// ---------------------------------------------------------------------------
// Minimal single-entry deflate zip writer (zero dependencies)
// ---------------------------------------------------------------------------

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Build a minimal single-entry zip (deflate, fixed DOS timestamp for
 * deterministic output) without any dependency.
 */
export function createSingleFileZip(entryName: string, data: Buffer): Buffer {
  const name = Buffer.from(entryName, 'utf8');
  const compressed = deflateRawSync(data);
  const crc = crc32(data);
  // Fixed timestamp (2020-01-02 00:00:00) keeps dry-run hashes stable.
  const dosTime = 0;
  const dosDate = ((2020 - 1980) << 9) | (1 << 5) | 2;

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename
  localHeader.writeUInt16LE(8, 8); // deflate
  localHeader.writeUInt16LE(dosTime, 10);
  localHeader.writeUInt16LE(dosDate, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(name.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0x0800, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt16LE(dosTime, 12);
  centralHeader.writeUInt16LE(dosDate, 14);
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(data.length, 24);
  centralHeader.writeUInt16LE(name.length, 28);
  centralHeader.writeUInt32LE(0, 32); // extra + comment + disk fields are zero
  centralHeader.writeUInt16LE(0, 38);
  centralHeader.writeUInt16LE(0, 40);
  centralHeader.writeUInt32LE(0, 42);
  const localHeaderOffset = 0;
  centralHeader.writeUInt32LE(localHeaderOffset, 42);

  const centralDirOffset = localHeader.length + name.length + compressed.length;
  const centralDirSize = centralHeader.length + name.length;
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(1, 8);
  endRecord.writeUInt16LE(1, 10);
  endRecord.writeUInt32LE(centralDirSize, 12);
  endRecord.writeUInt32LE(centralDirOffset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([localHeader, name, compressed, centralHeader, name, endRecord]);
}

// ---------------------------------------------------------------------------
// Manifest building
// ---------------------------------------------------------------------------

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Recursively walk `distAbs`, returning unix-normalized relative paths.
 * Mirrors CLI `util.js` `normalizePath`: `#`/`?` filenames are rejected.
 * Symlinks are skipped to avoid cycles.
 */
export async function collectStaticFiles(
  distAbs: string,
  readdir: (dir: string) => Promise<Dirent[]>,
): Promise<Array<{ relPath: string; absPath: string }>> {
  const out: Array<{ relPath: string; absPath: string }> = [];
  const walk = async (dir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await readdir(dir);
    } catch (err) {
      throw new Error(`Cannot read frontend artifact directory "${distAbs}": ${errorMessage(err)}`, { cause: err });
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absPath);
      } else if (entry.isFile()) {
        const relPath = relative(distAbs, absPath).split(sep).join('/');
        if (relPath.includes('#') || relPath.includes('?')) {
          throw new Error(`Invalid filename ${relPath}. Deployed filenames cannot contain # or ? characters`);
        }
        out.push({ relPath, absPath });
      }
    }
  };
  await walk(distAbs);
  out.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  return out;
}

function sha1Hex(data: Buffer): string {
  return createHash('sha1').update(data).digest('hex');
}

function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

// ---------------------------------------------------------------------------
// Upload + poll helpers
// ---------------------------------------------------------------------------

function isRetryableUploadError(err: unknown): boolean {
  const e = err as { status?: unknown; name?: unknown };
  // CLI parity (upload-files.js retryUpload): retry status > 400
  // (observed: 408, 401, 502) and FetchError; never 400/422 or plain errors.
  if (e?.name === 'FetchError') return true;
  return typeof e?.status === 'number' && (e.status as number) > 400;
}

async function uploadWithRetry(
  fn: () => Promise<unknown>,
  maxRetries: number,
  sleep: (ms: number) => Promise<void>,
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries || !isRetryableUploadError(err)) throw err;
      const delay = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
      await sleep(delay);
    }
  }
}

/** Run `fn` over `items` with bounded concurrency, preserving order. */
async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function pollDeployState(options: {
  client: NetlifyApiClient;
  siteId: string;
  deployId: string;
  doneStates: string[];
  timeoutMs: number;
  intervalMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  phase: string;
}): Promise<NetlifyDeployObject> {
  const { client, siteId, deployId, doneStates, timeoutMs, intervalMs, sleep, now, phase } = options;
  const start = now();
  for (;;) {
    const deploy = await client.getSiteDeploy({ siteId, deployId });
    if (deploy.state === 'error') {
      throw new Error(deploy.error_message || `Deploy ${deployId} had an error`);
    }
    if (deploy.state && doneStates.includes(deploy.state)) return deploy;
    if (now() - start >= timeoutMs) {
      throw new Error(`Timeout while waiting for deploy ${deployId} (${phase})`);
    }
    await sleep(intervalMs);
  }
}

function requiredFunctionShas(value: NetlifyDeployObject['required_functions']): string[] {
  if (!Array.isArray(value)) return [];
  const shas: string[] = [];
  for (const entry of value) {
    const sha = typeof entry === 'string' ? entry : entry?.sha;
    if (typeof sha === 'string' && sha.length > 0) shas.push(sha);
  }
  return shas;
}

function deriveUrls(deploy: NetlifyDeployObject): Pick<ApiDeployUrls, 'deployUrl' | 'sslUrl' | 'logsUrl'> {
  const deployUrl = deploy.deploy_ssl_url ?? deploy.deploy_url;
  const sslUrl = deploy.ssl_url ?? deploy.url;
  const id = deploy.id ?? deploy.deploy_id;
  const logsUrl = deploy.admin_url && id ? `${deploy.admin_url}/deploys/${id}` : (deploy.logs ?? deploy.links?.logs);
  return { deployUrl, sslUrl, logsUrl };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function performApiDeploy(options: PerformApiDeployOptions): Promise<ApiDeployUrls> {
  const {
    authToken,
    siteId,
    distAbs,
    functionsAbs,
    functionsName,
    prod,
    alias,
    message,
    dryRun,
    log = (): void => {},
    concurrency = API_DEPLOY_CONCURRENCY,
    maxRetries = API_DEPLOY_MAX_RETRIES,
    pollIntervalMs = API_DEPLOY_POLL_MS,
    diffTimeoutMs = API_DEPLOY_TIMEOUT_MS,
    deployTimeoutMs = API_DEPLOY_TIMEOUT_MS,
  } = options;
  const deps = resolveDeps(options.deps);

  // --- Statics: recursive walk, sha1 hex, unix-normalized rel paths ---
  const staticFiles = await collectStaticFiles(distAbs, deps.readdir);
  const fileEntries: FileManifestEntry[] = [];
  for (const file of staticFiles) {
    let data: Buffer;
    try {
      data = await deps.readFile(file.absPath);
    } catch (err) {
      throw new Error(`Cannot read frontend artifact "${file.absPath}": ${errorMessage(err)}`, { cause: err });
    }
    fileEntries.push({ relPath: file.relPath, data });
  }
  const files: Record<string, string> = {};
  const filesShaMap = new Map<string, FileManifestEntry[]>();
  for (const entry of fileEntries) {
    const sha = sha1Hex(entry.data);
    files[entry.relPath] = sha;
    const bucket = filesShaMap.get(sha);
    if (bucket) bucket.push(entry);
    else filesShaMap.set(sha, [entry]);
  }

  // --- Function: zip the single pre-bundled .cjs, sha256 hex ---
  const functionPath = join(functionsAbs, `${functionsName}.cjs`);
  let functionData: Buffer;
  try {
    functionData = await deps.readFile(functionPath);
  } catch (err) {
    throw new Error(`Cannot read serverless function artifact "${functionPath}": ${errorMessage(err)}`, { cause: err });
  }
  const functionZip = deps.zipFunction(`${functionsName}.cjs`, functionData);
  const functionSha = sha256Hex(functionZip);
  const functions: Record<string, string> = { [functionsName]: functionSha };
  const fnShaMap = new Map<string, Buffer>([[functionSha, functionZip]]);

  if (Object.keys(files).length === 0 && Object.keys(functions).length === 0) {
    throw new Error('No files or functions to deploy');
  }

  // --- Dry run: compute + log, zero API calls ---
  if (dryRun) {
    log(`[dry-run] Static files: ${fileEntries.length}`);
    for (const entry of fileEntries) {
      log(`[dry-run]   ${entry.relPath} sha1:${files[entry.relPath]}`);
    }
    log(`[dry-run] Functions: 1 (${functionsName} sha256:${functionSha})`);
    const draft = !prod && !alias;
    log(`[dry-run] createSiteDeploy draft:${draft}${alias ? ` branch:${alias}` : ''}`);
    return {};
  }

  const client = options.client ?? (await getClient(authToken));

  // --- Create deploy (CLI parity: draft + branch: alias + title) ---
  const draft = !prod && !alias;
  log(`Creating deploy for site ${siteId} (draft:${draft}${alias ? ` branch:${alias}` : ''})…`);
  let deploy = await client.createSiteDeploy({
    siteId,
    title: message,
    body: { files, functions, draft, branch: alias },
  });
  const deployId = deploy.id ?? deploy.deploy_id;
  if (!deployId) throw new Error('Netlify API created a deploy without an id.');

  // --- Diff wait: only when the create response is async/diff-pending ---
  if (!Array.isArray(deploy.required)) {
    log('Waiting for CDN diff…');
    deploy = await pollDeployState({
      client,
      siteId,
      deployId,
      doneStates: ['prepared', 'uploading', 'uploaded', 'ready'],
      timeoutMs: diffTimeoutMs,
      intervalMs: pollIntervalMs,
      sleep: deps.sleep,
      now: deps.now,
      phase: 'diff',
    });
  }
  const requiredFiles = Array.isArray(deploy.required) ? deploy.required : [];
  const requiredFnShas = requiredFunctionShas(deploy.required_functions);
  log(`CDN requesting ${requiredFiles.length} files and ${requiredFnShas.length} functions`);

  // --- Upload only what the CDN requires ---
  const fileUploads: Array<{ relPath: string; data: Buffer }> = [];
  for (const sha of requiredFiles) {
    const bucket = filesShaMap.get(sha);
    if (!bucket || bucket.length === 0) {
      throw new Error(`Deploy ${deployId} requires unknown file sha ${sha}.`);
    }
    for (const entry of bucket) fileUploads.push(entry);
  }
  const functionUploads: Buffer[] = [];
  for (const sha of requiredFnShas) {
    const data = fnShaMap.get(sha);
    if (!data) throw new Error(`Deploy ${deployId} requires unknown function sha ${sha}.`);
    functionUploads.push(data);
  }

  await mapConcurrent(fileUploads, concurrency, (entry) =>
    uploadWithRetry(
      () => client.uploadDeployFile({ deployId, path: encodeURI(entry.relPath), body: entry.data }),
      maxRetries,
      deps.sleep,
    ),
  );
  await mapConcurrent(functionUploads, concurrency, (data) =>
    uploadWithRetry(
      () => client.uploadDeployFunction({ deployId, name: encodeURI(functionsName), body: data }),
      maxRetries,
      deps.sleep,
    ),
  );

  // --- Wait until ready ---
  log('Waiting for deploy to go live…');
  const finalDeploy = await pollDeployState({
    client,
    siteId,
    deployId,
    doneStates: ['ready'],
    timeoutMs: deployTimeoutMs,
    intervalMs: pollIntervalMs,
    sleep: deps.sleep,
    now: deps.now,
    phase: 'deploy',
  });

  const urls = deriveUrls(finalDeploy);
  // NOTE (DEPLOY-03): the final user-facing `Deploy URL:` / `Logs:` lines
  // are logged by the `runDeploy` wiring layer (which also owns the deploy
  // mutation), so this module stays quiet here to avoid double-logging.
  return { ...urls, deployId };
}
