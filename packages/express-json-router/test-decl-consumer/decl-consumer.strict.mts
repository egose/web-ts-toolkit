import JsonRouter, {
  type JsonRouteBuilder,
  type JsonRouterCallback,
  type JsonRouterEndpoint,
  type JsonRouterHandlerInput,
  type JsonRouterMethod,
  type JsonRouterMiddlewares,
  type JsonRouterRouteRegistrar,
} from '@web-ts-toolkit/express-json-router';

/**
 * EJR-02 declaration consumer.
 *
 * This file is compiled by `tsc --noEmit -p test-decl-consumer/tsconfig-nodenext.json`
 * and `.../tsconfig-bundler.json` (wired into the package `test` script via
 * `pnpm typecheck`). It imports through the package name, so NodeNext and
 * Bundler resolution exercise the public export map rather than a direct dist
 * file path.
 *
 * The negative assertions below use `@ts-expect-error`: if any of the
 * formerly-public internal members were re-exposed on the emitted type, the
 * corresponding directive would become unused and `tsc` would report
 * "Unused '@ts-expect-error' directive", failing the typecheck.
 */
const assertInternalMembersNotPublic = (router: JsonRouter): void => {
  // @ts-expect-error internal endpoint registry `endpoints` is not public
  void router.endpoints;
  // @ts-expect-error internal method registry `methods` is not public
  void router.methods;
  // @ts-expect-error internal mutator `addEndpoint` is not public
  void router.addEndpoint;
  // @ts-expect-error internal path helper `normalizePath` is not public
  void router.normalizePath;
};

const assertGetEndpointsShape = (router: JsonRouter): void => {
  const endpoints = router.getEndpoints();
  const namedEndpoints: JsonRouterEndpoint[] = endpoints;

  if (endpoints.length > 0) {
    const first = endpoints[0];
    const method: string = first.method;
    const path: string = first.path;

    void method;
    void path;
  }

  void namedEndpoints;
};

const assertPublicTypeImports = (router: JsonRouter): void => {
  const method: JsonRouterMethod = 'get';
  const callback: JsonRouterCallback = () => ({ ok: true });
  const input: JsonRouterHandlerInput = [callback, [callback]];
  const middlewares: JsonRouterMiddlewares = [callback];
  const registrar: JsonRouterRouteRegistrar = router.get;
  const builder: JsonRouteBuilder = router.route('/typed-builder');

  registrar('/typed-registrar', callback);
  builder.get(input);

  void method;
  void middlewares;
};

const assertTypedRegistrarGenerics = (router: JsonRouter): void => {
  type Params = { id: string };
  type ResBody = { ok: boolean };
  type ReqBody = { name: string };
  type ReqQuery = { verbose?: string };
  type Locals = { requestId: string };

  const callback: JsonRouterCallback<Params, ResBody, ReqBody, ReqQuery, Locals> = (req, res) => {
    const id: string = req.params.id;
    const name: string = req.body.name;
    const verbose: string | undefined = req.query.verbose;
    const requestId: string = res.locals.requestId;

    void id;
    void name;
    void verbose;
    void requestId;

    return Promise.resolve({ ok: true });
  };

  const promiseLikeCallback: JsonRouterCallback<Params, ResBody, ReqBody, ReqQuery, Locals> = () => ({
    then: (resolve: (value: { ok: boolean }) => void) => {
      resolve({ ok: true });
    },
  });

  router.get<Params, ResBody, ReqBody, ReqQuery, Locals>('/users/:id', callback, promiseLikeCallback);
  router.route('/users/:id').post<Params, ResBody, ReqBody, ReqQuery, Locals>(callback);

  // @ts-expect-error request params retain the declared shape
  router.get<{ id: string }>('/users/:id', (req) => req.params.missing);
  const invalidAsyncCallback: JsonRouterCallback<Params, ResBody, ReqBody, ReqQuery, Locals, { ok: boolean }> = () => ({
    // @ts-expect-error constrained async returns must be PromiseLike-compatible
    then: 'not-a-function',
  });

  void invalidAsyncCallback;
};

const assertInternalTypesNotImportable = async (): Promise<void> => {
  // @ts-expect-error internal constructor type is not exported from the package root
  const internalConstructor: import('@web-ts-toolkit/express-json-router').JsonRouterConstructor | undefined = undefined;
  // @ts-expect-error internal Express router alias is not exported from the package root
  const internalExpressRouter: import('@web-ts-toolkit/express-json-router').ExpressRouter | undefined = undefined;
  // @ts-expect-error internal handler-defaults type is not exported from the package root
  const internalHandlerDefaults: import('@web-ts-toolkit/express-json-router').HandlerDefaults | undefined = undefined;

  void [internalConstructor, internalExpressRouter, internalHandlerDefaults];
  void (await Promise.resolve());
};

const assertSupportedMethodDeclarations = (router: JsonRouter): void => {
  const methods: readonly string[] = JsonRouter.supportedMethods;
  const firstMethod = JsonRouter.supportedMethods[0];

  router.acl('/acl', () => ({ ok: true }));
  router.bind('/bind', () => ({ ok: true }));
  router.connect('/connect', () => ({ ok: true }));
  router.link('/link', () => ({ ok: true }));
  router.mkcalendar('/mkcalendar', () => ({ ok: true }));
  router.propfind('/propfind', () => ({ ok: true }));
  router.proppatch('/proppatch', () => ({ ok: true }));
  router.query('/query', () => ({ ok: true }));
  router.rebind('/rebind', () => ({ ok: true }));
  router.source('/source', () => ({ ok: true }));
  router.unbind('/unbind', () => ({ ok: true }));
  router.unlink('/unlink', () => ({ ok: true }));
  router.route('/route').propfind(() => ({ ok: true })).query(() => ({ ok: true }));

  void methods;
  void firstMethod;

  // @ts-expect-error unknown route methods are not part of the public contract
  router.foo('/foo', () => ({ ok: true }));
  // @ts-expect-error unknown route builder methods are not part of the public contract
  router.route('/route').foo(() => ({ ok: true }));
};

const assertHandlerArrayDeclarations = (router: JsonRouter): void => {
  const first = () => ({ ok: true });
  const second = () => ({ ok: true });
  const mutableHandlers = [first, [second]];
  const readonlyHandlers = [first, [second] as const] as const;

  new JsonRouter('/api', readonlyHandlers);
  router.get('/flat-array', [first, second]);
  router.get('/mixed-array', first, [second]);
  router.get('/nested-array', mutableHandlers);
  router.get('/readonly-array', readonlyHandlers);
  router.route('/builder').get(readonlyHandlers).post(first, [second]);

  // @ts-expect-error non-functions are not valid route handlers
  router.get('/invalid', [first, 'not-a-handler']);
  // @ts-expect-error Express error middleware must be mounted with use()
  router.get('/route-error', (error: unknown, req, res, next) => {
    void error;
    next();
  });
};

const assertStringPathDeclarations = (router: JsonRouter): void => {
  router.get('/string-path', () => ({ ok: true }));
  router.route('/builder-string-path').get(() => ({ ok: true }));

  // @ts-expect-error basePath intentionally accepts only string paths, not Express PathParams
  new JsonRouter(/^\/api/);
  // @ts-expect-error route methods intentionally accept only string paths, not Express PathParams
  router.get(/^\/regex/, () => ({ ok: true }));
  // @ts-expect-error route methods intentionally accept only string paths, not Express PathParams arrays
  router.get(['/one', '/two'], () => ({ ok: true }));
  // @ts-expect-error route builders intentionally accept only string paths, not Express PathParams
  router.route(/^\/builder/).get(() => ({ ok: true }));
};

const router = new JsonRouter();

router.get('/health', () => ({ ok: true }));
assertInternalMembersNotPublic(router);
assertGetEndpointsShape(router);
assertPublicTypeImports(router);
assertTypedRegistrarGenerics(router);
assertSupportedMethodDeclarations(router);
assertHandlerArrayDeclarations(router);
assertStringPathDeclarations(router);
void assertInternalTypesNotImportable();
