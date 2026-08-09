import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import apiHandler from '../dist/index.mjs';
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
