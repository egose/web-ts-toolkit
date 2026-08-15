// @vitest-environment node
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyBranchOverride,
  lookupInPath,
  planRuntimeSiteEnvVars,
  resolveDeployContext,
} from '../scripts/deploy-netlify';

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
  it('always includes API_BASE_URL', () => {
    expect(planRuntimeSiteEnvVars('/.netlify/functions/main')).toEqual([
      { key: 'API_BASE_URL', value: '/.netlify/functions/main' },
    ]);
  });

  it('includes MONGODB_URI when provided', () => {
    expect(planRuntimeSiteEnvVars('/.netlify/functions/main', 'mongodb://localhost')).toEqual([
      { key: 'API_BASE_URL', value: '/.netlify/functions/main' },
      { key: 'MONGODB_URI', value: 'mongodb://localhost' },
    ]);
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
