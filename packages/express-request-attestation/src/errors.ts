/**
 * ATT-02 typed errors with fixed section 4.5 codes.
 *
 * The canonical `AttestationError` definition lives in `server-types.ts`
 * (ATT-01 final). This module re-exports it so ATT-02 server code
 * (`body-capture`, `verify`, `middleware`) has a single errors entrypoint
 * without duplicating the fixed code/message table. Responses built from
 * these errors use `{ code, message }` JSON with `Cache-Control: no-store`
 * and never echo raw keys, nonces, signatures, bodies, provider errors, or
 * requested key identifiers. No `WWW-Authenticate` scheme is invented.
 */
export { AttestationError, isAttestationError, toAttestationErrorPayload } from './server-types.js';
export type { AttestationErrorCode } from './server-types.js';
