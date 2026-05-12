---
sidebar_label: Moo
sidebar_position: 5
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

## Usage

### Schema helpers

```ts
import { Schema } from 'mongoose';
import { uniqueEmptiableString, uniqueNullableString } from '@web-ts-toolkit/moo';

const userSchema = new Schema({
  email: uniqueNullableString('email'),
  username: uniqueEmptiableString('username'),
});
```

### ObjectId checks

```ts
import { isObjectId } from '@web-ts-toolkit/moo';

if (!isObjectId(value)) {
  throw new Error('expected a valid MongoDB ObjectId');
}
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
