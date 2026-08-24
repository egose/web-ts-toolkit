import type { Schema } from './schema';

export interface HookContext {
  method: string;
  schema: Schema<any, any, any, any>;
  document?: any;
  query?: any;
  args: any[];
  result?: any;
  error?: Error;
}

type HookEntry = { fn: any; options?: any };

export class MiddlewareEngine {
  constructor(private schema: Schema<any, any, any, any>) {}

  private preEntries(method: string): HookEntry[] {
    return this.schema.preHooks.get(method) ?? [];
  }

  private postEntries(method: string): HookEntry[] {
    return this.schema.postHooks.get(method) ?? [];
  }

  async runPre(method: string, target: any, args: any[] = []): Promise<void> {
    for (const entry of this.preEntries(method)) {
      await invokeSyncOrPromise(target, entry.fn, args, 'pre');
    }
  }

  async runPost<T>(method: string, target: any, result: T): Promise<T> {
    let acc = result;
    for (const entry of this.postEntries(method)) {
      if (entry.options?.errorHandler) continue;
      const r = await invokeSyncOrPromise(target, entry.fn, [acc]);
      if (r !== undefined) acc = r;
    }
    return acc;
  }

  async runPostError(method: string, target: any, err: Error): Promise<Error> {
    const entries = this.postEntries(method);
    for (const entry of entries) {
      if (entry.options?.errorHandler && typeof entry.fn === 'function') {
        await invokeSyncOrPromise(target, entry.fn as any, [err], 'error');
      }
    }
    return err;
  }

  async exec<T>(
    method: string,
    target: any,
    fn: () => Promise<T>,
    opts: { transformResult?: (r: T) => T; preArgs?: any[] } = {},
  ): Promise<T> {
    try {
      await this.runPre(method, target, opts.preArgs ?? []);
      let result: T;
      result = await fn();
      if (opts.transformResult) result = opts.transformResult(result);
      result = await this.runPost<T>(method, target, result);
      return result;
    } catch (e) {
      await this.runPostError(method, target, e as Error);
      if (typeof e === 'object' && e !== null) {
        Object.defineProperty(e, `__mongooseRxdb${method}PostErrorHandled`, { value: true, configurable: true });
      }
      throw e;
    }
  }
}

async function invokeSyncOrPromise(
  target: any,
  fn: any,
  args: any[] = [],
  kind: 'pre' | 'post' | 'error' = 'post',
): Promise<any> {
  const expectsCallback = fn.length > args.length;
  if (expectsCallback) {
    return await new Promise((resolve, reject) => {
      let settled = false;
      const settle = (err?: Error, value?: any) => {
        if (settled) return;
        settled = true;
        err ? reject(err) : resolve(value);
      };
      try {
        const next = (err?: Error) => settle(err);
        const callArgs = kind === 'pre' ? [next, ...args] : [...args, next];
        const returned = fn.call(target, ...callArgs);
        if (returned && typeof returned.then === 'function')
          returned.then((value: any) => settle(undefined, value), settle);
      } catch (e) {
        settle(e as Error);
      }
    });
  }
  return await fn.call(target, ...args);
}

export default MiddlewareEngine;
