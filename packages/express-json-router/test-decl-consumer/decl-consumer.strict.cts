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
const input: JsonRouterHandlerInput<{ id: string }, { ok: boolean }> = callback;
const middlewares: JsonRouterMiddlewares = [() => ({ ok: true })];
const registrar: JsonRouterRouteRegistrar = router.get;
const builder: JsonRouteBuilder = router.route('/builder');
const method: JsonRouterMethod = 'get';

router.get<{ id: string }, { ok: boolean }>('/users/:id', callback);
builder.post(input);
registrar('/health', () => ({ ok: true }));

const endpoints: JsonRouterEndpoint[] = router.getEndpoints();

// @ts-expect-error internal registry is not public in CJS declarations
void router.endpoints;
// @ts-expect-error internal constructor type is not exported from the package root
const internalConstructor: import('@web-ts-toolkit/express-json-router').JsonRouterConstructor | undefined = undefined;

void [endpoints, internalConstructor, method, middlewares];
