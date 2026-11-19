// Test-only declarations for the exact native .mjs fixture; never part of the published package.
import type { SignerClient } from '../../src/signer.js';

export type SafeError = { errorName: string; errorCode: string | null };
export type DiagnosticEvent =
  | { phase: 'load-start'; load: number; replacement: boolean }
  | { phase: 'load-shared'; load: number; sharedLoad: number }
  | { phase: 'load-ready'; load: number }
  | ({ phase: 'load-error'; load: number } & SafeError)
  | { phase: 'sign-start'; sign: number }
  | { phase: 'sign-ready'; sign: number; sameAsFirst: boolean | null }
  | ({ phase: 'sign-error'; sign: number } & SafeError)
  | { phase: 'invalidate-start' | 'invalidate-ready' | 'dispose-start' | 'dispose-ready' }
  | ({ phase: 'invalidate-error' | 'dispose-error' } & SafeError)
  | { phase: 'fault-injected'; fault: string }
  | ({ phase: 'invocation-error'; aborted: boolean } & SafeError)
  | {
      phase: 'response-returned';
      status: number | null;
      type: string;
      marker: string | null;
      bodyUsed: boolean | null;
      bodyLocked: boolean | null;
    };

export type BrowserDiagnostics = { events: DiagnosticEvent[]; dropped: number };
export function safeError(error: unknown): SafeError;
export function createBrowserDiagnostics(sourceClient: SignerClient): {
  client: SignerClient;
  snapshot(): BrowserDiagnostics;
  injected(fault: string): void;
  rejected(error: unknown, aborted: boolean): void;
  returned(state: Record<'status' | 'type' | 'marker' | 'bodyUsed' | 'bodyLocked', unknown>): void;
};
