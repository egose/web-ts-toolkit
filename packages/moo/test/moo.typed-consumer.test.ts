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
 * Derived-field authoring covers public root/grouped/direct entries on Mongoose
 * 8 and 9, including partial/plain inputs, dependency names, and result types.
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
  defineDerivedField,
  derivedFieldsPlugin,
  DerivedFieldsDependencyError,
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
import {
  defineDerivedField as defineGrouped,
  derivedFieldsPlugin as derivedGrouped,
  type DerivedFieldDescriptor,
  type DerivedFieldGetter,
} from '@web-ts-toolkit/moo/plugins';
import {
  defineDerivedField as defineDirect,
  derivedFieldsPlugin as derivedDirect,
  type DerivedFieldDefinition,
  type DerivedFieldDependencyIssue,
  type DerivedFieldInput,
} from '@web-ts-toolkit/moo/plugins/derived-fields';
import type {
  CascadeDeleteDependencyMap,
  CascadeDeleteDocumentMethods,
  CascadeDeleteModelStatics,
  QueryFilter,
} from '@web-ts-toolkit/moo/plugins/cascade-delete';

// --- Canonical persisted-derived example and public authoring types ---
type User = { firstName: string; lastName: string | null; fullName: string; score: number };
const fullName = defineDerivedField<User, 'fullName'>({
  dependsOn: ['firstName', 'lastName'],
  get: (doc) => {
    const first: string | undefined = doc.firstName;
    const last: string | null | undefined = doc.lastName;
    return [first, last].filter((part) => part != null).join(' ');
  },
});
const userSchema = new Schema<User>({
  firstName: { type: String, required: true },
  lastName: String,
  fullName: { type: String, required: true, index: true, derived: fullName },
  score: { type: Number, derived: defineDirect<User, 'score'>({ dependsOn: ['firstName'], get: async (doc) => doc.firstName?.length }) },
}, { optimisticConcurrency: true });
userSchema.plugin(derivedFieldsPlugin);
new Schema<User>({ fullName: { type: String, derived: defineGrouped<User, 'fullName'>((doc) => doc.firstName) } }).plugin(derivedGrouped);
new Schema<User>({ fullName: { type: String, derived: defineDirect<User, 'fullName'>(async () => undefined) } }).plugin(derivedDirect);
const descriptor: DerivedFieldDescriptor<User, string> = fullName;
const getter: DerivedFieldGetter<User, string> = async (doc) => doc.lastName ?? undefined;
const choice: DerivedFieldDefinition<User, string> = Math.random() > 0.5 ? descriptor : getter;
defineDerivedField<User, 'fullName'>(choice);
const input: DerivedFieldInput<User> = { lastName: null };
const error = new DerivedFieldsDependencyError([{ targetPath: 'fullName', missingPaths: ['lastName'] }]);
const code: 'MOO_DERIVED_FIELDS_MISSING_DEPENDENCIES' = error.code;
const issues: readonly DerivedFieldDependencyIssue[] = error.issues;
const User = mongoose.model<User>('TypedDerivedUser', userSchema);
async function useDerived(): Promise<void> {
  await User.create({ firstName: 'Ada', lastName: 'Lovelace' });
  const matches: HydratedDocument<User>[] = await User.find({ fullName: /^Ada/ }).sort({ fullName: 1 });
  void matches;
}
void [input, code, issues, useDerived];

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
  defineDerivedField,
  DerivedFieldsDependencyError,
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
import { defineDerivedField as defineDirect, type DerivedFieldInput } from '@web-ts-toolkit/moo/plugins/derived-fields';

type User = { firstName: string; lastName: string | null; fullName: string; score: number };
// @ts-expect-error target keys must exist in the raw model
defineDerivedField<User, 'missing'>({ dependsOn: [], get: () => 'x' });
// @ts-expect-error dependency names must exist in the raw model
defineDirect<User, 'fullName'>({ dependsOn: ['missing'], get: () => 'x' });
// @ts-expect-error sync result must match the target type
defineDerivedField<User, 'fullName'>({ dependsOn: ['firstName'], get: () => 42 });
// @ts-expect-error async result must match the target type
defineDirect<User, 'fullName'>({ dependsOn: ['firstName'], get: async () => 42 });
// @ts-expect-error bare getters also have target-specific results
defineDerivedField<User, 'score'>((doc) => doc.firstName);
// @ts-expect-error null is not a result for a non-nullable target
defineDirect<User, 'fullName'>(() => null);
// @ts-expect-error a hydrated this is not supplied
defineDerivedField<User, 'fullName'>(function(this: { save(): void }) { return 'x'; });
defineDirect<User, 'fullName'>({ dependsOn: ['firstName'], get(doc) {
  // @ts-expect-error input properties are partial even for required raw-model fields
  const required: string = doc.firstName;
  // @ts-expect-error getters receive plain inputs, not hydrated document methods
  doc.isModified('firstName');
  // @ts-expect-error unknown input properties are not allowed
  void doc.missing;
  // @ts-expect-error input properties are readonly
  doc.firstName = 'mutation';
  return required;
} });
const input: DerivedFieldInput<User> = {};
// @ts-expect-error the plain input's property types are preserved
const badInput: DerivedFieldInput<User> = { firstName: 42 };
const error = new DerivedFieldsDependencyError([{ targetPath: 'fullName', missingPaths: ['lastName'] }]);
// @ts-expect-error issues expose readonly path arrays
error.issues[0].missingPaths.push('firstName');
void [input, badInput];

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
import { defineDerivedField, type ModelDocument, type ModelFunctionStaticMethods } from '@web-ts-toolkit/moo';
import { defineDerivedField as defineDirect } from '@web-ts-toolkit/moo/plugins/derived-fields';

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
type User = { firstName: string; fullName: string };
defineDerivedField<User, 'fullName'>({ dependsOn: ['missing'], get: () => 'x' });
defineDirect<User, 'fullName'>({ dependsOn: ['firstName'], get: async () => 42 });
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
  it.each(['^8.24.0', '^9.8.0'])(
    'compiles strict package-name authoring and negative cases on Mongoose %s',
    (mongooseVersion) => {
      const consumerDir = installPackedConsumer({ mongooseVersion });
      writeTypedConsumer(consumerDir);

      for (const file of ['typed-positive.mts', 'typed-negative.mts']) {
        const content = readFileSync(path.resolve(consumerDir, file), 'utf8');
        expect(content).toContain('@web-ts-toolkit/moo');
        expect(content).not.toContain('../dist');
        expect(content).not.toContain('./setup');
        expect(content).not.toContain('mongodb-memory-server');
      }

      run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-typed-nodenext.json', '--noEmit'], consumerDir);
    },
    180_000,
  );

  it.each(['^8.24.0', '^9.8.0'])(
    'rejects wrong plugin arguments/dependencies/results without suppression on Mongoose %s',
    (mongooseVersion) => {
      const consumerDir = installPackedConsumer({ mongooseVersion });
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
      const diagnostics = String((failure as Error)?.message ?? failure);
      expect(diagnostics).toMatch(/TS\d+/);
      expect(diagnostics).toContain('"missing"');
      expect(diagnostics).toContain('Promise<number>');
    },
    180_000,
  );
});
