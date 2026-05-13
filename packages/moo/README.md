# moo

Helpers for common Mongoose patterns.

This package includes:

- partial-index helpers for nullable or empty string fields
- an `isObjectId(...)` guard for strict ObjectId checks
- document plugins for model-bound helper functions and cascade deletes

## Installation

```sh
npm install mongoose @web-ts-toolkit/moo
```

## Documentation

- Full package documentation lives in `website/docs/packages/moo.md`.
- Use the Docusaurus site in `website` for the full examples.

## Minimal Example

```ts
import { Schema } from 'mongoose';
import { uniqueEmptiableString, uniqueNullableString } from '@web-ts-toolkit/moo';

const userSchema = new Schema({
  email: uniqueNullableString('email'),
  username: uniqueEmptiableString('username'),
});
```
