---
name: template-testing-and-scaffolding
description: README.md, .env.example, vitest.config.ts, tests/setup.ts, generated-project docs, and environment defaults. Use when changing tests, docs, or scaffolded app setup in the access-router Mongo starter.
---

# Template Testing And Scaffolding

Use this skill for the app's safety rails: tests, docs, environment defaults, and scaffolded project setup.

## Primary Files

- `README.md`
- `.env.example`
- `vitest.config.ts`
- `vite.config.ts`
- `tsconfig.node.json`
- `tests/setup.ts`
- `tests/api-contract.test.ts`
- `tests/api-base-path.integration.test.ts`
- `tests/home-page.test.tsx`
- `tests/todo-form.test.tsx`
- `tests/integrity-transaction.test.ts`
- `tests/readiness-error-boundary.test.ts`
- identity/config files such as `package.json`, `index.html`, `src/pages/home-page.tsx`, `api/src/config.ts`, and `api/access-router.config.ts`

## Use This Skill When

- updating test setup or adding regression coverage
- changing template README instructions or environment variable docs
- changing app identity or configuration files in ways that could desynchronize docs, scripts, or tests
- aligning docs and examples with changes in runtime, routes, or deploy behavior

## Critical Template Rules

- Do not add source-template internals to generated-user docs. Maintainer-only scaffolding policy belongs in the scaffolder package README.
- Remember that this directory is a reusable starter, not one concrete app instance.
- The default Vitest environment is `jsdom`. Test files that need plain Node
  (for example `tests/api-contract.test.ts`) opt out explicitly with a
  `// @vitest-environment node` header.
- `tests/setup.ts` provides the `ResizeObserver` stub needed by Radix-based UI components under jsdom.
- `pnpm test` must stay non-watch (`vitest run`); use `pnpm test:watch` for watch mode.
- `pnpm typecheck` and `pnpm build` check the app, server, and Vite/Vitest
  configurations together via `tsconfig.app.json`, `tsconfig.server.json`,
  and `tsconfig.node.json` (which covers `vite.config.ts` and
  `vitest.config.ts`).
- The backend watch (`pnpm server`) covers both `api/` and `src/shared/`, so
  shared schema changes reload backend behavior.
- Generated projects use a release-synchronized `pnpm-lock.yaml`, Node
  `^22.13.0 || >=24.0.0`, and pnpm `11.18.0`; keep docs and scripts on
  `pnpm install --frozen-lockfile` unless the lockfile policy changes.

## Workflow

1. Identify whether the change affects runtime docs, test environment, app identity, or scaffolded setup.
2. Keep README, `.env.example`, and script behavior aligned.
3. When UI or contract behavior changes, update the nearest tests rather than leaving coverage stale.
4. Keep generated-user docs copy-pasteable after scaffolding.
5. If the change spans UI, API, and docs, use this skill as the final consistency pass.

## Editing Guidance

- Prefer updating the closest existing test file before adding a new test suite.
- Keep examples copy-pasteable for a newly scaffolded app.
- Do not put credentials in command examples; use environment-variable names or masked prompt guidance instead.
- When editing environment variable docs, keep them consistent with `api/src/config.ts`, `api/access-router.config.ts`, `src/api.ts`, and deploy scripts.

## Verification

- `pnpm test`
- `pnpm test:watch` when explicitly checking watch behavior
- `pnpm build`

If documentation or app identity changed, also inspect the affected files directly to confirm the generated guidance still matches the scripts and runtime behavior.
