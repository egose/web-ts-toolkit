# AGENTS.md

## Commands

- `pnpm install` - install dependencies
- `pnpm dev` - start the Vite frontend on `http://localhost:3000`
- `pnpm server` - start the backend on `http://localhost:8000`
- `pnpm build` - typecheck app + server and build the frontend
- `pnpm typecheck` - run TypeScript checks only
- `pnpm lint` - run ESLint
- `pnpm test` - run Vitest
- `pnpm serverless` - bundle the backend into `api/functions/main.cjs`
- `pnpm serverless:start` - run the bundled serverless handler locally

## Template Notes

- This directory is a scaffold template, not a concrete app. Preserve template placeholders unless the scaffolding system itself is being changed.
- Placeholder tokens currently used by the template are `{{APP_NAME}}`, `{{APP_TITLE}}`, and `{{DB_NAME}}`.
- Frontend and backend run as separate local processes: `pnpm dev` for the UI and `pnpm server` for the API.
- Client and server routes must stay aligned: `src/api.ts` uses relative model paths, while `api/src/routers.ts` exposes `/api/...` routes.
- `api/app.ts` must stay side-effect-free for serverless bundling. Database startup belongs in `api/app-dev.ts` for local dev and `api/init.ts` for serverless cold start.
- `pnpm build` does not emit the serverless bundle. Use `pnpm serverless` to produce that artifact.
- Netlify deploy is provided by the `create-access-router-mongo-starter` package bins (`create-access-router-mongo-starter-deploy-netlify`, `create-access-router-mongo-starter-deploy-shared`), not by scripts shipped in this template. Install that package at the parent/workspace level to enable deploy.

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
<description>src/api.ts, src/types.ts, createAdapter, createModelHooks, VITE_API_BASE_URL, list and mutation wiring. Use when changing frontend data fetching or client-server contract alignment.</description>
<location>.agents/skills/template-client-data/SKILL.md</location>
</skill>
<skill>
<name>template-api-models-and-routers</name>
<description>api/src/models.ts, api/src/routers.ts, access-router.d.ts, zod request schemas, Mongoose models, permissions. Use when changing backend entities, CRUD routes, request validation, or access rules.</description>
<location>.agents/skills/template-api-models-and-routers/SKILL.md</location>
</skill>
<skill>
<name>template-backend-runtime</name>
<description>api/src/express.ts, db.ts, config.ts, app.ts, app-dev.ts, init.ts, middleware, runtime startup. Use when changing Express wiring, DB lifecycle, runtime config, or serverless boot behavior.</description>
<location>.agents/skills/template-backend-runtime/SKILL.md</location>
</skill>
<skill>
<name>template-testing-and-scaffolding</name>
<description>README.md, .env.example, vitest.config.ts, tests/setup.ts, placeholder preservation, scaffold docs. Use when changing tests, template docs, environment defaults, or placeholder-bearing files.</description>
<location>.agents/skills/template-testing-and-scaffolding/SKILL.md</location>
</skill>
</available_skills>
