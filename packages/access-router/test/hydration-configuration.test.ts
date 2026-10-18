import mongoose from 'mongoose';
import { afterEach, describe, expect, it } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';

let serial = 0;
afterEach(() => mongoose.deleteModel(/^HydConfig/));
function fixture() {
  const api = createAccessRuntime();
  const model = mongoose.model(`HydConfig${++serial}`, new mongoose.Schema({ name: String }));
  api.runtime.registerModelInstance(model.modelName, model);
  return { api, model, name: model.modelName };
}

describe('hydration configuration admission and shallow ownership', () => {
  it('owns plain records, replaces shallowly, clears overrides, and restores bootstrap snapshots', () => {
    const { api, model, name } = fixture();
    api.setDefaultModelOptions({ hydration: { publicList: 'hydrated', find: 'lean' } });
    api.createRouter(model);
    const initial = api.getModelOptions(name);
    api.setDefaultModelOption('hydration.publicRead', 'lean');
    expect(api.getModelOptions(name).hydration).toEqual(initial.hydration);
    api.setModelOptions(name, { hydration: { findOne: 'lean' } });
    expect(api.getModelOptions(name).hydration).toEqual({ findOne: 'lean' });
    api.setModelOption(name, 'hydration.findById', 'hydrated');
    const captured = api.getModelOptions(name);
    const snapshot = api.runtime.createBootstrapSnapshot();
    api.setModelOption(name, 'hydration.findOne', undefined);
    expect(api.getModelOptions(name).hydration).toEqual({ findOne: undefined, findById: 'hydrated' });
    expect(captured.hydration).toEqual({ findOne: 'lean', findById: 'hydrated' });
    api.setModelOption(name, 'hydration', undefined);
    expect(api.getModelOptions(name).hydration).toBeUndefined();
    api.runtime.restoreBootstrapSnapshot(snapshot);
    expect(api.getModelOptions(name).hydration).toEqual(captured.hydration);
    const input = Object.assign(Object.create(null), { publicRead: 'lean' });
    api.setModelOption(name, 'hydration', input);
    input.publicRead = 'hydrated';
    expect(api.getModelOptions(name).hydration).toEqual({ publicRead: 'lean' });
    expect(Object.isFrozen(api.getModelOptions(name).hydration)).toBe(true);
    api.setDefaultModelOption('hydration', undefined);
    expect(api.getDefaultModelOptions().hydration).toBeUndefined();
  });

  it.each([
    null,
    [],
    true,
    'lean',
    new Date(),
    { default: 'lean' },
    { find: false },
    { find: null },
    { find: 'auto' },
    { [Symbol('find')]: 'lean' },
  ])('rejects malformed records before publishing any model/default update: %j', (hydration) => {
    const { api, model, name } = fixture();
    api.createRouter(model, { hydration: { find: 'lean' }, listHardLimit: 5 });
    const current = api.getModelOptions(name);
    const defaults = api.getDefaultModelOptions();
    expect(() => api.setModelOptions(name, { listHardLimit: 7, hydration } as never)).toThrow(/hydration/);
    expect(() => api.setDefaultModelOptions({ listHardLimit: 7, hydration } as never)).toThrow(TypeError);
    expect(() => api.setModelOption(name, 'hydration', hydration as never)).toThrow(TypeError);
    expect(() => api.setDefaultModelOption('hydration', hydration as never)).toThrow(TypeError);
    expect(api.getModelOptions(name)).toEqual(current);
    expect(api.getDefaultModelOptions()).toEqual(defaults);
  });

  it('validates exact dotted setters and rejects all legacy defaults with migration paths', () => {
    const { api, model, name } = fixture();
    api.createRouter(model, { hydration: { find: 'lean' } });
    for (const key of ['hydration.default', 'hydration.find.extra', 'hydration.unknown']) {
      expect(() => api.setModelOption(name, key as never, 'lean' as never)).toThrow(key);
      expect(() => api.setDefaultModelOption(key as never, 'lean' as never)).toThrow(key);
    }
    for (const key of ['publicList', 'publicRead', 'find', 'findOne', 'findById']) {
      const bucket = `${key}Options`;
      expect(() => api.setModelOption(name, `hydration.${key}` as never, false as never)).toThrow(`hydration.${key}`);
      expect(() => api.setDefaultModelOption(`hydration.${key}` as never, false as never)).toThrow(`hydration.${key}`);
      for (const control of ['lean', 'hydration']) {
        for (const options of [
          { [control]: undefined },
          Object.create({ [control]: true }),
          Object.defineProperty({}, control, { value: false }),
        ]) {
          const expected = new RegExp(`defaults\\.${bucket}\\.${control}.*hydration\\.${key}`);
          expect(() => api.setModelOptions(name, { defaults: { [bucket]: options } })).toThrow(expected);
          expect(() => api.setModelOption(name, 'defaults', { [bucket]: options })).toThrow(expected);
          expect(() => api.setModelOption(name, `defaults.${bucket}` as never, options as never)).toThrow(expected);
          expect(() => api.setModelOption(name, `defaults.${bucket}.${control}` as never, undefined as never)).toThrow(
            expected,
          );
        }
      }
    }
    expect(() => api.setModelOption(name, 'defaults', { createOptions: { lean: false } } as never)).toThrow(
      /defaults.createOptions.lean.*fixed/,
    );
    expect(api.getModelOptions(name).hydration).toEqual({ find: 'lean' });
    expect(api.getModelOptions(name).defaults).toBeUndefined();
    // Control handling is contextual: projection/task data are legitimate business values.
    api.setModelOption(name, 'defaults', {
      publicReadArgs: {
        select: ['lean', 'hydration'],
        tasks: { type: 'COPY', args: [{ src: 'lean', dest: 'hydration' }] },
      },
    });
  });
});
