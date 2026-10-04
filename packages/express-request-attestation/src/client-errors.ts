/**
 * ATT-06 typed browser client failures (task sections 4.1/4.6).
 *
 * Browser-safe ONLY: no Node built-ins, Express/Redis types, `Buffer`,
 * `NodeJS`, or `node:*` imports. This module is part of the `./signer`
 * closure typechecked by `tsconfig.signer-browser.json` (`types: []`).
 *
 * These are LOCAL preparation/loading errors. Server rejections arrive as
 * HTTP responses with section 4.5 codes; only a pre-handler stale-key marker
 * plus 403 triggers one reload/re-sign retry (ATT-07). Public HMAC material
 * delivered in JavaScript remains accessible to every caller despite
 * non-extractable `CryptoKey` wrapping; this error taxonomy does not imply
 * device or browser authenticity.
 *
 * No storage API, DOM mutation, global network patch, import-time requests,
 * or polling timers. Importing this module has no side effects
 * (`sideEffects: false`).
 */

/** Typed client preparation/load failure codes. */
export type SignerClientErrorCode =
  | 'SIGNER_LOAD_FAILED'
  | 'SIGNER_LOAD_TIMEOUT'
  | 'SIGNER_MODULE_INVALID'
  | 'SIGNER_ORIGIN_MISMATCH'
  | 'SIGNER_PREPARATION_FAILED';

/**
 * Typed client-side failure. Messages are actionable and never echo raw key
 * bytes, nonces, MACs, request bodies, or provider diagnostics. Key IDs,
 * origins, and namespaces in messages are public configuration/discovery
 * values, never secrets.
 */
export class SignerClientError extends Error {
  override readonly name = 'SignerClientError';
  readonly code: SignerClientErrorCode;

  constructor(code: SignerClientErrorCode, message: string, options?: { readonly cause?: unknown }) {
    super(`[express-request-attestation] ${message}`);
    this.code = code;
    if (options?.cause !== undefined) {
      (this as unknown as { cause: unknown }).cause = options.cause;
    }
  }
}

/** Type guard for `SignerClientError`. */
export function isSignerClientError(error: unknown): error is SignerClientError {
  return error instanceof SignerClientError;
}
