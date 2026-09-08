import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import apiHandler, { HttpResponse } from '../dist/index.mjs';
import { Response, responseBrand } from '../dist/responses/index.mjs';
import {
  OK,
  Created,
  Accepted,
  NonAuthoritativeInfo,
  NoContent,
  ResetContent,
  PartialContent,
  MultiStatus,
  AlreadyReported,
  IMUsed,
} from '../dist/responses/success.mjs';
import { createInstrumentedApp } from './helpers/lifecycle';

const { handleResponse } = apiHandler;

const hit = async (app: express.Express, url: string, status: number, value: number): Promise<void> => {
  const response = await request(app).get(url).expect(status);

  if (status === 204) {
    expect(response.headers['content-type']).toBeUndefined();
    expect(response.body).toEqual({});
    return;
  }

  if (status === 205) {
    expect(response.headers['content-type']).toContain('/json');
    expect(response.body).toBe('');
    return;
  }

  expect(response.headers['content-type']).toContain('/json');
  expect(response.body).toBe(value);
};

describe('Successful responses', () => {
  it('should return 200', async () => {
    const status = 200;
    const app = express();

    app.get(
      `/${status}`,
      handleResponse(() => new OK(status)),
    );

    await hit(app, `/${status}`, status, status);
  });

  it('should return 201', async () => {
    const status = 201;
    const app = express();

    app.get(
      `/${status}`,
      handleResponse(() => new Created(status)),
    );

    await hit(app, `/${status}`, status, status);
  });

  it('should return 202', async () => {
    const status = 202;
    const app = express();

    app.get(
      `/${status}`,
      handleResponse(() => new Accepted(status)),
    );

    await hit(app, `/${status}`, status, status);
  });

  it('should return 203', async () => {
    const status = 203;
    const app = express();

    app.get(
      `/${status}`,
      handleResponse(() => new NonAuthoritativeInfo(status)),
    );

    await hit(app, `/${status}`, status, status);
  });

  it('should return 204', async () => {
    const status = 204;
    const app = express();

    app.get(
      `/${status}`,
      handleResponse(() => new NoContent()),
    );

    await hit(app, `/${status}`, status, status);
  });

  it('should return 205', async () => {
    const status = 205;
    const app = express();

    app.get(
      `/${status}`,
      handleResponse(() => new ResetContent(status)),
    );

    await hit(app, `/${status}`, status, status);
  });

  it('should return 206', async () => {
    const status = 206;
    const app = express();

    app.get(
      `/${status}`,
      handleResponse(() => new PartialContent(status)),
    );

    await hit(app, `/${status}`, status, status);
  });

  it('should return 207', async () => {
    const status = 207;
    const app = express();

    app.get(
      `/${status}`,
      handleResponse(() => new MultiStatus(status)),
    );

    await hit(app, `/${status}`, status, status);
  });

  it('should return 208', async () => {
    const status = 208;
    const app = express();

    app.get(
      `/${status}`,
      handleResponse(() => new AlreadyReported(status)),
    );

    await hit(app, `/${status}`, status, status);
  });

  it('should return 226', async () => {
    const status = 226;
    const app = express();

    app.get(
      `/${status}`,
      handleResponse(() => new IMUsed(status)),
    );

    await hit(app, `/${status}`, status, status);
  });
});

describe('Response lifecycle regression', () => {
  it.each([NaN, Infinity, -Infinity, 99, 600, 200.5])('rejects invalid response status %s', (statusCode) => {
    expect(() => new Response(statusCode, { ok: true })).toThrow(
      'statusCode must be an integer HTTP status code between 100 and 599',
    );
  });

  it('validates forged branded response status codes before writing headers', async () => {
    const app = express();

    app.get(
      '/invalid-response-status',
      handleResponse(() => ({ [responseBrand]: true, statusCode: 99, data: { ok: true } })),
    );

    const response = await request(app).get('/invalid-response-status').expect(500);

    expect(response.headers['content-type']).toContain('/json');
    expect(response.body).toEqual({ message: 'Internal Server Error' });
  });

  it('a successful request finishes exactly once without reaching error middleware', async () => {
    const { app, probe, tracker, dispose } = createInstrumentedApp();

    try {
      tracker.reset();
      app.use(tracker.attachedMiddleware);
      app.get(
        '/ok',
        handleResponse(() => new OK(200)),
      );
      probe.install();

      const response = await request(app).get('/ok').expect(200);

      expect(response.body).toBe(200);
      expect(probe.errorMiddlewareNeverReached).toBe(true);
      expect(tracker.finishedOnce).toBe(true);
    } finally {
      dispose();
    }
  });
});

describe('Handler call shapes (B-ERH-07)', () => {
  const fnA = (): string => 'a';
  const fnB = (_req: unknown, _res: unknown, next: (err?: unknown) => void): string => {
    next();
    return 'b';
  };

  it('single function returns a single middleware', () => {
    const result = handleResponse(fnA);

    expect(typeof result).toBe('function');
    expect(Array.isArray(result)).toBe(false);
  });

  it('singleton array returns a single middleware (length-dependent runtime)', () => {
    const result = handleResponse([fnA]);

    expect(typeof result).toBe('function');
    expect(Array.isArray(result)).toBe(false);
  });

  it('multi array returns an array of middlewares', () => {
    const result = handleResponse([fnA, fnB]);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    for (const entry of result as unknown[]) {
      expect(typeof entry).toBe('function');
    }
  });

  it('variadic multi returns an array of middlewares', () => {
    const result = handleResponse(fnA, fnB);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('empty array and empty variadic reject at runtime', () => {
    expect(() => handleResponse([] as never)).toThrow('at least one middleware handler is required');
    expect(() => (handleResponse as (...args: never[]) => unknown)()).toThrow(
      'at least one middleware handler is required',
    );
  });

  it('variable-length spread resolves by runtime length without a compile-time guarantee', () => {
    const singleton: Array<typeof fnA> = [fnA];
    const pair: Array<typeof fnA> = [fnA, fnA];

    const one = handleResponse(...singleton);
    expect(typeof one).toBe('function');
    expect(Array.isArray(one)).toBe(false);

    const two = handleResponse(...pair);
    expect(Array.isArray(two)).toBe(true);

    const dynamic: Array<typeof fnA> = [fnA];
    const viaArray = handleResponse(dynamic);
    expect(Array.isArray(viaArray)).toBe(false);

    const dynamicPair: Array<typeof fnA> = [fnA, fnA];
    expect(Array.isArray(handleResponse(dynamicPair))).toBe(true);
    expect(() => handleResponse([] as Array<typeof fnA>)).toThrow('at least one middleware handler is required');
  });

  it('singleton-array middleware serves traffic', async () => {
    const app = express();

    app.get('/singleton-array', handleResponse([() => new OK('single')]));

    await request(app).get('/singleton-array').expect(200, '"single"');
  });

  it('payload-bearing factories retain payload data at runtime', async () => {
    const app = express();

    app.get(
      '/factory-ok',
      handleResponse(() => HttpResponse.ok({ id: 'user_1' })),
    );
    app.get(
      '/factory-json',
      handleResponse(() => HttpResponse.json({ id: 'user_2' })),
    );
    app.get(
      '/factory-created',
      handleResponse(() => HttpResponse.created({ id: 'user_3' })),
    );

    await request(app).get('/factory-ok').expect(200, { id: 'user_1' });
    await request(app).get('/factory-json').expect(200, { id: 'user_2' });
    await request(app).get('/factory-created').expect(201, { id: 'user_3' });
    expect(HttpResponse.ok({ id: 'user_1' }).statusCode).toBe(200);
    expect(HttpResponse.json({ id: 'user_2' }).statusCode).toBe(200);
  });
});
