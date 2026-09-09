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

  /**
   * BMRX-16 error-middleware completion policy (operation-local):
   * - Each `exec()` invocation runs error hooks at most once, tracked by a
   *   local completion flag — never by mutating the caller's thrown value.
   *   Frozen errors, primitive throws, and reused Error instances therefore
   *   cannot lose handling or suppress a later operation.
   * - Error-hook return values are ignored (success path is unchanged).
   * - When an error hook itself throws/rejects, remaining error hooks are
   *   skipped and the hook failure supersedes as the thrown error. Where the
   *   hook failure is an extensible object without its own `cause`, the
   *   original error is attached as `cause` (best effort; frozen/sealed hook
   *   errors are rethrown unchanged).
   */
  async runPostError(method: string, target: any, err: unknown): Promise<unknown> {
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
    } catch (original) {
      // Operation-local completion: run error hooks exactly once for this
      // exec() invocation without marking the thrown value.
      try {
        await this.runPostError(method, target, original);
      } catch (handlerError) {
        throw preserveErrorCause(handlerError, original);
      }
      throw original;
    }
  }
}

/**
 * Best-effort `cause` preservation when error middleware itself fails.
 * Attaches `original` as `cause` only when the handler failure is an
 * extensible object without its own `cause`; frozen/sealed objects and
 * primitives are returned unchanged rather than replaced by a TypeError.
 */
export function preserveErrorCause(handlerError: unknown, original: unknown): unknown {
  if (typeof handlerError === 'object' && handlerError !== null) {
    try {
      if ((handlerError as any).cause === undefined && Object.isExtensible(handlerError)) {
        Object.defineProperty(handlerError, 'cause', {
          value: original,
          configurable: true,
          writable: true,
        });
      }
    } catch {
      // Frozen/sealed handler errors cannot carry a cause; rethrow as-is.
    }
  }
  return handlerError;
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
