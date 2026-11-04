import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '..', '..');
let consumer: string;

beforeAll(() => {
  consumer = mkdtempSync(path.join(os.tmpdir(), 'access-router-noa01-consumer-'));
  const destination = path.join(consumer, 'node_modules/@web-ts-toolkit/access-router');
  mkdirSync(destination, { recursive: true });
  cpSync(path.join(packageRoot, 'package.json'), path.join(destination, 'package.json'));
  cpSync(path.join(packageRoot, 'dist'), path.join(destination, 'dist'), { recursive: true });
  for (const name of [
    'typescript',
    'mongoose',
    'express',
    'zod',
    'just-diff',
    'sift',
    'winston',
    'mongoose-schema-jsonschema',
    '@types/node',
    '@types/express',
    '@web-ts-toolkit/utils',
    '@web-ts-toolkit/express-json-router',
  ]) {
    const source = [packageRoot, workspaceRoot].map((root) => path.join(root, 'node_modules', name)).find(existsSync);
    if (!source) throw new Error(`NOA-01 consumer dependency unavailable: ${name}`);
    const link = path.join(consumer, 'node_modules', name);
    mkdirSync(path.dirname(link), { recursive: true });
    symlinkSync(source, link, 'dir');
  }
});
afterAll(() => {
  if (consumer) rmSync(consumer, { recursive: true, force: true });
});

function compile(file: string, module: string, moduleResolution: string, positive: boolean) {
  writeFileSync(
    path.join(consumer, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module,
        moduleResolution,
        strict: true,
        noEmit: true,
        noUnusedLocals: positive,
        noUnusedParameters: positive,
        skipLibCheck: false,
        esModuleInterop: true,
        types: ['node'],
      },
      files: [file],
    }),
  );
  try {
    return {
      status: 0,
      output: execFileSync('node', [path.join(consumer, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], {
        cwd: consumer,
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    return { status: failure.status, output: failure.stdout + failure.stderr };
  }
}

describe('NOA-01 installed declaration consumers (no source aliases)', () => {
  it.each([
    ['Bundler', 'ESNext', 'ts'],
    ['NodeNext', 'NodeNext', 'mts'],
    ['NodeNext', 'NodeNext', 'cts'],
  ])('checks positive nested API and real negative diagnostics (%s/%s/%s)', (resolution, module, extension) => {
    const positive = `positive.${extension}`;
    writeFileSync(
      path.join(consumer, positive),
      readFileSync(path.join(packageRoot, 'test/nested-operation-access-consumer.types.fixture.ts')),
    );
    const allowed = compile(positive, module, resolution, true);
    expect(allowed.output).toBe('');
    expect(allowed.status).toBe(0);

    const negative = `negative.${extension}`;
    const source = readFileSync(
      path.join(packageRoot, 'test/nested-operation-access.invalid.types.fixture.ts'),
      'utf8',
    );
    writeFileSync(path.join(consumer, negative), source);
    const denied = compile(negative, module, resolution, false);
    expect(denied.status).not.toBe(0);
    const expectedLines = source
      .split('\n')
      .flatMap((line, index) => (line.startsWith('// @error ') ? [index + 2] : []));
    const diagnostics = [...denied.output.matchAll(/negative\.(?:ts|mts|cts)\((\d+),\d+\): error TS\d+:/g)].map(
      (match) => Number(match[1]),
    );
    expect(
      [...new Set(diagnostics)].sort((a, b) => a - b),
      denied.output,
    ).toEqual(expectedLines);
    expect(denied.output).not.toMatch(/node_modules.*error TS/);
  });
});
