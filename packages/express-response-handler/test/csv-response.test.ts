import http from 'node:http';

import { parse } from '@fast-csv/parse';
import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import apiHandler from '../dist/index.mjs';
import { CSVResponse } from '../dist/responses/csv.mjs';

const { handleResponse, HttpResponse } = apiHandler;

const app = express();
app.set('port', 8082);
const server = http.createServer(app);
server.listen(8082);

afterAll(() => {
  server.close();
});

const parseCsv = async (input: string, headers: boolean) => {
  const result: Array<Record<string, string> | string[]> = [];

  await new Promise<void>((resolve, reject) => {
    const stream = parse({ headers })
      .on('error', reject)
      .on('data', (row) => result.push(row))
      .on('end', () => resolve());

    stream.write(input);
    stream.end();
  });

  return result;
};

describe('CSV responses', () => {
  it('should return stringified array of objects', async () => {
    const url = '/csv';
    const testData = [
      { col1: 'a', col2: 'b' },
      { col1: 'a1', col2: 'b1' },
      { col1: 'a2', col2: 'b2' },
    ];

    app.get(
      url,
      handleResponse(() => new CSVResponse(testData)),
    );

    const response = await request(app).get(url).expect(200).expect('Content-Type', /csv/);
    const result = await parseCsv(response.text, true);

    expect(result).toEqual(testData);
  });

  it('should return stringified array of arrays', async () => {
    const url = '/csv2';
    const testData = [
      ['a', 'b'],
      ['a1', 'b1'],
      ['a2', 'b2'],
    ];

    app.get(
      url,
      handleResponse(() => new CSVResponse(testData)),
    );

    const response = await request(app).get(url).expect(200).expect('Content-Type', /csv/);
    const result = await parseCsv(response.text, false);

    expect(result).toEqual(testData);
  });

  it('should return stringified array of arrays2', async () => {
    const url = '/csv3';
    const testData = [
      ['a', 'b'],
      ['a1', 'b1'],
      ['a2', 'b2'],
    ];

    app.get(
      url,
      handleResponse(() => HttpResponse.csv(testData)),
    );

    const response = await request(app).get(url).expect(200).expect('Content-Type', /csv/);
    const result = await parseCsv(response.text, false);

    expect(result).toEqual(testData);
  });
});
