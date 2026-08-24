import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '..', '..');
const require = createRequire(import.meta.url);
const tempDirs: string[] = [];
const TSC_PATH = ['node_modules', 'typescript', 'bin', 'tsc'];

type Link = { kind: 'pkg'; name: string } | { kind: 'scoped'; scope: string; name: string };

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function stageConsumerDir(): string {
  const consumerDir = mkdtempSync(path.join(os.tmpdir(), 'access-router-runtime-arrt09-consumer-'));
  tempDirs.push(consumerDir);

  const consumerPkgRoot = path.join(consumerDir, 'node_modules', '@web-ts-toolkit', 'access-router-runtime');
  mkdirSync(consumerPkgRoot, { recursive: true });
  cpSync(path.resolve(packageRoot, 'dist'), path.resolve(consumerPkgRoot, 'dist'), { recursive: true });
  cpSync(path.resolve(packageRoot, 'package.json'), path.resolve(consumerPkgRoot, 'package.json'));

  const hoistedDirs = [path.join(packageRoot, 'node_modules'), path.join(workspaceRoot, 'node_modules')];
  const getLinkPackageName = (link: Link): string => (link.kind === 'pkg' ? link.name : `${link.scope}/${link.name}`);
  const getLinkPath = (base: string, link: Link): string =>
    link.kind === 'pkg' ? path.join(base, link.name) : path.join(base, link.scope, link.name);
  const getResolvedPackagePath = (link: Link): string | undefined => {
    if (link.kind === 'scoped' && link.scope === '@web-ts-toolkit') {
      const workspacePackagePath = path.join(workspaceRoot, 'packages', link.name);
      if (existsSync(workspacePackagePath)) {
        return workspacePackagePath;
      }
    }

    try {
      return path.dirname(require.resolve(`${getLinkPackageName(link)}/package.json`));
    } catch {
      return undefined;
    }
  };
  const ensure = (link: Link): boolean => {
    const resolvedPath = getResolvedPackagePath(link);
    for (const base of hoistedDirs) {
      const realPath = getLinkPath(base, link);
      if (!existsSync(realPath)) continue;

      const symlinkPath = getLinkPath(path.join(consumerDir, 'node_modules'), link);
      mkdirSync(path.dirname(symlinkPath), { recursive: true });
      if (!existsSync(symlinkPath)) {
        symlinkSync(realPath, symlinkPath, 'dir');
      }
      return true;
    }

    if (resolvedPath) {
      const symlinkPath = getLinkPath(path.join(consumerDir, 'node_modules'), link);
      mkdirSync(path.dirname(symlinkPath), { recursive: true });
      if (!existsSync(symlinkPath)) {
        symlinkSync(resolvedPath, symlinkPath, 'dir');
      }
      return true;
    }

    return false;
  };

  const required: Link[] = [
    { kind: 'pkg', name: 'express' },
    { kind: 'pkg', name: 'mongoose' },
    { kind: 'pkg', name: 'typescript' },
    { kind: 'pkg', name: 'zod' },
    { kind: 'pkg', name: 'just-diff' },
    { kind: 'pkg', name: 'sift' },
    { kind: 'pkg', name: 'winston' },
    { kind: 'pkg', name: 'mongoose-schema-jsonschema' },
    { kind: 'scoped', scope: '@web-ts-toolkit', name: 'access-router' },
    { kind: 'scoped', scope: '@web-ts-toolkit', name: 'express-runtime' },
    { kind: 'scoped', scope: '@web-ts-toolkit', name: 'utils' },
    { kind: 'scoped', scope: '@web-ts-toolkit', name: 'express-json-router' },
    { kind: 'scoped', scope: '@types', name: 'node' },
    { kind: 'scoped', scope: '@types', name: 'express' },
  ];

  for (const link of required) {
    if (!ensure(link)) {
      throw new Error(`ARRT-09 consumer stage failed: missing dependency ${JSON.stringify(link)}`);
    }
  }

  return consumerDir;
}

function run(cmd: string, args: string[], cwd: string): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const error = err as { status?: number; stdout?: string; stderr?: string; message?: string };
    return {
      status: error.status ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message ?? '',
    };
  }
}

describe('ARRT-09 strict installed-consumer types', () => {
  let consumerDir: string;

  beforeAll(() => {
    consumerDir = stageConsumerDir();
  });

  it('preserves readonly context, registry inference, app-helper restrictions, and serverless generics', () => {
    const sourceFile = path.resolve(consumerDir, 'strict-consumer.ts');
    const tsconfigPath = path.resolve(consumerDir, 'tsconfig.strict-consumer.json');
    const snippet = `
      import mongoose from 'mongoose';
      import {
        createAccessRouterRuntime,
        createAccessRouterRuntimeApp,
        createAccessRouterRuntimeServerlessHandler,
        defineRuntimeConfig,
        type AccessRouterRuntimeAppConfig,
      } from '@web-ts-toolkit/access-router-runtime';
      import type { ServerlessHandler } from '@web-ts-toolkit/express-runtime';

      type User = { name: string; role: 'user' | 'admin' };
      type Status = { id: string; healthy: boolean };
      type ProviderEvent = { rawPath: string; headers: Record<string, string> };
      type ProviderContext = { requestId: string };

      const userSchema = new mongoose.Schema<User>({
        name: { type: String, required: true },
        role: { type: String, required: true },
      });

      const appConfig = defineRuntimeConfig({
        models: [
          {
            name: 'User' as const,
            schema: userSchema,
            router: { operationAccess: false },
          },
        ],
        data: [
          {
            name: 'status' as const,
            router: {
              idField: 'id',
              operationAccess: false,
              data: [{ id: 'ok', healthy: true }] satisfies Status[],
            },
          },
        ],
      } satisfies AccessRouterRuntimeAppConfig);

      const runtime = createAccessRouterRuntime(appConfig);
      const userModel: mongoose.Model<User> = runtime.models.User;
      const modelRouterName: string = runtime.modelRouters[0]!.modelName;
      const dataRouterName: string = runtime.dataRouters[0]!.dataName;

      // @ts-expect-error runtime-owned model registry is readonly
      runtime.models.User = userModel;

      // @ts-expect-error runtime-owned model router collection is readonly
      runtime.modelRouters.push(runtime.modelRouters[0]!);

      // @ts-expect-error runtime-owned data router collection is readonly
      runtime.dataRouters.push(runtime.dataRouters[0]!);

      // @ts-expect-error public context config is a readonly snapshot
      runtime.config.models = [];

      const app = createAccessRouterRuntimeApp(appConfig);
      const handler: ServerlessHandler<ProviderEvent, ProviderContext> = runtime.createServerlessHandler<
        ProviderEvent,
        ProviderContext
      >({
        request(_req, event, context) {
          const rawPath: string = event.rawPath;
          const requestId: string = context.requestId;

          // @ts-expect-error provider event generic must not be erased
          const missing: string = event.missing;
          void [rawPath, requestId, missing];
        },
      });
      const helperHandler = createAccessRouterRuntimeServerlessHandler<ProviderEvent, ProviderContext>(appConfig, {
        response(_res, event, context) {
          const rawPath: string = event.rawPath;
          const requestId: string = context.requestId;
          void [rawPath, requestId];
        },
      });

      void handler({ rawPath: '/ok', headers: {} }, { requestId: 'req-1' });

      // @ts-expect-error handler context generic must be enforced
      void handler({ rawPath: '/ok', headers: {} }, {});

      // @ts-expect-error app helper rejects config-owned lifecycle hooks
      createAccessRouterRuntimeApp(defineRuntimeConfig({ init() {} }));

      // @ts-expect-error app helper rejects DB lifecycle config
      createAccessRouterRuntimeApp(defineRuntimeConfig({ db: { url: 'mongodb://127.0.0.1:27017/app' } }));

      void [app, helperHandler, userModel, modelRouterName, dataRouterName];
    `;

    writeFileSync(sourceFile, snippet);
    writeFileSync(
      tsconfigPath,
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            strict: true,
            noImplicitAny: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            noEmit: true,
            skipLibCheck: false,
            esModuleInterop: true,
            types: ['node'],
            lib: ['ES2022', 'DOM'],
          },
          include: ['strict-consumer.ts'],
        },
        null,
        2,
      ),
    );

    const tscAbsPath = path.resolve(consumerDir, ...TSC_PATH);
    const result = run('node', [tscAbsPath, '-p', tsconfigPath, '--noEmit'], consumerDir);

    if (result.status !== 0) {
      throw new Error(`ARRT-09 strict consumer compile failed:\n${result.stdout}${result.stderr}`);
    }

    expect(result.status).toBe(0);
  }, 30000);
});
