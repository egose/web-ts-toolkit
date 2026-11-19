/** Maintained controls for the exact observation-only .mjs served to installed Chromium. */
import { describe, expect, it } from 'vitest';
import type { RequestSigner, SignerClient, SignInput } from '../src/signer.js';
import { createBrowserDiagnostics, safeError } from '../test-packed-consumer/consumer/installed-browser-observer.mjs';
import { InstalledBrowserScenarioError } from './installed-browser-harness.js';

type Runtime = Pick<typeof import('../src/signer.js'), 'createRequestSigner'>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

export function runInstalledBrowserDiagnosticsTests(runtime: Runtime): void {
  describe('installed browser observation-only diagnostics', () => {
    const input: SignInput = {
      method: 'POST',
      requestTarget: '/api/submit?order=1&order=2',
      contentType: 'text/plain',
      bodyHashHex: '0'.repeat(64),
      timestampMs: 123,
      nonceHex: '1'.repeat(32),
    };
    const realSigner = () =>
      runtime.createRequestSigner({
        keyId: 'diagnostic-key',
        key: new Uint8Array(32).fill(7),
        publicOrigin: 'https://attestation.example.com',
        replayNamespace: 'fixture-diagnostics',
      });

    it('forwards original receivers, arguments, values and a native sign promise without mutating frozen owners', async () => {
      const signing = deferred<string>();
      const loading = deferred<RequestSigner>();
      const nativeSigner = realSigner();
      const receivedInputs: SignInput[] = [];
      const calls: string[] = [];
      const signer: RequestSigner = Object.freeze({
        get version() {
          expect(this).toBe(signer);
          return nativeSigner.version;
        },
        get keyId() {
          expect(this).toBe(signer);
          return nativeSigner.keyId;
        },
        get publicOrigin() {
          expect(this).toBe(signer);
          return nativeSigner.publicOrigin;
        },
        get replayNamespace() {
          expect(this).toBe(signer);
          return nativeSigner.replayNamespace;
        },
        sign(this: unknown, value: SignInput) {
          expect(this).toBe(signer);
          receivedInputs.push(value);
          return signing.promise;
        },
      });
      let pending = loading.promise;
      const invalidateValue = { boundary: 'invalidate' };
      const disposeValue = { boundary: 'dispose' };
      const source: SignerClient = Object.freeze({
        getSigner(this: unknown) {
          expect(this).toBe(source);
          calls.push('load');
          return pending;
        },
        invalidate(this: unknown, keyId: string) {
          expect(this).toBe(source);
          expect(keyId).toBe(nativeSigner.keyId);
          calls.push('invalidate');
          return invalidateValue;
        },
        dispose(this: unknown) {
          expect(this).toBe(source);
          calls.push('dispose');
          return disposeValue;
        },
      });
      const originalFetch = globalThis.fetch;
      const diagnostics = createBrowserDiagnostics(source);
      expect(calls).toEqual([]); // Constructing an observer does not load, sign, dispose or perform I/O.
      const first = diagnostics.client.getSigner();
      expect(diagnostics.client.getSigner()).toBe(first); // Preserve shared-load identity equivalence.
      loading.resolve(signer);
      const observed = await first;
      expect(observed).not.toBe(signer); // A stable facade is required because the real signer is frozen.
      expect(Object.isFrozen(signer)).toBe(true);
      expect(Object.isFrozen(source)).toBe(true);
      expect(observed.version).toBe(nativeSigner.version);
      expect(observed.keyId).toBe(nativeSigner.keyId);
      expect(observed.publicOrigin).toBe(nativeSigner.publicOrigin);
      expect(observed.replayNamespace).toBe(nativeSigner.replayNamespace);
      pending = Promise.resolve(signer);
      expect(await diagnostics.client.getSigner()).toBe(observed);
      const sign = observed.sign(input);
      expect(sign).toBe(signing.promise);
      expect(receivedInputs).toHaveLength(1);
      expect(receivedInputs[0]).toBe(input);
      const proof = await nativeSigner.sign(input);
      signing.resolve(proof);
      expect(await sign).toBe(proof);
      expect(diagnostics.client.invalidate(nativeSigner.keyId)).toBe(invalidateValue);
      pending = Promise.resolve(nativeSigner);
      expect(await diagnostics.client.getSigner()).not.toBe(observed); // A different generation is not collapsed.
      expect(diagnostics.client.dispose()).toBe(disposeValue);
      expect(calls).toEqual(['load', 'load', 'load', 'invalidate', 'load', 'dispose']);
      expect(globalThis.fetch).toBe(originalFetch);
      const snapshot = diagnostics.snapshot();
      expect(snapshot.dropped).toBe(0);
      expect(snapshot.events).toContainEqual({ phase: 'load-shared', load: 2, sharedLoad: 1 });
      expect(snapshot.events).toContainEqual({ phase: 'sign-ready', sign: 1, sameAsFirst: null });
      const serialized = JSON.stringify(snapshot);
      for (const omitted of [proof, input.nonceHex, input.bodyHashHex, input.requestTarget, nativeSigner.keyId]) {
        expect(serialized).not.toContain(omitted);
      }
    });

    it.each(['ordinary', 'bound', 'closure'] as const)(
      'preserves caller-selected %s receivers and complete arguments',
      async (kind) => {
        const selected = Object.freeze({ selected: true });
        const calls: Array<{ method: string; receiver: unknown; args: unknown[] }> = [];
        function callback<T>(method: string, result: T) {
          function receive(this: unknown, ...args: unknown[]) {
            calls.push({ method, receiver: this, args });
            return result;
          }
          if (kind === 'bound') return receive.bind(selected);
          if (kind === 'closure') return (...args: unknown[]) => receive.apply(selected, args);
          return receive;
        }
        const signing = Promise.resolve('omitted proof');
        const signer: RequestSigner = Object.freeze({ ...realSigner(), sign: callback('sign', signing) });
        const loading = Promise.resolve(signer);
        const invalidated = Object.freeze({ invalidated: true });
        const disposed = Object.freeze({ disposed: true });
        const source: SignerClient = Object.freeze({
          getSigner: callback('load', loading),
          invalidate: callback('invalidate', invalidated),
          dispose: callback('dispose', disposed),
        });
        const diagnostics = createBrowserDiagnostics(source);
        const observed = await Reflect.apply(diagnostics.client.getSigner, selected, ['load-argument', selected]);
        expect(Reflect.apply(observed.sign, selected, [input, selected])).toBe(signing);
        expect(Reflect.apply(diagnostics.client.invalidate, selected, ['diagnostic-key', selected])).toBe(invalidated);
        expect(Reflect.apply(diagnostics.client.dispose, selected, [selected])).toBe(disposed);
        expect(calls).toEqual([
          { method: 'load', receiver: selected, args: ['load-argument', selected] },
          { method: 'sign', receiver: selected, args: [input, selected] },
          { method: 'invalidate', receiver: selected, args: ['diagnostic-key', selected] },
          { method: 'dispose', receiver: selected, args: [selected] },
        ]);
      },
    );

    it('waits for native load settlement before mapping its facade and leaves sign settlement on the original promise', async () => {
      const loading = deferred<RequestSigner>();
      const signing = deferred<string>();
      const signer = Object.freeze({ ...realSigner(), sign: () => signing.promise });
      const diagnostics = createBrowserDiagnostics({
        getSigner: () => loading.promise,
        invalidate: () => undefined,
        dispose: () => undefined,
      });
      const mapped = diagnostics.client.getSigner();
      const order: string[] = [];
      const nativeLoad = loading.promise.then(() => {
        order.push('native-load');
      });
      const observedLoad = mapped.then(() => {
        order.push('observed-load');
      });
      expect(diagnostics.snapshot().events).toEqual([{ phase: 'load-start', load: 1, replacement: false }]);
      expect(order).toEqual([]);
      loading.resolve(signer);
      await Promise.all([nativeLoad, observedLoad]);
      expect(order).toEqual(['native-load', 'observed-load']); // The necessary facade mapping is one extra promise reaction.
      const observed = await mapped;
      const nativeSign = signing.promise.then(() => {
        order.push('native-sign');
      });
      const sign = observed.sign(input);
      expect(sign).toBe(signing.promise);
      const observedSign = sign.then(() => {
        order.push('observed-sign');
        expect(diagnostics.snapshot().events.at(-1)).toEqual({ phase: 'sign-ready', sign: 1, sameAsFirst: null });
      });
      expect(diagnostics.snapshot().events.at(-1)).toEqual({ phase: 'sign-start', sign: 1 });
      signing.resolve('omitted proof');
      await Promise.all([nativeSign, observedSign]);
      expect(order).toEqual(['native-load', 'observed-load', 'native-sign', 'observed-sign']);
      diagnostics.client.dispose();
    });

    it('leaves malformed and accessor-defined signer substitutes untouched without invoking sign accessors', async () => {
      let accessed = 0;
      const accessor = Object.defineProperty({ ...realSigner() }, 'sign', {
        get() {
          accessed += 1;
          throw new Error('omitted accessor error');
        },
      });
      for (const substitute of [null, 'invalid signer', { ...realSigner(), sign: null }, accessor]) {
        const diagnostics = createBrowserDiagnostics({
          getSigner: async () => substitute as RequestSigner,
          invalidate: () => undefined,
          dispose: () => undefined,
        });
        expect(await diagnostics.client.getSigner()).toBe(substitute);
      }
      expect(accessed).toBe(0);
    });

    it.each(['load', 'sign', 'invalidate', 'dispose'] as const)(
      'preserves the exact synchronous %s error',
      async (boundary) => {
        const reason = Object.assign(new TypeError('omitted error message'), { code: 'SIGNER_PREPARATION_FAILED' });
        const signer: RequestSigner = {
          ...realSigner(),
          sign: () => {
            throw reason;
          },
        };
        const source: SignerClient = {
          getSigner: () => {
            if (boundary === 'load') throw reason;
            return Promise.resolve(signer);
          },
          invalidate: () => {
            throw reason;
          },
          dispose: () => {
            throw reason;
          },
        };
        const diagnostics = createBrowserDiagnostics(source);
        const observed = boundary === 'sign' ? await diagnostics.client.getSigner() : null;
        let caught: unknown;
        try {
          if (boundary === 'load') diagnostics.client.getSigner();
          else if (boundary === 'sign') observed!.sign(input);
          else if (boundary === 'invalidate') diagnostics.client.invalidate('diagnostic-key');
          else diagnostics.client.dispose();
        } catch (error) {
          caught = error;
        }
        expect(caught).toBe(reason);
        expect(diagnostics.snapshot().events).toContainEqual({
          phase: `${boundary}-error`,
          ...(boundary === 'load' ? { load: 1 } : boundary === 'sign' ? { sign: 1 } : {}),
          errorName: 'TypeError',
          errorCode: 'SIGNER_PREPARATION_FAILED',
        });
      },
    );

    it.each(['load', 'sign'] as const)(
      'preserves the exact asynchronous %s rejection and observes settlement',
      async (boundary) => {
        const failure = deferred<never>();
        const reason = Object.assign(new Error('omitted cause'), { code: 'SIGNER_LOAD_FAILED' });
        const signer: RequestSigner = { ...realSigner(), sign: () => failure.promise };
        let load: Promise<RequestSigner> = boundary === 'load' ? failure.promise : Promise.resolve(signer);
        const source: SignerClient = { getSigner: () => load, invalidate: () => undefined, dispose: () => undefined };
        const diagnostics = createBrowserDiagnostics(source);
        const pending =
          boundary === 'load' ? diagnostics.client.getSigner() : (await diagnostics.client.getSigner()).sign(input);
        if (boundary === 'load') expect(diagnostics.client.getSigner()).toBe(pending);
        else expect(pending).toBe(failure.promise);
        failure.reject(reason);
        await expect(pending).rejects.toBe(reason);
        expect(diagnostics.snapshot().events).toContainEqual({
          phase: `${boundary}-error`,
          ...(boundary === 'load' ? { load: 1 } : { sign: 1 }),
          errorName: 'Error',
          errorCode: 'SIGNER_LOAD_FAILED',
        });
        load = Promise.resolve(realSigner());
        expect(await diagnostics.client.getSigner()).toMatchObject({ keyId: 'diagnostic-key' });
        diagnostics.client.dispose();
      },
    );

    it('never invokes error accessors/stringification and redacts unrecognized categories', () => {
      let accessed = 0;
      const forbidden = () => {
        accessed += 1;
        throw new Error('must not be evaluated');
      };
      const hostile = Object.create(null, {
        name: { get: forbidden },
        code: { get: forbidden },
        message: { get: forbidden },
        cause: { get: forbidden },
        toString: { value: forbidden },
      });
      expect(safeError(hostile)).toEqual({ errorName: 'other', errorCode: null });
      expect(safeError({ name: 'omitted private name', code: 'omitted private code' })).toEqual({
        errorName: 'other',
        errorCode: null,
      });
      expect(safeError(new TypeError('omitted private message'))).toEqual({ errorName: 'TypeError', errorCode: null });
      expect(safeError(new Proxy({}, { getOwnPropertyDescriptor: forbidden }))).toEqual({
        errorName: 'other',
        errorCode: null,
      });
      expect(accessed).toBe(2); // Only the hostile proxy's two descriptor traps run, never accessors/stringification.
    });

    it('bounds retained events, sanitizes terminal observations and returns independent snapshots', () => {
      const diagnostics = createBrowserDiagnostics({
        getSigner: async () => realSigner(),
        invalidate: () => undefined,
        dispose: () => undefined,
      });
      diagnostics.returned({
        status: 600,
        type: 'omitted private type',
        marker: 'omitted private marker',
        bodyUsed: 'bad',
        bodyLocked: 'bad',
      });
      diagnostics.rejected(
        { name: 'omitted private name', code: 'omitted private code', message: 'omitted private message' },
        false,
      );
      diagnostics.injected('omitted private fault');
      for (let event = 0; event < 40; event += 1) diagnostics.injected('sign');
      const snapshot = diagnostics.snapshot();
      expect(snapshot.events).toHaveLength(32);
      expect(snapshot.dropped).toBe(11);
      expect(snapshot.events[0]).toEqual({
        phase: 'response-returned',
        status: null,
        type: 'other',
        marker: 'other',
        bodyUsed: null,
        bodyLocked: null,
      });
      expect(snapshot.events[1]).toEqual({
        phase: 'invocation-error',
        aborted: false,
        errorName: 'other',
        errorCode: null,
      });
      expect(snapshot.events[2]).toEqual({ phase: 'fault-injected', fault: 'other' });
      expect(JSON.stringify(snapshot)).not.toContain('omitted private');
      Object.assign(snapshot.events[0]!, { status: 200 });
      snapshot.events.pop();
      expect(diagnostics.snapshot().events).toHaveLength(32);
      expect(diagnostics.snapshot().events[0]).toMatchObject({ status: null });
    });

    it('retains a raw failure report for explicit assertions but never serializes it or the original error cause', () => {
      const privateValue = 'omitted-sensitive-value';
      const report = {
        counters: {
          captureCalls: 1,
          authCalls: 1,
          authorizedCalls: 1,
          guardCalls: 1,
          rotations: 1,
          reserveCalls: 0,
          successfulReservations: 0,
          businessCalls: 0,
        },
        traffic: [],
        reservations: [],
        effects: [],
        sessionCookie: privateValue,
        faults: [],
      };
      const error = new InstalledBrowserScenarioError(
        {
          name: 'safe controlled case',
          crossOrigin: true,
          includeCredentials: true,
          rotate: true,
          exposeMarker: true,
        },
        new TypeError(privateValue),
        {
          browserDiagnostics: { events: [], dropped: 0 },
          nativeDiagnostics: { events: [], dropped: 0 },
          report,
          chromiumVersion: '151.0.7922.34',
          serverOutputPresent: true,
        },
      );
      expect(error.report).toBe(report);
      expect(error.httpBeforeCleanup).toMatchObject({
        discovery: 0,
        keyModules: 0,
        runtimeModules: 0,
        ...report.counters,
      });
      expect(error.cause).toBeUndefined();
      expect(String(error)).not.toContain(privateValue);
      expect(JSON.stringify(error)).not.toContain(privateValue);
    });
  });
}
