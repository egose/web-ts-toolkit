# `@web-ts-toolkit/express-json-router`

Express router wrapper that routes handler return values through `@web-ts-toolkit/express-response-handler`.

## Installation

```sh
pnpm add @web-ts-toolkit/express-json-router express
pnpm add -D @types/express
```

## Highlights

- return plain values from route handlers
- throw typed HTTP errors
- use custom response-handler instances when you need isolated behavior
- inspect registered endpoints with `getEndpoints()`
- review supported Express route methods with `JsonRouter.supportedMethods`

## Quick Start

```ts
import express from 'express';
import JsonRouter from '@web-ts-toolkit/express-json-router';

const app = express();
const router = new JsonRouter('/api');

router.get('/health', () => ({ ok: true }));

router.get('/users/:id', () => {
  throw new JsonRouter.clientErrors.NotFoundError('User not found');
});

app.use(router.original);
```

## Main Exports

- default-only `JsonRouter` class export
- `JsonRouter.HttpResponse`
- `JsonRouter.clientErrors`
- `JsonRouter.success`
- `JsonRouter.createHandler(...)`
- `JsonRouter.ErrorFormats`
- type imports: `JsonRouterCallback`, `JsonRouterEndpoint`, `JsonRouterHandlerInput`, `JsonRouterMethod`, `JsonRouterMiddlewares`, `JsonRouterRouteRegistrar`, `JsonRouteBuilder`

```ts
import JsonRouter, { type JsonRouterCallback } from '@web-ts-toolkit/express-json-router';

type UserParams = { id: string };

const getUser: JsonRouterCallback<UserParams> = (req) => ({
  id: req.params.id,
});

new JsonRouter('/api').get('/users/:id', getUser);
```

## Supported Route Methods

`JsonRouter.supportedMethods` is the reviewed method contract used for runtime registration, route builder types, endpoint metadata, and emitted declarations. The list tracks the stable route methods exposed by the supported Express 5 runtime.

Route paths intentionally use a narrower contract than Express: `basePath`, route method paths, and `router.route(path)` must be strings. Express also accepts `RegExp` and path pattern arrays, but `JsonRouter` keeps string-only paths so `getEndpoints()` can continue returning unambiguous `{ method, path }` metadata. JavaScript callers that pass a non-string path receive `TypeError: JsonRouter route path must be a string path` or `TypeError: JsonRouter basePath must be a string path` before any endpoint is recorded.

Every listed method is available on both the router and route builders:

```ts
import JsonRouter from '@web-ts-toolkit/express-json-router';

const router = new JsonRouter('/api');

router.propfind('/documents/:id', () => ({ ok: true }));
router.route('/documents/:id').proppatch(() => ({ ok: true }));
```

## Handler Defaults

`JsonRouter` still exposes static customization points such as:

- `JsonRouter.errorMessageProvider`
- `JsonRouter.preJson`
- `JsonRouter.postJson`
- `JsonRouter.preError`
- `JsonRouter.postError`

These behave as defaults for future `new JsonRouter(...)` instances.

- Updating a static property affects routers created after that change.
- Existing routers keep the response-handler instance they were constructed with.
- `JsonRouter.defaultHandler` returns a newly configured handler each time it is read.
- Mutating a handler retrieved via `JsonRouter.defaultHandler` does not reconfigure existing routers or future defaults.
- For fully isolated behavior, pass an explicit handler instance as the third constructor argument.

```ts
import JsonRouter from '@web-ts-toolkit/express-json-router';

JsonRouter.errorMessageProvider = () => 'default-error';

const routerUsingDefaults = new JsonRouter('/api');

const handler = JsonRouter.createHandler({
  errorFormat: JsonRouter.ErrorFormats.rfc9457,
});

handler.errorMessageProvider = () => 'custom-error';

const routerUsingCustomHandler = new JsonRouter('/admin', undefined, handler);
```

## Native Middleware And Error Boundaries

Thrown or rejected JSON callbacks are JSON-formatted by the router's response
handler and never reach application error middleware. Explicit `next(error)`
instead delegates to native Express error middleware, which owns the response:

```ts
import express from 'express';
import JsonRouter from '@web-ts-toolkit/express-json-router';

const app = express();
const router = new JsonRouter('/api');

router.get('/throw', () => {
  throw new Error('formatted as a JSON 500 by the router');
});

router.get(
  '/guarded',
  (req, res, next) => {
    next(new Error('owned by the app final handler'));
    return { unreachable: true };
  },
  () => ({ unreachable: true }),
);

app.use(router.original);
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.status(500).json({ ownedBy: 'app-final-handler', message: err.message });
});
```

`use` and `param` delegate directly to the underlying native router:

- Callbacks are native Express middleware: sync/async failures reach
  application error middleware and guarded JSON handlers do not run.
- Malformed `express.json()` input mounted before the router likewise reaches
  application error middleware; `JsonRouter` does not sanitize upstream
  body-parser failures.
- `basePath` is not prepended to `use`/`param` arguments; pass an explicit
  mount path for scoped middleware. Broadly mounted `use` middleware runs
  before JSON routes on the same underlying router in mount order.
- Both methods return the native router (`router.original`), not the
  `JsonRouter`, so `.use(...).get(...)` is native registration. Write separate
  `router.get(...)` statements for JSON routes. Native registrations never
  appear in `getEndpoints()`.

```ts
import express from 'express';
import JsonRouter from '@web-ts-toolkit/express-json-router';

const authMiddleware: express.RequestHandler = (req, res, next) => next();
const router = new JsonRouter('/api', authMiddleware);

router.param('userId', (req, res, next, id) => next());

router.get('/health', () => ({ ok: true }));
router.get('/users/:id', () => ({ ok: true }));

router.getEndpoints();
// [{ method: 'GET', path: '/api/health' }, { method: 'GET', path: '/api/users/:id' }]
```

## Route Builder Contract

`router.route(path)` is independent-registration sugar: each builder call equals
a direct `router.METHOD(path, ...)` call with its own native route,
response-handler wrapper (including constructor-middleware copies), and
`getEndpoints()` entry. It is not native `express.Router().route(path)`
grouping: an `.all()` guard calling `next('route')` does not skip a later
builder registration, HEAD requests fall back to the separately registered GET
handler, and constructor middleware re-runs for each chained registration
crossed by `next()`.

## Documentation

Full package documentation lives in `website/docs/packages/express-json-router.md`.

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/express-json-router
