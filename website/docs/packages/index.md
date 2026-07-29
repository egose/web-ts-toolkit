---
sidebar_label: Overview
sidebar_position: 0
---

# Package Documentation

This site is the primary documentation home for the current `web-ts-toolkit` workspace packages.

## Available Packages

- [`@web-ts-toolkit/access-router`](./access-router): access-policy Express routers and in-memory data services for Mongoose-backed APIs.
- [`@web-ts-toolkit/access-router-runtime`](./access-router-runtime): config-driven runtime that composes `access-router` and `express-runtime` into resource REST APIs.
- [`@web-ts-toolkit/access-router-deco`](./access-router-deco): decorator-based module and router configuration for `access-router`.
- [`@web-ts-toolkit/access-router-client`](./access-router-client): typed client adapter, model wrapper, and batching helpers for `access-router` APIs.
- [`@web-ts-toolkit/access-router-react`](./access-router-react): React hooks for `access-router-client` model services.
- [`@web-ts-toolkit/express-runtime`](./express-runtime): Express app factory, local dev server helpers, serverless wrapper, and reusable runtime CLI.
- [`@web-ts-toolkit/express-json-router`](./express-json-router): JSON-aware Express router wrapper built on the shared response handler.
- [`@web-ts-toolkit/express-oidc-vault`](./express-oidc-vault): cookie-free OIDC middleware for Express with server-side refresh-token storage.
- [`@web-ts-toolkit/express-oidc-vault-memory-store`](./express-oidc-vault-memory-store): in-memory store provider for `express-oidc-vault`.
- [`@web-ts-toolkit/express-oidc-vault-redis-store`](./express-oidc-vault-redis-store): Redis-backed store provider for `express-oidc-vault`.
- [`@web-ts-toolkit/express-oidc-vault-mongodb-store`](./express-oidc-vault-mongodb-store): MongoDB-backed store provider for `express-oidc-vault`.
- [`@web-ts-toolkit/express-response-handler`](./express-response-handler): return-value response handling for Express routes.
- [`@web-ts-toolkit/http-errors`](./http-errors): typed HTTP error classes and structured error payload helpers.
- [`@web-ts-toolkit/message-service`](./message-service): template-driven messaging service with Mongoose schemas, route factory, and provider hooks.
- [`@web-ts-toolkit/moo`](./moo): Mongoose helpers for schema fields, ObjectId checks, and document plugins.
- [`@web-ts-toolkit/utils`](./utils): shared collection, object, async, and URL helpers used across the workspace.
- [`create-access-router-mongo-starter`](./create-access-router-mongo-starter): starter CLI that scaffolds a MongoDB-backed `access-router` + React app.

Many package-local `README.md` files stay intentionally short and point back here for the full guides.
