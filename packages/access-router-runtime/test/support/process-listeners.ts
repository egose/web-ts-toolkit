export type ListenerSnapshot = Map<string | NodeJS.Signals, Set<(...args: unknown[]) => void>>;

export const RUNTIME_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

export function captureListenerSnapshot(
  events: ReadonlyArray<string | NodeJS.Signals> = RUNTIME_SIGNALS,
): ListenerSnapshot {
  const snapshot: ListenerSnapshot = new Map();

  for (const event of events) {
    snapshot.set(event, new Set(process.listeners(event) as Array<(...args: unknown[]) => void>));
  }

  return snapshot;
}

export function getListenerCounts(
  events: ReadonlyArray<string | NodeJS.Signals> = RUNTIME_SIGNALS,
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const event of events) {
    counts[event] = process.listenerCount(event);
  }

  return counts;
}

export function restoreListenerSnapshot(
  snapshot: ListenerSnapshot,
  events: ReadonlyArray<string | NodeJS.Signals> = RUNTIME_SIGNALS,
): void {
  for (const event of events) {
    const expectedListeners = snapshot.get(event) ?? new Set();
    const currentListeners = process.listeners(event) as Array<(...args: unknown[]) => void>;

    for (const listener of currentListeners) {
      if (!expectedListeners.has(listener)) {
        process.removeListener(event, listener);
      }
    }

    for (const listener of expectedListeners) {
      if (!currentListeners.includes(listener)) {
        process.on(event, listener);
      }
    }
  }
}

export async function withListenerSnapshot<T>(
  callback: (snapshot: ListenerSnapshot) => Promise<T> | T,
  events: ReadonlyArray<string | NodeJS.Signals> = RUNTIME_SIGNALS,
): Promise<T> {
  const snapshot = captureListenerSnapshot(events);

  try {
    return await callback(snapshot);
  } finally {
    restoreListenerSnapshot(snapshot, events);
  }
}
