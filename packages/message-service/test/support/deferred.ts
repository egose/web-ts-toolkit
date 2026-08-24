export type DeferredBarrier = {
  readonly label: string;
  readonly reached: Promise<void>;
  arrive: () => Promise<void>;
  release: () => void;
};

export function createDeferredBarrier(label: string): DeferredBarrier {
  let reached = false;
  let released = false;
  let resolveReached!: () => void;
  let resolveRelease!: () => void;

  const reachedPromise = new Promise<void>((resolve) => {
    resolveReached = resolve;
  });
  const releasePromise = new Promise<void>((resolve) => {
    resolveRelease = resolve;
  });

  return {
    label,
    reached: reachedPromise,
    arrive: async () => {
      if (!reached) {
        reached = true;
        resolveReached();
      }
      await releasePromise;
    },
    release: () => {
      if (!released) {
        released = true;
        resolveRelease();
      }
    },
  };
}

export type MessageServiceBarriers = {
  reservationAcquired: DeferredBarrier;
  firstBatchItemCommitted: DeferredBarrier;
  actionClaimed: DeferredBarrier;
  archiveCommitted: DeferredBarrier;
};

export function createMessageServiceBarriers(): MessageServiceBarriers {
  return {
    reservationAcquired: createDeferredBarrier('reservation acquired'),
    firstBatchItemCommitted: createDeferredBarrier('first batch item committed'),
    actionClaimed: createDeferredBarrier('action claimed'),
    archiveCommitted: createDeferredBarrier('archive committed'),
  };
}
