import type { Response } from 'express';
import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { guard } from '../dist/index.mjs';
import { PERMISSIONS } from '../dist/advanced.mjs';
import type { Request as AccessRequest } from '../src/interfaces';

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
    const req = createRequest();

    await guard({
      modelName: 'User',
      id: 'user-1',
      condition: 'edit.role',
    })(req, response, next);

    expect(req.macl.getPublicService()._read).toHaveBeenCalledWith('user-1', { select: [] });
    expect(next).toHaveBeenCalledWith();
  });

  it('accepts model-based checks when the identifier comes from params', async () => {
    const next = vi.fn();
    const req = createRequest({ params: { userId: 'user-1' } });

    await guard({
      modelName: 'User',
      id: { type: 'param', key: 'userId' },
      condition: 'edit.role',
    })(req, response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('accepts model-based checks when the identifier comes from query params', async () => {
    const next = vi.fn();
    const req = createRequest({ query: { userId: 'user-1' } });

    await guard({
      modelName: 'User',
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

    await guard({
      modelName: 'User',
      id: 'user-1',
      condition: 'edit.role',
    })(createRequest({ readResult: { success: true, data: { _permissions: {} } } }), response, next);

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
});
