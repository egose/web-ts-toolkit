import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import acl, {
  permissionsPlugin,
  redactFilter,
  redactPayload,
  safeStringify,
  setGlobalOptions,
} from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

const resetGlobalOptions = () => {
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });
};

let modelCounter = 0;

describe('AR-19 structured, redacted, lazy logging', () => {
  describe('redactFilter', () => {
    it('redacts known sensitive keys at any depth while preserving shape and insensitive values', () => {
      const input = {
        username: 'alice',
        password: 'hunter2',
        profile: {
          email: 'a@example.com',
          token: 'verysecret',
          nested: { api_key: 'abc', favoriteColor: 'green' },
        },
        tags: ['x', 'y'],
      };

      const out = redactFilter(input) as typeof input;

      expect(out.username).toBe('alice');
      expect(out.password).toBe('[REDACTED]');
      expect(out.profile.email).toBe('a@example.com');
      expect((out.profile as Record<string, unknown>).token).toBe('[REDACTED]');
      expect((out.profile.nested as Record<string, unknown>).api_key).toBe('[REDACTED]');
      expect((out.profile.nested as Record<string, unknown>).favoriteColor).toBe('green');
      expect(out.tags).toEqual(['x', 'y']);
    });

    it('matches sensitive keys case-insensitively', () => {
      const out = redactFilter({ Token: 't', PASSWORD: 'p', Normal: 'n' }) as Record<string, unknown>;
      expect(out.Token).toBe('[REDACTED]');
      expect(out.PASSWORD).toBe('[REDACTED]');
      expect(out.Normal).toBe('n');
    });

    it('handles circular references without throwing', () => {
      const circular: Record<string, unknown> = { name: 'x', password: 'p' };
      circular.self = circular;
      const out = redactFilter(circular) as Record<string, unknown>;
      expect(out.password).toBe('[REDACTED]');
      expect(out.name).toBe('x');
      expect(out.self).toBe('[Circular]');
    });

    it('does not mutate the input', () => {
      const input = { password: 'secret', other: { token: 't' } };
      const snapshot = JSON.parse(JSON.stringify(input));
      redactFilter(input);
      expect(input).toEqual(snapshot);
    });
  });

  describe('redactPayload', () => {
    it('redacts the same sensitive-key set for mutation payloads', () => {
      const out = redactPayload({ name: 'bob', password: 'pw', cardNumber: '4111' }) as Record<string, unknown>;
      expect(out.name).toBe('bob');
      expect(out.password).toBe('[REDACTED]');
      expect(out.cardNumber).toBe('[REDACTED]');
    });
  });

  describe('safeStringify', () => {
    it('handles circular and non-serializable values without throwing', () => {
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;
      const out = safeStringify(circular);
      expect(typeof out).toBe('string');
      expect(out).toContain('"a":1');
      expect(out).toContain('[Circular]');
    });

    it('handles circular references inside nested objects without throwing', () => {
      const obj: Record<string, unknown> = { items: [{ name: 'a' }] };
      obj.items.push(obj.items);
      const out = safeStringify(obj);
      expect(typeof out).toBe('string');
      expect(out).toContain('[Circular]');
    });
  });
});

describe('AR-19 service logging call sites', () => {
  useMongoTestDatabase();

  afterEach(() => {
    resetGlobalOptions();
  });

  const buildApp = async (modelName: string, schemaProps: Record<string, unknown>) => {
    const schema = new mongoose.Schema(schemaProps);
    schema.plugin(permissionsPlugin, { modelName });
    const Model = mongoose.model(modelName, schema);
    const router = acl.createRouter(modelName, {
      basePath: `/${modelName}`,
      idField: '_id',
      operationAccess: { list: true, update: true, delete: true },
      permissionSchema: Object.fromEntries(Object.keys(schemaProps).map((k) => [k, true])),
    });
    const app = express();
    app.use(express.json());
    app.use(router.routes);
    return app;
  };

  it('does not call debug log handlers when isLevelEnabled returns false', async () => {
    const debugSpy = vi.fn();
    const isLevelEnabledSpy = vi.fn(() => false);
    setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ['isAdmin'],
      logger: {
        debug: debugSpy,
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        isLevelEnabled: isLevelEnabledSpy,
      },
    });

    const modelName = `AclMongoLogDisabled${++modelCounter}`;
    const app = await buildApp(modelName, { name: { type: String, required: true } });

    await request(app).post(`/${modelName}/__query`).send({}).expect(200);

    expect(isLevelEnabledSpy).toHaveBeenCalledWith('debug');
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('redacts sensitive filter keys before invoking the debug logger', async () => {
    const debugSpy = vi.fn();
    setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ['isAdmin'],
      logger: {
        debug: debugSpy,
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        isLevelEnabled: () => true,
      },
    });

    const modelName = `AclMongoLogRedact${++modelCounter}`;
    const app = await buildApp(modelName, {
      name: { type: String, required: true },
      password: { type: String, required: true },
    });

    await mongoose.model(modelName).create([
      { name: 'alice', password: 'hunter2' },
      { name: 'bob', password: 'pw' },
    ]);

    await request(app)
      .post(`/${modelName}/__query`)
      .send({ filter: { password: 'hunter2', name: 'alice' } })
      .expect(200);

    expect(debugSpy).toHaveBeenCalled();
    const loggedMessage = String(debugSpy.mock.calls[0]?.[0] ?? '');
    expect(loggedMessage).toContain('REDACTED');
    expect(loggedMessage).not.toContain('hunter2');
    expect(loggedMessage).toContain('alice');
  });

  it('logging failures never break an HTTP operation', async () => {
    setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ['isAdmin'],
      logger: {
        debug() {
          throw new Error('logger exploded');
        },
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        isLevelEnabled: () => true,
      },
    });

    const modelName = `AclMongoLogThrow${++modelCounter}`;
    const app = await buildApp(modelName, { name: { type: String, required: true } });

    const response = await request(app).post(`/${modelName}/__query`).send({}).expect(200);
    expect(response.body.data).toBeDefined();
  });

  it('structured op payload includes op, modelName, and timing-safe metadata', async () => {
    const debugSpy = vi.fn();
    setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ['isAdmin'],
      logger: {
        debug: debugSpy,
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        isLevelEnabled: () => true,
      },
    });

    const modelName = `AclMongoLogStructured${++modelCounter}`;
    const app = await buildApp(modelName, { name: { type: String, required: true } });

    await request(app).post(`/${modelName}/__query`).send({ limit: 5 }).expect(200);

    expect(debugSpy).toHaveBeenCalled();
    const message = String(debugSpy.mock.calls[0]?.[0] ?? '');
    const parsed = JSON.parse(message) as Record<string, unknown>;
    expect(parsed.op).toBe('find');
    expect(parsed.modelName).toBe(modelName);
    expect(parsed.limit).toBe(5);
  });
});
