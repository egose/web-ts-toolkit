/** Real service workers/lifecycle, with deterministic persistence adapters and no database. */
import mongoose from 'mongoose';
import { vi } from 'vitest';
import type { AuthorizationMode, ModelRouterOptions } from '../../../src/interfaces';
import { ownedStageFixture } from './owned-stage-test-fixture';

export function writeOutputFixture(
  mode: AuthorizationMode,
  options: ModelRouterOptions = {},
  schema: mongoose.SchemaDefinition = {},
) {
  const f = ownedStageFixture({
    schema,
    maxHookConcurrency: 2,
    modelOptions: {
      readAuthorizationMode: 'trusted',
      listAuthorizationMode: 'trusted',
      createAuthorizationMode: mode,
      updateAuthorizationMode: mode,
      permissionSchema: { value: true, when: true, payload: true, owner: true, hidden: false },
      ...options,
    },
  });
  const docs: mongoose.Document[] = [];
  const saved: Record<string, unknown>[] = [];
  const saves = vi.fn();
  const add = (data: object) => {
    const doc = new f.model(data);
    vi.spyOn(doc, 'save').mockImplementation(async () => {
      saves();
      saved.push(doc.toObject());
      return doc;
    });
    docs.push(doc);
    return doc;
  };
  const stored = add({
    _id: 'existing',
    value: 'before',
    owner: true,
    when: new Date(1),
    payload: { stamp: new Date(2), bytes: Buffer.from('original') },
  });
  const match = (filter: any): mongoose.Document | null => {
    if (filter === false) return null;
    if (filter?.$and) return filter.$and.every((part: unknown) => match(part)) ? stored : null;
    return (
      docs.find((doc: any) =>
        Object.entries(filter ?? {}).every(([key, value]) => String(doc[key]) === String(value)),
      ) ?? null
    );
  };
  const adapter = Object.assign(f.adapter, {
    create: vi.fn(async (items: object[]) =>
      items.map((item, index) => {
        const doc = add({ _id: `created-${docs.length}-${index}`, ...item });
        saved.push(doc.toObject());
        return doc;
      }),
    ),
    exists: vi.fn(async (filter: unknown) => match(filter)),
    new: vi.fn(async () => new f.model({ value: 'template', owner: true })),
  });
  adapter.findOne.mockImplementation(async ({ filter, lean }) => {
    const doc = match(filter);
    return lean && doc ? doc.toObject() : doc;
  });
  adapter.find.mockImplementation(async () => docs.map((doc) => doc.toObject()));
  adapter.countDocuments.mockImplementation(async () => docs.length);
  return { ...f, adapter, stored, docs, saved, saves, add };
}
