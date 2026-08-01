import type { Schema } from './schema';

export interface HookContext {
  method: string;
  schema: Schema;
  document?: any;
  query?: any;
  args: any[];
  result?: any;
  error?: Error;
}

type HookEntry = { fn: any; options?: any };

export class MiddlewareEngine {
  constructor(private schema: Schema) {}

  private preEntries(method: string): HookEntry[] {
    return this.schema.preHooks.get(method) ?? [];
  }

  private postEntries(method: string): HookEntry[] {
    return this.schema.postHooks.get(method) ?? [];
  }

  async runPre(method: string, target: any): Promise<void> {
    for (const entry of this.preEntries(method)) {
      await invokeSyncOrPromise(target, entry.fn);
    }
  }

  async runPost<T>(method: string, target: any, result: T): Promise<T> {
    let acc = result;
    for (const entry of this.postEntries(method)) {
      const r = await invokeSyncOrPromise(target, entry.fn, [acc]);
      if (r !== undefined) acc = r;
    }
    return acc;
  }

  async runPostError(method: string, target: any, err: Error): Promise<Error> {
    const entries = this.postEntries(method);
    for (const entry of entries) {
      if (entry.options?.errorHandler && typeof entry.fn === 'function') {
        await invokeSyncOrPromise(target, entry.fn as any, [err]);
      }
    }
    return err;
  }

  async exec<T>(
    method: string,
    target: any,
    fn: () => Promise<T>,
    opts: { transformResult?: (r: T) => T } = {},
  ): Promise<T> {
    await this.runPre(method, target);
    let result: T;
    try {
      result = await fn();
    } catch (e) {
      await this.runPostError(method, target, e as Error);
      throw e;
    }
    if (opts.transformResult) result = opts.transformResult(result);
    result = await this.runPost<T>(method, target, result);
    return result;
  }
}

async function invokeSyncOrPromise(target: any, fn: any, extraArgs: any[] = []): Promise<any> {
  if (fn.length > extraArgs.length) {
    return await new Promise((resolve, reject) => {
      try {
        const next = (err?: Error) => (err ? reject(err) : resolve(undefined));
        fn.call(target, next, ...extraArgs);
      } catch (e) {
        reject(e as Error);
      }
    });
  }
  return await fn.call(target, ...extraArgs);
}

export default MiddlewareEngine;
