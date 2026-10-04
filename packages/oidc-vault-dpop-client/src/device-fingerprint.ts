/**
 * Browser-only DPoP client (CLIENT-02 port of apps/oidc-vault-dpop-example/src/auth/*).
 * No `node:*` or `express` imports. Browser globals (crypto.subtle, indexedDB,
 * sessionStorage, navigator.locks, BroadcastChannel) only behind
 * assertDpopBrowserFeatures / lazy factory calls, never at module top-level.
 */
/** Copyable private example helper. Recognition is NOT proof of possession or an API sender constraint. */
export type DeviceFingerprintSignalSource = () => Promise<string | undefined>;

export interface DeviceFingerprintOptions {
  /** Must match the backend's fingerprintRecognition.headerName; default X-Device-Fingerprint. */
  headerName?: string;
}

export interface DeviceFingerprint {
  /**
   * Obtain the current signal for POST login/exchange/refresh only. No signal is
   * persisted or cached here. Undefined deliberately means unenrolled; collection
   * failures throw rather than silently disabling an enrolled session's check.
   * Call only after the application's collection/disclosure choice and scope
   * these headers to its configured vault origin. Logout/API need no signal.
   */
  headers(): Promise<Readonly<Record<string, string>>>;
}

const COLLIDING_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'www-authenticate',
  'proxy-authenticate',
  'authentication-info',
  'proxy-authentication-info',
  'dpop',
  'dpop-nonce',
  'cookie',
  'set-cookie',
  'origin',
  'referer',
  'host',
  'forwarded',
  'accept',
  'accept-charset',
  'accept-encoding',
  'accept-language',
  'connection',
  'keep-alive',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const isPrintableAscii = (value: string): boolean => {
  for (let index = 0; index < value.length; index++) {
    const byte = value.charCodeAt(index);
    if (byte < 0x20 || byte > 0x7e) return false;
  }
  return true;
};

/** Generic injected source: no browser collection, vendor import, storage, or network activity at construction. */
export const createDeviceFingerprint = (
  source: DeviceFingerprintSignalSource,
  options: DeviceFingerprintOptions = {},
): DeviceFingerprint => {
  const { headerName: configuredHeaderName } = options;
  const headerName = configuredHeaderName === undefined ? 'X-Device-Fingerprint' : configuredHeaderName;
  if (
    typeof headerName !== 'string' ||
    !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(headerName) ||
    !isPrintableAscii(headerName)
  ) {
    throw new Error('Fingerprint header name is invalid.');
  }
  const normalized = headerName.toLowerCase();
  if (
    COLLIDING_HEADERS.has(normalized) ||
    ['content-', 'x-forwarded-', 'access-control-', 'sec-fetch-'].some((prefix) => normalized.startsWith(prefix))
  ) {
    throw new Error('Fingerprint header name collides with a protocol header.');
  }
  return Object.freeze({
    async headers() {
      let signal: unknown;
      try {
        signal = await source();
      } catch {
        throw new Error('Browser recognition is unavailable.');
      }
      if (signal === undefined) return Object.freeze({});
      if (typeof signal !== 'string' || signal.length === 0 || signal.length > 256 || !isPrintableAscii(signal)) {
        throw new Error('Fingerprint signal is invalid.');
      }
      return Object.freeze({ [headerName]: signal });
    },
  });
};

/** Structural adapter for optional frontend FingerprintJS; no package dependency is required by this helper. */
export interface FingerprintJsAgent {
  get(): Promise<{ visitorId: string }>;
}

/**
 * Inject () => FingerprintJS.load() if the frontend opts into that dependency.
 * Only the agent load is shared; get() runs for each operation, so the helper
 * never pins an old identifier through a recognition change. Failed load can
 * be retried explicitly. Wrap with createDeviceFingerprint for bounded signals
 * and fixed errors that do not echo vendor diagnostics/identifiers.
 */
export const fingerprintJsSignalSource = (load: () => Promise<FingerprintJsAgent>): DeviceFingerprintSignalSource => {
  let pendingAgent: Promise<FingerprintJsAgent> | undefined;
  return async () => {
    const pending = (pendingAgent ??= Promise.resolve().then(load));
    let agent: FingerprintJsAgent;
    try {
      agent = await pending;
    } catch (error) {
      if (pendingAgent === pending) pendingAgent = undefined;
      throw error;
    }
    return (await agent.get()).visitorId;
  };
};
