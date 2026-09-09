import type {
  JsonRouteBuilder,
  JsonRouterCallback,
  JsonRouterEndpoint,
  JsonRouterHandlerInput,
  JsonRouterMethod,
  JsonRouterMiddlewares,
  JsonRouterRouteRegistrar,
} from '@web-ts-toolkit/express-json-router';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- this fixture verifies CommonJS package consumption.
const JsonRouterModule: typeof import('@web-ts-toolkit/express-json-router') = require('@web-ts-toolkit/express-json-router');

const JsonRouter = JsonRouterModule.default;
const router = new JsonRouter();
const callback: JsonRouterCallback<{ id: string }, { ok: boolean }> = (req) => ({ ok: req.params.id.length > 0 });

class ManualThenable<T> implements PromiseLike<T> {
  constructor(private readonly value: T) {}

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    void onrejected;

    if (typeof onfulfilled === 'function') {
      return Promise.resolve(onfulfilled(this.value));
    }

    return Promise.resolve(undefined as unknown as TResult1 | TResult2);
  }
}

const promiseLikeCallback: JsonRouterCallback<{ id: string }, { ok: boolean }, unknown, Record<string, string | string[] | undefined>, Record<string, unknown>, { ok: boolean }> = () =>
  new ManualThenable<{ ok: boolean }>({ ok: true });
const input: JsonRouterHandlerInput<{ id: string }, { ok: boolean }> = callback;
const middlewares: JsonRouterMiddlewares = [() => ({ ok: true })];
const registrar: JsonRouterRouteRegistrar = router.get;
const builder: JsonRouteBuilder = router.route('/builder');
const method: JsonRouterMethod = 'get';

router.get<{ id: string }, { ok: boolean }>('/users/:id', callback);
router.get<{ id: string }, { ok: boolean }, unknown, Record<string, string | string[] | undefined>, Record<string, unknown>, { ok: boolean }>('/users/:id', promiseLikeCallback);
builder.post(input);
builder.post<{ id: string }, { ok: boolean }, unknown, Record<string, string | string[] | undefined>, Record<string, unknown>, { ok: boolean }>(promiseLikeCallback);
registrar('/health', () => ({ ok: true }));

const endpoints: JsonRouterEndpoint[] = router.getEndpoints();

// @ts-expect-error internal registry is not public in CJS declarations
void router.endpoints;
// Malformed thenables are rejected in CJS declarations.
const malformedCallback: JsonRouterCallback<{ id: string }, { ok: boolean }, unknown, Record<string, string | string[] | undefined>, Record<string, unknown>, { ok: boolean }> = () => ({
  // @ts-expect-error constrained async returns must be PromiseLike-compatible
  then: 'not-a-function',
});
// @ts-expect-error internal constructor type is not exported from the package root
const internalConstructor: import('@web-ts-toolkit/express-json-router').JsonRouterConstructor | undefined = undefined;

void [endpoints, internalConstructor, method, middlewares, promiseLikeCallback, malformedCallback];
