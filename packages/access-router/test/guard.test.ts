import type { Response } from 'express';
import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { guard } from '../src/middleware';
import { PERMISSIONS } from '../src/symbols';
import type { Request as AccessRequest } from '../src/interfaces';
import { ownedStageFixture } from './owned-stage-test-fixture';

const createRequest = ({
  allowed = [],
  readResult = { success: true, data: { _permissions: { 'edit.role': true } } },
  params = {},
  query = {},
}: {
  allowed?: string[];
  readResult?: unknown;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
} = {}) => {
  const read = vi.fn().mockResolvedValue(readResult);
  const service = {
    _read: read,
  };

  return {
    [PERMISSIONS]: {
      has: (key: string) => allowed.includes(key),
    },
    macl: {
      getPublicService: () => service,
    },
    params,
    query,
  } as unknown as AccessRequest;
};

const response = {} as Response;

function documentRequest(facts = { 'edit.role': true }) {
  const hook = vi.fn(() => facts);
  const fixture = ownedStageFixture({ modelOptions: { docPermissions: hook } });
  fixture.adapter.findOne.mockResolvedValue({ _id: 'user-1', name: 'user' });
  vi.spyOn(fixture.request.macl, 'getPublicService').mockReturnValue(fixture.public);
  const read = vi.spyOn(fixture.public, '_read');
  return { ...fixture, hook, read };
}

describe('guard', () => {
  mongoose.deleteModel(/User/);
  mongoose.model('User', new mongoose.Schema({ name: String }));

  it('accepts string-based permission checks', async () => {
    const next = vi.fn();

    await guard('users.read')(createRequest({ allowed: ['users.read'] }), response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('accepts nested array conditions when any branch matches', async () => {
    const next = vi.fn();

    await guard([['admin.manage'], 'users.read'])(createRequest({ allowed: ['admin.manage'] }), response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('invokes function conditions with the request as context', async () => {
    const next = vi.fn();
    const req = createRequest({ allowed: ['users.read'] });
    const condition = vi.fn(function (permissions) {
      return this === req && permissions.has('users.read');
    });

    await guard(condition)(req, response, next);

    expect(condition).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
  });

  it('accepts model-based checks with a fixed identifier', async () => {
    const next = vi.fn();
    const f = documentRequest();
    const req = f.request;

    await guard({
      modelName: f.model.modelName,
      id: 'user-1',
      condition: 'edit.role',
    })(req, response, next);

    expect(f.read).toHaveBeenCalledWith('user-1', undefined, {
      includePermissions: false,
      includeFieldPermissions: false,
    });
    expect(f.hook).toHaveBeenCalledTimes(1);
    expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('accepts model-based checks when the identifier comes from params', async () => {
    const next = vi.fn();
    const f = documentRequest();
    const req = f.request;
    req.params.userId = 'user-1';

    await guard({
      modelName: f.model.modelName,
      id: { type: 'param', key: 'userId' },
      condition: 'edit.role',
    })(req, response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('accepts model-based checks when the identifier comes from query params', async () => {
    const next = vi.fn();
    const f = documentRequest();
    const req = f.request;
    req.query.userId = 'user-1';

    await guard({
      modelName: f.model.modelName,
      id: { type: 'query', key: 'userId' },
      condition: 'edit.role',
    })(req, response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('returns a bad request error when a guarded model condition has no identifier', async () => {
    const next = vi.fn();

    await guard({
      modelName: 'User',
      id: { type: 'param', key: 'userId' },
      condition: 'users.read',
    })(createRequest(), response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({
      name: 'BadRequestError',
      statusCode: 400,
    });
  });

  it('returns an unauthorized error when model-based document permissions fail', async () => {
    const next = vi.fn();
    const f = documentRequest({ 'edit.role': false });

    await guard({
      modelName: f.model.modelName,
      id: 'user-1',
      condition: 'edit.role',
    })(f.request, response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({
      name: 'UnauthorizedError',
      statusCode: 401,
    });
  });

  it('returns an unauthorized error when permission checks fail', async () => {
    const next = vi.fn();

    await guard('users.read')(createRequest(), response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({
      name: 'UnauthorizedError',
      statusCode: 401,
    });
  });

  it('cannot authorize a forged DTO-only read without a bound private stage', async () => {
    const next = vi.fn();
    await guard({ modelName: 'User', id: 'user-1', condition: 'edit.role' })(createRequest(), response, next);
    expect(next.mock.calls[0][0]).toMatchObject({ name: 'UnauthorizedError', statusCode: 401 });
  });

  it('does not accept an inherited decision when a forged read never consumes a private stage', async () => {
    const next = vi.fn();
    const req = createRequest();
    const original = Object.getOwnPropertyDescriptor(Object.prototype, 'decision');
    try {
      Object.defineProperty(Object.prototype, 'decision', { value: true, writable: true, configurable: true });
      await guard({ modelName: 'User', id: 'user-1', condition: 'edit.role' })(req, response, next);
    } finally {
      if (original) Object.defineProperty(Object.prototype, 'decision', original);
      else Reflect.deleteProperty(Object.prototype, 'decision');
    }
    expect(next.mock.calls[0][0]).toMatchObject({ name: 'UnauthorizedError', statusCode: 401 });
  });

  it('owns its private decision slot before callbacks can install an inherited setter', async () => {
    const next = vi.fn();
    const f = documentRequest();
    let intercepted = 0;
    const original = Object.getOwnPropertyDescriptor(Object.prototype, 'decision');
    try {
      Object.defineProperty(Object.prototype, 'decision', {
        configurable: true,
        get: () => false,
        set: () => {
          intercepted++;
        },
      });
      await guard({ modelName: f.model.modelName, id: 'user-1', condition: 'edit.role' })(f.request, response, next);
    } finally {
      if (original) Object.defineProperty(Object.prototype, 'decision', original);
      else Reflect.deleteProperty(Object.prototype, 'decision');
    }
    expect(intercepted).toBe(0);
    expect(next).toHaveBeenCalledExactlyOnceWith();
    expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
    expect(f.hook).toHaveBeenCalledTimes(1);
  });
});
