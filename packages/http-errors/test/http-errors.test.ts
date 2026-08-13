import { describe, expect, it } from 'vitest';

import * as httpErrors from '../dist/index.mjs';
import {
  BadRequestError,
  ClientError,
  HttpError,
  ServerError,
  ServiceUnavailableError,
  UnauthorizedError,
  canonicalStatusByHttpStatus,
  getCanonicalStatus,
  validateHttpErrorStatusCode,
  toAip193ErrorPayload,
  toRfc9457ErrorPayload,
  toRfc9457ValidationErrorPayload,
} from '../dist/index.mjs';
import { httpErrorStatusDefinitions, type HttpErrorClassName } from '../src/status-definitions';

type SpecificHttpErrorConstructor = new (message?: string) => HttpError;

const isSpecificErrorExport = (value: unknown): value is SpecificHttpErrorConstructor =>
  typeof value === 'function' &&
  value.prototype instanceof HttpError &&
  value !== HttpError &&
  value !== ClientError &&
  value !== ServerError;

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

  it.each(Object.entries(httpErrorStatusDefinitions))(
    'keeps %s status metadata aligned with the exported class',
    (className, definition) => {
      const ErrorConstructor = httpErrors[className as HttpErrorClassName] as SpecificHttpErrorConstructor | undefined;

      expect(ErrorConstructor).toBeTypeOf('function');

      const error = new ErrorConstructor!();

      expect(error.name).toBe(className);
      expect(error.statusCode).toBe(definition.statusCode);
      expect(error.message).toBe(definition.message);
      expect(error.status).toBe(getCanonicalStatus(definition.statusCode));
      expect(toRfc9457ErrorPayload(error).title).toBe(httpErrors.getStatusTitle(definition.statusCode));

      if (definition.category === 'client') {
        expect(error).toBeInstanceOf(ClientError);
        expect(error).not.toBeInstanceOf(ServerError);
      } else {
        expect(error).toBeInstanceOf(ServerError);
        expect(error).not.toBeInstanceOf(ClientError);
      }
    },
  );

  it('covers every exported specific error class with unique status metadata', () => {
    const exportedSpecificErrorNames = Object.entries(httpErrors)
      .filter(([, value]) => isSpecificErrorExport(value))
      .map(([name]) => name)
      .sort();
    const definedErrorNames = Object.keys(httpErrorStatusDefinitions).sort();
    const definedStatusCodes = Object.values(httpErrorStatusDefinitions).map(({ statusCode }) => statusCode);

    expect(definedErrorNames).toEqual(exportedSpecificErrorNames);
    expect(new Set(definedStatusCodes).size).toBe(definedStatusCodes.length);
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

  it('snapshots top-level structured collections at construction time', () => {
    const cause = new Error('database offline');
    const metadata = { field: 'email', attempt: 1 };
    const detailEntry = { type: 'help', url: 'https://api.example.com/docs/errors/invalid-email' };
    const details = [detailEntry];
    const errorEntry = { detail: 'must be a valid email address' };
    const errors = [errorEntry];

    const error = new BadRequestError('invalid email', {
      cause,
      metadata,
      details,
      errors,
    });

    metadata.field = 'name';
    metadata.attempt = 2;
    details.unshift({ type: 'debug', url: 'https://api.example.com/debug' });
    errors.push({ detail: 'another error' });
    detailEntry.url = 'https://api.example.com/docs/errors/updated-invalid-email';

    expect(error.cause).toBe(cause);
    expect(error.message).toBe('invalid email');
    expect(error.metadata).toEqual({ field: 'email', attempt: '1' });
    expect(error.details).toEqual([{ type: 'help', url: 'https://api.example.com/docs/errors/updated-invalid-email' }]);
    expect(error.errors).toEqual([{ detail: 'must be a valid email address' }]);
  });

  it('freezes error-owned top-level collections, including empty arrays', () => {
    const error = new BadRequestError('empty collections', {
      metadata: {},
      details: [],
      errors: [],
    });

    expect(Object.isFrozen(error.metadata)).toBe(true);
    expect(Object.isFrozen(error.details)).toBe(true);
    expect(Object.isFrozen(error.errors)).toBe(true);
    expect(() => {
      (error.metadata as Record<string, string>).field = 'email';
    }).toThrow(TypeError);
    expect(() => {
      (error.details as unknown[]).push({ type: 'help' });
    }).toThrow(TypeError);
    expect(() => {
      (error.errors as unknown[]).push({ detail: 'invalid' });
    }).toThrow(TypeError);
  });

  it('returns serializer-owned top-level collections without changing later serializations', () => {
    const error = new BadRequestError('invalid email', {
      reason: 'INVALID_EMAIL',
      domain: 'api.example.com',
      metadata: { field: 'email' },
      details: [{ type: 'help' }],
      errors: [{ detail: 'must be a valid email address' }],
    });

    const aipPayload = toAip193ErrorPayload(error);
    const rfcPayload = toRfc9457ErrorPayload(error);
    const validationPayload = toRfc9457ValidationErrorPayload(error);

    aipPayload.error.details?.push({ type: 'debug' });
    (aipPayload.error.details?.[0] as { metadata?: Record<string, string> }).metadata!.field = 'name';
    (rfcPayload.errors as unknown[])?.push({ detail: 'another error' });
    (validationPayload.errors as unknown[])?.reverse();

    expect(toAip193ErrorPayload(error).error.details).toEqual([
      { type: 'error_info', reason: 'INVALID_EMAIL', domain: 'api.example.com', metadata: { field: 'email' } },
      { type: 'bad_request', errors: [{ detail: 'must be a valid email address' }] },
      { type: 'help' },
    ]);
    expect(toRfc9457ErrorPayload(error).errors).toEqual([{ detail: 'must be a valid email address' }]);
    expect(toRfc9457ValidationErrorPayload(error).errors).toEqual([{ detail: 'must be a valid email address' }]);
  });

  it('falls back to UNKNOWN for statuses without a canonical mapping', () => {
    const error = new HttpError(422);

    expect(error.status).toBe('UNKNOWN');
  });

  it('allows valid HTTP error status boundaries and extension codes', () => {
    expect(new HttpError(400).statusCode).toBe(400);
    expect(new HttpError(599).statusCode).toBe(599);
    expect(new ClientError(499).statusCode).toBe(499);
    expect(new ServerError(599).statusCode).toBe(599);

    const extensionError = new HttpError(599, 'custom extension error');

    expect(extensionError.status).toBe('UNKNOWN');
    expect(toRfc9457ErrorPayload(extensionError)).toEqual({
      type: 'about:blank',
      title: 'Unknown Error',
      status: 599,
      detail: 'custom extension error',
    });
  });

  it.each([NaN, Infinity, -Infinity, 99, 399, 600, -1, 500.5])('rejects invalid HttpError status %s', (statusCode) => {
    expect(() => new HttpError(statusCode)).toThrow(
      'statusCode must be an integer HTTP error status code between 400 and 599',
    );
  });

  it('rejects category-mismatched base error statuses', () => {
    expect(() => new ClientError(503)).toThrow('statusCode must be a 4xx HTTP error status code');
    expect(() => new ServerError(404)).toThrow('statusCode must be a 5xx HTTP error status code');
  });

  it('exposes the shared HTTP error status validator for downstream packages', () => {
    expect(validateHttpErrorStatusCode(400, 'error.statusCode')).toBe(400);
    expect(validateHttpErrorStatusCode(599, 'error.statusCode')).toBe(599);
    expect(() => validateHttpErrorStatusCode(302, 'error.statusCode')).toThrow(
      'error.statusCode must be an integer HTTP error status code between 400 and 599',
    );
  });

  it('does not allow exported canonical status lookup mutation to affect later errors', () => {
    expect(Object.isFrozen(canonicalStatusByHttpStatus)).toBe(true);
    expect(() => {
      (canonicalStatusByHttpStatus as Record<number, string>)[400] = 'COMPROMISED';
    }).toThrow(TypeError);

    expect(getCanonicalStatus(400)).toBe('INVALID_ARGUMENT');
    expect(getCanonicalStatus(422)).toBe('UNKNOWN');
    expect(new BadRequestError().status).toBe('INVALID_ARGUMENT');
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

  it('omits RFC 9457 validation errors when errors is absent, non-array, or empty', () => {
    const absent = new BadRequestError('missing errors');
    const nonArray = new BadRequestError('wrong errors', { errors: { detail: 'not an array' } });
    const empty = new BadRequestError('empty errors', { errors: [] });

    expect(toRfc9457ValidationErrorPayload(absent)).not.toHaveProperty('errors');
    expect(toRfc9457ValidationErrorPayload(nonArray)).not.toHaveProperty('errors');
    expect(toRfc9457ValidationErrorPayload(empty)).not.toHaveProperty('errors');
  });

  it('filters invalid RFC 9457 validation entries deterministically', () => {
    const inherited = Object.create({ detail: 'inherited detail', pointer: '#/inherited' });
    inherited.header = 'x-owned-header';

    const error = new BadRequestError('invalid payload', {
      errors: [
        { detail: 'name is required', pointer: '#/name', parameter: 'name', extra: 'ignored' },
        { wrong: true },
        { detail: 123 },
        { detail: 'bad pointer', pointer: 123 },
        inherited,
        { detail: 'header is required', header: 'x-request-id' },
      ],
    });

    expect(toRfc9457ValidationErrorPayload(error)).toMatchObject({
      errors: [
        { detail: 'name is required', pointer: '#/name', parameter: 'name' },
        { detail: 'header is required', header: 'x-request-id' },
      ],
    });
  });

  it('preserves custom RFC 9457 error entries through the general serializer', () => {
    const error = {
      statusCode: 400,
      message: 'invalid payload',
      errors: [{ code: 'INVALID_NAME', path: ['name'] }],
    };

    expect(toRfc9457ErrorPayload(error)).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'invalid payload',
      errors: [{ code: 'INVALID_NAME', path: ['name'] }],
    });
  });
});
