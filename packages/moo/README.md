# `@web-ts-toolkit/moo`

Mongoose helpers for schema fields, ObjectId checks, and document plugins.

## Installation

```sh
pnpm add mongoose @web-ts-toolkit/moo
```

Peer dependencies:

- `mongoose >= 8`

## Highlights

- partial-index helpers for nullable or empty-string fields
- strict `isObjectId(...)` guard
- model-function plugin
- cascade-delete plugin

## Quick Start

```ts
import { Schema } from 'mongoose';
import { uniqueEmptiableString, uniqueNullableString } from '@web-ts-toolkit/moo';

const userSchema = new Schema({
  email: uniqueNullableString('email'),
  username: uniqueEmptiableString('username'),
});
```

## Main Exports

Root entrypoint (`@web-ts-toolkit/moo`):

- schema helpers such as `uniqueNullableString(...)`
- `isObjectId(...)`

Subpath entrypoints:

- `@web-ts-toolkit/moo/schema` — schema field helpers
- `@web-ts-toolkit/moo/is` — type guards such as `isObjectId(...)`
- `@web-ts-toolkit/moo/utils` — mongoose utilities
- `@web-ts-toolkit/moo/plugins` — plugin entrypoint
- `@web-ts-toolkit/moo/plugins/cascade-delete` — cascade-delete plugin
- `@web-ts-toolkit/moo/plugins/model-function` — model-function plugin

### Subpath import example

```ts
import { Schema } from 'mongoose';
import { uniqueEmptiableString } from '@web-ts-toolkit/moo';
import { cascadeDeletePlugin } from '@web-ts-toolkit/moo/plugins/cascade-delete';

const userSchema = new Schema({
  email: uniqueEmptiableString('email'),
});

userSchema.plugin(cascadeDeletePlugin, { foreignKey: 'parentRef' });
```

## Documentation

Full package documentation lives in `website/docs/packages/moo.md`.

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/moo
