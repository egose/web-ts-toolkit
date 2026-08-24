---
name: template-client-data
description: src/api.ts, src/types.ts, createAdapter, createModelHooks, API_BASE_URL, list and mutation wiring. Use when changing frontend data fetching or client-server contract alignment in the access-router Mongo starter template.
---

# Template Client Data

Use this skill for the frontend data layer and any client-side contract updates.

## Primary Files

- `src/api.ts`
- `src/types.ts`
- `src/pages/home-page.tsx`

## Use This Skill When

- changing the client adapter base URL or service configuration
- adding or renaming frontend entity fields
- changing how lists, creates, updates, or deletes are wired in the UI
- aligning frontend code with backend path or payload changes

## Critical Contract Rules

- `src/api.ts` configures `createAdapter({ baseURL })` from the single `API_BASE_URL` contract, defaulting to `/api`.
- `API_BASE_URL` is a path-only prefix. Keep its shared validator aligned across Vite, backend startup, and deploy validation; do not add a frontend-only fallback that can diverge from backend routes.
- Model service `basePath` values are relative to that adapter base URL. They should stay as `todos`, `categories`, and similar relative segments, not `/api/todos`.
- The server-side routers in `api/src/routers.ts` expose the matching absolute paths under `${API_BASE_URL}/...` (default `/api/...`).
- If one side changes, the other side must change in the same task.
- Lists are intentionally capped at 100 records with deterministic defaults and exact-match filter allowlists; do not imply the UI shows all records unless pagination is added.

## Workflow

1. Confirm the current server route and request shape before editing the client.
2. Update `src/types.ts` when entity fields change.
3. Update `src/api.ts` when service names, paths, or adapter behavior change.
4. Update `src/pages/home-page.tsx` hook usage so refetch and mutation behavior still matches the page UX.
5. If the data contract changes, coordinate with `template-api-models-and-routers`.

## Editing Guidance

- Prefer keeping the existing `createModelHooks` pattern unless there is a strong reason to move away from it.
- Avoid adding a second client data layer or custom fetch wrapper unless the template truly needs it.
- Keep model service configuration small and explicit.
- When a field may be optional or nullable, make the client type match the actual server behavior rather than guessing.

## Verification

- `pnpm build`
- `pnpm test`

If paths or environment behavior changed, also verify local expectations with `pnpm server` plus `pnpm dev`.
