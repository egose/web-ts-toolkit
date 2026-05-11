import { describe, expect, it } from 'vitest';

import {
  BadRequestError,
  ClientError,
  HttpError,
  ServerError,
  ServiceUnavailableError,
  UnauthorizedError,
  toAip193ErrorPayload,
  toRfc9457ErrorPayload,
  toRfc9457ValidationErrorPayload,
} from '../dist/index.mjs';

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

  it('exposes canonical status strings for common HTTP errors', () => {
    const error = new UnauthorizedError();

    expect(error.status).toBe('UNAUTHENTICATED');
  });

  it('supports structured error metadata for machine-readable payloads', () => {
    const error = new BadRequestError('invalid email', {
      reason: 'INVALID_EMAIL',
      domain: 'api.example.com',
      metadata: {
        field: 'email',
        attempt: 2,
      },
      details: [
        {
          type: 'help',
          links: [
            {
              description: 'Validation guide',
              url: 'https://api.example.com/docs/errors/invalid-email',
            },
          ],
        },
      ],
      errors: [
        {
          field: 'email',
          description: 'Email must be a valid address.',
        },
      ],
      type: 'https://api.example.com/problems/invalid-email',
      title: 'Invalid email address',
      instance: '/problems/invalid-email/123',
    });

    expect(error.statusCode).toBe(400);
    expect(error.status).toBe('INVALID_ARGUMENT');
    expect(error.reason).toBe('INVALID_EMAIL');
    expect(error.domain).toBe('api.example.com');
    expect(error.metadata).toEqual({
      field: 'email',
      attempt: '2',
    });
    expect(error.details).toEqual([
      {
        type: 'help',
        links: [
          {
            description: 'Validation guide',
            url: 'https://api.example.com/docs/errors/invalid-email',
          },
        ],
      },
    ]);
    expect(error.errors).toEqual([
      {
        field: 'email',
        description: 'Email must be a valid address.',
      },
    ]);
    expect(error.type).toBe('https://api.example.com/problems/invalid-email');
    expect(error.title).toBe('Invalid email address');
    expect(error.instance).toBe('/problems/invalid-email/123');
  });

  it('falls back to UNKNOWN for statuses without a canonical mapping', () => {
    const error = new HttpError(422);

    expect(error.status).toBe('UNKNOWN');
  });

  it('serializes HttpError values into an AIP-193-style payload', () => {
    const error = new BadRequestError('invalid email', {
      reason: 'INVALID_EMAIL',
      domain: 'api.example.com',
      metadata: {
        field: 'email',
      },
      details: [
        {
          type: 'help',
          links: [
            {
              description: 'Validation guide',
              url: 'https://api.example.com/docs/errors/invalid-email',
            },
          ],
        },
      ],
    });

    expect(toAip193ErrorPayload(error)).toEqual({
      error: {
        code: 400,
        status: 'INVALID_ARGUMENT',
        message: 'invalid email',
        details: [
          {
            type: 'error_info',
            reason: 'INVALID_EMAIL',
            domain: 'api.example.com',
            metadata: {
              field: 'email',
            },
          },
          {
            type: 'help',
            links: [
              {
                description: 'Validation guide',
                url: 'https://api.example.com/docs/errors/invalid-email',
              },
            ],
          },
        ],
      },
    });
  });

  it('serializes HttpError values into an RFC 9457 payload', () => {
    const error = new BadRequestError('Email must be a valid address.', {
      type: 'https://api.example.com/problems/invalid-email',
      title: 'Invalid email address',
      instance: '/problems/invalid-email/123',
      errors: [
        {
          detail: 'must be a valid email address',
          pointer: '#/email',
        },
      ],
    });

    expect(toRfc9457ErrorPayload(error)).toEqual({
      type: 'https://api.example.com/problems/invalid-email',
      title: 'Invalid email address',
      status: 400,
      detail: 'Email must be a valid address.',
      instance: '/problems/invalid-email/123',
      errors: [
        {
          detail: 'must be a valid email address',
          pointer: '#/email',
        },
      ],
    });
  });

  it('falls back to about:blank and the HTTP status title for RFC 9457 payloads', () => {
    const error = new UnauthorizedError('missing bearer token');

    expect(toRfc9457ErrorPayload(error)).toEqual({
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      detail: 'missing bearer token',
    });
  });

  it('provides a typed RFC 9457 validation helper', () => {
    const error = new BadRequestError('Email must be a valid address.', {
      type: 'https://api.example.com/problems/invalid-email',
      title: 'Invalid email address',
      errors: [
        {
          detail: 'must be a valid email address',
          pointer: '#/email',
          parameter: 'email',
        },
        {
          detail: 'x-request-id header is required',
          header: 'x-request-id',
        },
      ],
    });

    expect(toRfc9457ValidationErrorPayload(error)).toEqual({
      type: 'https://api.example.com/problems/invalid-email',
      title: 'Invalid email address',
      status: 400,
      detail: 'Email must be a valid address.',
      errors: [
        {
          detail: 'must be a valid email address',
          pointer: '#/email',
          parameter: 'email',
        },
        {
          detail: 'x-request-id header is required',
          header: 'x-request-id',
        },
      ],
    });
  });
});
