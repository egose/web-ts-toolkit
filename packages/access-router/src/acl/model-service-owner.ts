/** Private model-core/service dispatch ownership. Never carried on request/output DTOs. */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ModelRequest } from '../interfaces';
import { defaultRuntime, type AccessRuntime } from '../runtime';
import { getActiveRuntime, runWithRuntime } from '../runtime-context';

interface Owner {
  readonly request: ModelRequest;
  readonly core: ModelRequest['macl'];
  readonly runtime: AccessRuntime;
}
const cores = new WeakMap<object, Owner>();
const construction = new AsyncLocalStorage<Owner>();
const dispatch = new AsyncLocalStorage<{ receiver: object; options?: unknown }>();

export function hasModelCoreOwner(core: object): boolean {
  return cores.has(core);
}

export function registerModelCoreOwner(core: ModelRequest['macl'], request: ModelRequest, runtime: AccessRuntime) {
  cores.set(core, Object.freeze({ core, request, runtime }));
  bindModelOwnerMethods(core, runtime);
}

export function constructOwnedModelService<T>(core: ModelRequest['macl'], create: () => T): T {
  const owner = cores.get(core)!;
  return runWithRuntime(owner.runtime, () => construction.run(owner, create));
}

export function captureModelServiceOwner(request: ModelRequest): Owner {
  const creating = construction.getStore();
  if (creating?.request === request) return creating;
  return (
    cores.get(request.macl) ?? {
      request,
      core: request.macl,
      runtime: getActiveRuntime() ?? defaultRuntime,
    }
  );
}

/** Keep the real receiver (and WeakMap capability identity), including inherited public entries. */
export function bindModelOwnerMethods(receiver: object, runtime: AccessRuntime): void {
  const seen = new Set<PropertyKey>(['constructor']);
  for (
    let prototype = Object.getPrototypeOf(receiver);
    prototype && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    for (const key of Reflect.ownKeys(prototype)) {
      if (seen.has(key)) continue;
      seen.add(key);
      const method = Object.getOwnPropertyDescriptor(prototype, key)?.value;
      if (typeof method !== 'function') continue;
      Object.defineProperty(receiver, key, {
        configurable: true,
        writable: true,
        value: (...args: unknown[]) =>
          runWithRuntime(runtime, () => {
            const invoke = () => Reflect.apply(method, receiver, args);
            return dispatch.getStore()?.receiver === receiver ? invoke() : dispatch.run({ receiver }, invoke);
          }),
      });
    }
  }
}

/** Fresh top-level dispatch reads live owner options once; nested stages retain that capture. */
export function modelServiceOptions<T>(receiver: object, read: () => T): T {
  const call = dispatch.getStore();
  if (call?.receiver !== receiver) return read();
  return (call.options ??= read()) as T;
}
