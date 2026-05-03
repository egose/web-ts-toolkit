import { describe, expect, it } from 'vitest';

import { BadRequestError, ClientError, HttpError, ServerError, ServiceUnavailableError } from '../dist/index.mjs';

describe('http-errors', () => {
  it('uses the default 500 status and message for HttpError', () => {
    const error = new HttpError();

    expect(error.name).toBe('HttpError');
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('The server encountered an unexpected condition');
    expect(error.date).toBeInstanceOf(Date);
  });

  it('resolves messages from the provided client status code', () => {
    const error = new ClientError(404);

    expect(error.name).toBe('ClientError');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('The server did not find a current representation for the target resource');
    expect(error).toBeInstanceOf(HttpError);
  });

  it('preserves inheritance and allows custom messages on specific error classes', () => {
    const error = new BadRequestError('invalid payload');

    expect(error.name).toBe('BadRequestError');
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('invalid payload');
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error).toBeInstanceOf(ClientError);
    expect(error).toBeInstanceOf(HttpError);
  });

  it('inherits server error classes from ServerError', () => {
    const error = new ServiceUnavailableError();

    expect(error.name).toBe('ServiceUnavailableError');
    expect(error.statusCode).toBe(503);
    expect(error.message).toBe('The server is temporarily unable to handle the request');
    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(error).toBeInstanceOf(ServerError);
    expect(error).toBeInstanceOf(HttpError);
  });

  it('forwards ErrorOptions to the native Error constructor', () => {
    const cause = new Error('database offline');
    const error = new HttpError(503, undefined, { cause });

    expect(error.cause).toBe(cause);
  });
});
