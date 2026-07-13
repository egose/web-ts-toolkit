---
name: template-deploy-netlify
description: deploy-shared.ts, deploy-netlify.ts, netlify.toml generation, sandbox deploys, dry-run behavior, serverless artifact paths. Use when changing build or Netlify deployment automation in the access-router Mongo starter template.
---

# Template Deploy Netlify

Use this skill for deployment automation under `scripts/`.

## Primary Files

- `scripts/deploy-shared.ts`
- `scripts/deploy-netlify.ts`
- `tests/deploy-shared.test.ts`
- `package.json`

## Use This Skill When

- changing build artifact paths or serverless output behavior
- modifying sandbox or ephemeral deploy logic
- changing Netlify site lookup, creation, redirect generation, or CLI invocation
- changing deploy-specific environment variable handling

## Current Deploy Split

- `scripts/deploy-shared.ts` owns provider-agnostic path resolution, sandbox behavior, frontend build, and serverless build.
- `scripts/deploy-netlify.ts` owns Netlify API calls, prompts, `netlify.toml` generation, deploy execution, and function env updates.
- The deploy flow can write generated artifacts into the package directory by default, or into a sandbox with `--ephemeral` or `--sandbox-dir`.

## Workflow

1. Decide whether the change is provider-agnostic or Netlify-specific before editing.
2. Preserve the distinction between repo builds and sandbox builds.
3. Keep `--dry-run` behavior honest: print what would happen without creating files or running commands.
4. Update tests when path resolution or shared deploy behavior changes.
5. Keep frontend build output and serverless build output coordinated with `package.json` scripts.

## Editing Guidance

- Prefer the existing `run(...)`, `resolvePaths(...)`, and `buildArtifacts(...)` helpers rather than creating a second command runner.
- Keep error messages specific and actionable because deploy failures are often the user's first signal.
- Avoid coupling deploy scripts to local-only assumptions that break sandbox mode.
- If changing generated files such as `netlify.toml`, preserve idempotent behavior where possible.

## Verification

- `pnpm test`
- `pnpm serverless`

If CLI flags or help text changed, also verify the intended command shape with `pnpm deploy:netlify -- --help`.
