// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLinkedSite } from '../scripts/deploy-netlify';

describe('readLinkedSite', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wtt-link-state-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when state.json does not exist', () => {
    expect(readLinkedSite(join(dir, '.netlify', 'state.json'))).toBeNull();
  });

  it('returns the parsed siteId when state.json exists', () => {
    const stateFile = join(dir, '.netlify', 'state.json');
    mkdirSync(join(dir, '.netlify'), { recursive: true });
    writeFileSync(stateFile, JSON.stringify({ siteId: 'site-123' }));
    expect(readLinkedSite(stateFile)).toEqual({ siteId: 'site-123' });
  });

  it('returns the parsed siteName when present without siteId', () => {
    const stateFile = join(dir, '.netlify', 'state.json');
    mkdirSync(join(dir, '.netlify'), { recursive: true });
    writeFileSync(stateFile, JSON.stringify({ siteName: 'my-site' }));
    expect(readLinkedSite(stateFile)).toEqual({ siteName: 'my-site' });
  });

  it('returns null when state.json has neither siteId nor siteName', () => {
    const stateFile = join(dir, '.netlify', 'state.json');
    mkdirSync(join(dir, '.netlify'), { recursive: true });
    writeFileSync(stateFile, JSON.stringify({ other: 'value' }));
    expect(readLinkedSite(stateFile)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const stateFile = join(dir, '.netlify', 'state.json');
    mkdirSync(join(dir, '.netlify'), { recursive: true });
    writeFileSync(stateFile, '{ not json');
    expect(readLinkedSite(stateFile)).toBeNull();
  });
});
