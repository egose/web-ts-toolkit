import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { cleanupPackedConsumerTempRoots, installPackedConsumer, run } from './support/packed-consumer-harness';

/**
 * MOO-10 strict compiler gate.
 *
 * Representative package-name consumer examples (sync/async instance, static,
 * and ById helpers with inference; typed query operators; nullable
 * orphan/dependent maps; schema-option overrides) plus `@ts-expect-error`
 * negative cases, compiled with strict NodeNext against the packed tarball.
 * Deliberately isolated from MongoDB runtime fixtures: the generated
 * consumer imports only `mongoose` and `@web-ts-toolkit/moo*` by package
 * name — never `../dist`, repo aliases, `./setup`, or
 * `mongodb-memory-server`.
 *
 * Baseline note (MOO-10 acceptance): the historical one-off probe
 * `tsc --ignoreConfig ... test/model-function-plugin.test.ts test/setup.ts`
 * still reports `TS2345` for `mongoose.connect(uri, { dbName })` in
 * `test/setup.ts:12` (mongodb-driver `ConnectOptions` overload resolution
 * under `--ignoreConfig` NodeNext). That fixture-only prerequisite is
 * unrelated to shipped consumer types and is excluded from this gate via the
 * narrow `include` below; see the task evidence for the recorded output.
 */

function positiveSource(): string {
  return `import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import {
  cascadeDeletePlugin,
  isObjectId,
  modelFunctionPlugin,
  newDocumentPlugin,
  uniqueNullableString,
  type ModelDocument,
  type ModelFunctionInstanceMethods,
  type ModelFunctionStaticMethods,
} from '@web-ts-toolkit/moo';
import { uniqueEmptiableString } from '@web-ts-toolkit/moo/schema';
import { isReference, isSchema } from '@web-ts-toolkit/moo/utils';
import type {
  CascadeDeleteDependencyMap,
  CascadeDeleteDocumentMethods,
  CascadeDeleteModelStatics,
  QueryFilter,
} from '@web-ts-toolkit/moo/plugins/cascade-delete';

// --- Model-function: sync/async instance, static, and ById with inference ---
// Result types stay free of the CartDocument alias (plain numbers, not the
// document) so CartDocument/CartMethods never circularly reference each other.
type Cart = { name: string; price: number };
type CartMethods =
  ModelFunctionInstanceMethods<'applyDiscount', [suffix: string, priceChange: number], number> &
    ModelFunctionInstanceMethods<'applyDiscountAsync', [suffix: string, priceChange: number], Promise<number>>;
type CartDocument = ModelDocument<Cart, CartMethods>;
type CartModel = Model<Cart, Record<string, never>, CartMethods> &
  ModelFunctionStaticMethods<'applyDiscount', CartDocument, [suffix: string, priceChange: number], number> &
  ModelFunctionStaticMethods<'applyDiscountAsync', CartDocument, [suffix: string, priceChange: number], Promise<number>>;

const cartSchema = new Schema<Cart, CartModel, CartMethods>({
  name: { type: String, required: true },
  price: { type: Number, required: true },
});

// Inference: no explicit plugin generics; method name, args, and result flow from options.
cartSchema.plugin(modelFunctionPlugin, {
  fnName: 'applyDiscount',
  fn: (cart: CartDocument, suffix: string, priceChange: number) => {
    cart.price += priceChange;
    return cart.price;
  },
});
cartSchema.plugin(modelFunctionPlugin, {
  fnName: 'applyDiscountAsync',
  fn: async (cart: CartDocument, suffix: string, priceChange: number) => {
    cart.price += priceChange;
    return cart.price;
  },
});

async function useCart(model: CartModel, doc: CartDocument): Promise<void> {
  const syncPrice: number = model.applyDiscount(doc, 'sale', 5);
  const instancePrice: number = doc.applyDiscount('sale', 5);
  const asyncPrice: number = await model.applyDiscountAsync(doc, 'sale', 5);
  const asyncInstance: number = await doc.applyDiscountAsync('sale', 5);
  const byId: number | null = await model.applyDiscountById(doc._id.toString(), 'sale', 5);
  const byObjectId: number | null = await model.applyDiscountAsyncById(new mongoose.Types.ObjectId(), 'sale', 5);
  void [syncPrice, instancePrice, asyncPrice, asyncInstance, byId, byObjectId];
}
void useCart;

// --- Typed query operators match the runtime (forwarded to Mongoose find) ---
type Item = { name: string; price: number };
const operatorFilter: QueryFilter<Item> = { price: { $gt: 5 } };
const inFilter: QueryFilter<Item> = { price: { $in: [1, 2, 3] } };
const regexFilter: QueryFilter<Item> = { name: { $regex: '^a' } };
const directFilter: QueryFilter<Item> = { price: 5, name: 'x' };
const logicalFilter: QueryFilter<Item> = { $and: [{ price: { $gte: 1 } }, { name: 'x' }] } as QueryFilter<Item>;
void [operatorFilter, inFilter, regexFilter, directFilter, logicalFilter];

// --- Nullable dependent/orphan maps match mergeResults (missing keys omitted) ---
type File = { refs: mongoose.Types.ObjectId[] };
type Reference = { name: string };
type FileMethods = CascadeDeleteDocumentMethods<'Reference', Reference>;
type FileModel = Model<File, Record<string, never>, FileMethods> & CascadeDeleteModelStatics<'Reference', Reference>;

async function useCascade(
  doc: HydratedDocument<File, FileMethods>,
  model: FileModel,
): Promise<void> {
  const all: Partial<CascadeDeleteDependencyMap<'Reference', Reference>> & Record<string, unknown[]> =
    await doc.findDependents();
  const refs: Reference[] = await doc.findDependents('Reference');
  const orphans: Reference[] | null = await model.findOrphans('Reference');
  const allOrphans: Partial<CascadeDeleteDependencyMap<'Reference', Reference>> & Record<string, unknown[]> =
    await model.findOrphans();
  // An omitted entry is valid: unsupported/null lookups are skipped at runtime.
  const empty: Partial<CascadeDeleteDependencyMap<'Reference', Reference>> = {};
  void [all, refs, orphans, allOrphans, empty];
}
void useCascade;

// --- Schema-option overrides match the runtime spread (overrides win) ---
const emailField = uniqueNullableString('email');
const baseDefault: null = emailField.default;
const withDefault = uniqueNullableString('email', { default: 'n-a' as const });
const overriddenDefault: 'n-a' = withDefault.default;
const withSparse = uniqueEmptiableString('username', { sparse: true as const });
const sparseFlag: true = withSparse.sparse;
void [baseDefault, overriddenDefault, sparseFlag];

// --- Cascade options, new-document post-save scope, and helper narrowing ---
const ownerSchema = new Schema({ name: String });
ownerSchema.plugin(newDocumentPlugin, {
  fn: async (doc) => {
    void (doc as unknown);
  },
});
ownerSchema.plugin(cascadeDeletePlugin, {
  model: 'Child',
  localField: '_id',
  foreignField: 'ownerId',
  maxConcurrency: 4,
  batchSize: 10,
});

declare const candidate: unknown;
if (isObjectId(candidate)) {
  const narrowed: string | object = candidate;
  void narrowed;
}
if (!isSchema(ownerSchema) || !isReference({ type: Schema.Types.ObjectId, ref: 'Child' }, 'Child')) {
  throw new Error('helper mismatch');
}
`;
}

function negativeSource(): string {
  return `import mongoose, { Schema, type Model } from 'mongoose';
import {
  modelFunctionPlugin,
  type ModelDocument,
  type ModelFunctionInstanceMethods,
  type ModelFunctionStaticMethods,
} from '@web-ts-toolkit/moo';
import type {
  CascadeDeleteDependencyMap,
  QueryFilter,
} from '@web-ts-toolkit/moo/plugins/cascade-delete';
import { uniqueNullableString } from '@web-ts-toolkit/moo/schema';

type Cart = { name: string; price: number };
type CartMethods =
  ModelFunctionInstanceMethods<'applyDiscount', [suffix: string, priceChange: number], number> &
    ModelFunctionInstanceMethods<'applyDiscountAsync', [suffix: string, priceChange: number], Promise<number>>;
type CartDocument = ModelDocument<Cart, CartMethods>;
type CartModel = Model<Cart, Record<string, never>, CartMethods> &
  ModelFunctionStaticMethods<'applyDiscount', CartDocument, [suffix: string, priceChange: number], number> &
  ModelFunctionStaticMethods<'applyDiscountAsync', CartDocument, [suffix: string, priceChange: number], Promise<number>>;

const cartSchema = new Schema<Cart, CartModel, CartMethods>({
  name: { type: String, required: true },
  price: { type: Number, required: true },
});
cartSchema.plugin(modelFunctionPlugin, {
  fnName: 'applyDiscount',
  fn: (cart: CartDocument, suffix: string, priceChange: number) => {
    cart.price += priceChange;
    return cart.price;
  },
});

declare const model: CartModel;
declare const doc: CartDocument;

export async function negative(): Promise<void> {
  // @ts-expect-error wrong argument type for the plugin helper
  model.applyDiscount(doc, 123, 5);
  // @ts-expect-error missing required argument
  doc.applyDiscount('sale');
  // @ts-expect-error ById requires an ObjectId or string id
  await model.applyDiscountById(123, 'sale', 5);
  // @ts-expect-error operator value must match the field type
  const badOperator: QueryFilter<Cart> = { price: { $gt: 'not-a-number' } };
  void badOperator;
  // @ts-expect-error the full dependency map requires every configured key
  const fullMap: CascadeDeleteDependencyMap<'Reference', { name: string }> = {};
  void fullMap;
  // @ts-expect-error schema helper requires the indexed field name
  uniqueNullableString(123);
  void mongoose;
}
`;
}

function shouldFailSource(): string {
  return `import type { Model } from 'mongoose';
import type { ModelDocument, ModelFunctionStaticMethods } from '@web-ts-toolkit/moo';

type Cart = { name: string; price: number };
type CartMethods = { applyDiscount(suffix: string, priceChange: number): number };
type CartDocument = ModelDocument<Cart, CartMethods>;
type CartModel = Model<Cart, Record<string, never>, CartMethods> &
  ModelFunctionStaticMethods<'applyDiscount', CartDocument, [suffix: string, priceChange: number], number>;

declare const model: CartModel;
declare const doc: CartDocument;

// Deliberately missing @ts-expect-error: this file must fail compilation,
// proving wrong arguments are rejected without the suppression comment.
export function shouldFail(): void {
  model.applyDiscount(doc, 123, 5);
}
`;
}

function writeTypedConsumer(consumerDir: string): void {
  writeFileSync(path.resolve(consumerDir, 'typed-positive.mts'), positiveSource());
  writeFileSync(path.resolve(consumerDir, 'typed-negative.mts'), negativeSource());
  writeFileSync(
    path.resolve(consumerDir, 'tsconfig-typed-nodenext.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          skipLibCheck: false,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          types: ['node'],
        },
        // Isolated gate: only the package-name consumer examples above.
        // test/setup.ts (MongoDB fixture with its own ConnectOptions
        // prerequisite) is deliberately excluded here.
        include: ['typed-positive.mts', 'typed-negative.mts'],
      },
      null,
      2,
    )}\n`,
  );
}

afterAll(() => {
  cleanupPackedConsumerTempRoots();
});

describe('Moo typed consumer compiler gate (MOO-10)', () => {
  it('compiles representative package-name examples with inference and expected negative cases', () => {
    const consumerDir = installPackedConsumer({ mongooseVersion: '^9.8.0' });
    writeTypedConsumer(consumerDir);

    for (const file of ['typed-positive.mts', 'typed-negative.mts']) {
      const content = readFileSync(path.resolve(consumerDir, file), 'utf8');
      expect(content).toContain('@web-ts-toolkit/moo');
      expect(content).not.toContain('../dist');
      expect(content).not.toContain('./setup');
      expect(content).not.toContain('mongodb-memory-server');
    }

    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-typed-nodenext.json', '--noEmit'], consumerDir);
  }, 180_000);

  it('rejects wrong plugin arguments without a suppression comment', () => {
    const consumerDir = installPackedConsumer({ mongooseVersion: '^9.8.0' });
    writeTypedConsumer(consumerDir);
    writeFileSync(path.resolve(consumerDir, 'typed-should-fail.mts'), shouldFailSource());
    writeFileSync(
      path.resolve(consumerDir, 'tsconfig-typed-should-fail.json'),
      `${JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            skipLibCheck: false,
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            types: ['node'],
          },
          include: ['typed-should-fail.mts'],
        },
        null,
        2,
      )}\n`,
    );

    let failure: unknown = null;
    try {
      run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-typed-should-fail.json', '--noEmit'], consumerDir);
    } catch (error) {
      failure = error;
    }
    expect(failure).not.toBeNull();
    expect(String((failure as Error)?.message ?? failure)).toMatch(/TS\d+/);
  }, 180_000);
});
