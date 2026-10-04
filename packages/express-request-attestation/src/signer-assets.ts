/**
 * ATT-05 immutable ESM signer assets (task sections 4.1/4.6).
 *
 * Server-only: may import Node built-ins (`node:*`). Never imported by the
 * `./signer` browser entry.
 *
 * - Runtime assets use the actual built browser ESM entry from this installed
 *   package (`dist/signer.mjs` sibling to the built server entry). Path lookup
 *   works from both CJS (`dist/index.js` via `__dirname`/`__filename`) and ESM
 *   (`dist/index.mjs` via `import.meta.url`) roots and after release
 *   flattening (installed tarball keeps `dist/` siblings). No source-checkout
 *   path, assumed repository root, or runtime `tsup` dependency. During
 *   development/tests running from `src/` the lookup also probes
 *   `../dist/signer.mjs` relative to the current file.
 * - The complete runtime bytes are hashed with SHA-256 (64 lowercase hex);
 *   the hash identifies exact immutable bytes. Never serve different
 *   key/runtime content from the same URL. Runtime bytes are cached after the
 *   first bounded load; the cache holds one entry (the current build).
 * - Each bounded key-specific module imports that runtime via a relative
 *   `./runtime.<hash>.mjs` specifier and exports `signer: RequestSigner`
 *   from `createRequestSigner`. Key bytes are embedded with a simple
 *   canonical encoded literal (`new Uint8Array([...])` with
 *   `JSON.stringify` array encoding). Stronger obfuscation/XOR is not used
 *   and cannot be claimed as protection. Generated literals/URLs use safe
 *   serializers (`JSON.stringify`), never string concatenation with arbitrary
 *   request data. The single relative import resolves in a browser without an
 *   npm bare-module map.
 * - Caps: runtime 512 KiB, key-specific module 8 KiB, discovery metadata
 *   4096 bytes (same as the client bound). Bounds are enforced before
 *   allocation/hashing of oversized inputs where feasible.
 *
 * No import-time network requests, timers, or storage access beyond the
 * lazy bounded runtime load (`sideEffects: false` still holds: the load
 * happens on first asset use, not at import).
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { utf8ByteLength, utf8Encode } from './shared/canonical.js';
import { AttestationProtocolError } from './shared/types.js';
import type { AttestationKeyEntry } from './server-types.js';

/** Runtime (`signer.mjs`) cap: 512 KiB (section 4.6). */
export const SIGNER_RUNTIME_BYTE_CAP = 524288 as const;

/** Key-specific module cap: 8 KiB (section 4.6). */
export const SIGNER_KEY_MODULE_BYTE_CAP = 8192 as const;

/** Discovery metadata cap: 4096 bytes (matches client bound). */
export const SIGNER_ASSET_METADATA_BYTE_CAP = 4096 as const;

/** 64 lowercase hex content hashes (`SHA-256`). */
const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function isContentHash(value: unknown): value is string {
  return typeof value === 'string' && CONTENT_HASH_PATTERN.test(value);
}

/** SHA-256 hex of exact bytes. */
export function sha256Hex(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array)) {
    throw new AttestationProtocolError('content hash input must be a Uint8Array');
  }
  return createHash('sha256').update(bytes).digest('hex');
}

function dirFromStack(): string | null {
  // File-location lookup that works from both CJS (`dist/index.js`) and ESM
  // (`dist/index.mjs`) bundled roots plus `src/` dev/test without using
  // `import.meta` syntax (which `tsc` with `module: NodeNext` forbids in
  // files that may build to CJS). The bundled frame points at the running
  // `dist/index.*` file, so its directory is the sibling of `signer.mjs`.
  try {
    const stack = (new Error() as { readonly stack?: unknown }).stack;
    if (typeof stack !== 'string') {
      return null;
    }
    for (const line of stack.split('\n')) {
      const fileUrlMatch = /(file:\/\/[^\s:)]+)/.exec(line);
      if (fileUrlMatch?.[1] !== undefined) {
        try {
          const filePath = fileURLToPath(new URL(fileUrlMatch[1]));
          if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
            return path.dirname(filePath);
          }
        } catch {
          continue;
        }
      }
      const pathMatch =
        /\((\/[^():]+\.m?[jt]s):\d+:\d+\)/.exec(line) ?? /at\s+(\/[^():\s]+\.m?[jt]s):\d+:\d+/.exec(line);
      if (pathMatch?.[1] !== undefined) {
        return path.dirname(pathMatch[1]);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function currentFileCandidates(): string[] {
  const candidates: string[] = [];

  // Stack-derived directory (works in CJS and ESM bundled output).
  const stackDir = dirFromStack();
  if (stackDir !== null) {
    candidates.push(path.join(stackDir, 'signer.mjs'));
    candidates.push(path.join(stackDir, '..', 'dist', 'signer.mjs'));
    candidates.push(path.join(stackDir, 'dist', 'signer.mjs'));
  }

  // CJS root (`dist/index.js`): `__dirname` / `__filename` are defined.
  // Guarded by `typeof` so ESM output (where they are undefined) is safe.
  try {
    const dirname = (globalThis as unknown as { readonly __dirname?: unknown }).__dirname;
    if (typeof dirname === 'string' && dirname.length > 0) {
      candidates.push(path.join(dirname, 'signer.mjs'));
      candidates.push(path.join(dirname, '..', 'dist', 'signer.mjs'));
    }
  } catch {
    // ignore
  }
  try {
    const filename = (globalThis as unknown as { readonly __filename?: unknown }).__filename;
    if (typeof filename === 'string' && filename.length > 0) {
      candidates.push(path.join(path.dirname(filename), 'signer.mjs'));
      candidates.push(path.join(path.dirname(filename), '..', 'dist', 'signer.mjs'));
    }
  } catch {
    // ignore
  }

  return candidates;
}

let cachedRuntimeBytes: Uint8Array | null = null;
let cachedRuntimeHash: string | null = null;

/**
 * Load the exact built browser runtime bytes (`dist/signer.mjs` sibling).
 * Probes CJS/ESM/src candidates in order, enforces the 512 KiB cap, and
 * caches the bounded bytes. Never resolves through a source-checkout root
 * or a bundler at runtime.
 */
export function loadSignerRuntimeBytes(): Uint8Array {
  if (cachedRuntimeBytes !== null) {
    return new Uint8Array(cachedRuntimeBytes);
  }
  const candidates = currentFileCandidates();
  for (const candidate of candidates) {
    try {
      const read = readFileSync(candidate);
      if (read.length === 0 || read.length > SIGNER_RUNTIME_BYTE_CAP) {
        throw new AttestationProtocolError(`signer runtime exceeds the ${SIGNER_RUNTIME_BYTE_CAP}-byte cap`);
      }
      const bytes = new Uint8Array(read.buffer.slice(read.byteOffset, read.byteOffset + read.byteLength));
      cachedRuntimeBytes = bytes;
      cachedRuntimeHash = sha256Hex(bytes);
      return new Uint8Array(bytes);
    } catch (error) {
      const code = (error as { readonly code?: unknown }).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        continue;
      }
      if (error instanceof AttestationProtocolError) {
        throw error;
      }
      continue;
    }
  }
  throw new AttestationProtocolError(
    `signer runtime (dist/signer.mjs sibling) could not be located${
      candidates.length > 0 ? ` (tried ${candidates.length} candidate path(s))` : ''
    }. Build the package before serving signer assets.`,
  );
}

/** Runtime asset: bounded bytes plus content hash and file name. */
export interface SignerRuntimeAsset {
  readonly bytes: Uint8Array;
  readonly contentHash: string;
  readonly fileName: string;
}

/** Get (and cache) the runtime asset. */
export function getSignerRuntimeAsset(): SignerRuntimeAsset {
  const bytes = loadSignerRuntimeBytes();
  const contentHash = cachedRuntimeHash ?? sha256Hex(bytes);
  if (cachedRuntimeHash === null) {
    cachedRuntimeHash = contentHash;
  }
  return {
    bytes,
    contentHash,
    fileName: `runtime.${contentHash}.mjs`,
  };
}

/** Key-module asset: bounded bytes plus content hash and file name. */
export interface SignerKeyModuleAsset {
  readonly bytes: Uint8Array;
  readonly contentHash: string;
  readonly fileName: string;
}

/**
 * Build the deterministic key-specific ESM source. All embedded values use
 * safe serializers (`JSON.stringify`); no request data is embedded. The
 * runtime specifier is a relative `./runtime.<hash>.mjs` reference so the
 * module resolves in a browser without an npm bare-module map.
 */
export function buildSignerKeyModuleSource(input: {
  readonly keyId: string;
  readonly key: Uint8Array;
  readonly publicOrigin: string;
  readonly replayNamespace: string;
  readonly runtimeFileName: string;
}): string {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new AttestationProtocolError('signer key module input must be an object');
  }
  const { keyId, key, publicOrigin, replayNamespace, runtimeFileName } = input;
  if (typeof keyId !== 'string' || typeof publicOrigin !== 'string' || typeof replayNamespace !== 'string') {
    throw new AttestationProtocolError('signer key module fields must be strings');
  }
  if (!(key instanceof Uint8Array) || key.length !== 32) {
    throw new AttestationProtocolError('signer key module key must be 32 bytes');
  }
  if (typeof runtimeFileName !== 'string' || runtimeFileName.length === 0) {
    throw new AttestationProtocolError('signer key module runtime file name must be a non-empty string');
  }
  if (runtimeFileName.includes('\0') || runtimeFileName.includes('\\')) {
    throw new AttestationProtocolError('signer key module runtime file name is invalid');
  }
  // Safe serializers only: every embedded string goes through JSON.stringify
  // (key bytes as a JSON number array). No template concatenation of
  // unescaped values.
  const runtimeSpecifier = `./${runtimeFileName}`;
  const lines = [
    `import { createRequestSigner } from ${JSON.stringify(runtimeSpecifier)};`,
    `const __attestationKeyBytes = new Uint8Array(${JSON.stringify(Array.from(key))});`,
    `export const signer = createRequestSigner({`,
    `  keyId: ${JSON.stringify(keyId)},`,
    `  key: __attestationKeyBytes,`,
    `  publicOrigin: ${JSON.stringify(publicOrigin)},`,
    `  replayNamespace: ${JSON.stringify(replayNamespace)},`,
    `});`,
    ``,
  ];
  return lines.join('\n');
}

/**
 * Build the bounded key-specific module bytes for one retained entry. The
 * runtime file name already contains the runtime content hash, so the key
 * hash covers the complete bytes including the runtime reference.
 */
export function buildSignerKeyModuleBytes(input: {
  readonly entry: AttestationKeyEntry;
  readonly publicOrigin: string;
  readonly replayNamespace: string;
  readonly runtimeFileName: string;
}): Uint8Array {
  const source = buildSignerKeyModuleSource({
    keyId: input.entry.keyId,
    key: input.entry.key,
    publicOrigin: input.publicOrigin,
    replayNamespace: input.replayNamespace,
    runtimeFileName: input.runtimeFileName,
  });
  if (utf8ByteLength(source) > SIGNER_KEY_MODULE_BYTE_CAP) {
    throw new AttestationProtocolError(`signer key module exceeds the ${SIGNER_KEY_MODULE_BYTE_CAP}-byte cap`);
  }
  return utf8Encode(source);
}

/** Derive the key-module asset for one entry (deterministic, bounded). */
export function getSignerKeyModuleAsset(input: {
  readonly entry: AttestationKeyEntry;
  readonly publicOrigin: string;
  readonly replayNamespace: string;
  readonly runtimeFileName: string;
}): SignerKeyModuleAsset {
  const bytes = buildSignerKeyModuleBytes(input);
  const contentHash = sha256Hex(bytes);
  return {
    bytes,
    contentHash,
    fileName: `signer.${contentHash}.mjs`,
  };
}
