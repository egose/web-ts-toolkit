import type { Request, Response } from 'express';

import type { OidcVaultResolvedConfig } from './config';
import {
  assertDeviceBindingPolicy,
  assertDeviceBindingStoreCapabilities,
  resolveVerifiedDeviceBinding,
  snapshotDpopBinding,
  type ResolvedOidcVaultDeviceBindingOptions,
  type ResolvedOidcVaultOptions,
} from './device-binding-policy';
import { extractDpopProof, readDpopRawHeader, verifyDpopProof, type DpopRawHeader } from './dpop-proof';
import {
  createDpopReplayPolicy,
  toDpopNonceChallengeResponse,
  toDpopReplayErrorResponse,
  type DpopPolicyResponse,
} from './dpop-replay';
import { createDpopRequestTargetResolver } from './dpop-target';
import { OidcVaultHttpError } from './errors';
import type { OidcVaultDpopBinding, OidcVaultVerifiedDpopBinding } from './types';

export interface CapturedVaultRouteProof {
  readonly header: DpopRawHeader;
  readonly method: string;
  readonly originalUrl: string;
}

/** Capture before stores, providers, or mutable hooks; no Host/forwarded origin and no Authorization token. */
export const captureVaultRouteProof = (req: Request): CapturedVaultRouteProof =>
  Object.freeze({
    header: readDpopRawHeader(req, 'dpop'),
    method: req.method,
    originalUrl: req.originalUrl,
  });

class VaultDpopNonceChallengeError extends OidcVaultHttpError {
  constructor(readonly response: DpopPolicyResponse) {
    super(400, 'OIDC_VAULT_USE_DPOP_NONCE', 'A fresh DPoP nonce is required.');
  }
}

export interface VaultRouteProofVerifier {
  /** New login selection only: a verified/reserved proof selects its key; optional omission stays unbound. */
  initiate(request: CapturedVaultRouteProof): Promise<Readonly<OidcVaultVerifiedDpopBinding> | undefined>;
  /** Existing-record proof check. Caller must preflight identity/cookie/record agreement first; never enrolls legacy records. */
  verify(
    request: CapturedVaultRouteProof,
    originalBinding: Readonly<OidcVaultDpopBinding> | undefined,
  ): Promise<Readonly<OidcVaultVerifiedDpopBinding> | undefined>;
}

/** One shared protection space for every vault POST. Reuses the existing signature/target/nonce/replay policies. */
export const createVaultRouteProofVerifier = (
  options: ResolvedOidcVaultOptions,
  config: OidcVaultResolvedConfig,
  backendOrigin: string,
  basePath: string,
): VaultRouteProofVerifier | undefined => {
  const policy = options.deviceBinding;
  if (policy === undefined) return undefined;
  assertDeviceBindingStoreCapabilities(options.storeProvider);
  const targetFor = createDpopRequestTargetResolver({ publicOrigin: backendOrigin });
  const replay = createDpopReplayPolicy({
    // The config resolver requires both identifiers in manual/discovery modes.
    protectionSpace: { type: 'vault', backendOrigin, basePath, issuer: config.issuer!, clientId: config.clientId! },
    proofOptions: policy,
    replayStore: options.storeProvider,
    now: options.now,
  });
  const admit = async (request: CapturedVaultRouteProof, proof: string, expectedJkt?: string) => {
    const targetUrl = targetFor(request.originalUrl);
    const result = await replay.verifyAndReserve(() =>
      verifyDpopProof({
        proof,
        method: request.method,
        targetUrl,
        proofOptions: policy,
        expectedJkt,
      }),
    );
    if (result.type === 'nonce-challenge') {
      throw new VaultDpopNonceChallengeError(toDpopNonceChallengeResponse(result, 'vault-post', policy.algorithms));
    }
    return result.binding;
  };
  return Object.freeze({
    async initiate(request: CapturedVaultRouteProof) {
      const proof = extractDpopProof(request.header);
      if (proof === undefined) {
        assertDeviceBindingPolicy(policy, undefined);
        return undefined;
      }
      return admit(request, proof);
    },
    async verify(request: CapturedVaultRouteProof, originalBinding: Readonly<OidcVaultDpopBinding> | undefined) {
      const binding = snapshotDpopBinding(originalBinding);
      assertDeviceBindingPolicy(policy, binding);
      const proof = extractDpopProof(request.header);
      const verified = proof === undefined ? undefined : await admit(request, proof, binding?.jkt);
      return resolveVerifiedDeviceBinding(policy, binding, verified);
    },
  });
};

/** Snapshot sanitized error/challenge before observers run; private error authority never becomes browser JSON. */
export const toVaultRouteErrorResponse = (
  error: unknown,
  policy: ResolvedOidcVaultDeviceBindingOptions | undefined,
): DpopPolicyResponse =>
  error instanceof VaultDpopNonceChallengeError
    ? error.response
    : toDpopReplayErrorResponse(error, policy?.algorithms ?? ['ES256']);

export const sendVaultRoutePolicyResponse = (res: Response, response: DpopPolicyResponse): void => {
  res.removeHeader('WWW-Authenticate');
  res.removeHeader('DPoP-Nonce');
  for (const [name, value] of Object.entries(response.headers)) res.setHeader(name, value);
  res.status(response.status).json(response.body);
};
