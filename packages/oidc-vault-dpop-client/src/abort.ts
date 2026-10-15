/** Best-effort cleanup must neither delay settlement nor replace the primary outcome. */
export const bestEffort = (cleanup: () => unknown): void => {
  try {
    void Promise.resolve(cleanup()).catch(() => {});
  } catch {
    // Custom transports/streams may throw synchronously, too.
  }
};

export const cancelResponse = (response: Response): void => bestEffort(() => response.body?.cancel());

export const assertNotAborted = (signal?: AbortSignal | null): void => {
  if (signal?.aborted) throw signal.reason;
};

/** Cancel this wait, not shared work. Observe late rejections and discard late owned results. */
export const abortable = <T>(
  signal: AbortSignal | null | undefined,
  start: () => Promise<T>,
  discard?: (value: T) => void,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const detach = () => signal?.removeEventListener('abort', onAbort);
    const onAbort = () => {
      detach();
      reject(signal!.reason);
    };
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    const failed = (error: unknown) => {
      detach();
      reject(signal?.aborted ? signal.reason : error);
    };
    try {
      void Promise.resolve(start()).then((value) => {
        detach();
        if (signal?.aborted) {
          if (discard) bestEffort(() => discard(value));
          reject(signal.reason);
        } else resolve(value);
      }, failed);
    } catch (error) {
      failed(error);
    }
  });
