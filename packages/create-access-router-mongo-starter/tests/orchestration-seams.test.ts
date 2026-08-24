// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { runCli, type ScaffoldServices } from '../src/cli';
import {
  collectInteractiveOptions,
  DeployFailure,
  runDeploy,
  runNetlifyCli,
  type NetlifyDeployServices,
  type NetlifyOptions,
  type NetlifyPromptServices,
} from '../scripts/deploy-netlify';
import { SHARED_DEFAULTS, type DeployPaths } from '../scripts/deploy-shared';

describe('scaffold orchestration seams', () => {
  it('can prove validation failures occur before filesystem mutation', async () => {
    const mutations: string[] = [];
    const services: Partial<ScaffoldServices> = {
      templateDir: '/isolated/template',
      cwd: '/isolated',
      exists: () => true,
      validatePaths: () => undefined,
      removeTarget: () => mutations.push('remove'),
      createTarget: () => mutations.push('mkdir'),
      copyTemplate: () => mutations.push('copy'),
      rewritePlaceholders: () => mutations.push('rewrite'),
      log: () => undefined,
    };

    await expect(runCli([], services)).rejects.toThrow('Target directory is required');
    expect(mutations).toEqual([]);
  });

  it('supports injected prompts, filesystem operations, and logging for a complete scaffold', async () => {
    const calls: string[] = [];
    const services: Partial<ScaffoldServices> = {
      templateDir: '/isolated/template',
      scaffolderVersion: '1.2.3',
      cwd: '/isolated',
      exists: (path) => path === '/isolated/template',
      validatePaths: () => undefined,
      createTemporaryTarget: () => '/isolated/.app.tmp-test',
      move: (source, target) => calls.push(`move:${source}:${target}`),
      createTarget: () => calls.push('mkdir'),
      copyTemplate: () => calls.push('copy'),
      rewritePlaceholders: (_path, values) => calls.push(`rewrite:${values.version}`),
      validateTarget: () => calls.push('validate'),
      log: (message) => calls.push(`log:${message ?? ''}`),
    };

    await expect(runCli(['app', '--name', 'app'], services)).resolves.toBe(0);
    expect(calls).toContain('mkdir');
    expect(calls).toContain('copy');
    expect(calls).toContain('rewrite:1.2.3');
  });
});

describe('deployment orchestration seams', () => {
  const paths: DeployPaths = {
    deployDir: '/sandbox',
    distAbs: '/sandbox/dist',
    functionsAbs: '/sandbox/functions',
    isEphemeral: false,
  };

  function options(): NetlifyOptions {
    return {
      ...SHARED_DEFAULTS,
      projectRoot: '/project',
      authToken: 'token',
      site: 'site-name',
      siteName: undefined,
      team: undefined,
      interactive: false,
      prod: false,
      publicDemoAcknowledged: false,
      paidTier: false,
      message: undefined,
      alias: undefined,
      context: 'deploy-preview',
      branch: undefined,
      mongodbUri: 'mongodb://localhost/app',
    };
  }

  it('records build, filesystem, Netlify API, and runner ordering without live services', async () => {
    const calls: string[] = [];
    const services: Partial<NetlifyDeployServices> = {
      resolveSiteId: async () => {
        calls.push('api:resolve-site');
        return 'site-id';
      },
      buildArtifacts: (deployOptions) => {
        calls.push('build');
        return { paths, options: deployOptions, frontendEnv: {}, backendEnv: {} };
      },
      checkBuildTools: () => calls.push('tools:build'),
      ensureNetlifyToml: () => calls.push('fs:toml'),
      resolveCli: () => ({ command: '/fake/netlify', argsPrefix: [] }),
      ensureLinkedSite: () => calls.push('fs:link'),
      setSiteEnvVar: async (_token, _site, key) => {
        calls.push(`api:set:${key}`);
      },
      verifySiteEnvVar: async (_token, _site, key) => {
        calls.push(`api:verify:${key}`);
        return { status: 'verified' };
      },
      runCapture: (_cli, args, env) => {
        calls.push('runner');
        expect(args).toEqual([
          'deploy',
          '--no-build',
          '--dir',
          '/sandbox/dist',
          '--functions',
          '/sandbox/functions',
          '--site',
          'site-id',
          '--json',
        ]);
        expect(env).toEqual({ PATH: '/safe/bin', NETLIFY_AUTH_TOKEN: 'token' });
        return '{}';
      },
      parentEnv: {
        PATH: '/safe/bin',
        MONGODB_URI: 'must-not-leak',
        OTHER_SECRET: 'must-not-leak', // pragma: allowlist secret
      },
      log: () => undefined,
    };

    await runDeploy(options(), paths, services);

    expect(calls).toEqual([
      'tools:build',
      'build',
      'fs:toml',
      'api:resolve-site',
      'fs:link',
      'api:set:API_BASE_URL',
      'api:verify:API_BASE_URL',
      'api:set:MONGODB_URI',
      'api:verify:MONGODB_URI',
      'runner',
    ]);
  });

  it('makes later filesystem, remote, and process mutations observable after a failed build', async () => {
    const forbiddenMutation = vi.fn();
    const services: Partial<NetlifyDeployServices> = {
      resolveSiteId: async () => 'site-id',
      buildArtifacts: () => {
        throw new Error('simulated build failure');
      },
      resolveCli: () => ({ command: '/fake/netlify', argsPrefix: [] }),
      checkBuildTools: () => undefined,
      ensureNetlifyToml: forbiddenMutation,
      ensureLinkedSite: forbiddenMutation,
      setSiteEnvVar: forbiddenMutation,
      runCapture: forbiddenMutation,
      log: () => undefined,
    };

    await expect(runDeploy(options(), paths, services)).rejects.toThrow('simulated build failure');
    expect(forbiddenMutation).not.toHaveBeenCalled();
  });

  it('does not build or mutate remotely when the Netlify CLI preflight fails', async () => {
    const forbiddenMutation = vi.fn();
    await expect(
      runDeploy(options(), paths, {
        resolveCli: () => {
          throw new Error('missing Netlify CLI');
        },
        checkBuildTools: forbiddenMutation,
        buildArtifacts: forbiddenMutation,
        resolveSiteId: forbiddenMutation,
        setSiteEnvVar: forbiddenMutation,
        runCapture: forbiddenMutation,
        log: () => undefined,
      }),
    ).rejects.toThrow('missing Netlify CLI');
    expect(forbiddenMutation).not.toHaveBeenCalled();
  });

  it('does not mutate remotely when --no-build artifact inspection fails', async () => {
    const forbiddenMutation = vi.fn();
    await expect(
      runDeploy({ ...options(), noBuild: true }, paths, {
        resolveCli: () => ({ command: '/fake/netlify', argsPrefix: [] }),
        checkBuildTools: () => undefined,
        inspectArtifacts: () => {
          throw new Error('missing frontend artifact');
        },
        ensureNetlifyToml: forbiddenMutation,
        resolveSiteId: forbiddenMutation,
        setSiteEnvVar: forbiddenMutation,
        runCapture: forbiddenMutation,
        log: () => undefined,
      }),
    ).rejects.toThrow('missing frontend artifact');
    expect(forbiddenMutation).not.toHaveBeenCalled();
  });

  it('checks tools before building and creates a requested site only after local success', async () => {
    const calls: string[] = [];
    const deployOptions = { ...options(), site: undefined, siteName: 'new-site' };
    const report = await runDeploy(deployOptions, paths, {
      resolveCli: () => {
        calls.push('tools:netlify');
        return { command: '/fake/netlify', argsPrefix: [] };
      },
      checkBuildTools: () => calls.push('tools:build'),
      buildArtifacts: (validated) => {
        calls.push('build');
        return { paths, options: validated, frontendEnv: {}, backendEnv: {} };
      },
      ensureNetlifyToml: () => calls.push('fs:toml'),
      resolveSiteTarget: async () => {
        calls.push('api:create-site');
        return { siteId: 'new-id', created: true };
      },
      resolveSiteId: async () => {
        calls.push('api:resolve-site');
        return 'new-id';
      },
      ensureLinkedSite: () => calls.push('fs:link'),
      setSiteEnvVar: async () => {
        calls.push('api:set-env');
      },
      verifySiteEnvVar: async () => ({ status: 'verified' }),
      runCapture: () => {
        calls.push('deploy');
        return '{}';
      },
      log: () => undefined,
    });

    expect(calls).toEqual([
      'tools:netlify',
      'tools:build',
      'build',
      'fs:toml',
      'api:create-site',
      'api:resolve-site',
      'fs:link',
      'api:set-env',
      'api:set-env',
      'deploy',
    ]);
    expect(report.remoteMutations).toEqual([
      { operation: 'site creation for "new-site"', status: 'completed' },
      { operation: 'environment variable API_BASE_URL on site new-id', status: 'completed' },
      { operation: 'environment variable MONGODB_URI on site new-id', status: 'completed' },
      { operation: 'deploy to site new-id', status: 'completed' },
    ]);
  });

  it('uses artifact inspection instead of builds for --no-build', async () => {
    const calls: string[] = [];
    await runDeploy({ ...options(), noBuild: true }, paths, {
      resolveCli: () => ({ command: '/fake/netlify', argsPrefix: [] }),
      checkBuildTools: () => calls.push('tools:build'),
      inspectArtifacts: () => calls.push('inspect'),
      buildArtifacts: () => {
        throw new Error('must not build');
      },
      ensureNetlifyToml: () => undefined,
      resolveSiteId: async () => 'site-id',
      ensureLinkedSite: () => undefined,
      setSiteEnvVar: async () => undefined,
      verifySiteEnvVar: async () => ({ status: 'verified' }),
      runCapture: () => '{}',
      log: () => undefined,
    });
    expect(calls).toEqual(['tools:build', 'inspect']);
  });

  it('warns without claiming success when environment metadata evidence is unavailable', async () => {
    const logs: string[] = [];
    await runDeploy(options(), paths, {
      resolveCli: () => ({ command: '/fake/netlify', argsPrefix: [] }),
      checkBuildTools: () => undefined,
      buildArtifacts: (validated) => ({ paths, options: validated, frontendEnv: {}, backendEnv: {} }),
      ensureNetlifyToml: () => undefined,
      resolveSiteId: async () => 'site-id',
      ensureLinkedSite: () => undefined,
      setSiteEnvVar: async () => undefined,
      verifySiteEnvVar: async () => ({ status: 'unknown', unavailable: ['scope', 'sensitivity'] }),
      runCapture: () => '{}',
      log: (message = '') => logs.push(message),
    });

    expect(logs.join('\n')).toContain('did not provide enough evidence to verify API_BASE_URL scope, sensitivity');
    expect(logs.join('\n')).not.toContain('context, scope, and sensitivity match');
  });

  it('stops before deploy when verified environment metadata conflicts with the plan', async () => {
    const deploy = vi.fn();
    await expect(
      runDeploy(options(), paths, {
        resolveCli: () => ({ command: '/fake/netlify', argsPrefix: [] }),
        checkBuildTools: () => undefined,
        buildArtifacts: (validated) => ({ paths, options: validated, frontendEnv: {}, backendEnv: {} }),
        ensureNetlifyToml: () => undefined,
        resolveSiteId: async () => 'site-id',
        ensureLinkedSite: () => undefined,
        setSiteEnvVar: async () => undefined,
        verifySiteEnvVar: async () => ({ status: 'mismatch', mismatches: ['context', 'sensitivity'] }),
        runCapture: deploy,
        log: () => undefined,
      }),
    ).rejects.toThrow('API_BASE_URL has mismatched context, sensitivity metadata');
    expect(deploy).not.toHaveBeenCalled();
  });

  it('reports completed and uncertain remote mutations when a later mutation fails', async () => {
    const deployOptions = { ...options(), site: undefined, siteName: 'new-site', mongodbUri: 'mongodb://secret' };
    const error = await runDeploy(deployOptions, paths, {
      resolveCli: () => ({ command: '/fake/netlify', argsPrefix: [] }),
      checkBuildTools: () => undefined,
      buildArtifacts: (validated) => ({ paths, options: validated, frontendEnv: {}, backendEnv: {} }),
      ensureNetlifyToml: () => undefined,
      resolveSiteTarget: async () => ({ siteId: 'new-id', created: true }),
      resolveSiteId: async () => 'new-id',
      ensureLinkedSite: () => undefined,
      setSiteEnvVar: async (_token, _site, key) => {
        if (key === 'MONGODB_URI') throw new Error('env write disconnected');
      },
      verifySiteEnvVar: async () => ({ status: 'verified' }),
      runCapture: () => '{}',
      log: () => undefined,
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(DeployFailure);
    expect((error as DeployFailure).report.remoteMutations).toEqual([
      { operation: 'site creation for "new-site"', status: 'completed' },
      { operation: 'environment variable API_BASE_URL on site new-id', status: 'completed' },
      { operation: 'environment variable MONGODB_URI on site new-id', status: 'completion-unknown' },
    ]);
  });
});

describe('deployment collection and CLI lifecycle', () => {
  function interactiveOptions(): NetlifyOptions {
    return {
      ...SHARED_DEFAULTS,
      projectRoot: '/project',
      interactive: true,
      authToken: undefined,
      site: undefined,
      siteName: undefined,
      team: undefined,
      prod: false,
      publicDemoAcknowledged: false,
      paidTier: false,
      message: undefined,
      alias: undefined,
      context: 'deploy-preview',
      branch: undefined,
    };
  }

  function promptSequence(cancelAt: number): NetlifyPromptServices {
    const cancelled = Symbol('cancelled');
    const values: unknown[] = [
      'ephemeral',
      true,
      'token',
      'new-site',
      '',
      false,
      true,
      'staging',
      'mongodb://localhost',
      true,
    ];
    let call = 0;
    const next = async (): Promise<unknown> => {
      const index = call++;
      return index === cancelAt ? cancelled : values[index];
    };
    return {
      intro: () => undefined,
      cancel: () => undefined,
      select: next,
      confirm: next,
      text: next,
      password: next,
      isCancel: (value: unknown) => value === cancelled,
    } as unknown as NetlifyPromptServices;
  }

  it.each(Array.from({ length: 10 }, (_, index) => index))(
    'returns cancellation without mutation when prompt step %i is cancelled',
    async (cancelAt) => {
      await expect(collectInteractiveOptions(interactiveOptions(), promptSequence(cancelAt))).resolves.toEqual({
        kind: 'cancel',
      });
    },
  );

  it('supports cancellation at the persistent sandbox path prompt', async () => {
    const cancelled = Symbol('cancelled');
    let call = 0;
    const next = async (): Promise<unknown> => (call++ === 0 ? 'sandbox' : cancelled);
    const prompts = {
      intro: () => undefined,
      cancel: () => undefined,
      select: next,
      confirm: next,
      text: next,
      password: next,
      isCancel: (value: unknown) => value === cancelled,
    } as unknown as NetlifyPromptServices;
    await expect(collectInteractiveOptions(interactiveOptions(), prompts)).resolves.toEqual({ kind: 'cancel' });
  });

  it('shows and requires the public-demo warning when interactive production is selected', async () => {
    const messages: string[] = [];
    const confirmations = [true, true, true];
    const prompts = {
      intro: () => undefined,
      cancel: () => undefined,
      select: async () => 'repo',
      confirm: async ({ message }: { message: string }) => {
        messages.push(message);
        return confirmations.shift();
      },
      text: async () => '',
      password: async () => '',
      isCancel: () => false,
    } as unknown as NetlifyPromptServices;

    const result = await collectInteractiveOptions(
      {
        ...interactiveOptions(),
        authToken: 'token',
        site: 'site-id',
        mongodbUri: 'mongodb://localhost/app',
      },
      prompts,
    );

    expect(result.kind === 'options' && result.options).toMatchObject({
      prod: true,
      publicDemoAcknowledged: true,
    });
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('PUBLIC DEMO WARNING'),
        expect.stringContaining('Deploy to production?'),
      ]),
    );
  });

  it('returns zero on cancellation before path or deploy work', async () => {
    const forbidden = vi.fn();
    await expect(
      runNetlifyCli(['--interactive'], {
        collectInteractive: async () => ({ kind: 'cancel' }),
        resolvePaths: forbidden,
        runDeploy: forbidden,
      }),
    ).resolves.toBe(0);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('returns zero for help and for successful orchestration with cleanup last', async () => {
    const forbidden = vi.fn();
    await expect(runNetlifyCli(['--help'], { resolvePaths: forbidden, runDeploy: forbidden })).resolves.toBe(0);
    expect(forbidden).not.toHaveBeenCalled();

    const calls: string[] = [];
    const lifecyclePaths: DeployPaths = {
      deployDir: '/sandbox',
      distAbs: '/sandbox/dist',
      functionsAbs: '/sandbox/functions',
      isEphemeral: false,
    };
    await expect(
      runNetlifyCli(['--site', 'site-id', '--auth-token', 'token', '--mongodb-uri', 'mongodb://localhost/app'], {
        resolvePaths: () => {
          calls.push('paths');
          return lifecyclePaths;
        },
        runDeploy: async () => {
          calls.push('deploy');
          return { remoteMutations: [] };
        },
        cleanupSandbox: () => calls.push('cleanup'),
        log: () => undefined,
      }),
    ).resolves.toBe(0);
    expect(calls).toEqual(['paths', 'deploy', 'cleanup']);
  });

  it.each([
    [
      [
        '--site',
        'valid-site',
        '--auth-token',
        'token',
        '--mongodb-uri',
        'mongodb://localhost/app',
        '--functions-name',
        '../bad',
      ],
      'functions-name',
    ],
    [['--site-name', 'Invalid_Name', '--auth-token', 'token', '--mongodb-uri', 'mongodb://localhost/app'], 'site-name'],
    [
      [
        '--site',
        'valid-site',
        '--auth-token',
        'token',
        '--mongodb-uri',
        'mongodb://localhost/app',
        '--alias',
        'Invalid_Name',
      ],
      'alias',
    ],
    [
      [
        '--site',
        'valid-site',
        '--auth-token',
        'token',
        '--mongodb-uri',
        'mongodb://localhost/app',
        '--context',
        'bad context',
      ],
      'context',
    ],
    [
      [
        '--site',
        'valid-site',
        '--auth-token',
        'token',
        '--mongodb-uri',
        'mongodb://localhost/app',
        '--api-base-url',
        'https://example.test/api',
      ],
      'api-base-url',
    ],
    [['--site', 'valid-site', '--auth-token', 'token'], 'mongodb-uri'],
  ])('rejects invalid collected input before paths or remote work: %s', async (argv, expected) => {
    const forbidden = vi.fn();
    const errors: unknown[] = [];
    await expect(
      runNetlifyCli(argv, {
        resolvePaths: forbidden,
        runDeploy: forbidden,
        error: (value) => errors.push(value),
      }),
    ).resolves.toBe(1);
    expect(forbidden).not.toHaveBeenCalled();
    expect(errors.join('\n')).toContain(expected);
  });

  it('returns one, preserves failure cleanup, and reports residual remote state', async () => {
    const calls: string[] = [];
    const errors: unknown[] = [];
    const lifecyclePaths: DeployPaths = {
      deployDir: '/sandbox',
      distAbs: '/sandbox/dist',
      functionsAbs: '/sandbox/functions',
      isEphemeral: true,
    };
    const mutation = { operation: 'environment variable API_BASE_URL on site site-id', status: 'completed' as const };
    const exitCode = await runNetlifyCli(
      ['--site', 'site-id', '--auth-token', 'token', '--mongodb-uri', 'mongodb://localhost/app'],
      {
        resolvePaths: () => lifecyclePaths,
        runDeploy: async () => {
          throw new DeployFailure(new Error('deploy failed'), { remoteMutations: [mutation] });
        },
        keepSandboxOnFailure: () => calls.push('keep-on-failure'),
        cleanupSandbox: () => calls.push('cleanup-success'),
        error: (value) => errors.push(value),
      },
    );
    expect(exitCode).toBe(1);
    expect(calls).toEqual(['keep-on-failure']);
    expect(errors.join('\n')).toContain('Remote state may remain');
    expect(errors.join('\n')).toContain(mutation.operation);
  });
});
