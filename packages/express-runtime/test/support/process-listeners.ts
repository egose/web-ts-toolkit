/**
 * Helpers to record process listener baselines and remove only listeners
 * installed by each test or runtime instance; never call removeAllListeners().
 */

export type ListenerSnapshot = Map<NodeJS.Signals | string, Set<(...args: unknown[]) => void>>;

const SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGUSR2'];

/**
 * Capture a snapshot of current listeners for given events.
 */
export function captureListenerSnapshot(events: (string | NodeJS.Signals)[] = [...SIGNALS]): ListenerSnapshot {
  const snap: ListenerSnapshot = new Map();
  for (const ev of events) {
    const listeners = process.listeners(ev as string);
    snap.set(ev, new Set(listeners as Array<(...args: unknown[]) => void>));
  }
  return snap;
}

/**
 * Get listener counts for signals.
 */
export function getListenerCounts(events: (string | NodeJS.Signals)[] = [...SIGNALS]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ev of events) {
    out[ev] = process.listenerCount(ev as string);
  }
  return out;
}

/**
 * Restore to snapshot by removing only newly added listeners and re-adding
 * any that were removed (shouldn't happen, but handles it).
 * Never calls removeAllListeners.
 */
export function restoreListenerSnapshot(
  before: ListenerSnapshot,
  events: (string | NodeJS.Signals)[] = [...SIGNALS],
): void {
  for (const ev of events) {
    const beforeSet = before.get(ev) ?? new Set();
    const current = process.listeners(ev as string) as Array<(...args: unknown[]) => void>;
    // Remove only listeners not in beforeSet
    for (const fn of current) {
      if (!beforeSet.has(fn)) {
        process.removeListener(ev as string, fn);
      }
    }
    // Re-add any missing listeners (if test removed them inadvertently)
    for (const fn of beforeSet) {
      if (!current.includes(fn)) {
        process.on(ev as string, fn);
      }
    }
  }
}

/**
 * Helper to run a function with listener baselining, restoring afterward even on throw.
 */
export async function withListenerBaseline<T>(
  fn: (snapshot: ListenerSnapshot) => Promise<T> | T,
  events: (string | NodeJS.Signals)[] = [...SIGNALS],
): Promise<T> {
  const snap = captureListenerSnapshot(events);
  try {
    return await fn(snap);
  } finally {
    restoreListenerSnapshot(snap, events);
  }
}

/**
 * Remove only the listeners that were added after the snapshot.
 * Returns number removed.
 */
export function removeOnlyNewListeners(
  before: ListenerSnapshot,
  events: (string | NodeJS.Signals)[] = [...SIGNALS],
): number {
  let removed = 0;
  for (const ev of events) {
    const beforeSet = before.get(ev) ?? new Set();
    const current = [...process.listeners(ev as string)] as Array<(...args: unknown[]) => void>;
    for (const fn of current) {
      if (!beforeSet.has(fn)) {
        process.removeListener(ev as string, fn);
        removed += 1;
      }
    }
  }
  return removed;
}

/**
 * Install sentinel listeners that survive tests; useful to verify that
 * tests don't remove unrelated listeners.
 */
export function installSentinelListeners(): {
  sentinelSIGINT: () => void;
  sentinelSIGTERM: () => void;
  cleanup: () => void;
} {
  const sentinelSIGINT = () => {};
  const sentinelSIGTERM = () => {};
  // Tag them for inspection
  Object.defineProperty(sentinelSIGINT, 'name', { value: 'sentinelSIGINT' });
  Object.defineProperty(sentinelSIGTERM, 'name', { value: 'sentinelSIGTERM' });
  process.on('SIGINT', sentinelSIGINT);
  process.on('SIGTERM', sentinelSIGTERM);
  return {
    sentinelSIGINT,
    sentinelSIGTERM,
    cleanup: () => {
      process.removeListener('SIGINT', sentinelSIGINT);
      process.removeListener('SIGTERM', sentinelSIGTERM);
    },
  };
}
