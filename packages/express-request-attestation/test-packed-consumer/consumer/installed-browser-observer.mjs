/** Test-only observations: no native Fetch/import substitution, timers, retries, or raw error/proof logging. */
const ERROR_NAMES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'AbortError',
  'TimeoutError',
  'SignerClientError',
  'AttestationProtocolError',
  'OperationError',
  'NotSupportedError',
  'SecurityError',
]);
const ERROR_CODES = new Set([
  'SIGNER_LOAD_FAILED',
  'SIGNER_LOAD_TIMEOUT',
  'SIGNER_MODULE_INVALID',
  'SIGNER_ORIGIN_MISMATCH',
  'SIGNER_PREPARATION_FAILED',
]);
const FAULTS = new Set([
  'load-before-discovery',
  'invalidate',
  'sign',
  'retry-header',
  'repeat-proof',
  'retry-request',
]);
const RESPONSE_TYPES = new Set(['basic', 'cors', 'default', 'error', 'opaque', 'opaqueredirect']);

function dataField(value, field) {
  // Inspect a bounded prototype chain without invoking getters or stringification.
  try {
    for (
      let depth = 0;
      depth < 4 && value !== null && (typeof value === 'object' || typeof value === 'function');
      depth += 1
    ) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (descriptor !== undefined) return 'value' in descriptor ? descriptor.value : undefined;
      value = Object.getPrototypeOf(value);
    }
  } catch {
    /* A hostile proxy must not replace the caller's error. */
  }
  return undefined;
}

export function safeError(error) {
  const name = dataField(error, 'name');
  const code = dataField(error, 'code');
  return { errorName: ERROR_NAMES.has(name) ? name : 'other', errorCode: ERROR_CODES.has(code) ? code : null };
}

/**
 * Preserve receivers, argument/error identity and shared-load/signer equivalence.
 * Frozen signers require one mapped load reaction; native sign promises are never replaced.
 */
export function createBrowserDiagnostics(sourceClient) {
  const events = [];
  const signers = new WeakMap();
  const loads = new WeakMap();
  let dropped = 0;
  let loadCount = 0;
  let signCount = 0;
  let invalidated = false;
  let firstProof;
  let disposed = false;
  function record(event) {
    if (events.length < 32) events.push(event);
    else dropped += 1;
  }
  function wrapSigner(signer) {
    // Only facade ordinary data methods. Malformed/accessor substitutes remain
    // untouched for the production validator; observing must not make them valid.
    if (signer === null || typeof signer !== 'object' || typeof dataField(signer, 'sign') !== 'function') return signer;
    if (signers.has(signer)) return signers.get(signer);
    const observed = Object.freeze({
      get version() {
        return Reflect.get(signer, 'version', signer);
      },
      get keyId() {
        return Reflect.get(signer, 'keyId', signer);
      },
      get publicOrigin() {
        return Reflect.get(signer, 'publicOrigin', signer);
      },
      get replayNamespace() {
        return Reflect.get(signer, 'replayNamespace', signer);
      },
      sign(...args) {
        const sign = ++signCount;
        record({ phase: 'sign-start', sign });
        let pending;
        try {
          pending = Reflect.apply(signer.sign, this === observed ? signer : this, args);
        } catch (error) {
          record({ phase: 'sign-error', sign, ...safeError(error) });
          throw error;
        }
        // Tap settlement without replacing this caller-owned sign promise.
        void Promise.resolve(pending).then(
          (proof) => {
            record({ phase: 'sign-ready', sign, sameAsFirst: firstProof === undefined ? null : proof === firstProof });
            if (firstProof === undefined && !disposed) firstProof = proof;
          },
          (error) => record({ phase: 'sign-error', sign, ...safeError(error) }),
        );
        return pending;
      },
    });
    signers.set(signer, observed);
    return observed;
  }
  const client = Object.freeze({
    getSigner(...args) {
      const load = ++loadCount;
      record({ phase: 'load-start', load, replacement: invalidated });
      let pending;
      try {
        pending = Reflect.apply(sourceClient.getSigner, this === client ? sourceClient : this, args);
      } catch (error) {
        record({ phase: 'load-error', load, ...safeError(error) });
        throw error;
      }
      const cacheable = pending !== null && (typeof pending === 'object' || typeof pending === 'function');
      const shared = cacheable ? loads.get(pending) : undefined;
      if (shared !== undefined) {
        record({ phase: 'load-shared', load, sharedLoad: shared.load });
        return shared.pending;
      }
      const observed = Promise.resolve(pending).then(
        (signer) => {
          record({ phase: 'load-ready', load });
          return wrapSigner(signer);
        },
        (error) => {
          record({ phase: 'load-error', load, ...safeError(error) });
          throw error;
        },
      );
      if (cacheable) loads.set(pending, { load, pending: observed });
      return observed;
    },
    invalidate(...args) {
      invalidated = true;
      record({ phase: 'invalidate-start' });
      try {
        const value = Reflect.apply(sourceClient.invalidate, this === client ? sourceClient : this, args);
        record({ phase: 'invalidate-ready' });
        return value;
      } catch (error) {
        record({ phase: 'invalidate-error', ...safeError(error) });
        throw error;
      }
    },
    dispose(...args) {
      disposed = true;
      firstProof = undefined;
      record({ phase: 'dispose-start' });
      try {
        const value = Reflect.apply(sourceClient.dispose, this === client ? sourceClient : this, args);
        record({ phase: 'dispose-ready' });
        return value;
      } catch (error) {
        record({ phase: 'dispose-error', ...safeError(error) });
        throw error;
      }
    },
  });
  return {
    client,
    snapshot: () => ({ events: events.map((event) => ({ ...event })), dropped }),
    injected: (fault) => record({ phase: 'fault-injected', fault: FAULTS.has(fault) ? fault : 'other' }),
    rejected: (error, aborted) => record({ phase: 'invocation-error', aborted: aborted === true, ...safeError(error) }),
    returned(state) {
      record({
        phase: 'response-returned',
        status: Number.isInteger(state.status) && state.status >= 0 && state.status <= 599 ? state.status : null,
        type: RESPONSE_TYPES.has(state.type) ? state.type : 'other',
        marker: state.marker === 'stale-key' || state.marker === null ? state.marker : 'other',
        bodyUsed: typeof state.bodyUsed === 'boolean' ? state.bodyUsed : null,
        bodyLocked: typeof state.bodyLocked === 'boolean' ? state.bodyLocked : null,
      });
    },
  };
}
