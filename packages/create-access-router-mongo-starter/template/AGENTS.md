# AGENTS.md

## Commands

- `pnpm install --frozen-lockfile` - install the release-tested dependencies
- `pnpm dev` - start the Vite frontend on `http://localhost:3000`
- `pnpm server` - start the backend on `http://localhost:8000`
- `pnpm build` - typecheck app + server and build the frontend
- `pnpm typecheck` - run TypeScript checks only
- `pnpm lint` - run ESLint
- `pnpm test` - run Vitest once
- `pnpm test:watch` - run Vitest in watch mode
- `pnpm serverless` - bundle the backend into `api/functions/main.cjs`
- `pnpm serverless:start` - run the bundled serverless handler locally

## Template Notes

- This is a scaffolded fullstack app. Keep package metadata, app title, database name, and environment examples aligned when renaming or repurposing it.
- Maintainer-only scaffolder internals belong in the `create-access-router-mongo-starter` package README, not in generated-app guidance.
- Keep Node and pnpm requirements aligned with `package.json` (`node >=22.12.0`, `pnpm@11.18.0`) and use frozen installs so dependency drift is detected.
- Frontend and backend run as separate local processes: `pnpm dev` for the UI and `pnpm server` for the API.
- Client and server routes must stay aligned: `API_BASE_URL` is one path-only prefix validated for Vite, the client, local runtime, serverless runtime, and deploys. Schemes, authorities, queries, fragments, backslashes, empty segments, and dot segments are invalid. `src/api.ts` uses relative model paths, while `api/src/routers.ts` exposes `${API_BASE_URL}/...` routes (default `/api/...`) through `api/access-router.config.ts`.
- Local bindings are explicit package-script flags: Vite uses port 3000, the backend uses port 8000, and the serverless emulator uses port 9000. Do not document `PORT` or `HOST` environment overrides unless the scripts are changed to honor them.
- Keep `src/shared/entity-schemas.ts` authoritative for browser request DTOs and backend CRUD validation. The basic starter deliberately disables root batching and blocks advanced mutation routes before access-router; do not opt in without applying those same schemas and explicit batch limits to every alternate write path.
- `api/access-router.config.ts` is the single runtime entrypoint for local dev and serverless builds. Database startup belongs in its `db` config, not in ad hoc app entry modules.
- `pnpm build` does not emit the serverless bundle. Use `pnpm serverless` to produce that artifact.
- Netlify deploy is provided by the `create-access-router-mongo-starter` package bins (`create-access-router-mongo-starter-deploy-netlify`, `create-access-router-mongo-starter-deploy-shared`), not by scripts shipped in this template. Install the exact generator version used for the scaffold plus `netlify-cli` as dev dependencies before running deploy commands.
- Supply `NETLIFY_AUTH_TOKEN` and the required nonblank `MONGODB_URI` through the environment or masked interactive prompts, not command arguments. Local and serverless startup reject missing or malformed Mongo configuration, and every backend deployment requires it. The deploy helper keeps Mongo credentials out of frontend/deploy child environments and marks `MONGODB_URI` secret on Netlify.
- Keep persistence failures behind `api/src/errors.ts`: expected validation, cast, and duplicate conflicts use stable sanitized responses; unknown failures remain generic `500` responses, and structured logs must not contain credentials, request bodies, rejected values, or duplicate stacks.
- This is explicitly a public-demo app: anonymous CRUD is intentional, production deploy requires `--acknowledge-public-demo`, and the generated README must retain the prominent warning and host abuse-control guidance. Do not describe the acknowledgement as authentication or protection.
- Preserve referential integrity: category names are trim-normalized and case-sensitive unique; Todo category writes and Category deletes use transaction-scoped category locks, referenced Category deletion returns `409`, and deployments require transaction-capable MongoDB (replica set or sharded). Keep the documented 100-record cap, deterministic default sorts, exact-match filter allowlists, and supporting indexes aligned.

## Testing Notes

- The default Vitest environment is `jsdom` with setup from `tests/setup.ts`.
- When changing fields or contracts, update the matching frontend tests and template docs together.

Skills provide focused guidance for the main parts of this starter template.

<available_skills>
<skill>
<name>template-frontend-ui</name>
<description>home-page.tsx, app.tsx, main.tsx, index.css, Tailwind, shadcn UI, layout, routes, responsive states. Use when changing page structure or visual presentation in this template.</description>
<location>.agents/skills/template-frontend-ui/SKILL.md</location>
</skill>
<skill>
<name>template-frontend-forms</name>
<description>todo-form.tsx, react-hook-form, zod, Controller, Select, Checkbox, validation messages. Use when changing form fields, validation, submit flow, or form accessibility in this template.</description>
<location>.agents/skills/template-frontend-forms/SKILL.md</location>
</skill>
<skill>
<name>template-client-data</name>
<description>src/api.ts, src/types.ts, createAdapter, createModelHooks, API_BASE_URL, and list/mutation wiring. Use when changing frontend data fetching or client-server contract alignment.</description>
<location>.agents/skills/template-client-data/SKILL.md</location>
</skill>
<skill>
<name>template-api-models-and-routers</name>
<description>api/src/models.ts, api/src/routers.ts, access-router.d.ts, zod request schemas, Mongoose models, permissions. Use when changing backend entities, CRUD routes, request validation, or access rules.</description>
<location>.agents/skills/template-api-models-and-routers/SKILL.md</location>
</skill>
<skill>
<name>template-backend-runtime</name>
<description>api/access-router.config.ts, api/src/config.ts, middleware, DB lifecycle, and runtime startup. Use when changing runtime config, Express wiring, DB behavior, or serverless boot behavior.</description>
<location>.agents/skills/template-backend-runtime/SKILL.md</location>
</skill>
<skill>
<name>template-testing-and-scaffolding</name>
<description>README.md, .env.example, vitest.config.ts, tests/setup.ts, generated-project docs, and environment defaults. Use when changing tests, docs, or scaffolded app setup.</description>
<location>.agents/skills/template-testing-and-scaffolding/SKILL.md</location>
</skill>
</available_skills>
