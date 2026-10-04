import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { isCanonicalDpopJkt } from './device-binding-policy';
import type { OidcVaultDpopNonceOptions } from './types';

const NONCE_VERSION = 'v1';
const HMAC_DOMAIN = '@web-ts-toolkit/express-oidc-vault/dpop-nonce/v1\0';
export const DPOP_NONCE_MAX_BYTES = 512;

export interface DpopNoncePolicy {
  /** Shape validation only: the enclosing verifier must authenticate this key before issuing a challenge. */
  issue(jkt: string, now: number): string;
  /** Stateless authenticity/expiry check, not proof authentication or a replay reservation. */
  verify(nonce: unknown, jkt: string, now: number): boolean;
}

const isEpochMs = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const decodeBase64url = (value: string, byteLength?: number): Buffer | null => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value || (byteLength !== undefined && bytes.length !== byteLength)) return null;
  return bytes;
};

/**
 * Internal, stateless D7 challenge signer. `namespace` is the canonical JSON of
 * the effective protection-space tuple, not a request URL, token or session ID.
 * Only its SHA-256 digest enters a nonce, so URL/configuration length cannot
 * enlarge the wire value. The secret is copied and never returned.
 *
 * Wire format: v1.base64url(JSON([random128, issuedAtMs, expiresAtMs,
 * namespaceDigest, jkt])).base64url(domain-separated HMAC-SHA-256).
 * Any authentic live issued nonce is accepted; there is no latest-value,
 * single-use, previous-secret list or per-client allocation. Call `issue` only
 * for otherwise valid proof challenges. Proof iat and JTI replay checks remain
 * mandatory in the enclosing policy, including when a live nonce is supplied.
 */
export const createDpopNoncePolicy = (
  options: Readonly<OidcVaultDpopNonceOptions> & { readonly namespace: string },
): DpopNoncePolicy => {
  const { secret: configuredSecret, lifetimeSeconds: configuredLifetime, namespace } = options;
  if (!(configuredSecret instanceof Uint8Array) || configuredSecret.byteLength < 32) {
    throw new TypeError('DPoP nonce secret must be a Uint8Array of at least 32 bytes.');
  }
  const lifetimeSeconds = configuredLifetime === undefined ? 60 : configuredLifetime;
  if (!Number.isInteger(lifetimeSeconds) || lifetimeSeconds < 1 || lifetimeSeconds > 300) {
    throw new TypeError('DPoP nonce lifetime must be an integer from 1 through 300 seconds.');
  }
  if (typeof namespace !== 'string' || namespace.length === 0) {
    throw new TypeError('DPoP nonce requires a resolved protection-space namespace.');
  }
  const secret = Uint8Array.from(configuredSecret);
  const namespaceDigest = createHash('sha256').update(namespace, 'utf8').digest('base64url');
  const lifetimeMs = lifetimeSeconds * 1000;
  const sign = (encodedPayload: string): Buffer =>
    createHmac('sha256', secret)
      .update(HMAC_DOMAIN, 'utf8')
      .update(`${NONCE_VERSION}.${encodedPayload}`, 'ascii')
      .digest();

  return Object.freeze({
    issue(jkt: string, now: number): string {
      const expiresAt = now + lifetimeMs;
      if (!isCanonicalDpopJkt(jkt) || !isEpochMs(now) || !isEpochMs(expiresAt) || expiresAt <= now) {
        throw new TypeError('DPoP nonce issuance requires a canonical key thumbprint and a safe live epoch window.');
      }
      const payload = JSON.stringify([randomBytes(16).toString('base64url'), now, expiresAt, namespaceDigest, jkt]);
      const encodedPayload = Buffer.from(payload, 'utf8').toString('base64url');
      const nonce = `${NONCE_VERSION}.${encodedPayload}.${sign(encodedPayload).toString('base64url')}`;
      if (Buffer.byteLength(nonce, 'utf8') > DPOP_NONCE_MAX_BYTES) {
        throw new TypeError('DPoP nonce issuance exceeded its fixed wire bound.');
      }
      return nonce;
    },
    verify(nonce: unknown, jkt: string, now: number): boolean {
      if (
        !isCanonicalDpopJkt(jkt) ||
        !isEpochMs(now) ||
        typeof nonce !== 'string' ||
        nonce.length > DPOP_NONCE_MAX_BYTES ||
        Buffer.byteLength(nonce, 'utf8') > DPOP_NONCE_MAX_BYTES
      )
        return false;
      const [version, encodedPayload, encodedMac, extra] = nonce.split('.');
      if (version !== NONCE_VERSION || !encodedPayload || !encodedMac || extra !== undefined) return false;
      const mac = decodeBase64url(encodedMac, 32);
      const bytes = decodeBase64url(encodedPayload);
      if (!mac || !bytes || !timingSafeEqual(mac, sign(encodedPayload))) return false;

      let payload: unknown;
      try {
        payload = JSON.parse(bytes.toString('utf8'));
      } catch {
        return false;
      }
      // Canonical issuer JSON also excludes invalid UTF-8, extra whitespace,
      // number spellings and payload extensions, even with an authentic MAC.
      if (
        !Array.isArray(payload) ||
        payload.length !== 5 ||
        !bytes.equals(Buffer.from(JSON.stringify(payload), 'utf8'))
      )
        return false;
      const [random, issuedAt, expiresAt, context, key]: unknown[] = payload;
      if (
        typeof random !== 'string' ||
        !decodeBase64url(random, 16) ||
        !isEpochMs(issuedAt) ||
        !isEpochMs(expiresAt) ||
        context !== namespaceDigest ||
        key !== jkt
      )
        return false;
      const declaredLifetime = expiresAt - issuedAt;
      return (
        declaredLifetime >= 1000 &&
        declaredLifetime <= lifetimeMs &&
        declaredLifetime % 1000 === 0 &&
        issuedAt <= now &&
        now < expiresAt
      );
    },
  });
};
