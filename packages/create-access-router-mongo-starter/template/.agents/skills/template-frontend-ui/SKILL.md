---
name: template-frontend-ui
description: home-page.tsx, app.tsx, main.tsx, index.css, Tailwind, shadcn UI, layout, routes, responsive states. Use when changing page structure or visual presentation in the access-router Mongo starter template.
---

# Template Frontend UI

Use this skill for presentational work in `src/` and `index.html`.

## Primary Files

- `src/app.tsx`
- `src/main.tsx`
- `src/pages/home-page.tsx`
- `src/index.css`
- `index.html`

## Use This Skill When

- adding, removing, or rearranging routes
- changing page layout, spacing, typography, cards, badges, or responsive behavior
- improving loading, empty, or error states in page-level UI
- updating theme tokens or global styles used by the starter

## Do Not Use This Skill For

- form schema or input validation changes inside `todo-form.tsx`
- client adapter or API contract changes in `src/api.ts` or `src/types.ts`
- backend model, router, or runtime changes under `api/`

## Current UI Shape

- `src/app.tsx` mounts a single home route and redirects unknown paths to `/`.
- `src/pages/home-page.tsx` is the main page and currently owns the CRUD dashboard layout.
- The UI uses `@egose/shadcn-theme` components plus Tailwind CSS v4 utilities.
- The starter should work on desktop and mobile; avoid layouts that only fit a wide screen.

## Workflow

1. Inspect the route shell in `src/app.tsx` before adding new pages.
2. Reuse the existing shadcn-theme components and utility classes before inventing new wrappers.
3. Keep loading and empty states explicit in the page, not implied by missing content.
4. If a visual change requires new data or fields, coordinate with `template-client-data` and `template-api-models-and-routers`.
5. If editing titles or app identity text, preserve template placeholders such as `{{APP_TITLE}}` unless the scaffolding behavior is intentionally changing.

## Editing Guidance

- Prefer small edits inside existing page components before splitting new files.
- Keep route structure simple unless the feature truly needs more pages.
- Preserve the current `react-router` setup style.
- Keep accessibility basics intact: labeled controls, readable button text, and visible empty-state messaging.
- When styling shared elements, prefer updating existing class strings or `src/index.css` tokens over introducing a parallel styling system.

## Verification

- `pnpm build`
- `pnpm test`

If the change affects layout significantly, also run `pnpm dev` and check both narrow and wide viewports.
