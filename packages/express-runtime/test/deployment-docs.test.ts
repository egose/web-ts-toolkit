import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildRuntime, buildServerless } from '../src/cli-utils';

const packageRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '..', '..');
const tempRoots: string[] = [];

function trackTempRoot(dir: string): string {
  tempRoots.push(dir);
  return dir;
}

function run(command: string, args: string[], cwd: string): string {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    const caught = error as { stdout?: string; stderr?: string; status?: number; message?: string };
    const detail = [caught.stdout, caught.stderr].filter(Boolean).join('\n');
    throw new Error(
      `Command failed: ${command} ${args.join(' ')} (cwd: ${cwd}, status: ${caught.status})\n${detail}\n${caught.message ?? ''}`,
      { cause: error },
    );
  }
}

afterAll(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop() as string, { recursive: true, force: true });
  }
});

describe('ERT-B15 deployment and hover documentation', () => {
  it('documents the actual mandatory externals and deployment dependencies', () => {
    const readme = readFileSync(path.resolve(packageRoot, 'README.md'), 'utf8');
    const websiteDoc = readFileSync(path.resolve(workspaceRoot, 'website/docs/packages/express-runtime.md'), 'utf8');

    for (const [label, doc] of [
      ['README', readme],
      ['website', websiteDoc],
    ] as const) {
      expect(doc, `${label} must name both mandatory externals`).toContain(
        '@web-ts-toolkit/express-runtime` are always external',
      );
      expect(doc, `${label} must tell deployments to install both`).toContain('express');
      expect(doc, `${label} must note serverless-http ships with the runtime`).toContain('serverless-http');
      expect(doc, `${label} must not claim only express is external`).not.toContain('`express` is always external');
      expect(doc, `${label} must not claim only express remains external`).not.toContain('only Express');
    }
  });

  it('documents qualified provider, adapter, and memory contracts without stale claims', () => {
    const readme = readFileSync(path.resolve(packageRoot, 'README.md'), 'utf8');
    const websiteDoc = readFileSync(path.resolve(workspaceRoot, 'website/docs/packages/express-runtime.md'), 'utf8');

    for (const [label, doc] of [
      ['README', readme],
      ['website', websiteDoc],
    ] as const) {
      expect(doc, `${label} must qualify the provider surface`).toMatch(/aws.*azure|azure.*aws/);
      expect(doc, `${label} must state the local adapter is AWS REST v1 only`).toContain('AWS API Gateway REST API v1');
      expect(doc, `${label} must qualify peak memory`).toContain('small multiple of the limit');
      expect(doc, `${label} must not promise an exact memory ceiling`).not.toContain(
        'Memory retained is at most the limit plus',
      );
      expect(doc, `${label} must not annotate the handler with a platform Handler type`).not.toContain(
        'export const handler: Handler',
      );
      expect(doc, `${label} must state the verbatim path contract`).toContain('preserved verbatim');
    }
    expect(readme).toContain('base64');
  });

  it('emits installed hover docs that agree with the implementation', () => {
    const indexDecl = readFileSync(path.resolve(packageRoot, 'dist/index.d.mts'), 'utf8');
    const cliDecl = readFileSync(path.resolve(packageRoot, 'dist/cli-api.d.mts'), 'utf8');

    expect(indexDecl).not.toContain('Works with Netlify, Vercel');
    expect(indexDecl).toMatch(/not tested against Netlify/);
    expect(indexDecl).toMatch(/'aws'.*'azure'|'azure'.*'aws'/);

    expect(cliDecl).not.toContain('passed as a Buffer');
    expect(cliDecl).not.toContain('#305 workaround');
    expect(cliDecl).toContain('base64-encoded into the AWS v1 string');
    expect(cliDecl).toContain('@web-ts-toolkit/express-runtime` are always external');
  });

  it('executes generated local/serverless bundles in an isolated fixture with only the documented deps', async () => {
    const projectDir = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'ert-b15-project-')));
    const previousCwd = process.cwd();

    writeFileSync(
      path.resolve(projectDir, 'app.mjs'),
      `import { createExpressApp } from '@web-ts-toolkit/express-runtime';
import express from 'express';

const router = express.Router();
router.get('/hello', (_req, res) => res.json({ ok: true, deploy: 'ert-b15' }));

const app = createExpressApp({ routers: [{ path: '/api', handler: router }] });

export default app;
`,
    );

    process.chdir(projectDir);
    try {
      await buildRuntime({
        appPath: './app.mjs',
        outDir: './dist-local',
        outName: 'app',
        format: 'cjs',
        target: 'node22',
        external: [],
        clean: false,
      });
      await buildServerless({
        appPath: './app.mjs',
        outDir: './dist-serverless',
        outName: 'handler',
        format: 'cjs',
        target: 'node22',
        external: [],
        clean: false,
      });
    } finally {
      process.chdir(previousCwd);
    }

    const localBundle = readFileSync(path.resolve(projectDir, 'dist-local/app.js'), 'utf8');
    const serverlessBundle = readFileSync(path.resolve(projectDir, 'dist-serverless/handler.js'), 'utf8');
    for (const [label, code] of [
      ['local', localBundle],
      ['serverless', serverlessBundle],
    ] as const) {
      expect(code, `${label} bundle must keep express external`).toContain('express');
      expect(code, `${label} bundle must keep the runtime package external`).toContain(
        '@web-ts-toolkit/express-runtime',
      );
      expect(code, `${label} bundle must not inline the runtime implementation`).not.toContain(
        'Serverless cold start: running init',
      );
    }

    const sourceManifest = JSON.parse(readFileSync(path.resolve(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const stageDir = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'ert-b15-stage-')));
    cpSync(path.resolve(packageRoot, 'dist'), stageDir, { recursive: true });
    for (const entry of ['README.md']) {
      cpSync(path.resolve(packageRoot, entry), path.resolve(stageDir, entry));
    }
    cpSync(path.resolve(workspaceRoot, 'LICENSE'), path.resolve(stageDir, 'LICENSE'));
    writeFileSync(
      path.resolve(stageDir, 'package.json'),
      `${JSON.stringify(
        {
          name: '@web-ts-toolkit/express-runtime',
          version: '9.9.9-ert15',
          main: './index.js',
          module: './index.mjs',
          types: './index.d.ts',
          exports: {
            '.': {
              types: { import: './index.d.mts', require: './index.d.ts', default: './index.d.ts' },
              import: './index.mjs',
              require: './index.js',
              default: './index.js',
            },
            './cli': {
              types: { import: './cli-api.d.mts', require: './cli-api.d.ts', default: './cli-api.d.ts' },
              import: './cli-api.mjs',
              require: './cli-api.js',
              default: './cli-api.js',
            },
          },
          dependencies: sourceManifest.dependencies,
          peerDependencies: sourceManifest.peerDependencies,
          engines: { node: '>=22' },
        },
        null,
        2,
      )}\n`,
    );
    const tarball = run('pnpm', ['pack', '--pack-destination', projectDir], stageDir).trim();
    const tarballPath = path.resolve(stageDir, tarball.split('\n').pop() as string);
    expect(existsSync(tarballPath)).toBe(true);

    const fixtureDir = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'ert-b15-deploy-')));
    writeFileSync(
      path.resolve(fixtureDir, 'package.json'),
      `${JSON.stringify(
        {
          name: 'ert-b15-deploy',
          private: true,
          type: 'module',
          dependencies: {
            '@web-ts-toolkit/express-runtime': `file:${tarballPath}`,
            express: sourceManifest.peerDependencies?.express ?? '>=5.0.0',
          },
        },
        null,
        2,
      )}\n`,
    );
    run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], fixtureDir);

    cpSync(path.resolve(projectDir, 'dist-local/app.js'), path.resolve(fixtureDir, 'local-bundle.cjs'));
    cpSync(path.resolve(projectDir, 'dist-serverless/handler.js'), path.resolve(fixtureDir, 'serverless-bundle.cjs'));

    writeFileSync(
      path.resolve(fixtureDir, 'run-local.mjs'),
      `import assert from 'node:assert/strict';
import { startLocalServer } from '@web-ts-toolkit/express-runtime';
import bundle from './local-bundle.cjs';

const app = bundle?.default ?? bundle?.app ?? bundle;
const local = startLocalServer(app, { port: 0, host: '127.0.0.1', signals: false });
await local.ready;
const port = local.server.address().port;
try {
  const res = await fetch(\`http://127.0.0.1:\${port}/api/hello\`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, deploy: 'ert-b15' });
} finally {
  await local.shutdown();
}
console.log('ERT-B15 local bundle OK');
`,
    );
    writeFileSync(
      path.resolve(fixtureDir, 'run-serverless.mjs'),
      `import assert from 'node:assert/strict';
import bundle from './serverless-bundle.cjs';

const handler = bundle?.handler ?? bundle?.default ?? bundle;
const result = await handler(
  {
    httpMethod: 'GET',
    path: '/api/hello',
    headers: {},
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    body: '',
    isBase64Encoded: false,
    requestContext: { identity: { sourceIp: '' } },
  },
  {},
);
assert.equal(result.statusCode, 200);
assert.match(result.body, /ert-b15/);
console.log('ERT-B15 serverless bundle OK');
`,
    );

    expect(run('node', ['run-local.mjs'], fixtureDir)).toContain('ERT-B15 local bundle OK');
    expect(run('node', ['run-serverless.mjs'], fixtureDir)).toContain('ERT-B15 serverless bundle OK');
  }, 240_000);
});
