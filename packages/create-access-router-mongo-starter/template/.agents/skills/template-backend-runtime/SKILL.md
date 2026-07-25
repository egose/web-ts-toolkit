---
name: template-backend-runtime
description: api/access-router.config.ts, api/src/config.ts, middleware, DB lifecycle, and runtime startup. Use when changing runtime config, Express wiring, DB behavior, or serverless boot behavior in the access-router Mongo starter template.
---

# Template Backend Runtime

Use this skill for access-router runtime wiring, environment-driven behavior, and database lifecycle changes.

## Primary Files

- `api/access-router.config.ts`
- `api/src/config.ts`
- `api/src/errors.ts`

## Use This Skill When

- adding middleware or changing Express app setup
- adjusting database startup, shutdown, or configuration behavior
- changing error handling or API-level health endpoints
- modifying how local dev and serverless builds boot the backend

## Critical Runtime Rules

- `api/access-router.config.ts` is the single runtime config used by both local dev and serverless bundling.
- `api/access-router.config.ts` requires `MONGODB_URI` through its `db.url`; there is no silent fallback.
- `api/src/config.ts` owns `API_BASE_URL`, which defaults to `/api` and is used by `api/access-router.config.ts` and `api/src/routers.ts`.

## Workflow

1. Confirm whether the change belongs to shared runtime wiring, router configuration, or environment-driven startup behavior.
2. Keep DB/runtime lifecycle expressed through `api/access-router.config.ts` instead of reintroducing separate app/init entrypoints.
3. If middleware attaches request context for permissions or auth, coordinate with `template-api-models-and-routers`.
4. Preserve explicit error responses and avoid hiding actionable failures.
5. If config changes, keep `.env.example` and `README.md` aligned through `template-testing-and-scaffolding`.

## Editing Guidance

- Prefer extending `api/access-router.config.ts` over reintroducing custom app bootstrap files.
- Keep environment-variable handling explicit in `api/src/config.ts` and the runtime config.
- Preserve the template placeholder in the API root response payload unless the scaffolding behavior is intentionally changing.

## Verification

- `pnpm typecheck`
- `pnpm build`
- `pnpm serverless`

If startup behavior changed, also verify the intended local path with `pnpm server`.
