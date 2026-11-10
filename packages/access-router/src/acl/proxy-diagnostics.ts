import type { AccessRouterLogger, AuthorizationSnapshotProxyLogMode } from '../interfaces/root';
import type { AccessRuntime } from '../runtime';

/**
 * Authorization-snapshot Proxy diagnostics. Requests running in package-managed
 * execution read the active runtime's current global options (same resolution
 * as the logger passthrough). Standalone capture outside any active runtime
 * reads this module's fallback, synced from defaultRuntime option writes. The
 * leaf module imports runtime types only (erased): snapshot capture runs inside
 * authorization paths and bundled module-init order, so a value import of the
 * options/runtime graph here would create a module-order cycle.
 */

let fallbackMode: AuthorizationSnapshotProxyLogMode | undefined;
let fallbackLogger: AccessRouterLogger | undefined;

/** Syncs the standalone fallback from defaultRuntime's stored global options. */
export const syncProxySnapshotDiagnostics = (
  mode: AuthorizationSnapshotProxyLogMode | undefined,
  logger: AccessRouterLogger | undefined,
): void => {
  fallbackMode = mode;
  fallbackLogger = logger;
};

const normalizeMode = (mode: AuthorizationSnapshotProxyLogMode | undefined): AuthorizationSnapshotProxyLogMode =>
  mode === 'warn' || mode === 'silent' ? mode : 'error';

export const readProxySnapshotDiagnostics = (
  runtime: AccessRuntime | null,
): { mode: AuthorizationSnapshotProxyLogMode; logger: AccessRouterLogger | undefined } => {
  if (runtime)
    return {
      mode: normalizeMode(runtime.getGlobalOption('authorizationSnapshotProxyLog')),
      logger: runtime.getGlobalOption('logger'),
    };
  return { mode: normalizeMode(fallbackMode), logger: fallbackLogger };
};
