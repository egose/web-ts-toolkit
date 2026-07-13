---
name: template-testing-and-scaffolding
description: README.md, .env.example, vitest.config.ts, tests/setup.ts, placeholder preservation, scaffold docs. Use when changing tests, template docs, environment defaults, or placeholder-bearing files in the access-router Mongo starter template.
---

# Template Testing And Scaffolding

Use this skill for the template's safety rails: tests, docs, environment defaults, and scaffold placeholders.

## Primary Files

- `README.md`
- `.env.example`
- `vitest.config.ts`
- `tests/setup.ts`
- `tests/todo-form.test.tsx`
- `tests/deploy-shared.test.ts`
- placeholder-bearing files such as `package.json`, `index.html`, `src/pages/home-page.tsx`, `api/src/config.ts`, and `api/src/express.ts`

## Use This Skill When

- updating test setup or adding regression coverage
- changing template README instructions or environment variable docs
- changing placeholder-bearing source files in ways that could break scaffolding
- aligning docs and examples with changes in runtime, routes, or deploy behavior

## Critical Template Rules

- Preserve `{{APP_NAME}}`, `{{APP_TITLE}}`, and `{{DB_NAME}}` unless the scaffolding system itself is intentionally changing.
- Remember that this directory is a reusable starter, not one concrete app instance.
- The default Vitest environment is `jsdom`, but `tests/deploy-shared.test.ts` explicitly runs in Node.
- `tests/setup.ts` provides the `ResizeObserver` stub needed by Radix-based UI components under jsdom.

## Workflow

1. Identify whether the change affects runtime docs, test environment, or scaffold placeholders.
2. Keep README, `.env.example`, and script behavior aligned.
3. When UI or contract behavior changes, update the nearest tests rather than leaving coverage stale.
4. Preserve template wording and placeholders in docs and source files.
5. If the change spans UI, API, and docs, use this skill as the final consistency pass.

## Editing Guidance

- Prefer updating the closest existing test file before adding a new test suite.
- Keep examples copy-pasteable for a newly scaffolded app.
- Do not replace template placeholders with concrete values just to make docs read like a finished app.
- When editing environment variable docs, keep them consistent with `api/src/config.ts`, `api/src/db.ts`, `src/api.ts`, and deploy scripts.

## Verification

- `pnpm test`
- `pnpm build`

If documentation or placeholders changed, also inspect the affected files directly to confirm the tokens remain intact.
