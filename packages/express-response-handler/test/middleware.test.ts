import http from 'node:http';

import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { BadRequestError, UnauthorizedError } from '@web-ts-toolkit/http-errors';
import apiHandler from '../dist/index.mjs';

const { handleResponse } = apiHandler;

const app = express();
app.set('port', 8080);
const server = http.createServer(app);
server.listen(8080);

afterAll(() => {
  server.close();
});

const hit = async (url: string, status: number, value: unknown) => {
  const response = await request(app).get(url).expect('Content-Type', /json/).expect(status);

  expect(status >= 400 ? response.body.message : response.body).toBe(value);
};

describe('Single Middleware', () => {
  const key = 'single-middleware';
  const status = 200;
  const value = 'apple';

  it(`should return ${value}`, async () => {
    app.get(`/${key}`, handleResponse(fnApple));
    await hit(`/${key}`, status, value);
  });
});

describe('Multiple Middlewares', () => {
  const key = 'multiple-middlewares';
  const status = 200;
  const value = 'pear';

  it(`should return ${value}`, async () => {
    app.get(`/${key}`, handleResponse(fnAppleNext, fnPear));
    await hit(`/${key}`, status, value);
  });
});

describe('Multiple Middlewares Array', () => {
  const key = 'multiple-middlewares-array';
  const status = 200;
  const value = 'pear';

  it(`should return ${value}`, async () => {
    app.get(`/${key}`, handleResponse([fnAppleNext, fnPear]));
    await hit(`/${key}`, status, value);
  });
});

describe('Multiple Async Middlewares', () => {
  const key = 'multiple-async-middlewares';
  const status = 200;
  const value = 'pear';

  it(`should return ${value}`, async () => {
    app.get(`/${key}`, handleResponse(fnAppleNext, fnPearPromise));
    await hit(`/${key}`, status, value);
  });
});

describe('Invalid value in Next Handling', () => {
  const key = 'invalid-value-in-next-handling';
  const status = 422;
  const value = 'next(value) is not supported; return a value instead';

  it(`should return ${value}`, async () => {
    app.get(`/${key}`, handleResponse(fnInvalidNextValue));
    await hit(`/${key}`, status, value);
  });
});

describe('Error Handling', () => {
  const key = 'error-handling';
  const status = 422;
  const value = 'error1';

  it(`should return ${value}`, async () => {
    app.get(`/${key}`, handleResponse(fnAppleNext, fnError1, fnPear));
    await hit(`/${key}`, status, value);
  });
});

describe('Async Error Handling', () => {
  const key = 'async-error-handling';
  const status = 422;
  const value = 'error1';

  it(`should return ${value}`, async () => {
    app.get(`/${key}`, handleResponse(fnAppleNext, fnError1Promise, fnPear));
    await hit(`/${key}`, status, value);
  });
});

describe('Multiple Async Error Handling', () => {
  const key = 'multiple-async-error-handling';
  const status = 422;
  const value = 'error1';

  it(`should return ${value}`, async () => {
    app.get(`/${key}`, handleResponse(fnError2Next, fnError1));
    await hit(`/${key}`, status, value);
  });
});

describe('Unauthorized Error Handling', () => {
  const key = 'unauthorized-error-handling';
  const status = 401;
  const value = 'The user is not authorized';

  it(`should return ${value}`, async () => {
    app.get(`/${key}`, handleResponse(fnUnauthorizedError));
    await hit(`/${key}`, status, value);
  });
});

describe('Unauthorized Error in Next Handling', () => {
  const key = 'unauthorized-error-in-next-handling';
  const status = 401;
  const value = 'The user is not authorized';

  it(`should return ${value}`, async () => {
    app.get(`/${key}`, handleResponse(fnUnauthorizedErrorInNext));
    await hit(`/${key}`, status, value);
  });
});

describe('Custom Client Error in Next Handling', () => {
  const key = 'custom-client-error-in-next-handling';
  const status = 422;
  const value = 'error-in-next';

  it(`should return ${value}`, async () => {
    app.get(`/${key}`, handleResponse(fnErrorInNext, fnPear));
    await hit(`/${key}`, status, value);
  });
});

describe('Pre Json hook', () => {
  const key = 'pre-json-hook';
  const status = 200;
  const value = 'apple';

  it(`should return ${value}`, async () => {
    let preData: unknown;

    apiHandler.preJson = function (data: unknown) {
      preData = data;
    };

    app.get(`/${key}`, handleResponse(fnApple));
    await hit(`/${key}`, status, value);
    expect(preData).toBe(value);
  });
});

describe('Pre Json hook failure', () => {
  const key = 'pre-json-hook-failure';
  const status = 422;
  const value = 'pre-json failed';

  it(`should return ${value}`, async () => {
    apiHandler.preJson = function () {
      throw new Error('pre-json failed');
    };

    app.get(`/${key}`, handleResponse(fnApple));
    await hit(`/${key}`, status, value);
  });
});

describe('Pre Json hook with Post Json hook', () => {
  const key = 'pre-post-json-hook';
  const status = 200;
  const value = 'apple';

  it(`should return ${value}`, async () => {
    let preData: unknown;
    let postData: unknown;

    apiHandler.postJson = function (data: unknown) {
      postData = data;
    };

    apiHandler.preJson = function (data: unknown) {
      preData = data;
    };

    app.get(`/${key}`, handleResponse(fnApple));
    await hit(`/${key}`, status, value);
    expect(preData).toBe(value);
    expect(postData).toBe(value);
  });
});

describe('Pre Error hook', () => {
  const key = 'pre-error-hook';
  const status = 422;
  const value = 'error1';

  it(`should return ${value}`, async () => {
    let preError: unknown;

    apiHandler.preError = function (err: Error) {
      preError = err.message;
    };

    app.get(`/${key}`, handleResponse(fnError1));
    await hit(`/${key}`, status, value);
    expect(preError).toBe(value);
  });
});

describe('Pre Error hook with Post Error hook', () => {
  const key = 'pre-post-error-hook';
  const status = 422;
  const value = 'error1';

  it(`should return ${value}`, async () => {
    let preError: unknown;
    let postError: unknown;

    apiHandler.postError = function (err: Error) {
      postError = err.message;
    };

    apiHandler.preError = function (err: Error) {
      preError = err.message;
    };

    app.get(`/${key}`, handleResponse(fnError1));
    await hit(`/${key}`, status, value);
    expect(preError).toBe(value);
    expect(postError).toBe(value);
  });
});

describe('Pre Error hook failure', () => {
  const key = 'pre-error-hook-failure';
  const status = 422;
  const value = 'pre-error failed';

  it(`should return ${value}`, async () => {
    apiHandler.preError = function () {
      throw new Error('pre-error failed');
    };

    app.get(`/${key}`, handleResponse(fnError1));
    await hit(`/${key}`, status, value);
  });
});

describe('Custom Error Message Provider', () => {
  const key = 'custom-error-message-provider';
  const status = 422;
  const value = 'customError';

  it(`should return ${value}`, async () => {
    apiHandler.preError = function (err: Error) {
      return err;
    };

    apiHandler.errorMessageProvider = function () {
      return 'customError';
    };

    app.get(`/${key}`, handleResponse(fnError1));
    await hit(`/${key}`, status, value);
  });
});

describe('Invalid handler input', () => {
  it('should require at least one middleware handler', () => {
    expect(() => handleResponse()).toThrow('at least one middleware handler is required');
  });

  it('should require middleware handlers to be functions', () => {
    expect(() => handleResponse(undefined as never)).toThrow('middleware handler must be a function');
  });
});

describe('Configuration accessors', () => {
  it('should expose the configured provider and hooks', () => {
    const handler = apiHandler.createExpressResponseHandler();
    const provider = function () {
      return 'customError';
    };
    const preJson = function (value: unknown) {
      return value;
    };

    handler.errorMessageProvider = provider;
    handler.preJson = preJson;

    expect(handler.errorMessageProvider).toBe(provider);
    expect(handler.preJson).toBeTypeOf('function');
    expect(handler.postJson).toBeNull();
    expect(handler.preError).toBeNull();
    expect(handler.postError).toBeNull();
  });
});

describe('Handler instance isolation', () => {
  const firstHandler = apiHandler.createExpressResponseHandler();
  const secondHandler = apiHandler.createExpressResponseHandler();
  const firstKey = 'isolated-handler-first';
  const secondKey = 'isolated-handler-second';

  it('should keep hook state isolated per handler instance', async () => {
    let firstPreJson: unknown;
    let secondPreJson: unknown;

    firstHandler.preJson = function (data: unknown) {
      firstPreJson = data;
    };

    app.get(`/${firstKey}`, firstHandler.handleResponse(fnApple));
    app.get(`/${secondKey}`, secondHandler.handleResponse(fnApple));

    await hit(`/${firstKey}`, 200, 'apple');
    expect(firstPreJson).toBe('apple');
    expect(secondPreJson).toBeUndefined();

    secondHandler.preJson = function (data: unknown) {
      secondPreJson = data;
    };

    await hit(`/${secondKey}`, 200, 'apple');
    expect(firstPreJson).toBe('apple');
    expect(secondPreJson).toBe('apple');
  });
});

describe('AIP-193 error format', () => {
  const structuredHandler = apiHandler.createExpressResponseHandler({
    errorFormat: 'aip193',
    errorDomain: 'api.example.com',
  });
  const validationKey = 'aip193-validation-error';
  const genericKey = 'aip193-generic-error';

  it('should return a structured error envelope for HTTP errors', async () => {
    app.get(`/${validationKey}`, structuredHandler.handleResponse(fnDetailedBadRequest));

    const response = await request(app).get(`/${validationKey}`).expect(400);

    expect(response.body).toEqual({
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
            type: 'bad_request',
            errors: [
              {
                field: 'email',
                description: 'Email must be a valid address.',
              },
            ],
          },
          {
            type: 'help',
            links: [
              {
                description: 'Validation troubleshooting',
                url: 'https://api.example.com/docs/errors/invalid-email',
              },
            ],
          },
        ],
      },
    });
  });

  it('should return a structured error envelope for generic errors', async () => {
    structuredHandler.errorMessageProvider = function () {
      return 'request failed';
    };

    app.get(`/${genericKey}`, structuredHandler.handleResponse(fnError1));

    const response = await request(app).get(`/${genericKey}`).expect(422);

    expect(response.body).toEqual({
      error: {
        code: 422,
        status: 'UNKNOWN',
        message: 'request failed',
        details: [
          {
            type: 'error_info',
            reason: 'UNKNOWN',
            domain: 'api.example.com',
          },
        ],
      },
    });
  });
});

function fnApple() {
  return 'apple';
}

function fnAppleNext(req: unknown, res: unknown, next: () => void) {
  next();
  return 'apple';
}

function fnPear() {
  return 'pear';
}

function fnPearPromise() {
  return Promise.resolve('pear');
}

function fnInvalidNextValue(req: unknown, res: unknown, next: (value: string) => void) {
  next('pear');
}

function fnDetailedBadRequest() {
  throw new BadRequestError('invalid email', {
    reason: 'INVALID_EMAIL',
    domain: 'api.example.com',
    metadata: { field: 'email' },
    errors: [{ field: 'email', description: 'Email must be a valid address.' }],
    details: [
      {
        type: 'help',
        links: [
          {
            description: 'Validation troubleshooting',
            url: 'https://api.example.com/docs/errors/invalid-email',
          },
        ],
      },
    ],
  });
}

function fnError1() {
  throw new Error('error1');
}

function fnError1Promise() {
  return Promise.reject(new Error('error1'));
}

function fnError2Next(req: unknown, res: unknown, next: () => void) {
  next();
  throw new Error('error2');
}

function fnErrorInNext(req: unknown, res: unknown, next: (err: Error) => void) {
  next(new Error('error-in-next'));
}

function fnUnauthorizedError() {
  throw new UnauthorizedError();
}

function fnUnauthorizedErrorInNext(req: unknown, res: unknown, next: (err: UnauthorizedError) => void) {
  next(new UnauthorizedError());
}
