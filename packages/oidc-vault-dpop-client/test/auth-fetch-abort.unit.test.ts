import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchWithDpop, type DpopFetchContext } from '../src/auth-fetch';
import type { DpopAccessToken } from '../src/credentials';
import type { DpopKey } from '../src/dpop-key-store';
import { createDpopProof } from '../src/dpop-proof';

vi.mock('../src/dpop-proof', () => ({ createDpopProof: vi.fn() }));

const NOW = 1_800_000_000_000;
const key = { jkt: 'unit-jkt' } as DpopKey;
const credential: DpopAccessToken = {
  accessToken: 'unit.access.token',
  tokenType: 'DPoP',
  jkt: key.jkt,
  expiresAt: NOW + 60_000,
  generation: 'unit-generation',
};
const releases: Array<() => void> = [];
const outcomes: Promise<unknown>[] = [];
const deferred = <T>(fallback: T) => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  releases.push(() => resolve(fallback));
  return { promise, resolve, reject };
};
const observe = <T>(promise: Promise<T>) => {
  const state: { result?: { value: T } | { error: unknown } } = {};
  const done = promise.then(
    (value) => {
      state.result = { value };
    },
    (error: unknown) => {
      state.result = { error };
    },
  );
  outcomes.push(done);
  return state;
};
const drain = () => new Promise<void>((resolve) => setImmediate(resolve));
const fixture = (initial: DpopAccessToken | undefined = credential) => {
  const refresh = vi.fn(async () => credential);
  const getKey = vi.fn(async () => key);
  const clear = vi.fn(async () => {});
  const getAccessToken = vi.fn<() => DpopAccessToken | undefined>(() => initial);
  const request = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
  const context: DpopFetchContext = {
    session: {
      scopeId: 'unit',
      sessionTransport: 'body',
      login: async () => {},
      exchange: async () => credential,
      logout: async () => {},
      logoutAndNavigate: async () => {},
      dispose() {},
      resetKey: async () => {
        throw new Error('Unexpected automatic key reset.');
      },
      refresh,
      getKey,
      clear,
      getAccessToken,
    },
    apis: [{ origin: 'https://api.example.com', replayNamespace: 'unit-api' }],
    fetch: request,
    now: () => NOW,
  };
  return { context, refresh, getKey, clear, getAccessToken, request };
};
const target = 'https://api.example.com/profile';
const challenged = (error: 'use_dpop_nonce' | 'invalid_token') =>
  new Response('{}', {
    status: 401,
    headers: { 'WWW-Authenticate': `DPoP error="${error}", algs="ES256"`, 'DPoP-Nonce': 'nonce' },
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(createDpopProof).mockResolvedValue('unit-proof');
});
afterEach(async () => {
  for (const release of releases.splice(0)) release();
  await Promise.all(outcomes.splice(0));
  await drain(); // Let late rejections reach Vitest's unhandled-rejection monitor.
});

describe('DPH-03 API caller cancellation', () => {
  it.each(['missing', 'expired', 'live'] as const)(
    'pre-aborted %s credentials do no auth or HTTP work',
    async (kind) => {
      const f = fixture(kind === 'expired' ? { ...credential, expiresAt: NOW } : credential);
      if (kind === 'missing') f.getAccessToken.mockReturnValue(undefined);
      const controller = new AbortController();
      const reason = new Error('caller cancelled');
      controller.abort(reason);
      await expect(fetchWithDpop(f.context, target, { signal: controller.signal })).rejects.toBe(reason);
      expect(f.getAccessToken).not.toHaveBeenCalled();
      expect(f.refresh).not.toHaveBeenCalled();
      expect(f.getKey).not.toHaveBeenCalled();
      expect(createDpopProof).not.toHaveBeenCalled();
      expect(f.request).not.toHaveBeenCalled();
      expect(f.clear).not.toHaveBeenCalled();
    },
  );

  it('aborts only one waiter on a shared refresh, before any key/sign/network continuation', async () => {
    const f = fixture({ ...credential, expiresAt: NOW });
    const pending = deferred(credential);
    f.refresh.mockReturnValue(pending.promise);
    const controller = new AbortController();
    const first = observe(fetchWithDpop(f.context, target, { signal: controller.signal }));
    const second = observe(fetchWithDpop(f.context, target));
    expect(f.refresh).toHaveBeenCalledTimes(2);
    controller.abort();
    await drain();
    expect(first.result).toEqual({ error: controller.signal.reason });
    expect(second.result).toBeUndefined();
    expect(f.getKey).not.toHaveBeenCalled();
    expect(createDpopProof).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
    pending.resolve(credential);
    await drain();
    expect(second.result).toMatchObject({ value: { status: 200 } });
    expect(f.getKey).toHaveBeenCalledOnce();
    expect(createDpopProof).toHaveBeenCalledOnce();
    expect(f.request).toHaveBeenCalledOnce();
    expect(f.clear).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)(
    'aborts a key wait promptly and observes its late %s without clearing auth',
    async (ending) => {
      const f = fixture();
      const pending = deferred(key);
      f.getKey.mockReturnValueOnce(pending.promise);
      const controller = new AbortController();
      const running = observe(fetchWithDpop(f.context, target, { signal: controller.signal }));
      expect(f.getKey).toHaveBeenCalledOnce();
      controller.abort();
      await drain();
      expect(running.result).toEqual({ error: controller.signal.reason });
      if (ending === 'resolve') pending.resolve({ ...key, jkt: 'changed-key' });
      else pending.reject(new Error('late key failure'));
      await drain();
      expect(createDpopProof).not.toHaveBeenCalled();
      expect(f.request).not.toHaveBeenCalled();
      expect(f.clear).not.toHaveBeenCalled();
    },
  );

  it('leaves another waiter on shared key work usable', async () => {
    const f = fixture();
    const pending = deferred(key);
    f.getKey.mockReturnValue(pending.promise);
    const controller = new AbortController();
    const first = observe(fetchWithDpop(f.context, target, { signal: controller.signal }));
    const second = observe(fetchWithDpop(f.context, target));
    controller.abort();
    await drain();
    expect(first.result).toEqual({ error: controller.signal.reason });
    expect(second.result).toBeUndefined();
    pending.resolve(key);
    await drain();
    expect(second.result).toMatchObject({ value: { status: 200 } });
    expect(createDpopProof).toHaveBeenCalledOnce();
    expect(f.request).toHaveBeenCalledOnce();
  });

  it('observes a shared refresh rejecting after this caller has already aborted', async () => {
    const f = fixture({ ...credential, expiresAt: NOW });
    const pending = deferred(credential);
    f.refresh.mockReturnValueOnce(pending.promise);
    const controller = new AbortController();
    const running = observe(fetchWithDpop(f.context, target, { signal: controller.signal }));
    controller.abort();
    await drain();
    expect(running.result).toEqual({ error: controller.signal.reason });
    pending.reject(new Error('late refresh rejection'));
    await drain();
    expect(f.getKey).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
  });

  it('stops network work after abort during proof creation', async () => {
    const f = fixture();
    const pending = deferred('late-proof');
    const entered = deferred<void>(undefined);
    vi.mocked(createDpopProof).mockImplementationOnce(() => {
      entered.resolve();
      return pending.promise;
    });
    const controller = new AbortController();
    const running = observe(fetchWithDpop(f.context, target, { signal: controller.signal }));
    await entered.promise;
    controller.abort();
    await drain();
    expect(running.result).toEqual({ error: controller.signal.reason });
    pending.resolve('late-proof');
    await drain();
    expect(f.request).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)('aborts a noncooperative fetch and handles its late %s', async (ending) => {
    const f = fixture();
    const response = challenged('invalid_token');
    const cancel = vi.spyOn(response.body!, 'cancel').mockRejectedValue(new Error('cleanup failed'));
    const pending = deferred(response);
    const entered = deferred<void>(undefined);
    f.request.mockImplementationOnce(() => {
      entered.resolve();
      return pending.promise;
    });
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, 'addEventListener');
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const running = observe(fetchWithDpop(f.context, target, { signal: controller.signal }));
    await entered.promise;
    expect(f.request.mock.calls[0][1]?.signal).toBe(controller.signal);
    controller.abort();
    await drain();
    expect(running.result).toEqual({ error: controller.signal.reason });
    for (const [, listener] of added.mock.calls) expect(removed).toHaveBeenCalledWith('abort', listener);
    if (ending === 'resolve') pending.resolve(response);
    else pending.reject(new Error('late HTTP failure'));
    await drain();
    expect(cancel).toHaveBeenCalledTimes(ending === 'resolve' ? 1 : 0);
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.request).toHaveBeenCalledOnce();
  });

  it('stops a challenge-triggered shared-refresh wait without a further API attempt', async () => {
    const f = fixture();
    const pending = deferred(credential);
    const entered = deferred<void>(undefined);
    f.request.mockResolvedValueOnce(challenged('invalid_token'));
    f.refresh.mockImplementationOnce(() => {
      entered.resolve();
      return pending.promise;
    });
    const controller = new AbortController();
    const running = observe(fetchWithDpop(f.context, target, { signal: controller.signal }));
    await entered.promise;
    controller.abort();
    await drain();
    expect(running.result).toEqual({ error: controller.signal.reason });
    pending.resolve(credential);
    await drain();
    expect(f.refresh).toHaveBeenCalledExactlyOnceWith({ rejectedToken: credential.accessToken });
    expect(f.getKey).toHaveBeenCalledOnce();
    expect(createDpopProof).toHaveBeenCalledOnce();
    expect(f.request).toHaveBeenCalledOnce();
  });

  it('detaches caller listeners after a successful response and leaves its body with the caller', async () => {
    const f = fixture();
    const response = Response.json({ caller: true });
    const cancel = vi.spyOn(response.body!, 'cancel');
    f.request.mockResolvedValueOnce(response);
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, 'addEventListener');
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    await expect(fetchWithDpop(f.context, target, { signal: controller.signal })).resolves.toBe(response);
    for (const [, listener] of added.mock.calls) expect(removed).toHaveBeenCalledWith('abort', listener);
    expect(cancel).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ caller: true });
  });
});

describe.each(['use_dpop_nonce', 'invalid_token'] as const)('DPH-03 %s response cleanup', (challenge) => {
  it.each(['throws', 'rejects', 'stalls'] as const)(
    '%s from cancel cannot stall a retry or replace its result',
    async (behavior) => {
      const f = fixture();
      const response = challenged(challenge);
      const cancellation = deferred<void>(undefined);
      const cancel = vi.spyOn(response.body!, 'cancel').mockImplementation(() => {
        if (behavior === 'throws') throw new Error('cancel threw');
        if (behavior === 'rejects') return Promise.reject(new Error('cancel rejected'));
        return cancellation.promise;
      });
      const success = Response.json({ ok: true });
      f.request.mockResolvedValueOnce(response).mockResolvedValueOnce(success);
      const running = observe(fetchWithDpop(f.context, target));
      await drain();
      expect(cancel).toHaveBeenCalledOnce();
      expect(running.result).toEqual({ value: success });
      expect(f.request).toHaveBeenCalledTimes(2);
      expect(f.refresh).toHaveBeenCalledTimes(challenge === 'invalid_token' ? 1 : 0);
      expect(createDpopProof).toHaveBeenCalledTimes(2);
      if (behavior === 'stalls') cancellation.reject(new Error('late cancellation failure'));
    },
  );

  it('preserves the next primary failure when cleanup rejects', async () => {
    const f = fixture();
    const response = challenged(challenge);
    vi.spyOn(response.body!, 'cancel').mockRejectedValue(new Error('secondary cleanup failure'));
    const primary = new TypeError('primary transport/refresh failure');
    f.request.mockResolvedValueOnce(response);
    if (challenge === 'invalid_token') f.refresh.mockRejectedValueOnce(primary);
    else f.request.mockRejectedValueOnce(primary);
    await expect(fetchWithDpop(f.context, target)).rejects.toBe(primary);
    expect(f.request).toHaveBeenCalledTimes(challenge === 'invalid_token' ? 1 : 2);
    expect(f.clear).not.toHaveBeenCalled();
  });

  it('stops further work if cleanup itself synchronously aborts the caller', async () => {
    const f = fixture();
    const response = challenged(challenge);
    const controller = new AbortController();
    const reason = new Error('caller cancelled');
    vi.spyOn(response.body!, 'cancel').mockImplementation(() => {
      controller.abort(reason);
      throw new Error('secondary cleanup failure');
    });
    f.request.mockResolvedValueOnce(response);
    await expect(fetchWithDpop(f.context, target, { signal: controller.signal })).rejects.toBe(reason);
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.getKey).toHaveBeenCalledOnce();
    expect(createDpopProof).toHaveBeenCalledOnce();
    expect(f.request).toHaveBeenCalledOnce();
  });

  it('discards a response delivered as the caller aborts without starting any retry', async () => {
    const f = fixture();
    const response = challenged(challenge);
    const cancel = vi.spyOn(response.body!, 'cancel').mockImplementation(() => new Promise<void>(() => {}));
    const controller = new AbortController();
    f.request.mockImplementationOnce(async () => {
      controller.abort();
      return response;
    });
    const running = observe(fetchWithDpop(f.context, target, { signal: controller.signal }));
    await drain();
    expect(running.result).toEqual({ error: controller.signal.reason });
    expect(cancel).toHaveBeenCalledOnce();
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.request).toHaveBeenCalledOnce();
  });

  it('returns the repeated challenge at the existing retry limit despite failed cleanup', async () => {
    const f = fixture();
    const first = challenged(challenge);
    const last = challenged(challenge);
    vi.spyOn(first.body!, 'cancel').mockRejectedValue(new Error('cleanup failed'));
    const lastCancel = vi.spyOn(last.body!, 'cancel');
    f.request.mockResolvedValueOnce(first).mockResolvedValueOnce(last);
    await expect(fetchWithDpop(f.context, target)).resolves.toBe(last);
    expect(lastCancel).not.toHaveBeenCalled();
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(f.refresh).toHaveBeenCalledTimes(challenge === 'invalid_token' ? 1 : 0);
  });
});

describe('DPH-03 API transport failures', () => {
  it.each(['GET', 'POST'])(
    'never automatically retries a %s network failure, even with idempotent opt-in',
    async (method) => {
      const f = fixture();
      const failure = new TypeError('network unavailable');
      f.request.mockRejectedValueOnce(failure);
      await expect(fetchWithDpop(f.context, target, { method, retry: 'idempotent' })).rejects.toBe(failure);
      expect(f.request).toHaveBeenCalledOnce();
      expect(f.refresh).not.toHaveBeenCalled();
    },
  );
});
