// Source-level authoring checks for DF-01. Packed entrypoint checks follow in DF-03.
import { Schema } from 'mongoose';

import {
  defineDerivedField,
  type DerivedFieldDefinition,
  type DerivedFieldDescriptor,
  type DerivedFieldGetter,
  type DerivedFieldInput,
} from '../src/plugins/derived-fields';

type User = { firstName: string; lastName: string | null; fullName: string; score: number };

const fullName = defineDerivedField<User, 'fullName'>({
  dependsOn: ['firstName', 'lastName'],
  get(doc) {
    const optional: string | undefined = doc.firstName;
    const nullable: string | null | undefined = doc.lastName;
    // @ts-expect-error Inputs are partial even if the raw model requires firstName.
    const required: string = doc.firstName;
    // @ts-expect-error Inputs are readonly.
    doc.firstName = 'mutated';
    // @ts-expect-error Plain persisted inputs do not have hydrated document methods.
    doc.isModified('firstName');
    void required;
    return `${optional ?? ''} ${nullable ?? ''}`;
  },
});
const score = defineDerivedField<User, 'score'>({
  dependsOn: ['firstName'],
  get: async (doc) => doc.firstName?.length,
});
const shorthand = defineDerivedField<User, 'fullName'>((doc) => doc.firstName);
const asyncShorthand = defineDerivedField<User, 'fullName'>(async (doc) => doc.lastName ?? undefined);

new Schema<User>({
  firstName: String,
  lastName: String,
  fullName: { type: String, derived: fullName },
  score: { type: Number, derived: score },
});
const descriptor: DerivedFieldDescriptor<User, string> = fullName;
const getter: DerivedFieldGetter<User, string> = shorthand;
const definition: DerivedFieldDefinition<User, string> = asyncShorthand;
const input: DerivedFieldInput<User> = {};
const choice: DerivedFieldDefinition<User, string> = Math.random() > 0.5 ? fullName : shorthand;
defineDerivedField<User, 'fullName'>(choice);
void [descriptor, getter, definition, input];

// @ts-expect-error The target key must exist in the raw persisted model.
defineDerivedField<User, 'missing'>({ dependsOn: [], get: () => 'x' });
// @ts-expect-error Unknown dependencies are rejected by the typed helper.
defineDerivedField<User, 'fullName'>({ dependsOn: ['missing'], get: () => 'x' });
// @ts-expect-error The target's string result type must be respected.
defineDerivedField<User, 'fullName'>({ dependsOn: ['firstName'], get: () => 42 });
// @ts-expect-error Async results must also respect the target type.
defineDerivedField<User, 'fullName'>({ dependsOn: ['firstName'], get: async () => 42 });
// @ts-expect-error Bare function results are checked too.
defineDerivedField<User, 'score'>((doc) => doc.firstName);
// @ts-expect-error null is not a valid result for a non-nullable target.
defineDerivedField<User, 'fullName'>(() => null);
// @ts-expect-error No Mongoose document is bound as the getter's `this`.
defineDerivedField<User, 'fullName'>(function (this: { save(): void }) {
  return 'x';
});
