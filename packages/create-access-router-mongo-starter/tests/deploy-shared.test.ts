// @vitest-environment node
import { mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  cleanupSandbox,
  buildArtifacts,
  createChildEnvironment,
  resolvePaths,
  bail,
  BailError,
  SHARED_DEFAULTS,
  SOURCE_DIR,
  redactCommand,
  run,
  collectSecrets,
  EPHEMERAL_ROOT,
  inspectArtifacts,
  runSharedCli,
  SHARED_HELP,
  validateSharedDeployOptions,
  type SharedDeployOptions,
} from '../scripts/deploy-shared';
import { HELP as NETLIFY_HELP } from '../scripts/deploy-netlify';
import { withTestWorkspace } from './support/temp-workspace';

function repoOptions(overrides: Partial<SharedDeployOptions> = {}): SharedDeployOptions {
  return { ...SHARED_DEFAULTS, ...overrides };
}

describe('SHARED_DEFAULTS', () => {
  it('has sensible defaults', () => {
    expect(SHARED_DEFAULTS.distDir).toBe('dist');
    expect(SHARED_DEFAULTS.functionsDir).toBe('netlify/functions');
    expect(SHARED_DEFAULTS.functionsName).toBe('main');
    expect(SHARED_DEFAULTS.dryRun).toBe(false);
    expect(SHARED_DEFAULTS.ephemeral).toBe(false);
    expect(SHARED_DEFAULTS.noBuild).toBe(false);
  });
});

describe('validateSharedDeployOptions', () => {
  it.each([undefined, '', '   '])('requires Mongo configuration for every backend deployment: %j', (mongodbUri) => {
    expect(() => validateSharedDeployOptions(repoOptions({ mongodbUri }))).toThrow(
      'required because every deployment includes the serverless backend',
    );
  });

  // MongoDB connection-grammar matrix (CARMSF-13). This matrix mirrors
  // `template/tests/api-contract.test.ts`; both validators share the grammar
  // in `template/src/shared/mongo-connection-string.ts`, so the two lists
  // must stay aligned. No case here needs a database connection.
  const MONGO_ACCEPT = [
    'mongodb://127.0.0.1:27017/app',
    'mongodb://db-a:27017,db-b:27017/app?replicaSet=rs0',
    'mongodb://user:pass@db-a:27017,db-b:27017/app?replicaSet=rs0&authSource=admin', // pragma: allowlist secret
    'mongodb://[::1]:27017/app',
    'mongodb://[2001:db8::1]:27017,[2001:db8::2]:27017/app?replicaSet=rs0',
    'mongodb://localhost/app',
    'mongodb+srv://cluster.example.test/app',
    'mongodb+srv://user:pass@cluster.example.test/app?retryWrites=true', // pragma: allowlist secret
  ];
  const MONGO_REJECT = [
    'https://example.test/db',
    'mongodb://',
    'mongodb+srv://host:27017/db',
    'mongodb://host/db name',
    'mongodb+srv://h1,h2/db',
    'mongodb://host1,,host2/db',
    'mongodb://host:99999/db',
    'mongodb://[::1/db',
    'mongodb://::1:27017/db',
    'mongodb://@host/db',
    'mongodb://host/db?opt#frag',
    'mongodb://host/db?',
    'mongodb+srv://[::1]/db',
  ];

  it.each(MONGO_ACCEPT)('accepts supported Mongo connection grammar: %j', (mongodbUri) => {
    expect(validateSharedDeployOptions(repoOptions({ mongodbUri })).mongodbUri).toBe(mongodbUri);
  });

  it.each(MONGO_REJECT)('rejects malformed Mongo configuration without echoing it: %j', (mongodbUri) => {
    let message = '';
    try {
      validateSharedDeployOptions(repoOptions({ mongodbUri }));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe('--mongodb-uri or MONGODB_URI must be a valid MongoDB connection string.');
    const remainder = mongodbUri.replace(/^mongodb(\+srv)?:\/\//u, '');
    if (remainder) expect(message).not.toContain(remainder);
  });

  it.each(['https://example.test/db', 'mongodb://', 'mongodb+srv://host:27017/db', 'mongodb://host/db name'])(
    'rejects malformed Mongo configuration without echoing it: %j',
    (mongodbUri) => {
      expect(() => validateSharedDeployOptions(repoOptions({ mongodbUri }))).toThrow(
        '--mongodb-uri or MONGODB_URI must be a valid MongoDB connection string.',
      );
    },
  );

  it('normalizes a valid Mongo URI', () => {
    expect(validateSharedDeployOptions(repoOptions({ mongodbUri: '  mongodb://localhost/app  ' })).mongodbUri).toBe(
      'mongodb://localhost/app',
    );
  });

  it.each([
    'https://example.test/api',
    '//example.test/api',
    'api',
    '/',
    '/api?version=1',
    '/api#fragment',
    '/api\\todos',
    '/api/./todos',
    '/api/../todos',
    '/api/:version',
    '/api/*',
    '/api(x)',
    '/api%41',
  ])('rejects a non-path-only API base before deployment: %s', (apiBaseUrl) => {
    expect(() => validateSharedDeployOptions(repoOptions({ apiBaseUrl }))).toThrow('--api-base-url');
  });

  it('normalizes the deployed API prefix once for every build target', () => {
    expect(
      validateSharedDeployOptions({
        ...repoOptions({ apiBaseUrl: '  /functions/main/  ' }),
        mongodbUri: 'mongodb://localhost/app',
      }).apiBaseUrl,
    ).toBe('/functions/main');
  });

  it.each(['dist\n[[redirects]]', 'functions\rnext', 'path\0suffix'])(
    'rejects output paths containing control characters: %j',
    (value) => {
      expect(() => resolvePaths(repoOptions({ sandboxDir: '/tmp/sandbox', distDir: value }))).toThrow(
        'control characters',
      );
    },
  );
});

describe('resolvePaths', () => {
  it('resolves to SOURCE_DIR in repo mode', () => {
    const paths = resolvePaths(repoOptions());
    expect(paths.deployDir).toBe(SOURCE_DIR);
    expect(paths.isEphemeral).toBe(false);
    expect(paths.distAbs).toBe(`${SOURCE_DIR}/dist`);
    expect(paths.functionsAbs).toBe(`${SOURCE_DIR}/netlify/functions`);
  });

  it('respects custom dist/functions dirs in repo mode', () => {
    const paths = resolvePaths(repoOptions({ distDir: 'build', functionsDir: 'functions' }));
    expect(paths.distAbs).toBe(`${SOURCE_DIR}/build`);
    expect(paths.functionsAbs).toBe(`${SOURCE_DIR}/functions`);
  });

  it('throws when --ephemeral and --sandbox-dir are both set', () => {
    expect(() => resolvePaths(repoOptions({ ephemeral: true, sandboxDir: '/tmp/some-dir' }))).toThrow();
  });

  it('creates sandbox dir and returns contained non-ephemeral paths', async () => {
    await withTestWorkspace((workspace) => {
      mkdirSync(join(workspace.sandbox, 'node_modules'));
      const paths = resolvePaths(
        repoOptions({ sandboxDir: workspace.sandbox, distDir: 'web/build', functionsDir: 'server/functions' }),
      );
      expect(paths.isEphemeral).toBe(false);
      expect(paths.deployDir).toBe(workspace.sandbox);
      expect(paths.distAbs).toBe(join(workspace.sandbox, 'web/build'));
      expect(paths.functionsAbs).toBe(join(workspace.sandbox, 'server/functions'));
    });
  });

  it.each([
    ['absolute', (outside: string) => outside],
    ['Windows absolute', () => 'C:\\outside'],
    ['traversal', () => '../outside'],
    ['nested traversal', () => 'nested/../../outside'],
    ['sandbox root', () => '.'],
    ['empty', () => '   '],
  ])('rejects %s output paths before an outside sentinel can change', async (_label, outputPath) => {
    await withTestWorkspace((workspace) => {
      mkdirSync(join(workspace.sandbox, 'node_modules'));
      const sentinel = join(workspace.target, 'sentinel.txt');
      writeFileSync(sentinel, 'safe');

      for (const outputKey of ['distDir', 'functionsDir'] as const) {
        expect(() =>
          resolvePaths(repoOptions({ sandboxDir: workspace.sandbox, [outputKey]: outputPath(workspace.target) })),
        ).toThrow();
      }
      expect(readFileSync(sentinel, 'utf8')).toBe('safe');
    });
  });

  it('rejects frontend and function output paths that escape through a symlink', async () => {
    await withTestWorkspace((workspace) => {
      mkdirSync(join(workspace.sandbox, 'node_modules'));
      const sentinel = join(workspace.target, 'sentinel.txt');
      writeFileSync(sentinel, 'safe');
      symlinkSync(workspace.target, join(workspace.sandbox, 'escape'), 'dir');

      for (const outputKey of ['distDir', 'functionsDir'] as const) {
        expect(() =>
          resolvePaths(repoOptions({ sandboxDir: workspace.sandbox, [outputKey]: 'escape/output' })),
        ).toThrow('strictly inside');
      }
      expect(readFileSync(sentinel, 'utf8')).toBe('safe');
    });
  });

  it('uses a package-specific mkdtemp directory under the platform temp root', () => {
    const paths = resolvePaths(repoOptions({ ephemeral: true }));
    try {
      expect(EPHEMERAL_ROOT).toBe(tmpdir());
      expect(relative(tmpdir(), paths.deployDir)).toMatch(/^create-access-router-mongo-starter-deploy-/u);
      expect(isAbsolute(paths.deployDir)).toBe(true);
    } finally {
      cleanupSandbox(paths, false, false);
    }
  });

  it('refuses to follow a replaced ephemeral sandbox symlink during cleanup', async () => {
    await withTestWorkspace((workspace) => {
      const paths = resolvePaths(repoOptions({ ephemeral: true }));
      const sentinel = join(workspace.target, 'sentinel.txt');
      writeFileSync(sentinel, 'safe');
      rmSync(paths.deployDir, { recursive: true, force: true });
      symlinkSync(workspace.target, paths.deployDir, 'dir');

      try {
        expect(() => cleanupSandbox(paths, false, false)).toThrow('replaced after creation');
        expect(readFileSync(sentinel, 'utf8')).toBe('safe');
      } finally {
        rmSync(paths.deployDir, { force: true });
      }
    });
  });

  it('refuses cleanup for an ephemeral path not owned by this invocation', async () => {
    await withTestWorkspace((workspace) => {
      expect(() =>
        cleanupSandbox(
          {
            deployDir: workspace.sandbox,
            distAbs: join(workspace.sandbox, 'dist'),
            functionsAbs: join(workspace.sandbox, 'functions'),
            isEphemeral: true,
          },
          false,
          false,
        ),
      ).toThrow('not created by this invocation');
    });
  });
});

describe('sandbox help', () => {
  it.each([SHARED_HELP, NETLIFY_HELP])('documents portable ephemeral and contained output paths', (help) => {
    expect(help).toContain('platform temporary directory');
    expect(help).toContain('contained relative path in sandbox modes');
    expect(help).not.toContain('/tmp/opencode');
  });
});

describe('bail', () => {
  it('throws a BailError', () => {
    try {
      bail('something went wrong');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BailError);
      expect((err as Error).message).toBe('something went wrong');
    }
  });
});

describe('redactCommand', () => {
  it('replaces secret values with [REDACTED]', () => {
    const cmd = 'netlify deploy --auth secret-token-123 --site my-site';
    const redacted = redactCommand(cmd, ['secret-token-123']);
    expect(redacted).toBe('netlify deploy --auth [REDACTED] --site my-site');
  });

  it('redacts multiple secrets', () => {
    const cmd = 'netlify deploy --auth token123 --site abc --mongodb-uri mongodb://user:pass@host'; // pragma: allowlist secret
    const redacted = redactCommand(cmd, ['mongodb://user:pass@host', 'token123']);
    expect(redacted).toBe('netlify deploy --auth [REDACTED] --site abc --mongodb-uri [REDACTED]');
  });

  it('does not modify the command when no secrets match', () => {
    const cmd = 'netlify deploy --site my-site --prod';
    const redacted = redactCommand(cmd, ['nonexistent']);
    expect(redacted).toBe(cmd);
  });

  it('ignores empty secret strings', () => {
    const cmd = 'netlify deploy --auth abc --site my-site';
    const redacted = redactCommand(cmd, ['', 'abc']);
    expect(redacted).toBe('netlify deploy --auth [REDACTED] --site my-site');
  });

  it('uses a redacted command display in thrown process failures', () => {
    const secret = 'token-that-must-not-appear'; // pragma: allowlist secret
    expect(() => run(process.execPath, ['-e', 'process.exit(7)', secret], {}, false, process.cwd(), [secret])).toThrow(
      `Command failed (exit 7): $ ${process.execPath} -e process.exit(7) [REDACTED]`,
    );
  });
});

describe('collectSecrets', () => {
  it('collects truthy non-empty strings', () => {
    const result = collectSecrets('token-123', 'mongodb://uri', undefined, '', 'site-name');
    expect(result).toEqual(['token-123', 'mongodb://uri', 'site-name']);
  });

  it('returns empty array when all values are falsy', () => {
    const result = collectSecrets(undefined, '', undefined);
    expect(result).toEqual([]);
  });

  it('handles single value', () => {
    const result = collectSecrets('secret');
    expect(result).toEqual(['secret']);
  });
});

describe('least-privilege child environments', () => {
  const parentEnv = {
    PATH: '/safe/bin',
    HOME: '/safe/home',
    LANG: 'en_US.UTF-8',
    MONGODB_URI: 'mongodb://parent-secret',
    NETLIFY_AUTH_TOKEN: 'parent-token',
    AWS_SECRET_ACCESS_KEY: 'cloud-secret', // pragma: allowlist secret
    APP_SETTING: 'private-setting',
  };

  it('copies only allowlisted platform variables plus explicit additions', () => {
    expect(createChildEnvironment(parentEnv, { PUBLIC_VALUE: 'public', OMITTED: undefined })).toEqual({
      PATH: '/safe/bin',
      HOME: '/safe/home',
      LANG: 'en_US.UTF-8',
      PUBLIC_VALUE: 'public',
    });
  });

  it('constructs exact, separate frontend and backend build environments', () => {
    const runs: Array<{ command: string; env: NodeJS.ProcessEnv }> = [];
    const options = repoOptions({
      apiBaseUrl: '/.netlify/functions/main',
      mongodbUri: 'mongodb://explicit-secret',
    });
    const paths = {
      deployDir: '/project',
      distAbs: '/project/dist',
      functionsAbs: '/project/functions',
      isEphemeral: false,
    };
    const prepared = buildArtifacts(options, paths, {
      parentEnv,
      log: () => undefined,
      run: (command, _args, env) => runs.push({ command, env }),
    });

    expect(prepared.frontendEnv).toEqual({
      PATH: '/safe/bin',
      HOME: '/safe/home',
      LANG: 'en_US.UTF-8',
      API_BASE_URL: '/.netlify/functions/main',
    });
    expect(prepared.backendEnv).toEqual({
      PATH: '/safe/bin',
      HOME: '/safe/home',
      LANG: 'en_US.UTF-8',
      API_BASE_URL: '/.netlify/functions/main',
      MONGODB_URI: 'mongodb://explicit-secret',
    });
    expect(runs).toEqual([
      { command: 'vite', env: prepared.frontendEnv },
      { command: 'wtt-access-router-runtime', env: prepared.backendEnv },
    ]);
  });
});

describe('--no-build artifact inspection', () => {
  it('requires non-empty frontend and named function entry artifacts', async () => {
    await withTestWorkspace((workspace) => {
      const paths = {
        deployDir: workspace.sandbox,
        distAbs: join(workspace.sandbox, 'dist'),
        functionsAbs: join(workspace.sandbox, 'functions'),
        isEphemeral: false,
      };
      mkdirSync(paths.distAbs, { recursive: true });
      mkdirSync(paths.functionsAbs, { recursive: true });

      expect(() => inspectArtifacts(repoOptions({ noBuild: true }), paths)).toThrow('Frontend artifact directory');
      writeFileSync(join(paths.distAbs, 'index.html'), '');
      expect(() => inspectArtifacts(repoOptions({ noBuild: true }), paths)).toThrow('Frontend entry artifact');
      writeFileSync(join(paths.distAbs, 'index.html'), '<main>ready</main>');
      // The CJS bundler contract emits `<name>.cjs` (template `pnpm
      // serverless` writes `main.cjs`); a stale `.js` alone must not pass.
      writeFileSync(join(paths.functionsAbs, 'main.js'), 'exports.handler = () => {};');
      expect(() => inspectArtifacts(repoOptions({ noBuild: true }), paths)).toThrow('Serverless function artifact');
      writeFileSync(join(paths.functionsAbs, 'main.cjs'), '');
      expect(() => inspectArtifacts(repoOptions({ noBuild: true }), paths)).toThrow('Serverless function artifact');
      writeFileSync(join(paths.functionsAbs, 'main.cjs'), 'exports.handler = () => {};');
      expect(() => inspectArtifacts(repoOptions({ noBuild: true }), paths)).not.toThrow();
    });
  });

  it('verifies newly built artifacts before reporting success (CARMSF-06)', async () => {
    await withTestWorkspace((workspace) => {
      const distAbs = join(workspace.sandbox, 'dist');
      const functionsAbs = join(workspace.sandbox, 'functions');
      const paths = { deployDir: workspace.sandbox, distAbs, functionsAbs, isEphemeral: false };
      const errors: string[] = [];

      // Fake builder mimics the real bundler layout on success: Vite output
      // plus the CJS serverless bundle `<functionsName>.cjs`.
      const writeProducerArtifacts = (): void => {
        mkdirSync(distAbs, { recursive: true });
        mkdirSync(functionsAbs, { recursive: true });
        writeFileSync(join(distAbs, 'index.html'), '<main>ready</main>');
        writeFileSync(join(functionsAbs, 'main.cjs'), 'exports.handler = () => {};');
      };

      expect(
        runSharedCli(['--project-root', workspace.source, '--mongodb-uri', 'mongodb://localhost/app'], {
          resolvePaths: () => paths,
          buildArtifacts: () => {
            writeProducerArtifacts();
            return { paths, options: repoOptions(), frontendEnv: {}, backendEnv: {} };
          },
          inspectArtifacts: (options, inspected) => inspectArtifacts(options, inspected),
          cleanupSandbox: () => undefined,
          log: () => undefined,
          error: (message = '') => errors.push(message),
        }),
      ).toBe(0);
      expect(errors).toEqual([]);

      // Successful builder exit without the required bundle must fail with a
      // controlled diagnostic instead of reporting success. Use fresh empty
      // output dirs so leftovers from the success case cannot mask the miss.
      const missingDist = join(workspace.sandbox, 'missing-dist');
      const missingFunctions = join(workspace.sandbox, 'missing-functions');
      mkdirSync(missingDist, { recursive: true });
      mkdirSync(missingFunctions, { recursive: true });
      writeFileSync(join(missingDist, 'index.html'), '<main>ready</main>');
      const missingPaths = {
        deployDir: workspace.sandbox,
        distAbs: missingDist,
        functionsAbs: missingFunctions,
        isEphemeral: false,
      };
      const missingErrors: string[] = [];
      expect(
        runSharedCli(['--project-root', workspace.source, '--mongodb-uri', 'mongodb://localhost/app'], {
          resolvePaths: () => missingPaths,
          buildArtifacts: () => ({ paths: missingPaths, options: repoOptions(), frontendEnv: {}, backendEnv: {} }),
          inspectArtifacts: (options, inspected) => inspectArtifacts(options, inspected),
          cleanupSandbox: () => undefined,
          log: () => undefined,
          error: (message = '') => missingErrors.push(message),
        }),
      ).toBe(1);
      expect(missingErrors.join('\n')).toMatch(/Functions artifact directory|Serverless function artifact/);
    });
  });

  it('returns testable help and failure exit codes without exiting the process', () => {
    const logs: string[] = [];
    expect(runSharedCli(['--help'], { log: (message = '') => logs.push(message) })).toBe(0);
    expect(logs.join('\n')).toContain('deploy-shared');

    const mutations: string[] = [];
    expect(
      runSharedCli(['--functions-name', '../bad'], {
        resolvePaths: () => {
          mutations.push('paths');
          throw new Error('unreachable');
        },
        error: () => undefined,
      }),
    ).toBe(1);
    expect(mutations).toEqual([]);
  });
});

describe('destructive output safety (CARMSF-05)', () => {
  it('rejects node_modules and descendants in a fresh persistent sandbox after the owned link exists', async () => {
    await withTestWorkspace((workspace) => {
      const sentinel = join(workspace.target, 'sentinel.txt');
      writeFileSync(sentinel, 'safe');

      for (const outputKey of ['distDir', 'functionsDir'] as const) {
        for (const value of ['node_modules', 'node_modules/sub']) {
          expect(() => resolvePaths(repoOptions({ sandboxDir: workspace.sandbox, [outputKey]: value }))).toThrow(
            /node_modules|strictly inside/,
          );
        }
      }
      // Alias proof that the canonical check runs against the post-link
      // filesystem: `alt` points outside the sandbox yet contains no
      // reserved segment lexically, so only symlink-aware resolution rejects it.
      symlinkSync(workspace.target, join(workspace.sandbox, 'alt'), 'dir');
      expect(() => resolvePaths(repoOptions({ sandboxDir: workspace.sandbox, distDir: 'alt/output' }))).toThrow(
        /strictly inside/,
      );
      expect(readFileSync(sentinel, 'utf8')).toBe('safe');
    });
  });

  it('rejects node_modules outputs in ephemeral sandboxes without touching outside data', async () => {
    await withTestWorkspace((workspace) => {
      const sentinel = join(workspace.target, 'sentinel.txt');
      writeFileSync(sentinel, 'safe');

      // Dry-run placeholder path: lexical reservation rejects before creation.
      expect(() => resolvePaths(repoOptions({ ephemeral: true, dryRun: true, distDir: 'node_modules' }))).toThrow(
        /node_modules/,
      );

      // Real ephemeral sandbox: post-link canonical check rejects. Clean up
      // the temp directory left behind by the pre-resolution mkdtemp.
      const before = new Set(readdirSync(tmpdir()));
      expect(() => resolvePaths(repoOptions({ ephemeral: true, distDir: 'node_modules/nested' }))).toThrow(
        /node_modules|strictly inside/,
      );
      for (const entry of readdirSync(tmpdir())) {
        if (!before.has(entry) && entry.startsWith('create-access-router-mongo-starter-deploy-')) {
          rmSync(join(tmpdir(), entry), { recursive: true, force: true });
        }
      }
      expect(readFileSync(sentinel, 'utf8')).toBe('safe');
    });
  });

  it('rejects reserved dependency/input/config dirs lexically at option validation', () => {
    expect(() =>
      validateSharedDeployOptions(repoOptions({ sandboxDir: '/tmp/sandbox', distDir: 'node_modules' })),
    ).toThrow(/node_modules/);
    expect(() =>
      validateSharedDeployOptions(repoOptions({ sandboxDir: '/tmp/sandbox', functionsDir: 'a/node_modules/b' })),
    ).toThrow(/node_modules/);
  });

  it('rejects root/ancestor/external/source/dependency targets and aliases in project mode', async () => {
    await withTestWorkspace((workspace) => {
      const projectRoot = workspace.source;
      for (const dir of ['src', 'api', 'node_modules']) mkdirSync(join(projectRoot, dir), { recursive: true });
      const sentinel = join(workspace.target, 'sentinel.txt');
      writeFileSync(sentinel, 'safe');
      symlinkSync(join(projectRoot, 'src'), join(projectRoot, 'alias-src'), 'dir');

      const badDistDirs = [
        '.',
        '..',
        'src',
        'src/nested',
        'api',
        'node_modules',
        'node_modules/sub',
        'alias-src',
        'alias-src/nested',
        workspace.target,
        join(workspace.target, 'output'),
      ];
      for (const distDir of badDistDirs) {
        expect(() => resolvePaths(repoOptions({ projectRoot, distDir })), `distDir: ${distDir}`).toThrow(
          /strictly inside|reserved/,
        );
      }
      expect(() => resolvePaths(repoOptions({ projectRoot, functionsDir: 'api' }))).toThrow(/reserved/);
      expect(() => resolvePaths(repoOptions({ projectRoot, functionsDir: '.' }))).toThrow(/strictly inside/);
      expect(readFileSync(sentinel, 'utf8')).toBe('safe');
    });
  });

  it('rejects equal and nested frontend/function outputs before any runner runs', async () => {
    await withTestWorkspace((workspace) => {
      const sentinel = join(workspace.target, 'sentinel.txt');
      writeFileSync(sentinel, 'safe');

      // resolvePaths-level rejection in both sandbox and project modes.
      expect(() =>
        resolvePaths(repoOptions({ sandboxDir: workspace.sandbox, distDir: 'out', functionsDir: 'out' })),
      ).toThrow(/disjoint/);
      expect(() =>
        resolvePaths(repoOptions({ sandboxDir: workspace.sandbox, distDir: 'out', functionsDir: 'out/nested' })),
      ).toThrow(/disjoint/);
      expect(() =>
        resolvePaths(repoOptions({ projectRoot: workspace.source, distDir: 'out', functionsDir: 'out' })),
      ).toThrow(/disjoint/);

      // buildArtifacts-level final check with fake runners and sentinels.
      for (const [distAbs, functionsAbs] of [
        [join(workspace.sandbox, 'same'), join(workspace.sandbox, 'same')],
        [join(workspace.sandbox, 'outer'), join(workspace.sandbox, 'outer/inner')],
        [join(workspace.sandbox, 'outer/inner'), join(workspace.sandbox, 'outer')],
      ] as const) {
        const runs: string[] = [];
        expect(() =>
          buildArtifacts(
            repoOptions({ projectRoot: workspace.source }),
            { deployDir: workspace.sandbox, distAbs, functionsAbs, isEphemeral: false },
            {
              parentEnv: {},
              log: () => undefined,
              run: (command) => {
                runs.push(command);
              },
            },
          ),
        ).toThrow(/disjoint/);
        expect(runs).toEqual([]);
      }
      expect(readFileSync(sentinel, 'utf8')).toBe('safe');
    });
  });

  it('still builds disjoint outputs with fake runners', async () => {
    await withTestWorkspace((workspace) => {
      const runs: string[] = [];
      const prepared = buildArtifacts(
        repoOptions({ projectRoot: workspace.source }),
        {
          deployDir: workspace.source,
          distAbs: join(workspace.source, 'dist'),
          functionsAbs: join(workspace.source, 'netlify/functions'),
          isEphemeral: false,
        },
        {
          parentEnv: {},
          log: () => undefined,
          run: (command) => {
            runs.push(command);
          },
        },
      );
      expect(runs).toEqual(['vite', 'wtt-access-router-runtime']);
      expect(prepared.paths.distAbs).toBe(join(workspace.source, 'dist'));
    });
  });
});
