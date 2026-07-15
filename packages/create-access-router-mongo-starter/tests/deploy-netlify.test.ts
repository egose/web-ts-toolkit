// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { planRuntimeSiteEnvVars, resolveDeployContext } from '../scripts/deploy-netlify';

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
