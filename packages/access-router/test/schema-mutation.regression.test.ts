import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

import { createAccessRuntime, permissionsPlugin } from '../dist/index.mjs';

let modelCounter = 0;

const nextModelName = (prefix: string) => `${prefix}${++modelCounter}`;

describe('AR-12 stop mutating consumer-owned schemas', () => {
  it('router construction leaves schema options (optimisticConcurrency, versionKey) unchanged', () => {
    const runtime = createAccessRuntime();
    const modelName = nextModelName('AclSchemaMutationDefaultUser');

    const schema = new mongoose.Schema({ name: String, role: String });
    schema.plugin(permissionsPlugin, { modelName });
    const userModel = mongoose.model(modelName, schema);

    const beforeOptimistic = schema.get('optimisticConcurrency');
    const beforeVersionKey = schema.get('versionKey');

    const router = runtime.createRouter(userModel, {
      basePath: '/schema-mutation-default',
      operationAccess: { list: true, read: true, create: true, update: true, delete: true },
      permissionSchema: { name: true, role: true },
    });
    expect(router).toBeDefined();

    expect(schema.get('optimisticConcurrency')).toBe(beforeOptimistic);
    expect(schema.get('versionKey')).toBe(beforeVersionKey);
    expect(schema.get('optimisticConcurrency')).toBeFalsy();
  });

  it('preserves a model with explicit versionKey: false', () => {
    const runtime = createAccessRuntime();
    const modelName = nextModelName('AclSchemaMutationVersionlessUser');

    const schema = new mongoose.Schema({ name: String }, { versionKey: false });
    schema.plugin(permissionsPlugin, { modelName });
    const userModel = mongoose.model(modelName, schema);

    expect(schema.get('versionKey')).toBe(false);

    runtime.createRouter(userModel, {
      basePath: '/schema-mutation-versionless',
      operationAccess: { list: true, read: true, create: true, update: true, delete: true },
      permissionSchema: { name: true },
    });

    expect(schema.get('versionKey')).toBe(false);
    expect(schema.get('optimisticConcurrency')).toBeFalsy();
  });

  it('preserves a custom version key chosen by the consumer', () => {
    const runtime = createAccessRuntime();
    const modelName = nextModelName('AclSchemaMutationCustomVersionKeyUser');

    const schema = new mongoose.Schema({ name: String }, { versionKey: 'docVersion', optimisticConcurrency: true });
    schema.plugin(permissionsPlugin, { modelName });
    const userModel = mongoose.model(modelName, schema);

    runtime.createRouter(userModel, {
      basePath: '/schema-mutation-custom-version',
      operationAccess: { list: true, read: true, create: true, update: true, delete: true },
      permissionSchema: { name: true },
    });

    expect(schema.get('versionKey')).toBe('docVersion');
    expect(schema.get('optimisticConcurrency')).toBe(true);
  });
});
