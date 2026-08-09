/**
 * ARC-20: extracted from website model.mdx "Basic Usage", "Property Access",
 * "Dirty Tracking" revert semantics, "`save()`", "`reset()`",
 * "`assign(...)`, `toObject()`, and `toJSON()`", "Field Name Collisions",
 * and the `new Model(...)` draft pattern + `userService.new()` helper.
 *
 * Uses the simpler `User` shape from model.mdx (no nested subdocuments);
 * the nested-edit contract is exercised in `model-nested.ts`.
 *
 * `ModelResponse<T>` is the discriminated `Response<TData, Model<T> & TData>`
 * union — `data` is `null` on the `success: false` branch — so every read
 * site narrows on `result.success` before touching `result.data`, exactly as
 * the corrected docs describe. This is the contract ARC-20 surfaced: the
 * pre-ARC-20 docs wrote `user.data.role = 'owner'` without narrowing, which
 * does not compile against the published declaration surface.
 */
import { Model, createAdapter, type ModelResponse } from '@web-ts-toolkit/access-router-client';

interface User {
  _id?: string;
  name: string;
  role: string;
  public: boolean;
}

const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
const userService = adapter.createModelService<User>({
  modelName: 'User',
  basePath: 'users',
});

const read = await userService.read('user-id-1');

if (read.success) {
  read.data.name = 'new-name';
  read.data.role = 'owner';

  if (read.data.isDirty()) {
    await read.data.save();
  }

  read.data.role = 'owner';
  const _role = read.data.role;
  void _role;

  read.data.role = 'maintainer';
  read.data.isDirty('role');
  read.data.role = 'owner';
  read.data.isDirty('role');
}

const draft = await userService.new();
if (draft.success) {
  draft.data.assign({
    name: 'draft-user',
    role: 'author',
    public: true,
  });
  const saved: ModelResponse<User> = await draft.data.save();
  void saved;

  draft.data.role = 'owner';
  draft.data.reset();

  draft.data.assign({ role: 'admin', public: true });
  const plainClone = draft.data.toObject();
  void plainClone;
  const jsonClone = JSON.stringify(draft.data);
  void jsonClone;
}

// Collision-safe access — field named `save`.
interface WeirdDoc {
  _id?: string;
  save: string;
}
const weirdService = adapter.createModelService<WeirdDoc>({
  modelName: 'Weird',
  basePath: 'weird',
});
const doc = await weirdService.read('1');
if (doc.success) {
  // `save` is a model method, so the document field named `save` must be
  // reached via collision-safe `get(...)`/`set(...)` rather than the direct
  // property syntax. The compiled snippet proves the field coexists with
  // the method without either silencing the other.
  const saveField = doc.data.get('save');
  void saveField;
  doc.data.set('save', 'field-value');
  // And the method remains callable alongside the field:
  void doc.data.save;
}

// Direct `new Model(...)` construction.
const freshDraft = new Model(
  {
    name: 'draft-user',
    role: 'author',
    public: true,
  },
  userService,
);
await freshDraft.save();
