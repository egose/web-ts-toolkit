---
name: template-backend-runtime
description: api/src/express.ts, db.ts, config.ts, app.ts, app-dev.ts, init.ts, middleware, runtime startup. Use when changing Express wiring, DB lifecycle, runtime config, or serverless boot behavior in the access-router Mongo starter template.
---

# Template Backend Runtime

Use this skill for Express wiring, environment-driven behavior, and database lifecycle changes.

## Primary Files

- `api/src/express.ts`
- `api/src/db.ts`
- `api/src/config.ts`
- `api/app.ts`
- `api/app-dev.ts`
- `api/init.ts`

## Use This Skill When

- adding middleware or changing Express app setup
- adjusting database startup, shutdown, or configuration behavior
- changing error handling or API-level health endpoints
- modifying how local dev and serverless entrypoints boot the backend

## Critical Runtime Rules

- `api/app.ts` is the serverless entry and must stay side-effect-free.
- `api/app-dev.ts` is the local dev entry and is allowed to await `startDB()` before returning the app.
- `api/init.ts` is the serverless cold-start hook and owns DB startup for the bundled function.
- `api/src/db.ts` requires `MONGODB_URI`; there is no silent fallback.
- `api/src/config.ts` owns `API_BASE_URL`, which defaults to `/api` and is used by `api/src/express.ts` and `api/src/routers.ts`.

## Workflow

1. Confirm whether the change belongs to shared app wiring, local dev startup, or serverless cold start.
2. Keep startup responsibilities separated across `app.ts`, `app-dev.ts`, and `init.ts`.
3. If middleware attaches request context for permissions or auth, coordinate with `template-api-models-and-routers`.
4. Preserve explicit error responses and avoid hiding actionable failures.
5. If config changes, keep `.env.example` and `README.md` aligned through `template-testing-and-scaffolding`.

## Editing Guidance

- Prefer extending `createExpress()` over replacing the current app-construction flow.
- Do not move DB startup into `api/app.ts`.
- Keep environment-variable handling explicit in `api/src/config.ts` and `api/src/db.ts`.
- Preserve the template placeholder in the API root response payload unless the scaffolding behavior is intentionally changing.

## Verification

- `pnpm typecheck`
- `pnpm build`
- `pnpm serverless`

If startup behavior changed, also verify the intended local path with `pnpm server`.
