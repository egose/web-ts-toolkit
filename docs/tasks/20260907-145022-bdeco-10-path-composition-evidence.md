# BDECO-10 Evidence Report: Module Mount Paths Versus OpenAPI Paths

Parent task: `docs/tasks/20260907-121236-access-router-deco-boundary-review.md` (Task BDECO-10, investigation).
Status of BDECO-10: investigation complete, implementation deferred to follow-up BDECO-10-F01 (pending maintainer approval).
No source semantics were changed by this investigation. Live Express route matching is untouched
(`packages/access-router-deco/src/factory.ts` not modified; BDECO-01 through BDECO-09 work preserved).

## 1. Bounded Scope

Only route-construction path composition was examined:

- `packages/access-router-deco/src/factory.ts:213` (`splitModuleOptions`: `basePath` split off module options),
  `:251`/`...` no — exact lines per task: `:213` area (option split), `:251` area (bootstrap assembly),
  `:524-527` area (preflight reads), plus `bootstrap()` `:330`/`381`
  (`expressApp.use(basePath, expressRouter)` — the only place the module prefix applies),
  `bootstrapRootRouter` (`:637-641`: `createRouter(options)` then `expressRouter.use(rootRouter.routes)`),
  `bootstrapModelRouter` (`:643-666`: `createRouter(modelName, {})` then `expressRouter.use(modelRouter.routes)`).
- `packages/access-router/src/routers/model-router.ts:46-52`: `fullBasePath = parentPath + basePath`
  for OpenAPI, while the Express router is constructed with `basePath` only (`:52`).
- `packages/access-router/src/routers/root-router.ts:164-189`: `basename = basePath || ''` drives
  both the Express mount and OpenAPI (`normalizeUrlPath(this.basename)` + route path). Root has no `parentPath`.
- `packages/access-router/src/openapi/route-registration.ts:5-16`:
  `path = normalizeUrlPath(basePath + route.path)` — pure function of the passed base.
- Direct-usage contract: `packages/access-router` tests mount `router.routes` at `/`
  (e.g. `model-router.integration.test.ts:141`), so reachable `== basePath` and OpenAPI `== parentPath + basePath`;
  they agree iff `parentPath` is `/` (the default). `parentPath` is therefore operator-owned
  external-prefix metadata, kept in sync with deployment manually. Website docs list it as a
  build-time default (`configuration.mdx:33`) without defining cross-layer composition.

## 2. Evidence (all reproduced against fresh serial build, retained as passing tests)

Fresh build: `pnpm --filter @web-ts-toolkit/access-router-deco... build` (success, DTS 35.44kB),
then V1 `vitest run test/cross-path.integration.test.ts` 25/25 (18 pre-existing + 7 new `BDECO-10/P1`–`P7`).
Retained experiments assert CURRENT behavior in `test/cross-path.integration.test.ts`
(`BDECO-10 module-mount versus OpenAPI path composition` block). Probe matrix (supertest status + registry dump):

### Composition table

| #         | Router                                                                 | Module `basePath`      | Parent / base                              | Reachable (Express, status)                       | OpenAPI registry                            | Match?                                                  |
| --------- | ---------------------------------------------------------------------- | ---------------------- | ------------------------------------------ | ------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| R1        | root `/health`                                                         | `/`                    | n/a (root has no `parentPath`) / `/health` | `POST /health` 200                                | `POST /health`                              | Yes                                                     |
| R2 (=P1)  | root `/health`                                                         | `/api`                 | — / `/health`                              | `POST /api/health` 200; bare `/health` 404        | `POST /health`                              | **No — module prefix missing**                          |
| R3 (=P2)  | root `/health`                                                         | `''`                   | — / `/health`                              | `POST /health` 200                                | `POST /health`                              | Yes (`''` behaves as `/`)                               |
| M1        | model, default base                                                    | `/`                    | `/` / auto-plural                          | `GET /b10m3/new` 200                              | `GET /b10m3...`                             | Yes                                                     |
| M2 (=P3)  | model `/users`                                                         | `/api`                 | `/` / `/users`                             | `GET /api/users/new` 200; `/users/new` 404        | `GET /users/new`                            | **No — module prefix missing**                          |
| M3 (=P4)  | model `/users`                                                         | `/api`                 | `/tenant` / `/users`                       | `GET /api/users/new` 200; `/tenant/users/new` 404 | `GET /tenant/users/new`                     | **No — both wrong: module missing, parent unreachable** |
| M4 (=P5b) | model `/users`                                                         | `/`                    | `/tenant` / `/users`                       | `GET /users/new` 200; `/tenant/users/new` 404     | `GET /tenant/users/new`                     | **No — parent decorates OpenAPI only**                  |
| M5        | model `/users`, parent via default `@RouterOptions` provider           | `/api`                 | `/tenant` / `/users`                       | `GET /api/users/new` 200; `/tenant/users/new` 404 | `GET /tenant/users/new`                     | **No** (same as M3; default-provider path included)     |
| M6        | model `/users`                                                         | `''`                   | `''` / `/users`                            | `GET /users/new` 200                              | `GET /users/new`                            | Yes                                                     |
| T1 (=P6)  | two modules, `/api` + `/internal`, same model base `/widgets`, one app | —                      | `/` / `/widgets`                           | both mounts 200 on own prefix                     | both runtimes `GET /widgets/new`, no mount  | **No — OpenAPI mount-agnostic**                         |
| P1 (=P7)  | model `/users`, module `/api`, app re-mounted at `/ext`                | `/api` (+outer `/ext`) | `/` / `/users`                             | `/ext/api/users/new` 200; `/api/users/new` 404    | `GET /users/new`, no `/ext`, no `servers[]` | **No — external prefix outside both layers**            |

Formulas (current):

- Reachable (deco) = `normalize(moduleBase + routerBase + subpath)` where `routerBase` is the root
  `basePath` or model `basePath`. `parentPath` never participates.
- OpenAPI (deco, model) = `normalize(parentPath + basePath + subpath)`; (root) = `normalize(basename + subpath)`.
  `moduleBase` never participates.
- Agreement holds iff `moduleBase ∈ {'/', ''}` AND `parentPath ∈ {'/', ''}`.

## 3. Recommended Contract (not implemented)

1. **Package-local OpenAPI-side fix (recommended over route-side changes and over a docs-only contract).**
   After each router is constructed during bootstrap, prefix the OpenAPI entries registered by that
   construction with the normalized module `basePath` (`'/'`/`''` → no-op), leaving Express matching,
   `parentPath` semantics, and stored options untouched. Concretely: snapshot
   `getOpenApiRoutes().length` before/after each `bootstrapRootRouter`/`bootstrapModelRouter` call and
   rewrite only the added entries' `path` as `normalizeUrlPath(moduleBase + entry.path)`.
   Rationale: (a) a pure config contract cannot fix root routers — `RootRouterOptions` has no
   `parentPath` knob, so `POST /api/health` can never appear in OpenAPI via configuration alone;
   (b) changing reachable routes to match OpenAPI (e.g. mounting at `parentPath`) would break every
   current consumer's URLs and is explicitly out of scope; (c) index-range rewriting is safe for
   caller-supplied shared runtimes because pre-existing entries are never touched.
2. **Keep `parentPath` as operator-owned external-prefix metadata (document, do not compose automatically).**
   After fix (1), OpenAPI = `moduleBase + parentPath + basePath`; reachable-behind-proxy =
   `proxyPrefix + moduleBase + basePath`. Equality holds iff `parentPath` is `/` (default).
   Operators who need the proxy prefix inside OpenAPI paths set `parentPath` (models) or the
   OpenAPI `servers[]` URL (roots and globally) — a deliberate deployment declaration, consistent with
   direct `access-router` usage where the operator keeps `parentPath` in sync manually. The factory must
   NOT auto-compose `parentPath` into the Express mount: that changes live route matching.
3. **Explicit double-prefix hazard (migration note for F01).** Operators who today work around the gap by
   setting model `parentPath` equal to the module mount (e.g. `parentPath: '/api'` + module `/api`,
   which currently aligns OpenAPI with reachable) will get `/api/api/...` after fix (1). F01 must ship a
   migration note and should fail fast or warn when `parentPath` already starts with the module mount.

Rejected alternative: docs-only "set `parentPath` to match" contract. Incomplete (root routers have no such
knob), fragile (two values to keep in sync per module, silently diverges on remount), and it would bless
`parentPath`-as-mount semantics that contradict direct-usage behavior where `parentPath` never affects matching.

## 4. Decision Record

- BDECO-10 implements **no semantic change**. All findings above are recorded as evidence-descriptive,
  passing tests. `src/factory.ts` and `packages/access-router` sources are unmodified.
- The OpenAPI-prefix behavior change moves to follow-up **BDECO-10-F01**, blocked on maintainer approval
  (public OpenAPI output changes; workaround consumers need the migration note in §3.3).
- Approving maintainer: **TBD (unassigned)** — BDECO-12 to assign a named decision owner; until then F01
  stays blocked and the residual risks below stand.

## 5. Implementation Follow-up BDECO-10-F01 (unique ID)

Scope (only after maintainer approval of §3):

- (a) Implement module-mount prefixing of OpenAPI entries added during deco bootstrap (root + model;
  `'/'`/`''` no-op; shared runtimes: rewrite only index-range added by this bootstrap).
- (b) Preserve `parentPath` passthrough and document the `moduleBase + parentPath + basePath` composition
  plus the proxy-prefix rule (equality iff `parentPath` is `/`; otherwise `servers[]`/explicit declaration).
- (c) Double-prefix migration: release note + warn-or-throw when model `parentPath` already starts with the
  module mount; update README + `website/docs/packages/access-router-deco.md` + emitted JSDoc.
- (d) Convert retained P1–P7 current-behavior assertions to post-fix acceptance tests (below); keep live-route
  assertions proving Express matching is unchanged.

Regression / acceptance criteria (observable request + OpenAPI):

- `POST /api/health` reachable AND `POST /api/health` present in OpenAPI; bare `POST /health` 404 (P1 flipped).
- `GET /api/users/new` reachable AND `GET /api/users/new` in OpenAPI with default parent (P3 flipped).
- `GET /api/tenant/users/new` reachable?? — NO: parent must NOT move into reachable; instead
  `GET /api/users/new` reachable AND OpenAPI `GET /api/tenant/users/new` (P4 documents `parentPath` passthrough).
- Two modules: each runtime's OpenAPI carries its own mount (`/api/widgets/new` vs `/internal/widgets/new`);
  shared-runtime same-full-path composition still collides loudly (existing collision behavior preserved).
- Proxy: OpenAPI `servers[]` or documented `parentPath` declaration covers `/ext`; paths alone unchanged.
- New tests fail on the pre-F01 implementation (missing prefix) and pass after; all pre-existing
  `cross-path`, `bootstrap-*`, `factory`, and packed-consumer suites pass unmodified except for
  intentionally updated OpenAPI expectations.

Verification: V1 `cross-path` after a fresh serial build (before-fix failure required); then V2; then V3
(OpenAPI output is public contract surface). Serial builds only (shared `dist/`).

Release implications: OpenAPI-path change is observable for any consumer fetching generated specs behind a
non-`/` mount (arguably a bugfix, but spec URLs shift); workaround consumers (`parentPath == moduleBase`)
see doubled prefixes without the §3.3 migration handling. Minor or major bump per repo policy + BDECO-12
review before release.

## 6. Residual Risk (accepted pending F01)

- Any module mounted at a non-`/` `basePath` serves routes whose OpenAPI entries omit the mount (P1/P3);
  spec-driven clients generate wrong URLs.
- Non-default model `parentPath` under deco changes OpenAPI without affecting reachable routes (P4/P5),
  inviting operators to mistake it for a mount control; root routers offer no equivalent knob at all.
- Per-mount OpenAPI identity does not exist: two mounts share identical spec paths (P6); external proxy
  prefixes appear in neither paths nor `servers[]` (P7).
