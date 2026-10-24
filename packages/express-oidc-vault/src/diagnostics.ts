import { createHash } from 'node:crypto';

import type {
  OidcVaultDiagnosticCorrelation,
  OidcVaultDpopDiagnosticEvent,
  OidcVaultDpopDiagnosticObserver,
  OidcVaultDpopDiagnosticOutcome,
  OidcVaultDpopDiagnosticReason,
  OidcVaultDpopDiagnosticStage,
  OidcVaultDpopDiagnosticTiming,
  OidcVaultDpopOperation,
  OidcVaultDpopVerificationProvenance,
} from './types';

/** No queue or retained events. Bound unresolved observer work across requests, including malicious thenables. */
export const createDiagnosticDispatcher = <T>(observer: ((event: T) => void | Promise<void>) | undefined) => {
  let pending = 0;
  let invoking = false;
  return (event: T): void => {
    if (!observer || invoking || pending >= 32) return;
    invoking = true;
    try {
      const result = observer(event);
      if (result !== undefined) {
        pending++;
        const release = () => {
          pending--;
        };
        void Promise.resolve(result).then(release, release);
      }
    } catch {
      // Deliberately no recursive onError, logging, retry or authentication effect.
    } finally {
      invoking = false;
    }
  };
};

const reference = (purpose: 'subject' | 'session', value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 && value.length <= 1024
    ? createHash('sha256').update(`${purpose}\0${value}`, 'utf8').digest('base64url')
    : undefined;

export const diagnosticCorrelation = (
  association: OidcVaultDiagnosticCorrelation['association'],
  subject?: unknown,
  sessionId?: unknown,
): Readonly<OidcVaultDiagnosticCorrelation> => {
  const subjectRef = reference('subject', subject);
  const sessionRef = reference('session', sessionId);
  return Object.freeze({ association, ...(subjectRef ? { subjectRef } : {}), ...(sessionRef ? { sessionRef } : {}) });
};

export class DpopDiagnostic {
  private verification: OidcVaultDpopVerificationProvenance = {
    signature: 'unchecked',
    target: 'unchecked',
    tokenHash: 'unchecked',
    credentialBinding: 'unchecked',
    freshness: 'unchecked',
    nonce: 'unchecked',
    replay: 'unchecked',
  };
  private timing?: Readonly<OidcVaultDpopDiagnosticTiming>;
  private correlation?: Readonly<OidcVaultDiagnosticCorrelation>;
  private terminal = false;

  constructor(
    private readonly operation: OidcVaultDpopOperation,
    private readonly dispatch: (event: OidcVaultDpopDiagnosticEvent) => void,
  ) {}

  associate(correlation: Readonly<OidcVaultDiagnosticCorrelation>): void {
    this.correlation = correlation;
  }

  mark(update: Partial<OidcVaultDpopVerificationProvenance>): void {
    this.verification = { ...this.verification, ...update };
  }

  signedTime(iatSeconds: number): void {
    this.timing = Object.freeze({ provenance: 'signature-verified', iatSeconds });
  }

  checkTime(checkedAtMs: number, clock: 'configured' | 'system' | 'fallback'): void {
    if (!this.timing) return;
    const issuedAt = this.timing.iatSeconds * 1000;
    const age = checkedAtMs - issuedAt;
    this.timing = Object.freeze({
      ...this.timing,
      clock,
      checkedAtMs,
      ...(Number.isSafeInteger(issuedAt) && Number.isSafeInteger(age) ? { observedAgeMs: age } : {}),
    });
  }

  emit(
    stage: OidcVaultDpopDiagnosticStage,
    outcome: OidcVaultDpopDiagnosticOutcome,
    reason: OidcVaultDpopDiagnosticReason,
  ): void {
    if (this.terminal) return;
    if (
      outcome === 'rejected' ||
      outcome === 'challenged' ||
      stage === 'proof' ||
      (stage === 'presentation' && outcome === 'ignored')
    )
      this.terminal = true;
    this.dispatch(
      Object.freeze({
        operation: this.operation,
        stage,
        outcome,
        reason,
        verification: Object.freeze({ ...this.verification }),
        ...(this.timing ? { timing: this.timing } : {}),
        ...(this.correlation ? { correlation: this.correlation } : {}),
      }),
    );
  }

  accept(): void {
    if (this.correlation && this.hasAuthenticatedProof()) {
      this.correlation = Object.freeze({ ...this.correlation, association: 'authenticated' });
    }
    this.emit('proof', 'accepted', 'proof-accepted');
  }

  /** Policy acceptance with an ignored security check is not strict identity evidence. */
  hasAuthenticatedProof(): boolean {
    const v = this.verification;
    return (
      v.signature === 'verified' &&
      v.target === 'matched' &&
      v.credentialBinding === 'matched' &&
      (v.tokenHash === 'matched' || v.tokenHash === 'not-applicable') &&
      v.freshness === 'passed' &&
      (v.nonce === 'passed' || v.nonce === 'disabled') &&
      v.replay === 'reserved'
    );
  }
}

/** Only package-owned controlled codes, never arbitrary diagnostic text. */
export const diagnosticPreflightReason = (code: unknown): OidcVaultDpopDiagnosticReason => {
  switch (code) {
    case 'OIDC_VAULT_DPOP_REQUIRED':
      return 'proof-required';
    case 'OIDC_VAULT_DEVICE_BINDING_REQUIRED':
      return 'binding-required';
    case 'OIDC_VAULT_INVALID_SESSION':
      return 'session-mismatch';
    case 'OIDC_VAULT_INVALID_EXCHANGE_CODE':
      return 'session-unavailable';
    case 'OIDC_VAULT_INVALID_ORIGIN':
    case 'OIDC_VAULT_UNTRUSTED_ORIGIN':
      return 'origin-rejected';
    case 'OIDC_VAULT_INVALID_BROWSER_BINDING':
      return 'browser-binding-rejected';
    case 'OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED':
      return 'recognition-rejected';
    default:
      return 'preflight-failed';
  }
};

export const createDpopDiagnosticFactory = (observer: OidcVaultDpopDiagnosticObserver | undefined) => {
  const dispatch = createDiagnosticDispatcher(observer);
  return (operation: OidcVaultDpopOperation): DpopDiagnostic => new DpopDiagnostic(operation, dispatch);
};
