---
name: ai-friendly-ts-package
description: TypeScript package, package.json, exports, types, dist, README.md, subpath exports, default export, named exports, JSDoc, npm pack. Use when reviewing or improving a TypeScript library or SDK in this workspace so AI coding assistants can understand it after install in a random TypeScript app.
---

# AI-Friendly TS Package

Use this skill for packages under `packages/*` in this workspace.

The goal is not "good docs inside this repo." The goal is: after someone installs the package in a random TypeScript app, their editor and AI assistant can discover the package surface, understand the interfaces, and produce correct usage.

Assume the installed consumer reliably sees only the packed package contents in `node_modules`, especially:

1. `package.json`
2. shipped declaration files under `dist/`
3. shipped JavaScript entrypoints under `dist/`
4. `README.md`

Assume repo-only files such as `website/docs/packages/...` are not locally visible after install unless a tool separately fetches them. Treat those docs as secondary.

## Trigger Clues

This skill is a strong match when the user mentions:

- TypeScript package quality, package discoverability, or AI-friendly package work
- installed consumer experience, editor hover, autocomplete, or "works well after npm install"
- `package.json`, `tsup.config.ts`, `exports`, `types`, `main`, `module`, `dist`, `files`, or `sideEffects`
- `README.md`, subpath exports, default export, named exports, JSDoc, examples, Cursor, Copilot, Claude Code, or LSP

## Success Criteria

An installed consumer should be able to answer these without opening repo source files:

1. How do I import this package?
2. What functions, classes, types, and subpaths are public?
3. Which import form is canonical: default, named, or subpath?
4. What is the shortest correct happy-path example?
5. Which peer dependencies or runtime assumptions do I need?

If the package technically supports multiple import styles, the consumer should still be able to tell which style is preferred.

## Workspace Shape

Assume this package layout unless the package proves otherwise:

- source lives in `src/`
- builds are produced by `tsup` into `dist/`
- packages publish CJS and ESM plus declaration files
- `package.json` usually contains `main`, `module`, `types`, and `exports`
- published files are usually `README.md` and `dist`
- tests run through `vitest`, either with a package-local config or the root config

Known workspace patterns:

- single-entry packages: `utils`, `http-errors`, `express-json-router`, `access-router-client`, `access-router-react`, `access-router-deco`, `message-service`
- multi-entry or subpath-export packages: `access-router`, `express-response-handler`, `moo`
- some packages expose both default and named exports: `access-router`, `express-response-handler`, `access-router-client`
- most other packages are named-export-first
- most packages use `sideEffects: false`; `message-service` keeps explicit side-effectful schema files

## Priority Order

Work in this order:

1. Published entrypoints and package metadata
2. Shipped declaration files and public API shape
3. Packed package contents as seen by installed consumers
4. README installation and quickstart examples
5. JSDoc on the highest-value exported APIs
6. Optional `llms.txt`
7. Repo website docs only as a consistency check

Do not treat `llms.txt` or repo docs as a substitute for correct metadata, types, and README examples.

## Workflow

### 1. Confirm the package boundary

Inspect:

- `packages/<name>/package.json`
- `packages/<name>/tsup.config.ts`
- `packages/<name>/src/index.ts`
- any extra entry files exported from `package.json`
- `packages/<name>/README.md`

Inspect repo docs only if needed to compare or detect drift.

If the package exposes subpaths, inspect every exported entrypoint, not just `src/index.ts`.

Work out the canonical consumer import forms at this stage:

- package root named imports
- package root default import, if any
- subpath imports such as `@web-ts-toolkit/moo/plugins`

### 2. Verify metadata against the build

Check that `package.json` and `tsup.config.ts` agree.

- every exported subpath has a matching `tsup` entry
- every `tsup` public entry that should be published is represented in `exports`
- `main`, `module`, and `types` point at real `dist` outputs
- `exports.types`, `exports.import`, and `exports.require` line up with real files
- `files` includes everything the installed consumer needs, especially `README.md` and `dist`
- `sideEffects` does not hide intentional runtime registration files
- peer dependencies are declared when the package API depends on framework types or runtime packages

For this workspace, broken `exports` to `dist/*.d.ts` or `dist/*.mjs` are a higher-priority issue than missing prose.

If making changes, verify the publish surface with `npm pack --dry-run` or the workspace equivalent when practical. The installed consumer only sees what is actually packed.

### 3. Verify shipped declaration files

Prioritize what TypeScript and the editor actually read after install.

- declaration files in `dist/` expose the public interfaces cleanly
- root and subpath declaration paths line up with `exports.types`
- important types are reachable from public entrypoints instead of forcing deep imports
- emitted declarations reflect the intended consumer API, not internal module structure
- exported API shapes are specific enough to drive good completions and hover information
- important JSDoc survives onto the generated exported declarations that editors actually show

Do not assume source comments or source exports are enough. Inspect the generated `.d.ts` files when evaluating installed-consumer discoverability.

When deciding what to improve, prefer better declarations over more docs.

### 4. Verify the public TypeScript surface

Inspect the exported API, not internal helpers.

- `src/index.ts` and subpath entry files re-export the intended public surface clearly
- public APIs avoid `any` and overly loose structural types unless there is a real need
- default exports and named exports are deliberate and documented consistently
- if both default and named exports exist, the README should make the canonical consumer import style explicit
- docs and examples do not rely on `src/*` or `dist/*` deep imports
- the public surface reflects how consumers are expected to import and call the package, not how internals are organized

Pay extra attention to packages with multiple entrypoints such as:

- `@web-ts-toolkit/access-router` with `./advanced` and `./processors`
- `@web-ts-toolkit/express-response-handler` with `./types` and `./responses*`
- `@web-ts-toolkit/moo` with `./is`, `./schema`, `./utils`, and `./plugins*`

### 5. Verify README quality for installed consumers

Prefer the shortest correct example that matches the actual public API.

- README installation uses the real package name
- peer dependencies are listed when required, such as `express`, `mongoose`, `react`, or `reflect-metadata`
- quickstart imports match the current `exports` map
- examples use the canonical import style when both default and named exports exist
- README teaches the main interface without requiring website docs first
- the README names the main exports or main usage patterns explicitly
- subpath-export packages include at least one example of the intended subpath import form

For this repo, make import style explicit because patterns vary by package:

- default plus named exports for `access-router` and `express-response-handler`
- named import for factories like `createAdapter` in `access-router-client`
- named exports for utility and error packages such as `utils` and `http-errors`
- documented subpath imports for `moo`, `express-response-handler`, and `access-router`

### 6. Add JSDoc only where it helps the most

Do not try to document every function.

Prefer JSDoc on:

- the main factory or default export
- top-level entrypoint helpers
- exported classes or types that are central to usage
- advanced subpath entrypoints that are easy to misuse

Prioritize JSDoc where the declaration file is likely to be the first thing the consumer sees through editor hover or autocomplete.

### 7. Check repo docs only for drift

Use `website/docs/packages/...` only to detect mismatches with the shipped package surface or README.

Do not rely on repo docs as the main fix for installed-consumer discoverability.

### 8. Decide whether `llms.txt` is justified

Recommend `llms.txt` only after metadata, exports, declarations, and README examples are correct.

It is most useful here for packages with multiple workflows or entrypoints, especially `access-router`, `access-router-client`, `express-response-handler`, and `moo`.

Keep it short and index-like.

## Common Findings In This Repo

Prioritize these findings in review output:

1. `exports` and `tsup` entries drifted apart
2. declaration files do not expose the intended package surface cleanly
3. package README examples use an import style that does not match the actual export shape
4. public types exist internally but are not re-exported from the package boundary
5. subpath exports are published but undocumented in the shipped README
6. generated `.d.ts` files lose useful JSDoc or flatten the export story in a confusing way
7. a redundant default export makes the canonical import style unclear
8. `sideEffects: false` would be incorrect for files that rely on module evaluation
9. the shipped README is too thin, so installed consumers cannot learn the happy path from `node_modules`
10. repo docs and package README have drifted apart
11. `llms.txt` is proposed before the package is editor-friendly

## Editing Guidance

Prefer the smallest changes that improve installed-consumer discoverability.

- fix `package.json` and `tsup.config.ts` together when entrypoints change
- fix public re-exports before adding more prose
- improve emitted declaration usefulness before adding AI-specific files
- fix shipped README installation and import examples before adding `llms.txt`
- keep examples copy-pasteable and package-boundary-safe
- add JSDoc to the key exported API surface, not every internal helper
- ensure the JSDoc is visible on the generated exported declarations, not only in source
- preserve intentional `sideEffects` declarations
- keep the README self-sufficient for the basic usage path

Do not invent new entrypoints, deep-import paths, or future package structure just to make docs sound complete.

## Output Format

When reviewing only, return:

1. Metadata or export issues that break package or LSP discovery
2. Shipped declaration issues that block understanding in an installed consumer codebase
3. Public type or API-shape issues that force the assistant to guess
4. README gaps that hurt copy-paste usage after install
5. Secondary repo-doc drift issues, if any
6. Optional improvements such as JSDoc or `llms.txt`
7. Concrete next edits, prioritized

When making changes, also report:

1. Files changed
2. Why each change improves installed-consumer TypeScript package discoverability
3. Verification run and any remaining gaps

If the user explicitly asked for a review, lead with findings and file references before any summary.
