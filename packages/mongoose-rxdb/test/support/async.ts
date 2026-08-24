export interface Deferred<T = void> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

export function createDeferred<T = void>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export interface Barrier {
  readonly entered: number;
  readonly allEntered: Promise<void>;
  wait(): Promise<void>;
  release(): void;
}

export function createBarrier(parties: number): Barrier {
  if (!Number.isInteger(parties) || parties < 1) throw new Error('Barrier requires at least one party');
  const allEntered = createDeferred<void>();
  const released = createDeferred<void>();
  let entered = 0;

  return {
    get entered() {
      return entered;
    },
    allEntered: allEntered.promise,
    async wait() {
      entered += 1;
      if (entered === parties) allEntered.resolve();
      await released.promise;
    },
    release() {
      released.resolve();
    },
  };
}

export function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
