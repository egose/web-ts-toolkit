import type { OidcVaultAccessToken } from './credentials';
import { OidcVaultDpopClientError } from './errors';

const MAX_DELAY = 2_147_483_647;
const MIN_CADENCE = 1_000;

/** Opt-in browser scheduling; neither option measures user activity or overrides absolute session expiry. */
export interface OidcVaultDpopAutoRefreshOptions {
  /**
   * Milliseconds before effective access-token expiry; default 60,000 when
   * enabled. Integer 0..2,147,483,647. Capped to half the initial lifetime when
   * acquisition time is known, with a one-second minimum scheduled cadence.
   * This is a lead time, not a periodic interval or provider idle timeout.
   */
  refreshBeforeExpiryMs?: number;
  /**
   * Optional explicit keep-alive deadline since successful acquisition, with
   * no default. Integer 1,000..2,147,483,647 milliseconds. May keep the upstream
   * session active while the user is idle; browser suspension defeats timers.
   * Missing/old cookie timing hints make this deadline due, never fresh activity.
   */
  maxRefreshIntervalMs?: number;
}

export const resolveAutoRefreshOptions = (value: false | OidcVaultDpopAutoRefreshOptions | undefined) => {
  if (value === undefined || value === false) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError('autoRefresh must be false or an options object.');
  const { refreshBeforeExpiryMs = 60_000, maxRefreshIntervalMs } = value;
  if (!Number.isSafeInteger(refreshBeforeExpiryMs) || refreshBeforeExpiryMs < 0 || refreshBeforeExpiryMs > MAX_DELAY)
    throw new TypeError('refreshBeforeExpiryMs must be an integer from 0 to 2147483647 milliseconds.');
  if (
    maxRefreshIntervalMs !== undefined &&
    (!Number.isSafeInteger(maxRefreshIntervalMs) ||
      maxRefreshIntervalMs < MIN_CADENCE ||
      maxRefreshIntervalMs > MAX_DELAY)
  )
    throw new TypeError('maxRefreshIntervalMs must be an integer from 1000 to 2147483647 milliseconds.');
  return Object.freeze({ refreshBeforeExpiryMs, maxRefreshIntervalMs });
};

const clockError = () => new OidcVaultDpopClientError('INVALID_DPOP_TIME', 'The proof clock is invalid.');
const expired = (token: OidcVaultAccessToken) =>
  new OidcVaultDpopClientError(
    token.tokenType === 'DPoP' ? 'DPOP_ACCESS_TOKEN_EXPIRED' : 'BEARER_ACCESS_TOKEN_EXPIRED',
    `The ${token.tokenType} access token has expired. Refresh before retrying.`,
  );
const addDeadline = (epoch: number, interval: number) =>
  epoch > Number.MAX_SAFE_INTEGER - interval ? Number.MAX_SAFE_INTEGER : epoch + interval;

/** Private timer owner. Credential publication and the session FIFO/lock remain owned by auth-session. */
export const createAutoRefreshScheduler = (
  options: NonNullable<ReturnType<typeof resolveAutoRefreshOptions>>,
  hooks: {
    now(): number;
    busy(): boolean;
    refresh(intent: number): Promise<OidcVaultAccessToken>;
    onError?: (error: unknown) => void;
  },
) => {
  let token: OidcVaultAccessToken | undefined;
  let refreshedAt: number | undefined;
  let active = false;
  let disposed = false;
  let intent = 0;
  let outcome = 0;
  let running = false;
  let lastAttemptAt: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timerRevision = 0;
  const clock = () => {
    const value = hooks.now();
    if (!Number.isSafeInteger(value) || value < 0) throw clockError();
    return value;
  };
  const clearTimer = () => {
    timerRevision++;
    clearTimeout(timer);
    timer = undefined;
  };
  const current = (captured: number) => !disposed && captured === intent;
  const fail = (error: unknown, captured = intent) => {
    if (!current(captured)) return;
    active = false;
    clearTimer();
    if (
      error instanceof OidcVaultDpopClientError &&
      ['DPOP_OPERATION_SUPERSEDED', 'DPOP_SESSION_DISPOSED'].includes(error.code)
    )
      return;
    const failedOutcome = ++outcome;
    queueMicrotask(() => {
      if (!current(captured) || failedOutcome !== outcome) return;
      try {
        void Promise.resolve(hooks.onError?.(error)).catch(() => {});
      } catch {
        // No application observer can authorize a retry or undo committed auth.
      }
    });
  };
  const deadline = (now: number, cadence = true): number => {
    if (!token) return Number.MAX_SAFE_INTEGER;
    const acquired =
      refreshedAt !== undefined &&
      Number.isSafeInteger(refreshedAt) &&
      refreshedAt >= 0 &&
      refreshedAt <= now &&
      refreshedAt < token.expiresAt
        ? refreshedAt
        : undefined;
    const lead =
      acquired === undefined
        ? options.refreshBeforeExpiryMs
        : Math.min(options.refreshBeforeExpiryMs, Math.floor((token.expiresAt - acquired) / 2));
    let due = Math.max(0, token.expiresAt - lead);
    if (options.maxRefreshIntervalMs !== undefined)
      due = Math.min(due, acquired === undefined ? now : addDeadline(acquired, options.maxRefreshIntervalMs));
    if (acquired !== undefined) due = Math.max(due, addDeadline(acquired, MIN_CADENCE));
    if (cadence && lastAttemptAt !== undefined) due = Math.max(due, addDeadline(lastAttemptAt, MIN_CADENCE));
    return due;
  };
  const arm = () => {
    clearTimer();
    if (!active || disposed || running || hooks.busy() || !token) return;
    try {
      const now = clock();
      if (token.expiresAt <= now) {
        fail(expired(token));
        return;
      }
      const revision = timerRevision;
      const captured = intent;
      timer = setTimeout(
        () => {
          if (revision !== timerRevision || !current(captured)) return;
          timer = undefined;
          wake();
        },
        Math.min(MAX_DELAY, Math.max(0, deadline(now) - now)),
      );
    } catch (error) {
      fail(error);
    }
  };
  const wake = () => {
    if (!active || disposed || running || hooks.busy() || !token) return;
    const captured = intent;
    try {
      const now = clock();
      if (now < deadline(now)) {
        arm();
        return;
      }
      clearTimer();
      const baseline = token;
      running = true;
      lastAttemptAt = now;
      void Promise.resolve()
        .then(() => {
          if (current(captured) && active) return hooks.refresh(captured);
        })
        .catch((error: unknown) => {
          // An unsolicited winner may replace an old credential while HTTP fails.
          // That failure has no authority to pause/notify for the newer winner.
          if (token && token.generation !== baseline.generation) return;
          fail(error, captured);
        })
        .finally(() => {
          running = false;
          arm();
        })
        .catch(() => {});
    } catch (error) {
      fail(error, captured);
    }
  };
  const page = typeof window === 'undefined' ? undefined : window;
  const visibility = typeof document === 'undefined' ? undefined : document;
  const onVisible = () => {
    if (visibility?.visibilityState === 'visible') wake();
  };
  page?.addEventListener('pageshow', wake);
  visibility?.addEventListener('visibilitychange', onVisible);

  return {
    capture: () => intent,
    isCurrent: current,
    // A fired timer sets the cadence floor before enqueuing. Its own refresh
    // must not interpret that floor as evidence that the deadline was postponed.
    isDue(captured: number) {
      const now = clock();
      return current(captured) && active && token !== undefined && now >= deadline(now, false);
    },
    replace(next: OidcVaultAccessToken, acquisitionTime?: number) {
      if (disposed) return;
      if (token?.generation !== next.generation) outcome++;
      token = next;
      refreshedAt = acquisitionTime;
      arm();
    },
    activate(captured: number) {
      if (!current(captured)) return;
      outcome++;
      active = true;
      arm();
    },
    settled: arm,
    pause() {
      active = false;
      outcome++;
      clearTimer();
    },
    clear() {
      active = false;
      outcome++;
      token = undefined;
      refreshedAt = undefined;
      clearTimer();
    },
    cancel() {
      intent++;
      outcome++;
      active = false;
      clearTimer();
      return intent;
    },
    dispose() {
      disposed = true;
      active = false;
      token = undefined;
      refreshedAt = undefined;
      lastAttemptAt = undefined;
      outcome++;
      clearTimer();
      page?.removeEventListener('pageshow', wake);
      visibility?.removeEventListener('visibilitychange', onVisible);
    },
  };
};
