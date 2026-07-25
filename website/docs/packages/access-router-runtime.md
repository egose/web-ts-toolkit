---
sidebar_label: Access Router Runtime
sidebar_position: 2
---

# `@web-ts-toolkit/access-router-runtime`

Config-driven wrapper around [`@web-ts-toolkit/access-router`](./access-router/) and `@web-ts-toolkit/express-runtime`.

This package is for the case where you want the generated resource REST API from `access-router`, but you do not want to hand-wire:

- Mongoose model registration
- global `access-router` options
- root and OpenAPI routers
- Express app setup
- local dev vs. serverless runtime entry modules

Instead, you describe the API in one TypeScript config file and let the package assemble the app and CLI entrypoints.

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/access-router-runtime @web-ts-toolkit/access-router @web-ts-toolkit/express-runtime express mongoose
```

## What It Exposes

Main entrypoint:

- `defineRuntimeConfig(...)`
- `createAccessRouterRuntime(config)`
- `createAccessRouterRuntimeApp(config)`
- `createAccessRouterRuntimeServerlessHandler(config, options?)`
- `loadAccessRouterRuntimeConfigSync(path)`

CLI binary:

- `wtt-access-router-runtime dev`
- `wtt-access-router-runtime build`
- `wtt-access-router-runtime start`
- `wtt-access-router-runtime build-serverless`
- `wtt-access-router-runtime start-serverless`

## Quick Start

```ts
import mongoose from 'mongoose';
import { defineRuntimeConfig } from '@web-ts-toolkit/access-router-runtime';

const OPEN_ACCESS = { list: true, read: true, create: true, update: true, delete: true } as const;

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, default: 'user' },
});

export default defineRuntimeConfig({
  db: {
    url: process.env.MONGODB_URI,
  },
  globalOptions: {
    globalPermissions() {
      return [];
    },
  },
  models: [
    {
      name: 'User',
      schema: UserSchema,
      router: {
        basePath: '/api/users',
        operationAccess: OPEN_ACCESS,
        permissionSchema: {
          name: OPEN_ACCESS,
          role: OPEN_ACCESS,
        },
      },
    },
  ],
  rootRouter: {
    basePath: '/api/root',
    operationAccess: true,
  },
  openApi: {
    title: 'Example API',
    version: '1.0.0',
    jsonPath: '/api/openapi.json',
  },
});
```

## Relationship To The Lower-Level Packages

`access-router-runtime` does not replace the two core packages. It composes them.

- `@web-ts-toolkit/access-router` still owns router generation, permissions, hooks, validation, and OpenAPI metadata.
- `@web-ts-toolkit/express-runtime` still owns the Express app factory, local server lifecycle, serverless wrapper, and bundling CLI behavior.
- `@web-ts-toolkit/access-router-runtime` adds a config layer so those two packages can be used with less application boilerplate.

If you want full low-level control over app wiring, use the two core packages directly. If your API is mostly generated model/data/root routes, this package is the shorter path.

## Config Shape

The config object can describe:

- `db`: MongoDB connection URL and `mongoose.connect(...)` options
- `globalOptions`: global `access-router` options
- `defaultModelOptions`: shared model-router defaults
- `models`: model-backed resource routers from `schema` or existing `model`
- `data`: in-memory data routers
- `rootRouter`: grouped root batch route
- `openApi`: generated JSON and Swagger UI routes
- `extraRoutes`: extra Express/access-router routes to mount alongside generated routers
- `express`: Express middleware, parser, and error-handler options
- `init` / `shutdown`: runtime lifecycle hooks

Model definitions can use either:

- `model`: an already-created Mongoose model
- `schema`: a schema plus `name`, so the runtime registers the model for you

## CLI

The CLI mirrors the `express-runtime` commands, but `dev`, `build`, and `build-serverless` start from a config file instead of a hand-written app module.

### Local dev

```bash
wtt-access-router-runtime dev ./src/access-router.config.ts --env .env --port 3000
```

### Build a local runtime bundle

```bash
wtt-access-router-runtime build ./src/access-router.config.ts --out-dir dist
```

### Build a serverless bundle

```bash
wtt-access-router-runtime build-serverless ./src/access-router.config.ts --out-dir netlify/functions
```

### Start built artifacts

These are pass-through wrappers to `wtt-express-runtime`:

```bash
wtt-access-router-runtime start ./dist/app.js --port 3000
wtt-access-router-runtime start-serverless ./netlify/functions/handler.js --port 9000
```

## In-Repo Example

A copyable starter config lives in the package source:

- `packages/access-router-runtime/examples/basic/access-router.config.ts`

That example shows one model router, one data router, a root router, OpenAPI setup, global permissions, and Express finalize/error handling.

## When To Use It

Use `access-router-runtime` when you want:

- generated resource REST endpoints with minimal application wiring
- one config file as the source of truth for DB, routers, and runtime behavior
- both local and serverless execution without maintaining separate app entry files
- to keep using `access-router` options for global, root, model, and data routes

If your app has highly custom Express composition or only uses a small part of `access-router`, the lower-level packages may still be a better fit.
