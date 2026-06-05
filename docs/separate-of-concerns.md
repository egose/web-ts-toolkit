# Separation of Concerns in web-ts-toolkit

## Overview

Each package in the monorepo owns exactly one concern. This document maps those concerns and shows how they compose in a real request.

## Concern → Package

| Concern           | Package                    | What it owns                                           |
| ----------------- | -------------------------- | ------------------------------------------------------ |
| HTTP errors       | `http-errors`              | Typed error classes, serialization, status mapping     |
| Response handling | `express-response-handler` | FastAPI-style return-value responses, error formatting |
| Mongoose helpers  | `moo`                      | Schema plugins, field helpers, ObjectId guards         |
| Routing + ACL     | `access-router`            | Model/data routers, ACL evaluation, CRUD services      |
| Client adapter    | `access-router-client`     | Typed fetch wrappers for access-router APIs            |
| Decorator config  | `access-router-deco`       | Decorator-based ACL/route configuration                |
| React hooks       | `access-router-react`      | `useRead`, `useCreate`, `useUpdate`, etc.              |
| OpenAPI           | `access-router` (openapi)  | Schema conversion, spec builder, Swagger UI            |
| Shared helpers    | `utils`                    | Collection, string, async, URL utilities               |

## How the layers compose

A request flows through these layers in order:

```
HTTP Request
  → express-response-handler  (parse, route, respond)
    → access-router           (ACL check, service call)
      → moo                   (Mongoose query, field helpers)
        → http-errors         (thrown on failure at any layer)
  ← express-response-handler  (format response or error)
```

Each layer depends only on the one below it. Cross-layer coupling is avoided.

## Concrete example: GET /users/:id

### 1. Route definition (`access-router`)

```typescript
import { ModelRouter } from '@web-ts-toolkit/access-router';

const userRouter = new ModelRouter('User', mongoose.model('User'), {
  routeGuard: { read: true },
  permissionSchema: {
    name: 'r',
    email: 'r',
    password: 'd',
  },
});
```

The router owns routing, ACL evaluation, and CRUD orchestration. It does not format HTTP responses or define error shapes.

### 2. Service layer (`access-router`)

```typescript
async read(req, id) {
  const doc = await this.service.read(id)
  return doc
}
```

The service owns query construction, field trimming, and output decoration. It does not know about Express, HTTP status codes, or response formatting.

### 3. Response handling (`express-response-handler`)

```typescript
import apiHandler from '@web-ts-toolkit/express-response-handler';
import { OK, NotFound } from '@web-ts-toolkit/express-response-handler';

app.use('/api', apiHandler(userRouter));
```

The handler wraps the router. When the service returns a value, it calls `res.json()`. When the service throws, it catches the error and formats it. The router never touches `res` directly.

### 4. Error domain (`http-errors`)

```typescript
import { NotFoundError } from '@web-ts-toolkit/http-errors';

throw new NotFoundError('User not found');
```

`http-errors` defines the error shape and status code mapping. It does not catch or format errors — that is `express-response-handler`'s job.

### 5. Data layer (`moo`)

```typescript
import { plugin } from '@web-ts-toolkit/moo';

UserSchema.plugin(plugin);
```

`moo` provides Mongoose schema utilities. It does not handle HTTP, routing, or ACL.

### 6. Client side (`access-router-client` → `access-router-react`)

```typescript
import { createAdapter } from '@web-ts-toolkit/access-router-client';
const adapter = createAdapter('http://localhost:8000/api');

import { createModelHooks } from '@web-ts-toolkit/access-router-react';
const { useRead, useList } = createModelHooks('User', adapter);
```

The client adapter owns HTTP transport. The React hooks own state management. Neither knows about the server-side ACL or service logic.

## Why this matters

- **Swap databases** → change `moo` usage only
- **Change ACL rules** → change `access-router` config only
- **Switch HTTP framework** → change `express-response-handler` adapter only
- **Change frontend** → swap `access-router-react` for `access-router-client` directly
- **Add OpenAPI docs** → call `createOpenApiRouter()`, no route changes needed

Each change touches one package. No other layer needs to know.

## Anti-patterns to avoid

1. **Formatting responses inside services** — services return values, handlers format them
2. **Throwing raw `Error` instead of typed HTTP errors** — use `http-errors` classes
3. **Putting ACL logic in routes** — routes delegate to services which enforce ACL
4. **Direct Mongoose calls outside `moo`/`access-router`** — keep the data layer contained
5. **Client-side HTTP errors bypassing the adapter** — the adapter handles transport errors
