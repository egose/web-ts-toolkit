import http from 'node:http';

import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
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

const { handleResponse } = apiHandler;

const app = express();
app.set('port', 8081);
const server = http.createServer(app);
server.listen(8081);

afterAll(() => {
  server.close();
});

const hit = async (url: string, status: number, value: number) => {
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
    app.get(
      `/${status}`,
      handleResponse(() => new OK(status)),
    );

    await hit(`/${status}`, status, status);
  });

  it('should return 201', async () => {
    const status = 201;
    app.get(
      `/${status}`,
      handleResponse(() => new Created(status)),
    );

    await hit(`/${status}`, status, status);
  });

  it('should return 202', async () => {
    const status = 202;
    app.get(
      `/${status}`,
      handleResponse(() => new Accepted(status)),
    );

    await hit(`/${status}`, status, status);
  });

  it('should return 203', async () => {
    const status = 203;
    app.get(
      `/${status}`,
      handleResponse(() => new NonAuthoritativeInfo(status)),
    );

    await hit(`/${status}`, status, status);
  });

  it('should return 204', async () => {
    const status = 204;
    app.get(
      `/${status}`,
      handleResponse(() => new NoContent('')),
    );

    await hit(`/${status}`, status, status);
  });

  it('should return 205', async () => {
    const status = 205;
    app.get(
      `/${status}`,
      handleResponse(() => new ResetContent(status)),
    );

    await hit(`/${status}`, status, status);
  });

  it('should return 206', async () => {
    const status = 206;
    app.get(
      `/${status}`,
      handleResponse(() => new PartialContent(status)),
    );

    await hit(`/${status}`, status, status);
  });

  it('should return 207', async () => {
    const status = 207;
    app.get(
      `/${status}`,
      handleResponse(() => new MultiStatus(status)),
    );

    await hit(`/${status}`, status, status);
  });

  it('should return 208', async () => {
    const status = 208;
    app.get(
      `/${status}`,
      handleResponse(() => new AlreadyReported(status)),
    );

    await hit(`/${status}`, status, status);
  });

  it('should return 226', async () => {
    const status = 226;
    app.get(
      `/${status}`,
      handleResponse(() => new IMUsed(status)),
    );

    await hit(`/${status}`, status, status);
  });
});
