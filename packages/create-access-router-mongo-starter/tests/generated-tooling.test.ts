// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { runProcess } from './support/process-harness';
import { withTestWorkspace } from './support/temp-workspace';

const packageRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(packageRoot, '..', '..');
const templateRoot = resolve(packageRoot, 'template');

function readTemplate(relativePath: string): string {
  return readFileSync(resolve(templateRoot, relativePath), 'utf8');
}

function findFreePort(): Promise<number> {
  return new Promise((numberResolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address !== null && typeof address === 'object') numberResolve(address.port);
        else reject(new Error('Could not allocate a free port'));
      });
    });
  });
}

async function waitForMarker(port: number, expected: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastBody = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/marker`);
      lastBody = await response.text();
      if (response.ok && (JSON.parse(lastBody) as { marker: unknown }).marker === expected) return;
    } catch {
      lastBody = '';
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for marker ${JSON.stringify(expected)}; last body: ${lastBody}`);
}

describe('generated tooling contract (CARMSF-15)', () => {
  it('watches server-imported shared files with supported flags', () => {
    const manifest = JSON.parse(readTemplate('package.json')) as {
      engines: { node: string };
      scripts: Record<string, string>;
    };
    expect(manifest.engines.node).toBe('^22.13.0 || >=24.0.0');
    const serverScript = manifest.scripts.server;
    const watchFlag = serverScript.match(/--watch[=\s]([^\s]+)/)?.[1];
    expect(watchFlag, `server script: ${serverScript}`).toBeDefined();
    const watchPaths = watchFlag!.split(',');
    expect(watchPaths).toContain('./api');
    expect(watchPaths).toContain('./src/shared');
    expect(serverScript).toMatch(/--ext[=\s]ts/);
  });

  it('executes the Vite/Vitest node configuration from build and typecheck', () => {
    const manifest = JSON.parse(readTemplate('package.json')) as { scripts: Record<string, string> };
    for (const script of [manifest.scripts.build, manifest.scripts.typecheck]) {
      expect(script).toContain('tsc -p tsconfig.node.json');
    }
    const nodeConfig = JSON.parse(readTemplate('tsconfig.node.json')) as { include: string[] };
    expect(nodeConfig.include).toContain('vite.config.ts');
    expect(nodeConfig.include).toContain('vitest.config.ts');
    expect(nodeConfig.include.some((entry) => entry.includes('scripts/'))).toBe(false);
    const appConfig = JSON.parse(readTemplate('tsconfig.app.json')) as { exclude?: string[] };
    expect(appConfig.exclude ?? []).not.toContain('tests/deploy-shared.test.ts');
  });

  it('keeps shipped guidance free of stale ownership and placeholder examples', () => {
    const modelsSkill = readTemplate('.agents/skills/template-api-models-and-routers/SKILL.md');
    expect(modelsSkill).not.toContain('reuse `mongoose.models.*` when available');
    expect(modelsSkill).not.toContain('createRouters(');
    expect(modelsSkill).toContain('models: [...]');
    expect(modelsSkill).toContain('api/access-router.config.ts');

    const testingSkill = readTemplate('.agents/skills/template-testing-and-scaffolding/SKILL.md');
    expect(testingSkill).not.toContain('tests/deploy-shared.test.ts');
    expect(testingSkill).not.toContain('>=22.12.0');
    expect(testingSkill).toContain('tests/api-contract.test.ts');
    expect(testingSkill).toContain('tsconfig.node.json');

    const generatedReadme = readTemplate('README.md');
    expect(generatedReadme).toContain('^22.13.0 || >=24.0.0');
    expect(generatedReadme).toContain('pnpm exec create-access-router-mongo-starter-deploy-netlify --help');
    expect(generatedReadme).not.toContain('-- --help');
    // DEPLOY-04: API-only deploys need no `netlify` binary.
    expect(generatedReadme).not.toContain('netlify-cli');

    const websiteDoc = readFileSync(
      resolve(workspaceRoot, 'website', 'docs', 'packages', 'create-access-router-mongo-starter.md'),
      'utf8',
    );
    expect(websiteDoc).toContain('^22.13.0 || >=24.0.0');
    expect(websiteDoc).not.toContain('>=22.12.0');
    expect(websiteDoc).toContain('percent-encoded');
  });

  it('keeps the publication example in agreement with the VERSION guard', () => {
    const packageReadme = readFileSync(resolve(packageRoot, 'README.md'), 'utf8');
    expect(packageReadme).not.toContain('v0.0.0-test');
    const repositoryVersion = readFileSync(resolve(workspaceRoot, 'VERSION'), 'utf8').trim();
    const exampleVersions = [...packageReadme.matchAll(/--version\s+(v\$\([^)]*\)|\S+)/g)].map((match) => match[1]);
    expect(exampleVersions.length).toBeGreaterThan(0);
    for (const example of exampleVersions) {
      if (example.includes('$(')) {
        // `v$(cat VERSION)` always expands to the guarded value at run time.
        expect(example).toContain('cat VERSION');
      } else {
        expect(example.replace(/^v/, '')).toBe(repositoryVersion);
      }
    }
  });

  it('fails the node-configuration check on an invalid Vite/Vitest fixture', async () => {
    await withTestWorkspace((workspace) => {
      const fixtureDir = join(workspace.root, 'node-config-fixture');
      mkdirSync(join(fixtureDir, 'src', 'shared'), { recursive: true });
      copyFileSync(resolve(templateRoot, 'vite.config.ts'), join(fixtureDir, 'vite.config.ts'));
      copyFileSync(resolve(templateRoot, 'vitest.config.ts'), join(fixtureDir, 'vitest.config.ts'));
      copyFileSync(
        resolve(templateRoot, 'src', 'shared', 'normalize-api-base-url.ts'),
        join(fixtureDir, 'src', 'shared', 'normalize-api-base-url.ts'),
      );
      // The pristine copies must pass the same include list the template
      // ships. Bare third-party imports are satisfied by hermetic `any`
      // stubs (full module resolution is covered by the generated
      // `pnpm typecheck` in the packed consumer); the `node` shim keeps the
      // configs checkable without `@types/node` on disk.
      writeFileSync(
        join(fixtureDir, 'node-shim.d.ts'),
        "declare const process: any;\ndeclare const __dirname: string;\ndeclare module 'path' {\n  const path: any;\n  export default path;\n}\n",
      );
      const stubPackage = (name: string, types: string, pkg?: Record<string, unknown>) => {
        const dir = join(fixtureDir, 'node_modules', ...name.split('/'));
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          join(dir, 'package.json'),
          JSON.stringify({ name, version: '0.0.0', type: 'module', types: './index.d.ts', ...pkg }, null, 2),
        );
        writeFileSync(join(dir, 'index.d.ts'), types);
      };
      stubPackage(
        'vite',
        'export declare function defineConfig(config: (env: { mode: string; command: string }) => Record<string, unknown>): Record<string, unknown>;\nexport declare function loadEnv(mode: string, cwd: string, prefix: string): Record<string, string>;\n',
      );
      stubPackage('vitest', 'export declare const describe: any;\n', {
        exports: { '.': './index.d.ts', './config': './config.d.ts' },
      });
      writeFileSync(
        join(fixtureDir, 'node_modules', 'vitest', 'config.d.ts'),
        'export declare const defineConfig: any;\n',
      );
      stubPackage('@vitejs/plugin-react', 'declare const react: any;\nexport default react;\n');
      stubPackage('@tailwindcss/vite', 'declare const tailwindcss: any;\nexport default tailwindcss;\n');
      writeFileSync(
        join(fixtureDir, 'tsconfig.check.json'),
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'ESNext',
              moduleResolution: 'bundler',
              strict: true,
              noEmit: true,
              skipLibCheck: true,
            },
            include: ['vite.config.ts', 'vitest.config.ts', 'node-shim.d.ts'],
          },
          null,
          2,
        ),
      );
      const tsc = resolve(packageRoot, 'node_modules', '.bin', 'tsc');
      const pristine = runProcess(tsc, ['-p', 'tsconfig.check.json'], { cwd: fixtureDir });
      expect(pristine.status, `${pristine.stdout}\n${pristine.stderr}`).toBe(0);

      writeFileSync(
        join(fixtureDir, 'vitest.config.ts'),
        `${readFileSync(join(fixtureDir, 'vitest.config.ts'), 'utf8')}\nconst invalidFixtureMarker: number = 'must-fail-typecheck';\n`,
      );
      const corrupted = runProcess(tsc, ['-p', 'tsconfig.check.json'], { cwd: fixtureDir });
      expect(corrupted.status).not.toBe(0);
      expect(`${corrupted.stdout}\n${corrupted.stderr}`).toContain('vitest.config.ts');
      expect(`${corrupted.stdout}\n${corrupted.stderr}`).toContain('TS2322');
    }, 'carms-tooling-');
  }, 120_000);

  it('reloads backend behavior when a shared file changes under watch', async () => {
    await withTestWorkspace(async (workspace) => {
      const fixtureDir = join(workspace.root, 'watch-smoke');
      const apiDir = join(fixtureDir, 'api');
      const sharedDir = join(fixtureDir, 'shared');
      mkdirSync(apiDir, { recursive: true });
      mkdirSync(sharedDir, { recursive: true });
      writeFileSync(join(apiDir, 'routes.ts'), 'export const API_NOTE = "api-root";\n');
      writeFileSync(join(sharedDir, 'marker.ts'), 'export const MARKER = "v1";\n');
      const runtimeEntry = resolve(workspaceRoot, 'packages', 'access-router-runtime', 'dist', 'index.mjs');
      writeFileSync(
        join(fixtureDir, 'runtime.config.ts'),
        [
          `import { defineRuntimeConfig } from ${JSON.stringify(runtimeEntry)};`,
          "import { MARKER } from './shared/marker';",
          'export default defineRuntimeConfig({',
          '  models: [],',
          '  rootRouter: false,',
          '  express: {',
          '    finalize(app) {',
          "      app.get('/marker', (_req, res) => {",
          '        res.json({ marker: MARKER });',
          '      });',
          '    },',
          '  },',
          '});',
          '',
        ].join('\n'),
      );

      const port = await findFreePort();
      const cli = resolve(workspaceRoot, 'packages', 'access-router-runtime', 'dist', 'cli.js');
      const child: ChildProcess = spawn(
        process.execPath,
        [
          cli,
          join(fixtureDir, 'runtime.config.ts'),
          '--watch',
          `${apiDir},${sharedDir}`,
          '--ext',
          'ts',
          '--delay',
          '0',
          '--port',
          String(port),
        ],
        { cwd: fixtureDir, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let childOutput = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        childOutput += chunk.toString();
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        childOutput += chunk.toString();
      });
      try {
        // Uses the same supported flag shapes as the template `pnpm server`
        // script (comma-separated `--watch` roots plus `--ext ts`).
        await waitForMarker(port, 'v1', 90_000);
        writeFileSync(join(sharedDir, 'marker.ts'), 'export const MARKER = "v2";\n');
        await waitForMarker(port, 'v2', 90_000);
      } finally {
        child.kill('SIGTERM');
        await new Promise<void>((done) => {
          const timer = setTimeout(() => done(), 10_000);
          timer.unref?.();
          child.once('exit', () => {
            clearTimeout(timer);
            done();
          });
        });
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }
      expect(childOutput).not.toContain('MARKER');
    }, 'carms-watch-');
  }, 240_000);
});
