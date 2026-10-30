import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAutoRefreshScheduler,
  resolveAutoRefreshOptions,
  type OidcVaultDpopAutoRefreshOptions,
} from '../src/auto-refresh';
import type { DpopAccessToken } from '../src/credentials';
import { OidcVaultDpopClientError } from '../src/errors';

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60_000;
const owners: Array<ReturnType<typeof createAutoRefreshScheduler>> = [];
let page: EventTarget;
let visibility: EventTarget & { visibilityState: string };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  page = new EventTarget();
  visibility = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('window', page);
  vi.stubGlobal('document', visibility);
});
afterEach(async () => {
  for (const owner of owners.splice(0)) owner.dispose();
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const credential = (expiresAt = Date.now() + HOUR, generation = crypto.randomUUID()): DpopAccessToken => ({
  accessToken: generation,
  generation,
  expiresAt,
  tokenType: 'DPoP',
  jkt: 'A'.repeat(43),
});
const fixture = (options: OidcVaultDpopAutoRefreshOptions = {}) => {
  const onError = vi.fn();
  let busy = false;
  const refresh = vi.fn(async () => {
    const next = credential();
    owner.replace(next, Date.now());
    return next;
  });
  const owner = createAutoRefreshScheduler(resolveAutoRefreshOptions(options)!, {
    now: Date.now,
    busy: () => busy,
    refresh,
    onError,
  });
  owners.push(owner);
  const start = (next = credential(), acquired: number | undefined = Date.now()) => {
    owner.replace(next, acquired);
    owner.activate(owner.capture());
    return next;
  };
  return {
    owner,
    refresh,
    onError,
    start,
    setBusy: (value: boolean) => {
      busy = value;
    },
  };
};

describe('OVAR-04 scheduler policy', () => {
  it('is dormant before explicit acquisition and schedules a one-hour token at minute 59', async () => {
    const f = fixture();
    expect(vi.getTimerCount()).toBe(0);
    f.owner.replace(credential(), NOW);
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(f.refresh).not.toHaveBeenCalled();
    f.start();
    await vi.advanceTimersByTimeAsync(59 * 60_000 - 1);
    expect(f.refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.refresh).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('uses an explicit 20-minute maximum rather than one-hour token expiry', async () => {
    const f = fixture({ maxRefreshIntervalMs: 20 * 60_000 });
    f.start();
    await vi.advanceTimersByTimeAsync(20 * 60_000 - 1);
    expect(f.refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.refresh).toHaveBeenCalledOnce();
  });

  it('caps lead time to half of a short credential lifetime', async () => {
    const f = fixture();
    f.start(credential(NOW + 60_000));
    await vi.advanceTimersByTimeAsync(29_999);
    expect(f.refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.refresh).toHaveBeenCalledOnce();
  });

  it('permits zero lead and refreshes at expiry, including a late wake', async () => {
    const f = fixture({ refreshBeforeExpiryMs: 0 });
    f.start(credential(NOW + 5_000));
    vi.setSystemTime(NOW + 10_000);
    page.dispatchEvent(new Event('pageshow'));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.refresh).toHaveBeenCalledOnce();
  });

  it('retains a one-second cadence for repeated live short/no-progress results', async () => {
    const f = fixture({ refreshBeforeExpiryMs: 60_000 });
    f.refresh.mockImplementation(async () => {
      const next = credential(Date.now() + 1_500);
      f.owner.replace(next, Date.now());
      return next;
    });
    f.start(credential(NOW + 1_500));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.refresh).toHaveBeenCalledTimes(10);
  });

  it('pauses valid zero-lifetime credentials without refreshing or clearing auth', async () => {
    const f = fixture();
    f.start(credential(NOW));
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: 'DPOP_ACCESS_TOKEN_EXPIRED', requiresLogin: false }),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds long delays and overflowing interval addition without early work', async () => {
    const f = fixture({ refreshBeforeExpiryMs: 0 });
    f.start(credential(Number.MAX_SAFE_INTEGER));
    await vi.advanceTimersByTimeAsync(2_147_483_647);
    expect(f.refresh).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    const owner = createAutoRefreshScheduler(resolveAutoRefreshOptions({ maxRefreshIntervalMs: 2_147_483_647 })!, {
      now: () => Number.MAX_SAFE_INTEGER - 5_000,
      busy: () => false,
      refresh: f.refresh,
      onError: f.onError,
    });
    owners.push(owner);
    owner.replace(credential(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER - 5_000);
    owner.activate(owner.capture());
    expect(f.onError).not.toHaveBeenCalled();
  });

  it.each([undefined, NaN, Infinity, -1, NOW + HOUR])(
    'treats missing/malformed/future hint %s as due for keep-alive',
    async (hint) => {
      const f = fixture({ maxRefreshIntervalMs: 20 * 60_000 });
      f.owner.replace(credential(), hint);
      f.owner.activate(f.owner.capture());
      await vi.advanceTimersByTimeAsync(0);
      expect(f.refresh).toHaveBeenCalledOnce();
    },
  );

  it('does not reinterpret a delayed peer receipt as fresh acquisition', async () => {
    const f = fixture({ maxRefreshIntervalMs: 20 * 60_000 });
    vi.setSystemTime(NOW + 19 * 60_000);
    f.start(credential(NOW + HOUR), NOW);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.refresh).toHaveBeenCalledOnce();
  });

  it('checks clock rollback and does not turn a resume event into an early expiry refresh', async () => {
    const f = fixture();
    f.start();
    vi.setSystemTime(NOW - 60_000);
    page.dispatchEvent(new Event('pageshow'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.refresh).not.toHaveBeenCalled();
  });

  it('contains invalid runtime clocks and reports a paused error', async () => {
    const f = fixture();
    f.start();
    vi.spyOn(Date, 'now').mockReturnValue(-1);
    // The captured default clock is checked independently by a fresh scheduler.
    const owner = createAutoRefreshScheduler(resolveAutoRefreshOptions({})!, {
      now: () => -1,
      busy: () => false,
      refresh: f.refresh,
      onError: f.onError,
    });
    owners.push(owner);
    owner.replace(credential(NOW + HOUR), NOW);
    owner.activate(owner.capture());
    await vi.advanceTimersByTimeAsync(0);
    expect(f.onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code: 'INVALID_DPOP_TIME' }));
    expect(f.refresh).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('pauses failures, ignores visible/pageshow and unsolicited peers, then rearms explicit success', async () => {
    const f = fixture({ maxRefreshIntervalMs: 1_000 });
    const failure = new TypeError('network unavailable');
    f.refresh.mockRejectedValueOnce(failure);
    f.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.onError).toHaveBeenCalledExactlyOnceWith(failure);
    f.owner.replace(credential(), Date.now());
    page.dispatchEvent(new Event('pageshow'));
    visibility.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.refresh).toHaveBeenCalledOnce();
    f.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.refresh).toHaveBeenCalledTimes(2);
  });

  it.each(['clear', 'cancel', 'dispose'] as const)(
    'withdraws pending %s work and resume listeners cannot resurrect it',
    async (method) => {
      const f = fixture({ maxRefreshIntervalMs: 1_000 });
      f.start();
      f.owner[method]();
      page.dispatchEvent(new Event('pageshow'));
      visibility.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(f.refresh).not.toHaveBeenCalled();
      expect(f.onError).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('waits for mutation ownership to settle before arming', async () => {
    const f = fixture({ maxRefreshIntervalMs: 1_000 });
    f.setBusy(true);
    f.start();
    expect(vi.getTimerCount()).toBe(0);
    f.setBusy(false);
    f.owner.settled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.refresh).toHaveBeenCalledOnce();
  });

  it('silently pauses superseded work without repeatedly retrying an unadopted old credential', async () => {
    const f = fixture({ maxRefreshIntervalMs: 1_000 });
    f.refresh.mockRejectedValueOnce(new OidcVaultDpopClientError('DPOP_OPERATION_SUPERSEDED', 'Superseded.'));
    f.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.refresh).toHaveBeenCalledOnce();
    expect(f.onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drops a queued failure notification after newer clearing or acquisition', async () => {
    const f = fixture();
    f.start(credential(NOW)); // queues a zero-lifetime background failure
    f.owner.clear();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.onError).not.toHaveBeenCalled();
    f.start(credential(NOW));
    f.start(credential());
    await vi.advanceTimersByTimeAsync(0);
    expect(f.onError).not.toHaveBeenCalled();
  });
});

describe('OVAR-04 configuration validation', () => {
  it('keeps omission and false disabled', () => {
    expect(resolveAutoRefreshOptions(undefined)).toBeUndefined();
    expect(resolveAutoRefreshOptions(false)).toBeUndefined();
  });
  it.each([true, null, 1, 'enabled', []])('rejects invalid configuration %s', (value) => {
    expect(() => resolveAutoRefreshOptions(value as OidcVaultDpopAutoRefreshOptions)).toThrow(TypeError);
  });
  it.each([-1, 0.5, NaN, Infinity, 2_147_483_648])('rejects invalid lead %s', (refreshBeforeExpiryMs) => {
    expect(() => resolveAutoRefreshOptions({ refreshBeforeExpiryMs })).toThrow(TypeError);
  });
  it.each([0, 999, 1000.5, NaN, Infinity, 2_147_483_648])('rejects invalid interval %s', (maxRefreshIntervalMs) => {
    expect(() => resolveAutoRefreshOptions({ maxRefreshIntervalMs })).toThrow(TypeError);
  });
  it('snapshots options and accepts inclusive bounds', () => {
    const value = { refreshBeforeExpiryMs: 0, maxRefreshIntervalMs: 1_000 };
    const resolved = resolveAutoRefreshOptions(value);
    value.maxRefreshIntervalMs = 2_000;
    expect(resolved).toEqual({ refreshBeforeExpiryMs: 0, maxRefreshIntervalMs: 1_000 });
    expect(
      resolveAutoRefreshOptions({ refreshBeforeExpiryMs: 2_147_483_647, maxRefreshIntervalMs: 2_147_483_647 }),
    ).toBeDefined();
  });
});
