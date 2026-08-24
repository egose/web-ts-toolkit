// @vitest-environment node
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseToml } from 'smol-toml';
import {
  applyBranchOverride,
  collectCliOptions,
  ensureLinkedSite,
  ensureNetlifyToml,
  lookupInPath,
  planRuntimeSiteEnvVars,
  readLinkedSite,
  resolveDeployContext,
  serializeNetlifyToml,
  validateNetlifyOptions,
  type NetlifyOptions,
} from '../scripts/deploy-netlify';
import { SHARED_DEFAULTS, type DeployPaths } from '../scripts/deploy-shared';
import { withTestWorkspace } from './support/temp-workspace';

function netlifyOptions(overrides: Partial<NetlifyOptions> = {}): NetlifyOptions {
  return {
    ...SHARED_DEFAULTS,
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
    ...overrides,
  };
}

function deployPaths(deployDir: string): DeployPaths {
  return {
    deployDir,
    distAbs: join(deployDir, 'dist'),
    functionsAbs: join(deployDir, 'netlify/functions'),
    isEphemeral: false,
  };
}

describe('resolveDeployContext', () => {
  it('defaults preview deploys to deploy-preview', () => {
    expect(resolveDeployContext({ prod: false, context: undefined })).toBe('deploy-preview');
  });

  it('preserves explicit preview contexts when not deploying to production', () => {
    expect(resolveDeployContext({ prod: false, context: 'branch:staging' })).toBe('branch:staging');
  });

  it('forces production context when --prod is set', () => {
    expect(resolveDeployContext({ prod: true, context: 'branch:staging' })).toBe('production');
  });
});

describe('public demo acknowledgement', () => {
  it('requires the explicit flag for production but not previews', () => {
    expect(() => validateNetlifyOptions(netlifyOptions({ prod: true }))).toThrow('--acknowledge-public-demo');
    expect(() => validateNetlifyOptions(netlifyOptions({ prod: true, publicDemoAcknowledged: true }))).not.toThrow();
    expect(validateNetlifyOptions(netlifyOptions()).publicDemoAcknowledged).toBe(false);
  });

  it('collects the noninteractive acknowledgement flag', () => {
    const result = collectCliOptions(['--prod', '--acknowledge-public-demo']);
    expect(result.kind === 'options' && result.options).toMatchObject({
      prod: true,
      publicDemoAcknowledged: true,
    });
  });
});

describe('applyBranchOverride', () => {
  it('derives alias and branch context from --branch', () => {
    const o = { branch: 'staging', alias: undefined, context: undefined };
    applyBranchOverride(o);
    expect(o.alias).toBe('staging');
    expect(o.context).toBe('branch:staging');
  });

  it('overrides explicit --alias and --context', () => {
    const o = { branch: 'staging', alias: 'other', context: 'deploy-preview' };
    applyBranchOverride(o);
    expect(o.alias).toBe('staging');
    expect(o.context).toBe('branch:staging');
  });

  it('is a no-op when --branch is absent', () => {
    const o = { branch: undefined, alias: 'staging', context: 'deploy-preview' };
    applyBranchOverride(o);
    expect(o.alias).toBe('staging');
    expect(o.context).toBe('deploy-preview');
  });
});

describe('planRuntimeSiteEnvVars', () => {
  it('always includes the API path and required Mongo secret', () => {
    expect(planRuntimeSiteEnvVars('/.netlify/functions/main', 'mongodb://localhost')).toEqual([
      { key: 'API_BASE_URL', value: '/.netlify/functions/main', sensitive: false },
      { key: 'MONGODB_URI', value: 'mongodb://localhost', sensitive: true },
    ]);
  });
});

describe('Netlify local configuration', () => {
  it('serializes special path characters without allowing structural injection', () => {
    const source = serializeNetlifyToml(
      netlifyOptions({
        distDir: 'web build/quoted" # still-a-path',
        functionsDir: String.raw`server\functions\[[redirects]]`,
      }),
    );
    const parsed = parseToml(source);

    expect(parsed).toMatchObject({
      build: { publish: 'web build/quoted" # still-a-path' },
      functions: { directory: String.raw`server\functions\[[redirects]]` },
      redirects: [{ from: '/*', to: '/index.html', status: 200 }],
    });
  });

  it('writes parser-valid publish, functions, and SPA fallback settings', async () => {
    await withTestWorkspace((workspace) => {
      ensureNetlifyToml(
        netlifyOptions({
          apiBaseUrl: '/api',
          distDir: 'web output',
          functionsDir: 'server/functions',
          functionsName: 'backend',
        }),
        deployPaths(workspace.sandbox),
      );
      const parsed = parseToml(readFileSync(join(workspace.sandbox, 'netlify.toml'), 'utf8'));
      expect(parsed).toEqual({
        build: { base: '', publish: 'web output' },
        functions: { directory: 'server/functions', node_bundler: 'esbuild' },
        redirects: [
          { from: '/api/*', to: '/.netlify/functions/backend/:splat', status: 200 },
          { from: '/*', to: '/index.html', status: 200 },
        ],
      });
    });
  });

  it('updates only an unmodified managed file', async () => {
    await withTestWorkspace((workspace) => {
      const tomlPath = join(workspace.sandbox, 'netlify.toml');
      writeFileSync(tomlPath, serializeNetlifyToml(netlifyOptions()));
      ensureNetlifyToml(netlifyOptions({ distDir: 'new dist' }), deployPaths(workspace.sandbox));
      const parsed = parseToml(readFileSync(tomlPath, 'utf8'));
      expect(parsed).toMatchObject({ build: { publish: 'new dist' } });
    });
  });

  it('preserves matching user configuration and rejects conflicts without changing the file', async () => {
    await withTestWorkspace((workspace) => {
      const tomlPath = join(workspace.sandbox, 'netlify.toml');
      const userConfig = `${serializeNetlifyToml(netlifyOptions()).split('\n').slice(1).join('\n')}\n[dev]\nport = 9999\n`;
      writeFileSync(tomlPath, userConfig);
      ensureNetlifyToml(netlifyOptions(), deployPaths(workspace.sandbox));
      expect(readFileSync(tomlPath, 'utf8')).toBe(userConfig);

      expect(() =>
        ensureNetlifyToml(netlifyOptions({ functionsDir: 'other/functions' }), deployPaths(workspace.sandbox)),
      ).toThrow('user-owned Netlify configuration');
      expect(readFileSync(tomlPath, 'utf8')).toBe(userConfig);
    });
  });

  it('rejects malformed TOML without changing it', async () => {
    await withTestWorkspace((workspace) => {
      const tomlPath = join(workspace.sandbox, 'netlify.toml');
      const malformed = '[build\npublish = "dist"\n';
      writeFileSync(tomlPath, malformed);
      expect(() => ensureNetlifyToml(netlifyOptions(), deployPaths(workspace.sandbox))).toThrow(
        'Cannot use malformed Netlify configuration',
      );
      expect(readFileSync(tomlPath, 'utf8')).toBe(malformed);
    });
  });

  it('rejects malformed link state and preserves unrelated state fields when relinking', async () => {
    await withTestWorkspace((workspace) => {
      const stateDir = join(workspace.sandbox, '.netlify');
      const stateFile = join(stateDir, 'state.json');
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(stateFile, '{bad json');
      expect(() => readLinkedSite(stateFile)).toThrow('Cannot read malformed Netlify link state');
      expect(readFileSync(stateFile, 'utf8')).toBe('{bad json');

      writeFileSync(stateFile, JSON.stringify({ siteId: 'old-site', custom: { retained: true } }));
      ensureLinkedSite(stateFile, 'new-site', false);
      expect(JSON.parse(readFileSync(stateFile, 'utf8'))).toEqual({
        siteId: 'new-site',
        custom: { retained: true },
      });
    });
  });
});

describe('lookupInPath', () => {
  it('returns undefined for an empty PATH string', () => {
    expect(lookupInPath('netlify', '')).toBeUndefined();
  });

  it('falls back to process.env.PATH when no pathValue is passed', () => {
    // The exact result depends on the host PATH; just assert no throw and
    // that a string-or-undefined is returned for a binary that cannot exist.
    expect(lookupInPath('__definitely-not-a-real-binary-name__')).toBeUndefined();
  });

  it('returns undefined when the binary is not present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-netlify-lookup-'));
    expect(lookupInPath('netlify', dir)).toBeUndefined();
  });

  it('resolves an executable by walking PATH segments', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-netlify-lookup-'));
    const binPath = join(dir, 'netlify');
    writeFileSync(binPath, '#!/usr/bin/env node\n');
    chmodSync(binPath, 0o755);
    expect(lookupInPath('netlify', dir)).toBe(binPath);
  });

  it('skips non-executable files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-netlify-lookup-'));
    const binPath = join(dir, 'netlify');
    writeFileSync(binPath, '#!/usr/bin/env node\n');
    chmodSync(binPath, 0o644); // not executable
    expect(lookupInPath('netlify', dir)).toBeUndefined();
  });

  it('returns the first match across multiple PATH entries', () => {
    const dirA = mkdtempSync(join(tmpdir(), 'wtt-netlify-lookup-a-'));
    const dirB = mkdtempSync(join(tmpdir(), 'wtt-netlify-lookup-b-'));
    const binA = join(dirA, 'netlify');
    const binB = join(dirB, 'netlify');
    writeFileSync(binA, '#!/usr/bin/env node\n');
    chmodSync(binA, 0o755);
    writeFileSync(binB, '#!/usr/bin/env node\n');
    chmodSync(binB, 0o755);
    const pathValue = `${dirA}:${dirB}`;
    expect(lookupInPath('netlify', pathValue)).toBe(binA);
  });

  it('ignores empty PATH segments', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtt-netlify-lookup-'));
    const binPath = join(dir, 'netlify');
    writeFileSync(binPath, '#!/usr/bin/env node\n');
    chmodSync(binPath, 0o755);
    const pathValue = `:${dir}:`;
    expect(lookupInPath('netlify', pathValue)).toBe(binPath);
  });
});
