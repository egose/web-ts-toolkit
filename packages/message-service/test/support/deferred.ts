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

/**
 * Interleaving milestones for MongoDB lifecycle tests (MSGF-12).
 *
 * `...Created` barriers fire when `Model.create()` returns *inside* a still-
 * uncommitted transaction — that is a create-return milestone, not a commit.
 * While the barrier is held, the writes are invisible to other connections
 * (assert with `countDocuments(...) === 0` from outside the transaction).
 * Commit itself is observed only through committed state *after* the service
 * promise resolves (counts/reads of active vs archive collections).
 *
 * `reservationAcquired` and `actionClaimed` fire on writes that commit
 * outside any transaction (reservation insert, claim `findOneAndUpdate`), so
 * those milestones are already committed state when reached.
 */
export type MessageServiceBarriers = {
  reservationAcquired: DeferredBarrier;
  firstBatchItemCreated: DeferredBarrier;
  actionClaimed: DeferredBarrier;
  archiveCreated: DeferredBarrier;
};

export function createMessageServiceBarriers(): MessageServiceBarriers {
  return {
    reservationAcquired: createDeferredBarrier('reservation acquired'),
    firstBatchItemCreated: createDeferredBarrier('first batch item created (uncommitted)'),
    actionClaimed: createDeferredBarrier('action claimed'),
    archiveCreated: createDeferredBarrier('archive created (uncommitted)'),
  };
}
