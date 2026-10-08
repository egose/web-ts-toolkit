type DpopFailureCheck = 'target' | 'freshness' | 'replay';

const CHECKS = {
  target: { step: 6, option: 'ignoreTargetFailure', env: 'OIDC_VAULT_DPOP_IGNORE_TARGET_FAILURE' },
  freshness: { step: 7, option: 'ignoreFreshnessFailure', env: 'OIDC_VAULT_DPOP_IGNORE_FRESHNESS_FAILURE' },
  replay: { step: 8, option: 'ignoreReplayFailure', env: 'OIDC_VAULT_DPOP_IGNORE_REPLAY_FAILURE' },
} as const;

/** Explicit booleans override the environment; only the exact env value "true" enables soft failure. */
export const resolveDpopFailureOption = (value: unknown, check: DpopFailureCheck): boolean => {
  const { option, env } = CHECKS[check];
  if (value === undefined) return process.env[env] === 'true';
  if (typeof value !== 'boolean') throw new TypeError(`deviceBinding.${option} must be a boolean.`);
  return value;
};

/** Called only at the selected check's failure boundary, never around the entire verifier. */
export const handleDpopCheckFailure = (ignore: boolean, check: DpopFailureCheck, error: unknown): void => {
  if (!ignore) throw error;
  const { step, option, env } = CHECKS[check];
  console.warn(`[express-oidc-vault] DPoP step ${step} (${check}) failed; continuing (${option}=true; ${env}).`, error);
};
