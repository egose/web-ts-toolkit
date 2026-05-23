import { AsyncLocalStorage } from 'node:async_hooks';
import mongoose from 'mongoose';
import type { AccessRuntime } from './runtime';

export const ACCESS_RUNTIME = Symbol('access-runtime');

const runtimeStorage = new AsyncLocalStorage<AccessRuntime>();

export function runWithRuntime<T>(runtime: AccessRuntime, callback: () => T): T {
  return runtimeStorage.run(runtime, callback);
}

export function getActiveRuntime() {
  return runtimeStorage.getStore() ?? null;
}

export function attachRuntimeToModel(modelName: string, runtime: AccessRuntime) {
  const model = mongoose.models[modelName] as
    | (mongoose.Model<unknown> & { [ACCESS_RUNTIME]?: AccessRuntime })
    | undefined;
  if (model) {
    model[ACCESS_RUNTIME] = runtime;
  }
}

export function getRuntimeForModelName(modelName: string) {
  const model = mongoose.models[modelName] as
    | (mongoose.Model<unknown> & { [ACCESS_RUNTIME]?: AccessRuntime })
    | undefined;
  return model?.[ACCESS_RUNTIME] ?? null;
}
