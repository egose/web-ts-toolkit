// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DeployFailure, runDeploy, runNetlifyCli } from '../scripts/deploy-netlify';
import {
  SHARED_DEFAULTS,
  assertShellFreeInvocationSupported,
  isWindowsShellShimCommand,
  runCapture,
  type DeployPaths,
} from '../scripts/deploy-shared';

const VALID_ARGV = ['--site', 'site-id', '--auth-token', 'token', '--mongodb-uri', 'mongodb://localhost/app'];

function ephemeralPaths(): DeployPaths {
  return {
    deployDir: '/sandbox',
    distAbs: '/sandbox/dist',
    functionsAbs: '/sandbox/functions',
    isEphemeral: true,
  };
}

describe('cleanup failure retains the completed deployment report (CARMSF-09)', () => {
  it('reports completed deployment + local-cleanup diagnostics and keeps the sandbox', async () => {
    const calls: string[] = [];
    const errors: unknown[] = [];
    const logs: string[] = [];
    const completedReport = {
      remoteMutations: [
        { operation: 'environment variable API_BASE_URL on site site-id', status: 'completed' as const },
        { operation: 'deploy to site site-id', status: 'completed' as const },
      ],
    };
    const exitCode = await runNetlifyCli(VALID_ARGV, {
      resolvePaths: () => ephemeralPaths(),
      runDeploy: async () => completedReport,
      cleanupSandbox: () => {
        calls.push('cleanup');
        throw new Error('simulated cleanup failure');
      },
      keepSandboxOnFailure: () => calls.push('keep-on-failure'),
      log: (message = '') => logs.push(message),
      error: (value) => errors.push(value),
    });

    expect(exitCode).toBe(1);
    expect(calls).toEqual(['cleanup', 'keep-on-failure']);
    const output = errors.join('\n');
    expect(output).toContain('Deploy completed successfully');
    expect(output).toContain('Local cleanup failed');
    expect(output).toContain('simulated cleanup failure');
    expect(output).toContain('do not retry the deploy');
    expect(output).toContain('Exit 1 reports the local-cleanup failure');
    expect(output).toContain('deploy to site site-id');
    expect(output).toContain('completed');
    expect(logs.join('\n')).not.toContain('Deploy finished.');
  });

  it('still reports completed mutations when the deployment itself fails', async () => {
    const calls: string[] = [];
    const errors: unknown[] = [];
    const mutation = {
      operation: 'environment variable API_BASE_URL on site site-id',
      status: 'completed' as const,
    };
    const exitCode = await runNetlifyCli(VALID_ARGV, {
      resolvePaths: () => ephemeralPaths(),
      runDeploy: async () => {
        throw new DeployFailure(new Error('deploy failed'), { remoteMutations: [mutation] });
      },
      cleanupSandbox: () => calls.push('cleanup-success-must-not-run'),
      keepSandboxOnFailure: () => calls.push('keep-on-failure'),
      error: (value) => errors.push(value),
    });

    expect(exitCode).toBe(1);
    expect(calls).toEqual(['keep-on-failure']);
    expect(errors.join('\n')).toContain('Remote state may remain');
    expect(errors.join('\n')).toContain(mutation.operation);
  });
});

describe('Windows shell-shim contract without a shell (CARMSF-09)', () => {
  it('identifies Windows shell shims by extension', () => {
    expect(isWindowsShellShimCommand('C:\\tools\\netlify.cmd')).toBe(true);
    expect(isWindowsShellShimCommand('/opt/netlify.CMD')).toBe(true);
    expect(isWindowsShellShimCommand('deploy.bat')).toBe(true);
    expect(isWindowsShellShimCommand('run.ps1')).toBe(true);
    expect(isWindowsShellShimCommand('/usr/bin/netlify')).toBe(false);
    expect(isWindowsShellShimCommand('/usr/bin/netlify.exe')).toBe(false);
  });

  it('rejects shims on win32 without enabling a shell, and passes elsewhere', () => {
    expect(() => assertShellFreeInvocationSupported('/bin/netlify.cmd', 'win32')).toThrow(
      /cannot be executed without a shell/,
    );
    expect(() => assertShellFreeInvocationSupported('/bin/netlify.cmd', 'linux')).not.toThrow();
    expect(() => assertShellFreeInvocationSupported('/usr/bin/netlify', 'win32')).not.toThrow();
  });

  it('rejects a win32 shim at deploy preflight before any build or remote work', async () => {
    const forbidden = (): never => {
      throw new Error('must not run after preflight rejection');
    };
    const paths: DeployPaths = {
      deployDir: '/sandbox',
      distAbs: '/sandbox/dist',
      functionsAbs: '/sandbox/functions',
      isEphemeral: false,
    };
    // Exercise the same guard runDeploy applies to every injected resolveCli
    // result, with an explicit win32 platform (Linux hosts cannot trigger the
    // platform branch through runDeploy itself).
    expect(() => assertShellFreeInvocationSupported('/fake/netlify.cmd', 'win32')).toThrow(
      /cannot be executed without a shell/,
    );
    // A non-shim CLI on the current platform still passes preflight ordering.
    await expect(
      runDeploy(
        {
          ...SHARED_DEFAULTS,
          projectRoot: '/project',
          interactive: false,
          authToken: 'token',
          site: 'site-id',
          siteName: undefined,
          team: undefined,
          prod: false,
          publicDemoAcknowledged: false,
          paidTier: false,
          message: undefined,
          alias: undefined,
          context: 'deploy-preview',
          branch: undefined,
          mongodbUri: 'mongodb://localhost/app',
          noBuild: true,
        },
        paths,
        {
          resolveCli: () => ({ command: '/fake/netlify', argsPrefix: [] }),
          checkBuildTools: () => undefined,
          inspectArtifacts: () => undefined,
          ensureNetlifyToml: () => undefined,
          buildArtifacts: () => forbidden(),
          resolveSiteId: async () => 'site-id',
          ensureLinkedSite: () => undefined,
          setSiteEnvVar: async () => undefined,
          verifySiteEnvVar: async () => ({ status: 'verified' }),
          runCapture: () => '{}',
          log: () => undefined,
        },
      ),
    ).resolves.toBeDefined();
  });

  it('preserves arguments literally through the shell-free runner (no shell interpretation)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-arg-preservation-'));
    const script = join(dir, 'echo-args.mjs');
    writeFileSync(script, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
    const tricky = ['a b', '--alias=staging x', '$HOME;rm -rf /', 'quote"test', "single'quote", '`backtick`'];
    const output = runCapture(process.execPath, [script, ...tricky], process.env, false, dir);
    expect(JSON.parse(output)).toEqual(tricky);
  });
});
