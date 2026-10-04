/**
 * ATT-05 relative signer-asset router (task sections 4.1/4.6).
 *
 * Server-only: may import Express and Node built-ins. Never imported by the
 * `./signer` browser entry.
 *
 * - `createSignerBundleRouter({ publicOrigin, replayNamespace, keyProvider,
 *   basePath = '/attestation', publicPathPrefix, now, operationTimeoutMs })`
 *   returns a **relative** Express router. It does not mount itself at
 *   `basePath`; the application mounts it (for example
 *   `app.use('/attestation', router)`). `basePath` plus the trusted
 *   `publicPathPrefix` are used solely to publish correct external URLs
 *   (`publicOrigin + publicPathPrefix + basePath + /signer.<hash>.mjs`).
 *   Request headers (`Host`, `Forwarded`, `X-Forwarded-*`) are never used
 *   for URL construction.
 * - Routes: `GET /signer-meta`, `GET /signer.<contenthash>.mjs`,
 *   `GET /runtime.<contenthash>.mjs`. The runtime is the actual built browser
 *   ESM entry from this installed package (see `signer-assets.ts` for CJS/ESM
 *   + release-flattening lookup); the 64-hex content hash identifies exact
 *   immutable bytes. Never serve different content from the same URL.
 * - Key-specific modules import the runtime via relative
 *   `./runtime.<hash>.mjs` and export `signer: RequestSigner` from
 *   `createRequestSigner`. Key bytes use a simple canonical encoded literal;
 *   no XOR/obfuscation is claimed as protection. All generated imports
 *   resolve in a browser without an npm bare-module map.
 * - Metadata is bounded JSON
 *   `{ version: 1, keyId, signerUrl, publicOrigin, replayNamespace }` with
 *   `Cache-Control: no-store`, serving the current active key only. The
 *   current entry must be present and active at `nowMs`; otherwise metadata
 *   fails with `503 ATTESTATION_KEYS_UNAVAILABLE`.
 * - Immutable assets use `Content-Type: text/javascript; charset=utf-8`,
 *   `X-Content-Type-Options: nosniff`, and
 *   `Cache-Control: public, max-age=31536000, immutable`. Unknown hashes
 *   return controlled `404`; syntactically valid but not currently retained
 *   hashes return `410`; neither redirects to latest. CORS/CSP policy is
 *   application-configured: this router sets no `Access-Control-*` headers
 *   and grants no broad credentialed access. Documented host requirements:
 *   serve metadata/modules over the pinned `publicOrigin`, allow
 *   `script-src` for the module URLs, and configure CORS only as the
 *   application requires (same-origin by default; cross-origin deployments
 *   must explicitly allow `GET` metadata/module fetches which use
 *   `cache: no-store`, `credentials: omit`, `redirect: error`).
 * - Asset generation is bounded by the retained snapshot (max 16 keys) plus
 *   fixed runtime (512 KiB) / module (8 KiB) / metadata (4096 byte) caps.
 *   Key modules are derived deterministically per request from the current
 *   snapshot; no unbounded retired-asset cache is kept. Dropping a retired
 *   key's asset is safe because the client performs at most one bounded
 *   discovery refetch on a module-phase retirement race.
 *
 * Runbook: prepare new material on **all** verifiers, publish current
 * metadata/module, retain old material to its explicit deadline, retire only
 * after overlap. Old modules remain usable while their keys are retained.
 * Public asset caching does not make distributed material confidential.
 *
 * No timers, network requests, or storage work at construction. Per-request
 * provider waits are bounded by `operationTimeoutMs` (default 5000 ms);
 * late settlement cannot resume the request.
 */

import { Router } from 'express';
import type { Request, Response, Router as ExpressRouter } from 'express';

import { assertTimestampMs } from './shared/canonical.js';
import { utf8ByteLength } from './shared/canonical.js';
import { validatePublicOrigin, validateReplayNamespace } from './shared/codec.js';
import { AttestationProtocolError, PROTOCOL_VERSION } from './shared/types.js';
import type { CreateSignerBundleRouterOptions } from './server-types.js';
import { AttestationError } from './errors.js';
import { copyAttestationSnapshot } from './verify.js';
import {
  SIGNER_ASSET_METADATA_BYTE_CAP,
  getSignerKeyModuleAsset,
  getSignerRuntimeAsset,
  isContentHash,
} from './signer-assets.js';

const SIGNER_BUNDLE_OPTION_KEYS: ReadonlySet<string> = new Set([
  'publicOrigin',
  'replayNamespace',
  'keyProvider',
  'basePath',
  'publicPathPrefix',
  'now',
  'operationTimeoutMs',
]);

const DEFAULT_SIGNER_BASE_PATH = '/attestation' as const;
const DEFAULT_OPERATION_TIMEOUT_MS = 5000 as const;
const MIN_OPERATION_TIMEOUT_MS = 1 as const;
const MAX_OPERATION_TIMEOUT_MS = 60000 as const;

class SignerBundleOperationTimeoutError extends Error {
  override readonly name = 'SignerBundleOperationTimeoutError';
}

interface ResolvedSignerBundleConfig {
  readonly publicOrigin: string;
  readonly replayNamespace: string;
  readonly keyProvider: NonNullable<CreateSignerBundleRouterOptions['keyProvider']>;
  readonly basePath: string;
  readonly publicPathPrefix: string;
  readonly now: () => number;
  readonly operationTimeoutMs: number;
}

function validateBasePath(value: unknown): string {
  if (value === undefined) {
    return DEFAULT_SIGNER_BASE_PATH;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new AttestationProtocolError('signer bundle basePath must be a non-empty string');
  }
  if (!value.startsWith('/')) {
    throw new AttestationProtocolError('signer bundle basePath must start with /');
  }
  if (value.length > 1 && value.endsWith('/')) {
    throw new AttestationProtocolError('signer bundle basePath must not end with /');
  }
  if (value.includes('?') || value.includes('#') || value.includes('\\')) {
    throw new AttestationProtocolError('signer bundle basePath must not contain query, fragment, or backslashes');
  }
  for (const char of value) {
    const code = char.codePointAt(0) as number;
    if (code <= 0x20 || code === 0x7f) {
      throw new AttestationProtocolError('signer bundle basePath must not contain controls or spaces');
    }
  }
  return value;
}

function validatePublicPathPrefix(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  if (typeof value !== 'string') {
    throw new AttestationProtocolError('signer bundle publicPathPrefix must be a string');
  }
  if (value === '') {
    return '';
  }
  if (!value.startsWith('/')) {
    throw new AttestationProtocolError('signer bundle publicPathPrefix must start with /');
  }
  if (value.endsWith('/')) {
    throw new AttestationProtocolError('signer bundle publicPathPrefix must not end with /');
  }
  if (value.includes('?') || value.includes('#') || value.includes('\\')) {
    throw new AttestationProtocolError(
      'signer bundle publicPathPrefix must not contain query, fragment, or backslashes',
    );
  }
  for (const char of value) {
    const code = char.codePointAt(0) as number;
    if (code <= 0x20 || code === 0x7f) {
      throw new AttestationProtocolError('signer bundle publicPathPrefix must not contain controls or spaces');
    }
  }
  return value;
}

function checkedNow(now: () => number): number {
  let value: number;
  try {
    value = now();
  } catch {
    throw new AttestationError('ATTESTATION_INTERNAL_ERROR');
  }
  try {
    assertTimestampMs('nowMs', value);
  } catch {
    throw new AttestationError('ATTESTATION_INTERNAL_ERROR');
  }
  return value;
}

function withOperationTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new SignerBundleOperationTimeoutError(`operation timed out after ${ms} ms`));
    }, ms);
    const handle = timer as unknown as { readonly unref?: unknown };
    if (typeof handle.unref === 'function') {
      (handle.unref as () => void)();
    }
  });
  const raced = Promise.race([task, timeout]) as Promise<T>;
  return raced.finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

function resolveConfig(options: CreateSignerBundleRouterOptions): ResolvedSignerBundleConfig {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new AttestationProtocolError('signer bundle router options must be an object');
  }
  for (const key of Object.keys(options)) {
    if (!SIGNER_BUNDLE_OPTION_KEYS.has(key)) {
      throw new AttestationProtocolError(`unknown signer bundle router option ${key}`);
    }
  }
  validatePublicOrigin(options.publicOrigin);
  validateReplayNamespace(options.replayNamespace);
  const keyProvider = (options as { readonly keyProvider?: unknown }).keyProvider;
  if (
    keyProvider === null ||
    typeof keyProvider !== 'object' ||
    typeof (keyProvider as { getSnapshot?: unknown }).getSnapshot !== 'function'
  ) {
    throw new AttestationProtocolError('signer bundle router keyProvider must expose getSnapshot()');
  }
  const basePath = validateBasePath(options.basePath);
  const publicPathPrefix = validatePublicPathPrefix(options.publicPathPrefix);
  const now = options.now ?? Date.now;
  if (typeof now !== 'function') {
    throw new AttestationProtocolError('signer bundle router now must be a function');
  }
  const operationTimeoutMs = options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(operationTimeoutMs) ||
    operationTimeoutMs < MIN_OPERATION_TIMEOUT_MS ||
    operationTimeoutMs > MAX_OPERATION_TIMEOUT_MS
  ) {
    throw new AttestationProtocolError(
      `operationTimeoutMs must be a safe integer in [${MIN_OPERATION_TIMEOUT_MS}, ${MAX_OPERATION_TIMEOUT_MS}]`,
    );
  }
  return Object.freeze({
    publicOrigin: options.publicOrigin,
    replayNamespace: options.replayNamespace,
    keyProvider: keyProvider as NonNullable<CreateSignerBundleRouterOptions['keyProvider']>,
    basePath,
    publicPathPrefix,
    now: now as () => number,
    operationTimeoutMs,
  });
}

function sendKeysUnavailable(res: Response): void {
  const error = new AttestationError('ATTESTATION_KEYS_UNAVAILABLE');
  res.set('Cache-Control', 'no-store');
  res.status(error.status).json({ code: error.code, message: error.message });
}

function sendInternalError(res: Response): void {
  const error = new AttestationError('ATTESTATION_INTERNAL_ERROR');
  try {
    res.set('Cache-Control', 'no-store');
  } catch {
    // headers may already be sent; fall through to status attempt
  }
  try {
    res.status(error.status).json({ code: error.code, message: error.message });
  } catch {
    // Express owns further handling once headers are sent.
  }
}

function sendAssetNotFound(res: Response, gone: boolean): void {
  res.set('Cache-Control', 'no-store');
  if (gone) {
    res.status(410).json({
      code: 'ATTESTATION_ASSET_GONE',
      message: 'Signer asset is no longer available.',
    });
  } else {
    res.status(404).json({
      code: 'ATTESTATION_ASSET_NOT_FOUND',
      message: 'Signer asset is not available.',
    });
  }
}

/**
 * Create the relative signer-asset router. The caller mounts it at
 * `basePath` (for example `app.use('/attestation', router)`); this factory
 * never mounts itself. All external URLs are built from trusted
 * configuration (`publicOrigin` + `publicPathPrefix` + `basePath`), never
 * from request headers.
 */
export function createSignerBundleRouter(options: CreateSignerBundleRouterOptions): ExpressRouter {
  const config = resolveConfig(options);
  const router = Router();

  router.get('/signer-meta', (req: Request, res: Response) => {
    void Promise.resolve()
      .then(async () => {
        let nowMs: number;
        try {
          nowMs = checkedNow(config.now);
        } catch (error) {
          if (error instanceof AttestationError) {
            sendInternalError(res);
            return;
          }
          throw error;
        }

        let snapshotRaw: unknown;
        try {
          const pending = config.keyProvider.getSnapshot();
          snapshotRaw = await withOperationTimeout(Promise.resolve(pending), config.operationTimeoutMs);
        } catch {
          sendKeysUnavailable(res);
          return;
        }

        let snapshot: ReturnType<typeof copyAttestationSnapshot>;
        try {
          snapshot = copyAttestationSnapshot(snapshotRaw);
        } catch {
          sendKeysUnavailable(res);
          return;
        }

        const current = snapshot.keys.find((entry) => entry.keyId === snapshot.currentKeyId);
        if (current === undefined) {
          sendKeysUnavailable(res);
          return;
        }
        if (!(current.acceptFrom <= nowMs && nowMs < current.acceptUntil)) {
          sendKeysUnavailable(res);
          return;
        }

        let runtimeFileName: string;
        try {
          const runtime = getSignerRuntimeAsset();
          runtimeFileName = runtime.fileName;
        } catch {
          sendInternalError(res);
          return;
        }

        let keyAsset: ReturnType<typeof getSignerKeyModuleAsset>;
        try {
          keyAsset = getSignerKeyModuleAsset({
            entry: current,
            publicOrigin: config.publicOrigin,
            replayNamespace: config.replayNamespace,
            runtimeFileName,
          });
        } catch {
          sendInternalError(res);
          return;
        }

        const signerUrl = `${config.publicOrigin}${config.publicPathPrefix}${config.basePath}/signer.${keyAsset.contentHash}.mjs`;
        const document = {
          version: PROTOCOL_VERSION,
          keyId: current.keyId,
          signerUrl,
          publicOrigin: config.publicOrigin,
          replayNamespace: config.replayNamespace,
        };
        let body: string;
        try {
          body = JSON.stringify(document);
        } catch {
          sendInternalError(res);
          return;
        }
        if (utf8ByteLength(body) > SIGNER_ASSET_METADATA_BYTE_CAP) {
          sendInternalError(res);
          return;
        }
        res.set('Cache-Control', 'no-store');
        res.set('Content-Type', 'application/json; charset=utf-8');
        res.status(200).send(body);
      })
      .catch(() => {
        try {
          if (!res.headersSent) {
            sendInternalError(res);
          }
        } catch {
          // Express owns further handling.
        }
      });
  });

  router.get('/signer.:contentHash.mjs', (req: Request, res: Response) => {
    void Promise.resolve()
      .then(async () => {
        const params = (req as unknown as { readonly params?: Record<string, unknown> }).params ?? {};
        const requested = params['contentHash'];
        if (typeof requested !== 'string' || requested.length === 0) {
          sendAssetNotFound(res, false);
          return;
        }
        if (!isContentHash(requested)) {
          sendAssetNotFound(res, false);
          return;
        }

        let snapshotRaw: unknown;
        try {
          const pending = config.keyProvider.getSnapshot();
          snapshotRaw = await withOperationTimeout(Promise.resolve(pending), config.operationTimeoutMs);
        } catch {
          sendKeysUnavailable(res);
          return;
        }

        let snapshot: ReturnType<typeof copyAttestationSnapshot>;
        try {
          snapshot = copyAttestationSnapshot(snapshotRaw);
        } catch {
          sendKeysUnavailable(res);
          return;
        }

        let runtimeFileName: string;
        try {
          runtimeFileName = getSignerRuntimeAsset().fileName;
        } catch {
          sendInternalError(res);
          return;
        }

        for (const entry of snapshot.keys) {
          let asset: ReturnType<typeof getSignerKeyModuleAsset>;
          try {
            asset = getSignerKeyModuleAsset({
              entry,
              publicOrigin: config.publicOrigin,
              replayNamespace: config.replayNamespace,
              runtimeFileName,
            });
          } catch {
            continue;
          }
          if (asset.contentHash === requested) {
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
            res.set('Content-Type', 'text/javascript; charset=utf-8');
            res.set('X-Content-Type-Options', 'nosniff');
            res.status(200).send(Buffer.from(asset.bytes));
            return;
          }
        }
        sendAssetNotFound(res, true);
      })
      .catch(() => {
        try {
          if (!res.headersSent) {
            sendInternalError(res);
          }
        } catch {
          // Express owns further handling.
        }
      });
  });

  router.get('/runtime.:contentHash.mjs', (req: Request, res: Response) => {
    try {
      const params = (req as unknown as { readonly params?: Record<string, unknown> }).params ?? {};
      const requested = params['contentHash'];
      if (typeof requested !== 'string' || requested.length === 0) {
        sendAssetNotFound(res, false);
        return;
      }
      if (!isContentHash(requested)) {
        sendAssetNotFound(res, false);
        return;
      }
      let asset: ReturnType<typeof getSignerRuntimeAsset>;
      try {
        asset = getSignerRuntimeAsset();
      } catch {
        sendInternalError(res);
        return;
      }
      if (asset.contentHash !== requested) {
        sendAssetNotFound(res, true);
        return;
      }
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.set('Content-Type', 'text/javascript; charset=utf-8');
      res.set('X-Content-Type-Options', 'nosniff');
      res.status(200).send(Buffer.from(asset.bytes));
    } catch {
      try {
        if (!res.headersSent) {
          sendInternalError(res);
        }
      } catch {
        // Express owns further handling.
      }
    }
  });

  return router;
}
