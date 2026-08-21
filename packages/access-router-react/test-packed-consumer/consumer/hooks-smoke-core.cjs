/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert');

const { JSDOM } = require('jsdom');

function createLazyRequest(executor) {
  let promise;

  const exec = () => {
    if (!promise) {
      promise = Promise.resolve().then(executor);
    }
    return promise;
  };

  return {
    exec,
    then(onFulfilled, onRejected) {
      return exec().then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return exec().catch(onRejected);
    },
    finally(onFinally) {
      return exec().finally(onFinally);
    },
    [Symbol.toStringTag]: 'Promise',
  };
}

function createSuccessResponse(data, status) {
  return {
    success: true,
    raw: data,
    data,
    message: 'ok',
    status,
    headers: {},
  };
}

function createFailureResponse(message, status) {
  return {
    success: false,
    raw: null,
    data: null,
    message,
    status,
    headers: {},
  };
}

function installDomGlobals(window) {
  const previous = new Map();
  const assignments = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    CustomEvent: window.CustomEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (handle) => clearTimeout(handle),
  };

  for (const [key, value] of Object.entries(assignments)) {
    previous.set(key, globalThis[key]);
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }

  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete globalThis[key];
      } else {
        Object.defineProperty(globalThis, key, {
          configurable: true,
          writable: true,
          value,
        });
      }
    }
  };
}

function assertPublishedEntry(entryPath) {
  const normalized = entryPath.replace(/\\/g, '/');
  assert.ok(
    normalized.includes('/node_modules/@web-ts-toolkit/access-router-react/'),
    `expected installed package entry under node_modules, received ${entryPath}`,
  );
  assert.ok(!normalized.includes('/src/'), `published entry unexpectedly points at source: ${entryPath}`);
  assert.ok(!normalized.includes('/test/'), `published entry unexpectedly points at tests: ${entryPath}`);
}

async function runHookSmoke(options) {
  const {
    mode,
    packageEntryPath,
    accessRouterReact,
    accessRouterClient,
    react,
    testingLibrary,
  } = options;
  const { createModelHooks, requestKeyFor, RequestKeyError } = accessRouterReact;
  const { ServiceError } = accessRouterClient;
  const { renderHook, act, waitFor, cleanup } = testingLibrary;

  const expected = ['RequestKeyError', 'createModelHooks', 'requestKeyFor'].sort();
  const actual = Object.keys(accessRouterReact).sort();
  assert.deepStrictEqual(
    actual,
    expected,
    `${mode} runtime export surface mismatch. expected ${expected.join(', ')}, got ${actual.join(', ')}`,
  );

  assertPublishedEntry(packageEntryPath);
  assert.strictEqual(typeof createModelHooks, 'function', 'createModelHooks is a function');
  assert.strictEqual(typeof requestKeyFor, 'function', 'requestKeyFor is a function');
  assert.strictEqual(typeof RequestKeyError, 'function', 'RequestKeyError constructor is a function');
  assert.ok(RequestKeyError.prototype instanceof Error, 'RequestKeyError extends Error');
  assert.strictEqual(new RequestKeyError('boom').name, 'RequestKeyError', 'RequestKeyError sets its name');
  assert.strictEqual(
    requestKeyFor({ filter: { status: 'active' } }),
    requestKeyFor({ filter: { status: 'active' } }),
    'requestKeyFor is stable for equal inputs',
  );
  assert.ok(typeof requestKeyFor({ filter: { status: 'active' } }) === 'string', 'requestKeyFor returns a string');

  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const restoreDomGlobals = installDomGlobals(dom.window);

  try {
    assert.strictEqual(typeof react.useState, 'function', 'consumer React install is usable');
    assert.strictEqual(typeof renderHook, 'function', 'testing-library renderHook is available');

    const successService = {
      read(id, _options, requestConfig) {
        const data = { _id: id, name: 'Milo', status: 'active' };
        return createLazyRequest(async () => {
          assert.ok(requestConfig && requestConfig.signal instanceof AbortSignal, 'query forwards an AbortSignal');
          return createSuccessResponse(data, 200);
        });
      },
      create(payload) {
        return createLazyRequest(async () =>
          createSuccessResponse({ _id: 'created-1', name: payload.name, status: 'pending' }, 201),
        );
      },
    };

    const successHooks = createModelHooks({ modelService: successService });
    const readSuccess = renderHook(() => successHooks.useRead({ id: 'pet-1' }));

    await waitFor(() => {
      assert.strictEqual(readSuccess.result.current.data && readSuccess.result.current.data.name, 'Milo');
      assert.strictEqual(readSuccess.result.current.error, null);
    });

    readSuccess.unmount();
    cleanup();

    const mutation = renderHook(() => successHooks.useCreate());
    await act(async () => {
      const result = await mutation.result.current.mutate({ name: 'Nova' });
      assert.strictEqual(result.success, true, 'mutation promise resolves a success result');
    });
    await waitFor(() => {
      assert.strictEqual(mutation.result.current.data && mutation.result.current.data.name, 'Nova');
    });
    mutation.unmount();
    cleanup();

    const failureHooks = createModelHooks({
      modelService: {
        read() {
          return createLazyRequest(async () => createFailureResponse('Forbidden', 403));
        },
      },
    });
    const initialData = { _id: 'cached-1', name: 'Cached', status: 'active' };
    const readFailure = renderHook(() => failureHooks.useRead({ id: 'pet-2', initialData }));

    await waitFor(() => {
      assert.ok(readFailure.result.current.error instanceof ServiceError, 'normalized failure becomes ServiceError');
    });
    assert.strictEqual(readFailure.result.current.error.message, 'Forbidden');
    assert.strictEqual(readFailure.result.current.data && readFailure.result.current.data.name, 'Cached');
    readFailure.unmount();
    cleanup();

    let forwardedSignal;
    let successCalls = 0;
    let errorCalls = 0;
    let settledCalls = 0;

    const cancellationHooks = createModelHooks({
      modelService: {
        read(_id, _options, requestConfig) {
          forwardedSignal = requestConfig && requestConfig.signal;
          return createLazyRequest(
            () =>
              new Promise((_resolve, reject) => {
                const signal = requestConfig && requestConfig.signal;
                if (!(signal instanceof AbortSignal)) {
                  reject(new Error('missing forwarded signal'));
                  return;
                }
                if (signal.aborted) {
                  reject(signal.reason);
                  return;
                }
                signal.addEventListener(
                  'abort',
                  () => {
                    reject(signal.reason);
                  },
                  { once: true },
                );
              }),
          );
        },
      },
    });

    const cancelledRead = renderHook(() =>
      cancellationHooks.useRead({
        enabled: false,
        onSuccess() {
          successCalls += 1;
        },
        onError() {
          errorCalls += 1;
        },
        onSettled() {
          settledCalls += 1;
        },
      }),
    );

    const controller = new AbortController();
    const abortReason = new Error('caller cancelled');
    let rejectedWith;
    await act(async () => {
      const pending = cancelledRead.result.current.query('pet-3', { signal: controller.signal });
      controller.abort(abortReason);
      try {
        await pending;
        assert.fail('expected caller cancellation to reject the request');
      } catch (error) {
        rejectedWith = error;
      }
    });

    await waitFor(() => {
      assert.strictEqual(cancelledRead.result.current.isFetching, false);
      assert.strictEqual(cancelledRead.result.current.error, null);
    });
    assert.strictEqual(rejectedWith, abortReason, 'query rejects with the caller abort reason');
    assert.ok(forwardedSignal instanceof AbortSignal, 'caller cancellation forwards one effective signal');
    assert.strictEqual(forwardedSignal.aborted, true, 'forwarded signal aborts');
    assert.strictEqual(successCalls, 0, 'cancellation suppresses success callbacks');
    assert.strictEqual(errorCalls, 0, 'cancellation suppresses error callbacks');
    assert.strictEqual(settledCalls, 0, 'cancellation suppresses settled callbacks');
    cancelledRead.unmount();
    cleanup();
  } finally {
    cleanup();
    restoreDomGlobals();
    dom.window.close();
  }
}

module.exports = {
  runHookSmoke,
};
