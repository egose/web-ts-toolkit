---
sidebar_label: Moo
sidebar_position: 16
---

# `@web-ts-toolkit/moo`

Helpers for common Mongoose patterns.

This package includes:

- partial-index helpers for nullable or empty string fields
- an `isObjectId(...)` guard for strict ObjectId checks
- document plugins for model-bound helper functions and cascade deletes

## Installation

```bash npm2yarn
npm install mongoose @web-ts-toolkit/moo
```

## What It Exposes

### Published Entry Points

Root entrypoint:

- schema helpers such as `uniqueNullableString(...)`
- `isObjectId(...)`

Published subpaths:

- `@web-ts-toolkit/moo/schema` for schema field helpers
- `@web-ts-toolkit/moo/is` for type guards such as `isObjectId(...)`
- `@web-ts-toolkit/moo/utils` for schema and reference helpers such as `isSchema(...)`, `isObjectIdType(...)`, and `isReference(...)`
- `@web-ts-toolkit/moo/plugins` for the shared plugin entrypoint
- `@web-ts-toolkit/moo/plugins/cascade-delete` for the cascade-delete plugin
- `@web-ts-toolkit/moo/plugins/model-function` for the model-function plugin

Example subpath imports:

```ts
import { isObjectId } from '@web-ts-toolkit/moo/is';
import { cascadeDeletePlugin } from '@web-ts-toolkit/moo/plugins/cascade-delete';
```

## Quick Start

### Schema helpers

```ts
import { Schema } from 'mongoose';
import { uniqueEmptiableString, uniqueNullableString } from '@web-ts-toolkit/moo';

const userSchema = new Schema({
  email: uniqueNullableString('email'),
  username: uniqueEmptiableString('username'),
});
```

The dedicated schema subpath is also available when you want the import to point directly at field helpers:

```ts
import { uniqueNullableString } from '@web-ts-toolkit/moo/schema';
```

### ObjectId checks

```ts
import { isObjectId } from '@web-ts-toolkit/moo';

if (!isObjectId(value)) {
  throw new Error('expected a valid MongoDB ObjectId');
}
```

### Utilities subpath

```ts
import { Schema } from 'mongoose';
import { isReference, isSchema } from '@web-ts-toolkit/moo/utils';

const userSchema = new Schema({
  manager: { type: Schema.Types.ObjectId, ref: 'User' },
});

isSchema(userSchema);
isReference({ type: Schema.Types.ObjectId, ref: 'User' }, 'User');
```

### Model function plugin

```ts
import mongoose, { type Model } from 'mongoose';
import {
  type ModelDocument,
  type ModelFunctionInstanceMethods,
  type ModelFunctionStaticMethods,
  modelFunctionPlugin,
} from '@web-ts-toolkit/moo';

type Cart = {
  name: string;
  price: number;
};

type CartDocument = ModelDocument<Cart, CartMethods>;

type CartMethods = ModelFunctionInstanceMethods<'applyDiscount', [suffix: string, priceChange: number], CartDocument>;

type CartModel = Model<Cart, {}, CartMethods> &
  ModelFunctionStaticMethods<'applyDiscount', CartDocument, [suffix: string, priceChange: number], CartDocument>;

const cartSchema = new mongoose.Schema<Cart, CartModel, CartMethods>({
  name: { type: String, required: true },
  price: { type: Number, required: true },
});

cartSchema.plugin(modelFunctionPlugin, {
  fnName: 'applyDiscount',
  fn: (cart: CartDocument, suffix: string, priceChange: number) => {
    cart.name = `${cart.name}-${suffix}`;
    cart.price += priceChange;
    return cart;
  },
});
```

### Cascade delete plugin

```ts
import mongoose, { type Model, type Types } from 'mongoose';
import {
  type CascadeDeleteDependencyMap,
  type CascadeDeleteDocumentMethods,
  type CascadeDeleteModelStatics,
  cascadeDeletePlugin,
} from '@web-ts-toolkit/moo/plugins';

const referenceModelName = 'Reference';

type Reference = {
  name: string;
};

type File = {
  refs: Types.ObjectId[];
};

type FileMethods = CascadeDeleteDocumentMethods<typeof referenceModelName, Reference>;

type FileModel = Model<File, {}, FileMethods> & CascadeDeleteModelStatics<typeof referenceModelName, Reference>;

type FileDependents = CascadeDeleteDependencyMap<typeof referenceModelName, Reference>;

const fileSchema = new mongoose.Schema<File, FileModel, FileMethods>({
  refs: [{ type: mongoose.Schema.Types.ObjectId, ref: referenceModelName }],
});

fileSchema.plugin(cascadeDeletePlugin, {
  model: referenceModelName,
  localField: 'refs',
  foreignField: '_id',
});

const File = mongoose.model<File, FileModel>('File', fileSchema);

async function example(file: mongoose.HydratedDocument<File, FileMethods>) {
  const dependents = (await file.findDependents()) as FileDependents;
  const references = await file.findDependents(referenceModelName);
  const orphans = await File.findOrphans(referenceModelName);

  dependents.Reference;
  references?.[0]?.name;
  orphans?.[0]?.name;
}
```

If you prefer importing the plugin from its dedicated published entrypoint instead of the grouped `plugins` subpath, use:

```ts
import { cascadeDeletePlugin } from '@web-ts-toolkit/moo/plugins/cascade-delete';
```

## Related Packages

- [`@web-ts-toolkit/access-router`](./access-router)
- [`@web-ts-toolkit/access-router-runtime`](./access-router-runtime)
