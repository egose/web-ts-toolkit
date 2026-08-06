import { AsyncLocalStorage } from 'node:async_hooks';
import type { AccessRuntime } from './runtime';

const runtimeStorage = new AsyncLocalStorage<AccessRuntime>();

export function runWithRuntime<T>(runtime: AccessRuntime, callback: () => T): T {
  return runtimeStorage.run(runtime, callback);
}

export function getActiveRuntime() {
  return runtimeStorage.getStore() ?? null;
}
