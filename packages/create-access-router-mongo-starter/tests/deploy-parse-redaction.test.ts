// @vitest-environment node
import { describe, expect, it, vi, afterEach } from 'vitest';
import { collectCliOptions, runNetlifyCli } from '../scripts/deploy-netlify';
import { runSharedCli } from '../scripts/deploy-shared';

const AUTH_SECRET = 'dummy-secret-token-abc123'; // pragma: allowlist secret
const MONGO_SECRET = 'mongodb://user:dummy-secret-pw-xyz789@localhost/app'; // pragma: allowlist secret
const UNKNOWN_SECRET = 'dummy-secret-unknown-999'; // pragma: allowlist secret

afterEach(() => {
  delete process.env.NETLIFY_AUTH_TOKEN;
  delete process.env.MONGODB_URI;
  vi.unstubAllEnvs();
});

describe('credential-bearing parse failures (CARMSF-07)', () => {
  it('netlify parser accepts equals-form secrets without echoing them', () => {
    const collected = collectCliOptions([
      '--site',
      'site-id',
      `--auth-token=${AUTH_SECRET}`,
      `--mongodb-uri=${MONGO_SECRET}`,
    ]);
    expect(collected.kind).toBe('options');
    if (collected.kind !== 'options') return;
    expect(collected.options.authToken).toBe(AUTH_SECRET);
    expect(collected.options.mongodbUri).toBe(MONGO_SECRET);
  });

  it('netlify parser rejects unknown equals-form options with value-free diagnostics', () => {
    expect(() => collectCliOptions([`--bogus-option=${UNKNOWN_SECRET}`])).toThrowError(
      /Unknown option: --bogus-option/,
    );
    try {
      collectCliOptions([`--bogus-option=${UNKNOWN_SECRET}`]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain('--bogus-option');
      expect(message).not.toContain(UNKNOWN_SECRET);
      return;
    }
    throw new Error('expected unknown equals-form option to throw');
  });

  it('netlify CLI reports unknown equals-form secrets without values and without mutation', async () => {
    for (const env of [false, true]) {
      if (env) {
        process.env.NETLIFY_AUTH_TOKEN = 'env-token-should-stay-hidden';
        process.env.MONGODB_URI = 'mongodb://env:env-hidden@localhost/app'; // pragma: allowlist secret
      }
      const resolvePaths = vi.fn();
      const runDeploy = vi.fn();
      const errors: string[] = [];
      const exitCode = await runNetlifyCli([`--bogus-option=${UNKNOWN_SECRET}`], {
        resolvePaths: resolvePaths as never,
        runDeploy: runDeploy as never,
        error: (value) => errors.push(String(value)),
        log: () => undefined,
      });
      expect(exitCode).toBe(1);
      expect(resolvePaths).not.toHaveBeenCalled();
      expect(runDeploy).not.toHaveBeenCalled();
      const output = errors.join('\n');
      expect(output).toContain('--bogus-option');
      expect(output).not.toContain(UNKNOWN_SECRET);
      if (env) {
        expect(output).not.toContain('env-token-should-stay-hidden');
        expect(output).not.toContain('env-hidden');
      }
      delete process.env.NETLIFY_AUTH_TOKEN;
      delete process.env.MONGODB_URI;
    }
  });

  it('netlify CLI accepts valid equals-form secrets without leaking them', async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const exitCode = await runNetlifyCli(
      ['--site', 'site-id', `--auth-token=${AUTH_SECRET}`, `--mongodb-uri=${MONGO_SECRET}`],
      {
        resolvePaths: () => ({
          deployDir: '/sandbox',
          distAbs: '/sandbox/dist',
          functionsAbs: '/sandbox/fx',
          isEphemeral: false,
        }),
        runDeploy: async () => ({ remoteMutations: [] }),
        cleanupSandbox: () => undefined,
        log: (message = '') => logs.push(message),
        error: (value) => errors.push(String(value)),
      },
    );
    expect(exitCode).toBe(0);
    expect(`${logs.join('\n')}\n${errors.join('\n')}`).not.toContain(AUTH_SECRET);
    expect(`${logs.join('\n')}\n${errors.join('\n')}`).not.toContain('dummy-secret-pw-xyz789');
  });

  it('shared CLI accepts equals-form mongodb uri without leaking it', () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const paths = { deployDir: '/sandbox', distAbs: '/sandbox/dist', functionsAbs: '/sandbox/fx', isEphemeral: false };
    const exitCode = runSharedCli([`--mongodb-uri=${MONGO_SECRET}`, '--no-build'], {
      resolvePaths: () => paths,
      inspectArtifacts: () => undefined,
      buildArtifacts: () => {
        throw new Error('build should be skipped with --no-build');
      },
      cleanupSandbox: () => undefined,
      log: (message = '') => logs.push(message),
      error: (message = '') => errors.push(message),
    });
    expect(exitCode).toBe(0);
    expect(`${logs.join('\n')}\n${errors.join('\n')}`).not.toContain('dummy-secret-pw-xyz789');
  });

  it('shared CLI reports unknown equals-form secrets without values and without mutation', () => {
    for (const env of [false, true]) {
      if (env) process.env.MONGODB_URI = 'mongodb://env:env-hidden-shared@localhost/app'; // pragma: allowlist secret
      const resolvePaths = vi.fn();
      const buildArtifacts = vi.fn();
      const errors: string[] = [];
      const exitCode = runSharedCli([`--bogus-option=${UNKNOWN_SECRET}`], {
        resolvePaths: resolvePaths as never,
        buildArtifacts: buildArtifacts as never,
        error: (message = '') => errors.push(message),
        log: () => undefined,
      });
      expect(exitCode).toBe(1);
      expect(resolvePaths).not.toHaveBeenCalled();
      expect(buildArtifacts).not.toHaveBeenCalled();
      const output = errors.join('\n');
      expect(output).toContain('--bogus-option');
      expect(output).not.toContain(UNKNOWN_SECRET);
      if (env) expect(output).not.toContain('env-hidden-shared');
      delete process.env.MONGODB_URI;
    }
  });
});
