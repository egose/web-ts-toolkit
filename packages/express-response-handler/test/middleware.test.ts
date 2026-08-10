import express from 'express';
import { request as httpRequest } from 'node:http';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { BadRequestError, UnauthorizedError } from '@web-ts-toolkit/http-errors';
import apiHandler, { CSVResponse, ErrorFormats, createHandler } from '../dist/index.mjs';
import {
  createInstrumentedApp,
  createBoundApp,
  resetHandlerState,
  type ProcessErrorCapture,
  type InstrumentedApp,
} from './helpers/lifecycle';

const { handleResponse } = apiHandler;

const defaultErrorMessageProvider = apiHandler.errorMessageProvider;

afterEach(() => {
  resetHandlerState(apiHandler, { errorMessageProvider: defaultErrorMessageProvider });
});

const app = express();

const hit = async (url: string, status: number, value: unknown) => {
  const response = await request(app).get(url).expect('Content-Type', /json/).expect(status);

  expect(status >= 400 ? response.body.message : response.body).toBe(value);
};

const expectJson = async (url: string, body: unknown, status = 200) => {
  const response = await request(app).get(url).expect('Content-Type', /json/).expect(status);

  expect(response.body).toEqual(body);
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

describe('Manual response handling', () => {
  const syncKey = 'manual-response-sync';
  const asyncKey = 'manual-response-async';
  const awaitedKey = 'manual-response-awaited';

  it('should not auto-send when a handler writes with res.json synchronously', async () => {
    app.get(
      `/${syncKey}`,
      handleResponse((req, res) => {
        res.json({ ok: true });
      }),
    );

    await request(app).get(`/${syncKey}`).expect(200, { ok: true });
  });

  it('should not auto-send when a handler writes with res.json after async work without returning a value', async () => {
    app.get(
      `/${asyncKey}`,
      handleResponse((req, res) => {
        Promise.resolve().then(() => {
          res.json({ ok: true });
        });
      }),
    );

    await request(app).get(`/${asyncKey}`).expect(200, { ok: true });
  });

  it('should not auto-send when an async handler awaits and writes with res.send without returning a value', async () => {
    app.get(
      `/${awaitedKey}`,
      handleResponse(async (req, res) => {
        await Promise.resolve();
        res.send('ok');
      }),
    );

    await request(app).get(`/${awaitedKey}`).expect(200, 'ok');
  });
});

describe('Invalid value in Next Handling', () => {
  const key = 'invalid-value-in-next-handling';
  const status = 500;
  const value = 'Internal Server Error';

  it(`should return ${value}`, async () => {
    app.get(`/${key}`, handleResponse(fnInvalidNextValue));
    await hit(`/${key}`, status, value);
  });
});

describe('Error Handling', () => {
  const key = 'error-handling';
  const status = 500;
  const value = 'Internal Server Error';

  it(`should return ${value}`, async () => {
    app.get(`/${key}`, handleResponse(fnAppleNext, fnError1, fnPear));
    await hit(`/${key}`, status, value);
  });
});

describe('Async Error Handling', () => {
  const key = 'async-error-handling';
  const status = 500;
  const value = 'Internal Server Error';

  it(`should return ${value}`, async () => {
    app.get(`/${key}`, handleResponse(fnAppleNext, fnError1Promise, fnPear));
    await hit(`/${key}`, status, value);
  });
});

describe('Multiple Async Error Handling', () => {
  const key = 'multiple-async-error-handling';
  const status = 500;
  const value = 'Internal Server Error';

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
    const localApp = express();
    const errors: unknown[] = [];

    localApp.get(`/${key}`, handleResponse(fnUnauthorizedErrorInNext));
    localApp.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      void next;
      errors.push(err);
      res
        .status(err instanceof UnauthorizedError ? status : 500)
        .json({ message: err instanceof Error ? err.message : String(err) });
    });

    const response = await request(localApp).get(`/${key}`).expect(status);

    expect(response.body.message).toBe(value);
    expect(errors).toHaveLength(1);
  });
});

describe('Custom Client Error in Next Handling', () => {
  const key = 'custom-client-error-in-next-handling';
  const status = 500;
  const value = 'error-in-next';

  it(`should return ${value}`, async () => {
    const localApp = express();
    const errors: unknown[] = [];

    localApp.get(`/${key}`, handleResponse(fnErrorInNext, fnPear));
    localApp.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      void next;
      errors.push(err);
      res.status(status).json({ message: err instanceof Error ? err.message : String(err) });
    });

    const response = await request(localApp).get(`/${key}`).expect(status);

    expect(response.body.message).toBe(value);
    expect(errors).toHaveLength(1);
  });
});

describe('Pre Json hook', () => {
  const key = 'pre-json-hook';
  const status = 200;
  const value = 'apple';

  it(`should return ${value}`, async () => {
    const handler = createHandler();
    let preData: unknown;

    handler.preJson = function (data: unknown) {
      preData = data;
    };

    app.get(`/${key}`, handler.handleResponse(fnApple));
    await hit(`/${key}`, status, value);
    expect(preData).toBe(value);
  });

  it('should ignore returned replacement values', async () => {
    const handler = createHandler();
    const localApp = express();

    handler.preJson = function () {
      return Promise.resolve(undefined);
    };

    localApp.get('/pre-json-observational', handler.handleResponse(fnApple));

    const response = await request(localApp).get('/pre-json-observational').expect(200);
    expect(response.body).toBe('apple');
  });

  it('should await async pre-json hooks before sending the response', async () => {
    const handler = createHandler();
    const localApp = express();
    const order: string[] = [];

    handler.preJson = async function () {
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push('pre');
    };

    localApp.get(
      '/pre-json-async',
      handler.handleResponse(() => {
        order.push('handler');
        return 'apple';
      }),
    );

    await request(localApp).get('/pre-json-async').expect(200);
    expect(order).toEqual(['handler', 'pre']);
  });
});

describe('Pre Json hook failure', () => {
  const key = 'pre-json-hook-failure';
  const status = 500;
  const value = 'Internal Server Error';

  it(`should return ${value}`, async () => {
    const handler = createHandler();

    handler.preJson = function () {
      throw new Error('pre-json failed');
    };

    app.get(`/${key}`, handler.handleResponse(fnApple));
    await hit(`/${key}`, status, value);
  });
});

describe('Pre Json hook with Post Json hook', () => {
  const key = 'pre-post-json-hook';
  const status = 200;
  const value = 'apple';

  it(`should return ${value}`, async () => {
    const handler = createHandler();
    let preData: unknown;
    let postData: unknown;

    handler.postJson = function (data: unknown) {
      postData = data;
    };

    handler.preJson = function (data: unknown) {
      preData = data;
    };

    app.get(`/${key}`, handler.handleResponse(fnApple));
    await hit(`/${key}`, status, value);
    expect(preData).toBe(value);
    expect(postData).toBe(value);
  });

  it('should run post-json after the HTTP response finishes', async () => {
    const { app: localApp, tracker, dispose } = createInstrumentedApp();
    const handler = createHandler();
    let resolvePostHook: () => void = () => undefined;
    const postHookFinished = new Promise<void>((resolve) => {
      resolvePostHook = resolve;
    });
    let finishedWhenHookRan = false;

    localApp.use(tracker.attachedMiddleware);
    handler.postJson = function () {
      finishedWhenHookRan = tracker.finishedOnce;
      resolvePostHook();
    };

    localApp.get('/post-json-finish', handler.handleResponse(fnApple));

    await request(localApp).get('/post-json-finish').expect(200);
    await postHookFinished;
    expect(finishedWhenHookRan).toBe(true);
    dispose();
  });

  it('should not run post-json when a handler manages the response and returns undefined', async () => {
    const handler = createHandler();
    const localApp = express();
    let postJsonCalls = 0;

    handler.postJson = function () {
      postJsonCalls += 1;
    };

    localApp.get(
      '/manual-no-return-post-json',
      handler.handleResponse((_req, res) => {
        res.status(204).end();
      }),
    );

    await request(localApp).get('/manual-no-return-post-json').expect(204);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(postJsonCalls).toBe(0);
  });

  it('should pass post-json hook rejections to Express error middleware after finish', async () => {
    const { app: localApp, processCapture, dispose } = createInstrumentedApp({ captureProcess: true });
    const handler = createHandler();
    const postFailure = new Error('post-json failed');
    let resolveObserved: () => void = () => undefined;
    const observed = new Promise<void>((resolve) => {
      resolveObserved = resolve;
    });
    const errors: unknown[] = [];

    handler.postJson = function () {
      return Promise.reject(postFailure);
    };

    localApp.get('/post-json-rejects', handler.handleResponse(fnApple));
    localApp.use((err: unknown, _req: express.Request, _res: express.Response, next: express.NextFunction) => {
      errors.push(err);
      resolveObserved();
      next(err);
    });

    await request(localApp).get('/post-json-rejects').expect(200);
    await observed;

    expect(errors).toEqual([postFailure]);
    expect(processCapture?.observedUnhandledRejection).toBe(false);
    dispose();
  });

  it('should run post-json after a CSV response finishes', async () => {
    const { app: localApp, tracker, dispose } = createInstrumentedApp();
    const handler = createHandler();
    let resolvePostHook: () => void = () => undefined;
    const postHookFinished = new Promise<void>((resolve) => {
      resolvePostHook = resolve;
    });
    let finishedWhenHookRan = false;

    localApp.use(tracker.attachedMiddleware);
    handler.postJson = function () {
      finishedWhenHookRan = tracker.finishedOnce;
      resolvePostHook();
    };

    localApp.get(
      '/post-json-csv-finish',
      handler.handleResponse(() => new CSVResponse([{ name: 'Ada' }])),
    );

    await request(localApp).get('/post-json-csv-finish').expect(200);
    await postHookFinished;
    expect(finishedWhenHookRan).toBe(true);
    dispose();
  });

  it('should not run post-json when a CSV client closes before finish', async () => {
    const bound = await createBoundApp();
    const handler = createHandler();
    let postJsonCalls = 0;

    async function* rows() {
      for (let id = 0; ; id += 1) {
        yield { id };
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }

    handler.postJson = function () {
      postJsonCalls += 1;
    };

    bound.app.get(
      '/post-json-csv-close',
      handler.handleResponse(() => new CSVResponse(rows(), { headers: ['id'] })),
    );

    const closed = new Promise<void>((resolve, reject) => {
      const clientRequest = httpRequest(
        { hostname: '127.0.0.1', port: bound.port, path: '/post-json-csv-close' },
        (clientResponse) => {
          clientResponse.once('data', () => clientRequest.destroy());
        },
      );

      clientRequest.on('close', () => resolve());
      clientRequest.on('error', (err: Error & { code?: string }) => {
        if (err.code !== 'ECONNRESET') {
          reject(err);
        }
      });
      clientRequest.end();
    });

    await closed;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(postJsonCalls).toBe(0);
    await bound.dispose();
  });
});

describe('Pre Error hook', () => {
  const key = 'pre-error-hook';
  const status = 500;
  const value = 'Internal Server Error';
  const originalValue = 'error1';

  it(`should return ${value}`, async () => {
    const handler = createHandler();
    let preError: unknown;

    handler.preError = function (err: Error) {
      preError = err.message;
    };

    app.get(`/${key}`, handler.handleResponse(fnError1));
    await hit(`/${key}`, status, value);
    expect(preError).toBe(originalValue);
  });
});

describe('Pre Error hook with Post Error hook', () => {
  const key = 'pre-post-error-hook';
  const status = 500;
  const value = 'Internal Server Error';
  const originalValue = 'error1';

  it(`should return ${value}`, async () => {
    const handler = createHandler();
    let preError: unknown;
    let postError: unknown;

    handler.postError = function (err: Error) {
      postError = err.message;
    };

    handler.preError = function (err: Error) {
      preError = err.message;
    };

    app.get(`/${key}`, handler.handleResponse(fnError1));
    await hit(`/${key}`, status, value);
    expect(preError).toBe(originalValue);
    expect(postError).toBe(originalValue);
  });

  it('should run async post-error after the HTTP response finishes', async () => {
    const { app: localApp, tracker, dispose } = createInstrumentedApp();
    const handler = createHandler();
    let resolvePostHook: () => void = () => undefined;
    const postHookFinished = new Promise<void>((resolve) => {
      resolvePostHook = resolve;
    });
    let finishedWhenHookRan = false;

    localApp.use(tracker.attachedMiddleware);
    handler.postError = async function () {
      await Promise.resolve();
      finishedWhenHookRan = tracker.finishedOnce;
      resolvePostHook();
    };

    localApp.get('/post-error-finish', handler.handleResponse(fnError1));

    await request(localApp).get('/post-error-finish').expect(500);
    await postHookFinished;
    expect(finishedWhenHookRan).toBe(true);
    dispose();
  });
});

describe('Pre Error hook failure', () => {
  const key = 'pre-error-hook-failure';
  const status = 500;
  const value = 'Internal Server Error';

  it(`should return ${value}`, async () => {
    const handler = createHandler();

    handler.preError = function () {
      throw new Error('pre-error failed');
    };

    app.get(`/${key}`, handler.handleResponse(fnError1));
    await hit(`/${key}`, status, value);
  });
});

describe('Custom Error Message Provider', () => {
  const key = 'custom-error-message-provider';
  const status = 500;
  const value = 'customError';

  it(`should return ${value}`, async () => {
    const handler = createHandler();

    handler.preError = function (err: Error) {
      return err;
    };

    handler.errorMessageProvider = function () {
      return 'customError';
    };

    app.get(`/${key}`, handler.handleResponse(fnError1));
    await hit(`/${key}`, status, value);
  });
});

describe('Secure generic error handling', () => {
  const secret = 'sentinel-secret-erh-04';

  it('redacts unexpected errors in every error format while hooks observe the original error', async () => {
    const cases = [
      { format: ErrorFormats.simple, contentType: /json/ },
      { format: ErrorFormats.aip193, contentType: /json/ },
      { format: ErrorFormats.rfc9457, contentType: /application\/problem\+json/ },
    ] as const;

    for (const { format, contentType } of cases) {
      const localApp = express();
      const handler = createHandler({ errorFormat: format });
      const observed: string[] = [];

      handler.preError = function (err: unknown) {
        if (err instanceof Error) {
          observed.push(`pre:${err.message}`);
        }
      };
      handler.postError = function (err: unknown) {
        if (err instanceof Error) {
          observed.push(`post:${err.message}`);
        }
      };

      localApp.get(
        `/${format}`,
        handler.handleResponse(() => {
          throw new Error(`database password leaked ${secret}`);
        }),
      );

      const response = await request(localApp).get(`/${format}`).expect('Content-Type', contentType).expect(500);
      const bodyText = JSON.stringify(response.body);

      expect(bodyText).not.toContain(secret);
      expect(bodyText).not.toContain('database password leaked');
      expect(observed).toEqual([`pre:database password leaked ${secret}`, `post:database password leaked ${secret}`]);

      if (format === ErrorFormats.simple) {
        expect(response.body).toEqual({ message: 'Internal Server Error' });
      } else if (format === ErrorFormats.aip193) {
        expect(response.body.error).toMatchObject({
          code: 500,
          status: 'INTERNAL',
          message: 'Internal Server Error',
        });
      } else {
        expect(response.body).toMatchObject({
          status: 500,
          detail: 'Internal Server Error',
        });
      }
    }
  });

  it.each([NaN, Infinity, -Infinity, 200, 302, 399, 600, -1, 500.5])(
    'delegates invalid HTTP error status %s before writing headers',
    async (statusCode) => {
      const localApp = express();
      const handler = createHandler();
      const errors: unknown[] = [];

      localApp.get(
        '/invalid-status',
        handler.handleResponse(() => {
          throw { statusCode, message: `bad status ${secret}` };
        }),
      );
      localApp.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
        void next;
        errors.push(err);
        expect(res.headersSent).toBe(false);
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
      });

      const response = await request(localApp).get('/invalid-status').expect(500);

      expect(errors).toHaveLength(1);
      expect(response.body.message).toBe(
        'error.statusCode must be an integer HTTP error status code between 400 and 599',
      );
    },
  );

  it('validates provider-derived AIP-193 status codes through the shared boundary', async () => {
    const localApp = express();
    const handler = createHandler({ errorFormat: ErrorFormats.aip193 });
    const errors: unknown[] = [];

    handler.errorMessageProvider = function () {
      return { error: { code: 200, message: 'invalid provider status' } };
    };
    localApp.get('/invalid-aip-provider-status', handler.handleResponse(fnError1));
    localApp.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      void next;
      errors.push(err);
      expect(res.headersSent).toBe(false);
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    });

    const response = await request(localApp).get('/invalid-aip-provider-status').expect(500);

    expect(errors).toHaveLength(1);
    expect(response.body.message).toBe('error status must be an integer HTTP error status code between 400 and 599');
  });

  it('validates provider-derived RFC 9457 status codes through the shared boundary', async () => {
    const localApp = express();
    const handler = createHandler({ errorFormat: ErrorFormats.rfc9457 });
    const errors: unknown[] = [];

    handler.errorMessageProvider = function () {
      return { status: 302, detail: 'invalid provider status' };
    };
    localApp.get('/invalid-rfc-provider-status', handler.handleResponse(fnError1));
    localApp.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      void next;
      errors.push(err);
      expect(res.headersSent).toBe(false);
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    });

    const response = await request(localApp).get('/invalid-rfc-provider-status').expect(500);

    expect(errors).toHaveLength(1);
    expect(response.body.message).toBe('error status must be an integer HTTP error status code between 400 and 599');
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
    const handler = createHandler();
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
  const firstHandler = createHandler();
  const secondHandler = createHandler();
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

  it('should expose default handler hook mutations process-wide through the singleton', async () => {
    const localApp = express();
    let observed: unknown;

    apiHandler.preJson = function (data: unknown) {
      observed = data;
    };

    localApp.get('/default-singleton-hook', apiHandler.handleResponse(fnApple));

    await request(localApp).get('/default-singleton-hook').expect(200);
    expect(observed).toBe('apple');
    expect(apiHandler.preJson).toBeTypeOf('function');
  });
});

describe('Handler configuration validation', () => {
  it('rejects an unknown error format during createHandler', () => {
    expect(() => createHandler({ errorFormat: 'unknown' } as never)).toThrow(
      'errorFormat must be one of: simple, aip193, rfc9457',
    );
  });

  it('rejects an unsupported RFC 9457 content type during createHandler', () => {
    expect(() => createHandler({ rfc9457ContentType: 'text/plain' } as never)).toThrow(
      'rfc9457ContentType must be one of: application/problem+json, application/json',
    );
  });

  it('rejects an invalid error domain during createHandler', () => {
    expect(() => createHandler({ errorDomain: '' })).toThrow('errorDomain must be a non-empty string');
    expect(() => createHandler({ errorDomain: 123 } as never)).toThrow('errorDomain must be a non-empty string');
  });

  it('accepts the default simple format and returns a simple error payload', async () => {
    const handler = createHandler();
    app.get('/config-simple-error', handler.handleResponse(fnUnauthorizedError));

    await expectJson('/config-simple-error', { message: 'The user is not authorized' }, 401);
  });

  it('accepts AIP-193 format with a domain and returns a structured error payload', async () => {
    const handler = createHandler({
      errorFormat: ErrorFormats.aip193,
      errorDomain: 'config.example.com',
    });
    app.get(
      '/config-aip193-error',
      handler.handleResponse(() => {
        throw new BadRequestError('invalid email', {
          reason: 'INVALID_EMAIL',
          metadata: { field: 'email' },
        });
      }),
    );

    const response = await request(app).get('/config-aip193-error').expect('Content-Type', /json/).expect(400);

    expect(response.body.error.details[0]).toEqual({
      type: 'error_info',
      reason: 'INVALID_EMAIL',
      domain: 'config.example.com',
      metadata: {
        field: 'email',
      },
    });
  });

  it('accepts RFC 9457 format with problem+json content type', async () => {
    const handler = createHandler({
      errorFormat: ErrorFormats.rfc9457,
      rfc9457ContentType: 'application/problem+json',
    });
    app.get('/config-rfc9457-problem-json-error', handler.handleResponse(fnDetailedBadRequest));

    await request(app)
      .get('/config-rfc9457-problem-json-error')
      .expect('Content-Type', /application\/problem\+json/)
      .expect(400);
  });

  it('accepts RFC 9457 format with application/json content type', async () => {
    const handler = createHandler({
      errorFormat: ErrorFormats.rfc9457,
      rfc9457ContentType: 'application/json',
    });
    app.get('/config-rfc9457-json-error', handler.handleResponse(fnDetailedBadRequest));

    await request(app)
      .get('/config-rfc9457-json-error')
      .expect('Content-Type', /application\/json/)
      .expect(400);
  });

  it('does not observe later mutation of the caller options object', async () => {
    const options = {
      errorFormat: ErrorFormats.rfc9457,
      errorDomain: 'snapshot.example.com',
      rfc9457ContentType: 'application/problem+json',
    };
    const handler = createHandler(options as never);

    options.errorFormat = ErrorFormats.simple;
    options.errorDomain = 'mutated.example.com';
    options.rfc9457ContentType = 'application/json';

    app.get('/config-snapshot-error', handler.handleResponse(fnError1));

    await request(app)
      .get('/config-snapshot-error')
      .expect('Content-Type', /application\/problem\+json/)
      .expect(500);
  });
});

describe('AIP-193 error format', () => {
  const structuredHandler = createHandler({
    errorFormat: ErrorFormats.aip193,
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

    await expectJson(
      `/${genericKey}`,
      {
        error: {
          code: 500,
          status: 'INTERNAL',
          message: 'request failed',
          details: [
            {
              type: 'error_info',
              reason: 'INTERNAL',
              domain: 'api.example.com',
            },
          ],
        },
      },
      500,
    );
  });
});

describe('RFC 9457 error format', () => {
  const problemHandler = createHandler({
    errorFormat: ErrorFormats.rfc9457,
    errorDomain: 'api.example.com',
  });
  const jsonProblemHandler = createHandler({
    errorFormat: ErrorFormats.rfc9457,
    errorDomain: 'api.example.com',
    rfc9457ContentType: 'application/json',
  });
  const validationKey = 'rfc9457-validation-error';
  const genericKey = 'rfc9457-generic-error';
  const jsonValidationKey = 'rfc9457-json-validation-error';
  const jsonGenericKey = 'rfc9457-json-generic-error';

  it('should return a problem details payload for HTTP errors', async () => {
    app.get(`/${validationKey}`, problemHandler.handleResponse(fnDetailedBadRequest));

    const response = await request(app)
      .get(`/${validationKey}`)
      .expect('Content-Type', /application\/problem\+json/)
      .expect(400);

    expect(response.body).toEqual({
      type: 'https://api.example.com/problems/invalid-email',
      title: 'Invalid email address',
      status: 400,
      detail: 'invalid email',
      instance: '/problems/invalid-email/123',
      errors: [
        {
          field: 'email',
          description: 'Email must be a valid address.',
        },
      ],
    });
  });

  it('should return a problem details payload for generic errors', async () => {
    problemHandler.errorMessageProvider = function () {
      return {
        type: 'https://api.example.com/problems/request-failed',
        title: 'Request failed',
        status: 422,
        detail: 'request failed',
        instance: '/problems/request-failed/456',
        errors: [
          {
            detail: 'email is required',
            pointer: '#/email',
          },
        ],
      };
    };

    app.get(`/${genericKey}`, problemHandler.handleResponse(fnError1));

    const response = await request(app)
      .get(`/${genericKey}`)
      .expect('Content-Type', /application\/problem\+json/)
      .expect(422);

    expect(response.body).toEqual({
      type: 'https://api.example.com/problems/request-failed',
      title: 'Request failed',
      status: 422,
      detail: 'request failed',
      instance: '/problems/request-failed/456',
      errors: [
        {
          detail: 'email is required',
          pointer: '#/email',
        },
      ],
    });
  });

  it('should allow RFC 9457 payloads to be returned as application/json for HTTP errors', async () => {
    app.get(`/${jsonValidationKey}`, jsonProblemHandler.handleResponse(fnDetailedBadRequest));

    const response = await request(app)
      .get(`/${jsonValidationKey}`)
      .expect('Content-Type', /application\/json/)
      .expect(400);

    expect(response.body).toEqual({
      type: 'https://api.example.com/problems/invalid-email',
      title: 'Invalid email address',
      status: 400,
      detail: 'invalid email',
      instance: '/problems/invalid-email/123',
      errors: [
        {
          field: 'email',
          description: 'Email must be a valid address.',
        },
      ],
    });
  });

  it('should allow RFC 9457 payloads to be returned as application/json for generic errors', async () => {
    jsonProblemHandler.errorMessageProvider = function () {
      return {
        type: 'https://api.example.com/problems/request-failed',
        title: 'Request failed',
        status: 422,
        detail: 'request failed',
        instance: '/problems/request-failed/456',
        errors: [
          {
            detail: 'email is required',
            pointer: '#/email',
          },
        ],
      };
    };

    app.get(`/${jsonGenericKey}`, jsonProblemHandler.handleResponse(fnError1));

    const response = await request(app)
      .get(`/${jsonGenericKey}`)
      .expect('Content-Type', /application\/json/)
      .expect(422);

    expect(response.body).toEqual({
      type: 'https://api.example.com/problems/request-failed',
      title: 'Request failed',
      status: 422,
      detail: 'request failed',
      instance: '/problems/request-failed/456',
      errors: [
        {
          detail: 'email is required',
          pointer: '#/email',
        },
      ],
    });
  });
});

describe('Express error middleware observation', () => {
  let instrumented: InstrumentedApp;
  let processCapture: ProcessErrorCapture | undefined;

  afterEach(() => {
    instrumented?.dispose();
    processCapture?.dispose();
    processCapture = undefined;
    instrumented = undefined as never;
  });

  it('a thrown handler error does not leak an unhandled rejection and still produces one terminal response', async () => {
    instrumented = createInstrumentedApp({ captureProcess: true });
    processCapture = instrumented.processCapture ?? undefined;
    const { app, probe, tracker } = instrumented;

    app.use(tracker.attachedMiddleware);
    app.get('/throw', handleResponse(fnError1));
    probe.install();

    const response = await request(app).get('/throw').expect(500);

    expect(response.body.message).toBe('Internal Server Error');
    expect(probe.errorMiddlewareNeverReached).toBe(true);
    expect(tracker.finishedOnce).toBe(true);
    expect(processCapture.observedUnhandledRejection).toBe(false);
  });

  it('a rejected handler promise does not emit an unhandled rejection and still produces one terminal response', async () => {
    instrumented = createInstrumentedApp({ captureProcess: true });
    processCapture = instrumented.processCapture ?? undefined;
    const { app, probe, tracker } = instrumented;

    app.use(tracker.attachedMiddleware);
    app.get('/reject', handleResponse(fnError1Promise));
    probe.install();

    const response = await request(app).get('/reject').expect(500);

    expect(response.body.message).toBe('Internal Server Error');
    expect(probe.errorMiddlewareNeverReached).toBe(true);
    expect(tracker.finishedOnce).toBe(true);
    expect(processCapture.observedUnhandledRejection).toBe(false);
  });

  it('a raw Express middleware that calls next(error) reaches error middleware exactly once', async () => {
    instrumented = createInstrumentedApp();
    const { app, probe, tracker } = instrumented;

    app.use(tracker.attachedMiddleware);
    app.get('/raw-next-error', (_req, _res, next) => {
      next(new Error('raw-error'));
    });
    probe.install();

    await request(app).get('/raw-next-error').expect(500);

    expect(probe.errorMiddlewareReachedOnce).toBe(true);
    expect(tracker.finishedOnce).toBe(true);
  });

  it('a successful request never reaches Express error middleware and finishes exactly once', async () => {
    instrumented = createInstrumentedApp();
    const { app, probe, tracker } = instrumented;

    app.use(tracker.attachedMiddleware);
    app.get('/ok', handleResponse(fnApple));
    probe.install();

    const response = await request(app).get('/ok').expect(200);

    expect(response.body).toBe('apple');
    expect(probe.errorMiddlewareNeverReached).toBe(true);
    expect(tracker.finishedOnce).toBe(true);
  });
});

describe('Express next control flow', () => {
  it('forwards a delayed next(error) to Express error middleware exactly once', async () => {
    const localApp = express();
    const handler = createHandler();
    const errors: unknown[] = [];

    localApp.get(
      '/delayed-next-error',
      handler.handleResponse((_req, _res, next) => {
        setTimeout(() => next(new Error('delayed-error')), 5);
      }),
    );
    localApp.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      void next;
      errors.push(err);
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    });

    const response = await request(localApp).get('/delayed-next-error').expect(500);

    expect(response.body).toEqual({ message: 'delayed-error' });
    expect(errors).toHaveLength(1);
  });

  it('does not block next(error) behind a never-settling returned promise', async () => {
    const localApp = express();
    const handler = createHandler();
    const errors: unknown[] = [];

    localApp.get(
      '/pending-and-next-error',
      handler.handleResponse((_req, _res, next) => {
        setTimeout(() => next(new Error('pending-error')), 5);
        return new Promise(() => undefined);
      }),
    );
    localApp.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      void next;
      errors.push(err);
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    });

    const response = await request(localApp).get('/pending-and-next-error').expect(500);

    expect(response.body).toEqual({ message: 'pending-error' });
    expect(errors).toHaveLength(1);
  });

  it("forwards next('route') to the next matching route", async () => {
    const localApp = express();
    const handler = createHandler();

    localApp.get(
      '/route-control',
      handler.handleResponse((_req, _res, next) => {
        next('route');
        return 'first-route';
      }),
      (_req, res) => res.json({ route: 'same' }),
    );
    localApp.get('/route-control', (_req, res) => res.json({ route: 'next' }));

    const response = await request(localApp).get('/route-control').expect(200);

    expect(response.body).toEqual({ route: 'next' });
  });

  it("forwards next('router') out of the current router", async () => {
    const localApp = express();
    const router = express.Router();
    const handler = createHandler();

    router.get(
      '/',
      handler.handleResponse((_req, _res, next) => {
        next('router');
        return 'router-route';
      }),
      (_req, res) => res.json({ location: 'router' }),
    );
    localApp.use('/router-control', router);
    localApp.use('/router-control', (_req, res) => res.json({ location: 'app' }));

    const response = await request(localApp).get('/router-control').expect(200);

    expect(response.body).toEqual({ location: 'app' });
  });

  it('ignores a late resolution after next() continues middleware', async () => {
    const localApp = express();
    const handler = createHandler();
    const errors: unknown[] = [];

    localApp.get(
      '/late-resolution-after-next',
      handler.handleResponse((_req, _res, next) => {
        next();
        return Promise.resolve('late-value');
      }),
      (_req, res) => res.json({ continued: true }),
    );
    localApp.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      void next;
      errors.push(err);
      res.status(500).json({ message: 'unexpected-error' });
    });

    const response = await request(localApp).get('/late-resolution-after-next').expect(200);

    expect(response.body).toEqual({ continued: true });
    expect(errors).toHaveLength(0);
  });

  it('ignores a late rejection after next(error) delegates to Express', async () => {
    const localApp = express();
    const handler = createHandler();
    const messages: string[] = [];

    localApp.get(
      '/late-rejection-after-next-error',
      handler.handleResponse((_req, _res, next) => {
        next(new Error('first-error'));
        return Promise.reject(new Error('late-error'));
      }),
    );
    localApp.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      void next;
      messages.push(err instanceof Error ? err.message : String(err));
      res.status(500).json({ message: messages.at(-1) });
    });

    const response = await request(localApp).get('/late-rejection-after-next-error').expect(500);
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(response.body).toEqual({ message: 'first-error' });
    expect(messages).toEqual(['first-error']);
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
    type: 'https://api.example.com/problems/invalid-email',
    title: 'Invalid email address',
    instance: '/problems/invalid-email/123',
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
