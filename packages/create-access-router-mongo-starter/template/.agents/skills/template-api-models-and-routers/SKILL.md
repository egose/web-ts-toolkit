---
name: template-api-models-and-routers
description: api/src/models.ts, api/src/routers.ts, access-router.d.ts, zod request schemas, Mongoose models, permissions. Use when changing backend entities, CRUD routes, request validation, or access rules in the access-router Mongo starter template.
---

# Template API Models And Routers

Use this skill for persistence and access-router changes under `api/src/`.

## Primary Files

- `api/src/models.ts`
- `api/src/routers.ts`
- `api/src/access-router.d.ts`
- `api/src/errors.ts`

## Use This Skill When

- adding or removing Mongoose fields
- creating a new entity or relation
- changing CRUD route behavior or request validation
- introducing permission keys or access rules
- changing list limits or router-level access-router options

## Current Backend Contract Shape

- Mongoose schemas live in `api/src/models.ts`.
- Access-router CRUD configuration lives in `api/src/routers.ts`.
- Request validation uses `zod` via `fromZod(...)`.
- The template defaults to open CRUD access with `true` for all operations.
- `api/src/access-router.d.ts` is the extension point for request fields and permission keys.

## Workflow

1. Update the Mongoose schema and inferred record type in `api/src/models.ts`.
2. Update request schemas, permission schema, and router options in `api/src/routers.ts`.
3. If auth or permission keys are introduced, update `api/src/access-router.d.ts` and coordinate with `template-backend-runtime` for middleware.
4. Mirror contract changes in `src/types.ts`, related UI, and forms.
5. Keep the existing model registration pattern safe for reloads: reuse `mongoose.models.*` when available.

## Editing Guidance

- Prefer small changes to the current `createRouters(runtime)` structure.
- Keep request schemas explicit rather than relying on implicit Mongoose coercion.
- Avoid changing server route prefixes casually; `src/api.ts` depends on `API_BASE_URL` staying aligned.
- Treat auth as a coordinated change across permissions, request extensions, and runtime middleware, not a one-file tweak.

## Verification

- `pnpm typecheck`
- `pnpm build`
- `pnpm test`

If the contract changed, verify that the frontend compiles against the updated types and services.
