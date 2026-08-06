import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

import { AccessRuntime, createAccessRuntime } from '../dist/index.mjs';

describe('AR-15 side-effect and initialization semantics', () => {
  it('idempotently initializes the mongoose jsonSchema patch on repeated runtime creation', () => {
    const samples = [new AccessRuntime(), new AccessRuntime(), createAccessRuntime().runtime];
    for (const runtime of samples) {
      expect(runtime).toBeInstanceOf(AccessRuntime);
    }

    const schema = new mongoose.Schema({ name: String });
    const modelName = `AclIdempotentInitUser${Date.now()}`;
    const userModel = mongoose.model(modelName, schema);

    for (const runtime of samples) {
      runtime.registerModelInstance(modelName, userModel);
    }

    expect(typeof (userModel as unknown as { jsonSchema?: () => unknown }).jsonSchema).toBe('function');
    const jsonSchema = (userModel as unknown as { jsonSchema: () => Record<string, unknown> }).jsonSchema();
    expect(jsonSchema).toMatchObject({ type: 'object' });

    // Repeat construction does not throw and stays idempotent.
    const onceMore = new AccessRuntime();
    expect(onceMore).toBeInstanceOf(AccessRuntime);
  });

  it('createAccessRuntime returns an API backed by an AccessRuntime instance', () => {
    const api = createAccessRuntime();
    expect(api.runtime).toBeInstanceOf(AccessRuntime);
    expect(typeof api.runtime.getModelNames).toBe('function');
  });

  it('exposes jsonSchema on a freshly-registered mongoose model after runtime construction', () => {
    const schema = new mongoose.Schema({ name: String });
    const modelName = `AclSideEffectInitUser${Date.now()}`;
    const userModel = mongoose.model(modelName, schema);

    const runtime = new AccessRuntime();
    runtime.registerModelInstance(modelName, userModel);

    expect(typeof userModel.jsonSchema).toBe('function');
    const json = (userModel as unknown as { jsonSchema: () => Record<string, unknown> }).jsonSchema();
    expect(json).toMatchObject({ type: 'object' });
  });
});
