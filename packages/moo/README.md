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

- schema helpers such as `uniqueNullableString(...)`
- `isObjectId(...)`
- plugins from `@web-ts-toolkit/moo/plugins`

## Documentation

Full package documentation lives in `website/docs/packages/moo.md`.
